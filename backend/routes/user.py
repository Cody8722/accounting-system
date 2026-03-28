"""
routes/user.py — 用戶個人資料 API

GET  /api/user/profile       取得個人資料
PUT  /api/user/profile       更新個人資料
POST /api/user/change-password 修改密碼
"""

import logging
from datetime import datetime

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

        if not auth.verify_password(old_password, user["password_hash"]):
            return jsonify({"error": "舊密碼錯誤"}), 401

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
                }
            },
        )

        logger.info(f"用戶修改密碼: {request.email}")
        return jsonify({"message": "密碼已更新"}), 200

    except Exception as e:
        logger.error(f"修改密碼失敗: {e}")
        return jsonify({"error": "修改密碼失敗"}), 500
