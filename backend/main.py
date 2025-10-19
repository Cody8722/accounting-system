from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pymongo import MongoClient
from bson import json_util, ObjectId
import json
import os
from dotenv import load_dotenv
from datetime import datetime

# 載入環境變數
load_dotenv()

app = Flask(__name__)
CORS(app)

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
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')

        # 記帳資料庫
        accounting_db = client['accounting_db']
        accounting_records_collection = accounting_db['records']
        accounting_budget_collection = accounting_db['budget']

        print("✅ 已連接到記帳資料庫")
    except Exception as e:
        print(f"❌ MongoDB 連線失敗: {e}")
        client = None
else:
    print("⚠️ 未設定 MONGO_URI，資料庫功能無法使用")

# ==================== 記帳 API ====================

@app.route('/admin/api/accounting/records', methods=['GET'])
@limiter.limit("100 per minute")
def get_accounting_records():
    """取得記帳記錄"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

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
            query['date'] = {'$gte': start_date, '$lte': end_date}
        if record_type:
            query['type'] = record_type
        if category:
            query['category'] = category

        # 查詢記錄，按日期降冪排序
        records = accounting_records_collection.find(query).sort('date', -1).limit(500)
        return json.loads(json_util.dumps(list(records))), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api/accounting/records', methods=['POST'])
@limiter.limit("50 per minute")
def add_accounting_record():
    """新增記帳記錄"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

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

        # 建立記錄
        record = {
            'type': data['type'],
            'amount': float(data['amount']),
            'category': data['category'],
            'date': data['date'],
            'description': data.get('description', ''),
            'is_recurring': data.get('is_recurring', False),
            'recurring_type': data.get('recurring_type'),
            'created_at': datetime.now()
        }

        result = accounting_records_collection.insert_one(record)
        return jsonify({
            "message": "記帳記錄已新增",
            "id": str(result.inserted_id)
        }), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api/accounting/records/<record_id>', methods=['PUT'])
@limiter.limit("50 per minute")
def update_accounting_record(record_id):
    """更新記帳記錄"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_data = {}
        if 'type' in data:
            update_data['type'] = data['type']
        if 'amount' in data:
            update_data['amount'] = float(data['amount'])
        if 'category' in data:
            update_data['category'] = data['category']
        if 'date' in data:
            update_data['date'] = data['date']
        if 'description' in data:
            update_data['description'] = data['description']
        if 'is_recurring' in data:
            update_data['is_recurring'] = data['is_recurring']
        if 'recurring_type' in data:
            update_data['recurring_type'] = data['recurring_type']

        update_data['updated_at'] = datetime.now()

        result = accounting_records_collection.update_one(
            {'_id': ObjectId(record_id)},
            {'$set': update_data}
        )

        if result.matched_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        return jsonify({"message": "記帳記錄已更新"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api/accounting/records/<record_id>', methods=['DELETE'])
@limiter.limit("50 per minute")
def delete_accounting_record(record_id):
    """刪除記帳記錄"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        result = accounting_records_collection.delete_one({'_id': ObjectId(record_id)})

        if result.deleted_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        return jsonify({"message": "記帳記錄已刪除"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api/accounting/stats', methods=['GET'])
@limiter.limit("100 per minute")
def get_accounting_stats():
    """取得記帳統計"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

    if accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        # 獲取日期範圍參數
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = {}
        if start_date and end_date:
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
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api/accounting/budget', methods=['GET'])
@limiter.limit("100 per minute")
def get_accounting_budget():
    """取得預算設定"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

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
        return jsonify({"error": str(e)}), 500

@app.route('/admin/api/accounting/budget', methods=['POST'])
@limiter.limit("50 per minute")
def set_accounting_budget():
    """設定預算"""
    secret = request.headers.get('X-Admin-Secret')
    if not secret or secret != ADMIN_SECRET:
        return jsonify({"error": "未授權"}), 403

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

        return jsonify({"message": "預算已儲存"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==================== 系統狀態 ====================

@app.route('/status', methods=['GET'])
def status():
    """系統狀態檢查"""
    db_connected = client is not None

    return jsonify({
        'status': 'ok',
        'db_status': 'connected' if db_connected else 'disconnected',
        'message': '記帳系統運作正常' if db_connected else '資料庫未連線'
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
