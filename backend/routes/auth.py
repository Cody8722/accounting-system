"""
routes/auth.py — 認證 API + 系統狀態

POST /api/auth/validate-password  即時密碼強度驗證
GET  /api/auth/password-config    取得密碼規則
POST /api/auth/register           用戶註冊
POST /api/auth/login              用戶登入
GET  /api/auth/verify             驗證 token
POST /api/auth/logout             登出
POST /api/auth/forgot-password    寄送密碼重設信
POST /api/auth/reset-password     用 token 重設密碼
GET  /status                      系統狀態
"""

import logging
import os
from datetime import datetime, timedelta

import auth
import db
from bson import ObjectId
from extensions import (
    _clear_login_failures,
    _is_locked_out,
    _record_login_failure,
    limiter,
    require_auth,
)
from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

bp = Blueprint("auth", __name__)

# SMTP 配置（從環境變數讀取）
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "會計系統 - 系統通知")


def send_reset_email(to_email: str, reset_url: str) -> bool:
    """用 Gmail SMTP 寄送密碼重設信"""
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        logger.error("SMTP_USERNAME 或 SMTP_PASSWORD 未設定")
        return False
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.utils import formataddr

        html_body = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">密碼重設</h2>
            <p>我們收到了您的密碼重設請求。請點擊下方按鈕重設密碼：</p>
            <a href="{reset_url}"
               style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;
                      border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
                重設密碼
            </a>
            <p style="color:#6b7280;font-size:0.875rem;">
                此連結將在 1 小時後失效。若非您本人操作，請忽略此信件。
            </p>
        </div>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "記帳本 — 密碼重設"
        msg["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
        msg["To"] = to_email

        html_part = MIMEText(html_body, "html", "utf-8")
        msg.attach(html_part)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"郵件已成功發送至: {to_email}")
        return True
    except Exception as e:
        logger.error(f"Gmail SMTP 寄信失敗: {e}")
        return False


@bp.route("/status", methods=["GET"])
@limiter.limit("10 per minute")
def status():
    """系統狀態檢查（公開端點）"""
    db_connected = db.client is not None

    return (
        jsonify(
            {
                "status": "ok",
                "db_status": "connected" if db_connected else "disconnected",
                "message": "記帳系統運作正常" if db_connected else "資料庫未連線",
            }
        ),
        200,
    )


@bp.route("/api/auth/validate-password", methods=["POST"])
def validate_password():
    """即時密碼強度驗證"""
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        password = data.get("password", "")
        email = data.get("email", "")
        name = data.get("name", "")

        result = auth.validate_password_strength_detailed(password, email, name)
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"密碼驗證失敗: {e}")
        return jsonify({"error": "驗證失敗"}), 500


@bp.route("/api/auth/password-config", methods=["GET"])
def get_password_config():
    """獲取密碼規則配置"""
    try:
        config = {
            "min_length": auth.PASSWORD_CONFIG["min_length"],
            "require_uppercase": auth.PASSWORD_CONFIG["require_uppercase"],
            "require_lowercase": auth.PASSWORD_CONFIG["require_lowercase"],
            "require_digit": auth.PASSWORD_CONFIG["require_digit"],
            "require_special": auth.PASSWORD_CONFIG["require_special"],
            "max_repeating": auth.PASSWORD_CONFIG["max_repeating"],
            "max_sequential": auth.PASSWORD_CONFIG["max_sequential"],
        }
        return jsonify(config), 200

    except Exception as e:
        logger.error(f"獲取密碼配置失敗: {e}")
        return jsonify({"error": "獲取配置失敗"}), 500


@bp.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per hour")
def register():
    """用戶註冊"""
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        email = data.get("email", "").strip()
        password = data.get("password", "")
        name = data.get("name", "").strip()

        is_valid_email, email_or_error = auth.validate_email_format(email)
        if not is_valid_email:
            return jsonify({"error": f"Email 格式錯誤：{email_or_error}"}), 400

        email = email_or_error

        is_valid_name, name_message = auth.validate_name(name)
        if not is_valid_name:
            return jsonify({"error": name_message}), 400

        is_valid_password, password_message = auth.validate_password_strength(
            password, email, name
        )
        if not is_valid_password:
            return jsonify({"error": password_message}), 400

        existing_user = db.users_collection.find_one({"email": email})
        if existing_user:
            return jsonify({"error": "此 Email 已被註冊"}), 409

        password_hash = auth.hash_password(password)

        user = {
            "email": email,
            "password_hash": password_hash,
            "name": name,
            "created_at": datetime.now(),
            "last_login": None,
            "is_active": True,
            "email_verified": False,
            "password_last_updated": datetime.now(),
            "requires_password_change": False,
        }

        result = db.users_collection.insert_one(user)
        user_id = str(result.inserted_id)

        logger.info(f"新用戶註冊: {email}")
        return jsonify({"message": "註冊成功", "user_id": user_id}), 201

    except Exception as e:
        logger.error(f"註冊失敗: {e}")
        return jsonify({"error": "註冊失敗，請稍後再試"}), 500


@bp.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    """用戶登入"""
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not email or not password:
            return jsonify({"error": "Email 和密碼不能為空"}), 400

        if _is_locked_out(email):
            logger.warning(f"登入鎖定: {email}")
            return jsonify({"error": "登入失敗次數過多，請 15 分鐘後再試"}), 429

        user = db.users_collection.find_one({"email": email})
        if not user:
            _record_login_failure(email)
            return jsonify({"error": "Email 或密碼錯誤"}), 401

        if not user.get("is_active", True):
            return jsonify({"error": "帳號已被停用"}), 403

        if not auth.verify_password(password, user["password_hash"]):
            _record_login_failure(email)
            return jsonify({"error": "Email 或密碼錯誤"}), 401

        _clear_login_failures(email)

        db.users_collection.update_one(
            {"_id": user["_id"]}, {"$set": {"last_login": datetime.now()}}
        )

        token = auth.generate_jwt(
            user_id=str(user["_id"]), email=user["email"], name=user.get("name", "")
        )

        logger.info(f"用戶登入: {email}")
        return (
            jsonify(
                {
                    "token": token,
                    "user": {
                        "id": str(user["_id"]),
                        "email": user["email"],
                        "name": user.get("name", ""),
                        "created_at": (
                            user.get("created_at").isoformat()
                            if user.get("created_at")
                            else None
                        ),
                    },
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"登入失敗: {e}")
        return jsonify({"error": "登入失敗，請稍後再試"}), 500


@bp.route("/api/auth/verify", methods=["GET"])
@require_auth
def verify_token():
    """驗證 token 有效性"""
    if db.users_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500

    try:
        user = db.users_collection.find_one({"_id": ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "用戶不存在"}), 404

        return (
            jsonify(
                {
                    "valid": True,
                    "user": {
                        "id": str(user["_id"]),
                        "email": user["email"],
                        "name": user.get("name", ""),
                    },
                }
            ),
            200,
        )

    except Exception as e:
        logger.error(f"驗證 token 失敗: {e}")
        return jsonify({"error": "驗證失敗"}), 500


@bp.route("/api/auth/logout", methods=["POST"])
@require_auth
def logout():
    """登出"""
    logger.info(f"用戶登出: {request.email}")
    return jsonify({"message": "已登出"}), 200


@bp.route("/api/auth/forgot-password", methods=["POST"])
@limiter.limit("5 per hour")
def forgot_password():
    """忘記密碼：寄送重設連結"""
    try:
        if db.users_collection is None:
            return jsonify({"error": "資料庫未連線"}), 503

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "請提供 Email"}), 400

        email = data.get("email", "").strip().lower()
        if not email:
            return jsonify({"error": "請提供 Email"}), 400

        user = db.users_collection.find_one({"email": email})
        if user:
            token = auth.generate_reset_token()
            expires_at = datetime.now() + timedelta(hours=1)

            db.users_collection.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "password_reset_token": token,
                        "password_reset_expires": expires_at,
                    }
                },
            )

            # 決定前端 URL（優先 Origin header → Referer → FRONTEND_URL env → FRONTEND_URLS 第一個）
            frontend_urls = os.getenv(
                "FRONTEND_URLS",
                "http://localhost:8080,https://accounting-system.zeabur.app",
            ).split(",")
            frontend_urls = [u.strip() for u in frontend_urls if u.strip()]

            origin = request.headers.get("Origin")
            if not origin:
                referer = request.headers.get("Referer", "")
                if referer:
                    origin = referer.split("?")[0].rstrip("/")
                    if "/" in origin.replace("https://", "").replace("http://", ""):
                        origin = "/".join(origin.split("/")[:3])

            frontend_url = None
            if origin and origin in frontend_urls:
                frontend_url = origin

            if not frontend_url:
                frontend_url = os.getenv("FRONTEND_URL")

            if not frontend_url:
                frontend_url = (
                    frontend_urls[0] if frontend_urls else "http://localhost:8080"
                )

            reset_url = f"{frontend_url}?reset_token={token}"

            email_sent = send_reset_email(email, reset_url)
            if not email_sent:
                logger.error(f"密碼重設信寄送失敗: {email}，請檢查 SMTP 配置是否正確")
                return (
                    jsonify({"error": "郵件服務未配置或發送失敗，請聯繫系統管理員"}),
                    500,
                )

            logger.info(f"密碼重設信已寄送: {email}")

        return jsonify({"message": "若此 Email 已註冊，重設連結已寄出"}), 200

    except Exception as e:
        logger.error(f"忘記密碼失敗: {e}")
        return jsonify({"error": "系統錯誤"}), 500


@bp.route("/api/auth/reset-password", methods=["POST"])
@limiter.limit("10 per hour")
def reset_password():
    """用 token 重設密碼"""
    try:
        if db.users_collection is None:
            return jsonify({"error": "資料庫未連線"}), 503

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "請提供 token 和新密碼"}), 400

        token = data.get("token", "").strip()
        new_password = data.get("new_password", "")

        if not token or not new_password:
            return jsonify({"error": "請提供 token 和新密碼"}), 400

        user = db.users_collection.find_one({"password_reset_token": token})
        if not user:
            return jsonify({"error": "連結無效或已過期"}), 400

        expires = user.get("password_reset_expires")
        if not expires or datetime.now() > expires:
            return jsonify({"error": "連結已過期，請重新申請"}), 400

        is_valid, message = auth.validate_password_strength(
            new_password,
            email=user.get("email", ""),
            name=user.get("name", ""),
        )
        if not is_valid:
            return jsonify({"error": message}), 400

        new_hash = auth.hash_password(new_password)
        db.users_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {"password_hash": new_hash, "updated_at": datetime.now()},
                "$unset": {"password_reset_token": "", "password_reset_expires": ""},
            },
        )

        logger.info(f"用戶已重設密碼: {user.get('email')}")
        return jsonify({"message": "密碼已重設，請重新登入"}), 200

    except Exception as e:
        logger.error(f"重設密碼失敗: {e}")
        return jsonify({"error": "系統錯誤"}), 500
