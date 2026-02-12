from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pymongo import MongoClient, ASCENDING
from bson import json_util, ObjectId
from bson.errors import InvalidId
from functools import wraps
from typing import Tuple, Dict, Any, Optional
import json
import os
from dotenv import load_dotenv
from datetime import datetime
import logging
import re

# 導入認證模組
import auth

# 載入環境變數
load_dotenv()

# 設定 logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 常數定義
MAX_AMOUNT = 9999999.99
MAX_RECORDS_LIMIT = 500
SERVER_SELECTION_TIMEOUT_MS = 5000

app = Flask(__name__)

# 設定最大請求大小 (16MB)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# CORS 設定 - 限制來源
FRONTEND_URLS = os.getenv('FRONTEND_URLS', 'http://localhost:8080,https://accounting-system.zeabur.app').split(',')
CORS(app, origins=FRONTEND_URLS)

# 安全 headers
@app.after_request
def add_security_headers(response):
    """添加安全相關的 HTTP headers"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

# 速率限制
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# 環境變數
MONGO_URI = os.getenv('MONGO_URI')
ADMIN_SECRET = os.getenv('ADMIN_SECRET')

# MongoDB 連線
client = None
accounting_records_collection = None
accounting_budget_collection = None
users_collection = None  # 新增：用戶集合

if MONGO_URI:
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS)
        client.admin.command('ping')

        # 記帳資料庫
        accounting_db = client['accounting_db']
        accounting_records_collection = accounting_db['records']
        accounting_budget_collection = accounting_db['budget']
        users_collection = accounting_db['users']  # 新增：用戶集合

        # 建立索引以優化查詢效能
        try:
            # 記帳記錄索引
            accounting_records_collection.create_index([('date', ASCENDING)])
            accounting_records_collection.create_index([('type', ASCENDING)])
            accounting_records_collection.create_index([('category', ASCENDING)])
            accounting_records_collection.create_index([('user_id', ASCENDING)])  # 新增：用戶索引
            accounting_records_collection.create_index([('user_id', ASCENDING), ('date', ASCENDING)])  # 新增：複合索引

            # 預算索引（更新為複合唯一索引）
            try:
                accounting_budget_collection.drop_index('month_1')  # 刪除舊的唯一索引
            except:
                pass
            accounting_budget_collection.create_index([('user_id', ASCENDING), ('month', ASCENDING)], unique=True)

            # 用戶索引
            users_collection.create_index([('email', ASCENDING)], unique=True)
            users_collection.create_index([('password_reset_token', ASCENDING)])

            logger.info("✅ 資料庫索引已建立")
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
    認證裝飾器：驗證 JWT token 或 X-Admin-Secret header（向後兼容）

    優先順序：
    1. 檢查 Authorization: Bearer <token> (JWT)
    2. 檢查 X-Admin-Secret (舊版認證，向後兼容)

    JWT 驗證成功後會在 request 中注入 user_id 和 email
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 方法 1: JWT 認證 (優先)
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            payload = auth.verify_jwt(token)

            if payload:
                # JWT 驗證成功，注入用戶資訊到 request
                request.user_id = payload.get('user_id')
                request.email = payload.get('email')
                request.name = payload.get('name', '')
                return f(*args, **kwargs)
            else:
                return jsonify({"error": "Token 無效或已過期"}), 401

        # 方法 2: 舊版 ADMIN_SECRET 認證 (向後兼容)
        admin_secret = request.headers.get('X-Admin-Secret')
        if admin_secret and ADMIN_SECRET and admin_secret == ADMIN_SECRET:
            # 舊版認證成功，設定為管理員模式
            request.user_id = None  # None 表示管理員（可訪問所有數據）
            request.email = 'admin'
            request.name = 'Administrator'
            return f(*args, **kwargs)

        # 兩種方法都失敗
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

    pattern = r'^\d{4}-\d{2}-\d{2}$'
    if not re.match(pattern, date_string):
        return False, "日期格式必須為 YYYY-MM-DD"

    try:
        datetime.strptime(date_string, '%Y-%m-%d')
        return True, date_string
    except ValueError:
        return False, "無效的日期"

def validate_expense_type(expense_type: Optional[str]) -> Tuple[bool, Optional[str]]:
    """驗證支出類型"""
    valid_types = ['fixed', 'variable', 'onetime']
    if expense_type and expense_type not in valid_types:
        return False, f"支出類型必須為: {', '.join(valid_types)}"
    return True, expense_type

def validate_record_type(record_type: str) -> Tuple[bool, str]:
    """驗證記錄類型"""
    valid_types = ['income', 'expense']
    if record_type not in valid_types:
        return False, f"記錄類型必須為: {', '.join(valid_types)}"
    return True, record_type

# ==================== 記帳 API ====================

@app.route('/admin/api/accounting/records', methods=['GET'])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_records():
    """取得記帳記錄"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取查詢參數
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        record_type = request.args.get('type')
        category = request.args.get('category')

        # 建立查詢條件
        query = {}

        # 用戶數據隔離：JWT 用戶只能查看自己的數據，管理員可查看所有數據
        if request.user_id:
            query['user_id'] = ObjectId(request.user_id)

        if start_date and end_date:
            # 驗證日期格式
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query['date'] = {'$gte': start_date, '$lte': end_date}

        if record_type:
            valid, _ = validate_record_type(record_type)
            if valid:
                query['type'] = record_type

        if category:
            query['category'] = category

        # 查詢記錄，按日期降冪排序
        records = accounting_records_collection.find(query).sort('date', -1).limit(MAX_RECORDS_LIMIT)
        return json.loads(json_util.dumps(list(records))), 200
    except Exception as e:
        logger.error(f"查詢記帳記錄失敗: {e}")
        return jsonify({"error": "查詢記錄失敗"}), 500

@app.route('/admin/api/accounting/records', methods=['POST'])
@limiter.limit("50 per minute")
@require_auth
def add_accounting_record():
    """新增記帳記錄"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        # 驗證必要欄位
        required_fields = ['type', 'amount', 'category', 'date']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"缺少必要欄位: {field}"}), 400

        # 驗證記錄類型
        valid, msg = validate_record_type(data['type'])
        if not valid:
            return jsonify({"error": msg}), 400

        # 驗證金額
        valid, result = validate_amount(data['amount'])
        if not valid:
            return jsonify({"error": result}), 400
        amount = result

        # 驗證日期
        valid, result = validate_date(data['date'])
        if not valid:
            return jsonify({"error": result}), 400

        # 驗證支出類型（新格式）或重複類型（舊格式，向後相容）
        expense_type = data.get('expense_type')
        if expense_type:
            valid, msg = validate_expense_type(expense_type)
            if not valid:
                return jsonify({"error": msg}), 400

        # 建立記錄
        record = {
            'type': data['type'],
            'amount': amount,
            'category': data['category'],
            'date': data['date'],
            'description': data.get('description', ''),
            'expense_type': expense_type,  # 新欄位
            'created_at': datetime.now()
        }

        # 用戶數據隔離：JWT 用戶記錄添加 user_id
        if request.user_id:
            record['user_id'] = ObjectId(request.user_id)

        result = accounting_records_collection.insert_one(record)
        logger.info(f"新增記帳記錄: {result.inserted_id} (user: {request.email})")
        return jsonify({
            "message": "記帳記錄已新增",
            "id": str(result.inserted_id)
        }), 201
    except Exception as e:
        logger.error(f"新增記帳記錄失敗: {e}")
        return jsonify({"error": "新增記錄失敗"}), 500

@app.route('/admin/api/accounting/records/<record_id>', methods=['PUT'])
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
        # 用戶數據隔離：驗證記錄所有權
        query = {'_id': ObjectId(record_id)}
        if request.user_id:
            query['user_id'] = ObjectId(request.user_id)

        # 先檢查記錄是否存在且屬於當前用戶
        existing_record = accounting_records_collection.find_one(query)
        if not existing_record:
            return jsonify({"error": "找不到該記錄或無權限修改"}), 404

        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_data = {}

        # 驗證類型
        if 'type' in data:
            valid, msg = validate_record_type(data['type'])
            if not valid:
                return jsonify({"error": msg}), 400
            update_data['type'] = data['type']

        # 驗證金額
        if 'amount' in data:
            valid, result = validate_amount(data['amount'])
            if not valid:
                return jsonify({"error": result}), 400
            update_data['amount'] = result

        if 'category' in data:
            update_data['category'] = data['category']

        # 驗證日期
        if 'date' in data:
            valid, result = validate_date(data['date'])
            if not valid:
                return jsonify({"error": result}), 400
            update_data['date'] = data['date']

        if 'description' in data:
            update_data['description'] = data['description']

        # 驗證支出類型
        if 'expense_type' in data:
            if data['expense_type']:  # 如果不是空值才驗證
                valid, msg = validate_expense_type(data['expense_type'])
                if not valid:
                    return jsonify({"error": msg}), 400
            update_data['expense_type'] = data['expense_type']

        update_data['updated_at'] = datetime.now()

        result = accounting_records_collection.update_one(
            query,
            {'$set': update_data}
        )

        if result.matched_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        logger.info(f"更新記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已更新"}), 200
    except Exception as e:
        logger.error(f"更新記帳記錄失敗: {e}")
        return jsonify({"error": "更新記錄失敗"}), 500

@app.route('/admin/api/accounting/records/<record_id>', methods=['DELETE'])
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
        # 用戶數據隔離：驗證記錄所有權
        query = {'_id': ObjectId(record_id)}
        if request.user_id:
            query['user_id'] = ObjectId(request.user_id)

        result = accounting_records_collection.delete_one(query)

        if result.deleted_count == 0:
            return jsonify({"error": "找不到該記錄或無權限刪除"}), 404

        logger.info(f"刪除記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已刪除"}), 200
    except Exception as e:
        logger.error(f"刪除記帳記錄失敗: {e}")
        return jsonify({"error": "刪除記錄失敗"}), 500

@app.route('/admin/api/accounting/stats', methods=['GET'])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_stats():
    """取得記帳統計"""
    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取日期範圍參數
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = {}

        # 用戶數據隔離：JWT 用戶只能查看自己的統計
        if request.user_id:
            query['user_id'] = ObjectId(request.user_id)

        if start_date and end_date:
            # 驗證日期格式
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query['date'] = {'$gte': start_date, '$lte': end_date}

        # 計算總收入和總支出
        income_pipeline = [
            {'$match': {**query, 'type': 'income'}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]
        expense_pipeline = [
            {'$match': {**query, 'type': 'expense'}},
            {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
        ]

        income_result = list(accounting_records_collection.aggregate(income_pipeline))
        expense_result = list(accounting_records_collection.aggregate(expense_pipeline))

        total_income = income_result[0]['total'] if income_result else 0
        total_expense = expense_result[0]['total'] if expense_result else 0

        # 按分類統計支出
        category_pipeline = [
            {'$match': {**query, 'type': 'expense'}},
            {'$group': {'_id': '$category', 'total': {'$sum': '$amount'}}},
            {'$sort': {'total': -1}}
        ]
        category_stats = list(accounting_records_collection.aggregate(category_pipeline))

        return jsonify({
            'total_income': total_income,
            'total_expense': total_expense,
            'balance': total_income - total_expense,
            'category_stats': category_stats
        }), 200
    except Exception as e:
        logger.error(f"取得統計資料失敗: {e}")
        return jsonify({"error": "取得統計資料失敗"}), 500

@app.route('/admin/api/accounting/budget', methods=['GET'])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_budget():
    """取得預算設定"""
    if accounting_budget_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取當前月份的預算
        current_month = datetime.now().strftime('%Y-%m')
        query = {'month': current_month}

        # 用戶數據隔離：JWT 用戶只能查看自己的預算
        if request.user_id:
            query['user_id'] = ObjectId(request.user_id)

        budget_doc = accounting_budget_collection.find_one(query)

        return jsonify({
            'month': current_month,
            'budget': budget_doc.get('budget', {}) if budget_doc else {}
        }), 200
    except Exception as e:
        logger.error(f"取得預算失敗: {e}")
        return jsonify({"error": "取得預算失敗"}), 500

@app.route('/admin/api/accounting/budget', methods=['POST'])
@limiter.limit("50 per minute")
@require_auth
def set_accounting_budget():
    """設定預算"""
    if accounting_budget_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json()
        if not data or 'budget' not in data:
            return jsonify({"error": "無效的請求資料"}), 400

        current_month = datetime.now().strftime('%Y-%m')

        # 建立查詢條件（用於 upsert）
        query = {'month': current_month}

        # 建立更新資料
        update_data = {
            'budget': data['budget'],
            'updated_at': datetime.now()
        }

        # 用戶數據隔離：JWT 用戶設定自己的預算
        if request.user_id:
            query['user_id'] = ObjectId(request.user_id)
            update_data['user_id'] = ObjectId(request.user_id)

        # 更新或新增預算
        accounting_budget_collection.update_one(
            query,
            {'$set': update_data},
            upsert=True
        )

        logger.info(f"儲存預算設定: {current_month} (user: {request.email})")
        return jsonify({"message": "預算已儲存"}), 200
    except Exception as e:
        logger.error(f"儲存預算失敗: {e}")
        return jsonify({"error": "儲存預算失敗"}), 500

# ==================== 系統狀態 ====================

@app.route('/status', methods=['GET'])
@limiter.limit("10 per minute")
@require_auth
def status():
    """系統狀態檢查（需要驗證）"""
    db_connected = client is not None

    return jsonify({
        'status': 'ok',
        'db_status': 'connected' if db_connected else 'disconnected',
        'message': '記帳系統運作正常' if db_connected else '資料庫未連線'
    }), 200

# ==================== 用戶認證 API ====================

@app.route('/api/auth/register', methods=['POST'])
@limiter.limit("5 per hour")
def register():
    """
    用戶註冊
    Request: { "email": "...", "password": "...", "name": "..." }
    Response: { "message": "註冊成功", "user_id": "..." }
    """
    if not users_collection:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        email = data.get('email', '').strip()
        password = data.get('password', '')
        name = data.get('name', '').strip()

        # 驗證 email 格式
        is_valid_email, email_or_error = auth.validate_email_format(email)
        if not is_valid_email:
            return jsonify({"error": f"Email 格式錯誤：{email_or_error}"}), 400

        email = email_or_error  # 使用規範化後的 email

        # 驗證密碼強度
        is_valid_password, password_message = auth.validate_password_strength(password)
        if not is_valid_password:
            return jsonify({"error": password_message}), 400

        # 驗證名稱
        is_valid_name, name_message = auth.validate_name(name)
        if not is_valid_name:
            return jsonify({"error": name_message}), 400

        # 檢查 email 是否已存在
        existing_user = users_collection.find_one({'email': email})
        if existing_user:
            return jsonify({"error": "此 Email 已被註冊"}), 409

        # 加密密碼
        password_hash = auth.hash_password(password)

        # 創建用戶
        user = {
            'email': email,
            'password_hash': password_hash,
            'name': name,
            'created_at': datetime.now(),
            'last_login': None,
            'is_active': True,
            'email_verified': False  # 可選：Email 驗證功能
        }

        result = users_collection.insert_one(user)
        user_id = str(result.inserted_id)

        logger.info(f"新用戶註冊: {email}")
        return jsonify({
            "message": "註冊成功",
            "user_id": user_id
        }), 201

    except Exception as e:
        logger.error(f"註冊失敗: {e}")
        return jsonify({"error": "註冊失敗，請稍後再試"}), 500


@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("10 per hour")
@limiter.limit("3 per minute")
def login():
    """
    用戶登入
    Request: { "email": "...", "password": "..." }
    Response: { "token": "jwt_token...", "user": { "id": "...", "email": "...", "name": "..." } }
    """
    if not users_collection:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        email = data.get('email', '').strip().lower()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"error": "Email 和密碼不能為空"}), 400

        # 查找用戶
        user = users_collection.find_one({'email': email})
        if not user:
            return jsonify({"error": "Email 或密碼錯誤"}), 401

        # 檢查帳號是否啟用
        if not user.get('is_active', True):
            return jsonify({"error": "帳號已被停用"}), 403

        # 驗證密碼
        if not auth.verify_password(password, user['password_hash']):
            return jsonify({"error": "Email 或密碼錯誤"}), 401

        # 更新最後登入時間
        users_collection.update_one(
            {'_id': user['_id']},
            {'$set': {'last_login': datetime.now()}}
        )

        # 生成 JWT token
        token = auth.generate_jwt(
            user_id=str(user['_id']),
            email=user['email'],
            name=user.get('name', '')
        )

        logger.info(f"用戶登入: {email}")
        return jsonify({
            "token": token,
            "user": {
                "id": str(user['_id']),
                "email": user['email'],
                "name": user.get('name', ''),
                "created_at": user.get('created_at').isoformat() if user.get('created_at') else None
            }
        }), 200

    except Exception as e:
        logger.error(f"登入失敗: {e}")
        return jsonify({"error": "登入失敗，請稍後再試"}), 500


@app.route('/api/auth/verify', methods=['GET'])
@require_auth
def verify_token():
    """
    驗證 token 有效性
    Response: { "valid": true, "user": {...} }
    """
    if not users_collection:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        # request.user_id 由 require_auth 裝飾器注入
        if not request.user_id:
            # 舊版 ADMIN_SECRET 認證
            return jsonify({
                "valid": True,
                "user": {
                    "id": "admin",
                    "email": "admin",
                    "name": "Administrator"
                }
            }), 200

        user = users_collection.find_one({'_id': ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        return jsonify({
            "valid": True,
            "user": {
                "id": str(user['_id']),
                "email": user['email'],
                "name": user.get('name', '')
            }
        }), 200

    except Exception as e:
        logger.error(f"驗證 token 失敗: {e}")
        return jsonify({"error": "驗證失敗"}), 500


@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    """
    登出（前端清除 token，後端記錄）
    Response: { "message": "已登出" }
    """
    logger.info(f"用戶登出: {request.email}")
    return jsonify({"message": "已登出"}), 200


@app.route('/api/user/profile', methods=['GET'])
@require_auth
def get_profile():
    """
    取得用戶個人資料
    Response: { "id": "...", "email": "...", "name": "...", "created_at": "..." }
    """
    if not users_collection:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        if not request.user_id:
            return jsonify({"error": "管理員模式無個人資料"}), 400

        user = users_collection.find_one({'_id': ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        return jsonify({
            "id": str(user['_id']),
            "email": user['email'],
            "name": user.get('name', ''),
            "created_at": user.get('created_at').isoformat() if user.get('created_at') else None,
            "last_login": user.get('last_login').isoformat() if user.get('last_login') else None
        }), 200

    except Exception as e:
        logger.error(f"取得個人資料失敗: {e}")
        return jsonify({"error": "取得資料失敗"}), 500


@app.route('/api/user/profile', methods=['PUT'])
@require_auth
@limiter.limit("10 per hour")
def update_profile():
    """
    更新用戶個人資料
    Request: { "name": "...", "email": "..." }
    Response: { "message": "資料已更新" }
    """
    if not users_collection:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        if not request.user_id:
            return jsonify({"error": "管理員模式無法更新資料"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_fields = {}

        # 更新名稱
        if 'name' in data:
            name = data['name'].strip()
            is_valid, message = auth.validate_name(name)
            if not is_valid:
                return jsonify({"error": message}), 400
            update_fields['name'] = name

        # 更新 email
        if 'email' in data:
            email = data['email'].strip()
            is_valid, email_or_error = auth.validate_email_format(email)
            if not is_valid:
                return jsonify({"error": f"Email 格式錯誤：{email_or_error}"}), 400

            # 檢查新 email 是否已被其他用戶使用
            existing_user = users_collection.find_one({
                'email': email_or_error,
                '_id': {'$ne': ObjectId(request.user_id)}
            })
            if existing_user:
                return jsonify({"error": "此 Email 已被使用"}), 409

            update_fields['email'] = email_or_error

        if not update_fields:
            return jsonify({"error": "沒有要更新的資料"}), 400

        update_fields['updated_at'] = datetime.now()

        # 更新資料
        users_collection.update_one(
            {'_id': ObjectId(request.user_id)},
            {'$set': update_fields}
        )

        logger.info(f"用戶更新資料: {request.email}")
        return jsonify({"message": "資料已更新"}), 200

    except Exception as e:
        logger.error(f"更新資料失敗: {e}")
        return jsonify({"error": "更新失敗"}), 500


@app.route('/api/user/change-password', methods=['POST'])
@require_auth
@limiter.limit("5 per hour")
def change_password():
    """
    修改密碼
    Request: { "old_password": "...", "new_password": "..." }
    Response: { "message": "密碼已更新" }
    """
    if not users_collection:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        if not request.user_id:
            return jsonify({"error": "管理員模式無法修改密碼"}), 400

        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        old_password = data.get('old_password', '')
        new_password = data.get('new_password', '')

        if not old_password or not new_password:
            return jsonify({"error": "舊密碼和新密碼不能為空"}), 400

        # 取得用戶
        user = users_collection.find_one({'_id': ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        # 驗證舊密碼
        if not auth.verify_password(old_password, user['password_hash']):
            return jsonify({"error": "舊密碼錯誤"}), 401

        # 驗證新密碼強度
        is_valid, message = auth.validate_password_strength(new_password)
        if not is_valid:
            return jsonify({"error": message}), 400

        # 更新密碼
        new_password_hash = auth.hash_password(new_password)
        users_collection.update_one(
            {'_id': ObjectId(request.user_id)},
            {'$set': {
                'password_hash': new_password_hash,
                'updated_at': datetime.now()
            }}
        )

        logger.info(f"用戶修改密碼: {request.email}")
        return jsonify({"message": "密碼已更新"}), 200

    except Exception as e:
        logger.error(f"修改密碼失敗: {e}")
        return jsonify({"error": "修改密碼失敗"}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    # 從環境變數讀取 debug 模式，預設為 False
    debug_mode = os.getenv('DEBUG', 'False').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
