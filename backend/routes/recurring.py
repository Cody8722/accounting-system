"""
routes/recurring.py — 定期收支 API

GET    /admin/api/recurring               取得所有定期收支
POST   /admin/api/recurring               新增定期收支
DELETE /admin/api/recurring/<item_id>     刪除定期收支
PUT    /admin/api/recurring/<item_id>     更新定期收支
POST   /admin/api/recurring/<item_id>/apply  套用為實際記帳記錄
"""

import logging
from calendar import monthrange
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request

import db
from extensions import limiter, require_auth

logger = logging.getLogger(__name__)

bp = Blueprint("recurring", __name__)


def _validate_recurring_data(data):
    """驗證定期收支資料。
    回傳 (parsed_fields, None) 成功，或 (None, (response, status)) 失敗。
    """
    name = str(data.get("name", "")).strip()
    if not name or len(name) > 50:
        return None, (jsonify({"error": "名稱無效（1-50 字元）"}), 400)

    try:
        amount = float(data["amount"])
        if amount <= 0:
            raise ValueError
    except (KeyError, ValueError, TypeError):
        return None, (jsonify({"error": "金額必須為正數"}), 400)

    type_ = data.get("type", "expense")
    if type_ not in ("income", "expense"):
        return None, (jsonify({"error": "類型必須為 income 或 expense"}), 400)

    try:
        day = int(data.get("day_of_month", 1))
        if not 1 <= day <= 31:
            raise ValueError
    except (ValueError, TypeError):
        return None, (jsonify({"error": "每月日期必須為 1-31"}), 400)

    category = str(data.get("category", "其他")).strip() or "其他"
    if len(category) > 30:
        return None, (jsonify({"error": "分類名稱過長"}), 400)

    description = str(data.get("description", "")).strip()[:200]

    return {
        "name": name,
        "amount": round(amount, 2),
        "type": type_,
        "category": category,
        "day_of_month": day,
        "description": description,
    }, None


@bp.route("/admin/api/recurring", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_recurring():
    """取得所有定期支出項目"""
    if db.recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        items = list(
            db.recurring_collection.find({"user_id": user_oid}).sort("day_of_month", 1)
        )
        for item in items:
            item["_id"] = str(item["_id"])
            item["user_id"] = str(item["user_id"])
            if "created_at" in item:
                item["created_at"] = item["created_at"].isoformat()
        return jsonify(items), 200
    except Exception as e:
        logger.error(f"取得定期支出失敗: {e}")
        return jsonify({"error": "取得定期支出失敗"}), 500


@bp.route("/admin/api/recurring", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def create_recurring():
    """新增定期支出項目"""
    if db.recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        data = request.json or {}
        fields, err = _validate_recurring_data(data)
        if err:
            return err

        doc = {
            "user_id": ObjectId(request.user_id),
            "name": fields["name"],
            "amount": fields["amount"],
            "type": fields["type"],
            "category": fields["category"],
            "day_of_month": fields["day_of_month"],
            "description": fields["description"],
            "created_at": datetime.now(),
        }
        result = db.recurring_collection.insert_one(doc)
        logger.info(
            f"新增定期支出: {fields['name']} ${fields['amount']}"
            f" (user: {request.email})"
        )
        return jsonify({"id": str(result.inserted_id), "message": "新增成功"}), 201

    except Exception as e:
        logger.error(f"新增定期支出失敗: {e}")
        return jsonify({"error": "新增失敗"}), 500


@bp.route("/admin/api/recurring/<item_id>", methods=["DELETE"])
@limiter.limit("30 per minute")
@require_auth
def delete_recurring(item_id):
    """刪除定期支出項目"""
    if db.recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        oid = ObjectId(item_id)
    except Exception:
        return jsonify({"error": "無效的 ID"}), 400
    try:
        result = db.recurring_collection.delete_one(
            {"_id": oid, "user_id": ObjectId(request.user_id)}
        )
        if result.deleted_count == 0:
            return jsonify({"error": "找不到項目"}), 404
        logger.info(f"刪除定期支出 {item_id} (user: {request.email})")
        return jsonify({"message": "刪除成功"}), 200
    except Exception as e:
        logger.error(f"刪除定期支出失敗: {e}")
        return jsonify({"error": "刪除失敗"}), 500


@bp.route("/admin/api/recurring/<item_id>", methods=["PUT"])
@limiter.limit("30 per minute")
@require_auth
def update_recurring(item_id):
    """更新定期收支項目"""
    if db.recurring_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        oid = ObjectId(item_id)
    except Exception:
        return jsonify({"error": "無效的 ID"}), 400
    try:
        data = request.json or {}
        fields, err = _validate_recurring_data(data)
        if err:
            return err

        result = db.recurring_collection.update_one(
            {"_id": oid, "user_id": ObjectId(request.user_id)},
            {
                "$set": {
                    "name": fields["name"],
                    "amount": fields["amount"],
                    "type": fields["type"],
                    "category": fields["category"],
                    "day_of_month": fields["day_of_month"],
                    "description": fields["description"],
                }
            },
        )
        if result.matched_count == 0:
            return jsonify({"error": "找不到項目"}), 404
        logger.info(
            f"更新定期收支 {item_id} → {fields['name']} (user: {request.email})"
        )
        return jsonify({"message": "更新成功"}), 200

    except Exception as e:
        logger.error(f"更新定期收支失敗: {e}")
        return jsonify({"error": "更新失敗"}), 500


@bp.route("/admin/api/recurring/<item_id>/apply", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def apply_recurring(item_id):
    """將定期支出套用為一筆實際記帳記錄"""
    if db.recurring_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        oid = ObjectId(item_id)
    except Exception:
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        item = db.recurring_collection.find_one({"_id": oid, "user_id": user_oid})
        if not item:
            return jsonify({"error": "找不到項目"}), 404

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
        result = db.accounting_records_collection.insert_one(record)
        logger.info(
            f"套用定期支出 '{item['name']}' ${item['amount']} (user: {request.email})"
        )
        return jsonify({"id": str(result.inserted_id), "message": "記帳成功"}), 201

    except Exception as e:
        logger.error(f"套用定期支出失敗: {e}")
        return jsonify({"error": "套用失敗"}), 500
