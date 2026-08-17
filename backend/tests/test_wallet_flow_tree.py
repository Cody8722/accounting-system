"""
資金流向樹端點測試 (test_wallet_flow_tree.py)

覆蓋 wallets.py 的 GET /admin/api/wallets/<id>/flow-tree：單一錢包的銀行/現金
淨額，加上三種「已經記錄的明確關聯」邊的加總（次數 + 金額，全時間累計）：
  銀行 → 現金：自動提領（現金不足時系統自動產生的轉帳）
  收入 → 受限資金：收入拆分（不分是否已解鎖）
  受限資金 → 原位置：解鎖（source_restricted_id 不為空的支出；落在跟原受限
    記錄相同的 location，不是自動判斷現金/銀行）
"""

import os
import sys
from datetime import datetime

import pytest

os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module


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
        "000000000000000000000401", "flowtree_test@example.com", "Flow Tree Test User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    token = auth_module.generate_jwt(
        "000000000000000000000402", "flowtree_other@example.com", "Other User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def wallet_a(client, auth_headers):
    r = client.post(
        "/admin/api/wallets", json={"name": "流向樹測試帳戶"}, headers=auth_headers
    )
    assert r.status_code == 201
    return r.get_json()["id"]


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _income(amount, wallet_id, location="bank", restricted_amount=None, **kw):
    payload = {
        "type": "income",
        "amount": amount,
        "category": "測試",
        "date": _today(),
        "wallet_id": wallet_id,
        "location": location,
    }
    if restricted_amount is not None:
        payload["restricted_amount"] = restricted_amount
        payload["restricted_description"] = kw.get("restricted_description", "")
    return payload


def _expense(amount, wallet_id, confirm=False):
    payload = {
        "type": "expense",
        "amount": amount,
        "category": "測試",
        "date": _today(),
        "wallet_id": wallet_id,
    }
    if confirm:
        payload["confirm_withdrawal"] = True
    return payload


@pytest.mark.integration
class TestFlowTreeEndpoint:
    def test_requires_auth(self, client, wallet_a):
        r = client.get(f"/admin/api/wallets/{wallet_a}/flow-tree")
        assert r.status_code == 401

    def test_invalid_id_rejected(self, client, auth_headers):
        r = client.get("/admin/api/wallets/not-an-id/flow-tree", headers=auth_headers)
        assert r.status_code == 400

    def test_other_users_wallet_rejected(
        self, client, auth_headers, other_auth_headers, wallet_a
    ):
        r = client.get(
            f"/admin/api/wallets/{wallet_a}/flow-tree", headers=other_auth_headers
        )
        assert r.status_code == 404

    def test_empty_wallet_returns_zeroed_tree(self, client, auth_headers, wallet_a):
        r = client.get(f"/admin/api/wallets/{wallet_a}/flow-tree", headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data["wallet_id"] == wallet_a
        assert data["wallet_name"] == "流向樹測試帳戶"
        assert data["locations"]["bank"]["balance"] == 0
        assert data["locations"]["cash"]["balance"] == 0
        assert data["restricted_locked_total"] == 0
        for edge in data["edges"].values():
            assert edge == {"count": 0, "amount": 0.0}

    def test_plain_income_expense_does_not_populate_edges(
        self, client, auth_headers, wallet_a
    ):
        """沒有觸發任何特殊關聯的一般收支：只影響位置淨額，三條邊維持 0"""
        client.post(
            "/admin/api/accounting/records",
            json=_income(1000, wallet_a, location="cash"),
            headers=auth_headers,
        )
        client.post(
            "/admin/api/accounting/records",
            json=_expense(300, wallet_a),
            headers=auth_headers,
        )
        data = client.get(
            f"/admin/api/wallets/{wallet_a}/flow-tree", headers=auth_headers
        ).get_json()
        assert data["locations"]["cash"]["balance"] == 700
        for edge in data["edges"].values():
            assert edge == {"count": 0, "amount": 0.0}

    def test_auto_withdrawal_populates_bank_to_cash_edge(
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

        data = client.get(
            f"/admin/api/wallets/{wallet_a}/flow-tree", headers=auth_headers
        ).get_json()
        assert data["edges"]["auto_withdrawal"] == {"count": 1, "amount": 1000.0}
        assert data["edges"]["restricted_split"] == {"count": 0, "amount": 0.0}
        assert data["edges"]["restricted_unlock"] == {"count": 0, "amount": 0.0}
        assert data["locations"]["bank"]["balance"] == 0  # 1000 - 1000 提領
        assert data["locations"]["cash"]["balance"] == 700  # 1000 提領 - 300 支出

    def test_restricted_split_and_unlock_populate_edges(
        self, client, auth_headers, wallet_a
    ):
        r = client.post(
            "/admin/api/accounting/records",
            json=_income(200, wallet_a, location="bank", restricted_amount=3000),
            headers=auth_headers,
        )
        assert r.status_code == 201
        restricted_id = r.get_json()["restricted_id"]

        # 未解鎖前：拆分邊已經有值，解鎖邊仍是 0，鎖定總額 = 拆分金額
        data = client.get(
            f"/admin/api/wallets/{wallet_a}/flow-tree", headers=auth_headers
        ).get_json()
        assert data["edges"]["restricted_split"] == {"count": 1, "amount": 3000.0}
        assert data["edges"]["restricted_unlock"] == {"count": 0, "amount": 0.0}
        assert data["restricted_locked_total"] == 3000.0

        unlock_r = client.post(
            f"/admin/api/accounting/records/{restricted_id}/unlock",
            json={"date": _today()},
            headers=auth_headers,
        )
        assert unlock_r.status_code == 201

        # 解鎖後：拆分邊金額不變（累計曾經拆出去的總額，不受解鎖後 type 原地翻成
        # income 影響），解鎖邊出現，鎖定總額歸零
        data = client.get(
            f"/admin/api/wallets/{wallet_a}/flow-tree", headers=auth_headers
        ).get_json()
        assert data["edges"]["restricted_split"] == {"count": 1, "amount": 3000.0}
        assert data["edges"]["restricted_unlock"] == {"count": 1, "amount": 3000.0}
        assert data["restricted_locked_total"] == 0
        # 解鎖對淨額的影響本來就該是零（原記錄翻成 +3000 收入，同時新增 -3000
        # 解鎖支出，兩者互相抵銷）——沿用原受限記錄的 location（這裡是 bank），
        # 不是自動判斷成現金；最終餘額只剩最初那筆 200 一般收入
        assert data["locations"]["bank"]["balance"] == 200.0
        assert data["locations"]["cash"]["balance"] == 0

    def test_archived_wallet_still_accessible(self, client, auth_headers, wallet_a):
        """封存不影響既有歷史資料查詢——跟 balance-history 端點行為一致"""
        client.put(
            f"/admin/api/wallets/{wallet_a}",
            json={"archived": True},
            headers=auth_headers,
        )
        r = client.get(f"/admin/api/wallets/{wallet_a}/flow-tree", headers=auth_headers)
        assert r.status_code == 200
