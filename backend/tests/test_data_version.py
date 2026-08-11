"""
test_data_version.py — GET /admin/api/accounting/data-version（輕量更新檢查）。

驗證重點：資料版本簽章（衍生自 records/budget/recurring/wallets 各自的
count + max(updated_at)）對任一集合的新增/修改/刪除皆敏感；無變更時穩定不變；
不同使用者的版本互不影響（隔離性）。
"""

import time
from datetime import datetime

import pytest


def _tick():
    """確保連續寫入落在不同毫秒——BSON datetime 只有毫秒精度，同一毫秒內對同一
    文件的兩次寫入可能不反映在 max(updated_at)（見 records.py _compute_data_version
    的已知邊界說明）；in-process 測試呼叫過快容易撞到，真實 HTTP 往返不會。"""
    time.sleep(0.01)


def _version(client, token):
    r = client.get(
        "/admin/api/accounting/data-version",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    body = r.get_json()
    assert isinstance(body.get("version"), str) and body["version"]
    return body["version"]


def _second_user_token(client):
    """註冊並登入另一個獨立使用者，回傳 auth token。"""
    t = f"{datetime.now().timestamp()}"
    data = {
        "email": f"dv-second-{t}@example.com",
        "password": "MyS3cur3P@ssw0rd!XyZ",
        "name": "DV Second User",
    }
    reg = client.post("/api/auth/register", json=data)
    assert reg.status_code in (200, 201)
    login = client.post(
        "/api/auth/login",
        json={"email": data["email"], "password": data["password"]},
    )
    assert login.status_code == 200
    return login.get_json()["token"]


class TestDataVersionStability:
    def test_stable_without_changes(self, client, auth_token):
        if not auth_token:
            pytest.skip("需要認證 token")
        v1 = _version(client, auth_token)
        v2 = _version(client, auth_token)
        assert v1 == v2

    def test_different_users_independent(self, client, auth_token):
        """A 寫入資料後，B 的版本不受影響（跨使用者隔離）。"""
        if not auth_token:
            pytest.skip("需要認證 token")
        token_b = _second_user_token(client)
        v_b_before = _version(client, token_b)
        client.post(
            "/admin/api/accounting/records",
            json={
                "type": "income",
                "amount": 100,
                "category": "薪水",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "location": "cash",
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        v_b_after = _version(client, token_b)
        assert v_b_before == v_b_after


class TestDataVersionSensitivity:
    def test_changes_on_record_create_update_delete(self, client, auth_token):
        if not auth_token:
            pytest.skip("需要認證 token")
        v0 = _version(client, auth_token)

        r = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 88,
                "category": "飲食",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "confirm_withdrawal": True,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert r.status_code in (200, 201)
        record_id = r.get_json()["id"]
        v1 = _version(client, auth_token)
        assert v1 != v0, "新增記錄後版本應改變"

        _tick()
        client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={
                "type": "expense",
                "amount": 99,
                "category": "飲食",
                "date": datetime.now().strftime("%Y-%m-%d"),
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        v2 = _version(client, auth_token)
        assert v2 != v1, "更新記錄後版本應改變"

        _tick()
        client.delete(
            f"/admin/api/accounting/records/{record_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        v3 = _version(client, auth_token)
        assert v3 != v2, "刪除記錄後版本應改變"

    def test_changes_on_budget_set(self, client, auth_token):
        if not auth_token:
            pytest.skip("需要認證 token")
        v0 = _version(client, auth_token)
        r = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"早餐": 3000}},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert r.status_code == 200
        v1 = _version(client, auth_token)
        assert v1 != v0, "設定預算後版本應改變"

    def test_changes_on_recurring_create_update(self, client, auth_token):
        if not auth_token:
            pytest.skip("需要認證 token")
        v0 = _version(client, auth_token)
        r = client.post(
            "/admin/api/recurring",
            json={
                "name": "房租",
                "amount": 8000,
                "type": "expense",
                "category": "居住",
                "day_of_month": 1,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert r.status_code == 201
        item_id = r.get_json()["id"]
        v1 = _version(client, auth_token)
        assert v1 != v0, "新增定期收支後版本應改變"

        _tick()
        client.put(
            f"/admin/api/recurring/{item_id}",
            json={
                "name": "房租",
                "amount": 8500,
                "type": "expense",
                "category": "居住",
                "day_of_month": 1,
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        v2 = _version(client, auth_token)
        assert v2 != v1, "更新定期收支後版本應改變"

    def test_changes_on_wallet_create_update(self, client, auth_token):
        if not auth_token:
            pytest.skip("需要認證 token")
        v0 = _version(client, auth_token)
        r = client.post(
            "/admin/api/wallets",
            json={"name": "零用金"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert r.status_code == 201
        wallet_id = r.get_json()["id"]
        v1 = _version(client, auth_token)
        assert v1 != v0, "新增錢包後版本應改變"

        _tick()
        client.put(
            f"/admin/api/wallets/{wallet_id}",
            json={"name": "零用金2"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        v2 = _version(client, auth_token)
        assert v2 != v1, "更新錢包後版本應改變"


def test_data_version_requires_auth(client):
    r = client.get("/admin/api/accounting/data-version")
    assert r.status_code == 401
