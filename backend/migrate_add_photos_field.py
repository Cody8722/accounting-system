#!/usr/bin/env python3
"""
一次性遷移：幫所有既有記帳記錄補上 photos 欄位

records 集合裡照片功能上線前的記錄沒有 photos 欄位；前端一律假設這個欄位
存在（不寫防禦性 undefined 判斷），所以需要補齊，跑一次即可、可重複執行
（filter 只挑還沒有這個欄位的文件，已經有的不會被動到）。

用法:
    python migrate_add_photos_field.py --dry-run   # 只統計筆數，不寫入
    python migrate_add_photos_field.py              # 實際執行

測試庫、正式庫要分開各跑一次（MONGO_URI 指到哪個庫就處理哪個庫）。
"""

import sys
import os
import argparse
from pymongo import MongoClient
from pymongo.errors import ConfigurationError
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("❌ 錯誤：未設定 MONGO_URI 環境變數")
    sys.exit(1)

try:
    client = MongoClient(MONGO_URI)
    # 依 MONGO_URI 決定資料庫（如 .../accounting_db_test），
    # 跟 db.py 的邏輯一致；URI 未指定預設庫時 fallback 到 accounting_db。
    try:
        db = client.get_default_database()
    except ConfigurationError:
        db = client["accounting_db"]
    records_collection = db["records"]
    print(f"✅ 已連接到資料庫：{db.name}")
except Exception as e:
    print(f"❌ 資料庫連接失敗: {e}")
    sys.exit(1)


FILTER = {"photos": {"$exists": False}}


def main():
    parser = argparse.ArgumentParser(description="補齊 records.photos 欄位")
    parser.add_argument(
        "--dry-run", action="store_true", help="只統計缺欄位的筆數，不實際寫入"
    )
    args = parser.parse_args()

    missing_count = records_collection.count_documents(FILTER)
    total_count = records_collection.count_documents({})
    print(f"📊 records 總筆數：{total_count}")
    print(f"📊 缺少 photos 欄位的筆數：{missing_count}")

    if missing_count == 0:
        print("✅ 所有記錄都已經有 photos 欄位，不需要遷移")
        return

    if args.dry_run:
        print("🔍 dry-run 模式，未寫入任何資料")
        return

    result = records_collection.update_many(FILTER, {"$set": {"photos": []}})
    print(f"✅ 已更新 {result.modified_count} 筆記錄，補上 photos: []")


if __name__ == "__main__":
    main()
