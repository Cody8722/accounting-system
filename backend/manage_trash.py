#!/usr/bin/env python3
"""
帳號垃圾桶管理指令（自助刪除帳號後的到期清除）

用法（在後端容器內：`docker exec <backend> python manage_trash.py ...`）:
    python manage_trash.py list                  列出垃圾桶中的帳號與預定清除時間
    python manage_trash.py purge-expired         預覽哪些帳號保留期已滿（不刪）
    python manage_trash.py purge-expired --yes   永久清除保留期已滿的帳號與其所有資料

建議用 NAS 的排程（cron / 工作排程）每天跑一次 `purge-expired --yes`。
只會動「已進垃圾桶且 purge_at 已到期」的帳號；沒進垃圾桶的帳號一律不碰。
"""

import argparse
import sys

import account_trash
import db


def _fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M") if dt else "—"


def _label(user):
    # 被新註冊接管 Email 的帳號，email 是佔位值，顯示原 Email 較有意義
    return user.get("original_email") or user.get("email", "?")


def cmd_list(_args):
    users = account_trash.trashed_users()
    if not users:
        print("（垃圾桶是空的）")
        return 0
    for u in sorted(users, key=lambda x: x.get("purge_at") or 0):
        print(
            f"{_label(u)}   刪除於 {_fmt(u.get('deleted_at'))}   預定清除 {_fmt(u.get('purge_at'))}"
        )
    print(f"\n共 {len(users)} 個帳號")
    return 0


def cmd_purge_expired(args):
    users = account_trash.expired_users()
    if not users:
        print("（沒有保留期已滿的帳號）")
        return 0
    for u in users:
        print(f"{_label(u)}   預定清除 {_fmt(u.get('purge_at'))}")
    if not args.yes:
        print(f"\n（預覽）共 {len(users)} 個帳號會被永久刪除；確認無誤請加 --yes")
        return 0
    count = account_trash.purge_expired()
    print(f"\n✅ 已永久刪除 {count} 個帳號與其所有資料")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="帳號垃圾桶管理")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="列出垃圾桶中的帳號").set_defaults(func=cmd_list)

    p = sub.add_parser("purge-expired", help="永久清除保留期已滿的帳號")
    p.add_argument("--yes", action="store_true", help="確認刪除（沒加只預覽）")
    p.set_defaults(func=cmd_purge_expired)

    args = parser.parse_args(argv)

    db.init_db()
    if db.users_collection is None:
        print("❌ 資料庫連線失敗（請檢查 MONGO_URI）")
        return 1
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
