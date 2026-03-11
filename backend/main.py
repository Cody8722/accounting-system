from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import jwt as pyjwt
from pymongo import MongoClient, ASCENDING
from bson import json_util, ObjectId
from bson.errors import InvalidId
from functools import wraps
from typing import Tuple, Dict, Any, Optional
import json
import math
import os
from dotenv import load_dotenv
from calendar import monthrange
from datetime import datetime
import logging
import re
import csv
from io import StringIO

# 導入認證模組
import auth

# 載入環境變數
load_dotenv()

# 設定 logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 常數定義
MAX_AMOUNT = 9999999.99
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
SERVER_SELECTION_TIMEOUT_MS = 5000
MAX_DESCRIPTION_LENGTH = 500
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
]

app = Flask(__name__)

# 設定最大請求大小 (16MB)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# CORS 設定 - 限制來源
FRONTEND_URLS = os.getenv(
    "FRONTEND_URLS", "http://localhost:8080,https://accounting-system.zeabur.app"
).split(",")
# 清理 URL，移除空白字符
FRONTEND_URLS = [url.strip() for url in FRONTEND_URLS if url.strip()]
CORS(
    app,
    origins=FRONTEND_URLS,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)


# 安全 headers
@app.after_request
def add_security_headers(response):
    """添加安全相關的 HTTP headers"""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self' http://localhost:5001 https://*.zeabur.app;"
    )
    return response


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "找不到資源"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "不允許的請求方法"}), 405


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    logger.error(f"未預期錯誤: {type(e).__name__}: {e}")
    return jsonify({"error": "伺服器內部錯誤"}), 500


# 速率限制
def get_rate_limit_key():
    """
    優先用 JWT user_id 作為 rate limit key，讓每個用戶有獨立的 bucket。
    Zeabur 等雲端平台的 reverse proxy 會讓所有請求共用同一個 REMOTE_ADDR，
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
    # 未登入請求（/api/auth/login 等）：用 X-Forwarded-For 或 REMOTE_ADDR
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address()


# Disable rate limiting if TESTING environment variable is set
limiter = Limiter(
    app=app,
    key_func=get_rate_limit_key,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
    enabled=os.getenv("TESTING", "false").lower() != "true",
)

# 環境變數
MONGO_URI = os.getenv("MONGO_URI")
# Gmail SMTP 配置
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "會計系統 - 系統通知")

# MongoDB 連線
client = None
accounting_records_collection = None
accounting_budget_collection = None
users_collection = None  # 新增：用戶集合
recurring_collection = None  # 定期支出集合

if MONGO_URI:
    try:
        # 優化 MongoDB 連接設置以提高性能和穩定性
        client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS,
            connectTimeoutMS=30000,  # 連接超時 30 秒（SSL 握手需要更長時間）
            socketTimeoutMS=30000,  # Socket 超時 30 秒
            maxPoolSize=10,  # 最大連接池大小
            minPoolSize=0,  # 最小連接池大小設為 0，避免背景強制維持連線造成 SSL 超時
            maxIdleTimeMS=30000,  # 最大閒置時間 30 秒（低於 Atlas 的 60 秒閒置切斷）
            retryWrites=True,  # 自動重試寫入操作
            retryReads=True,  # 自動重試讀取操作
        )
        client.admin.command("ping")

        # 記帳資料庫
        accounting_db = client["accounting_db"]
        accounting_records_collection = accounting_db["records"]
        accounting_budget_collection = accounting_db["budget"]
        users_collection = accounting_db["users"]  # 新增：用戶集合
        recurring_collection = accounting_db["recurring"]  # 定期支出集合

        # 建立索引以優化查詢效能（背景執行避免阻塞）
        try:
            # 記帳記錄索引
            accounting_records_collection.create_index(
                [("date", ASCENDING)], background=True
            )
            accounting_records_collection.create_index(
                [("type", ASCENDING)], background=True
            )
            accounting_records_collection.create_index(
                [("category", ASCENDING)], background=True
            )
            accounting_records_collection.create_index(
                [("user_id", ASCENDING)], background=True
            )
            accounting_records_collection.create_index(
                [("user_id", ASCENDING), ("date", ASCENDING)], background=True
            )

            # 預算索引（更新為複合唯一索引）
            try:
                accounting_budget_collection.drop_index("month_1")
            except Exception as e:
                # 索引可能不存在，忽略錯誤
                logger.debug(f"無法刪除舊索引 month_1: {str(e)}")
            accounting_budget_collection.create_index(
                [("user_id", ASCENDING), ("month", ASCENDING)],
                unique=True,
                background=True,
            )

            # 用戶索引
            users_collection.create_index(
                [("email", ASCENDING)], unique=True, background=True
            )
            users_collection.create_index(
                [("password_reset_token", ASCENDING)], background=True
            )

            # 定期支出索引
            recurring_collection.create_index(
                [("user_id", ASCENDING)], background=True
            )

            logger.info("✅ 資料庫索引已建立（背景執行）")
        except Exception as index_error:
            logger.warning(f"⚠️ 索引建立警告: {index_error}")

        logger.info("✅ 已連接到記帳資料庫")
    except Exception as e:
        logger.error(f"❌ MongoDB 連線失敗: {e}")
        client = None
else:
    logger.warning("⚠️ 未設定 MONGO_URI，資料庫功能無法使用")

# ==================== 認證裝飾器 ====================


def require_auth(f):
    """
    認證裝飾器：驗證 JWT token

    驗證成功後會在 request 中注入 user_id、email、name
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            # 安全地解析 token，防止 IndexError
            parts = auth_header.split(" ")
            if len(parts) == 2:
                token = parts[1]
                payload = auth.verify_jwt(token)

                if payload:
                    # JWT 驗證成功，注入用戶資訊到 request
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
    valid_types = ["income", "expense"]
    if record_type not in valid_types:
        return False, f"記錄類型必須為: {', '.join(valid_types)}"
    return True, record_type


def validate_category(category: str) -> Tuple[bool, str]:
    """驗證分類"""
    if not category or not isinstance(category, str):
        return False, "分類不可為空"

    # 去除前後空白
    category = category.strip()

    # 再次檢查去除空白後是否為空
    if not category:
        return False, "分類不可為空"

    # 檢查長度
    if len(category) > 50:
        return False, "分類長度不可超過 50 個字元"

    # 不強制分類必須在清單中，允許用戶自定義分類
    # ALLOWED_CATEGORIES 僅作為建議參考

    return True, category


def validate_description(description: str) -> Tuple[bool, str]:
    """驗證描述"""
    if not isinstance(description, str):
        return False, "描述格式錯誤"

    # 去除前後空白
    description = description.strip()

    # 檢查長度
    if len(description) > MAX_DESCRIPTION_LENGTH:
        return False, f"描述長度不可超過 {MAX_DESCRIPTION_LENGTH} 個字元"

    return True, description


# ==================== 健康檢查端點 ====================


@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health_check():
    """
    輕量級健康檢查端點（無需認證）
    用於 Zeabur 或其他服務的健康檢查
    """
    return jsonify({"status": "healthy", "service": "accounting-system"}), 200


# ==================== 記帳 API ====================


@app.route("/admin/api/accounting/records", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_records():
    """取得記帳記錄"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取分頁參數
        try:
            page = max(1, int(request.args.get("page", 1)))
            limit = min(MAX_PAGE_SIZE, max(1, int(request.args.get("limit", DEFAULT_PAGE_SIZE))))
        except (ValueError, TypeError):
            return jsonify({"error": "page 和 limit 必須為正整數"}), 400

        # 獲取查詢參數
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        record_type = request.args.get("type")
        category = request.args.get("category")

        # 建立查詢條件
        query = {}

        # 用戶數據隔離：只能查看自己的記錄
        query["user_id"] = ObjectId(request.user_id)

        if start_date and end_date:
            # 驗證日期格式
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query["date"] = {"$gte": start_date, "$lte": end_date}

        if record_type:
            valid, _ = validate_record_type(record_type)
            if valid:
                query["type"] = record_type

        if category:
            query["category"] = category

        # 取得總筆數
        total = accounting_records_collection.count_documents(query)
        total_pages = math.ceil(total / limit) if total > 0 else 1

        # 查詢記錄，按日期降冪排序，套用分頁
        records = list(
            accounting_records_collection.find(query)
            .sort("date", -1)
            .skip((page - 1) * limit)
            .limit(limit)
        )

        return json.loads(json_util.dumps({
            "records": records,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        })), 200
    except Exception as e:
        logger.error(f"查詢記帳記錄失敗: {e}")
        return jsonify({"error": "查詢記錄失敗"}), 500


@app.route("/admin/api/accounting/records", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def add_accounting_record():
    """新增記帳記錄"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        # 驗證必要欄位
        required_fields = ["type", "amount", "category", "date"]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"缺少必要欄位: {field}"}), 400

        # 驗證記錄類型
        valid, msg = validate_record_type(data["type"])
        if not valid:
            return jsonify({"error": msg}), 400

        # 驗證金額
        valid, result = validate_amount(data["amount"])
        if not valid:
            return jsonify({"error": result}), 400
        amount = result

        # 驗證日期
        valid, result = validate_date(data["date"])
        if not valid:
            return jsonify({"error": result}), 400

        # 驗證分類
        valid, category = validate_category(data["category"])
        if not valid:
            return jsonify({"error": category}), 400

        # 驗證描述
        description = data.get("description", "")
        valid, description = validate_description(description)
        if not valid:
            return jsonify({"error": description}), 400

        # 驗證支出類型（新格式）或重複類型（舊格式，向後相容）
        expense_type = data.get("expense_type")
        if expense_type:
            valid, msg = validate_expense_type(expense_type)
            if not valid:
                return jsonify({"error": msg}), 400

        # 建立記錄
        record = {
            "type": data["type"],
            "amount": amount,
            "category": category,
            "date": data["date"],
            "description": description,
            "expense_type": expense_type,  # 新欄位
            "created_at": datetime.now(),
        }

        record["user_id"] = ObjectId(request.user_id)

        result = accounting_records_collection.insert_one(record)
        logger.info(f"新增記帳記錄: {result.inserted_id} (user: {request.email})")
        return (
            jsonify({"message": "記帳記錄已新增", "id": str(result.inserted_id)}),
            201,
        )
    except Exception as e:
        logger.error(f"新增記帳記錄失敗: {e}")
        return jsonify({"error": "新增記錄失敗"}), 500


@app.route("/admin/api/accounting/records/<record_id>", methods=["PUT"])
@limiter.limit("50 per minute")
@require_auth
def update_accounting_record(record_id):
    """更新記帳記錄"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    # 驗證 ObjectId
    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        # 用戶數據隔離：只能修改自己的記錄
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }

        # 先檢查記錄是否存在且屬於當前用戶
        existing_record = accounting_records_collection.find_one(query)
        if not existing_record:
            return jsonify({"error": "找不到該記錄或無權限修改"}), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_data = {}

        # 驗證類型
        if "type" in data:
            valid, msg = validate_record_type(data["type"])
            if not valid:
                return jsonify({"error": msg}), 400
            update_data["type"] = data["type"]

        # 驗證金額
        if "amount" in data:
            valid, result = validate_amount(data["amount"])
            if not valid:
                return jsonify({"error": result}), 400
            update_data["amount"] = result

        # 驗證分類
        if "category" in data:
            valid, category = validate_category(data["category"])
            if not valid:
                return jsonify({"error": category}), 400
            update_data["category"] = category

        # 驗證日期
        if "date" in data:
            valid, result = validate_date(data["date"])
            if not valid:
                return jsonify({"error": result}), 400
            update_data["date"] = data["date"]

        # 驗證描述
        if "description" in data:
            valid, description = validate_description(data["description"])
            if not valid:
                return jsonify({"error": description}), 400
            update_data["description"] = description

        # 驗證支出類型
        if "expense_type" in data:
            if data["expense_type"]:  # 如果不是空值才驗證
                valid, msg = validate_expense_type(data["expense_type"])
                if not valid:
                    return jsonify({"error": msg}), 400
            update_data["expense_type"] = data["expense_type"]

        update_data["updated_at"] = datetime.now()

        result = accounting_records_collection.update_one(query, {"$set": update_data})

        if result.matched_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        logger.info(f"更新記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已更新"}), 200
    except Exception as e:
        logger.error(f"更新記帳記錄失敗: {e}")
        return jsonify({"error": "更新記錄失敗"}), 500


@app.route("/admin/api/accounting/records/<record_id>", methods=["DELETE"])
@limiter.limit("50 per minute")
@require_auth
def delete_accounting_record(record_id):
    """刪除記帳記錄"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    # 驗證 ObjectId
    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        # 用戶數據隔離：只能刪除自己的記錄
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }

        result = accounting_records_collection.delete_one(query)

        if result.deleted_count == 0:
            return jsonify({"error": "找不到該記錄或無權限刪除"}), 404

        logger.info(f"刪除記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已刪除"}), 200
    except Exception as e:
        logger.error(f"刪除記帳記錄失敗: {e}")
        return jsonify({"error": "刪除記錄失敗"}), 500


@app.route("/admin/api/accounting/stats", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_stats():
    """取得記帳統計"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取日期範圍參數
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        query = {}

        query["user_id"] = ObjectId(request.user_id)

        if start_date and end_date:
            # 驗證日期格式
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query["date"] = {"$gte": start_date, "$lte": end_date}

        # 計算總收入和總支出
        income_pipeline = [
            {"$match": {**query, "type": "income"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        expense_pipeline = [
            {"$match": {**query, "type": "expense"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]

        income_result = list(accounting_records_collection.aggregate(income_pipeline))
        expense_result = list(accounting_records_collection.aggregate(expense_pipeline))

        total_income = income_result[0]["total"] if income_result else 0
        total_expense = expense_result[0]["total"] if expense_result else 0

        # 按分類統計支出
        category_pipeline = [
            {"$match": {**query, "type": "expense"}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
            {"$sort": {"total": -1}},
        ]
        category_stats = list(
            accounting_records_collection.aggregate(category_pipeline)
        )

        return (
            jsonify(
                {
                    "total_income": total_income,
                    "total_expense": total_expense,
                    "balance": total_income - total_expense,
                    "category_stats": category_stats,
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得統計資料失敗: {e}")
        return jsonify({"error": "取得統計資料失敗"}), 500


@app.route("/admin/api/accounting/budget", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_budget():
    """取得預算設定"""
    if accounting_budget_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取當前月份的預算
        current_month = datetime.now().strftime("%Y-%m")
        query = {"month": current_month}

        query["user_id"] = ObjectId(request.user_id)

        budget_doc = accounting_budget_collection.find_one(query)

        return (
            jsonify(
                {
                    "month": current_month,
                    "budget": budget_doc.get("budget", {}) if budget_doc else {},
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得預算失敗: {e}")
        return jsonify({"error": "取得預算失敗"}), 500


@app.route("/admin/api/accounting/budget", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def set_accounting_budget():
    """設定預算"""
    if accounting_budget_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json(silent=True)
        if not data or "budget" not in data:
            return jsonify({"error": "無效的請求資料"}), 400

        budget = data["budget"]
        if not isinstance(budget, dict):
            return jsonify({"error": "budget 必須為物件格式"}), 400
        for key, val in budget.items():
            if key not in ALLOWED_CATEGORIES:
                return jsonify({"error": f"不允許的分類: {key}"}), 400
            if not isinstance(val, (int, float)) or val < 0:
                return jsonify({"error": f"預算金額必須為非負數字: {key}"}), 400

        current_month = datetime.now().strftime("%Y-%m")

        # 建立查詢條件（用於 upsert）
        query = {"month": current_month}

        # 建立更新資料
        update_data = {"budget": data["budget"], "updated_at": datetime.now()}

        query["user_id"] = ObjectId(request.user_id)
        update_data["user_id"] = ObjectId(request.user_id)

        # 更新或新增預算
        accounting_budget_collection.update_one(
            query, {"$set": update_data}, upsert=True
        )

        logger.info(f"儲存預算設定: {current_month} (user: {request.email})")
        return jsonify({"message": "預算已儲存"}), 200
    except Exception as e:
        logger.error(f"儲存預算失敗: {e}")
        return jsonify({"error": "儲存預算失敗"}), 500


@app.route("/admin/api/accounting/export", methods=["GET"])
@limiter.limit("10 per hour")
@require_auth
def export_accounting_records():
    """
    匯出記帳記錄為 CSV 檔案

    Query Parameters:
        start_date: 開始日期 (YYYY-MM-DD, 可選)
        end_date: 結束日期 (YYYY-MM-DD, 可選)
        type: 記錄類型 (income/expense, 可選)

    Returns:
        CSV file download
    """
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取查詢參數
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        record_type = request.args.get("type")

        # 建立查詢條件
        query = {}

        # 用戶數據隔離：只能匯出自己的記錄
        query["user_id"] = ObjectId(request.user_id)

        # 日期範圍過濾
        if start_date and end_date:
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query["date"] = {"$gte": start_date, "$lte": end_date}

        # 記錄類型過濾
        if record_type:
            valid, _ = validate_record_type(record_type)
            if valid:
                query["type"] = record_type

        # 建立 CSV
        output = StringIO()
        writer = csv.writer(output)

        # 寫入標題列
        writer.writerow(["日期", "類型", "分類", "金額", "描述", "支出類型"])

        # 直接迭代 cursor，不將全部記錄載入記憶體
        record_count = 0
        for record in accounting_records_collection.find(query).sort("date", -1):
            # 類型轉換為中文
            type_zh = "收入" if record.get("type") == "income" else "支出"

            # 支出類型轉換為中文
            expense_type = record.get("expense_type", "")
            expense_type_zh = ""
            if expense_type == "fixed":
                expense_type_zh = "固定支出"
            elif expense_type == "variable":
                expense_type_zh = "變動支出"
            elif expense_type == "onetime":
                expense_type_zh = "一次性支出"

            writer.writerow(
                [
                    record.get("date", ""),
                    type_zh,
                    record.get("category", ""),
                    record.get("amount", 0),
                    record.get("description", ""),
                    expense_type_zh,
                ]
            )
            record_count += 1

        # 準備檔案名稱
        filename = "記帳記錄"
        if start_date and end_date:
            filename += f"_{start_date}_至_{end_date}"
        else:
            filename += f"_{datetime.now().strftime('%Y%m%d')}"
        filename += ".csv"

        # 建立 Response
        output.seek(0)

        # 添加 BOM 以支援 Excel 正確顯示中文
        bom_output = "\ufeff" + output.getvalue()

        response = Response(
            bom_output.encode("utf-8"),
            mimetype="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=\"records.csv\"; filename*=UTF-8''{__import__('urllib.parse', fromlist=['quote']).quote(filename)}",
                "Content-Type": "text/csv; charset=utf-8-sig",  # BOM for Excel
                "Access-Control-Allow-Origin": request.headers.get("Origin", "*"),
                "Access-Control-Allow-Credentials": "true",
            },
        )

        logger.info(f"匯出 {record_count} 筆記帳記錄 (user: {request.email})")
        return response

    except Exception as e:
        logger.error(f"匯出記帳記錄失敗: {e}")
        return jsonify({"error": "匯出失敗"}), 500


@app.route("/admin/api/accounting/trends", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_monthly_trends():
    """
    取得月度趨勢資料（收入與支出）

    Query Parameters:
        months: 顯示最近幾個月 (預設 6 個月)

    Returns:
        {
            "months": ["2024-01", "2024-02", ...],
            "income": [1000, 2000, ...],
            "expense": [800, 1500, ...]
        }
    """
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取並驗證參數
        try:
            months_count = int(request.args.get("months", 6))
        except (ValueError, TypeError):
            return jsonify({"error": "months 必須為整數"}), 400
        if months_count < 1:
            months_count = 1
        if months_count > 24:
            months_count = 24

        # 用戶數據隔離
        base_query = {"user_id": ObjectId(request.user_id)}

        # 按月份分組統計收入
        income_pipeline = [
            {"$match": {**base_query, "type": "income"}},
            {
                "$group": {
                    "_id": {"$substr": ["$date", 0, 7]},  # 擷取 YYYY-MM
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"_id": 1}},  # 按月份升冪排序
            {"$limit": months_count},
        ]

        # 按月份分組統計支出
        expense_pipeline = [
            {"$match": {**base_query, "type": "expense"}},
            {
                "$group": {
                    "_id": {"$substr": ["$date", 0, 7]},  # 擷取 YYYY-MM
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"_id": 1}},  # 按月份升冪排序
            {"$limit": months_count},
        ]

        income_data = list(accounting_records_collection.aggregate(income_pipeline))
        expense_data = list(accounting_records_collection.aggregate(expense_pipeline))

        # 整理資料為字典格式
        income_dict = {item["_id"]: item["total"] for item in income_data}
        expense_dict = {item["_id"]: item["total"] for item in expense_data}

        # 取得所有出現過的月份
        all_months = sorted(set(income_dict.keys()) | set(expense_dict.keys()))

        # 如果資料不足，補充最近幾個月
        if len(all_months) < months_count:
            current = datetime.now()
            for i in range(months_count):
                # 計算月份（使用簡單的月份減法）
                year = current.year
                month = current.month - i
                while month <= 0:
                    month += 12
                    year -= 1
                month_str = f"{year:04d}-{month:02d}"
                if month_str not in all_months:
                    all_months.append(month_str)

            all_months = sorted(list(set(all_months)))

        # 限制月份數量
        all_months = all_months[-months_count:]

        # 建立回應資料
        response_data = {
            "months": all_months,
            "income": [income_dict.get(month, 0) for month in all_months],
            "expense": [expense_dict.get(month, 0) for month in all_months],
        }

        logger.info(f"取得月度趨勢資料: {months_count} 個月 (user: {request.email})")
        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"取得月度趨勢失敗: {e}")
        return jsonify({"error": "取得趨勢資料失敗"}), 500


@app.route("/admin/api/accounting/comparison", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_period_comparison():
    """取得環比資料（本期 vs 上期）"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        period = request.args.get("period", "month")
        if period not in ("month", "quarter", "year"):
            return jsonify({"error": "period 必須為 month、quarter 或 year"}), 400

        now = datetime.now()

        if period == "month":
            cur_start = datetime(now.year, now.month, 1)
            if now.month == 1:
                prev_start = datetime(now.year - 1, 12, 1)
            else:
                prev_start = datetime(now.year, now.month - 1, 1)
            prev_end = cur_start
            cur_label = cur_start.strftime("%Y-%m")
            prev_label = prev_start.strftime("%Y-%m")

        elif period == "quarter":
            q = (now.month - 1) // 3
            cur_start = datetime(now.year, q * 3 + 1, 1)
            if q == 0:
                prev_start = datetime(now.year - 1, 10, 1)
            else:
                prev_start = datetime(now.year, (q - 1) * 3 + 1, 1)
            prev_end = cur_start
            cur_label = f"{now.year} Q{q + 1}"
            prev_year = prev_start.year
            prev_q = (prev_start.month - 1) // 3 + 1
            prev_label = f"{prev_year} Q{prev_q}"

        else:  # year
            cur_start = datetime(now.year, 1, 1)
            prev_start = datetime(now.year - 1, 1, 1)
            prev_end = cur_start
            cur_label = str(now.year)
            prev_label = str(now.year - 1)

        cur_end = now
        user_oid = ObjectId(request.user_id)

        def aggregate_period(start, end):
            pipeline = [
                {"$match": {
                    "user_id": user_oid,
                    "date": {"$gte": start.strftime("%Y-%m-%d"), "$lt": end.strftime("%Y-%m-%d")}
                }},
                {"$group": {
                    "_id": "$type",
                    "total": {"$sum": "$amount"}
                }}
            ]
            result = {"income": 0.0, "expense": 0.0}
            for doc in accounting_records_collection.aggregate(pipeline):
                if doc["_id"] == "income":
                    result["income"] = doc["total"]
                elif doc["_id"] == "expense":
                    result["expense"] = doc["total"]
            result["balance"] = result["income"] - result["expense"]
            return result

        cur = aggregate_period(cur_start, cur_end)
        prev = aggregate_period(prev_start, prev_end)

        def pct_change(cur_val, prev_val):
            if prev_val == 0:
                return None
            return round((cur_val - prev_val) / prev_val * 100, 1)

        return jsonify({
            "current":  {**cur,  "label": cur_label},
            "previous": {**prev, "label": prev_label},
            "changes": {
                "income_pct":  pct_change(cur["income"],  prev["income"]),
                "expense_pct": pct_change(cur["expense"], prev["expense"]),
                "balance_pct": pct_change(cur["balance"], prev["balance"])
            }
        }), 200

    except Exception as e:
        logger.error(f"取得環比資料失敗: {e}")
        return jsonify({"error": "取得環比資料失敗"}), 500


# ==================== 定期支出 ====================


@app.route("/admin/api/recurring", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_recurring():
    """取得所有定期支出項目"""
    if recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        items = list(recurring_collection.find({"user_id": user_oid}).sort("day_of_month", 1))
        for item in items:
            item["_id"] = str(item["_id"])
            item["user_id"] = str(item["user_id"])
            if "created_at" in item:
                item["created_at"] = item["created_at"].isoformat()
        return jsonify(items), 200
    except Exception as e:
        logger.error(f"取得定期支出失敗: {e}")
        return jsonify({"error": "取得定期支出失敗"}), 500


@app.route("/admin/api/recurring", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def create_recurring():
    """新增定期支出項目"""
    if recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        data = request.json or {}

        name = str(data.get("name", "")).strip()
        if not name or len(name) > 50:
            return jsonify({"error": "名稱無效（1-50 字元）"}), 400

        try:
            amount = float(data["amount"])
            if amount <= 0:
                raise ValueError
        except (KeyError, ValueError, TypeError):
            return jsonify({"error": "金額必須為正數"}), 400

        type_ = data.get("type", "expense")
        if type_ not in ("income", "expense"):
            return jsonify({"error": "類型必須為 income 或 expense"}), 400

        try:
            day = int(data.get("day_of_month", 1))
            if not 1 <= day <= 31:
                raise ValueError
        except (ValueError, TypeError):
            return jsonify({"error": "每月日期必須為 1-31"}), 400

        category = str(data.get("category", "其他")).strip() or "其他"
        if len(category) > 30:
            return jsonify({"error": "分類名稱過長"}), 400
        description = str(data.get("description", "")).strip()[:200]

        doc = {
            "user_id": ObjectId(request.user_id),
            "name": name,
            "amount": round(amount, 2),
            "type": type_,
            "category": category,
            "day_of_month": day,
            "description": description,
            "created_at": datetime.now(),
        }
        result = recurring_collection.insert_one(doc)
        logger.info(f"新增定期支出: {name} ${amount} (user: {request.email})")
        return jsonify({"id": str(result.inserted_id), "message": "新增成功"}), 201

    except Exception as e:
        logger.error(f"新增定期支出失敗: {e}")
        return jsonify({"error": "新增失敗"}), 500


@app.route("/admin/api/recurring/<item_id>", methods=["DELETE"])
@limiter.limit("30 per minute")
@require_auth
def delete_recurring(item_id):
    """刪除定期支出項目"""
    if recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        oid = ObjectId(item_id)
    except Exception:
        return jsonify({"error": "無效的 ID"}), 400
    try:
        result = recurring_collection.delete_one({"_id": oid, "user_id": ObjectId(request.user_id)})
        if result.deleted_count == 0:
            return jsonify({"error": "找不到項目"}), 404
        logger.info(f"刪除定期支出 {item_id} (user: {request.email})")
        return jsonify({"message": "刪除成功"}), 200
    except Exception as e:
        logger.error(f"刪除定期支出失敗: {e}")
        return jsonify({"error": "刪除失敗"}), 500


@app.route("/admin/api/recurring/<item_id>", methods=["PUT"])
@limiter.limit("30 per minute")
@require_auth
def update_recurring(item_id):
    """更新定期收支項目"""
    if recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        oid = ObjectId(item_id)
    except Exception:
        return jsonify({"error": "無效的 ID"}), 400
    try:
        data = request.json or {}

        name = str(data.get("name", "")).strip()
        if not name or len(name) > 50:
            return jsonify({"error": "名稱無效（1-50 字元）"}), 400

        try:
            amount = float(data["amount"])
            if amount <= 0:
                raise ValueError
        except (KeyError, ValueError, TypeError):
            return jsonify({"error": "金額必須為正數"}), 400

        type_ = data.get("type", "expense")
        if type_ not in ("income", "expense"):
            return jsonify({"error": "類型必須為 income 或 expense"}), 400

        try:
            day = int(data.get("day_of_month", 1))
            if not 1 <= day <= 31:
                raise ValueError
        except (ValueError, TypeError):
            return jsonify({"error": "每月日期必須為 1-31"}), 400

        category = str(data.get("category", "其他")).strip() or "其他"
        if len(category) > 30:
            return jsonify({"error": "分類名稱過長"}), 400
        description = str(data.get("description", "")).strip()[:200]

        result = recurring_collection.update_one(
            {"_id": oid, "user_id": ObjectId(request.user_id)},
            {
                "$set": {
                    "name": name,
                    "amount": round(amount, 2),
                    "type": type_,
                    "category": category,
                    "day_of_month": day,
                    "description": description,
                }
            },
        )
        if result.matched_count == 0:
            return jsonify({"error": "找不到項目"}), 404
        logger.info(f"更新定期收支 {item_id} → {name} (user: {request.email})")
        return jsonify({"message": "更新成功"}), 200

    except Exception as e:
        logger.error(f"更新定期收支失敗: {e}")
        return jsonify({"error": "更新失敗"}), 500


@app.route("/admin/api/recurring/<item_id>/apply", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def apply_recurring(item_id):
    """將定期支出套用為一筆實際記帳記錄"""
    if recurring_collection is None or accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        oid = ObjectId(item_id)
    except Exception:
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        item = recurring_collection.find_one({"_id": oid, "user_id": user_oid})
        if not item:
            return jsonify({"error": "找不到項目"}), 404

        # 使用定期收支設定的日期，超過當月天數時自動調整（如 31 號在二月 = 28 號）
        today_dt = datetime.now()
        max_day = monthrange(today_dt.year, today_dt.month)[1]
        actual_day = min(item["day_of_month"], max_day)
        record_date = today_dt.replace(day=actual_day).strftime("%Y-%m-%d")
        record = {
            "user_id": user_oid,
            "type": item["type"],
            "amount": item["amount"],
            "category": item["category"],
            "description": item.get("description") or item["name"],
            "date": record_date,
            "created_at": datetime.now(),
        }
        result = accounting_records_collection.insert_one(record)
        logger.info(
            f"套用定期支出 '{item['name']}' ${item['amount']} (user: {request.email})"
        )
        return jsonify({"id": str(result.inserted_id), "message": "記帳成功"}), 201

    except Exception as e:
        logger.error(f"套用定期支出失敗: {e}")
        return jsonify({"error": "套用失敗"}), 500


# ==================== 系統狀態 ====================


@app.route("/status", methods=["GET"])
@limiter.limit("10 per minute")
def status():
    """系統狀態檢查（公開端點）"""
    db_connected = client is not None

    return (
        jsonify(
            {
                "status": "ok",
                "db_status": "connected" if db_connected else "disconnected",
                "message": "記帳系統運作正常" if db_connected else "資料庫未連線",
            }
        ),
        200,
    )


# ==================== 用戶認證 API ====================


@app.route("/api/auth/validate-password", methods=["POST"])
def validate_password():
    """
    即時密碼強度驗證（用於前端即時顯示）
    Request: { "password": "...", "email": "..." (可選), "name": "..." (可選) }
    Response: { "valid": true/false, "checks": {...}, "errors": [...] }
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        password = data.get("password", "")
        email = data.get("email", "")
        name = data.get("name", "")

        # 使用詳細驗證函數
        result = auth.validate_password_strength_detailed(password, email, name)

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"密碼驗證失敗: {e}")
        return jsonify({"error": "驗證失敗"}), 500


@app.route("/api/auth/password-config", methods=["GET"])
def get_password_config():
    """
    獲取密碼規則配置（用於前端顯示規則）
    Response: { "min_length": 12, "require_uppercase": true, ... }
    """
    try:
        # 返回當前的密碼配置
        config = {
            "min_length": auth.PASSWORD_CONFIG["min_length"],
            "require_uppercase": auth.PASSWORD_CONFIG["require_uppercase"],
            "require_lowercase": auth.PASSWORD_CONFIG["require_lowercase"],
            "require_digit": auth.PASSWORD_CONFIG["require_digit"],
            "require_special": auth.PASSWORD_CONFIG["require_special"],
            "max_repeating": auth.PASSWORD_CONFIG["max_repeating"],
            "max_sequential": auth.PASSWORD_CONFIG["max_sequential"],
        }
        return jsonify(config), 200

    except Exception as e:
        logger.error(f"獲取密碼配置失敗: {e}")
        return jsonify({"error": "獲取配置失敗"}), 500


@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per hour")
def register():
    """
    用戶註冊
    Request: { "email": "...", "password": "...", "name": "..." }
    Response: { "message": "註冊成功", "user_id": "..." }
    """
    if users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        email = data.get("email", "").strip()
        password = data.get("password", "")
        name = data.get("name", "").strip()

        # 驗證 email 格式
        is_valid_email, email_or_error = auth.validate_email_format(email)
        if not is_valid_email:
            return jsonify({"error": f"Email 格式錯誤：{email_or_error}"}), 400

        email = email_or_error  # 使用規範化後的 email

        # 驗證名稱（先驗證名稱，這樣才能用於密碼檢查）
        is_valid_name, name_message = auth.validate_name(name)
        if not is_valid_name:
            return jsonify({"error": name_message}), 400

        # 驗證密碼強度（傳入 email 和 name 進行個人資訊檢查）
        is_valid_password, password_message = auth.validate_password_strength(
            password, email, name
        )
        if not is_valid_password:
            return jsonify({"error": password_message}), 400

        # 檢查 email 是否已存在
        existing_user = users_collection.find_one({"email": email})
        if existing_user:
            return jsonify({"error": "此 Email 已被註冊"}), 409

        # 加密密碼
        password_hash = auth.hash_password(password)

        # 創建用戶
        user = {
            "email": email,
            "password_hash": password_hash,
            "name": name,
            "created_at": datetime.now(),
            "last_login": None,
            "is_active": True,
            "email_verified": False,  # 可選：Email 驗證功能
            "password_last_updated": datetime.now(),  # 密碼最後更新時間
            "requires_password_change": False,  # 是否需要強制更改密碼
        }

        result = users_collection.insert_one(user)
        user_id = str(result.inserted_id)

        logger.info(f"新用戶註冊: {email}")
        return jsonify({"message": "註冊成功", "user_id": user_id}), 201

    except Exception as e:
        logger.error(f"註冊失敗: {e}")
        return jsonify({"error": "註冊失敗，請稍後再試"}), 500


@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    """
    用戶登入
    Request: { "email": "...", "password": "..." }
    Response: { "token": "jwt_token...", "user": { "id": "...", "email": "...", "name": "..." } }
    """
    if users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not email or not password:
            return jsonify({"error": "Email 和密碼不能為空"}), 400

        # 查找用戶
        user = users_collection.find_one({"email": email})
        if not user:
            return jsonify({"error": "Email 或密碼錯誤"}), 401

        # 檢查帳號是否啟用
        if not user.get("is_active", True):
            return jsonify({"error": "帳號已被停用"}), 403

        # 驗證密碼
        if not auth.verify_password(password, user["password_hash"]):
            return jsonify({"error": "Email 或密碼錯誤"}), 401

        # 更新最後登入時間
        users_collection.update_one(
            {"_id": user["_id"]}, {"$set": {"last_login": datetime.now()}}
        )

        # 生成 JWT token
        token = auth.generate_jwt(
            user_id=str(user["_id"]), email=user["email"], name=user.get("name", "")
        )

        logger.info(f"用戶登入: {email}")
        return (
            jsonify(
                {
                    "token": token,
                    "user": {
                        "id": str(user["_id"]),
                        "email": user["email"],
                        "name": user.get("name", ""),
                        "created_at": (
                            user.get("created_at").isoformat()
                            if user.get("created_at")
                            else None
                        ),
                    },
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"登入失敗: {e}")
        return jsonify({"error": "登入失敗，請稍後再試"}), 500


@app.route("/api/auth/verify", methods=["GET"])
@require_auth
def verify_token():
    """
    驗證 token 有效性
    Response: { "valid": true, "user": {...} }
    """
    if users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        user = users_collection.find_one({"_id": ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        return (
            jsonify(
                {
                    "valid": True,
                    "user": {
                        "id": str(user["_id"]),
                        "email": user["email"],
                        "name": user.get("name", ""),
                    },
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"驗證 token 失敗: {e}")
        return jsonify({"error": "驗證失敗"}), 500


@app.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout():
    """
    登出（前端清除 token，後端記錄）
    Response: { "message": "已登出" }
    """
    logger.info(f"用戶登出: {request.email}")
    return jsonify({"message": "已登出"}), 200


@app.route("/api/user/profile", methods=["GET"])
@require_auth
def get_profile():
    """
    取得用戶個人資料
    Response: { "id": "...", "email": "...", "name": "...", "created_at": "..." }
    """
    if users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        user = users_collection.find_one({"_id": ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        return (
            jsonify(
                {
                    "id": str(user["_id"]),
                    "email": user["email"],
                    "name": user.get("name", ""),
                    "created_at": (
                        user.get("created_at").isoformat()
                        if user.get("created_at")
                        else None
                    ),
                    "last_login": (
                        user.get("last_login").isoformat()
                        if user.get("last_login")
                        else None
                    ),
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"取得個人資料失敗: {e}")
        return jsonify({"error": "取得資料失敗"}), 500


@app.route("/api/user/profile", methods=["PUT"])
@require_auth
@limiter.limit("10 per hour")
def update_profile():
    """
    更新用戶個人資料
    Request: { "name": "...", "email": "..." }
    Response: { "message": "資料已更新" }
    """
    if users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_fields = {}

        # 更新名稱
        if "name" in data:
            name = data["name"].strip()
            is_valid, message = auth.validate_name(name)
            if not is_valid:
                return jsonify({"error": message}), 400
            update_fields["name"] = name

        # 更新 email
        if "email" in data:
            email = data["email"].strip()
            is_valid, email_or_error = auth.validate_email_format(email)
            if not is_valid:
                return jsonify({"error": f"Email 格式錯誤：{email_or_error}"}), 400

            # 檢查新 email 是否已被其他用戶使用
            existing_user = users_collection.find_one(
                {"email": email_or_error, "_id": {"$ne": ObjectId(request.user_id)}}
            )
            if existing_user:
                return jsonify({"error": "此 Email 已被使用"}), 409

            update_fields["email"] = email_or_error

        if not update_fields:
            return jsonify({"error": "沒有要更新的資料"}), 400

        update_fields["updated_at"] = datetime.now()

        # 更新資料
        users_collection.update_one(
            {"_id": ObjectId(request.user_id)}, {"$set": update_fields}
        )

        logger.info(f"用戶更新資料: {request.email}")
        return jsonify({"message": "資料已更新"}), 200

    except Exception as e:
        logger.error(f"更新資料失敗: {e}")
        return jsonify({"error": "更新失敗"}), 500


@app.route("/api/user/change-password", methods=["POST"])
@require_auth
@limiter.limit("5 per hour")
def change_password():
    """
    修改密碼
    Request: { "old_password": "...", "new_password": "..." }
    Response: { "message": "密碼已更新" }
    """
    if users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        old_password = data.get("old_password", "")
        new_password = data.get("new_password", "")

        if not old_password or not new_password:
            return jsonify({"error": "舊密碼和新密碼不能為空"}), 400

        # 取得用戶
        user = users_collection.find_one({"_id": ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        # 驗證舊密碼
        if not auth.verify_password(old_password, user["password_hash"]):
            return jsonify({"error": "舊密碼錯誤"}), 401

        # 驗證新密碼強度（包含個人資訊檢查）
        is_valid, message = auth.validate_password_strength(
            new_password, email=user.get("email", ""), name=user.get("name", "")
        )
        if not is_valid:
            return jsonify({"error": message}), 400

        # 更新密碼
        new_password_hash = auth.hash_password(new_password)
        users_collection.update_one(
            {"_id": ObjectId(request.user_id)},
            {
                "$set": {
                    "password_hash": new_password_hash,
                    "updated_at": datetime.now(),
                }
            },
        )

        logger.info(f"用戶修改密碼: {request.email}")
        return jsonify({"message": "密碼已更新"}), 200

    except Exception as e:
        logger.error(f"修改密碼失敗: {e}")
        return jsonify({"error": "修改密碼失敗"}), 500


# ==================== 忘記密碼 ====================


def send_reset_email(to_email: str, reset_url: str) -> bool:
    """用 Gmail SMTP 寄送密碼重設信"""
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        logger.error("SMTP_USERNAME 或 SMTP_PASSWORD 未設定")
        return False
    try:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from email.utils import formataddr

        html_body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">密碼重設</h2>
            <p>我們收到了您的密碼重設請求。請點擊下方按鈕重設密碼：</p>
            <a href="{reset_url}"
               style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;
                      border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
                重設密碼
            </a>
            <p style="color:#6b7280;font-size:0.875rem;">
                此連結將在 1 小時後失效。若非您本人操作，請忽略此信件。
            </p>
        </div>
        """

        # 建立郵件訊息
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "記帳本 — 密碼重設"
        msg["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
        msg["To"] = to_email

        # 添加 HTML 內容
        html_part = MIMEText(html_body, "html", "utf-8")
        msg.attach(html_part)

        # 連接 SMTP 伺服器並發送郵件
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()  # 啟用 TLS 加密
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"郵件已成功發送至: {to_email}")
        return True
    except Exception as e:
        logger.error(f"Gmail SMTP 寄信失敗: {e}")
        return False


@app.route("/api/auth/forgot-password", methods=["POST"])
@limiter.limit("5 per hour")
def forgot_password():
    """忘記密碼：寄送重設連結"""
    try:
        if users_collection is None:
            return jsonify({"error": "資料庫未連線"}), 503

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "請提供 Email"}), 400

        email = data.get("email", "").strip().lower()
        if not email:
            return jsonify({"error": "請提供 Email"}), 400

        # 不論 email 是否存在都回傳相同訊息（防止用戶枚舉）
        user = users_collection.find_one({"email": email})
        if user:
            token = auth.generate_reset_token()
            from datetime import timedelta

            expires_at = datetime.now() + timedelta(hours=1)

            users_collection.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "password_reset_token": token,
                        "password_reset_expires": expires_at,
                    }
                },
            )

            # 取前端 URL 來組重設連結（自適應邏輯）
            # 1. 優先從請求的 Origin header 自動偵測
            origin = request.headers.get("Origin")
            if not origin:
                # Fallback: 從 Referer 提取（移除 query string 和結尾斜線）
                referer = request.headers.get("Referer", "")
                if referer:
                    # 提取 protocol://domain:port 部分
                    origin = referer.split("?")[0].rstrip("/")
                    # 移除路徑部分，只保留 origin
                    if "/" in origin.replace("https://", "").replace("http://", ""):
                        origin = "/".join(origin.split("/")[:3])

            # 2. 驗證 Origin 是否在白名單中（安全性檢查）
            frontend_url = None
            if origin and origin in FRONTEND_URLS:
                frontend_url = origin
                logger.info(f"使用請求來源作為重設連結: {origin}")

            # 3. Fallback: 使用 FRONTEND_URL 環境變數
            if not frontend_url:
                frontend_url = os.getenv("FRONTEND_URL")
                if frontend_url:
                    logger.info(f"使用 FRONTEND_URL 環境變數: {frontend_url}")

            # 4. 最終 Fallback: 使用 FRONTEND_URLS 第一個
            if not frontend_url:
                frontend_url = (
                    FRONTEND_URLS[0] if FRONTEND_URLS else "http://localhost:8080"
                )
                logger.info(f"使用預設前端網址: {frontend_url}")

            reset_url = f"{frontend_url}?reset_token={token}"

            # 檢查郵件是否成功發送
            email_sent = send_reset_email(email, reset_url)
            if not email_sent:
                logger.error(f"密碼重設信寄送失敗: {email}，請檢查 SMTP 配置是否正確")
                return (
                    jsonify({"error": "郵件服務未配置或發送失敗，請聯繫系統管理員"}),
                    500,
                )

            logger.info(f"密碼重設信已寄送: {email}")

        return jsonify({"message": "若此 Email 已註冊，重設連結已寄出"}), 200

    except Exception as e:
        logger.error(f"忘記密碼失敗: {e}")
        return jsonify({"error": "系統錯誤"}), 500


@app.route("/api/auth/reset-password", methods=["POST"])
@limiter.limit("10 per hour")
def reset_password():
    """用 token 重設密碼"""
    try:
        if users_collection is None:
            return jsonify({"error": "資料庫未連線"}), 503

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "請提供 token 和新密碼"}), 400

        token = data.get("token", "").strip()
        new_password = data.get("new_password", "")

        if not token or not new_password:
            return jsonify({"error": "請提供 token 和新密碼"}), 400

        user = users_collection.find_one({"password_reset_token": token})
        if not user:
            return jsonify({"error": "連結無效或已過期"}), 400

        expires = user.get("password_reset_expires")
        if not expires or datetime.now() > expires:
            return jsonify({"error": "連結已過期，請重新申請"}), 400

        is_valid, message = auth.validate_password_strength(
            new_password,
            email=user.get("email", ""),
            name=user.get("name", ""),
        )
        if not is_valid:
            return jsonify({"error": message}), 400

        new_hash = auth.hash_password(new_password)
        users_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {"password_hash": new_hash, "updated_at": datetime.now()},
                "$unset": {"password_reset_token": "", "password_reset_expires": ""},
            },
        )

        logger.info(f"用戶已重設密碼: {user.get('email')}")
        return jsonify({"message": "密碼已重設，請重新登入"}), 200

    except Exception as e:
        logger.error(f"重設密碼失敗: {e}")
        return jsonify({"error": "系統錯誤"}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    # 從環境變數讀取 debug 模式，預設為 False
    debug_mode = os.getenv("DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
