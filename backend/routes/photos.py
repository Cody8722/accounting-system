"""
routes/photos.py — 記帳記錄照片 API

POST   /admin/api/accounting/records/<id>/photos            上傳照片（multipart，欄位名 photos，可多檔）
DELETE /admin/api/accounting/records/<id>/photos/<photo_id>  刪除單張照片
GET    /admin/api/accounting/records/<id>/photos/<photo_id>  取得照片本體（需認證）
GET    /admin/api/accounting/photos                          跨記錄的照片瀏覽清單（分頁，新到舊）

儲存：PHOTO_STORAGE_PATH 環境變數指定根目錄（見 docker-compose.yml 掛載到
NAS /tank 路徑），實際檔案存在 <PHOTO_STORAGE_PATH>/<user_id>/<record_id>/<photo_id>.<ext>。
metadata 內嵌在 records.photos 陣列，不開獨立集合；跨記錄瀏覽用 aggregation $unwind。
不做伺服器端縮圖／壓縮——前端上傳前就先壓縮過，這裡只信任「大小上限」這道安全網。
"""

import logging
import math
import os
from datetime import datetime
from pathlib import Path

from bson import ObjectId
from flask import Blueprint, jsonify, request, send_file

import db
from extensions import limiter, require_auth, validate_objectid

logger = logging.getLogger(__name__)

bp = Blueprint("photos", __name__)

# 一律轉成絕對路徑：Flask 的 send_file() 對相對路徑是以 app.root_path（backend/）
# 為基準解析，但 pathlib 的檔案操作（mkdir/write_bytes/is_file）是以 process cwd
# 為基準——兩者基準不同，若 PHOTO_STORAGE_PATH 是相對路徑，寫入和讀取會落在不同
# 目錄。正式環境的 PHOTO_STORAGE_PATH 本來就是容器內絕對路徑，這裡 resolve()
# 只在使用相對路徑（本機開發／測試預設值）時才有實際差異。
PHOTO_STORAGE_PATH = Path(os.getenv("PHOTO_STORAGE_PATH", "./photo_storage")).resolve()
MAX_PHOTOS_PER_RECORD = 20
MAX_PHOTO_SIZE = (
    10 * 1024 * 1024
)  # 10MB；前端已壓縮到數百 KB～1MB，這是安全網不是預期值

# content_type -> (副檔名, 檔案簽章 magic bytes 判斷式)
# 不信任 request 帶的 Content-Type，實際比對檔案開頭 bytes，避免偽裝成圖片的任意檔案上傳。
_ALLOWED_TYPES = {
    "image/jpeg": (".jpg", lambda d: d.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda d: d.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (".webp", lambda d: d[:4] == b"RIFF" and d[8:12] == b"WEBP"),
}


def _validate_photo_signature(content_type, data):
    entry = _ALLOWED_TYPES.get(content_type)
    if not entry:
        return False
    _, matches = entry
    return matches(data)


def _photo_dir(user_id, record_id):
    return Path(PHOTO_STORAGE_PATH) / str(user_id) / str(record_id)


def _find_owned_record(record_id, user_oid):
    """驗證 record_id 格式合法且屬於目前使用者；回傳記錄或 None（含格式錯誤的情況）。"""
    if not validate_objectid(record_id):
        return None
    return db.accounting_records_collection.find_one(
        {"_id": ObjectId(record_id), "user_id": user_oid}
    )


@bp.route("/admin/api/accounting/records/<record_id>/photos", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def upload_photos(record_id):
    """上傳一或多張照片到指定記錄。"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        record = _find_owned_record(record_id, user_oid)
        if not record:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404

        files = request.files.getlist("photos")
        if not files:
            return jsonify({"error": "沒有收到照片檔案"}), 400

        existing_count = len(record.get("photos", []))
        if existing_count + len(files) > MAX_PHOTOS_PER_RECORD:
            return (
                jsonify({"error": f"單筆記錄最多 {MAX_PHOTOS_PER_RECORD} 張照片"}),
                400,
            )

        # 先驗證全部檔案（大小、簽章），通過才實際寫入磁碟——避免驗證到一半失敗，
        # 卻已經有前幾張寫進去、DB 卻沒更新的不一致狀態。
        validated = []
        for f in files:
            data = f.read()
            if len(data) > MAX_PHOTO_SIZE:
                return (
                    jsonify(
                        {
                            "error": f"照片檔案過大（上限 {MAX_PHOTO_SIZE // (1024 * 1024)}MB）"
                        }
                    ),
                    400,
                )
            content_type = f.mimetype
            if not _validate_photo_signature(content_type, data):
                return jsonify({"error": "不支援的圖片格式"}), 400
            validated.append((data, content_type, f.filename or ""))

        photo_dir = _photo_dir(user_oid, record["_id"])
        photo_dir.mkdir(parents=True, exist_ok=True)

        saved_photos = []
        for data, content_type, original_filename in validated:
            photo_id = ObjectId()
            ext = _ALLOWED_TYPES[content_type][0]
            filename = f"{photo_id}{ext}"
            (photo_dir / filename).write_bytes(data)
            saved_photos.append(
                {
                    "id": str(photo_id),
                    "filename": filename,
                    "original_filename": original_filename[:200],
                    "content_type": content_type,
                    "size_bytes": len(data),
                    "uploaded_at": datetime.now().isoformat(),
                }
            )

        db.accounting_records_collection.update_one(
            {"_id": record["_id"]},
            {
                "$push": {"photos": {"$each": saved_photos}},
                "$set": {"updated_at": datetime.now()},
            },
        )

        logger.info(
            f"上傳 {len(saved_photos)} 張照片到記錄 {record_id} (user: {request.email})"
        )
        return jsonify({"photos": saved_photos}), 201
    except Exception as e:
        logger.error(f"上傳照片失敗: {e}")
        return jsonify({"error": "上傳照片失敗"}), 500


@bp.route(
    "/admin/api/accounting/records/<record_id>/photos/<photo_id>", methods=["DELETE"]
)
@limiter.limit("30 per minute")
@require_auth
def delete_photo(record_id, photo_id):
    """刪除單張照片：先移除 DB 內的參照、再刪磁碟檔案——萬一檔案刪除失敗，
    留下的是「孤兒檔案」（無害、可事後清理），而不是「UI 顯示一張其實已經
    刪不掉的照片」。"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        record = _find_owned_record(record_id, user_oid)
        if not record:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404

        target = next(
            (p for p in record.get("photos", []) if p["id"] == photo_id), None
        )
        if not target:
            return jsonify({"error": "找不到該照片"}), 404

        db.accounting_records_collection.update_one(
            {"_id": record["_id"]},
            {
                "$pull": {"photos": {"id": photo_id}},
                "$set": {"updated_at": datetime.now()},
            },
        )

        photo_path = _photo_dir(user_oid, record["_id"]) / target["filename"]
        try:
            photo_path.unlink(missing_ok=True)
        except OSError as e:
            logger.warning(f"刪除照片檔案失敗（DB 參照已移除）: {e}")

        logger.info(f"刪除照片 {photo_id}（記錄 {record_id}, user: {request.email}）")
        return jsonify({"message": "已刪除"}), 200
    except Exception as e:
        logger.error(f"刪除照片失敗: {e}")
        return jsonify({"error": "刪除照片失敗"}), 500


@bp.route(
    "/admin/api/accounting/records/<record_id>/photos/<photo_id>", methods=["GET"]
)
@limiter.limit("300 per minute")
@require_auth
def get_photo(record_id, photo_id):
    """取得照片本體。Bearer token 認證，前端用 fetch() 帶 header 取得 blob 後
    自己 createObjectURL 給 <img> 用（跟 settings.js 的匯出下載同一套模式，
    因為 <img src> 沒辦法帶 Authorization header）。"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        record = _find_owned_record(record_id, user_oid)
        if not record:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404

        target = next(
            (p for p in record.get("photos", []) if p["id"] == photo_id), None
        )
        if not target:
            return jsonify({"error": "找不到該照片"}), 404

        photo_path = _photo_dir(user_oid, record["_id"]) / target["filename"]
        if not photo_path.is_file():
            return jsonify({"error": "照片檔案遺失"}), 404

        return send_file(photo_path, mimetype=target["content_type"])
    except Exception as e:
        logger.error(f"取得照片失敗: {e}")
        return jsonify({"error": "取得照片失敗"}), 500


@bp.route("/admin/api/accounting/photos", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def list_all_photos():
    """跨記錄的照片瀏覽清單，依上傳時間新到舊排序、分頁——供照片瀏覽介面（反向流程：
    點縮圖跳轉到 record_id 對應的記錄）用，不用逐筆記錄自己查一輪。"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        try:
            page = max(1, int(request.args.get("page", 1)))
            limit = min(100, max(1, int(request.args.get("limit", 30))))
        except (ValueError, TypeError):
            return jsonify({"error": "page 和 limit 必須為正整數"}), 400

        pipeline = [
            {"$match": {"user_id": user_oid, "photos.0": {"$exists": True}}},
            {"$unwind": "$photos"},
            {"$sort": {"photos.uploaded_at": -1}},
            {"$skip": (page - 1) * limit},
            {"$limit": limit},
            {
                "$project": {
                    "_id": 0,
                    "record_id": {"$toString": "$_id"},
                    "record_type": "$type",
                    "record_category": "$category",
                    "record_date": "$date",
                    "photo_id": "$photos.id",
                    "content_type": "$photos.content_type",
                    "uploaded_at": "$photos.uploaded_at",
                }
            },
        ]
        items = list(db.accounting_records_collection.aggregate(pipeline))

        count_pipeline = [
            {"$match": {"user_id": user_oid}},
            {"$project": {"count": {"$size": {"$ifNull": ["$photos", []]}}}},
            {"$group": {"_id": None, "total": {"$sum": "$count"}}},
        ]
        count_result = list(db.accounting_records_collection.aggregate(count_pipeline))
        total = count_result[0]["total"] if count_result else 0

        return (
            jsonify(
                {
                    "items": items,
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": math.ceil(total / limit) if total > 0 else 1,
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得照片清單失敗: {e}")
        return jsonify({"error": "取得照片清單失敗"}), 500
