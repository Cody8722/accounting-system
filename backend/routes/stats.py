"""
routes/stats.py — 統計分析 API

GET /admin/api/accounting/stats      月度收支統計
GET /admin/api/stats/overview        整合財務概覽（含欠款）
GET /admin/api/accounting/trends     月度趨勢
GET /admin/api/accounting/comparison 環比資料
"""

import logging
from datetime import datetime, timedelta

from bson import ObjectId
from flask import Blueprint, jsonify, request

import db
from extensions import (
    _cache_get,
    _cache_key,
    _cache_set,
    limiter,
    require_auth,
    validate_date,
    validate_record_type,
)

logger = logging.getLogger(__name__)

bp = Blueprint("stats", __name__)


@bp.route("/admin/api/accounting/stats", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_stats():
    """取得記帳統計"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        ck = _cache_key(request.user_id, "stats", start_date or "", end_date or "")
        cached = _cache_get(ck)
        if cached is not None:
            return jsonify(cached), 200

        query = {"user_id": ObjectId(request.user_id)}

        if start_date and end_date:
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query["date"] = {"$gte": start_date, "$lte": end_date}

        income_pipeline = [
            {"$match": {**query, "type": "income"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        expense_pipeline = [
            {"$match": {**query, "type": "expense"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]

        income_result = list(
            db.accounting_records_collection.aggregate(income_pipeline)
        )
        expense_result = list(
            db.accounting_records_collection.aggregate(expense_pipeline)
        )

        total_income = income_result[0]["total"] if income_result else 0
        total_expense = expense_result[0]["total"] if expense_result else 0

        category_pipeline = [
            {"$match": {**query, "type": "expense"}},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
            {"$sort": {"total": -1}},
        ]
        category_stats = list(
            db.accounting_records_collection.aggregate(category_pipeline)
        )

        result = {
            "total_income": total_income,
            "total_expense": total_expense,
            "balance": total_income - total_expense,
            "category_stats": category_stats,
        }
        _cache_set(ck, result)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"取得統計資料失敗: {e}")
        return jsonify({"error": "取得統計資料失敗"}), 500


@bp.route("/admin/api/stats/overview", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_stats_overview():
    """整合統計：記帳 + 欠款合併財務概覽"""
    if db.accounting_records_collection is None or db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)

        income_result = list(
            db.accounting_records_collection.aggregate(
                [
                    {"$match": {"user_id": user_oid, "type": "income"}},
                    {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
                ]
            )
        )
        expense_result = list(
            db.accounting_records_collection.aggregate(
                [
                    {"$match": {"user_id": user_oid, "type": "expense"}},
                    {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
                ]
            )
        )
        cash_balance = (income_result[0]["total"] if income_result else 0) - (
            expense_result[0]["total"] if expense_result else 0
        )

        active_debts = list(
            db.debts_collection.find({"user_id": user_oid, "is_settled": {"$ne": True}})
        )

        receivable = 0
        payable = 0
        lent_count = 0
        borrowed_count = 0

        for d in active_debts:
            dt = d.get("debt_type")
            members = d.get("members") or []
            if dt == "lent":
                lent_count += 1
                if members:
                    receivable += sum(
                        max(0, m.get("share", 0) - m.get("paid_amount", 0))
                        for m in members
                        if not m.get("is_settled", False)
                    )
                else:
                    receivable += max(0, d.get("amount", 0) - d.get("paid_amount", 0))
            elif dt == "borrowed":
                borrowed_count += 1
                if members:
                    payable += sum(
                        max(0, m.get("share", 0) - m.get("paid_amount", 0))
                        for m in members
                        if not m.get("is_settled", False)
                    )
                else:
                    payable += max(0, d.get("amount", 0) - d.get("paid_amount", 0))

        net_balance = cash_balance + receivable - payable

        return (
            jsonify(
                {
                    "cash_balance": cash_balance,
                    "receivable": receivable,
                    "payable": payable,
                    "group_receivable": 0,
                    "net_balance": net_balance,
                    "lent_count": lent_count,
                    "borrowed_count": borrowed_count,
                    "group_count": 0,
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得整合統計失敗: {e}")
        return jsonify({"error": "取得整合統計失敗"}), 500


@bp.route("/admin/api/accounting/trends", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_monthly_trends():
    """取得月度趨勢資料（收入與支出）"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        try:
            months_count = int(request.args.get("months", 6))
        except (ValueError, TypeError):
            return jsonify({"error": "months 必須為整數"}), 400
        if months_count < 1:
            months_count = 1
        if months_count > 24:
            months_count = 24

        base_query = {"user_id": ObjectId(request.user_id)}

        income_pipeline = [
            {"$match": {**base_query, "type": "income"}},
            {
                "$group": {
                    "_id": {"$substr": ["$date", 0, 7]},
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"_id": 1}},
            {"$limit": months_count},
        ]
        expense_pipeline = [
            {"$match": {**base_query, "type": "expense"}},
            {
                "$group": {
                    "_id": {"$substr": ["$date", 0, 7]},
                    "total": {"$sum": "$amount"},
                }
            },
            {"$sort": {"_id": 1}},
            {"$limit": months_count},
        ]

        income_data = list(db.accounting_records_collection.aggregate(income_pipeline))
        expense_data = list(
            db.accounting_records_collection.aggregate(expense_pipeline)
        )

        income_dict = {item["_id"]: item["total"] for item in income_data}
        expense_dict = {item["_id"]: item["total"] for item in expense_data}

        all_months = sorted(set(income_dict.keys()) | set(expense_dict.keys()))

        if len(all_months) < months_count:
            current = datetime.now()
            for i in range(months_count):
                year = current.year
                month = current.month - i
                while month <= 0:
                    month += 12
                    year -= 1
                month_str = f"{year:04d}-{month:02d}"
                if month_str not in all_months:
                    all_months.append(month_str)

            all_months = sorted(list(set(all_months)))

        all_months = all_months[-months_count:]

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


@bp.route("/admin/api/accounting/comparison", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_period_comparison():
    """取得環比資料（本期 vs 上期）"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        period = request.args.get("period", "month")
        if period not in ("week", "month", "quarter", "year"):
            return jsonify({"error": "period 必須為 week、month、quarter 或 year"}), 400

        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        ck = _cache_key(request.user_id, "comparison", period, today)
        cached = _cache_get(ck)
        if cached is not None:
            return jsonify(cached), 200

        if period == "week":
            weekday = now.weekday()
            cur_start = datetime(now.year, now.month, now.day) - timedelta(days=weekday)
            prev_start = cur_start - timedelta(weeks=1)
            prev_end = cur_start
            cur_label = cur_start.strftime("%Y/%m/%d 週")
            prev_label = prev_start.strftime("%Y/%m/%d 週")

        elif period == "month":
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
                {
                    "$match": {
                        "user_id": user_oid,
                        "date": {
                            "$gte": start.strftime("%Y-%m-%d"),
                            "$lt": end.strftime("%Y-%m-%d"),
                        },
                    }
                },
                {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
            ]
            result = {"income": 0.0, "expense": 0.0}
            for doc in db.accounting_records_collection.aggregate(pipeline):
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

        result = {
            "current": {**cur, "label": cur_label},
            "previous": {**prev, "label": prev_label},
            "changes": {
                "income_pct": pct_change(cur["income"], prev["income"]),
                "expense_pct": pct_change(cur["expense"], prev["expense"]),
                "balance_pct": pct_change(cur["balance"], prev["balance"]),
            },
        }
        _cache_set(ck, result)
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"取得環比資料失敗: {e}")
        return jsonify({"error": "取得環比資料失敗"}), 500
