"""
「流動性」維度（受限資金）功能測試 (test_restricted_funds.py)

覆蓋 records.py 新增的收入拆分（一般收入 + 受限資金）、解鎖端點
（POST .../records/<id>/unlock）、PUT/DELETE 對 restricted 類型的邊界規則，
以及 wallets.py 的受限資金列表端點（GET .../wallets/restricted-funds）。

核心不變量：type=="restricted" 天生不匹配任何既有的 {"type": "income"} 篩選，
所以還鎖著的受限資金必須完全不影響既有的統計/餘額端點；解鎖後「income 補記 +
expense」一來一回，對餘額的淨影響必須剛好是零。
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
        "000000000000000000000301",
        "restricted_test@example.com",
        "Restricted Test User",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    token = auth_module.generate_jwt(
        "000000000000000000000302", "restricted_other@example.com", "Other User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def wallet_a(client, auth_headers):
    """建立一個帳戶並回傳其 ID"""
    r = client.post(
        "/admin/api/wallets", json={"name": "受限測試帳戶"}, headers=auth_headers
    )
    assert r.status_code == 201
    return r.get_json()["id"]


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _income_split(
    amount,
    wallet_id,
    restricted_amount=None,
    restricted_description="",
    location="bank",
    category="測試",
    description="",
):
    payload = {
        "type": "income",
        "amount": amount,
        "category": category,
        "date": _today(),
        "wallet_id": wallet_id,
        "location": location,
        "description": description,
    }
    if restricted_amount is not None:
        payload["restricted_amount"] = restricted_amount
        payload["restricted_description"] = restricted_description
    return payload


def _create_split(
    client, auth_headers, wallet_id, amount=200, restricted_amount=3000, **kw
):
    r = client.post(
        "/admin/api/accounting/records",
        json=_income_split(
            amount, wallet_id, restricted_amount=restricted_amount, **kw
        ),
        headers=auth_headers,
    )
    assert r.status_code == 201, r.get_json()
    return r.get_json()


# ---------------------------------------------------------------------------
# TestIncomeSplit
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestIncomeSplit:
    def test_split_creates_both_records(self, client, auth_headers, wallet_a):
        data = _create_split(
            client,
            auth_headers,
            wallet_a,
            amount=200,
            restricted_amount=3000,
            restricted_description="學費代收",
        )
        assert "id" in data
        assert "restricted_id" in data

        income = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(data["id"])}
        )
        assert income["type"] == "income"
        assert income["amount"] == 200

        restricted = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(data["restricted_id"])}
        )
        assert restricted["type"] == "restricted"
        assert restricted["amount"] == 3000
        assert restricted["description"] == "學費代收"
        assert restricted["wallet_id"] == ObjectId(wallet_a)
        assert restricted["location"] == "bank"
        assert restricted["linked_income_id"] == ObjectId(data["id"])
        assert restricted["unlocked_at"] is None

    def test_full_restricted_no_liquid_income(self, client, auth_headers, wallet_a):
        """一般收入金額 = 0：只產生受限資金記錄，不產生 income"""
        data = _create_split(
            client, auth_headers, wallet_a, amount=0, restricted_amount=3000
        )
        assert "id" not in data
        assert "restricted_id" in data

        restricted = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(data["restricted_id"])}
        )
        assert restricted["type"] == "restricted"
        assert restricted["linked_income_id"] is None

    def test_zero_amount_without_restricted_rejected(
        self, client, auth_headers, wallet_a
    ):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income_split(0, wallet_a),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_explicit_zero_restricted_amount_rejected(
        self, client, auth_headers, wallet_a
    ):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income_split(200, wallet_a, restricted_amount=0),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_negative_restricted_amount_rejected(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income_split(200, wallet_a, restricted_amount=-100),
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_restricted_amount_ignored_for_expense(
        self, client, auth_headers, wallet_a
    ):
        """restricted_amount 只對 income 有意義；expense 帶這個欄位應被忽略，不產生受限記錄"""
        client.post(
            "/admin/api/accounting/records",
            json=_income_split(1000, wallet_a, location="cash"),
            headers=auth_headers,
        )
        payload = {
            "type": "expense",
            "amount": 100,
            "category": "測試",
            "date": _today(),
            "wallet_id": wallet_a,
            "restricted_amount": 500,
        }
        r = client.post(
            "/admin/api/accounting/records", json=payload, headers=auth_headers
        )
        assert r.status_code == 201
        assert "restricted_id" not in r.get_json()

    def test_direct_restricted_type_creation_rejected(
        self, client, auth_headers, wallet_a
    ):
        payload = {
            "type": "restricted",
            "amount": 3000,
            "category": "測試",
            "date": _today(),
            "wallet_id": wallet_a,
            "location": "bank",
        }
        r = client.post(
            "/admin/api/accounting/records", json=payload, headers=auth_headers
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# TestUnlockFlow
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestUnlockFlow:
    def test_unlock_flips_type_and_creates_expense(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        restricted_id = data["restricted_id"]

        r = client.post(
            f"/admin/api/accounting/records/{restricted_id}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        assert r.status_code == 201
        expense_id = r.get_json()["expense_id"]

        original = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(restricted_id)}
        )
        assert original["type"] == "income"
        assert original["unlocked_at"] is not None

        expense = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(expense_id)}
        )
        assert expense["type"] == "expense"
        assert expense["amount"] == 3000
        assert expense["wallet_id"] == ObjectId(wallet_a)
        assert expense["location"] == "bank"
        assert expense["source_restricted_id"] == ObjectId(restricted_id)
        assert expense["auto_generated"] is True

    def test_unlock_uses_custom_date_not_original_date(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        restricted_id = data["restricted_id"]
        custom_date = "2020-01-15"

        r = client.post(
            f"/admin/api/accounting/records/{restricted_id}/unlock",
            json={"date": custom_date},
            headers=auth_headers,
        )
        expense_id = r.get_json()["expense_id"]
        expense = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(expense_id)}
        )
        assert expense["date"] == custom_date

        original = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(restricted_id)}
        )
        assert original["date"] == _today()  # 原始收到日期不變

    def test_unlock_requires_date_field(self, client, auth_headers, wallet_a):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.post(
            f"/admin/api/accounting/records/{data['restricted_id']}/unlock",
            json={},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_unlock_rejects_invalid_date_format(self, client, auth_headers, wallet_a):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.post(
            f"/admin/api/accounting/records/{data['restricted_id']}/unlock",
            json={"date": "2020/01/15"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_unlock_nonexistent_record_404(self, client, auth_headers):
        r = client.post(
            "/admin/api/accounting/records/000000000000000000000099/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_unlock_non_restricted_record_rejected(
        self, client, auth_headers, wallet_a
    ):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income_split(1000, wallet_a),
            headers=auth_headers,
        )
        income_id = r.get_json()["id"]
        r = client.post(
            f"/admin/api/accounting/records/{income_id}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_unlock_twice_rejected(self, client, auth_headers, wallet_a):
        data = _create_split(client, auth_headers, wallet_a)
        restricted_id = data["restricted_id"]
        client.post(
            f"/admin/api/accounting/records/{restricted_id}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        r = client.post(
            f"/admin/api/accounting/records/{restricted_id}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_other_user_cannot_unlock(
        self, client, auth_headers, other_auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.post(
            f"/admin/api/accounting/records/{data['restricted_id']}/unlock",
            json={"date": _today()},
            headers=other_auth_headers,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TestBalanceExclusion — 核心正確性：受限資金不能滲進可用餘額
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestBalanceExclusion:
    def test_restricted_excluded_from_stats(self, client, auth_headers, wallet_a):
        client.post(
            "/admin/api/accounting/records",
            json=_income_split(1000, wallet_a),
            headers=auth_headers,
        )
        _create_split(
            client, auth_headers, wallet_a, amount=200, restricted_amount=3000
        )
        start, end = _today()[:8] + "01", _today()
        stats = client.get(
            f"/admin/api/accounting/stats?start_date={start}&end_date={end}"
            f"&wallet_ids={wallet_a}",
            headers=auth_headers,
        ).get_json()
        assert stats["total_income"] == 1200  # 1000 + 200，不含 3000 受限

    def test_restricted_excluded_from_location_summary(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income_split(1000, wallet_a),
            headers=auth_headers,
        )
        _create_split(
            client, auth_headers, wallet_a, amount=200, restricted_amount=3000
        )
        summary = client.get(
            "/admin/api/wallets/location-summary", headers=auth_headers
        ).get_json()
        entry = next(w for w in summary["wallets"] if w["wallet_id"] == wallet_a)
        assert entry["locations"]["bank"]["balance"] == 1200
        assert entry["total_balance"] == 1200

    def test_restricted_cash_not_spendable(self, client, auth_headers, wallet_a):
        """全額代收代付進現金：這筆現金不能被拿來當作「現金充足」的依據"""
        _create_split(
            client,
            auth_headers,
            wallet_a,
            amount=0,
            restricted_amount=3000,
            location="cash",
        )
        r = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 300,
                "category": "測試",
                "date": _today(),
                "wallet_id": wallet_a,
            },
            headers=auth_headers,
        )
        assert r.status_code == 409
        assert r.get_json()["error"] == "cash_insufficient"

    def test_unlock_has_zero_net_effect_on_balance(
        self, client, auth_headers, wallet_a
    ):
        client.post(
            "/admin/api/accounting/records",
            json=_income_split(1000, wallet_a),
            headers=auth_headers,
        )
        data = _create_split(
            client, auth_headers, wallet_a, amount=200, restricted_amount=3000
        )

        def bank_balance():
            summary = client.get(
                "/admin/api/wallets/location-summary", headers=auth_headers
            ).get_json()
            entry = next(w for w in summary["wallets"] if w["wallet_id"] == wallet_a)
            return entry["locations"]["bank"]["balance"]

        before = bank_balance()
        assert before == 1200

        client.post(
            f"/admin/api/accounting/records/{data['restricted_id']}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        after = bank_balance()
        assert after == before  # income(+3000) 與 expense(-3000) 互相抵銷


# ---------------------------------------------------------------------------
# TestRestrictedFundsListEndpoint
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestRestrictedFundsListEndpoint:
    def test_lists_only_still_locked_items(self, client, auth_headers, wallet_a):
        d1 = _create_split(
            client,
            auth_headers,
            wallet_a,
            amount=200,
            restricted_amount=3000,
            restricted_description="學費代收A",
        )
        d2 = _create_split(
            client,
            auth_headers,
            wallet_a,
            amount=100,
            restricted_amount=1500,
            restricted_description="學費代收B",
        )
        client.post(
            f"/admin/api/accounting/records/{d1['restricted_id']}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )

        result = client.get(
            "/admin/api/wallets/restricted-funds", headers=auth_headers
        ).get_json()
        descriptions = [item["description"] for item in result["items"]]
        assert "學費代收A" not in descriptions
        assert "學費代收B" in descriptions

        item_b = next(i for i in result["items"] if i["description"] == "學費代收B")
        assert item_b["amount"] == 1500
        assert item_b["wallet_id"] == wallet_a
        assert item_b["wallet_name"] == "受限測試帳戶"
        assert item_b["location"] == "bank"
        assert item_b["linked_income_id"] is not None
        assert result["total"] >= 1500

    def test_cross_user_isolation(
        self, client, auth_headers, other_auth_headers, wallet_a
    ):
        _create_split(client, auth_headers, wallet_a)
        result = client.get(
            "/admin/api/wallets/restricted-funds", headers=other_auth_headers
        ).get_json()
        assert result["items"] == []
        assert result["total"] == 0


# ---------------------------------------------------------------------------
# TestEditRestrictions（PUT）
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestEditRestrictions:
    def test_cannot_change_type_to_restricted(self, client, auth_headers, wallet_a):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income_split(1000, wallet_a),
            headers=auth_headers,
        )
        income_id = r.get_json()["id"]
        r = client.put(
            f"/admin/api/accounting/records/{income_id}",
            json={"type": "restricted"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_cannot_change_type_away_from_restricted(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.put(
            f"/admin/api/accounting/records/{data['restricted_id']}",
            json={"type": "income"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_can_edit_location_on_restricted_record(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.put(
            f"/admin/api/accounting/records/{data['restricted_id']}",
            json={"location": "cash"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        record = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(data["restricted_id"])}
        )
        assert record["location"] == "cash"

    def test_can_edit_amount_and_description_on_restricted_record(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.put(
            f"/admin/api/accounting/records/{data['restricted_id']}",
            json={"amount": 3500, "description": "更新後用途"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        record = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(data["restricted_id"])}
        )
        assert record["amount"] == 3500
        assert record["description"] == "更新後用途"


# ---------------------------------------------------------------------------
# TestDeleteCascade
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestDeleteCascade:
    def test_delete_locked_restricted_no_side_effect(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        r = client.delete(
            f"/admin/api/accounting/records/{data['restricted_id']}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert (
            db_module.accounting_records_collection.find_one(
                {"_id": ObjectId(data["restricted_id"])}
            )
            is None
        )
        # 一般收入那筆不受影響
        assert (
            db_module.accounting_records_collection.find_one(
                {"_id": ObjectId(data["id"])}
            )
            is not None
        )

    def test_delete_sibling_income_does_not_affect_restricted(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        client.delete(
            f"/admin/api/accounting/records/{data['id']}", headers=auth_headers
        )
        restricted = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(data["restricted_id"])}
        )
        assert restricted is not None
        assert restricted["type"] == "restricted"

    def test_delete_unlock_expense_reverts_to_restricted(
        self, client, auth_headers, wallet_a
    ):
        data = _create_split(client, auth_headers, wallet_a)
        restricted_id = data["restricted_id"]
        r = client.post(
            f"/admin/api/accounting/records/{restricted_id}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        expense_id = r.get_json()["expense_id"]

        del_r = client.delete(
            f"/admin/api/accounting/records/{expense_id}", headers=auth_headers
        )
        assert del_r.status_code == 200

        reverted = db_module.accounting_records_collection.find_one(
            {"_id": ObjectId(restricted_id)}
        )
        assert reverted["type"] == "restricted"
        assert reverted["unlocked_at"] is None

        # 解鎖產生的 expense 本身確實被刪除了
        assert (
            db_module.accounting_records_collection.find_one(
                {"_id": ObjectId(expense_id)}
            )
            is None
        )
