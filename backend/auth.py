"""
認證模組 - 處理用戶認證、密碼加密、JWT token 管理
"""

import os
import re
import secrets
import bcrypt
import jwt
from datetime import datetime, timedelta
from typing import Optional, Tuple
from email_validator import validate_email, EmailNotValidError


# JWT 配置
JWT_SECRET = os.getenv('JWT_SECRET')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24  # Token 24 小時過期


def hash_password(password: str) -> str:
    """
    使用 bcrypt 加密密碼

    Args:
        password: 明文密碼

    Returns:
        加密後的密碼 hash
    """
    # 生成 salt 並加密 (cost factor = 12)
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


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
        return bcrypt.checkpw(
            password.encode('utf-8'),
            password_hash.encode('utf-8')
        )
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


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    驗證密碼強度

    要求：
    - 至少 8 個字元
    - 包含字母
    - 包含數字

    Args:
        password: 密碼

    Returns:
        (是否有效, 錯誤訊息或成功訊息)
    """
    if len(password) < 8:
        return False, "密碼至少需要 8 個字元"

    if not re.search(r'[A-Za-z]', password):
        return False, "密碼必須包含字母"

    if not re.search(r'\d', password):
        return False, "密碼必須包含數字"

    # 檢查常見弱密碼
    common_passwords = [
        '12345678', 'password', 'qwerty123', 'abc12345',
        '11111111', '88888888', 'password123', '123456789'
    ]
    if password.lower() in common_passwords:
        return False, "密碼過於簡單，請使用更複雜的密碼"

    return True, "密碼強度足夠"


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
