#!/usr/bin/env python3
"""
測試帳號清理命令（E2E 測試帳號「用完即銷毀」）

用法（在「測試環境」的後端容器內：`docker exec <backend-test> python manage_test_accounts.py ...`）:
    python manage_test_accounts.py list  [--pattern REGEX]
    python manage_test_accounts.py purge [--pattern REGEX] [--yes]

說明:
    list   列出符合測試命名的帳號與各自的資料筆數。
    purge  刪除這些帳號與底下所有資料（記錄、預算、定期、欠款、錢包、照片檔）。
           預設只預覽，加 --yes 才真的刪。

安全限制（刻意寫死、無法用參數繞過）:
    - 只比對 email 以 @example.com 結尾、且符合 --pattern 的帳號
      （預設 ^(v2|probe)-\\d+@example\\.com$，即 E2E 測試輔助程式產生的帳號）。
    - 資料庫名稱必須含「test」，連到正式庫（accounting_db）一律拒絕。
    - 一次最多刪除 MAX_PURGE 個帳號，比對到更多就拒絕（多半是 pattern 寫太寬）。
"""

import argparse
import os
import re
import shutil
import sys
from pathlib import Path

import db

DEFAULT_PATTERN = r"^(v2|probe)-\d+@example\.com$"
REQUIRED_DOMAIN = "@example.com"
MAX_PURGE = 200

# 與 routes/photos.py 相同的照片根目錄
PHOTO_ROOT = Path(os.getenv("PHOTO_STORAGE_PATH", "./photo_storage")).resolve()

# 以 user_id 關聯的集合：(顯示名稱, 取得 collection 的函式)
_USER_COLLECTIONS = (
    ("記錄", lambda: db.accounting_records_collection),
    ("預算", lambda: db.accounting_budget_collection),
    ("定期", lambda: db.recurring_collection),
    ("欠款", lambda: db.debts_collection),
    ("錢包", lambda: db.wallets_collection),
)


def _db_name():
    return db.users_collection.database.name


def _user_id_filter(uid):
    # 歷史資料的 user_id 可能是字串
    return {"user_id": {"$in": [uid, str(uid)]}}


def find_accounts(pattern):
    """回傳符合測試命名的帳號文件。pattern 不合法丟 ValueError。"""
    try:
        regex = re.compile(pattern)
    except re.error as e:
        raise ValueError(f"pattern 不是合法的正規表示式：{e}") from e
    accounts = []
    for user in db.users_collection.find(
        {"email": {"$regex": re.escape(REQUIRED_DOMAIN) + "$"}}, {"email": 1}
    ):
        if regex.search(user.get("email", "")):
            accounts.append(user)
    return accounts


def _counts(uid):
    return {
        name: coll().count_documents(_user_id_filter(uid))
        for name, coll in _USER_COLLECTIONS
    }


def _remove_photos(uid):
    """刪除該帳號的照片目錄；只刪 PHOTO_ROOT 底下、名稱就是 user_id 的那一層。"""
    target = (PHOTO_ROOT / str(uid)).resolve()
    if target.parent != PHOTO_ROOT or not target.is_dir():
        return False
    shutil.rmtree(target)
    return True


def purge_account(user):
    uid = user["_id"]
    for _name, coll in _USER_COLLECTIONS:
        coll().delete_many(_user_id_filter(uid))
    _remove_photos(uid)
    db.users_collection.delete_one({"_id": uid})


def _print_accounts(accounts):
    for a in accounts:
        c = _counts(a["_id"])
        print(f"{a['email']}   " + "、".join(f"{k}{v}" for k, v in c.items()))


def cmd_list(args):
    accounts = find_accounts(args.pattern)
    if not accounts:
        print("（沒有符合的測試帳號）")
        return 0
    _print_accounts(accounts)
    print(f"\n共 {len(accounts)} 個帳號")
    return 0


def cmd_purge(args):
    accounts = find_accounts(args.pattern)
    if not accounts:
        print("（沒有符合的測試帳號）")
        return 0
    if len(accounts) > MAX_PURGE:
        print(f"❌ 符合 {len(accounts)} 個帳號，超過上限 {MAX_PURGE}，請縮小 --pattern")
        return 1
    _print_accounts(accounts)
    if not args.yes:
        print(f"\n（預覽）共 {len(accounts)} 個帳號會被刪除；確認無誤請加 --yes")
        return 0
    for a in accounts:
        purge_account(a)
    print(f"\n✅ 已刪除 {len(accounts)} 個測試帳號與其所有資料")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="測試帳號清理（只限測試資料庫）")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_list = sub.add_parser("list", help="列出符合測試命名的帳號")
    p_list.add_argument("--pattern", default=DEFAULT_PATTERN)
    p_list.set_defaults(func=cmd_list)

    p_purge = sub.add_parser("purge", help="刪除符合測試命名的帳號與資料")
    p_purge.add_argument("--pattern", default=DEFAULT_PATTERN)
    p_purge.add_argument("--yes", action="store_true", help="確認刪除（沒加只預覽）")
    p_purge.set_defaults(func=cmd_purge)

    args = parser.parse_args(argv)

    db.init_db()
    if db.users_collection is None:
        print("❌ 資料庫連線失敗（請檢查 MONGO_URI）")
        return 1
    if "test" not in _db_name().lower():
        print(
            f"❌ 目前連到的資料庫是「{_db_name()}」，名稱不含 test，拒絕執行（只限測試資料庫）"
        )
        return 1
    try:
        return args.func(args) or 0
    except ValueError as e:
        print(f"❌ {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
