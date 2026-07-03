import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_compress import Compress
from flask_cors import CORS

import db
from extensions import limiter
from routes import register_blueprints

# 載入環境變數
load_dotenv()

# 設定 logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# 設定最大請求大小 (16MB)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# ==================== gzip 壓縮 ====================
app.config["COMPRESS_MIMETYPES"] = [
    "application/json",
    "text/html",
    "text/css",
    "application/javascript",
]
app.config["COMPRESS_LEVEL"] = 6
app.config["COMPRESS_MIN_SIZE"] = 500
Compress(app)

# CORS 設定
FRONTEND_URLS = os.getenv(
    "FRONTEND_URLS", "http://localhost:8080,https://accounting-system.zeabur.app"
).split(",")
FRONTEND_URLS = [url.strip() for url in FRONTEND_URLS if url.strip()]
CORS(
    app,
    origins=FRONTEND_URLS,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

# 綁定 limiter 至 app（Application Factory 模式）
limiter.init_app(app)


# 安全 headers
@app.after_request
def add_security_headers(response):
    """添加安全相關的 HTTP headers"""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self' http://localhost:5001 https://*.zeabur.app;"
    )
    return response


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "找不到資源"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "不允許的請求方法"}), 405


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    logger.error(f"未預期錯誤: {type(e).__name__}: {e}")
    return jsonify({"error": "伺服器內部錯誤"}), 500


# ── CSRF 防護 ────────────────────────────────────────────────────────────────
@app.before_request
def check_csrf():
    if os.getenv("TESTING", "false").lower() == "true":
        return
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        public_paths = {
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
        }
        if request.path in public_paths:
            return
        has_auth = bool(request.headers.get("Authorization"))
        has_xhr = bool(request.headers.get("X-Requested-With"))
        if not has_auth and not has_xhr:
            logger.warning(f"CSRF check failed: {request.method} {request.path}")
            return jsonify({"error": "無效請求"}), 403


# ==================== 健康檢查端點 ====================


@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health_check():
    """輕量級健康檢查端點（無需認證）"""
    return jsonify({"status": "healthy", "service": "accounting-system"}), 200


# MongoDB 初始化（必須在模組載入時執行，讓 mongomock 能攔截 MongoClient）
db.init_db()

# 註冊 Blueprints（limiter.init_app 已完成後才呼叫）
register_blueprints(app)

# 一次性資料遷移
from routes.debts import migrate_group_debts  # noqa: E402

migrate_group_debts()


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    debug_mode = os.getenv("DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
