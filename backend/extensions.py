"""
extensions.py — 共用工具模組

包含：limiter、require_auth 裝飾器、輸入驗證函數、TTL 快取、登入鎖定機制。
所有 Blueprint 均從此模組 import，不直接依賴 main.py。
"""

import os
import re
import time
import logging
from collections import defaultdict
from functools import wraps
from typing import Any, Dict, Optional, Tuple

import jwt as pyjwt
from bson import ObjectId
from bson.errors import InvalidId
from flask import jsonify, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

import auth  # 認證模組（auth.py）

logger = logging.getLogger(__name__)

# ==================== 常數 ====================

MAX_AMOUNT = 9999999.99
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_DESCRIPTION_LENGTH = 500
SERVER_SELECTION_TIMEOUT_MS = 5000

ALLOWED_CATEGORIES = [
    "早餐",
    "午餐",
    "晚餐",
    "點心",
    "飲料",
    "其他",
    "交通",
    "娛樂",
    "購物",
    "醫療",
    "教育",
    "居住",
    "債務收回",  # 系統自動產生（lent 還款收入），不顯示於前端手動選項
    "債務償還",  # 系統自動產生（borrowed 還款支出），不顯示於前端手動選項
]

# ==================== Rate Limit Key ====================


def get_rate_limit_key():
    """
    優先用 JWT user_id 作為 rate limit key，讓每個用戶有獨立的 bucket。
    nginx reverse proxy 之後的部署會讓所有請求共用同一個 REMOTE_ADDR，
    若用 IP 作 key 會導致所有用戶共享配額，容易觸發 429（iOS 上可能顯示為 402）。
    未登入的請求（登入、註冊）才 fallback 到 IP。
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            jwt_secret = os.getenv("JWT_SECRET")
            if jwt_secret:
                payload = pyjwt.decode(token, jwt_secret, algorithms=["HS256"])
                return f"user:{payload.get('user_id', 'unknown')}"
        except Exception:
            pass
    return client_ip_from_forwarded_for(
        request.headers.get("X-Forwarded-For", ""), get_remote_address()
    )


def client_ip_from_forwarded_for(forwarded_for: str, remote_addr: str) -> str:
    """從 X-Forwarded-For 取出客戶端 IP，不信任客戶端自己填的部分。

    X-Forwarded-For 的格式是「client, proxy1, proxy2…」，每一層代理會把它看到的
    對端 IP 附加在最右邊（nginx 的 $proxy_add_x_forwarded_for）。最左邊那段可以由
    客戶端任意偽造，拿來當限速 key 的話，每次換個值就能繞過限速。
    因此只信任「自己的代理」附加的部分：由右往左數 TRUSTED_PROXY_COUNT 筆
    （預設 1 = 只有 nginx 一層；若前面另有一層代理就設 2）。
    標頭筆數不足時退回 remote_addr。
    """
    try:
        trusted = max(1, int(os.getenv("TRUSTED_PROXY_COUNT", "1")))
    except ValueError:
        trusted = 1
    parts = [p.strip() for p in forwarded_for.split(",") if p.strip()]
    if len(parts) >= trusted:
        return parts[-trusted]
    return remote_addr


# ==================== Limiter（Application Factory 模式） ====================
# 不傳入 app=，由 main.py 呼叫 limiter.init_app(app) 完成綁定

limiter = Limiter(
    key_func=get_rate_limit_key,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
    enabled=os.getenv("TESTING", "false").lower() != "true",
)

# ==================== require_auth 裝飾器 ====================


def require_auth(f):
    """
    認證裝飾器：驗證 JWT token

    驗證成功後會在 request 中注入 user_id、email、name
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            parts = auth_header.split(" ")
            if len(parts) == 2:
                token = parts[1]
                payload = auth.verify_jwt(token)

                if payload:
                    request.user_id = payload.get("user_id")
                    request.email = payload.get("email")
                    request.name = payload.get("name", "")
                    return f(*args, **kwargs)
                else:
                    return jsonify({"error": "Token 無效或已過期"}), 401
            else:
                return jsonify({"error": "Authorization header 格式錯誤"}), 401

        return jsonify({"error": "未授權"}), 401

    return decorated_function


# ==================== 輸入驗證函數 ====================


def validate_objectid(oid_string: str) -> bool:
    """驗證 ObjectId 格式"""
    try:
        ObjectId(oid_string)
        return True
    except (InvalidId, TypeError):
        return False


def validate_amount(amount: Any) -> Tuple[bool, Any]:
    """驗證金額（必須 > 0 且非 NaN）"""
    try:
        amount_float = float(amount)
        if amount_float <= 0 or amount_float != amount_float:  # NaN check
            return False, "金額必須大於 0"
        if amount_float > MAX_AMOUNT:
            return False, f"金額不得超過 {MAX_AMOUNT:,.2f}"
        return True, amount_float
    except (ValueError, TypeError):
        return False, "金額格式錯誤"


def validate_date(date_string: str) -> Tuple[bool, str]:
    """驗證日期格式（YYYY-MM-DD）"""
    if not date_string or not isinstance(date_string, str):
        return False, "日期格式錯誤"

    pattern = r"^\d{4}-\d{2}-\d{2}$"
    if not re.match(pattern, date_string):
        return False, "日期格式必須為 YYYY-MM-DD"

    try:
        from datetime import datetime

        datetime.strptime(date_string, "%Y-%m-%d")
        return True, date_string
    except ValueError:
        return False, "無效的日期"


def validate_expense_type(expense_type: Optional[str]) -> Tuple[bool, Optional[str]]:
    """驗證支出類型"""
    valid_types = ["fixed", "variable", "onetime"]
    if expense_type and expense_type not in valid_types:
        return False, f"支出類型必須為: {', '.join(valid_types)}"
    return True, expense_type


def validate_record_type(record_type: str) -> Tuple[bool, str]:
    """驗證記錄類型"""
    valid_types = ["income", "expense", "transfer", "restricted"]
    if record_type not in valid_types:
        return False, f"記錄類型必須為: {', '.join(valid_types)}"
    return True, record_type


LOCATIONS = ["bank", "cash"]


def validate_location(location: Any, required: bool = False) -> Tuple[bool, Any]:
    """驗證位置（bank/cash）。空值時：required=True 視為錯誤，否則回傳 (True, None)。"""
    if location in (None, ""):
        if required:
            return False, "請選擇位置（銀行或現金）"
        return True, None
    if location not in LOCATIONS:
        return False, f"位置必須為: {', '.join(LOCATIONS)}"
    return True, location


def validate_category(category: str) -> Tuple[bool, str]:
    """驗證分類"""
    if not category or not isinstance(category, str):
        return False, "分類不可為空"

    category = category.strip()

    if not category:
        return False, "分類不可為空"

    if len(category) > 50:
        return False, "分類長度不可超過 50 個字元"

    return True, category


MAX_WALLET_NAME_LENGTH = 30


def validate_wallet_name(name: Any) -> Tuple[bool, str]:
    """驗證錢包名稱"""
    if not name or not isinstance(name, str):
        return False, "錢包名稱不可為空"

    name = name.strip()

    if not name:
        return False, "錢包名稱不可為空"

    if len(name) > MAX_WALLET_NAME_LENGTH:
        return False, f"錢包名稱長度不可超過 {MAX_WALLET_NAME_LENGTH} 個字元"

    return True, name


def parse_object_id_list(raw: str) -> Tuple[bool, Any]:
    """將逗號分隔的 ObjectId 字串解析為陣列；任一格式錯誤即整體失敗。
    用於 wallet_ids 等多值篩選參數（$in 查詢）。
    """
    ids = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        if not validate_objectid(part):
            return False, f"無效的 ID: {part}"
        ids.append(ObjectId(part))
    return True, ids


def validate_description(description: str) -> Tuple[bool, str]:
    """驗證描述"""
    if not isinstance(description, str):
        return False, "描述格式錯誤"

    description = description.strip()

    if len(description) > MAX_DESCRIPTION_LENGTH:
        return False, f"描述長度不可超過 {MAX_DESCRIPTION_LENGTH} 個字元"

    return True, description


# ==================== TTL 快取 ====================

_stats_cache: Dict[str, Any] = {}
STATS_CACHE_TTL = 300  # 5 分鐘


def _cache_key(*args: Any) -> str:
    return ":".join(str(a) for a in args)


def _cache_get(key: str) -> Optional[Any]:
    entry = _stats_cache.get(key)
    if entry and time.time() - entry["ts"] < STATS_CACHE_TTL:
        return entry["data"]
    return None


def _cache_set(key: str, data: Any) -> None:
    _stats_cache[key] = {"data": data, "ts": time.time()}


def _cache_invalidate_user(user_id: str) -> None:
    """寫入操作後清除該用戶所有快取"""
    for k in [k for k in list(_stats_cache.keys()) if k.startswith(f"{user_id}:")]:
        _stats_cache.pop(k, None)


# ==================== 登入失敗鎖定 ====================

# 以「來源 IP + email」為鍵：若只用 email，任何人都能對別人的帳號亂試 5 次
# 就把本人鎖在外面 15 分鐘。這份表存在記憶體，重啟即清空。
_login_failures: dict = defaultdict(list)
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION = 15 * 60  # 15 分鐘
MAX_TRACKED_LOGIN_KEYS = 10000  # 表的上限，避免被大量不同 email 灌爆記憶體


def get_client_ip() -> str:
    """目前請求的客戶端 IP（與限速使用相同的 X-Forwarded-For 規則）。"""
    return client_ip_from_forwarded_for(
        request.headers.get("X-Forwarded-For", ""), get_remote_address()
    )


def _lockout_key(email: str, ip: str) -> str:
    return f"{ip}|{email}"


def _is_locked_out(email: str, ip: str) -> bool:
    if os.getenv("TESTING", "false").lower() == "true":
        return False
    key = _lockout_key(email, ip)
    attempts = _login_failures.get(key)
    if not attempts:
        return False
    now = time.time()
    recent = [t for t in attempts if now - t < LOCKOUT_DURATION]
    if recent:
        _login_failures[key] = recent
    else:
        _login_failures.pop(key, None)
    return len(recent) >= LOCKOUT_THRESHOLD


def _prune_login_failures() -> None:
    """表超過上限時先清掉過期的；還是太大就丟掉最舊的一半。"""
    now = time.time()
    for key in list(_login_failures):
        if all(now - t >= LOCKOUT_DURATION for t in _login_failures[key]):
            _login_failures.pop(key, None)
    if len(_login_failures) > MAX_TRACKED_LOGIN_KEYS:
        by_age = sorted(_login_failures, key=lambda k: _login_failures[k][-1])
        for key in by_age[: len(by_age) // 2]:
            _login_failures.pop(key, None)


def _record_login_failure(email: str, ip: str) -> None:
    _login_failures[_lockout_key(email, ip)].append(time.time())
    if len(_login_failures) > MAX_TRACKED_LOGIN_KEYS:
        _prune_login_failures()


def _clear_login_failures(email: str, ip: str) -> None:
    _login_failures.pop(_lockout_key(email, ip), None)
