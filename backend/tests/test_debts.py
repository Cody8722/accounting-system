"""
欠款模組 API 測試 (test_debts.py)

覆蓋 10 個欠款端點 + stats/overview 相關業務邏輯
共 61 個測試，8 個 test class
"""

import pytest
import sys
import os
from datetime import datetime
from bson import ObjectId

# 設定環境變數（必須在 import main 之前）
os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module

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
        "000000000000000000000001", "debt_test@example.com", "Debt Test User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    """第二個用戶的 auth headers，用於用戶隔離測試"""
    token = auth_module.generate_jwt(
        "000000000000000000000002", "other@example.com", "Other User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def lent_payload():
    return {
        "debt_type": "lent",
        "person": "Alice",
        "amount": 500,
        "reason": "lunch",
        "date": "2026-03-01",
    }


@pytest.fixture
def borrowed_payload():
    return {
        "debt_type": "borrowed",
        "person": "Bob",
        "amount": 300,
        "date": "2026-03-01",
    }


@pytest.fixture
def members_payload():
    return {
        "debt_type": "lent",
        "person": "Team dinner",
        "amount": 900,
        "members": [
            {"name": "Bob", "share": 300},
            {"name": "Carol", "share": 300},
            {"name": "Dave", "share": 300},
        ],
    }


@pytest.fixture
def created_debt_id(client, auth_headers, lent_payload):
    """建立一筆 lent 欠款並回傳其 ID"""
    r = client.post("/admin/api/debts", json=lent_payload, headers=auth_headers)
    assert r.status_code == 201
    return r.get_json()["id"]


@pytest.fixture
def created_member_debt_id(client, auth_headers, members_payload):
    """建立一筆含 members 的欠款並回傳其 ID"""
    r = client.post("/admin/api/debts", json=members_payload, headers=auth_headers)
    assert r.status_code == 201
    return r.get_json()["id"]


@pytest.fixture
def group_debt_id(client, auth_headers):
    """
    直接插入 group 類型欠款（API create endpoint 不接受 "group" type）。
    使用 yield + delete_one 確保測試後清理，不污染其他測試。
    """
    from db import debts_collection

    doc = {
        "_id": ObjectId(),
        "user_id": ObjectId("000000000000000000000001"),
        "debt_type": "group",
        "person": "Group Test",
        "amount": 600,
        "paid_amount": 0.0,
        "is_settled": False,
        "reason": "",
        "date": "2026-03-01",
        "repayments": [],
        "members": [
            {
                "name": "B",
                "share": 300,
                "paid_amount": 0.0,
                "is_settled": False,
                "paid": False,
            },
            {
                "name": "C",
                "share": 300,
                "paid_amount": 0.0,
                "is_settled": False,
                "paid": False,
            },
        ],
        "created_at": datetime.now(),
    }
    debts_collection.insert_one(doc)
    yield str(doc["_id"])
    debts_collection.delete_one({"_id": doc["_id"]})  # 測試後清理


# ---------------------------------------------------------------------------
# TestCreateDebt (12 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestCreateDebt:
    """新增欠款測試"""

    def test_create_lent_returns_201(self, client, auth_headers, lent_payload):
        r = client.post("/admin/api/debts", json=lent_payload, headers=auth_headers)
        assert r.status_code == 201
        assert "id" in r.get_json()

    def test_create_borrowed_returns_201(self, client, auth_headers, borrowed_payload):
        r = client.post("/admin/api/debts", json=borrowed_payload, headers=auth_headers)
        assert r.status_code == 201
        assert "id" in r.get_json()

    def test_create_no_auth_returns_401(self, client, lent_payload):
        r = client.post("/admin/api/debts", json=lent_payload)
        assert r.status_code in [401, 403]

    def test_create_group_type_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts",
            json={"debt_type": "group", "person": "Test", "amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_missing_person_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts",
            json={"debt_type": "lent", "amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_amount_zero_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts",
            json={"debt_type": "lent", "person": "Alice", "amount": 0},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_amount_negative_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts",
            json={"debt_type": "lent", "person": "Alice", "amount": -100},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_amount_nonnumeric_returns_400(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts",
            json={"debt_type": "lent", "person": "Alice", "amount": "abc"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_create_empty_body_returns_400(self, client, auth_headers):
        r = client.post("/admin/api/debts", json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_create_with_members_returns_201(
        self, client, auth_headers, members_payload
    ):
        r = client.post("/admin/api/debts", json=members_payload, headers=auth_headers)
        assert r.status_code == 201

    def test_create_empty_member_name_filtered(self, client, auth_headers):
        """空字串成員名稱應被過濾，不報錯"""
        r = client.post(
            "/admin/api/debts",
            json={
                "debt_type": "lent",
                "person": "Group",
                "amount": 300,
                "members": [
                    {"name": "", "share": 100},
                    {"name": "Alice", "share": 200},
                ],
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        debt_id = r.get_json()["id"]
        gr = client.get(f"/admin/api/debts/{debt_id}", headers=auth_headers)
        members = gr.get_json().get("members", [])
        assert len(members) == 1
        assert members[0]["name"] == "Alice"

    def test_create_person_truncated_to_50_chars(self, client, auth_headers):
        """person 超過 50 字應被截斷至 50"""
        r = client.post(
            "/admin/api/debts",
            json={"debt_type": "lent", "person": "A" * 60, "amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 201
        debt_id = r.get_json()["id"]
        gr = client.get(f"/admin/api/debts/{debt_id}", headers=auth_headers)
        assert len(gr.get_json()["person"]) == 50


# ---------------------------------------------------------------------------
# TestGetDebts (10 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestGetDebts:
    """查詢欠款測試"""

    def test_list_returns_200_and_list(self, client, auth_headers, created_debt_id):
        r = client.get("/admin/api/debts", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.get_json(), list)

    def test_list_no_auth_returns_401(self, client):
        r = client.get("/admin/api/debts")
        assert r.status_code in [401, 403]

    def test_list_filter_by_type_lent(self, client, auth_headers, created_debt_id):
        r = client.get("/admin/api/debts?type=lent", headers=auth_headers)
        assert r.status_code == 200
        ids = [i["_id"]["$oid"] for i in r.get_json()]
        assert created_debt_id in ids

    def test_list_filter_by_type_borrowed(self, client, auth_headers, borrowed_payload):
        cr = client.post(
            "/admin/api/debts", json=borrowed_payload, headers=auth_headers
        )
        debt_id = cr.get_json()["id"]
        r = client.get("/admin/api/debts?type=borrowed", headers=auth_headers)
        ids = [i["_id"]["$oid"] for i in r.get_json()]
        assert debt_id in ids

    def test_list_excludes_settled_by_default(
        self, client, auth_headers, created_debt_id
    ):
        client.post(f"/admin/api/debts/{created_debt_id}/settle", headers=auth_headers)
        r = client.get("/admin/api/debts", headers=auth_headers)
        ids = [i["_id"]["$oid"] for i in r.get_json()]
        assert created_debt_id not in ids

    def test_list_show_settled_includes_settled(
        self, client, auth_headers, created_debt_id
    ):
        client.post(f"/admin/api/debts/{created_debt_id}/settle", headers=auth_headers)
        r = client.get("/admin/api/debts?show_settled=true", headers=auth_headers)
        ids = [i["_id"]["$oid"] for i in r.get_json()]
        assert created_debt_id in ids

    def test_get_single_returns_200_with_fields(
        self, client, auth_headers, created_debt_id
    ):
        r = client.get(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        for field in ["person", "amount", "debt_type", "is_settled", "paid_amount"]:
            assert field in data

    def test_get_single_nonexistent_returns_404(self, client, auth_headers):
        r = client.get(
            "/admin/api/debts/000000000000000000000099", headers=auth_headers
        )
        assert r.status_code == 404

    def test_get_single_invalid_id_returns_400(self, client, auth_headers):
        r = client.get("/admin/api/debts/not-an-objectid", headers=auth_headers)
        assert r.status_code == 400

    def test_user_isolation(
        self, client, auth_headers, other_auth_headers, created_debt_id
    ):
        """用戶 B 無法存取用戶 A 的欠款"""
        r = client.get(
            f"/admin/api/debts/{created_debt_id}", headers=other_auth_headers
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TestUpdateDebt (6 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestUpdateDebt:
    """更新欠款測試"""

    def test_update_fields_returns_200_and_persisted(
        self, client, auth_headers, created_debt_id
    ):
        r = client.put(
            f"/admin/api/debts/{created_debt_id}",
            json={"person": "NewPerson", "amount": 999},
            headers=auth_headers,
        )
        assert r.status_code == 200
        gr = client.get(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        data = gr.get_json()
        assert data["person"] == "NewPerson"
        assert data["amount"] == 999

    def test_update_no_auth_returns_401(self, client, created_debt_id):
        r = client.put(f"/admin/api/debts/{created_debt_id}", json={"person": "X"})
        assert r.status_code in [401, 403]

    def test_update_nonexistent_returns_404(self, client, auth_headers):
        r = client.put(
            "/admin/api/debts/000000000000000000000099",
            json={"person": "X"},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_update_invalid_id_returns_400(self, client, auth_headers):
        r = client.put(
            "/admin/api/debts/not-an-id",
            json={"person": "X"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_update_empty_body_returns_400(self, client, auth_headers, created_debt_id):
        r = client.put(
            f"/admin/api/debts/{created_debt_id}",
            json={},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_update_with_members_persisted(self, client, auth_headers, created_debt_id):
        r = client.put(
            f"/admin/api/debts/{created_debt_id}",
            json={
                "members": [{"name": "X", "share": 250}, {"name": "Y", "share": 250}]
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        gr = client.get(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        assert len(gr.get_json().get("members", [])) == 2


# ---------------------------------------------------------------------------
# TestDeleteDebt (5 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestDeleteDebt:
    """刪除欠款測試"""

    def test_delete_returns_200_and_get_returns_404(
        self, client, auth_headers, created_debt_id
    ):
        r = client.delete(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        assert r.status_code == 200
        gr = client.get(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        assert gr.status_code == 404

    def test_delete_no_auth_returns_401(self, client, created_debt_id):
        r = client.delete(f"/admin/api/debts/{created_debt_id}")
        assert r.status_code in [401, 403]

    def test_delete_nonexistent_returns_404(self, client, auth_headers):
        r = client.delete(
            "/admin/api/debts/000000000000000000000099", headers=auth_headers
        )
        assert r.status_code == 404

    def test_delete_invalid_id_returns_400(self, client, auth_headers):
        r = client.delete("/admin/api/debts/not-an-id", headers=auth_headers)
        assert r.status_code == 400

    def test_delete_marks_auto_records_debt_deleted(
        self, client, auth_headers, created_debt_id
    ):
        """刪除欠款後，由還款自動產生的記帳記錄應被標記 debt_deleted=True"""
        # 先還款（觸發自動記帳）
        client.post(
            f"/admin/api/debts/{created_debt_id}/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        # 刪除欠款
        r = client.delete(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        assert r.status_code == 200

        # 驗證 auto_generated 記帳記錄已被標記
        from db import accounting_records_collection

        records = list(
            accounting_records_collection.find(
                {"debt_id": ObjectId(created_debt_id), "auto_generated": True}
            )
        )
        assert len(records) > 0
        assert all(rec.get("debt_deleted") is True for rec in records)


# ---------------------------------------------------------------------------
# TestRepayDebt (9 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestRepayDebt:
    """單人還款測試"""

    def test_partial_repay_updates_paid_amount(
        self, client, auth_headers, created_debt_id
    ):
        r = client.post(
            f"/admin/api/debts/{created_debt_id}/repay",
            json={"amount": 200},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is False
        gr = client.get(f"/admin/api/debts/{created_debt_id}", headers=auth_headers)
        assert gr.get_json()["paid_amount"] == 200

    def test_full_repay_marks_settled(self, client, auth_headers, lent_payload):
        cr = client.post("/admin/api/debts", json=lent_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        r = client.post(
            f"/admin/api/debts/{debt_id}/repay",
            json={"amount": 500},  # lent_payload amount = 500
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is True

    def test_over_repay_marks_settled(self, client, auth_headers, lent_payload):
        cr = client.post("/admin/api/debts", json=lent_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        r = client.post(
            f"/admin/api/debts/{debt_id}/repay",
            json={"amount": 9999},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is True

    def test_lent_repay_creates_income_record(self, client, auth_headers, lent_payload):
        cr = client.post("/admin/api/debts", json=lent_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        client.post(
            f"/admin/api/debts/{debt_id}/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        from db import accounting_records_collection

        records = list(
            accounting_records_collection.find(
                {"debt_id": ObjectId(debt_id), "auto_generated": True}
            )
        )
        assert len(records) > 0
        assert records[-1]["type"] == "income"
        assert records[-1]["category"] == "債務收回"

    def test_borrowed_repay_creates_expense_record(
        self, client, auth_headers, borrowed_payload
    ):
        cr = client.post(
            "/admin/api/debts", json=borrowed_payload, headers=auth_headers
        )
        debt_id = cr.get_json()["id"]
        client.post(
            f"/admin/api/debts/{debt_id}/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        from db import accounting_records_collection

        records = list(
            accounting_records_collection.find(
                {"debt_id": ObjectId(debt_id), "auto_generated": True}
            )
        )
        assert len(records) > 0
        assert records[-1]["type"] == "expense"
        assert records[-1]["category"] == "債務償還"

    def test_repay_debt_with_members_returns_400(
        self, client, auth_headers, created_member_debt_id
    ):
        r = client.post(
            f"/admin/api/debts/{created_member_debt_id}/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_repay_no_auth_returns_401(self, client, created_debt_id):
        r = client.post(
            f"/admin/api/debts/{created_debt_id}/repay",
            json={"amount": 100},
        )
        assert r.status_code in [401, 403]

    def test_repay_amount_zero_returns_400(self, client, auth_headers, created_debt_id):
        r = client.post(
            f"/admin/api/debts/{created_debt_id}/repay",
            json={"amount": 0},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_repay_nonexistent_debt_returns_404(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts/000000000000000000000099/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# TestRepayMember (8 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestRepayMember:
    """分帳成員還款測試"""

    def test_partial_repay_updates_member_paid_amount(
        self, client, auth_headers, created_member_debt_id
    ):
        r = client.post(
            f"/admin/api/debts/{created_member_debt_id}/members/0/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is False
        gr = client.get(
            f"/admin/api/debts/{created_member_debt_id}", headers=auth_headers
        )
        members = gr.get_json()["members"]
        assert members[0]["paid_amount"] == 100
        assert members[0]["is_settled"] is False

    def test_full_member_repay_marks_member_settled(
        self, client, auth_headers, members_payload
    ):
        cr = client.post("/admin/api/debts", json=members_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        # member[0] share = 300
        r = client.post(
            f"/admin/api/debts/{debt_id}/members/0/repay",
            json={"amount": 300},
            headers=auth_headers,
        )
        assert r.status_code == 200
        gr = client.get(f"/admin/api/debts/{debt_id}", headers=auth_headers)
        assert gr.get_json()["members"][0]["is_settled"] is True

    def test_all_members_repaid_settles_top_level(
        self, client, auth_headers, members_payload
    ):
        cr = client.post("/admin/api/debts", json=members_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        for idx in range(3):
            client.post(
                f"/admin/api/debts/{debt_id}/members/{idx}/repay",
                json={"amount": 300},
                headers=auth_headers,
            )
        gr = client.get(
            f"/admin/api/debts/{debt_id}?show_settled=true", headers=auth_headers
        )
        assert gr.get_json()["is_settled"] is True

    def test_top_paid_amount_equals_sum_of_members(
        self, client, auth_headers, members_payload
    ):
        cr = client.post("/admin/api/debts", json=members_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        client.post(
            f"/admin/api/debts/{debt_id}/members/0/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        client.post(
            f"/admin/api/debts/{debt_id}/members/1/repay",
            json={"amount": 150},
            headers=auth_headers,
        )
        gr = client.get(f"/admin/api/debts/{debt_id}", headers=auth_headers)
        assert gr.get_json()["paid_amount"] == 250

    def test_member_repay_creates_auto_record_with_member_name(
        self, client, auth_headers, members_payload
    ):
        cr = client.post("/admin/api/debts", json=members_payload, headers=auth_headers)
        debt_id = cr.get_json()["id"]
        client.post(
            f"/admin/api/debts/{debt_id}/members/0/repay",  # member[0] = Bob
            json={"amount": 100},
            headers=auth_headers,
        )
        from db import accounting_records_collection

        records = list(
            accounting_records_collection.find(
                {"debt_id": ObjectId(debt_id), "auto_generated": True}
            )
        )
        assert len(records) > 0
        assert "Bob" in records[-1]["description"]

    def test_member_negative_idx_returns_4xx(
        self, client, auth_headers, created_member_debt_id
    ):
        # Flask <int:> 不匹配負數（route 不存在），回傳 404；
        # 若 Flask 版本接受負數，main.py 的邊界檢查會回傳 400
        r = client.post(
            f"/admin/api/debts/{created_member_debt_id}/members/-1/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        assert r.status_code in [400, 404]

    def test_member_out_of_bounds_idx_returns_400(
        self, client, auth_headers, created_member_debt_id
    ):
        r = client.post(
            f"/admin/api/debts/{created_member_debt_id}/members/99/repay",
            json={"amount": 100},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_repay_member_no_auth_returns_401(self, client, created_member_debt_id):
        r = client.post(
            f"/admin/api/debts/{created_member_debt_id}/members/0/repay",
            json={"amount": 100},
        )
        assert r.status_code in [401, 403]


# ---------------------------------------------------------------------------
# TestSettleDebt (5 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestSettleDebt:
    """結清欠款測試"""

    def test_settle_returns_200_and_is_settled_true(
        self, client, auth_headers, created_debt_id
    ):
        r = client.post(
            f"/admin/api/debts/{created_debt_id}/settle", headers=auth_headers
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is True

    def test_settle_twice_toggles_back(self, client, auth_headers, created_debt_id):
        client.post(f"/admin/api/debts/{created_debt_id}/settle", headers=auth_headers)
        r = client.post(
            f"/admin/api/debts/{created_debt_id}/settle", headers=auth_headers
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is False

    def test_settle_nonexistent_returns_404(self, client, auth_headers):
        r = client.post(
            "/admin/api/debts/000000000000000000000099/settle", headers=auth_headers
        )
        assert r.status_code == 404

    def test_settle_no_auth_returns_401(self, client, created_debt_id):
        r = client.post(f"/admin/api/debts/{created_debt_id}/settle")
        assert r.status_code in [401, 403]

    def test_settle_invalid_id_returns_400(self, client, auth_headers):
        r = client.post("/admin/api/debts/not-an-id/settle", headers=auth_headers)
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# TestToggleMemberPay (6 tests)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestToggleMemberPay:
    """群組成員付款切換測試"""

    def test_toggle_then_retoggle(self, client, auth_headers, group_debt_id):
        """toggle → paid=True，再 toggle → paid=False"""
        r1 = client.put(
            f"/admin/api/debts/{group_debt_id}/members/0/pay",
            headers=auth_headers,
        )
        assert r1.status_code == 200
        gr1 = client.get(
            f"/admin/api/debts/{group_debt_id}?show_settled=true", headers=auth_headers
        )
        assert gr1.get_json()["members"][0]["paid"] is True

        r2 = client.put(
            f"/admin/api/debts/{group_debt_id}/members/0/pay",
            headers=auth_headers,
        )
        assert r2.status_code == 200
        gr2 = client.get(
            f"/admin/api/debts/{group_debt_id}?show_settled=true", headers=auth_headers
        )
        assert gr2.get_json()["members"][0]["paid"] is False

    def test_all_members_paid_settles_top_level(
        self, client, auth_headers, group_debt_id
    ):
        client.put(
            f"/admin/api/debts/{group_debt_id}/members/0/pay", headers=auth_headers
        )
        r = client.put(
            f"/admin/api/debts/{group_debt_id}/members/1/pay", headers=auth_headers
        )
        assert r.status_code == 200
        assert r.get_json()["is_settled"] is True

    def test_non_group_debt_returns_400(self, client, auth_headers, created_debt_id):
        r = client.put(
            f"/admin/api/debts/{created_debt_id}/members/0/pay",
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_out_of_bounds_idx_returns_400(self, client, auth_headers, group_debt_id):
        r = client.put(
            f"/admin/api/debts/{group_debt_id}/members/99/pay",
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_no_auth_returns_401(self, client, group_debt_id):
        r = client.put(f"/admin/api/debts/{group_debt_id}/members/0/pay")
        assert r.status_code in [401, 403]

    def test_invalid_id_returns_400(self, client, auth_headers):
        r = client.put("/admin/api/debts/not-an-id/members/0/pay", headers=auth_headers)
        assert r.status_code == 400
