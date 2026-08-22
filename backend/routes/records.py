"""
routes/records.py — 記帳記錄 CRUD API

GET    /admin/api/accounting/records               取得記帳記錄（分頁、篩選）
GET    /admin/api/accounting/records/<id>          取得單筆記錄
POST   /admin/api/accounting/records               新增記錄（收入可選擇拆分出受限資金）
PUT    /admin/api/accounting/records/<id>          更新記錄
DELETE /admin/api/accounting/records/<id>          刪除記錄
POST   /admin/api/accounting/records/transfer      新增內部轉移
POST   /admin/api/accounting/records/<id>/unlock   解鎖受限資金
GET    /admin/api/accounting/data-version          資料版本簽章（供前端判斷是否需重抓）
"""

import hashlib
import json
import logging
import math
import re
from datetime import datetime

from bson import ObjectId, json_util
from flask import Blueprint, jsonify, request
from pymongo import ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError

import db
from extensions import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    _cache_invalidate_user,
    limiter,
    parse_object_id_list,
    require_auth,
    validate_amount,
    validate_category,
    validate_date,
    validate_description,
    validate_expense_type,
    validate_location,
    validate_objectid,
    validate_record_type,
)
from routes.photos import _photo_dir

CASH_WITHDRAWAL_UNIT = 1000  # 支出現金不足時，從銀行提領的最小單位（無條件進位）


def _resolve_wallet_id(raw, user_oid):
    """驗證 wallet_id 屬於當前使用者；raw 為 None/空字串代表「不指定錢包」。
    回傳 (True, ObjectId|None) 或 (False, 錯誤訊息)。
    """
    if raw in (None, "", "null"):
        return True, None
    if not validate_objectid(raw):
        return False, "無效的 wallet_id"
    wallet_oid = ObjectId(raw)
    if db.wallets_collection is None:
        return False, "資料庫未初始化"
    wallet = db.wallets_collection.find_one({"_id": wallet_oid, "user_id": user_oid})
    if not wallet:
        return False, "找不到該錢包或無權限使用"
    return True, wallet_oid


def _get_location_balance(user_oid, wallet_id, location):
    """計算指定 (帳戶, 位置) 目前餘額：收入 − 支出 + 轉入 − 轉出。
    wallet_id 可為 None（未分類帳戶），與其他帳戶一樣視為獨立的一個桶。
    """

    def _sum(match):
        agg = list(
            db.accounting_records_collection.aggregate(
                [
                    {"$match": match},
                    {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
                ]
            )
        )
        return agg[0]["total"] if agg else 0.0

    base = {"user_id": user_oid, "wallet_id": wallet_id, "location": location}
    income = _sum({**base, "type": "income"})
    expense = _sum({**base, "type": "expense"})
    transfer_in = _sum(
        {
            "user_id": user_oid,
            "wallet_id": wallet_id,
            "type": "transfer",
            "to_location": location,
        }
    )
    transfer_out = _sum(
        {
            "user_id": user_oid,
            "wallet_id": wallet_id,
            "type": "transfer",
            "from_location": location,
        }
    )
    return income - expense + transfer_in - transfer_out


logger = logging.getLogger(__name__)

bp = Blueprint("records", __name__)


@bp.route("/admin/api/accounting/records", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_accounting_records():
    """取得記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        try:
            page = max(1, int(request.args.get("page", 1)))
            limit = min(
                MAX_PAGE_SIZE,
                max(1, int(request.args.get("limit", DEFAULT_PAGE_SIZE))),
            )
        except (ValueError, TypeError):
            return jsonify({"error": "page 和 limit 必須為正整數"}), 400

        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        record_type = request.args.get("type")
        category = request.args.get("category")
        search = request.args.get("search", "").strip()
        sort_by = request.args.get("sort_by", "date")
        sort_order = request.args.get("sort_order", "desc")

        query = {"user_id": ObjectId(request.user_id)}

        if start_date and end_date:
            valid_start, _ = validate_date(start_date)
            valid_end, _ = validate_date(end_date)
            if valid_start and valid_end:
                query["date"] = {"$gte": start_date, "$lte": end_date}

        if record_type:
            valid, _ = validate_record_type(record_type)
            if valid:
                query["type"] = record_type

        if category:
            query["category"] = category

        # 多值篩選（鎖定模式用）：wallet_ids/categories 逗號分隔，優先於單值 category
        wallet_ids_param = request.args.get("wallet_ids", "").strip()
        if wallet_ids_param:
            valid, result = parse_object_id_list(wallet_ids_param)
            if not valid:
                return jsonify({"error": result}), 400
            if result:
                query["wallet_id"] = {"$in": result}

        categories_param = request.args.get("categories", "").strip()
        if categories_param:
            cats = [c.strip() for c in categories_param.split(",") if c.strip()]
            if cats:
                query["category"] = {"$in": cats}

        if search:
            query["description"] = {"$regex": re.escape(search), "$options": "i"}

        sort_field = "amount" if sort_by == "amount" else "date"
        sort_dir = ASCENDING if sort_order == "asc" else DESCENDING

        total = db.accounting_records_collection.count_documents(query)
        total_pages = math.ceil(total / limit) if total > 0 else 1

        records = list(
            db.accounting_records_collection.find(query)
            .sort(sort_field, sort_dir)
            .skip((page - 1) * limit)
            .limit(limit)
        )

        return (
            json.loads(
                json_util.dumps(
                    {
                        "records": records,
                        "total": total,
                        "page": page,
                        "limit": limit,
                        "total_pages": total_pages,
                    }
                )
            ),
            200,
        )
    except Exception as e:
        logger.error(f"查詢記帳記錄失敗: {e}")
        return jsonify({"error": "查詢記錄失敗"}), 500


@bp.route("/admin/api/accounting/records/<record_id>", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_single_accounting_record(record_id):
    """取得單筆記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }
        record = db.accounting_records_collection.find_one(query)
        if not record:
            return jsonify({"error": "找不到該記錄或無權限存取"}), 404

        return json.loads(json_util.dumps(record)), 200
    except Exception as e:
        logger.error(f"取得單筆記帳記錄失敗: {e}")
        return jsonify({"error": "取得記錄失敗"}), 500


@bp.route("/admin/api/accounting/records", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def add_accounting_record():
    """新增記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        # 離線同步冪等：前端可帶 client_id（uuid）供去重；線上請求不帶則行為完全不變。
        client_id = data.get("client_id")
        if client_id is not None:
            if (
                not isinstance(client_id, str)
                or not client_id.strip()
                or len(client_id) > 64
            ):
                return jsonify({"error": "無效的 client_id"}), 400
            client_id = client_id.strip()

        if data.get("type") == "transfer":
            return (
                jsonify(
                    {"error": "內部轉移請使用 /admin/api/accounting/records/transfer"}
                ),
                400,
            )

        if data.get("type") == "restricted":
            return (
                jsonify({"error": "受限資金無法直接建立，請在記收入時使用拆分功能"}),
                400,
            )

        required_fields = ["type", "amount", "category", "date"]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"缺少必要欄位: {field}"}), 400

        valid, msg = validate_record_type(data["type"])
        if not valid:
            return jsonify({"error": msg}), 400

        record_type = data["type"]

        # 受限資金拆分（僅收入適用）：restricted_amount 若提供需自行通過金額驗證；
        # 通過後，下面的一般收入金額才允許是 0（全額代收代付，只產生受限資金記錄）
        restricted_amount = None
        restricted_description = ""
        if record_type == "income" and data.get("restricted_amount") not in (
            None,
            "",
        ):
            valid, result = validate_amount(data["restricted_amount"])
            if not valid:
                return jsonify({"error": result}), 400
            restricted_amount = result
            valid, restricted_description = validate_description(
                data.get("restricted_description", "")
            )
            if not valid:
                return jsonify({"error": restricted_description}), 400

        try:
            raw_amount_val = float(data["amount"])
        except (TypeError, ValueError):
            raw_amount_val = None

        if restricted_amount is not None and raw_amount_val == 0:
            amount = 0.0
        else:
            valid, result = validate_amount(data["amount"])
            if not valid:
                return jsonify({"error": result}), 400
            amount = result

        valid, result = validate_date(data["date"])
        if not valid:
            return jsonify({"error": result}), 400

        valid, category = validate_category(data["category"])
        if not valid:
            return jsonify({"error": category}), 400

        description = data.get("description", "")
        valid, description = validate_description(description)
        if not valid:
            return jsonify({"error": description}), 400

        expense_type = data.get("expense_type")
        if expense_type:
            valid, msg = validate_expense_type(expense_type)
            if not valid:
                return jsonify({"error": msg}), 400

        user_oid = ObjectId(request.user_id)

        # 冪等去重：離線同步可能因回應遺失而重送同一筆（帶相同 client_id）。命中就回既有記錄、
        # 不重複建立——尤其要在下方「現金不足自動提領」邏輯之前，避免重送時又多產生一筆提領轉帳。
        if client_id is not None:
            existing = db.accounting_records_collection.find_one(
                {"user_id": user_oid, "client_id": client_id}
            )
            if existing is not None:
                return (
                    jsonify(
                        {
                            "message": "記帳記錄已存在",
                            "id": str(existing["_id"]),
                            "deduped": True,
                        }
                    ),
                    200,
                )

        valid, wallet_id = _resolve_wallet_id(data.get("wallet_id"), user_oid)
        if not valid:
            return jsonify({"error": wallet_id}), 400

        source_transfer_id = None

        if record_type == "income":
            # 收入：位置必填，使用者手動選銀行或現金
            valid, location = validate_location(data.get("location"), required=True)
            if not valid:
                return jsonify({"error": location}), 400
        else:
            # 支出：位置由系統自動判斷，忽略前端傳入的 location
            cash_balance = _get_location_balance(user_oid, wallet_id, "cash")
            if cash_balance >= amount:
                location = "cash"
            else:
                deficit = amount - cash_balance
                withdrawal = (
                    math.ceil(deficit / CASH_WITHDRAWAL_UNIT) * CASH_WITHDRAWAL_UNIT
                )
                if not data.get("confirm_withdrawal"):
                    return (
                        jsonify(
                            {
                                "error": "cash_insufficient",
                                "message": (
                                    f"現金不足，需從銀行提領 NT$ {withdrawal:,.0f} "
                                    "補齊，是否確認？"
                                ),
                                "cash_balance": cash_balance,
                                "deficit": deficit,
                                "withdrawal_amount": withdrawal,
                            }
                        ),
                        409,
                    )
                # 使用者已確認：先寫入提領轉帳、再寫入支出。沒有 DB transaction，
                # 刻意用這個順序——萬一第二步失敗，殘留的是「多一筆轉帳」（可回溯、
                # 可補救），而不是「現金憑空減少卻沒有任何紀錄可查」。
                transfer_doc = {
                    "user_id": user_oid,
                    "type": "transfer",
                    "wallet_id": wallet_id,
                    "from_location": "bank",
                    "to_location": "cash",
                    "amount": withdrawal,
                    "date": data["date"],
                    "description": "支出現金不足，自動提領",
                    "auto_generated": True,
                    "photos": [],
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                }
                transfer_result = db.accounting_records_collection.insert_one(
                    transfer_doc
                )
                source_transfer_id = transfer_result.inserted_id
                location = "cash"

        # record_type 到這裡只會是 "income" 或 "expense"（transfer/restricted 已在上面擋掉）。
        # amount == 0 只會發生在「收入 + 全額受限」（見上方金額驗證），此時不產生一般收入記錄。
        primary_id = None
        if record_type != "income" or amount > 0:
            record = {
                "type": record_type,
                "amount": amount,
                "category": category,
                "date": data["date"],
                "description": description,
                "expense_type": expense_type,
                "wallet_id": wallet_id,
                "location": location,
                "source_transfer_id": source_transfer_id,
                "photos": [],
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                "user_id": user_oid,
            }
            # 只在有 client_id 時才寫入該欄位；不帶的記錄不含此欄，才不會被 partial unique index 約束。
            if client_id is not None:
                record["client_id"] = client_id
            try:
                result = db.accounting_records_collection.insert_one(record)
                primary_id = result.inserted_id
            except DuplicateKeyError:
                # 競態：另一個帶相同 client_id 的請求已先寫入 → 回既有（冪等安全網）。
                existing = db.accounting_records_collection.find_one(
                    {"user_id": user_oid, "client_id": client_id}
                )
                if existing is not None:
                    return (
                        jsonify(
                            {
                                "message": "記帳記錄已存在",
                                "id": str(existing["_id"]),
                                "deduped": True,
                            }
                        ),
                        200,
                    )
                raise

        restricted_id = None
        if restricted_amount is not None:
            restricted_record = {
                "type": "restricted",
                "amount": restricted_amount,
                "category": None,
                "date": data["date"],
                "description": restricted_description,
                "expense_type": None,
                "wallet_id": wallet_id,
                "location": location,
                "linked_income_id": primary_id,
                "unlocked_at": None,
                "source_restricted_id": None,
                "photos": [],
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                "user_id": user_oid,
            }
            restricted_result = db.accounting_records_collection.insert_one(
                restricted_record
            )
            restricted_id = restricted_result.inserted_id

        _cache_invalidate_user(request.user_id)
        logger.info(
            f"新增記帳記錄: primary={primary_id} restricted={restricted_id} "
            f"(user: {request.email})"
        )
        response_body = {"message": "記帳記錄已新增"}
        if primary_id is not None:
            response_body["id"] = str(primary_id)
        if restricted_id is not None:
            response_body["restricted_id"] = str(restricted_id)
        return jsonify(response_body), 201
    except Exception as e:
        logger.error(f"新增記帳記錄失敗: {e}")
        return jsonify({"error": "新增記錄失敗"}), 500


@bp.route("/admin/api/accounting/records/<record_id>", methods=["PUT"])
@limiter.limit("50 per minute")
@require_auth
def update_accounting_record(record_id):
    """更新記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }

        existing_record = db.accounting_records_collection.find_one(query)
        if not existing_record:
            return jsonify({"error": "找不到該記錄或無權限修改"}), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_data = {}

        if "type" in data:
            valid, msg = validate_record_type(data["type"])
            if not valid:
                return jsonify({"error": msg}), 400
            if data["type"] in ("transfer", "restricted") or existing_record.get(
                "type"
            ) in ("transfer", "restricted"):
                return (
                    jsonify(
                        {
                            "error": "轉帳／受限資金記錄的類型無法透過此端點修改，"
                            "請使用對應的專用端點"
                        }
                    ),
                    400,
                )
            update_data["type"] = data["type"]

        if "from_location" in data or "to_location" in data:
            return jsonify({"error": "轉帳記錄的位置無法修改，請刪除後重新記錄"}), 400

        if "location" in data:
            final_type = update_data.get("type", existing_record.get("type"))
            if final_type not in ("income", "restricted"):
                return jsonify({"error": "只有收入或受限資金記錄可以修改位置"}), 400
            valid, location = validate_location(data["location"], required=True)
            if not valid:
                return jsonify({"error": location}), 400
            update_data["location"] = location

        if "amount" in data:
            valid, result = validate_amount(data["amount"])
            if not valid:
                return jsonify({"error": result}), 400
            update_data["amount"] = result

        if "category" in data:
            valid, category = validate_category(data["category"])
            if not valid:
                return jsonify({"error": category}), 400
            update_data["category"] = category

        if "date" in data:
            valid, result = validate_date(data["date"])
            if not valid:
                return jsonify({"error": result}), 400
            update_data["date"] = data["date"]

        if "description" in data:
            valid, description = validate_description(data["description"])
            if not valid:
                return jsonify({"error": description}), 400
            update_data["description"] = description

        if "expense_type" in data:
            if data["expense_type"]:
                valid, msg = validate_expense_type(data["expense_type"])
                if not valid:
                    return jsonify({"error": msg}), 400
            update_data["expense_type"] = data["expense_type"]

        if "wallet_id" in data:
            valid, wallet_id = _resolve_wallet_id(
                data["wallet_id"], ObjectId(request.user_id)
            )
            if not valid:
                return jsonify({"error": wallet_id}), 400
            update_data["wallet_id"] = wallet_id

        update_data["updated_at"] = datetime.now()

        result = db.accounting_records_collection.update_one(
            query, {"$set": update_data}
        )

        if result.matched_count == 0:
            return jsonify({"error": "找不到該記錄"}), 404

        _cache_invalidate_user(request.user_id)
        logger.info(f"更新記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已更新"}), 200
    except Exception as e:
        logger.error(f"更新記帳記錄失敗: {e}")
        return jsonify({"error": "更新記錄失敗"}), 500


def _cleanup_record_photos(record):
    """刪除記錄後，把該記錄附加的照片檔案一併清掉，否則磁碟會留下永遠不會
    再被任何 API 存取到的孤兒檔案（DB 參照已經隨記錄一起沒了）。先刪檔案、
    檔案刪完才嘗試移除該記錄的照片目錄——目錄非空或不存在時 rmdir 會丟例外，
    直接忽略即可，不影響呼叫端刪除記錄本身的成功結果。"""
    photos = record.get("photos") or []
    if not photos:
        return
    photo_dir = _photo_dir(record["user_id"], record["_id"])
    for p in photos:
        try:
            (photo_dir / p["filename"]).unlink(missing_ok=True)
        except OSError as e:
            logger.warning(f"刪除記錄關聯照片檔案失敗: {e}")
    try:
        photo_dir.rmdir()
    except OSError:
        pass


@bp.route("/admin/api/accounting/records/<record_id>", methods=["DELETE"])
@limiter.limit("50 per minute")
@require_auth
def delete_accounting_record(record_id):
    """刪除記帳記錄"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        query = {
            "_id": ObjectId(record_id),
            "user_id": ObjectId(request.user_id),
        }

        deleted = db.accounting_records_collection.find_one_and_delete(query)

        if not deleted:
            return jsonify({"error": "找不到該記錄或無權限刪除"}), 404

        _cleanup_record_photos(deleted)

        # 刪除連動：若這筆支出曾觸發自動提領現金，一併刪除對應的轉帳記錄
        source_transfer_id = deleted.get("source_transfer_id")
        if source_transfer_id:
            transfer_query = {
                "_id": source_transfer_id,
                "user_id": ObjectId(request.user_id),
            }
            transfer_doc = db.accounting_records_collection.find_one(transfer_query)
            db.accounting_records_collection.delete_one(transfer_query)
            if transfer_doc:
                _cleanup_record_photos(transfer_doc)

        # 刪除連動：若這筆支出是解鎖受限資金時產生的，把來源記錄復原為受限狀態
        # （等同撤銷這次解鎖），而不是連帶刪除——那筆錢確實收到過，這個事實不該消失
        source_restricted_id = deleted.get("source_restricted_id")
        if source_restricted_id:
            db.accounting_records_collection.update_one(
                {"_id": source_restricted_id, "user_id": ObjectId(request.user_id)},
                {
                    "$set": {
                        "type": "restricted",
                        "unlocked_at": None,
                        "updated_at": datetime.now(),
                    }
                },
            )

        _cache_invalidate_user(request.user_id)
        logger.info(f"刪除記帳記錄: {record_id} (user: {request.email})")
        return jsonify({"message": "記帳記錄已刪除"}), 200
    except Exception as e:
        logger.error(f"刪除記帳記錄失敗: {e}")
        return jsonify({"error": "刪除記錄失敗"}), 500


@bp.route("/admin/api/accounting/records/transfer", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def add_transfer_record():
    """新增內部轉移記錄（使用者手動記錄的存錢/領錢，同一帳戶內的位置間資金移動，
    不計入收入/支出統計）"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        required_fields = [
            "wallet_id",
            "from_location",
            "to_location",
            "amount",
            "date",
        ]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"缺少必要欄位: {field}"}), 400

        user_oid = ObjectId(request.user_id)

        raw_wallet_id = data.get("wallet_id")
        if not raw_wallet_id:
            return jsonify({"error": "轉移必須指定帳戶"}), 400
        valid, wallet_id = _resolve_wallet_id(raw_wallet_id, user_oid)
        if not valid:
            return jsonify({"error": wallet_id}), 400

        valid, from_location = validate_location(
            data.get("from_location"), required=True
        )
        if not valid:
            return jsonify({"error": from_location}), 400

        valid, to_location = validate_location(data.get("to_location"), required=True)
        if not valid:
            return jsonify({"error": to_location}), 400

        if from_location == to_location:
            return jsonify({"error": "轉出與轉入位置不可相同"}), 400

        valid, result = validate_amount(data["amount"])
        if not valid:
            return jsonify({"error": result}), 400
        amount = result

        valid, result = validate_date(data["date"])
        if not valid:
            return jsonify({"error": result}), 400

        description = data.get("description", "")
        valid, description = validate_description(description)
        if not valid:
            return jsonify({"error": description}), 400

        record = {
            "user_id": user_oid,
            "type": "transfer",
            "wallet_id": wallet_id,
            "from_location": from_location,
            "to_location": to_location,
            "amount": amount,
            "date": data["date"],
            "description": description,
            "auto_generated": False,
            "photos": [],
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }

        result = db.accounting_records_collection.insert_one(record)
        _cache_invalidate_user(request.user_id)
        logger.info(f"新增內部轉移: {result.inserted_id} (user: {request.email})")
        return (
            jsonify({"message": "轉移已記錄", "id": str(result.inserted_id)}),
            201,
        )
    except Exception as e:
        logger.error(f"新增內部轉移失敗: {e}")
        return jsonify({"error": "新增轉移失敗"}), 500


@bp.route("/admin/api/accounting/records/<record_id>/unlock", methods=["POST"])
@limiter.limit("50 per minute")
@require_auth
def unlock_restricted_record(record_id):
    """解鎖受限資金：整筆轉為一般收入（沿用原本收到的日期），並新增一筆對應支出
    （日期由使用者指定，代表實際交出去的那天），代表這筆錢已經交出去了。
    不支援部分解鎖——金額在記錄當下就已經拆分清楚，解鎖時整筆一次處理。"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500

    if not validate_objectid(record_id):
        return jsonify({"error": "無效的記錄 ID"}), 400

    try:
        data = request.get_json(silent=True)
        if not data or "date" not in data:
            return jsonify({"error": "缺少必要欄位: date"}), 400

        valid, result = validate_date(data["date"])
        if not valid:
            return jsonify({"error": result}), 400
        unlock_date = data["date"]

        user_oid = ObjectId(request.user_id)
        record = db.accounting_records_collection.find_one(
            {"_id": ObjectId(record_id), "user_id": user_oid}
        )
        if not record:
            return jsonify({"error": "找不到該記錄或無權限操作"}), 404

        if record.get("type") != "restricted":
            return jsonify({"error": "只有受限資金記錄可以解鎖"}), 400
        if record.get("unlocked_at"):
            return jsonify({"error": "這筆受限資金已經解鎖過了"}), 400

        now = datetime.now()
        db.accounting_records_collection.update_one(
            {"_id": record["_id"]},
            {"$set": {"type": "income", "unlocked_at": now, "updated_at": now}},
        )

        desc = record.get("description") or ""
        expense_doc = {
            "type": "expense",
            "amount": record["amount"],
            "category": None,
            "date": unlock_date,
            "description": f"解鎖：{desc}" if desc else "解鎖受限資金",
            "expense_type": None,
            "wallet_id": record.get("wallet_id"),
            "location": record.get("location"),
            "source_transfer_id": None,
            "auto_generated": True,
            "source_restricted_id": record["_id"],
            "photos": [],
            "created_at": now,
            "updated_at": now,
            "user_id": user_oid,
        }
        result = db.accounting_records_collection.insert_one(expense_doc)

        _cache_invalidate_user(request.user_id)
        logger.info(
            f"解鎖受限資金 {record_id} → expense {result.inserted_id} "
            f"(user: {request.email})"
        )
        return (
            jsonify({"message": "已解鎖", "expense_id": str(result.inserted_id)}),
            201,
        )
    except Exception as e:
        logger.error(f"解鎖受限資金失敗: {e}")
        return jsonify({"error": "解鎖失敗"}), 500


def _collection_signature(collection, user_oid):
    """回傳 (count, max_updated_at)，供資料版本簽章使用。"""
    pipeline = [
        {"$match": {"user_id": user_oid}},
        {
            "$group": {
                "_id": None,
                "count": {"$sum": 1},
                "max_updated": {"$max": "$updated_at"},
            }
        },
    ]
    agg = list(collection.aggregate(pipeline))
    if not agg:
        return 0, None
    return agg[0]["count"], agg[0].get("max_updated")


def _compute_data_version(user_id):
    """對 records/budget/recurring/wallets 各取 count + max(updated_at)，串接後算
    MD5 作為使用者的資料版本簽章。由實際資料算出、自我修正：任一集合的新增（count
    變）、修改（max_updated 變）、刪除（count 變）都會改變此值。全域單一簽章，不細分
    月份/查詢條件，避免前端某些查詢條件遺漏更新（見離線同步 Phase 相關規劃）。

    已知邊界：BSON datetime 只有毫秒精度（非微秒），若同一份文件在同一毫秒內被
    連續寫入兩次，第二次可能不會反映在 max(updated_at) 上。實務上需伺服器端
    in-process 極速連續寫入才會撞到（正常 HTTP 往返不會），故接受此極窄風險，
    不為此引入需要在每個寫入點手動維護的計數器（見架構規劃的取捨）。"""
    user_oid = ObjectId(user_id)
    parts = []
    for name, collection in (
        ("records", db.accounting_records_collection),
        ("budget", db.accounting_budget_collection),
        ("recurring", db.recurring_collection),
        ("wallets", db.wallets_collection),
    ):
        count, max_updated = _collection_signature(collection, user_oid)
        ts = max_updated.isoformat() if max_updated else "none"
        parts.append(f"{name}:{count}:{ts}")
    signature = "|".join(parts)
    return hashlib.md5(signature.encode("utf-8")).hexdigest()


@bp.route("/admin/api/accounting/data-version", methods=["GET"])
@limiter.limit("200 per minute")
@require_auth
def get_data_version():
    """輕量更新檢查：回傳資料版本簽章（不透明字串）。前端比對本地快取記的上次版本，
    相同就沿用快取、不重抓完整資料；不同才真的去抓新資料。MD5 僅用來把複合值壓成
    短字串，非安全用途。"""
    if db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        version = _compute_data_version(request.user_id)
        return jsonify({"version": version}), 200
    except Exception as e:
        logger.error(f"計算資料版本失敗: {e}")
        return jsonify({"error": "計算資料版本失敗"}), 500
