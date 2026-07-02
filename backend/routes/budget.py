"""
routes/budget.py — 預算相關 API

GET  /admin/api/accounting/budget  取得預算（可選 ?month=YYYY-MM，預設當月）
POST /admin/api/accounting/budget  設定預算（可選 month 欄位/參數，預設當月）
"""

import logging
import re
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request

import db
from extensions import ALLOWED_CATEGORIES, limiter, require_auth

logger = logging.getLogger(__name__)

bp = Blueprint("budget", __name__)

_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def _resolve_month(value):
    """回傳 (month_str, error)。value 為空則用當月；格式錯回 error。"""
    if not value:
        return datetime.now().strftime("%Y-%m"), None
    if not _MONTH_RE.match(str(value)):
        return None, "month 格式須為 YYYY-MM"
    return str(value), None


@bp.route("/admin/api/accounting/budget", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_budget():
    """取得預算設定"""
    if db.accounting_budget_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        current_month, err = _resolve_month(request.args.get("month"))
        if err:
            return jsonify({"error": err}), 400
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

        current_month, err = _resolve_month(
            data.get("month") or request.args.get("month")
        )
        if err:
            return jsonify({"error": err}), 400
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
