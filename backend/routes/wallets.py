"""
routes/wallets.py — 資金錢包 API

錢包（wallet）代表同一登入帳號底下的不同資金來源（如「零用錢」「薪資帳戶」），
與 user_id（登入帳號）是獨立概念：一個 user 底下可以有多個 wallet。
records.wallet_id 為可選欄位，null 代表未分類（沿用既有記錄相容，不強制搬遷舊資料）。

GET    /admin/api/wallets                       列出錢包（預設不含已封存）
POST   /admin/api/wallets                       新增錢包
PUT    /admin/api/wallets/<id>                  更新錢包
DELETE /admin/api/wallets/<id>                  封存錢包（不刪除歷史關聯記錄）
GET    /admin/api/wallets/balances              各錢包即時餘額（含「未分類」）
GET    /admin/api/wallets/location-summary      帳戶 × 位置（銀行/現金）雙維度餘額
GET    /admin/api/wallets/<id>/balance-history  單一錢包近 N 月餘額變化
GET    /admin/api/wallets/restricted-funds      目前還鎖著的受限資金列表（未解鎖）
GET    /admin/api/wallets/<id>/flow-tree        單一錢包資金流向樹（銀行/現金/受限資金 + 三種明確關聯的加總）
"""

import logging
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, jsonify, request

import db
from extensions import limiter, require_auth, validate_objectid, validate_wallet_name

logger = logging.getLogger(__name__)

bp = Blueprint("wallets", __name__)

MAX_META_LENGTH = 40  # icon / color 等輔助欄位的長度上限


def _clean_meta(value):
    """icon/color 等可選輔助欄位：截斷長度，空字串正規化為 None"""
    text = str(value or "").strip()[:MAX_META_LENGTH]
    return text or None


def _serialize_wallet(w):
    return {
        "id": str(w["_id"]),
        "name": w.get("name", ""),
        "icon": w.get("icon"),
        "color": w.get("color"),
        "is_default": bool(w.get("is_default", False)),
        "archived": bool(w.get("archived", False)),
        "created_at": w["created_at"].isoformat() if w.get("created_at") else None,
    }


@bp.route("/admin/api/wallets", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_wallets():
    """列出使用者的錢包，預設不含已封存（?show_archived=true 可含）"""
    if db.wallets_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        query = {"user_id": user_oid}
        show_archived = request.args.get("show_archived", "false").lower() == "true"
        if not show_archived:
            query["archived"] = {"$ne": True}

        items = list(db.wallets_collection.find(query).sort("created_at", 1))
        return jsonify([_serialize_wallet(w) for w in items]), 200
    except Exception as e:
        logger.error(f"取得錢包列表失敗: {e}")
        return jsonify({"error": "取得錢包失敗"}), 500


@bp.route("/admin/api/wallets", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def create_wallet():
    """新增錢包"""
    if db.wallets_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        valid, name = validate_wallet_name(data.get("name"))
        if not valid:
            return jsonify({"error": name}), 400

        user_oid = ObjectId(request.user_id)
        is_default = bool(data.get("is_default", False))

        doc = {
            "user_id": user_oid,
            "name": name,
            "icon": _clean_meta(data.get("icon")),
            "color": _clean_meta(data.get("color")),
            "is_default": is_default,
            "archived": False,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }

        if is_default:
            # 同一使用者僅能有一個預設錢包
            db.wallets_collection.update_many(
                {"user_id": user_oid},
                {"$set": {"is_default": False, "updated_at": datetime.now()}},
            )

        result = db.wallets_collection.insert_one(doc)
        logger.info(f"新增錢包: {name} (user: {request.email})")
        return jsonify({"id": str(result.inserted_id), "message": "錢包已新增"}), 201
    except Exception as e:
        logger.error(f"新增錢包失敗: {e}")
        return jsonify({"error": "新增錢包失敗"}), 500


@bp.route("/admin/api/wallets/<wallet_id>", methods=["PUT"])
@limiter.limit("30 per minute")
@require_auth
def update_wallet(wallet_id):
    """更新錢包（改名／圖示／顏色／設為預設／封存還原）"""
    if db.wallets_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(wallet_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        wallet_oid = ObjectId(wallet_id)
        existing = db.wallets_collection.find_one(
            {"_id": wallet_oid, "user_id": user_oid}
        )
        if not existing:
            return jsonify({"error": "找不到該錢包或無權限修改"}), 404

        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "無效的請求資料"}), 400

        update_fields = {}

        if "name" in data:
            valid, name = validate_wallet_name(data["name"])
            if not valid:
                return jsonify({"error": name}), 400
            update_fields["name"] = name

        if "icon" in data:
            update_fields["icon"] = _clean_meta(data["icon"])

        if "color" in data:
            update_fields["color"] = _clean_meta(data["color"])

        if "archived" in data:
            update_fields["archived"] = bool(data["archived"])
            if update_fields["archived"]:
                update_fields["is_default"] = False

        if "is_default" in data and "archived" not in update_fields:
            is_default = bool(data["is_default"])
            update_fields["is_default"] = is_default
            if is_default:
                db.wallets_collection.update_many(
                    {"user_id": user_oid, "_id": {"$ne": wallet_oid}},
                    {"$set": {"is_default": False, "updated_at": datetime.now()}},
                )

        if not update_fields:
            return jsonify({"error": "沒有可更新的欄位"}), 400

        update_fields["updated_at"] = datetime.now()
        db.wallets_collection.update_one({"_id": wallet_oid}, {"$set": update_fields})
        logger.info(f"更新錢包 {wallet_id} (user: {request.email})")
        return jsonify({"message": "錢包已更新"}), 200
    except Exception as e:
        logger.error(f"更新錢包失敗: {e}")
        return jsonify({"error": "更新錢包失敗"}), 500


@bp.route("/admin/api/wallets/<wallet_id>", methods=["DELETE"])
@limiter.limit("30 per minute")
@require_auth
def archive_wallet(wallet_id):
    """封存錢包：不刪除歷史關聯記錄，只是不再出現在新增記錄的選單中"""
    if db.wallets_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(wallet_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        result = db.wallets_collection.update_one(
            {"_id": ObjectId(wallet_id), "user_id": ObjectId(request.user_id)},
            {
                "$set": {
                    "archived": True,
                    "is_default": False,
                    "updated_at": datetime.now(),
                }
            },
        )
        if result.matched_count == 0:
            return jsonify({"error": "找不到該錢包或無權限操作"}), 404

        logger.info(f"封存錢包 {wallet_id} (user: {request.email})")
        return jsonify({"message": "錢包已封存"}), 200
    except Exception as e:
        logger.error(f"封存錢包失敗: {e}")
        return jsonify({"error": "封存錢包失敗"}), 500


@bp.route("/admin/api/wallets/balances", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_wallet_balances():
    """各錢包即時餘額（收入 - 支出），含「未分類」（wallet_id 為 null 的記錄）"""
    if db.wallets_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)

        wallets = list(
            db.wallets_collection.find(
                {"user_id": user_oid, "archived": {"$ne": True}}
            ).sort("created_at", 1)
        )

        pipeline = [
            {"$match": {"user_id": user_oid}},
            {
                "$group": {
                    "_id": {"wallet_id": "$wallet_id", "type": "$type"},
                    "total": {"$sum": "$amount"},
                }
            },
        ]
        agg = list(db.accounting_records_collection.aggregate(pipeline))

        # wallet_id(字串或 None) -> {income, expense}
        # 注意：舊資料可能完全沒有 wallet_id 欄位，此時 MongoDB 的 $group _id
        # 會直接省略該 key（而非給 null），故一律用 .get() 讀取，不可用 []。
        sums = {}
        for row in agg:
            wid = row["_id"].get("wallet_id")
            key = str(wid) if wid else None
            bucket = sums.setdefault(key, {"income": 0.0, "expense": 0.0})
            rtype = row["_id"].get("type")
            bucket[rtype] = bucket.get(rtype, 0.0) + row["total"]

        def build(key, name, icon=None, color=None, is_default=False):
            s = sums.get(key, {"income": 0.0, "expense": 0.0})
            income = s.get("income", 0.0)
            expense = s.get("expense", 0.0)
            return {
                "wallet_id": key,
                "name": name,
                "icon": icon,
                "color": color,
                "is_default": is_default,
                "income": income,
                "expense": expense,
                "balance": income - expense,
            }

        result = [
            build(
                str(w["_id"]),
                w.get("name", ""),
                w.get("icon"),
                w.get("color"),
                bool(w.get("is_default", False)),
            )
            for w in wallets
        ]
        # 未分類：舊資料／尚未指定錢包的記錄，一律附加方便使用者核對總額
        result.append(build(None, "未分類"))

        return jsonify(result), 200
    except Exception as e:
        logger.error(f"取得錢包餘額失敗: {e}")
        return jsonify({"error": "取得錢包餘額失敗"}), 500


@bp.route("/admin/api/wallets/location-summary", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_wallet_location_summary():
    """帳戶 × 位置（銀行/現金）雙維度餘額：四組合、帳戶總計、位置總計一次回傳"""
    if db.wallets_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)

        wallets = list(
            db.wallets_collection.find(
                {"user_id": user_oid, "archived": {"$ne": True}}
            ).sort("created_at", 1)
        )

        # buckets[(wallet_key, location)] = {income, expense, transfer_in, transfer_out}
        # wallet_key 為字串或 None；location 為 "bank"/"cash"/None（None＝未分類位置，
        # 通常是此功能上線前的舊資料，沿用「未分類」錢包桶同樣的相容處理方式）
        buckets = {}

        def bucket_for(wallet_key, location):
            return buckets.setdefault(
                (wallet_key, location),
                {
                    "income": 0.0,
                    "expense": 0.0,
                    "transfer_in": 0.0,
                    "transfer_out": 0.0,
                },
            )

        io_pipeline = [
            {"$match": {"user_id": user_oid, "type": {"$in": ["income", "expense"]}}},
            {
                "$group": {
                    "_id": {
                        "wallet_id": "$wallet_id",
                        "location": "$location",
                        "type": "$type",
                    },
                    "total": {"$sum": "$amount"},
                }
            },
        ]
        for row in db.accounting_records_collection.aggregate(io_pipeline):
            # 注意：舊資料可能完全沒有 wallet_id/location 欄位，MongoDB 的 $group _id
            # 會直接省略該 key，一律用 .get() 讀取，不可用 [] 索引。
            wid = row["_id"].get("wallet_id")
            wallet_key = str(wid) if wid else None
            loc = row["_id"].get("location")
            rtype = row["_id"].get("type")
            b = bucket_for(wallet_key, loc)
            b[rtype] = b.get(rtype, 0.0) + row["total"]

        transfer_out_pipeline = [
            {"$match": {"user_id": user_oid, "type": "transfer"}},
            {
                "$group": {
                    "_id": {"wallet_id": "$wallet_id", "location": "$from_location"},
                    "total": {"$sum": "$amount"},
                }
            },
        ]
        for row in db.accounting_records_collection.aggregate(transfer_out_pipeline):
            wid = row["_id"].get("wallet_id")
            wallet_key = str(wid) if wid else None
            loc = row["_id"].get("location")
            bucket_for(wallet_key, loc)["transfer_out"] += row["total"]

        transfer_in_pipeline = [
            {"$match": {"user_id": user_oid, "type": "transfer"}},
            {
                "$group": {
                    "_id": {"wallet_id": "$wallet_id", "location": "$to_location"},
                    "total": {"$sum": "$amount"},
                }
            },
        ]
        for row in db.accounting_records_collection.aggregate(transfer_in_pipeline):
            wid = row["_id"].get("wallet_id")
            wallet_key = str(wid) if wid else None
            loc = row["_id"].get("location")
            bucket_for(wallet_key, loc)["transfer_in"] += row["total"]

        def location_balance(wallet_key, location):
            b = buckets.get((wallet_key, location))
            if not b:
                return 0.0
            return b["income"] - b["expense"] + b["transfer_in"] - b["transfer_out"]

        def wallet_entry(wallet_key, name, icon=None, color=None, is_default=False):
            locations = {
                loc: {"balance": location_balance(wallet_key, loc)}
                for loc in ("bank", "cash")
            }
            unclassified_balance = location_balance(wallet_key, None)
            total_balance = (
                sum(v["balance"] for v in locations.values()) + unclassified_balance
            )
            return {
                "wallet_id": wallet_key,
                "name": name,
                "icon": icon,
                "color": color,
                "is_default": is_default,
                "locations": locations,
                "unclassified_balance": unclassified_balance,
                "total_balance": total_balance,
            }

        result = [
            wallet_entry(
                str(w["_id"]),
                w.get("name", ""),
                w.get("icon"),
                w.get("color"),
                bool(w.get("is_default", False)),
            )
            for w in wallets
        ]
        result.append(wallet_entry(None, "未分類"))

        location_totals = {
            loc: sum(location_balance(entry["wallet_id"], loc) for entry in result)
            for loc in ("bank", "cash")
        }

        return jsonify({"wallets": result, "location_totals": location_totals}), 200
    except Exception as e:
        logger.error(f"取得帳戶位置餘額失敗: {e}")
        return jsonify({"error": "取得帳戶位置餘額失敗"}), 500


@bp.route("/admin/api/wallets/<wallet_id>/balance-history", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_wallet_balance_history(wallet_id):
    """單一錢包近 N 個月的月結餘變化（該月增減 + 累計餘額）"""
    if db.wallets_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(wallet_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        wallet_oid = ObjectId(wallet_id)

        wallet = db.wallets_collection.find_one(
            {"_id": wallet_oid, "user_id": user_oid}
        )
        if not wallet:
            return jsonify({"error": "找不到該錢包或無權限存取"}), 404

        try:
            months_count = int(request.args.get("months", 12))
        except (ValueError, TypeError):
            return jsonify({"error": "months 必須為整數"}), 400
        months_count = max(1, min(months_count, 24))

        pipeline = [
            {"$match": {"user_id": user_oid, "wallet_id": wallet_oid}},
            {
                "$group": {
                    "_id": {"$substr": ["$date", 0, 7]},
                    "income": {
                        "$sum": {"$cond": [{"$eq": ["$type", "income"]}, "$amount", 0]}
                    },
                    "expense": {
                        "$sum": {"$cond": [{"$eq": ["$type", "expense"]}, "$amount", 0]}
                    },
                }
            },
            {"$sort": {"_id": 1}},
        ]
        rows = list(db.accounting_records_collection.aggregate(pipeline))
        net_by_month = {r["_id"]: r["income"] - r["expense"] for r in rows}

        if not net_by_month:
            return (
                jsonify(
                    {
                        "wallet_id": wallet_id,
                        "months": [],
                        "net_changes": [],
                        "balances": [],
                    }
                ),
                200,
            )

        # 從最早有紀錄的月份開始逐月累計，確保回傳區間的累計餘額反映完整歷史
        # （不會因為只看最近 N 個月而讓起始餘額錯誤地從 0 起算）
        all_months = sorted(net_by_month.keys())
        cursor_year, cursor_month = int(all_months[0][:4]), int(all_months[0][5:7])
        now = datetime.now()
        running = 0.0
        full_balances = []  # [(month_str, net, cumulative_balance)]
        while (cursor_year, cursor_month) <= (now.year, now.month):
            month_str = f"{cursor_year:04d}-{cursor_month:02d}"
            net = net_by_month.get(month_str, 0.0)
            running += net
            full_balances.append((month_str, net, running))
            cursor_month += 1
            if cursor_month > 12:
                cursor_month = 1
                cursor_year += 1

        sliced = full_balances[-months_count:]

        return (
            jsonify(
                {
                    "wallet_id": wallet_id,
                    "months": [m for m, _, _ in sliced],
                    "net_changes": [n for _, n, _ in sliced],
                    "balances": [b for _, _, b in sliced],
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得錢包餘額歷史失敗: {e}")
        return jsonify({"error": "取得錢包餘額歷史失敗"}), 500


@bp.route("/admin/api/wallets/restricted-funds", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_restricted_funds():
    """列出目前所有還鎖著的受限資金（尚未解鎖），供錢包管理面板顯示總額與明細"""
    if db.wallets_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    try:
        user_oid = ObjectId(request.user_id)

        # 含已封存錢包：即使錢包後來被封存，受限記錄仍要能顯示原本的錢包名稱
        wallet_names = {
            str(w["_id"]): w.get("name", "")
            for w in db.wallets_collection.find({"user_id": user_oid})
        }

        items = list(
            db.accounting_records_collection.find(
                {"user_id": user_oid, "type": "restricted"}
            ).sort("date", -1)
        )

        result_items = []
        total = 0.0
        for item in items:
            wid = item.get("wallet_id")
            wallet_key = str(wid) if wid else None
            amount = item.get("amount", 0.0)
            total += amount
            linked_income_id = item.get("linked_income_id")
            result_items.append(
                {
                    "id": str(item["_id"]),
                    "amount": amount,
                    "description": item.get("description", ""),
                    "date": item.get("date"),
                    "wallet_id": wallet_key,
                    "wallet_name": wallet_names.get(wallet_key, "未分類"),
                    "location": item.get("location"),
                    "linked_income_id": (
                        str(linked_income_id) if linked_income_id else None
                    ),
                }
            )

        return jsonify({"total": total, "items": result_items}), 200
    except Exception as e:
        logger.error(f"取得受限資金列表失敗: {e}")
        return jsonify({"error": "取得受限資金失敗"}), 500


def _location_balances_for_wallet(user_oid, wallet_oid):
    """單一錢包的銀行/現金淨額（收入-支出+轉入-轉出），邏輯與 location-summary 相同、
    只是把彙總範圍收斂到單一 wallet_id，不需要撈出所有錢包再篩選。"""
    balances = {"bank": 0.0, "cash": 0.0}

    io_pipeline = [
        {
            "$match": {
                "user_id": user_oid,
                "wallet_id": wallet_oid,
                "type": {"$in": ["income", "expense"]},
            }
        },
        {
            "$group": {
                "_id": {"location": "$location", "type": "$type"},
                "total": {"$sum": "$amount"},
            }
        },
    ]
    for row in db.accounting_records_collection.aggregate(io_pipeline):
        loc = row["_id"].get("location")
        if loc not in balances:
            continue
        sign = 1 if row["_id"].get("type") == "income" else -1
        balances[loc] += sign * row["total"]

    transfer_pipeline = [
        {"$match": {"user_id": user_oid, "wallet_id": wallet_oid, "type": "transfer"}},
        {
            "$group": {
                "_id": None,
                "by_from": {"$push": {"loc": "$from_location", "amt": "$amount"}},
                "by_to": {"$push": {"loc": "$to_location", "amt": "$amount"}},
            }
        },
    ]
    agg = list(db.accounting_records_collection.aggregate(transfer_pipeline))
    if agg:
        for entry in agg[0]["by_from"]:
            if entry["loc"] in balances:
                balances[entry["loc"]] -= entry["amt"]
        for entry in agg[0]["by_to"]:
            if entry["loc"] in balances:
                balances[entry["loc"]] += entry["amt"]

    return balances


def _count_sum(match):
    """對 accounting_records_collection 做 {count, amount} 聚合的共用小工具"""
    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "count": {"$sum": 1}, "amount": {"$sum": "$amount"}}},
    ]
    agg = list(db.accounting_records_collection.aggregate(pipeline))
    if not agg:
        return {"count": 0, "amount": 0.0}
    return {"count": agg[0]["count"], "amount": agg[0]["amount"]}


@bp.route("/admin/api/wallets/<wallet_id>/flow-tree", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_wallet_flow_tree(wallet_id):
    """單一錢包的資金流向樹：銀行/現金淨額 + 受限資金目前鎖定總額，
    加上三種「已經記錄的明確關聯」邊的加總（次數 + 金額），全時間累計：
      銀行 → 現金：自動提領（現金不足時系統自動產生的轉帳，auto_generated=true）
      收入 → 受限資金：收入拆分（不分目前是否已解鎖，累計曾經拆出去的總額）
      受限資金 → 原位置：解鎖（source_restricted_id 不為空的支出；落在跟原受限
        記錄相同的 location，不是自動判斷現金/銀行——解鎖直接沿用 record.location）
    不做一般收入/支出的配對追蹤，只加總這三種欄位本身已經記錄的關聯。
    """
    if db.wallets_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未初始化"}), 500
    if not validate_objectid(wallet_id):
        return jsonify({"error": "無效的 ID"}), 400
    try:
        user_oid = ObjectId(request.user_id)
        wallet_oid = ObjectId(wallet_id)

        wallet = db.wallets_collection.find_one(
            {"_id": wallet_oid, "user_id": user_oid}
        )
        if not wallet:
            return jsonify({"error": "找不到該錢包或無權限存取"}), 404

        locations = _location_balances_for_wallet(user_oid, wallet_oid)

        auto_withdrawal = _count_sum(
            {
                "user_id": user_oid,
                "wallet_id": wallet_oid,
                "type": "transfer",
                "auto_generated": True,
            }
        )
        # 解鎖時原記錄的 type 會從 "restricted" 原地翻成 "income"（records.py 的
        # unlock_restricted_record），所以不能用 type=="restricted" 篩選——那樣
        # 解鎖後這筆就會從加總消失。restricted 文件建立當下一定會有 unlocked_at
        # 這個 key（鎖定中是 None、解鎖後是時間戳），一般收入不會有這個欄位，
        # 用 $exists 才能同時涵蓋「目前鎖定中」與「已解鎖」兩種狀態的歷史總額。
        restricted_split = _count_sum(
            {
                "user_id": user_oid,
                "wallet_id": wallet_oid,
                "unlocked_at": {"$exists": True},
            }
        )
        restricted_unlock = _count_sum(
            {
                "user_id": user_oid,
                "wallet_id": wallet_oid,
                "type": "expense",
                "source_restricted_id": {"$ne": None},
            }
        )
        restricted_locked = _count_sum(
            {
                "user_id": user_oid,
                "wallet_id": wallet_oid,
                "type": "restricted",
                "unlocked_at": None,
            }
        )

        return (
            jsonify(
                {
                    "wallet_id": wallet_id,
                    "wallet_name": wallet.get("name", ""),
                    "locations": {
                        "bank": {"balance": locations["bank"]},
                        "cash": {"balance": locations["cash"]},
                    },
                    "restricted_locked_total": restricted_locked["amount"],
                    "edges": {
                        "auto_withdrawal": auto_withdrawal,
                        "restricted_split": restricted_split,
                        "restricted_unlock": restricted_unlock,
                    },
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得資金流向樹失敗: {e}")
        return jsonify({"error": "取得資金流向樹失敗"}), 500
