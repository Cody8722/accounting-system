"""
account_trash.py — 帳號垃圾桶：自助刪除、還原、到期清除。

設計（見 docs/ROADMAP_v2.md 階段 2.5）：
- 刪除帳號不是立刻刪光：在 users 文件上標 deleted_at / purge_at，底下資料（記錄、預算…）不動，
  資料本來就靠 user_id 隔離，不用逐筆標記。
- 垃圾桶中的帳號：既有 token 立即失效（extensions._token_still_valid 看 deleted_at）、
  不能登入使用（登入回 403 account_in_trash，改走「還原」）、不能走忘記密碼流程。
- 保留期滿由管理指令（manage_trash.py）永久清除；retention_days = 0 代表立即永久刪除。
- 有人用垃圾桶帳號的 Email 重新註冊：註冊成功並接管該 Email，原帳號改掛佔位 Email
  （原 Email 另存 original_email），資料不動、保留期照舊。
"""

import logging
import os
import shutil
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import db
from bson import ObjectId

logger = logging.getLogger(__name__)

# 可選的保留天數；0 = 立即永久刪除
RETENTION_CHOICES = (0, 7, 30, 90)
DEFAULT_RETENTION_DAYS = 30

# 與 routes/photos.py 相同的照片根目錄
PHOTO_ROOT = Path(os.getenv("PHOTO_STORAGE_PATH", "./photo_storage")).resolve()

# 以 user_id 關聯的集合：(顯示名稱, 取得 collection 的函式)
USER_COLLECTIONS = (
    ("記錄", lambda: db.accounting_records_collection),
    ("預算", lambda: db.accounting_budget_collection),
    ("定期", lambda: db.recurring_collection),
    ("欠款", lambda: db.debts_collection),
    ("錢包", lambda: db.wallets_collection),
)


def user_id_filter(uid: ObjectId) -> dict:
    # 歷史資料的 user_id 可能是字串
    return {"user_id": {"$in": [uid, str(uid)]}}


def remove_photos(uid: ObjectId, photo_root: Optional[Path] = None) -> bool:
    """刪除該帳號的照片目錄；只刪 photo_root 底下、名稱就是 user_id 的那一層。"""
    root = photo_root if photo_root is not None else PHOTO_ROOT
    target = (root / str(uid)).resolve()
    if target.parent != root or not target.is_dir():
        return False
    shutil.rmtree(target)
    return True


def purge_user(uid: ObjectId, photo_root: Optional[Path] = None) -> None:
    """永久刪除帳號與底下所有資料（無法還原）。最後才刪 users，中途失敗可重跑。"""
    for _name, coll in USER_COLLECTIONS:
        coll().delete_many(user_id_filter(uid))
    remove_photos(uid, photo_root)
    db.users_collection.delete_one({"_id": uid})


def normalize_retention(value) -> Optional[int]:
    """把請求的保留天數轉成合法整數；不合法回 None。"""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if value in RETENTION_CHOICES else None


def move_to_trash(uid: ObjectId, retention_days: int) -> datetime:
    """標記進垃圾桶，回傳預定清除時間。retention_days 必須 > 0（0 請直接 purge_user）。"""
    now = datetime.now()
    purge_at = now + timedelta(days=retention_days)
    db.users_collection.update_one(
        {"_id": uid},
        {
            "$set": {
                "deleted_at": now,
                "purge_at": purge_at,
                # 此時間之前簽發的 token 一律失效（見 extensions._token_still_valid）
                "password_changed_at": datetime.utcnow(),
            }
        },
    )
    return purge_at


def restore_user(uid: ObjectId) -> None:
    """還原垃圾桶中的帳號。同時作廢還原前簽發的所有 token（避免舊 token 因 deleted_at 清除而復活）。"""
    db.users_collection.update_one(
        {"_id": uid},
        {
            "$set": {"password_changed_at": datetime.utcnow()},
            "$unset": {"deleted_at": "", "purge_at": ""},
        },
    )


def release_email(user: dict) -> None:
    """垃圾桶帳號讓出 Email：改掛佔位 Email，原 Email 存 original_email。"""
    db.users_collection.update_one(
        {"_id": user["_id"], "deleted_at": {"$exists": True}},
        {
            "$set": {
                "email": f"trash-{user['_id']}@deleted.invalid",
                "original_email": user["email"],
            }
        },
    )


def expired_users(now: Optional[datetime] = None) -> list:
    """保留期已滿的垃圾桶帳號。"""
    cutoff = now or datetime.now()
    return list(
        db.users_collection.find(
            {"deleted_at": {"$exists": True}, "purge_at": {"$lte": cutoff}},
            {"email": 1, "original_email": 1, "purge_at": 1},
        )
    )


def trashed_users() -> list:
    """所有垃圾桶帳號（含未到期）。"""
    return list(
        db.users_collection.find(
            {"deleted_at": {"$exists": True}},
            {"email": 1, "original_email": 1, "deleted_at": 1, "purge_at": 1},
        )
    )


def purge_expired(now: Optional[datetime] = None) -> int:
    """永久清除所有保留期已滿的帳號，回傳清除數量。單一帳號失敗只記 log、不中斷其他帳號。"""
    purged = 0
    for user in expired_users(now):
        try:
            purge_user(user["_id"])
            purged += 1
        except Exception as e:  # 如：另一個 worker 同時在清同一個帳號的照片目錄
            logger.error(f"清除到期帳號失敗 {user['_id']}: {e}")
    return purged


# ==================== 自動到期清除（不需要外部排程） ====================

DEFAULT_PURGE_INTERVAL_HOURS = 6
_FIRST_RUN_DELAY_SECONDS = 60
_auto_purge_started = False


def _purge_interval_hours() -> float:
    """清除間隔（小時）。環境變數 ACCOUNT_TRASH_PURGE_INTERVAL_HOURS；0 或不合法的值 = 停用。"""
    raw = os.getenv("ACCOUNT_TRASH_PURGE_INTERVAL_HOURS")
    if raw is None or raw.strip() == "":
        return DEFAULT_PURGE_INTERVAL_HOURS
    try:
        return max(float(raw), 0)
    except ValueError:
        return 0


def _auto_purge_loop(interval_seconds: float) -> None:
    time.sleep(_FIRST_RUN_DELAY_SECONDS)
    while True:
        try:
            count = purge_expired()
            if count:
                logger.info(f"自動清除保留期已滿的帳號：{count} 個")
        except Exception as e:  # 資料庫暫時連不上等：下一輪再試，不讓執行緒死掉
            logger.error(f"自動清除到期帳號失敗: {e}")
        time.sleep(interval_seconds)


def start_auto_purge() -> bool:
    """啟動背景執行緒，定期清除保留期已滿的垃圾桶帳號，使用者不必另外設排程。

    每個後端程序最多啟動一條（重複呼叫無效）；清除本身是冪等的，多個程序同時跑也安全。
    回傳是否真的啟動了。
    """
    global _auto_purge_started
    interval_hours = _purge_interval_hours()
    if _auto_purge_started or interval_hours <= 0:
        return False
    _auto_purge_started = True
    threading.Thread(
        target=_auto_purge_loop,
        args=(interval_hours * 3600,),
        name="account-trash-purge",
        daemon=True,
    ).start()
    logger.info(f"帳號垃圾桶自動清除已啟用（每 {interval_hours:g} 小時）")
    return True
