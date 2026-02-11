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

if MONGO_URI:
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS)
        client.admin.command('ping')

        # 記帳資料庫
        accounting_db = client['accounting_db']
        accounting_records_collection = accounting_db['records']
        accounting_budget_collection = accounting_db['budget']

        # 建立索引以優化查詢效能
        try:
            accounting_records_collection.create_index([('date', ASCENDING)])
            accounting_records_collection.create_index([('type', ASCENDING)])
            accounting_records_collection.create_index([('category', ASCENDING)])
            accounting_budget_collection.create_index([('month', ASCENDING)], unique=True)
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
    認證裝飾器：驗證 X-Admin-Secret header
    避免在每個路由中重複認證邏輯
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        secret = request.headers.get('X-Admin-Secret')
        if not secret or secret != ADMIN_SECRET:
            return jsonify({"error": "未授權"}), 403
        return f(*args, **kwargs)
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

        result = accounting_records_collection.insert_one(record)
        logger.info(f"新增記帳記錄: {result.inserted_id}")
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
            {'_id': ObjectId(record_id)},
            {'$set': update_data}
        )

        if result.matched_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        logger.info(f"更新記帳記錄: {record_id}")
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
        result = accounting_records_collection.delete_one({'_id': ObjectId(record_id)})

        if result.deleted_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        logger.info(f"刪除記帳記錄: {record_id}")
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
        budget_doc = accounting_budget_collection.find_one({'month': current_month})

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

        # 更新或新增預算
        accounting_budget_collection.update_one(
            {'month': current_month},
            {
                '$set': {
                    'budget': data['budget'],
                    'updated_at': datetime.now()
                }
            },
            upsert=True
        )

        logger.info(f"儲存預算設定: {current_month}")
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

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    # 從環境變數讀取 debug 模式，預設為 False
    debug_mode = os.getenv('DEBUG', 'False').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
