"""
routes/debts.py — 欠款追蹤 API

GET    /admin/api/debts                              列出欠款
POST   /admin/api/debts                              新增欠款
GET    /admin/api/debts/<id>                         取得單筆欠款
PUT    /admin/api/debts/<id>                         更新欠款
DELETE /admin/api/debts/<id>                         刪除欠款
POST   /admin/api/debts/<id>/repay                   新增還款
POST   /admin/api/debts/<id>/members/<idx>/repay     分帳成員還款
POST   /admin/api/debts/<id>/settle                  切換結清狀態
PUT    /admin/api/debts/<id>/members/<idx>/pay       群組成員付款切換
"""

import json
import logging
from datetime import datetime

from bson import ObjectId, json_util
from flask import Blueprint, jsonify, request

import db
from extensions import limiter, require_auth, validate_objectid

logger = logging.getLogger(__name__)

bp = Blueprint("debts", __name__)


def _enrich_debt(item):
    """多人分帳欠款附加動態計算欄位"""
    members = item.get("members") or []
    if members:
        item["total_members"] = len(members)
        item["paid_members"] = sum(1 for m in members if m.get("is_settled", False))
        item["pending_receivable"] = sum(
            max(0, m.get("share", 0) - m.get("paid_amount", 0))
            for m in members
            if not m.get("is_settled", False)
        )
    return item


@bp.route("/admin/api/debts", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_debts():
    """列出所有欠款記錄"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        query = {"user_id": user_oid}

        debt_type = request.args.get("type")
        if debt_type in ("lent", "borrowed", "group"):
            query["debt_type"] = debt_type

        show_settled = request.args.get("show_settled", "false").lower() == "true"
        if not show_settled:
            query["is_settled"] = {"$ne": True}

        items = list(db.debts_collection.find(query).sort("created_at", -1))
        items = [_enrich_debt(i) for i in items]
        return json.loads(json_util.dumps(items)), 200
    except Exception as e:
        logger.error(f"取得欠款列表失敗: {e}")
        return jsonify({"error": "取得欠款失敗"}), 500


@bp.route("/admin/api/debts", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def create_debt():
    """新增欠款記錄"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        debt_type = data.get("debt_type")
        if debt_type not in ("lent", "borrowed"):
            return jsonify({"error": "debt_type 必須為 lent 或 borrowed"}), 400

        user_oid = ObjectId(request.user_id)
        now = datetime.now()

        if not data.get("person"):
            return jsonify({"error": "請輸入對象姓名或標題"}), 400
        try:
            amount = float(data.get("amount", 0))
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return jsonify({"error": "請輸入有效金額"}), 400

        raw_members = data.get("members") or []
        members = []
        for m in raw_members:
            name = str(m.get("name", "")).strip()[:50]
            if not name:
                continue
            share = float(m.get("share", 0))
            members.append(
                {
                    "name": name,
                    "share": share,
                    "paid_amount": 0.0,
                    "is_settled": False,
                }
            )

        doc = {
            "user_id": user_oid,
            "debt_type": debt_type,
            "person": str(data["person"])[:50],
            "amount": amount,
            "reason": str(data.get("reason", ""))[:200],
            "date": data.get("date", now.strftime("%Y-%m-%d")),
            "paid_amount": 0.0,
            "is_settled": False,
            "repayments": [],
            "members": members,
            "created_at": now,
        }

        result = db.debts_collection.insert_one(doc)
        logger.info(f"新增欠款記錄 (type={debt_type}, user: {request.email})")
        return (
            jsonify({"id": str(result.inserted_id), "message": "欠款記錄已新增"}),
            201,
        )
    except Exception as e:
        logger.error(f"新增欠款失敗: {e}")
        return jsonify({"error": "新增欠款失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_single_debt(debt_id):
    """取得單筆欠款記錄"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        item = db.debts_collection.find_one(
            {"_id": ObjectId(debt_id), "user_id": ObjectId(request.user_id)}
        )
        if not item:
            return jsonify({"error": "找不到該記錄或無權限存取"}), 404
        item = _enrich_debt(item)
        return json.loads(json_util.dumps(item)), 200
    except Exception as e:
        logger.error(f"取得單筆欠款失敗: {e}")
        return jsonify({"error": "取得欠款失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>", methods=["PUT"])
@limiter.limit("50 per minute")
@require_auth
def update_debt(debt_id):
    """更新欠款記錄"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        user_oid = ObjectId(request.user_id)
        existing = db.debts_collection.find_one(
            {"_id": ObjectId(debt_id), "user_id": user_oid}
        )
        if not existing:
            return jsonify({"error": "找不到該記錄或無權限修改"}), 404

        update_fields = {}

        if "person" in data:
            update_fields["person"] = str(data["person"])[:50]
        if "amount" in data:
            update_fields["amount"] = float(data["amount"])
        if "reason" in data:
            update_fields["reason"] = str(data["reason"])[:200]
        if "date" in data:
            update_fields["date"] = data["date"]
        if "members" in data:
            members = []
            for m in data["members"] or []:
                name = str(m.get("name", "")).strip()[:50]
                if not name:
                    continue
                members.append(
                    {
                        "name": name,
                        "share": float(m.get("share", 0)),
                        "paid_amount": float(m.get("paid_amount", 0)),
                        "is_settled": bool(m.get("is_settled", False)),
                    }
                )
            update_fields["members"] = members

        if not update_fields:
            return jsonify({"error": "沒有可更新的欄位"}), 400

        db.debts_collection.update_one(
            {"_id": ObjectId(debt_id)}, {"$set": update_fields}
        )
        logger.info(f"更新欠款記錄 {debt_id} (user: {request.email})")
        return jsonify({"message": "欠款記錄已更新"}), 200
    except Exception as e:
        logger.error(f"更新欠款失敗: {e}")
        return jsonify({"error": "更新欠款失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>", methods=["DELETE"])
@limiter.limit("50 per minute")
@require_auth
def delete_debt(debt_id):
    """刪除欠款記錄"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        result = db.debts_collection.delete_one(
            {"_id": ObjectId(debt_id), "user_id": ObjectId(request.user_id)}
        )
        if result.deleted_count == 0:
            return jsonify({"error": "找不到該記錄或無權限刪除"}), 404

        if db.accounting_records_collection is not None:
            db.accounting_records_collection.update_many(
                {"debt_id": ObjectId(debt_id), "auto_generated": True},
                {"$set": {"debt_deleted": True}},
            )

        logger.info(f"刪除欠款記錄 {debt_id} (user: {request.email})")
        return jsonify({"message": "欠款記錄已刪除"}), 200
    except Exception as e:
        logger.error(f"刪除欠款失敗: {e}")
        return jsonify({"error": "刪除欠款失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>/repay", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def add_repayment(debt_id):
    """新增還款記錄"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        try:
            repay_amount = float(data.get("amount", 0))
            if repay_amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return jsonify({"error": "請輸入有效還款金額"}), 400

        user_oid = ObjectId(request.user_id)
        existing = db.debts_collection.find_one(
            {"_id": ObjectId(debt_id), "user_id": user_oid}
        )
        if not existing:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404
        if existing.get("members"):
            return jsonify({"error": "多人分帳請使用分帳成員還款功能"}), 400

        repayment = {
            "amount": repay_amount,
            "date": data.get("date", datetime.now().strftime("%Y-%m-%d")),
            "note": str(data.get("note", ""))[:100],
        }
        new_paid = existing.get("paid_amount", 0) + repay_amount
        is_settled = new_paid >= existing["amount"]

        db.debts_collection.update_one(
            {"_id": ObjectId(debt_id)},
            {
                "$push": {"repayments": repayment},
                "$set": {"paid_amount": new_paid, "is_settled": is_settled},
            },
        )

        debt_type = existing.get("debt_type")
        sync_type = "income" if debt_type == "lent" else "expense"
        sync_category = "債務收回" if debt_type == "lent" else "債務償還"
        person = existing.get("person", "")
        try:
            sync_record = {
                "type": sync_type,
                "amount": repay_amount,
                "category": sync_category,
                "date": repayment["date"],
                "description": f"還款：{person}",
                "debt_id": ObjectId(debt_id),
                "auto_generated": True,
                "created_at": datetime.now(),
                "user_id": user_oid,
            }
            db.accounting_records_collection.insert_one(sync_record)
        except Exception as sync_err:
            logger.error(f"還款同步寫入記帳失敗: {sync_err}")
            return (
                jsonify(
                    {
                        "message": "還款記錄已新增，但記帳同步失敗，請手動補記",
                        "is_settled": is_settled,
                        "sync_failed": True,
                    }
                ),
                200,
            )

        logger.info(f"新增還款 {repay_amount} 到欠款 {debt_id} (user: {request.email})")
        return jsonify({"message": "還款記錄已新增", "is_settled": is_settled}), 200
    except Exception as e:
        logger.error(f"新增還款失敗: {e}")
        return jsonify({"error": "新增還款失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>/members/<int:member_idx>/repay", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def repay_member(debt_id, member_idx):
    """分帳成員還款"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        try:
            repay_amount = float(data.get("amount", 0))
            if repay_amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return jsonify({"error": "請輸入有效還款金額"}), 400

        user_oid = ObjectId(request.user_id)
        existing = db.debts_collection.find_one(
            {"_id": ObjectId(debt_id), "user_id": user_oid}
        )
        if not existing:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404

        members = existing.get("members") or []
        if member_idx < 0 or member_idx >= len(members):
            return jsonify({"error": "無效的成員索引"}), 400

        member = members[member_idx]
        new_paid = member.get("paid_amount", 0) + repay_amount
        member["paid_amount"] = new_paid
        member["is_settled"] = new_paid >= member.get("share", 0)

        top_paid = sum(m.get("paid_amount", 0) for m in members)
        all_settled = all(m.get("is_settled", False) for m in members)

        db.debts_collection.update_one(
            {"_id": ObjectId(debt_id)},
            {
                "$set": {
                    "members": members,
                    "paid_amount": top_paid,
                    "is_settled": all_settled,
                }
            },
        )

        debt_type = existing.get("debt_type")
        sync_type = "income" if debt_type == "lent" else "expense"
        sync_category = "債務收回" if debt_type == "lent" else "債務償還"
        member_name = member.get("name", "")
        repay_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
        try:
            sync_record = {
                "type": sync_type,
                "amount": repay_amount,
                "category": sync_category,
                "date": repay_date,
                "description": f"還款：{member_name}",
                "debt_id": ObjectId(debt_id),
                "auto_generated": True,
                "created_at": datetime.now(),
                "user_id": user_oid,
            }
            db.accounting_records_collection.insert_one(sync_record)
        except Exception as sync_err:
            logger.error(f"成員還款同步寫入記帳失敗: {sync_err}")

        logger.info(
            f"成員還款 {repay_amount} (debt={debt_id}, member={member_idx}, user: {request.email})"
        )
        return jsonify({"message": "還款已記錄", "is_settled": all_settled}), 200
    except Exception as e:
        logger.error(f"成員還款失敗: {e}")
        return jsonify({"error": "還款失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>/settle", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def toggle_settle_debt(debt_id):
    """切換欠款結清狀態"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        existing = db.debts_collection.find_one(
            {"_id": ObjectId(debt_id), "user_id": user_oid}
        )
        if not existing:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404

        new_settled = not existing.get("is_settled", False)
        db.debts_collection.update_one(
            {"_id": ObjectId(debt_id)}, {"$set": {"is_settled": new_settled}}
        )
        logger.info(
            f"切換欠款結清狀態 {debt_id} → {new_settled} (user: {request.email})"
        )
        return jsonify({"message": "狀態已更新", "is_settled": new_settled}), 200
    except Exception as e:
        logger.error(f"切換結清狀態失敗: {e}")
        return jsonify({"error": "更新狀態失敗"}), 500


@bp.route("/admin/api/debts/<debt_id>/members/<int:member_idx>/pay", methods=["PUT"])
@limiter.limit("50 per minute")
@require_auth
def toggle_member_pay(debt_id, member_idx):
    """群組分帳：切換成員已付款狀態"""
    if db.debts_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(debt_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        existing = db.debts_collection.find_one(
            {"_id": ObjectId(debt_id), "user_id": user_oid}
        )
        if not existing:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404
        if existing.get("debt_type") != "group":
            return jsonify({"error": "此功能僅適用於群組分帳"}), 400

        members = existing.get("members", [])
        if member_idx < 0 or member_idx >= len(members):
            return jsonify({"error": "無效的成員索引"}), 400

        members[member_idx]["paid"] = not members[member_idx].get("paid", False)
        all_paid = all(m.get("paid", False) for m in members)

        db.debts_collection.update_one(
            {"_id": ObjectId(debt_id)},
            {"$set": {"members": members, "is_settled": all_paid}},
        )
        return jsonify({"message": "成員付款狀態已更新", "is_settled": all_paid}), 200
    except Exception as e:
        logger.error(f"切換成員付款狀態失敗: {e}")
        return jsonify({"error": "更新狀態失敗"}), 500


def migrate_group_debts():
    """一次性遷移：將 debt_type='group' 的舊文件轉為 debt_type='lent' 新格式（幂等）"""
    if db.debts_collection is None:
        return
    try:
        old_docs = list(db.debts_collection.find({"debt_type": "group"}))
        if not old_docs:
            return
        migrated = 0
        for doc in old_docs:
            old_members = doc.get("members", [])
            new_members = []
            total_paid = 0.0
            for m in old_members:
                share = float(m.get("share", 0))
                paid = bool(m.get("paid", False))
                paid_amount = share if paid else 0.0
                total_paid += paid_amount
                new_members.append(
                    {
                        "name": m.get("name", ""),
                        "share": share,
                        "paid_amount": paid_amount,
                        "is_settled": paid,
                    }
                )
            all_settled = (
                all(m["is_settled"] for m in new_members) if new_members else False
            )
            db.debts_collection.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "debt_type": "lent",
                        "person": doc.get("title", "群組分帳"),
                        "amount": float(doc.get("total_amount", 0)),
                        "paid_amount": total_paid,
                        "is_settled": all_settled,
                        "repayments": [],
                        "members": new_members,
                    },
                    "$unset": {"title": "", "total_amount": ""},
                },
            )
            migrated += 1
        logger.info(f"[Migration] 群組分帳遷移完成：共遷移 {migrated} 筆")
    except Exception as e:
        logger.error(f"[Migration] 群組分帳遷移失敗: {e}")
