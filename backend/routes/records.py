"""
routes/records.py — 記帳記錄 CRUD API

GET    /admin/api/accounting/records               取得記帳記錄（分頁、篩選）
GET    /admin/api/accounting/records/<id>          取得單筆記錄
POST   /admin/api/accounting/records               新增記錄
PUT    /admin/api/accounting/records/<id>          更新記錄
DELETE /admin/api/accounting/records/<id>          刪除記錄
"""

import json
import logging
import math
import re
from datetime import datetime

from bson import ObjectId, json_util
from flask import Blueprint, jsonify, request
from pymongo import ASCENDING, DESCENDING

import db
from extensions import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    _cache_invalidate_user,
    limiter,
    require_auth,
    validate_amount,
    validate_category,
    validate_date,
    validate_description,
    validate_expense_type,
    validate_objectid,
    validate_record_type,
)

logger = logging.getLogger(__name__)

bp = Blueprint("records", __name__)


@bp.route("/admin/api/accounting/records", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_records():
    """取得記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        try:
            page = max(1, int(request.args.get("page", 1)))
            limit = min(
                MAX_PAGE_SIZE,
                max(1, int(request.args.get("limit", DEFAULT_PAGE_SIZE))),
            )
        except (ValueError, TypeError):
            return jsonify({"error": "page 和 limit 必須為正整數"}), 400

        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        record_type = request.args.get("type")
        category = request.args.get("category")
        search = request.args.get("search", "").strip()
        sort_by = request.args.get("sort_by", "date")
        sort_order = request.args.get("sort_order", "desc")

        query = {"user_id": ObjectId(request.user_id)}

        if start_date and end_date:
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

        if search:
            query["description"] = {"$regex": re.escape(search), "$options": "i"}

        sort_field = "amount" if sort_by == "amount" else "date"
        sort_dir = ASCENDING if sort_order == "asc" else DESCENDING

        total = db.accounting_records_collection.count_documents(query)
        total_pages = math.ceil(total / limit) if total > 0 else 1

        records = list(
            db.accounting_records_collection.find(query)
            .sort(sort_field, sort_dir)
            .skip((page - 1) * limit)
            .limit(limit)
        )

        return (
            json.loads(
                json_util.dumps(
                    {
                        "records": records,
                        "total": total,
                        "page": page,
                        "limit": limit,
                        "total_pages": total_pages,
                    }
                )
            ),
            200,
        )
    except Exception as e:
        logger.error(f"查詢記帳記錄失敗: {e}")
        return jsonify({"error": "查詢記錄失敗"}), 500


@bp.route("/admin/api/accounting/records/<record_id>", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_single_accounting_record(record_id):
    """取得單筆記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }
        record = db.accounting_records_collection.find_one(query)
        if not record:
            return jsonify({"error": "找不到該記錄或無權限存取"}), 404

        return json.loads(json_util.dumps(record)), 200
    except Exception as e:
        logger.error(f"取得單筆記帳記錄失敗: {e}")
        return jsonify({"error": "取得記錄失敗"}), 500


@bp.route("/admin/api/accounting/records", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def add_accounting_record():
    """新增記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        required_fields = ["type", "amount", "category", "date"]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"缺少必要欄位: {field}"}), 400

        valid, msg = validate_record_type(data["type"])
        if not valid:
            return jsonify({"error": msg}), 400

        valid, result = validate_amount(data["amount"])
        if not valid:
            return jsonify({"error": result}), 400
        amount = result

        valid, result = validate_date(data["date"])
        if not valid:
            return jsonify({"error": result}), 400

        valid, category = validate_category(data["category"])
        if not valid:
            return jsonify({"error": category}), 400

        description = data.get("description", "")
        valid, description = validate_description(description)
        if not valid:
            return jsonify({"error": description}), 400

        expense_type = data.get("expense_type")
        if expense_type:
            valid, msg = validate_expense_type(expense_type)
            if not valid:
                return jsonify({"error": msg}), 400

        record = {
            "type": data["type"],
            "amount": amount,
            "category": category,
            "date": data["date"],
            "description": description,
            "expense_type": expense_type,
            "created_at": datetime.now(),
            "user_id": ObjectId(request.user_id),
        }

        result = db.accounting_records_collection.insert_one(record)
        _cache_invalidate_user(request.user_id)
        logger.info(f"新增記帳記錄: {result.inserted_id} (user: {request.email})")
        return (
            jsonify({"message": "記帳記錄已新增", "id": str(result.inserted_id)}),
            201,
        )
    except Exception as e:
        logger.error(f"新增記帳記錄失敗: {e}")
        return jsonify({"error": "新增記錄失敗"}), 500


@bp.route("/admin/api/accounting/records/<record_id>", methods=["PUT"])
@limiter.limit("50 per minute")
@require_auth
def update_accounting_record(record_id):
    """更新記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }

        existing_record = db.accounting_records_collection.find_one(query)
        if not existing_record:
            return jsonify({"error": "找不到該記錄或無權限修改"}), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_data = {}

        if "type" in data:
            valid, msg = validate_record_type(data["type"])
            if not valid:
                return jsonify({"error": msg}), 400
            update_data["type"] = data["type"]

        if "amount" in data:
            valid, result = validate_amount(data["amount"])
            if not valid:
                return jsonify({"error": result}), 400
            update_data["amount"] = result

        if "category" in data:
            valid, category = validate_category(data["category"])
            if not valid:
                return jsonify({"error": category}), 400
            update_data["category"] = category

        if "date" in data:
            valid, result = validate_date(data["date"])
            if not valid:
                return jsonify({"error": result}), 400
            update_data["date"] = data["date"]

        if "description" in data:
            valid, description = validate_description(data["description"])
            if not valid:
                return jsonify({"error": description}), 400
            update_data["description"] = description

        if "expense_type" in data:
            if data["expense_type"]:
                valid, msg = validate_expense_type(data["expense_type"])
                if not valid:
                    return jsonify({"error": msg}), 400
            update_data["expense_type"] = data["expense_type"]

        update_data["updated_at"] = datetime.now()

        result = db.accounting_records_collection.update_one(
            query, {"$set": update_data}
        )

        if result.matched_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        _cache_invalidate_user(request.user_id)
        logger.info(f"更新記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已更新"}), 200
    except Exception as e:
        logger.error(f"更新記帳記錄失敗: {e}")
        return jsonify({"error": "更新記錄失敗"}), 500


@bp.route("/admin/api/accounting/records/<record_id>", methods=["DELETE"])
@limiter.limit("50 per minute")
@require_auth
def delete_accounting_record(record_id):
    """刪除記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }

        result = db.accounting_records_collection.delete_one(query)

        if result.deleted_count == 0:
            return jsonify({"error": "找不到該記錄或無權限刪除"}), 404

        _cache_invalidate_user(request.user_id)
        logger.info(f"刪除記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已刪除"}), 200
    except Exception as e:
        logger.error(f"刪除記帳記錄失敗: {e}")
        return jsonify({"error": "刪除記錄失敗"}), 500
