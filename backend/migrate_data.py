#!/usr/bin/env python3
"""
數據遷移腳本 - 為現有記帳記錄和預算添加 user_id

此腳本用於將單用戶系統遷移到多用戶系統：
- 為所有沒有 user_id 的記帳記錄添加 user_id
- 為所有沒有 user_id 的預算添加 user_id

使用方式：
    python migrate_data.py [選項]

選項：
    --dry-run          僅顯示將要執行的操作，不實際修改數據
    --admin-email      指定管理員 email（默認：admin@example.com）
    --admin-password   指定管理員密碼（默認：admin123456）
    --admin-name       指定管理員名稱（默認：系統管理員）
"""

import os
import sys
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime
from dotenv import load_dotenv
import argparse

# 導入認證模組（用於密碼加密）
import auth


def create_admin_user(users_collection, email, password, name):
    """
    創建管理員用戶

    Args:
        users_collection: 用戶集合
        email: 管理員 email
        password: 管理員密碼
        name: 管理員名稱

    Returns:
        管理員用戶的 ObjectId
    """
    # 檢查是否已存在
    existing_user = users_collection.find_one({'email': email})
    if existing_user:
        print(f"✓ 管理員用戶已存在: {email}")
        return existing_user['_id']

    # 創建新管理員用戶
    password_hash = auth.hash_password(password)

    admin_user = {
        'email': email,
        'password_hash': password_hash,
        'name': name,
        'created_at': datetime.now(),
        'last_login': None,
        'is_active': True,
        'email_verified': True
    }

    result = users_collection.insert_one(admin_user)
    print(f"✓ 已創建管理員用戶: {email}")
    return result.inserted_id


def migrate_records(records_collection, admin_user_id, dry_run=False):
    """
    遷移記帳記錄：為沒有 user_id 的記錄添加管理員 user_id

    Args:
        records_collection: 記帳記錄集合
        admin_user_id: 管理員用戶 ID
        dry_run: 是否為預覽模式

    Returns:
        更新的記錄數量
    """
    # 查找沒有 user_id 的記錄
    records_without_user = records_collection.count_documents({'user_id': {'$exists': False}})

    if records_without_user == 0:
        print("✓ 所有記帳記錄都已有 user_id")
        return 0

    print(f"\n找到 {records_without_user} 筆記帳記錄需要遷移")

    if dry_run:
        print(f"[預覽模式] 將為這些記錄設定 user_id = {admin_user_id}")
        return 0

    # 更新記錄
    result = records_collection.update_many(
        {'user_id': {'$exists': False}},
        {'$set': {'user_id': admin_user_id, 'migrated_at': datetime.now()}}
    )

    print(f"✓ 已更新 {result.modified_count} 筆記帳記錄")
    return result.modified_count


def migrate_budget(budget_collection, admin_user_id, dry_run=False):
    """
    遷移預算：為沒有 user_id 的預算添加管理員 user_id

    Args:
        budget_collection: 預算集合
        admin_user_id: 管理員用戶 ID
        dry_run: 是否為預覽模式

    Returns:
        更新的預算數量
    """
    # 查找沒有 user_id 的預算
    budget_without_user = budget_collection.count_documents({'user_id': {'$exists': False}})

    if budget_without_user == 0:
        print("✓ 所有預算都已有 user_id")
        return 0

    print(f"\n找到 {budget_without_user} 筆預算需要遷移")

    if dry_run:
        print(f"[預覽模式] 將為這些預算設定 user_id = {admin_user_id}")
        return 0

    # 更新預算
    result = budget_collection.update_many(
        {'user_id': {'$exists': False}},
        {'$set': {'user_id': admin_user_id, 'migrated_at': datetime.now()}}
    )

    print(f"✓ 已更新 {result.modified_count} 筆預算")
    return result.modified_count


def main():
    """主函數"""
    # 解析命令列參數
    parser = argparse.ArgumentParser(description='數據遷移腳本 - 為現有數據添加 user_id')
    parser.add_argument('--dry-run', action='store_true', help='預覽模式，不實際修改數據')
    parser.add_argument('--admin-email', default='admin@example.com', help='管理員 email')
    parser.add_argument('--admin-password', default='admin123456', help='管理員密碼')
    parser.add_argument('--admin-name', default='系統管理員', help='管理員名稱')
    args = parser.parse_args()

    # 載入環境變數
    load_dotenv()

    MONGO_URI = os.getenv('MONGO_URI')
    if not MONGO_URI:
        print("❌ 錯誤：未設定 MONGO_URI 環境變數")
        print("請在 .env 文件中設定 MONGO_URI")
        sys.exit(1)

    print("=" * 60)
    print("數據遷移腳本 - 多用戶系統")
    print("=" * 60)

    if args.dry_run:
        print("\n[預覽模式] 將僅顯示操作，不會修改數據\n")

    try:
        # 連接到 MongoDB
        print("\n正在連接到 MongoDB...")
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("✓ 已連接到 MongoDB")

        # 獲取集合
        db = client['accounting_db']
        users_collection = db['users']
        records_collection = db['records']
        budget_collection = db['budget']

        # 統計現有數據
        total_users = users_collection.count_documents({})
        total_records = records_collection.count_documents({})
        total_budget = budget_collection.count_documents({})

        print(f"\n當前數據統計：")
        print(f"  - 用戶數量: {total_users}")
        print(f"  - 記帳記錄: {total_records}")
        print(f"  - 預算設定: {total_budget}")

        # 創建或獲取管理員用戶
        print(f"\n正在處理管理員用戶...")
        if args.dry_run:
            print(f"[預覽模式] 將創建/使用管理員用戶: {args.admin_email}")
            admin_user_id = ObjectId()  # 臨時 ID 用於預覽
        else:
            admin_user_id = create_admin_user(
                users_collection,
                args.admin_email,
                args.admin_password,
                args.admin_name
            )

        print(f"✓ 管理員用戶 ID: {admin_user_id}")

        # 遷移記帳記錄
        print("\n" + "=" * 60)
        print("遷移記帳記錄")
        print("=" * 60)
        records_updated = migrate_records(records_collection, admin_user_id, args.dry_run)

        # 遷移預算
        print("\n" + "=" * 60)
        print("遷移預算")
        print("=" * 60)
        budget_updated = migrate_budget(budget_collection, admin_user_id, args.dry_run)

        # 總結
        print("\n" + "=" * 60)
        print("遷移完成")
        print("=" * 60)

        if args.dry_run:
            print("\n[預覽模式] 實際未修改任何數據")
            print("\n要執行實際遷移，請運行：")
            print(f"  python migrate_data.py --admin-email {args.admin_email}")
        else:
            print(f"\n遷移統計：")
            print(f"  - 記帳記錄已更新: {records_updated}")
            print(f"  - 預算已更新: {budget_updated}")
            print(f"\n管理員登入資訊：")
            print(f"  Email: {args.admin_email}")
            print(f"  密碼: {args.admin_password}")
            print(f"\n⚠️  請妥善保管管理員密碼，建議首次登入後立即修改！")

        client.close()

    except Exception as e:
        print(f"\n❌ 遷移失敗: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
