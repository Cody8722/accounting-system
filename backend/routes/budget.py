"""
routes/budget.py — 預算相關 API

GET  /admin/api/accounting/budget  取得當月預算
POST /admin/api/accounting/budget  設定當月預算
"""

import logging
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request

import db
from extensions import ALLOWED_CATEGORIES, limiter, require_auth

logger = logging.getLogger(__name__)

bp = Blueprint("budget", __name__)


@bp.route("/admin/api/accounting/budget", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_budget():
    """取得預算設定"""
    if db.accounting_budget_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        current_month = datetime.now().strftime("%Y-%m")
        query = {"month": current_month, "user_id": ObjectId(request.user_id)}

        budget_doc = db.accounting_budget_collection.find_one(query)

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


@bp.route("/admin/api/accounting/budget", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def set_accounting_budget():
    """設定預算"""
    if db.accounting_budget_collection is None:
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
        query = {"month": current_month, "user_id": ObjectId(request.user_id)}
        update_data = {
            "budget": data["budget"],
            "updated_at": datetime.now(),
            "user_id": ObjectId(request.user_id),
        }

        db.accounting_budget_collection.update_one(
            query, {"$set": update_data}, upsert=True
        )

        logger.info(f"儲存預算設定: {current_month} (user: {request.email})")
        return jsonify({"message": "預算已儲存"}), 200
    except Exception as e:
        logger.error(f"儲存預算失敗: {e}")
        return jsonify({"error": "儲存預算失敗"}), 500
