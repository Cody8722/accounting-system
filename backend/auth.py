"""
認證模組 - 處理用戶認證、密碼加密、JWT token 管理
"""

import os
import re
import secrets
import jwt
import math
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, List
from email_validator import validate_email, EmailNotValidError
from passlib.hash import pbkdf2_sha256


# JWT 配置
JWT_SECRET = os.getenv('JWT_SECRET')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24  # Token 24 小時過期

# 密碼規則配置（可通過環境變數控制）
PASSWORD_CONFIG = {
    'min_length': int(os.getenv('PASSWORD_MIN_LENGTH', '12')),
    'require_uppercase': os.getenv('PASSWORD_REQUIRE_UPPERCASE', 'true').lower() == 'true',
    'require_lowercase': os.getenv('PASSWORD_REQUIRE_LOWERCASE', 'true').lower() == 'true',
    'require_digit': os.getenv('PASSWORD_REQUIRE_DIGIT', 'true').lower() == 'true',
    'require_special': os.getenv('PASSWORD_REQUIRE_SPECIAL', 'true').lower() == 'true',
    'check_repeating': os.getenv('PASSWORD_CHECK_REPEATING', 'true').lower() == 'true',
    'check_sequential': os.getenv('PASSWORD_CHECK_SEQUENTIAL', 'true').lower() == 'true',
    'check_keyboard_pattern': os.getenv('PASSWORD_CHECK_KEYBOARD_PATTERN', 'true').lower() == 'true',
    'check_common_passwords': os.getenv('PASSWORD_CHECK_COMMON_PASSWORDS', 'true').lower() == 'true',
    'check_personal_info': os.getenv('PASSWORD_CHECK_PERSONAL_INFO', 'true').lower() == 'true',
    'check_math_patterns': os.getenv('PASSWORD_CHECK_MATH_PATTERNS', 'true').lower() == 'true',
    'check_chinese_pinyin': os.getenv('PASSWORD_CHECK_CHINESE_PINYIN', 'true').lower() == 'true',
    'min_entropy': float(os.getenv('PASSWORD_MIN_ENTROPY', '50')),
    'max_repeating': int(os.getenv('PASSWORD_MAX_REPEATING', '2')),
    'max_sequential': int(os.getenv('PASSWORD_MAX_SEQUENTIAL', '3')),
}


def hash_password(password: str) -> str:
    """
    使用 PBKDF2-SHA256 加密密碼

    Args:
        password: 明文密碼

    Returns:
        加密後的密碼 hash
    """
    # 使用 PBKDF2-SHA256 (29000 rounds, NIST 推薦標準)
    return pbkdf2_sha256.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """
    驗證密碼是否正確

    Args:
        password: 明文密碼
        password_hash: 儲存的密碼 hash

    Returns:
        密碼是否匹配
    """
    try:
        return pbkdf2_sha256.verify(password, password_hash)
    except Exception:
        return False


def generate_jwt(user_id: str, email: str, name: str = '') -> str:
    """
    生成 JWT token

    Args:
        user_id: 用戶 ID
        email: 用戶 email
        name: 用戶名稱

    Returns:
        JWT token 字串
    """
    if not JWT_SECRET:
        raise ValueError("JWT_SECRET 環境變數未設定")

    payload = {
        'user_id': user_id,
        'email': email,
        'name': name,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow(),
        'type': 'access'
    }

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token


def verify_jwt(token: str) -> Optional[dict]:
    """
    驗證並解析 JWT token

    Args:
        token: JWT token 字串

    Returns:
        解析後的 payload，如果驗證失敗則返回 None
    """
    if not JWT_SECRET:
        return None

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        # Token 已過期
        return None
    except jwt.InvalidTokenError:
        # Token 無效
        return None


def generate_reset_token() -> str:
    """
    生成密碼重設 token (隨機 32 字元)

    Returns:
        隨機 token 字串
    """
    return secrets.token_urlsafe(32)


# 常見密碼黑名單（擴展版）
COMMON_PASSWORDS = {
    # 數字模式
    '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
    '88888888', '66668888', '12341234', '11223344',
    # 字母+數字
    'password', 'password123', 'password1', 'pass1234', 'passw0rd',
    'qwerty123', 'qwerty', 'abc12345', 'abc123', 'abcd1234',
    'admin123', 'admin1234', 'test1234', 'user1234', 'welcome123',
    # 鍵盤模式
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx', 'qweasdzxc',
    # 日期格式
    '19900101', '20000101', '19950101', '19980101',
    # 重複字符
    'aaaaaaaa', 'aaaa1111', '1111aaaa',
    # 中文拼音
    'woaini123', 'woaini520', 'zhongguo', 'beijing', 'shanghai',
    'aini1314', 'iloveyou', 'loveyou123',
}

# 鍵盤相鄰模式
KEYBOARD_PATTERNS = [
    'qwer', 'wert', 'erty', 'rtyu', 'tyui', 'yuio', 'uiop',
    'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl',
    'zxcv', 'xcvb', 'cvbn', 'vbnm',
    '1qaz', '2wsx', '3edc', '4rfv', '5tgb', '6yhn', '7ujm', '8ik', '9ol', '0p',
]

# 常見中文拼音
CHINESE_PINYIN = [
    'woaini', 'aini', 'xihuan', 'zhongguo', 'beijing', 'shanghai',
    'guangzhou', 'shenzhen', 'nanjing', 'hangzhou', 'chengdu',
    'wuhan', 'xian', 'qingdao', 'dalian', 'shenyang',
]


def calculate_entropy(password: str) -> float:
    """
    計算密碼的熵值（複雜度）

    Args:
        password: 密碼字串

    Returns:
        熵值（bits）
    """
    charset_size = 0

    if re.search(r'[a-z]', password):
        charset_size += 26
    if re.search(r'[A-Z]', password):
        charset_size += 26
    if re.search(r'\d', password):
        charset_size += 10
    if re.search(r'[^a-zA-Z0-9]', password):
        charset_size += 32  # 特殊符號估計

    if charset_size == 0:
        return 0.0

    # 熵 = log2(字符集大小^密碼長度)
    entropy = len(password) * math.log2(charset_size)
    return entropy


def has_repeating_chars(password: str, max_repeat: int = 2) -> Tuple[bool, str]:
    """
    檢查是否有重複字符

    Args:
        password: 密碼
        max_repeat: 最大允許重複次數

    Returns:
        (是否有違規重複, 違規字符)
    """
    for i in range(len(password) - max_repeat):
        if len(set(password[i:i+max_repeat+1])) == 1:
            return True, password[i:i+max_repeat+1]
    return False, ''


def has_sequential_chars(password: str, max_sequential: int = 3) -> Tuple[bool, str]:
    """
    檢查是否有連續字符（遞增或遞減）

    Args:
        password: 密碼
        max_sequential: 最大允許連續次數

    Returns:
        (是否有連續, 連續字串)
    """
    password_lower = password.lower()

    for i in range(len(password_lower) - max_sequential):
        substring = password_lower[i:i+max_sequential+1]

        # 檢查遞增
        is_increasing = all(
            ord(substring[j+1]) - ord(substring[j]) == 1
            for j in range(len(substring)-1)
        )

        # 檢查遞減
        is_decreasing = all(
            ord(substring[j]) - ord(substring[j+1]) == 1
            for j in range(len(substring)-1)
        )

        if is_increasing or is_decreasing:
            return True, substring

    return False, ''


def has_keyboard_pattern(password: str) -> Tuple[bool, str]:
    """
    檢查是否包含鍵盤模式

    Args:
        password: 密碼

    Returns:
        (是否包含鍵盤模式, 匹配的模式)
    """
    password_lower = password.lower()

    for pattern in KEYBOARD_PATTERNS:
        if pattern in password_lower:
            return True, pattern
        # 反向也要檢查
        if pattern[::-1] in password_lower:
            return True, pattern[::-1]

    return False, ''


def has_math_pattern(password: str) -> Tuple[bool, str]:
    """
    檢查是否包含數學模式（費式數列、平方數等）

    Args:
        password: 密碼

    Returns:
        (是否包含數學模式, 模式類型)
    """
    # 提取密碼中的數字序列
    digits = ''.join(c for c in password if c.isdigit())

    if len(digits) < 6:
        return False, ''

    # 費式數列檢查
    fibonacci_patterns = ['112358', '11235813', '235813', '358132134']
    for fib in fibonacci_patterns:
        if fib in digits:
            return True, f'費式數列: {fib}'

    # 平方數檢查
    square_patterns = ['1491625', '149162536', '14916253649']
    for sq in square_patterns:
        if sq in digits:
            return True, f'平方數: {sq}'

    # 連續平方檢查
    if len(digits) >= 6:
        for i in range(len(digits) - 5):
            seq = digits[i:i+6]
            # 檢查是否為 1,4,9,16,25,36
            if seq in ['149162', '491625', '916253', '162536']:
                return True, f'連續平方: {seq}'

    return False, ''


def contains_personal_info(password: str, email: str = '', name: str = '') -> Tuple[bool, str]:
    """
    檢查密碼是否包含個人資訊

    Args:
        password: 密碼
        email: Email 地址
        name: 姓名

    Returns:
        (是否包含個人資訊, 相關資訊)
    """
    password_lower = password.lower()

    # 檢查 email
    if email:
        email_parts = email.lower().split('@')[0].split('.')
        for part in email_parts:
            if len(part) >= 3 and part in password_lower:
                return True, f'包含 Email: {part}'

    # 檢查名字
    if name:
        name_lower = name.lower()
        # 移除空格
        name_parts = name_lower.replace(' ', '').split()
        for part in name_parts:
            if len(part) >= 3 and part in password_lower:
                return True, f'包含名字: {part}'

    return False, ''


def has_chinese_pinyin(password: str) -> Tuple[bool, str]:
    """
    檢查是否包含常見中文拼音

    Args:
        password: 密碼

    Returns:
        (是否包含中文拼音, 匹配的拼音)
    """
    password_lower = password.lower()

    for pinyin in CHINESE_PINYIN:
        if pinyin in password_lower:
            return True, pinyin

    return False, ''


def validate_password_strength_detailed(
    password: str,
    email: str = '',
    name: str = ''
) -> Dict[str, any]:
    """
    詳細的密碼強度驗證（返回所有檢查項目的結果）

    Args:
        password: 密碼
        email: Email（用於個人資訊檢查）
        name: 姓名（用於個人資訊檢查）

    Returns:
        包含所有檢查結果的字典
    """
    results = {
        'valid': True,
        'errors': [],
        'checks': {}
    }

    config = PASSWORD_CONFIG

    # 1. 長度檢查
    min_length = config['min_length']
    length_check = len(password) >= min_length
    results['checks']['length'] = {
        'passed': length_check,
        'required': min_length,
        'actual': len(password),
        'message': f'至少 {min_length} 個字元' if not length_check else f'長度符合（{len(password)} 字元）'
    }
    if not length_check:
        results['valid'] = False
        results['errors'].append(f'密碼至少需要 {min_length} 個字元')

    # 2. 大寫字母
    if config['require_uppercase']:
        has_upper = bool(re.search(r'[A-Z]', password))
        results['checks']['uppercase'] = {
            'passed': has_upper,
            'message': '包含大寫字母' if has_upper else '缺少大寫字母'
        }
        if not has_upper:
            results['valid'] = False
            results['errors'].append('密碼必須包含大寫字母')

    # 3. 小寫字母
    if config['require_lowercase']:
        has_lower = bool(re.search(r'[a-z]', password))
        results['checks']['lowercase'] = {
            'passed': has_lower,
            'message': '包含小寫字母' if has_lower else '缺少小寫字母'
        }
        if not has_lower:
            results['valid'] = False
            results['errors'].append('密碼必須包含小寫字母')

    # 4. 數字
    if config['require_digit']:
        has_digit = bool(re.search(r'\d', password))
        results['checks']['digit'] = {
            'passed': has_digit,
            'message': '包含數字' if has_digit else '缺少數字'
        }
        if not has_digit:
            results['valid'] = False
            results['errors'].append('密碼必須包含數字')

    # 5. 特殊符號
    if config['require_special']:
        has_special = bool(re.search(r'[^a-zA-Z0-9]', password))
        results['checks']['special'] = {
            'passed': has_special,
            'message': '包含特殊符號' if has_special else '缺少特殊符號 (!@#$%^&* 等)'
        }
        if not has_special:
            results['valid'] = False
            results['errors'].append('密碼必須包含特殊符號')

    # 6. 重複字符檢查
    if config['check_repeating']:
        has_repeat, repeat_str = has_repeating_chars(password, config['max_repeating'])
        results['checks']['repeating'] = {
            'passed': not has_repeat,
            'message': f'不包含重複字符' if not has_repeat else f'包含重複字符: {repeat_str}'
        }
        if has_repeat:
            results['valid'] = False
            results['errors'].append(f'不能有 {config["max_repeating"]+1} 個或以上相同字符')

    # 7. 連續字符檢查
    if config['check_sequential']:
        has_seq, seq_str = has_sequential_chars(password, config['max_sequential'])
        results['checks']['sequential'] = {
            'passed': not has_seq,
            'message': '不包含連續字符' if not has_seq else f'包含連續字符: {seq_str}'
        }
        if has_seq:
            results['valid'] = False
            results['errors'].append(f'不能有 {config["max_sequential"]+1} 個或以上連續字符（如 abcd, 1234）')

    # 8. 鍵盤模式檢查
    if config['check_keyboard_pattern']:
        has_kbd, kbd_pattern = has_keyboard_pattern(password)
        results['checks']['keyboard_pattern'] = {
            'passed': not has_kbd,
            'message': '不包含鍵盤模式' if not has_kbd else f'包含鍵盤模式: {kbd_pattern}'
        }
        if has_kbd:
            results['valid'] = False
            results['errors'].append(f'不能使用鍵盤模式（如 {kbd_pattern}）')

    # 9. 數學模式檢查
    if config['check_math_patterns']:
        has_math, math_pattern = has_math_pattern(password)
        results['checks']['math_pattern'] = {
            'passed': not has_math,
            'message': '不包含數學模式' if not has_math else f'包含數學模式: {math_pattern}'
        }
        if has_math:
            results['valid'] = False
            results['errors'].append(f'不能使用數學模式（{math_pattern}）')

    # 10. 常見密碼檢查
    if config['check_common_passwords']:
        is_common = password.lower() in COMMON_PASSWORDS
        results['checks']['common_password'] = {
            'passed': not is_common,
            'message': '不是常見密碼' if not is_common else '這是常見密碼'
        }
        if is_common:
            results['valid'] = False
            results['errors'].append('這是常見密碼，請使用更獨特的密碼')

    # 11. 中文拼音檢查
    if config['check_chinese_pinyin']:
        has_pinyin, pinyin = has_chinese_pinyin(password)
        results['checks']['chinese_pinyin'] = {
            'passed': not has_pinyin,
            'message': '不包含常見拼音' if not has_pinyin else f'包含常見拼音: {pinyin}'
        }
        if has_pinyin:
            results['valid'] = False
            results['errors'].append(f'不能使用常見中文拼音（{pinyin}）')

    # 12. 個人資訊檢查
    if config['check_personal_info']:
        has_personal, personal_info = contains_personal_info(password, email, name)
        results['checks']['personal_info'] = {
            'passed': not has_personal,
            'message': '不包含個人資訊' if not has_personal else f'{personal_info}'
        }
        if has_personal:
            results['valid'] = False
            results['errors'].append('密碼不能包含您的 Email 或名字')

    # 13. 熵值檢查
    entropy = calculate_entropy(password)
    min_entropy = config['min_entropy']
    entropy_check = entropy >= min_entropy
    results['checks']['entropy'] = {
        'passed': entropy_check,
        'value': round(entropy, 2),
        'required': min_entropy,
        'message': f'複雜度足夠（{round(entropy, 1)} bits）' if entropy_check else f'複雜度不足（{round(entropy, 1)} bits，需要 {min_entropy} bits）'
    }
    if not entropy_check:
        results['valid'] = False
        results['errors'].append(f'密碼複雜度不足（需要更多字符種類）')

    return results


def validate_email_format(email: str) -> Tuple[bool, str]:
    """
    驗證 email 格式

    Args:
        email: Email 地址

    Returns:
        (是否有效, 錯誤訊息)
    """
    try:
        # 驗證並規範化 email
        valid = validate_email(email, check_deliverability=False)
        return True, valid.normalized
    except EmailNotValidError as e:
        return False, str(e)


def validate_password_strength(password: str, email: str = '', name: str = '') -> Tuple[bool, str]:
    """
    驗證密碼強度（簡化版，向後兼容）

    Args:
        password: 密碼
        email: Email（可選，用於個人資訊檢查）
        name: 姓名（可選，用於個人資訊檢查）

    Returns:
        (是否有效, 錯誤訊息或成功訊息)
    """
    # 使用詳細驗證函數
    result = validate_password_strength_detailed(password, email, name)

    if result['valid']:
        return True, "密碼強度足夠"
    else:
        # 返回第一個錯誤訊息
        return False, result['errors'][0] if result['errors'] else "密碼不符合要求"


def validate_name(name: str) -> Tuple[bool, str]:
    """
    驗證用戶名稱

    Args:
        name: 用戶名稱

    Returns:
        (是否有效, 錯誤訊息)
    """
    if not name or len(name.strip()) == 0:
        return False, "名稱不能為空"

    if len(name) > 50:
        return False, "名稱過長（最多 50 字元）"

    return True, "名稱有效"
