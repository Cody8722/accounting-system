"""
帳戶 × 位置雙維度功能測試 (test_wallet_locations.py)

覆蓋 records.py 新增的 location 欄位（income 必填、expense 自動判斷）、
支出現金不足時的提領確認流程、內部轉移端點（POST .../records/transfer）、
wallets.py 的 location-summary 端點，以及 PUT/DELETE 對這些新欄位的限制。
"""

import os
import sys
from datetime import datetime

import pytest
from bson import ObjectId

os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module
import db as db_module


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.url_map.strict_slashes = False
    with app.test_client() as c:
        yield c


@pytest.fixture
def auth_headers():
    token = auth_module.generate_jwt(
        "000000000000000000000201", "location_test@example.com", "Location Test User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    token = auth_module.generate_jwt(
        "000000000000000000000202", "location_other@example.com", "Other User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def wallet_a(client, auth_headers):
    """建立一個帳戶（帳戶A）並回傳其 ID"""
    r = client.post("/admin/api/wallets", json={"name": "帳戶A"}, headers=auth_headers)
    assert r.status_code == 201
    return r.get_json()["id"]


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _income(amount, wallet_id, location="bank", category="測試"):
    return {
        "type": "income",
        "amount": amount,
        "category": category,
        "date": _today(),
        "wallet_id": wallet_id,
        "location": location,
    }


def _expense(amount, wallet_id, category="測試", confirm=False):
    payload = {
        "type": "expense",
        "amount": amount,
        "category": category,
        "date": _today(),
        "wallet_id": wallet_id,
    }
    if confirm:
        payload["confirm_withdrawal"] = True
    return payload


def _transfer(wallet_id, from_location, to_location, amount, description=""):
    return {
        "wallet_id": wallet_id,
        "from_location": from_location,
        "to_location": to_location,
        "amount": amount,
        "date": _today(),
        "description": description,
    }


# ---------------------------------------------------------------------------
# TestIncomeLocation
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestIncomeLocation:
    def test_income_requires_location(self, client, auth_headers, wallet_a):
        payload = _income(1000, wallet_a)
        del payload["location"]
        r = client.post(
            "/admin/api/accounting/records", json=payload, headers=auth_headers
        )
        assert r.status_code == 400

    def test_income_rejects_invalid_location(self, client, auth_headers, wallet_a):
        payload = _income(1000, wallet_a, location="crypto")
        r = client.post(
            "/admin/api/accounting/records", json=payload, headers=auth_headers
        )
        assert r.status_code == 400

    def test_income_with_valid_location_succeeds(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        assert r.status_code == 201


# ---------------------------------------------------------------------------
# TestExpenseAutoLocation
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestExpenseAutoLocation:
    def test_sufficient_cash_no_confirmation_needed(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="cash"),
            headers=auth_headers,
        )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a),
            headers=auth_headers,
        )
        assert r.status_code == 201
        record_id = r.get_json()["id"]
        record = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(record_id)}
        )
        assert record["location"] == "cash"
        assert record["source_transfer_id"] is None

    @pytest.mark.parametrize(
        "cash_balance,expense_amount,expected_deficit,expected_withdrawal",
        [
            (0, 300, 300, 1000),
            (0, 1500, 1500, 2000),
            (0, 2001, 2001, 3000),
            (0, 1000, 1000, 1000),  # 剛好整數倍
        ],
    )
    def test_insufficient_cash_returns_409_with_correct_rounding(
        self,
        client,
        auth_headers,
        wallet_a,
        cash_balance,
        expense_amount,
        expected_deficit,
        expected_withdrawal,
    ):
        if cash_balance > 0:
            client.post(
                "/admin/api/accounting/records",
                json=_income(cash_balance, wallet_a, location="cash"),
                headers=auth_headers,
            )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(expense_amount, wallet_a),
            headers=auth_headers,
        )
        assert r.status_code == 409
        body = r.get_json()
        assert body["error"] == "cash_insufficient"
        assert body["deficit"] == expected_deficit
        assert body["withdrawal_amount"] == expected_withdrawal
        # 沒有確認就不該寫入任何記錄（用 wallet_ids 篩選這個測試專屬的帳戶，
        # 避免同一個固定 user 底下其他測試殘留的記錄干擾計數）
        total = client.get(
            f"/admin/api/accounting/records?wallet_ids={wallet_a}",
            headers=auth_headers,
        ).get_json()["total"]
        assert total == (1 if cash_balance > 0 else 0)

    def test_confirm_withdrawal_creates_transfer_and_expense(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a, confirm=True),
            headers=auth_headers,
        )
        assert r.status_code == 201
        expense_id = r.get_json()["id"]
        expense = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(expense_id)}
        )
        assert expense["location"] == "cash"
        assert expense["source_transfer_id"] is not None

        transfer = db_module.accounting_records_collection.find_one(
            {"_id": expense["source_transfer_id"]}
        )
        assert transfer["type"] == "transfer"
        assert transfer["from_location"] == "bank"
        assert transfer["to_location"] == "cash"
        assert transfer["amount"] == 1000
        assert transfer["auto_generated"] is True

        summary = client.get(
            "/admin/api/wallets/location-summary", headers=auth_headers
        ).get_json()
        entry = next(w for w in summary["wallets"] if w["wallet_id"] == wallet_a)
        assert entry["locations"]["bank"]["balance"] == 0  # 1000 - 1000
        assert entry["locations"]["cash"]["balance"] == 700  # 0 + 1000 - 300

    def test_wallet_level_balance_endpoint_unaffected_by_transfers(
        self, client, auth_headers, wallet_a
    ):
        """/admin/api/wallets/balances 完全沒改過：帳戶內部轉移在帳戶層級淨額
        互相抵銷，所以既有的 income-expense 算法不受轉帳影響，餘額應與
        location-summary 的 total_balance 一致（都是 700）。"""
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a, confirm=True),
            headers=auth_headers,
        )
        balances = client.get(
            "/admin/api/wallets/balances", headers=auth_headers
        ).get_json()
        entry = next(b for b in balances if b["wallet_id"] == wallet_a)
        assert entry["balance"] == 700


# ---------------------------------------------------------------------------
# TestTransferEndpoint
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestTransferEndpoint:
    def test_manual_transfer_succeeds(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500, "領現金"),
            headers=auth_headers,
        )
        assert r.status_code == 201
        transfer_id = r.get_json()["id"]
        transfer = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(transfer_id)}
        )
        assert transfer["auto_generated"] is False
        assert transfer["type"] == "transfer"

    def test_same_location_rejected(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "bank", 500),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_missing_wallet_id_rejected(self, client, auth_headers):
        payload = _transfer(None, "bank", "cash", 500)
        del payload["wallet_id"]
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=payload,
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_null_wallet_id_rejected(self, client, auth_headers):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(None, "bank", "cash", 500),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_other_users_wallet_rejected(self, client, other_auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500),
            headers=other_auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_location_value_rejected(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "crypto", 500),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_transfer_excluded_from_income_expense_stats(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500),
            headers=auth_headers,
        )
        # 用 wallet_ids 篩選這個測試專屬的帳戶，避免同一個固定 user 底下
        # 其他測試殘留的收支干擾總額
        start, end = _today()[:8] + "01", _today()
        stats = client.get(
            f"/admin/api/accounting/stats?start_date={start}&end_date={end}"
            f"&wallet_ids={wallet_a}",
            headers=auth_headers,
        ).get_json()
        assert stats["total_income"] == 1000
        assert stats["total_expense"] == 0


# ---------------------------------------------------------------------------
# TestEditRestrictions（PUT）
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestEditRestrictions:
    def test_can_edit_location_on_income(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        record_id = r.get_json()["id"]
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"location": "cash"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        record = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(record_id)}
        )
        assert record["location"] == "cash"

    def test_cannot_edit_location_on_expense(self, client, auth_headers, wallet_a):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="cash"),
            headers=auth_headers,
        )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a),
            headers=auth_headers,
        )
        record_id = r.get_json()["id"]
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"location": "bank"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_cannot_change_type_to_transfer(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        record_id = r.get_json()["id"]
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"type": "transfer"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_cannot_edit_transfer_locations(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500),
            headers=auth_headers,
        )
        transfer_id = r.get_json()["id"]
        r = client.put(
            f"/admin/api/accounting/records/{transfer_id}",
            json={"from_location": "cash", "to_location": "bank"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_can_edit_transfer_amount(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500),
            headers=auth_headers,
        )
        transfer_id = r.get_json()["id"]
        r = client.put(
            f"/admin/api/accounting/records/{transfer_id}",
            json={"amount": 600},
            headers=auth_headers,
        )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# TestDeleteCascade
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestDeleteCascade:
    def test_delete_expense_cascades_to_auto_transfer(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a, confirm=True),
            headers=auth_headers,
        )
        expense_id = r.get_json()["id"]
        expense = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(expense_id)}
        )
        transfer_id = expense["source_transfer_id"]
        assert transfer_id is not None

        del_r = client.delete(
            f"/admin/api/accounting/records/{expense_id}", headers=auth_headers
        )
        assert del_r.status_code == 200

        assert (
            db_module.accounting_records_collection.find_one({"_id": transfer_id})
            is None
        )
        assert (
            db_module.accounting_records_collection.find_one(
                {"_id": ObjectId(expense_id)}
            )
            is None
        )

    def test_delete_expense_without_transfer_no_side_effect(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="cash"),
            headers=auth_headers,
        )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a),
            headers=auth_headers,
        )
        expense_id = r.get_json()["id"]

        before = client.get(
            "/admin/api/accounting/records", headers=auth_headers
        ).get_json()["total"]
        client.delete(
            f"/admin/api/accounting/records/{expense_id}", headers=auth_headers
        )
        after = client.get(
            "/admin/api/accounting/records", headers=auth_headers
        ).get_json()["total"]
        assert after == before - 1

    def test_delete_transfer_directly_does_not_touch_expense(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        r = client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a, confirm=True),
            headers=auth_headers,
        )
        expense_id = r.get_json()["id"]
        expense = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(expense_id)}
        )
        transfer_id = expense["source_transfer_id"]

        del_r = client.delete(
            f"/admin/api/accounting/records/{transfer_id}", headers=auth_headers
        )
        assert del_r.status_code == 200
        assert (
            db_module.accounting_records_collection.find_one(
                {"_id": ObjectId(expense_id)}
            )
            is not None
        )


# ---------------------------------------------------------------------------
# TestLocationSummary
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestLocationSummary:
    def test_full_scenario_matches_expected_balances(
        self, client, auth_headers, wallet_a
    ):
        # 媽媽匯 1000 到銀行
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        # 花 300，現金不足（0 現金），確認提領
        client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a, confirm=True),
            headers=auth_headers,
        )

        summary = client.get(
            "/admin/api/wallets/location-summary", headers=auth_headers
        ).get_json()
        entry = next(w for w in summary["wallets"] if w["wallet_id"] == wallet_a)
        assert entry["locations"]["bank"]["balance"] == 0
        assert entry["locations"]["cash"]["balance"] == 700
        assert entry["total_balance"] == 700
        # location_totals 是跨帳戶的全域加總（同一個固定 user 底下其他測試
        # 建立的錢包也會算進去），只驗證這個帳戶的貢獻確實有被折算進去，
        # 不假設是使用者唯一的資料
        assert summary["location_totals"]["cash"] >= 700

    def test_unclassified_wallet_present(self, client, auth_headers):
        summary = client.get(
            "/admin/api/wallets/location-summary", headers=auth_headers
        ).get_json()
        assert any(w["wallet_id"] is None for w in summary["wallets"])

    def test_legacy_record_without_location_field_does_not_crash(
        self, client, auth_headers, wallet_a
    ):
        """舊資料（此功能上線前建立）完全沒有 location 欄位，$group _id 會省略
        該 key，跟先前 wallet_id 的 KeyError bug 是同一類問題，這裡先寫死避免再犯。"""
        legacy_doc = {
            "user_id": ObjectId("000000000000000000000201"),
            "type": "income",
            "amount": 500,
            "category": "測試",
            "date": _today(),
            "description": "",
            "wallet_id": ObjectId(wallet_a),
        }
        db_module.accounting_records_collection.insert_one(legacy_doc)

        r = client.get("/admin/api/wallets/location-summary", headers=auth_headers)
        assert r.status_code == 200
        summary = r.get_json()
        entry = next(w for w in summary["wallets"] if w["wallet_id"] == wallet_a)
        assert entry["unclassified_balance"] >= 500

    def test_cross_user_isolation(
        self, client, auth_headers, other_auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        summary = client.get(
            "/admin/api/wallets/location-summary", headers=other_auth_headers
        ).get_json()
        assert all(w["wallet_id"] != wallet_a for w in summary["wallets"])


# ---------------------------------------------------------------------------
# TestRecordsTypeFilterIncludesTransfer
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestRecordsTypeFilterIncludesTransfer:
    def test_filter_by_type_transfer(self, client, auth_headers, wallet_a):
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="bank"),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500),
            headers=auth_headers,
        )
        r = client.get(
            f"/admin/api/accounting/records?type=transfer&wallet_ids={wallet_a}",
            headers=auth_headers,
        )
        data = r.get_json()
        assert data["total"] == 1
        assert data["records"][0]["type"] == "transfer"


# ---------------------------------------------------------------------------
# TestExportLabelsTransfer — io.py 匯出不應把轉帳誤標成支出
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestExportLabelsTransfer:
    def test_csv_export_labels_transfer_correctly(self, client, auth_headers, wallet_a):
        client.post(
            "/admin/api/accounting/records/transfer",
            json=_transfer(wallet_a, "bank", "cash", 500, "提領現金"),
            headers=auth_headers,
        )
        r = client.get("/admin/api/accounting/export?format=csv", headers=auth_headers)
        assert r.status_code == 200
        csv_text = r.get_data(as_text=True)
        assert "轉帳" in csv_text
        assert "提領現金" in csv_text
