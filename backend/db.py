"""
db.py — MongoDB 連線模組

提供 module-level collection globals 及 init_db() 初始化函數。
所有 Blueprint 透過 `import db; db.<collection>` 存取，
確保在 request 時取到的是已初始化的 collection 物件。
"""

import logging
import os

from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient
from pymongo.errors import ConfigurationError

from extensions import SERVER_SELECTION_TIMEOUT_MS

load_dotenv()

logger = logging.getLogger(__name__)

# ==================== Module-level globals ====================
# 初始值為 None；呼叫 init_db() 後才會被賦值

client = None
accounting_records_collection = None
accounting_budget_collection = None
users_collection = None
recurring_collection = None
debts_collection = None
wallets_collection = None


def init_db():
    """
    建立 MongoDB 連線並初始化所有 collection globals。
    必須在 main.py 模組載入時（而非 if __name__=='__main__'）呼叫，
    以確保 mongomock patch 在測試時能正確攔截 MongoClient。
    """
    global client
    global accounting_records_collection
    global accounting_budget_collection
    global users_collection
    global recurring_collection
    global debts_collection
    global wallets_collection

    MONGO_URI = os.getenv("MONGO_URI")

    if not MONGO_URI:
        logger.warning("⚠️ 未設定 MONGO_URI，資料庫功能無法使用")
        return

    try:
        client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS,
            connectTimeoutMS=30000,
            socketTimeoutMS=30000,
            maxPoolSize=10,
            minPoolSize=0,
            maxIdleTimeMS=30000,
            retryWrites=True,
            retryReads=True,
        )
        client.admin.command("ping")

        # 依 MONGO_URI 決定資料庫（如 .../accounting_db_test）；
        # URI 未指定預設庫時 fallback 到 accounting_db。不寫死，避免測試 .env 連錯庫。
        try:
            accounting_db = client.get_default_database()
        except ConfigurationError:
            accounting_db = client["accounting_db"]
        logger.info(f"使用資料庫：{accounting_db.name}")
        accounting_records_collection = accounting_db["records"]
        accounting_budget_collection = accounting_db["budget"]
        users_collection = accounting_db["users"]
        recurring_collection = accounting_db["recurring"]
        debts_collection = accounting_db["debts"]
        wallets_collection = accounting_db["wallets"]

        _create_indexes()
        logger.info("✅ 已連接到記帳資料庫")
    except Exception as e:
        logger.error(f"❌ MongoDB 連線失敗: {e}")
        client = None


def _create_indexes():
    """建立索引以優化查詢效能（背景執行避免阻塞）。"""
    try:
        # 記帳記錄索引
        accounting_records_collection.create_index(
            [("date", ASCENDING)], background=True
        )
        accounting_records_collection.create_index(
            [("type", ASCENDING)], background=True
        )
        accounting_records_collection.create_index(
            [("category", ASCENDING)], background=True
        )
        accounting_records_collection.create_index(
            [("user_id", ASCENDING)], background=True
        )
        accounting_records_collection.create_index(
            [("user_id", ASCENDING), ("date", ASCENDING)], background=True
        )
        accounting_records_collection.create_index(
            [("user_id", ASCENDING), ("type", ASCENDING), ("date", ASCENDING)],
            background=True,
        )
        accounting_records_collection.create_index(
            [
                ("user_id", ASCENDING),
                ("category", ASCENDING),
                ("date", ASCENDING),
            ],
            background=True,
        )

        # 預算索引（複合唯一索引）
        try:
            accounting_budget_collection.drop_index("month_1")
        except Exception as e:
            logger.debug(f"無法刪除舊索引 month_1: {str(e)}")
        accounting_budget_collection.create_index(
            [("user_id", ASCENDING), ("month", ASCENDING)],
            unique=True,
            background=True,
        )

        # 用戶索引
        users_collection.create_index(
            [("email", ASCENDING)], unique=True, background=True
        )
        users_collection.create_index(
            [("password_reset_token", ASCENDING)], background=True
        )

        # 定期支出索引
        recurring_collection.create_index([("user_id", ASCENDING)], background=True)
        recurring_collection.create_index(
            [("user_id", ASCENDING), ("day_of_month", ASCENDING)],
            background=True,
        )

        # 欠款追蹤索引
        debts_collection.create_index([("user_id", ASCENDING)], background=True)
        debts_collection.create_index(
            [("user_id", ASCENDING), ("debt_type", ASCENDING)], background=True
        )
        debts_collection.create_index(
            [("user_id", ASCENDING), ("is_settled", ASCENDING)], background=True
        )

        # 錢包索引
        wallets_collection.create_index([("user_id", ASCENDING)], background=True)
        wallets_collection.create_index(
            [("user_id", ASCENDING), ("archived", ASCENDING)], background=True
        )
        # 記帳記錄依錢包查詢/聚合（餘額計算、篩選）
        accounting_records_collection.create_index(
            [("user_id", ASCENDING), ("wallet_id", ASCENDING)], background=True
        )
        # 帳戶 × 位置雙維度餘額聚合（wallets/location-summary、支出自動判斷位置）
        accounting_records_collection.create_index(
            [("user_id", ASCENDING), ("wallet_id", ASCENDING), ("location", ASCENDING)],
            background=True,
        )
        # 離線同步冪等去重：同一使用者同一 client_id 只允許一筆。partial 只約束「有 client_id」
        # 的記錄，既有/線上不帶 client_id 的記錄完全不受影響。放最後：舊版 mongomock 若不支援
        # partialFilterExpression 而拋錯，前面的索引都已建立，只有這條被外層 except 記為警告。
        accounting_records_collection.create_index(
            [("user_id", ASCENDING), ("client_id", ASCENDING)],
            unique=True,
            partialFilterExpression={"client_id": {"$exists": True}},
            background=True,
        )

        logger.info("✅ 資料庫索引已建立（背景執行）")
    except Exception as index_error:
        logger.warning(f"⚠️ 索引建立警告: {index_error}")
