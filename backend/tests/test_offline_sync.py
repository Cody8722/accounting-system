"""
test_offline_sync.py — 離線同步：POST records 的 client_id 冪等去重（Phase 2a）。

驗證重點：帶相同 client_id 重送只建立一筆並回既有 id（冪等）；不同 client_id
各自建立；不帶 client_id 維持原行為（可重複建立，向下兼容）；malformed client_id 擋下。

註：mongomock 不強制 partial unique index，故競態用的 DuplicateKeyError 安全網
無法在此以 mongomock 觸發；此處測的是主要機制（插入前 find_one 去重）。
"""

from datetime import datetime

import pytest


def _income(client_id=None, **over):
    data = {
        "type": "income",
        "amount": 500.0,
        "category": "薪水",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "description": "離線同步測試",
        "location": "cash",
    }
    if client_id is not None:
        data["client_id"] = client_id
    data.update(over)
    return data


def _post(client, token, data):
    return client.post(
        "/admin/api/accounting/records",
        json=data,
        headers={"Authorization": f"Bearer {token}"},
    )


def _incomes_with_desc(client, token, desc):
    r = client.get(
        "/admin/api/accounting/records?limit=200",
        headers={"Authorization": f"Bearer {token}"},
    )
    records = r.get_json().get("records", [])
    return [x for x in records if x.get("description") == desc]


class TestClientIdDedup:
    def test_same_client_id_twice_creates_one(self, client, auth_token):
        """相同 client_id 送兩次：只建一筆，第二次回 deduped + 同一 id。"""
        if not auth_token:
            pytest.skip("需要認證 token")
        cid = "uuid-dedup-aaa-111"
        desc = "離線同步測試-同cid"

        r1 = _post(client, auth_token, _income(client_id=cid, description=desc))
        assert r1.status_code in (200, 201)
        id1 = r1.get_json().get("id")
        assert id1

        r2 = _post(client, auth_token, _income(client_id=cid, description=desc))
        assert r2.status_code == 200
        body2 = r2.get_json()
        assert body2.get("deduped") is True
        assert body2.get("id") == id1

        assert len(_incomes_with_desc(client, auth_token, desc)) == 1

    def test_different_client_id_creates_two(self, client, auth_token):
        """不同 client_id：各自建立、id 不同。"""
        if not auth_token:
            pytest.skip("需要認證 token")
        desc = "離線同步測試-異cid"
        r1 = _post(client, auth_token, _income(client_id="cid-x1", description=desc))
        r2 = _post(client, auth_token, _income(client_id="cid-x2", description=desc))
        assert r1.status_code in (200, 201)
        assert r2.status_code in (200, 201)
        assert r1.get_json().get("id") != r2.get_json().get("id")
        assert len(_incomes_with_desc(client, auth_token, desc)) == 2

    def test_no_client_id_backward_compatible(self, client, auth_token):
        """不帶 client_id：維持原行為，可重複建立。"""
        if not auth_token:
            pytest.skip("需要認證 token")
        desc = "離線同步測試-無cid"
        r1 = _post(client, auth_token, _income(description=desc))
        r2 = _post(client, auth_token, _income(description=desc))
        assert r1.status_code in (200, 201)
        assert r2.status_code in (200, 201)
        assert r1.get_json().get("id") != r2.get_json().get("id")
        assert len(_incomes_with_desc(client, auth_token, desc)) == 2

    def test_invalid_client_id_rejected(self, client, auth_token):
        """malformed client_id（過長）→ 400。"""
        if not auth_token:
            pytest.skip("需要認證 token")
        r = _post(client, auth_token, _income(client_id="x" * 65))
        assert r.status_code == 400

    def test_blank_client_id_rejected(self, client, auth_token):
        """空白 client_id → 400。"""
        if not auth_token:
            pytest.skip("需要認證 token")
        r = _post(client, auth_token, _income(client_id="   "))
        assert r.status_code == 400
