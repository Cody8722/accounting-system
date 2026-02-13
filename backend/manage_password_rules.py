#!/usr/bin/env python3
"""
密碼規則管理命令

用法:
    python manage_password_rules.py show              # 顯示當前配置
    python manage_password_rules.py enable <rule>     # 啟用規則
    python manage_password_rules.py disable <rule>    # 禁用規則
    python manage_password_rules.py force-update      # 強制所有用戶更新密碼
    python manage_password_rules.py reset-force       # 取消強制更新
"""

import sys
import os
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

# 載入環境變數
load_dotenv()

# 連接MongoDB
MONGO_URI = os.getenv('MONGO_URI')
if not MONGO_URI:
    print("❌ 錯誤：未設定 MONGO_URI 環境變數")
    sys.exit(1)

try:
    client = MongoClient(MONGO_URI)
    db = client['accounting_db']
    users_collection = db['users']
    print("✅ 已連接到資料庫")
except Exception as e:
    print(f"❌ 資料庫連接失敗: {e}")
    sys.exit(1)


# 密碼規則配置
PASSWORD_RULES = {
    'min_length': {
        'env': 'PASSWORD_MIN_LENGTH',
        'default': '12',
        'description': '最小密碼長度'
    },
    'require_uppercase': {
        'env': 'PASSWORD_REQUIRE_UPPERCASE',
        'default': 'true',
        'description': '需要大寫字母'
    },
    'require_lowercase': {
        'env': 'PASSWORD_REQUIRE_LOWERCASE',
        'default': 'true',
        'description': '需要小寫字母'
    },
    'require_digit': {
        'env': 'PASSWORD_REQUIRE_DIGIT',
        'default': 'true',
        'description': '需要數字'
    },
    'require_special': {
        'env': 'PASSWORD_REQUIRE_SPECIAL',
        'default': 'true',
        'description': '需要特殊符號'
    },
    'check_repeating': {
        'env': 'PASSWORD_CHECK_REPEATING',
        'default': 'true',
        'description': '檢查重複字符'
    },
    'check_sequential': {
        'env': 'PASSWORD_CHECK_SEQUENTIAL',
        'default': 'true',
        'description': '檢查連續字符'
    },
    'check_keyboard_pattern': {
        'env': 'PASSWORD_CHECK_KEYBOARD_PATTERN',
        'default': 'true',
        'description': '檢查鍵盤模式'
    },
    'check_common_passwords': {
        'env': 'PASSWORD_CHECK_COMMON_PASSWORDS',
        'default': 'true',
        'description': '檢查常見密碼'
    },
    'check_personal_info': {
        'env': 'PASSWORD_CHECK_PERSONAL_INFO',
        'default': 'true',
        'description': '檢查個人資訊'
    },
    'check_math_patterns': {
        'env': 'PASSWORD_CHECK_MATH_PATTERNS',
        'default': 'true',
        'description': '檢查數學模式'
    },
    'check_chinese_pinyin': {
        'env': 'PASSWORD_CHECK_CHINESE_PINYIN',
        'default': 'true',
        'description': '檢查中文拼音'
    },
    'min_entropy': {
        'env': 'PASSWORD_MIN_ENTROPY',
        'default': '50',
        'description': '最小熵值（複雜度）'
    },
    'max_repeating': {
        'env': 'PASSWORD_MAX_REPEATING',
        'default': '2',
        'description': '最大允許重複次數'
    },
    'max_sequential': {
        'env': 'PASSWORD_MAX_SEQUENTIAL',
        'default': '3',
        'description': '最大允許連續次數'
    },
}


def show_config():
    """顯示當前密碼規則配置"""
    print("\n" + "="*60)
    print("📋 當前密碼規則配置")
    print("="*60)

    for rule, info in PASSWORD_RULES.items():
        current_value = os.getenv(info['env'], info['default'])
        status = "✅ 啟用" if current_value.lower() == 'true' else ("❌ 禁用" if current_value.lower() == 'false' else f"📊 {current_value}")
        print(f"{rule:25} | {status:10} | {info['description']}")

    print("="*60)

    # 顯示需要強制更新密碼的用戶數量
    users_requiring_update = users_collection.count_documents({'requires_password_change': True})
    total_users = users_collection.count_documents({})

    print(f"\n👥 用戶統計:")
    print(f"   總用戶數: {total_users}")
    print(f"   需要更新密碼: {users_requiring_update}")
    print()


def enable_rule(rule_name):
    """啟用規則"""
    if rule_name not in PASSWORD_RULES:
        print(f"❌ 錯誤：未知的規則 '{rule_name}'")
        print(f"可用規則: {', '.join(PASSWORD_RULES.keys())}")
        return

    env_var = PASSWORD_RULES[rule_name]['env']
    print(f"✅ 規則 '{rule_name}' 已啟用")
    print(f"⚠️  請在 .env 文件中設定: {env_var}=true")
    print("   然後重啟後端服務以生效")


def disable_rule(rule_name):
    """禁用規則"""
    if rule_name not in PASSWORD_RULES:
        print(f"❌ 錯誤：未知的規則 '{rule_name}'")
        print(f"可用規則: {', '.join(PASSWORD_RULES.keys())}")
        return

    env_var = PASSWORD_RULES[rule_name]['env']
    print(f"⛔ 規則 '{rule_name}' 已禁用")
    print(f"⚠️  請在 .env 文件中設定: {env_var}=false")
    print("   然後重啟後端服務以生效")


def force_password_update():
    """標記所有用戶需要強制更新密碼"""
    try:
        result = users_collection.update_many(
            {},  # 所有用戶
            {
                '$set': {
                    'requires_password_change': True,
                    'password_policy_updated_at': datetime.now()
                }
            }
        )

        print(f"✅ 成功標記 {result.modified_count} 個用戶需要更新密碼")
        print("📝 用戶下次登入時將被要求更改密碼")

    except Exception as e:
        print(f"❌ 錯誤: {e}")


def reset_force_update():
    """取消強制密碼更新"""
    try:
        result = users_collection.update_many(
            {'requires_password_change': True},
            {
                '$set': {
                    'requires_password_change': False
                }
            }
        )

        print(f"✅ 已取消 {result.modified_count} 個用戶的強制更新要求")

    except Exception as e:
        print(f"❌ 錯誤: {e}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1].lower()

    if command == 'show':
        show_config()

    elif command == 'enable':
        if len(sys.argv) < 3:
            print("❌ 錯誤：請指定要啟用的規則")
            print(f"可用規則: {', '.join(PASSWORD_RULES.keys())}")
            return
        enable_rule(sys.argv[2])

    elif command == 'disable':
        if len(sys.argv) < 3:
            print("❌ 錯誤：請指定要禁用的規則")
            print(f"可用規則: {', '.join(PASSWORD_RULES.keys())}")
            return
        disable_rule(sys.argv[2])

    elif command == 'force-update':
        print("⚠️  警告：這將標記所有用戶需要更新密碼")
        confirm = input("確定要繼續嗎？(yes/no): ")
        if confirm.lower() in ['yes', 'y']:
            force_password_update()
        else:
            print("❌ 已取消")

    elif command == 'reset-force':
        reset_force_update()

    else:
        print(f"❌ 未知的命令: {command}")
        print(__doc__)


if __name__ == '__main__':
    main()
