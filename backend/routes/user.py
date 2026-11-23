"""
routes/user.py — 用戶個人資料 API

GET  /api/user/profile       取得個人資料
PUT  /api/user/profile       更新個人資料
POST /api/user/change-password 修改密碼
POST /api/user/delete-account  自助刪除帳號（進垃圾桶，保留期內可還原；0 天 = 立即永久刪除）
"""

import logging
from datetime import datetime

import account_trash
import auth
import db
from bson import ObjectId
from extensions import limiter, require_auth
from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

bp = Blueprint("user", __name__)


@bp.route("/api/user/profile", methods=["GET"])
@require_auth
def get_profile():
    """取得用戶個人資料"""
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        user = db.users_collection.find_one({"_id": ObjectId(request.user_id)})
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


@bp.route("/api/user/profile", methods=["PUT"])
@require_auth
@limiter.limit("10 per hour")
def update_profile():
    """更新用戶個人資料"""
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_fields = {}

        if "name" in data:
            name = data["name"].strip()
            is_valid, message = auth.validate_name(name)
            if not is_valid:
                return jsonify({"error": message}), 400
            update_fields["name"] = name

        if "email" in data:
            email = data["email"].strip()
            is_valid, email_or_error = auth.validate_email_format(email)
            if not is_valid:
                return jsonify({"error": f"Email 格式錯誤：{email_or_error}"}), 400

            existing_user = db.users_collection.find_one(
                {"email": email_or_error, "_id": {"$ne": ObjectId(request.user_id)}}
            )
            if existing_user:
                return jsonify({"error": "此 Email 已被使用"}), 409

            update_fields["email"] = email_or_error

        if not update_fields:
            return jsonify({"error": "沒有要更新的資料"}), 400

        update_fields["updated_at"] = datetime.now()

        db.users_collection.update_one(
            {"_id": ObjectId(request.user_id)}, {"$set": update_fields}
        )

        logger.info(f"用戶更新資料: {request.email}")
        return jsonify({"message": "資料已更新"}), 200

    except Exception as e:
        logger.error(f"更新資料失敗: {e}")
        return jsonify({"error": "更新失敗"}), 500


@bp.route("/api/user/change-password", methods=["POST"])
@require_auth
@limiter.limit("5 per hour")
def change_password():
    """修改密碼"""
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        old_password = data.get("old_password", "")
        new_password = data.get("new_password", "")

        if not old_password or not new_password:
            return jsonify({"error": "舊密碼和新密碼不能為空"}), 400

        user = db.users_collection.find_one({"_id": ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        # 故意回 400 而非 401：前端 api.js 對「任何」401 一律當成 JWT 過期，
        # 會清掉 token 並強制登出。舊密碼打錯是驗證失敗、不是憑證過期，混用
        # 401 會讓使用者只是打錯一次舊密碼就被無預警登出。
        if not auth.verify_password(old_password, user["password_hash"]):
            return jsonify({"error": "舊密碼錯誤"}), 400

        is_valid, message = auth.validate_password_strength(
            new_password, email=user.get("email", ""), name=user.get("name", "")
        )
        if not is_valid:
            return jsonify({"error": message}), 400

        new_password_hash = auth.hash_password(new_password)
        db.users_collection.update_one(
            {"_id": ObjectId(request.user_id)},
            {
                "$set": {
                    "password_hash": new_password_hash,
                    "updated_at": datetime.now(),
                    # 此時間之前簽發的 token 一律失效（見 extensions._token_still_valid）
                    "password_changed_at": datetime.utcnow(),
                    "requires_password_change": False,
                }
            },
        )

        logger.info(f"用戶修改密碼: {request.email}")
        return jsonify({"message": "密碼已更新"}), 200

    except Exception as e:
        logger.error(f"修改密碼失敗: {e}")
        return jsonify({"error": "修改密碼失敗"}), 500


@bp.route("/api/user/delete-account", methods=["POST"])
@require_auth
@limiter.limit("5 per hour")
def delete_account():
    """
    自助刪除帳號。需重新輸入密碼。

    body: {"password": "...", "retention_days": 0 | 7 | 30 | 90}（預設 30）
    - retention_days > 0：進垃圾桶，保留期內用 Email＋密碼可還原，期滿由管理指令永久清除
    - retention_days = 0：立即永久刪除帳號與所有資料，無法還原
    成功後既有 token 立即失效。
    """
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        password = data.get("password", "")
        if not password:
            return jsonify({"error": "請輸入密碼"}), 400

        retention = account_trash.normalize_retention(
            data.get("retention_days", account_trash.DEFAULT_RETENTION_DAYS)
        )
        if retention is None:
            return jsonify({"error": "保留天數只能是 0、7、30 或 90"}), 400

        uid = ObjectId(request.user_id)
        user = db.users_collection.find_one({"_id": uid})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        # 故意回 400 而非 401：見 change_password（401 會讓前端誤判為 JWT 過期而登出）
        if not auth.verify_password(password, user["password_hash"]):
            return jsonify({"error": "密碼錯誤"}), 400

        if retention == 0:
            account_trash.purge_user(uid)
            logger.info(f"用戶永久刪除帳號: {request.email}")
            return jsonify({"message": "帳號已永久刪除", "purge_at": None}), 200

        purge_at = account_trash.move_to_trash(uid, retention)
        logger.info(f"用戶刪除帳號（進垃圾桶 {retention} 天）: {request.email}")
        return (
            jsonify(
                {"message": "帳號已刪除", "purge_at": purge_at.isoformat()},
            ),
            200,
        )

    except Exception as e:
        logger.error(f"刪除帳號失敗: {e}")
        return jsonify({"error": "刪除帳號失敗"}), 500
