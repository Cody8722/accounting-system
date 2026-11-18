"""
routes/categories.py — 使用者自訂分類

GET /api/user/categories  取得自訂分類設定（未設定時 config 為 null，前端用內建預設）
                          並附各分類的使用筆數（記錄 + 定期項目），供刪除/合併時提示
PUT /api/user/categories  儲存設定；可附 renames（改名/合併），連同舊記錄一起改

設定格式（存在 users.category_config）：
{
  "expense": [{"group", "icon", "color", "items": [leaf, ...]}, ...],
  "income":  [...],
  "leaf_colors": {leaf: "#rrggbb"},      # 細項個別顏色（沒設則沿用大類）
  "quick": {"expense": [leaf], "income": [leaf]}   # 手機記帳畫面的常用細項
}
記錄只存細項名稱（records.category），所以細項名稱在整份設定中必須唯一。
"""

import logging
import re
from datetime import datetime

import db
from bson import ObjectId
from extensions import _cache_invalidate_user, limiter, require_auth
from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

bp = Blueprint("categories", __name__)

MAX_NAME_LENGTH = 50
MAX_GROUPS_PER_TYPE = 40
MAX_ITEMS_PER_GROUP = 100
MAX_LEAVES_TOTAL = 400
MAX_QUICK_PER_TYPE = 12
MAX_RENAMES = 400

# 系統自動產生的分類（欠款還款同步），不可被使用者佔用
RESERVED_NAMES = frozenset({"債務收回", "債務償還"})

_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_ICON_RE = re.compile(r"^ti-[a-z0-9-]{1,40}$")
_TYPES = ("expense", "income")


def _clean_name(value, what):
    """回傳 (name, error)。名稱不可為空、不可過長，且不可含 '.' 或以 '$' 開頭
    （預算以名稱當 MongoDB 鍵，這兩種寫法會出問題）。"""
    if not isinstance(value, str):
        return None, f"{what}必須是文字"
    name = value.strip()
    if not name:
        return None, f"{what}不可為空"
    if len(name) > MAX_NAME_LENGTH:
        return None, f"{what}長度不可超過 {MAX_NAME_LENGTH} 個字元"
    if "." in name or name.startswith("$"):
        return None, f"{what}不可包含「.」或以「$」開頭"
    return name, None


def _clean_color(value, what):
    if not isinstance(value, str) or not _COLOR_RE.match(value):
        return None, f"{what}顏色格式須為 #rrggbb"
    return value.lower(), None


def validate_category_config(cfg):
    """驗證並整理設定。回傳 (clean_config, error)。"""
    if not isinstance(cfg, dict):
        return None, "分類設定格式錯誤"

    clean = {}
    leaf_type = {}  # leaf -> type，同時用來檢查唯一性
    total = 0

    for t in _TYPES:
        groups = cfg.get(t)
        if not isinstance(groups, list):
            return None, f"缺少 {t} 分類"
        if len(groups) > MAX_GROUPS_PER_TYPE:
            return None, f"大類最多 {MAX_GROUPS_PER_TYPE} 個"
        seen_groups = set()
        out_groups = []
        for g in groups:
            if not isinstance(g, dict):
                return None, "大類格式錯誤"
            gname, err = _clean_name(g.get("group"), "大類名稱")
            if err:
                return None, err
            if gname in seen_groups:
                return None, f"大類名稱重複：{gname}"
            seen_groups.add(gname)
            color, err = _clean_color(g.get("color"), f"大類「{gname}」")
            if err:
                return None, err
            icon = g.get("icon")
            if not isinstance(icon, str) or not _ICON_RE.match(icon):
                return None, f"大類「{gname}」圖示格式錯誤"
            items = g.get("items")
            if not isinstance(items, list) or len(items) > MAX_ITEMS_PER_GROUP:
                return (
                    None,
                    f"大類「{gname}」細項格式錯誤或超過 {MAX_ITEMS_PER_GROUP} 個",
                )
            out_items = []
            for it in items:
                leaf, err = _clean_name(it, "細項名稱")
                if err:
                    return None, err
                if leaf in RESERVED_NAMES:
                    return None, f"「{leaf}」為系統保留名稱"
                if leaf in leaf_type:
                    return None, f"細項名稱重複：{leaf}"
                leaf_type[leaf] = t
                out_items.append(leaf)
                total += 1
            out_groups.append(
                {"group": gname, "icon": icon, "color": color, "items": out_items}
            )
        clean[t] = out_groups

    if total > MAX_LEAVES_TOTAL:
        return None, f"細項總數最多 {MAX_LEAVES_TOTAL} 個"

    leaf_colors = cfg.get("leaf_colors", {})
    if not isinstance(leaf_colors, dict):
        return None, "細項顏色格式錯誤"
    clean_lc = {}
    for leaf, c in leaf_colors.items():
        if leaf not in leaf_type:
            return None, f"細項顏色對應的分類不存在：{leaf}"
        color, err = _clean_color(c, f"細項「{leaf}」")
        if err:
            return None, err
        clean_lc[leaf] = color
    clean["leaf_colors"] = clean_lc

    quick = cfg.get("quick", {})
    if not isinstance(quick, dict):
        return None, "常用細項格式錯誤"
    clean_quick = {}
    for t in _TYPES:
        lst = quick.get(t, [])
        if not isinstance(lst, list) or len(lst) > MAX_QUICK_PER_TYPE:
            return None, f"常用細項最多 {MAX_QUICK_PER_TYPE} 個"
        for leaf in lst:
            if leaf_type.get(leaf) != t:
                return None, f"常用細項不存在：{leaf}"
        clean_quick[t] = list(dict.fromkeys(lst))
    clean["quick"] = clean_quick
    return clean, None


def validate_renames(renames, leaves):
    """renames: [{from, to}]。from 必須已不在新設定、to 必須在新設定，
    這樣不會出現互換或串接（A→B 同時 B→A），可以安全地逐筆套用。"""
    if renames is None:
        return [], None
    if not isinstance(renames, list) or len(renames) > MAX_RENAMES:
        return None, "renames 格式錯誤"
    out = []
    seen = set()
    for r in renames:
        if not isinstance(r, dict):
            return None, "renames 格式錯誤"
        src, dst = r.get("from"), r.get("to")
        if not isinstance(src, str) or not isinstance(dst, str):
            return None, "renames 格式錯誤"
        src, dst = src.strip(), dst.strip()
        if src in leaves:
            return None, f"「{src}」仍在新設定中，不能當作改名來源"
        if dst not in leaves:
            return None, f"改名目標不存在：{dst}"
        if src in RESERVED_NAMES or not src:
            return None, "不可改動系統保留分類"
        if src in seen:
            return None, f"重複的改名來源：{src}"
        seen.add(src)
        out.append((src, dst))
    return out, None


def all_leaves(cfg):
    return {leaf for t in _TYPES for g in cfg.get(t, []) for leaf in g["items"]}


def custom_leaves(user_oid):
    """該使用者目前設定的所有細項名稱；未設定回空集合。預算驗證用。"""
    if db.users_collection is None:
        return set()
    user = db.users_collection.find_one({"_id": user_oid}, {"category_config": 1})
    cfg = (user or {}).get("category_config")
    return all_leaves(cfg) if isinstance(cfg, dict) else set()


def _apply_renames(user_oid, renames):
    """把舊記錄、定期項目、預算裡的分類名稱改成新名稱，回傳改了幾筆記錄。"""
    now = datetime.now()
    renamed_records = 0
    for src, dst in renames:
        res = db.accounting_records_collection.update_many(
            {"user_id": user_oid, "category": src},
            {"$set": {"category": dst, "updated_at": now}},
        )
        renamed_records += res.modified_count
        if db.recurring_collection is not None:
            db.recurring_collection.update_many(
                {"user_id": user_oid, "category": src},
                {"$set": {"category": dst, "updated_at": now}},
            )
        if db.accounting_budget_collection is not None:
            for doc in db.accounting_budget_collection.find(
                {"user_id": user_oid, f"budget.{src}": {"$exists": True}}
            ):
                budget = dict(doc.get("budget", {}))
                amount = budget.pop(src, 0)
                # 合併到已有預算的分類時金額相加
                budget[dst] = budget.get(dst, 0) + amount
                db.accounting_budget_collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"budget": budget, "updated_at": now}},
                )
    return renamed_records


def _usage(user_oid):
    usage = {}
    for coll in (db.accounting_records_collection, db.recurring_collection):
        if coll is None:
            continue
        for row in coll.aggregate(
            [
                {"$match": {"user_id": user_oid}},
                {"$group": {"_id": "$category", "n": {"$sum": 1}}},
            ]
        ):
            if row["_id"]:
                usage[row["_id"]] = usage.get(row["_id"], 0) + row["n"]
    return usage


@bp.route("/api/user/categories", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def get_categories():
    if db.users_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500
    try:
        user_oid = ObjectId(request.user_id)
        user = db.users_collection.find_one({"_id": user_oid}, {"category_config": 1})
        cfg = (user or {}).get("category_config")
        return (
            jsonify(
                {
                    "config": cfg if isinstance(cfg, dict) else None,
                    "usage": _usage(user_oid),
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"取得分類設定失敗: {e}")
        return jsonify({"error": "取得分類設定失敗"}), 500


@bp.route("/api/user/categories", methods=["PUT"])
@limiter.limit("30 per hour")
@require_auth
def save_categories():
    if db.users_collection is None or db.accounting_records_collection is None:
        return jsonify({"error": "資料庫未連線"}), 500
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or "config" not in data:
            return jsonify({"error": "無效的請求資料"}), 400

        user_oid = ObjectId(request.user_id)
        raw = data["config"]

        if raw is None:
            if data.get("renames"):
                return jsonify({"error": "還原預設時不能附帶改名"}), 400
            db.users_collection.update_one(
                {"_id": user_oid},
                {
                    "$unset": {"category_config": ""},
                    "$set": {"updated_at": datetime.now()},
                },
            )
            return jsonify({"message": "已還原預設分類", "config": None}), 200

        clean, err = validate_category_config(raw)
        if err:
            return jsonify({"error": err}), 400
        renames, err = validate_renames(data.get("renames"), all_leaves(clean))
        if err:
            return jsonify({"error": err}), 400

        renamed = _apply_renames(user_oid, renames) if renames else 0
        db.users_collection.update_one(
            {"_id": user_oid},
            {"$set": {"category_config": clean, "updated_at": datetime.now()}},
        )
        if renames:
            # 統計有 5 分鐘快取，改名後要清掉
            _cache_invalidate_user(request.user_id)

        logger.info(
            f"儲存分類設定（改名 {len(renames)} 項、影響 {renamed} 筆記錄）"
            f" (user: {request.email})"
        )
        return (
            jsonify(
                {"message": "分類已儲存", "config": clean, "renamed_records": renamed}
            ),
            200,
        )
    except Exception as e:
        logger.error(f"儲存分類設定失敗: {e}")
        return jsonify({"error": "儲存分類設定失敗"}), 500
