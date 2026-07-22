"""
資金錢包模組 API 測試 (test_wallets.py)

覆蓋 wallets.py 全部端點，以及 records.py/stats.py 因錢包功能新增的
wallet_id 欄位與 wallet_ids/categories 多值篩選參數。
"""

import os
import sys
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from bson import ObjectId

# 設定環境變數（必須在 import main 之前）
os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module
import db as db_module

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.url_map.strict_slashes = False
    with app.test_client() as c:
        yield c


@pytest.fixture
def auth_headers():
    """固定 user_id 的 JWT headers（直接產生，不走 register/login）"""
    token = auth_module.generate_jwt(
        "000000000000000000000101", "wallet_test@example.com", "Wallet Test User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    """第二個用戶的 auth headers，用於用戶隔離測試"""
    token = auth_module.generate_jwt(
        "000000000000000000000102", "wallet_other@example.com", "Other User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def created_wallet_id(client, auth_headers):
    """建立一筆錢包並回傳其 ID"""
    r = client.post("/admin/api/wallets", json={"name": "零用錢"}, headers=auth_headers)
    assert r.status_code == 201
    return r.get_json()["id"]


def _record_payload(
    amount, record_type="expense", category="測試", date=None, wallet_id=None
):
    payload = {
        "type": record_type,
        "amount": amount,
        "category": category,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
    }
    if wallet_id is not None:
        payload["wallet_id"] = wallet_id
    # 這裡的測試都在驗證錢包/分類相關行為，不是位置雙維度功能本身，
    # 一律帶最省事的值避開 income 必填 location、expense 現金不足 409 的干擾。
    if record_type == "income":
        payload["location"] = "cash"
    elif record_type == "expense":
        payload["confirm_withdrawal"] = True
    return payload


# ---------------------------------------------------------------------------
# TestCreateWallet
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestCreateWallet:
    def test_create_returns_201(self, client, auth_headers):
        r = client.post(
            "/admin/api/wallets", json={"name": "零用錢"}, headers=auth_headers
        )
        assert r.status_code == 201
        assert "id" in r.get_json()

    def test_create_missing_name_returns_400(self, client, auth_headers):
        r = client.post("/admin/api/wallets", json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_create_empty_name_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/wallets", json={"name": "   "}, headers=auth_headers
        )
        assert r.status_code == 400

    def test_create_name_too_long_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/wallets", json={"name": "x" * 31}, headers=auth_headers
        )
        assert r.status_code == 400

    def test_create_with_icon_and_color(self, client, auth_headers):
        r = client.post(
            "/admin/api/wallets",
            json={"name": "薪資帳戶", "icon": "ti-cash", "color": "#3f8f66"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        wid = r.get_json()["id"]
        list_r = client.get("/admin/api/wallets", headers=auth_headers)
        found = next(w for w in list_r.get_json() if w["id"] == wid)
        assert found["icon"] == "ti-cash"
        assert found["color"] == "#3f8f66"

    def test_no_auth_returns_401(self, client):
        r = client.post("/admin/api/wallets", json={"name": "零用錢"})
        assert r.status_code == 401

    def test_second_default_clears_first(self, client, auth_headers):
        r1 = client.post(
            "/admin/api/wallets",
            json={"name": "A", "is_default": True},
            headers=auth_headers,
        )
        r2 = client.post(
            "/admin/api/wallets",
            json={"name": "B", "is_default": True},
            headers=auth_headers,
        )
        assert r1.status_code == 201 and r2.status_code == 201

        items = client.get("/admin/api/wallets", headers=auth_headers).get_json()
        defaults = [w for w in items if w["is_default"]]
        assert len(defaults) == 1
        assert defaults[0]["name"] == "B"


# ---------------------------------------------------------------------------
# TestGetWallets
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestGetWallets:
    def test_list_excludes_archived_by_default(
        self, client, auth_headers, created_wallet_id
    ):
        client.delete(f"/admin/api/wallets/{created_wallet_id}", headers=auth_headers)
        items = client.get("/admin/api/wallets", headers=auth_headers).get_json()
        assert all(w["id"] != created_wallet_id for w in items)

    def test_list_with_show_archived(self, client, auth_headers, created_wallet_id):
        client.delete(f"/admin/api/wallets/{created_wallet_id}", headers=auth_headers)
        items = client.get(
            "/admin/api/wallets?show_archived=true", headers=auth_headers
        ).get_json()
        found = next(w for w in items if w["id"] == created_wallet_id)
        assert found["archived"] is True

    def test_users_do_not_see_each_others_wallets(
        self, client, auth_headers, other_auth_headers, created_wallet_id
    ):
        items = client.get("/admin/api/wallets", headers=other_auth_headers).get_json()
        assert all(w["id"] != created_wallet_id for w in items)


# ---------------------------------------------------------------------------
# TestUpdateWallet
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestUpdateWallet:
    def test_rename(self, client, auth_headers, created_wallet_id):
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}",
            json={"name": "私房錢"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        items = client.get("/admin/api/wallets", headers=auth_headers).get_json()
        found = next(w for w in items if w["id"] == created_wallet_id)
        assert found["name"] == "私房錢"

    def test_invalid_name_rejected(self, client, auth_headers, created_wallet_id):
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}",
            json={"name": ""},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_empty_body_returns_400(self, client, auth_headers, created_wallet_id):
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}", json={}, headers=auth_headers
        )
        assert r.status_code == 400

    def test_invalid_id_returns_400(self, client, auth_headers):
        r = client.put(
            "/admin/api/wallets/not-an-id", json={"name": "x"}, headers=auth_headers
        )
        assert r.status_code == 400

    def test_update_icon_only(self, client, auth_headers, created_wallet_id):
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}",
            json={"icon": "ti-home"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        items = client.get("/admin/api/wallets", headers=auth_headers).get_json()
        found = next(w for w in items if w["id"] == created_wallet_id)
        assert found["icon"] == "ti-home"

    def test_update_color_only(self, client, auth_headers, created_wallet_id):
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}",
            json={"color": "#abcdef"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        items = client.get("/admin/api/wallets", headers=auth_headers).get_json()
        found = next(w for w in items if w["id"] == created_wallet_id)
        assert found["color"] == "#abcdef"

    def test_unrecognized_fields_only_returns_400(
        self, client, auth_headers, created_wallet_id
    ):
        """body 非空但沒有任何可辨識欄位（name/icon/color/archived/is_default）→ 400"""
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}",
            json={"foo": "bar"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_nonexistent_id_returns_404(self, client, auth_headers):
        fake_id = str(ObjectId())
        r = client.put(
            f"/admin/api/wallets/{fake_id}", json={"name": "x"}, headers=auth_headers
        )
        assert r.status_code == 404

    def test_other_users_wallet_returns_404(
        self, client, other_auth_headers, created_wallet_id
    ):
        r = client.put(
            f"/admin/api/wallets/{created_wallet_id}",
            json={"name": "偷改"},
            headers=other_auth_headers,
        )
        assert r.status_code == 404

    def test_set_is_default_clears_others(self, client, auth_headers):
        client.post(
            "/admin/api/wallets",
            json={"name": "A", "is_default": True},
            headers=auth_headers,
        )
        r2 = client.post("/admin/api/wallets", json={"name": "B"}, headers=auth_headers)
        wid_b = r2.get_json()["id"]

        client.put(
            f"/admin/api/wallets/{wid_b}",
            json={"is_default": True},
            headers=auth_headers,
        )
        items = client.get("/admin/api/wallets", headers=auth_headers).get_json()
        defaults = [w for w in items if w["is_default"]]
        assert len(defaults) == 1
        assert defaults[0]["id"] == wid_b

    def test_archiving_clears_default(self, client, auth_headers):
        r = client.post(
            "/admin/api/wallets",
            json={"name": "A", "is_default": True},
            headers=auth_headers,
        )
        wid = r.get_json()["id"]
        client.put(
            f"/admin/api/wallets/{wid}", json={"archived": True}, headers=auth_headers
        )
        items = client.get(
            "/admin/api/wallets?show_archived=true", headers=auth_headers
        ).get_json()
        found = next(w for w in items if w["id"] == wid)
        assert found["archived"] is True
        assert found["is_default"] is False


# ---------------------------------------------------------------------------
# TestArchiveWallet (DELETE = 封存，不是硬刪除)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestArchiveWallet:
    def test_archive_does_not_delete_document(
        self, client, auth_headers, created_wallet_id
    ):
        r = client.delete(
            f"/admin/api/wallets/{created_wallet_id}", headers=auth_headers
        )
        assert r.status_code == 200
        items = client.get(
            "/admin/api/wallets?show_archived=true", headers=auth_headers
        ).get_json()
        assert any(w["id"] == created_wallet_id for w in items)

    def test_archive_preserves_linked_records_wallet_id(
        self, client, auth_headers, created_wallet_id
    ):
        """封存錢包後，歷史記錄的 wallet_id 關聯應完整保留（不因封存而被清空）"""
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100, wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        client.delete(f"/admin/api/wallets/{created_wallet_id}", headers=auth_headers)

        # 篩選 type=expense：避免現金不足時系統自動產生的提領轉帳記錄
        # （同樣掛在這個 wallet_id 下）干擾這裡要驗證的「wallet_id 關聯有無保留」
        records = client.get(
            f"/admin/api/accounting/records?wallet_ids={created_wallet_id}&type=expense",
            headers=auth_headers,
        ).get_json()
        assert records["total"] == 1

    def test_other_users_wallet_returns_404(
        self, client, other_auth_headers, created_wallet_id
    ):
        r = client.delete(
            f"/admin/api/wallets/{created_wallet_id}", headers=other_auth_headers
        )
        assert r.status_code == 404

    def test_invalid_id_returns_400(self, client, auth_headers):
        r = client.delete("/admin/api/wallets/not-an-id", headers=auth_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# TestWalletBalances
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestWalletBalances:
    def test_balance_reflects_income_minus_expense(self, client, auth_headers):
        w = client.post(
            "/admin/api/wallets", json={"name": "零用錢"}, headers=auth_headers
        )
        wid = w.get_json()["id"]
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(1000, "income", wallet_id=wid),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(300, "expense", wallet_id=wid),
            headers=auth_headers,
        )

        balances = client.get(
            "/admin/api/wallets/balances", headers=auth_headers
        ).get_json()
        found = next(b for b in balances if b["wallet_id"] == wid)
        assert found["income"] == 1000
        assert found["expense"] == 300
        assert found["balance"] == 700

    def test_unclassified_bucket_present(self, client, auth_headers):
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(500, "income"),  # 不帶 wallet_id
            headers=auth_headers,
        )
        balances = client.get(
            "/admin/api/wallets/balances", headers=auth_headers
        ).get_json()
        unclassified = next(b for b in balances if b["wallet_id"] is None)
        assert unclassified["name"] == "未分類"
        assert unclassified["income"] >= 500

    def test_archived_wallet_excluded_from_list(
        self, client, auth_headers, created_wallet_id
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(200, "income", wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        client.delete(f"/admin/api/wallets/{created_wallet_id}", headers=auth_headers)

        balances = client.get(
            "/admin/api/wallets/balances", headers=auth_headers
        ).get_json()
        assert all(b["wallet_id"] != created_wallet_id for b in balances)

    def test_new_wallet_with_no_records_has_zero_balance(
        self, client, auth_headers, created_wallet_id
    ):
        balances = client.get(
            "/admin/api/wallets/balances", headers=auth_headers
        ).get_json()
        found = next(b for b in balances if b["wallet_id"] == created_wallet_id)
        assert found["balance"] == 0

    def test_legacy_record_without_wallet_id_field_does_not_crash(
        self, client, auth_headers
    ):
        """舊資料（此功能上線前建立的記錄）完全沒有 wallet_id 欄位，
        而非顯式設為 None——MongoDB 的 $group _id 會直接省略該 key，
        端點需以 .get() 讀取，不可用 [] 直接索引，否則 KeyError 500。"""
        if db_module.accounting_records_collection is None:
            pytest.skip("DB not available")
        legacy_doc = {
            "user_id": ObjectId("000000000000000000000101"),
            "type": "income",
            "amount": 500,
            "category": "測試",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": "",
        }
        db_module.accounting_records_collection.insert_one(legacy_doc)

        r = client.get("/admin/api/wallets/balances", headers=auth_headers)
        assert r.status_code == 200
        balances = r.get_json()
        unclassified = next(b for b in balances if b["wallet_id"] is None)
        assert unclassified["income"] >= 500


# ---------------------------------------------------------------------------
# TestWalletBalanceHistory
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestWalletBalanceHistory:
    def test_empty_wallet_returns_empty_arrays(
        self, client, auth_headers, created_wallet_id
    ):
        r = client.get(
            f"/admin/api/wallets/{created_wallet_id}/balance-history",
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.get_json()
        assert data["months"] == []
        assert data["balances"] == []

    def test_cumulative_balance_across_months(
        self, client, auth_headers, created_wallet_id
    ):
        """兩個不同月份各記一筆，第二個月的累計餘額應包含第一個月的結餘"""
        now = datetime.now()
        this_month = now.strftime("%Y-%m-%d")
        # 上個月（用日期減 32 天確保跨月，再取當月 1 號避免月底邊界問題）
        prev = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m-%d")

        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(
                1000, "income", date=prev, wallet_id=created_wallet_id
            ),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(
                200, "expense", date=this_month, wallet_id=created_wallet_id
            ),
            headers=auth_headers,
        )

        r = client.get(
            f"/admin/api/wallets/{created_wallet_id}/balance-history?months=12",
            headers=auth_headers,
        )
        data = r.get_json()
        assert len(data["months"]) >= 2
        # 累計餘額應單調反映 1000 收入後扣 200 支出 = 800（最終月）
        assert data["balances"][-1] == 800

    def test_cumulative_balance_crosses_year_boundary(
        self, client, auth_headers, created_wallet_id
    ):
        """記錄跨年份（去年12月），累計月結餘迴圈須正確處理 12→1 月的年份進位"""
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(
                600, "income", date="2025-12-15", wallet_id=created_wallet_id
            ),
            headers=auth_headers,
        )

        r = client.get(
            f"/admin/api/wallets/{created_wallet_id}/balance-history?months=24",
            headers=auth_headers,
        )
        data = r.get_json()
        assert "2025-12" in data["months"]
        assert "2026-01" in data["months"]
        # 跨年之後累計餘額應延續，不會在年份進位時被錯誤重置
        dec_idx = data["months"].index("2025-12")
        jan_idx = data["months"].index("2026-01")
        assert jan_idx == dec_idx + 1
        assert data["balances"][jan_idx] == data["balances"][dec_idx]

    def test_months_param_clamped(self, client, auth_headers, created_wallet_id):
        r = client.get(
            f"/admin/api/wallets/{created_wallet_id}/balance-history?months=999",
            headers=auth_headers,
        )
        assert r.status_code == 200  # 應被夾在上限 24，不報錯

    def test_invalid_months_param_returns_400(
        self, client, auth_headers, created_wallet_id
    ):
        r = client.get(
            f"/admin/api/wallets/{created_wallet_id}/balance-history?months=abc",
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_other_users_wallet_returns_404(
        self, client, other_auth_headers, created_wallet_id
    ):
        r = client.get(
            f"/admin/api/wallets/{created_wallet_id}/balance-history",
            headers=other_auth_headers,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TestRecordWalletIdIntegration — records.py 新增的 wallet_id 欄位
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestRecordWalletIdIntegration:
    def test_create_record_with_valid_wallet_id(
        self, client, auth_headers, created_wallet_id
    ):
        r = client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100, wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        assert r.status_code == 201

    def test_create_record_without_wallet_id_defaults_null(self, client, auth_headers):
        r = client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100),
            headers=auth_headers,
        )
        assert r.status_code == 201
        rid = r.get_json()["id"]
        rec = client.get(
            f"/admin/api/accounting/records/{rid}", headers=auth_headers
        ).get_json()
        assert rec.get("wallet_id") is None

    def test_create_record_with_invalid_wallet_id_format_returns_400(
        self, client, auth_headers
    ):
        r = client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100, wallet_id="not-an-object-id"),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_record_with_other_users_wallet_id_rejected(
        self, client, other_auth_headers, created_wallet_id
    ):
        """跨用戶安全測試：不能把別人的錢包 ID 掛到自己的記錄上"""
        r = client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100, wallet_id=created_wallet_id),
            headers=other_auth_headers,
        )
        assert r.status_code == 400

    def test_update_record_wallet_id(self, client, auth_headers, created_wallet_id):
        create_r = client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100),
            headers=auth_headers,
        )
        rid = create_r.get_json()["id"]

        put_r = client.put(
            f"/admin/api/accounting/records/{rid}",
            json={"wallet_id": created_wallet_id},
            headers=auth_headers,
        )
        assert put_r.status_code == 200
        rec = client.get(
            f"/admin/api/accounting/records/{rid}", headers=auth_headers
        ).get_json()
        assert rec.get("wallet_id", {}).get("$oid") == created_wallet_id

    def test_update_record_wallet_id_to_null_unassigns(
        self, client, auth_headers, created_wallet_id
    ):
        create_r = client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100, wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        rid = create_r.get_json()["id"]

        put_r = client.put(
            f"/admin/api/accounting/records/{rid}",
            json={"wallet_id": None},
            headers=auth_headers,
        )
        assert put_r.status_code == 200
        rec = client.get(
            f"/admin/api/accounting/records/{rid}", headers=auth_headers
        ).get_json()
        assert rec.get("wallet_id") is None


# ---------------------------------------------------------------------------
# TestRecordsWalletCategoryFilter — records.py GET 的多值篩選
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestRecordsWalletCategoryFilter:
    def test_filter_by_single_wallet_id(self, client, auth_headers, created_wallet_id):
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(100, wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(200),  # 未分類
            headers=auth_headers,
        )

        # 篩選 type=expense：避免現金不足時系統自動產生的提領轉帳記錄
        # （同樣掛在這個 wallet_id 下）干擾這裡要驗證的 wallet_id 篩選邏輯
        r = client.get(
            f"/admin/api/accounting/records?wallet_ids={created_wallet_id}&type=expense",
            headers=auth_headers,
        )
        data = r.get_json()
        assert data["total"] == 1
        assert data["records"][0]["amount"] == 100

    def test_filter_by_multiple_categories(self, client, auth_headers):
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(50, category="早餐"),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(60, category="午餐"),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(70, category="晚餐"),
            headers=auth_headers,
        )

        r = client.get(
            "/admin/api/accounting/records?categories=早餐,午餐",
            headers=auth_headers,
        )
        data = r.get_json()
        cats = {rec["category"] for rec in data["records"]}
        assert cats == {"早餐", "午餐"}

    def test_invalid_wallet_id_in_list_returns_400(self, client, auth_headers):
        r = client.get(
            "/admin/api/accounting/records?wallet_ids=not-an-id",
            headers=auth_headers,
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# TestStatsWalletCategoryFilter — stats.py 的篩選 + cache key 正確性
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestStatsWalletCategoryFilter:
    def test_stats_respects_wallet_filter(
        self, client, auth_headers, created_wallet_id
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(1000, "income", wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(9999, "income"),  # 未分類，不應計入篩選後結果
            headers=auth_headers,
        )

        r = client.get(
            f"/admin/api/accounting/stats?wallet_ids={created_wallet_id}",
            headers=auth_headers,
        )
        data = r.get_json()
        assert data["total_income"] == 1000

    def test_different_filters_do_not_share_stale_cache(
        self, client, auth_headers, created_wallet_id
    ):
        """回歸測試：cache key 必須納入 wallet_ids/categories，
        否則切換篩選條件會錯誤地拿到另一個篩選條件的快取結果。"""
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(1000, "income", wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(500, "income"),  # 未分類
            headers=auth_headers,
        )

        filtered = client.get(
            f"/admin/api/accounting/stats?wallet_ids={created_wallet_id}",
            headers=auth_headers,
        ).get_json()
        unfiltered = client.get(
            "/admin/api/accounting/stats", headers=auth_headers
        ).get_json()

        # filtered 為此測試專屬的新錢包，精準可斷言絕對值；unfiltered 因固定 user_id
        # 跨測試共用（mongomock 不逐測試重置）會疊加其他測試的收入，故只驗證相對關係：
        # 未篩選一定要「比篩選後多至少 500」（那筆未分類記錄），且兩者結果不同——
        # 這正是回歸要防的事：cache key 沒納入 wallet_ids 時，兩者會被誤判成同一份快取。
        assert filtered["total_income"] == 1000
        assert unfiltered["total_income"] >= filtered["total_income"] + 500
        assert unfiltered["total_income"] != filtered["total_income"]

    def test_trends_respects_wallet_filter(
        self, client, auth_headers, created_wallet_id
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(300, "expense", wallet_id=created_wallet_id),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_record_payload(9999, "expense"),  # 未分類
            headers=auth_headers,
        )

        r = client.get(
            f"/admin/api/accounting/trends?wallet_ids={created_wallet_id}",
            headers=auth_headers,
        )
        data = r.get_json()
        assert sum(data["expense"]) == 300


# ---------------------------------------------------------------------------
# TestDBNullPaths — 比照 test_validation_errors.py 既有慣例，覆蓋各端點
# DB 未初始化時的防禦性 check
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestDBNullPaths:
    def test_get_wallets_db_null(self, client, auth_headers):
        with patch.object(db_module, "wallets_collection", None):
            r = client.get("/admin/api/wallets", headers=auth_headers)
        assert r.status_code == 500

    def test_create_wallet_db_null(self, client, auth_headers):
        with patch.object(db_module, "wallets_collection", None):
            r = client.post(
                "/admin/api/wallets", json={"name": "x"}, headers=auth_headers
            )
        assert r.status_code == 500

    def test_update_wallet_db_null(self, client, auth_headers):
        fake_id = str(ObjectId())
        with patch.object(db_module, "wallets_collection", None):
            r = client.put(
                f"/admin/api/wallets/{fake_id}",
                json={"name": "x"},
                headers=auth_headers,
            )
        assert r.status_code == 500

    def test_archive_wallet_db_null(self, client, auth_headers):
        fake_id = str(ObjectId())
        with patch.object(db_module, "wallets_collection", None):
            r = client.delete(f"/admin/api/wallets/{fake_id}", headers=auth_headers)
        assert r.status_code == 500

    def test_get_wallet_balances_db_null(self, client, auth_headers):
        with patch.object(db_module, "wallets_collection", None):
            r = client.get("/admin/api/wallets/balances", headers=auth_headers)
        assert r.status_code == 500

    def test_get_wallet_balance_history_db_null(self, client, auth_headers):
        fake_id = str(ObjectId())
        with patch.object(db_module, "wallets_collection", None):
            r = client.get(
                f"/admin/api/wallets/{fake_id}/balance-history", headers=auth_headers
            )
        assert r.status_code == 500
