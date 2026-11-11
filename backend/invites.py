"""
invites.py — 邀請制註冊：註冊模式與一次性邀請碼

註冊模式由環境變數 REGISTRATION_MODE 控制（每次呼叫時讀取，改 .env 重啟即生效）：
    open    開放註冊（預設，向下兼容）
    invite  邀請制：註冊必須帶有效的一次性邀請碼
    closed  關閉註冊：一律拒絕

邀請碼只存 SHA-256 雜湊（資料庫外洩也無法還原可用的碼）；明文只在建立當下
顯示一次。邀請碼本身是高熵隨機值，不需要慢速雜湊。
"""

import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import db

MODE_OPEN = "open"
MODE_INVITE = "invite"
MODE_CLOSED = "closed"
_VALID_MODES = (MODE_OPEN, MODE_INVITE, MODE_CLOSED)


def get_registration_mode() -> str:
    """讀取註冊模式。

    未設定 → open（維持既有行為，向下兼容）。
    有設定但無法辨識（如打錯成 'invit'）→ closed：fail-closed，
    寧可註冊暫時關著被發現，也不要「以為關了其實開著」。
    """
    raw = os.getenv("REGISTRATION_MODE", "").strip().lower()
    if not raw:
        return MODE_OPEN
    return raw if raw in _VALID_MODES else MODE_CLOSED


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def generate_code() -> str:
    """產生 12 字元 URL-safe 隨機邀請碼（約 72 bits 熵）。"""
    return secrets.token_urlsafe(9)


def create_invite(note: str = "", valid_days: Optional[int] = None) -> dict:
    """建立一組邀請碼，回傳 {"id", "code", "expires_at"}（明文 code 僅此一次）。"""
    code = generate_code()
    now = datetime.now()
    expires_at = now + timedelta(days=valid_days) if valid_days else None
    result = db.invites_collection.insert_one(
        {
            "code_hash": hash_code(code),
            "note": note[:100],
            "created_at": now,
            "expires_at": expires_at,
            "used_at": None,
            "used_by": None,
            "revoked": False,
        }
    )
    return {"id": str(result.inserted_id), "code": code, "expires_at": expires_at}


def _available_filter(code: str) -> dict:
    return {
        "code_hash": hash_code(code),
        "used_at": None,
        "revoked": {"$ne": True},
        "$or": [{"expires_at": None}, {"expires_at": {"$gt": datetime.now()}}],
    }


def is_invite_available(code) -> bool:
    """唯讀檢查邀請碼是否可用（不消耗）。"""
    if not code or not isinstance(code, str):
        return False
    return db.invites_collection.find_one(_available_filter(code)) is not None


def claim_invite(code) -> Optional[dict]:
    """原子性地消耗邀請碼；成功回傳邀請文件，已用／過期／撤銷／不存在回傳 None。

    用單一 find_one_and_update 同時判斷與標記，兩個人同時用同一組碼時只有一個會成功。
    """
    if not code or not isinstance(code, str):
        return None
    return db.invites_collection.find_one_and_update(
        _available_filter(code), {"$set": {"used_at": datetime.now()}}
    )


def attach_invite_user(invite_id, user_id) -> None:
    """註冊成功後記錄是誰用了這組邀請碼。"""
    db.invites_collection.update_one({"_id": invite_id}, {"$set": {"used_by": user_id}})


def release_invite(invite_id) -> None:
    """註冊失敗（如寫入使用者時出錯）時把已消耗的邀請碼還回去。"""
    db.invites_collection.update_one(
        {"_id": invite_id}, {"$set": {"used_at": None, "used_by": None}}
    )
