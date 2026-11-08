#!/usr/bin/env python3
"""
邀請碼管理命令（搭配 REGISTRATION_MODE=invite 使用）

用法（從 backend/ 目錄，或在容器內 `docker exec -it <backend> python manage_invites.py ...`）:
    python manage_invites.py create [--count N] [--days D] [--note TEXT]
    python manage_invites.py list [--all]
    python manage_invites.py revoke <id>

說明:
    create  產生一次性邀請碼。明文只在這一次顯示，資料庫只存雜湊，請當場記下。
    list    列出尚可使用的邀請碼（--all 連已使用／已撤銷／已過期的一起列）。
    revoke  撤銷尚未使用的邀請碼（id 取自 create / list 的輸出）。
"""

import argparse
import sys
from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId

import db
import invites


def _fmt(dt):
    return dt.strftime("%Y-%m-%d %H:%M") if dt else "-"


def _status(doc, now):
    if doc.get("revoked"):
        return "已撤銷"
    if doc.get("used_at"):
        return "已使用"
    if doc.get("expires_at") and doc["expires_at"] <= now:
        return "已過期"
    return "可用"


def cmd_create(args):
    for _ in range(args.count):
        invite = invites.create_invite(note=args.note, valid_days=args.days)
        exp = f"，{_fmt(invite['expires_at'])} 前有效" if invite["expires_at"] else ""
        print(f"{invite['code']}   (id: {invite['id']}{exp})")
    print("\n⚠️ 邀請碼明文只顯示這一次，請現在複製保存。")


def cmd_list(args):
    now = datetime.now()
    rows = list(db.invites_collection.find().sort("created_at", -1))
    shown = 0
    for doc in rows:
        status = _status(doc, now)
        if status != "可用" and not args.all:
            continue
        shown += 1
        print(
            f"{doc['_id']}  {status:<4}  建立 {_fmt(doc.get('created_at'))}  "
            f"到期 {_fmt(doc.get('expires_at'))}  備註: {doc.get('note') or '-'}"
        )
    if shown == 0:
        print("（沒有符合的邀請碼）")


def cmd_revoke(args):
    try:
        oid = ObjectId(args.id)
    except (InvalidId, TypeError):
        print("❌ id 格式錯誤")
        return 1
    result = db.invites_collection.update_one(
        {"_id": oid, "used_at": None}, {"$set": {"revoked": True}}
    )
    if result.matched_count == 0:
        print("❌ 找不到這組邀請碼，或它已經被使用")
        return 1
    print("✅ 已撤銷")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="邀請碼管理")
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="產生邀請碼")
    p_create.add_argument("--count", type=int, default=1, help="產生幾組（預設 1）")
    p_create.add_argument(
        "--days", type=int, default=None, help="幾天內有效（預設不過期）"
    )
    p_create.add_argument("--note", default="", help="備註（如給誰的）")
    p_create.set_defaults(func=cmd_create)

    p_list = sub.add_parser("list", help="列出邀請碼")
    p_list.add_argument("--all", action="store_true", help="包含已使用／撤銷／過期")
    p_list.set_defaults(func=cmd_list)

    p_revoke = sub.add_parser("revoke", help="撤銷邀請碼")
    p_revoke.add_argument("id")
    p_revoke.set_defaults(func=cmd_revoke)

    args = parser.parse_args(argv)
    if getattr(args, "count", 1) < 1 or getattr(args, "count", 1) > 50:
        print("❌ --count 必須介於 1 到 50")
        return 1

    db.init_db()
    if db.invites_collection is None:
        print("❌ 資料庫連線失敗（請檢查 MONGO_URI）")
        return 1

    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
