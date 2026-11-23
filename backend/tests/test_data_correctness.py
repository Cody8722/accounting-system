"""
資料正確性回歸測試（docs/ROADMAP_v2.md 的 2a）。

每個測試在修正前都會失敗。刻意不使用 skip，也不接受 500 當通過。
"""

import copy
import os
import sys
import threading
from datetime import datetime
from unittest import mock

import pytest
from bson import ObjectId

os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module
import db as db_module

ACCOUNTING = "/admin/api/accounting"


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.url_map.strict_slashes = False
    with app.test_client() as c:
        yield c


@pytest.fixture
def headers():
    token = auth_module.generate_jwt(
        "000000000000000000000401", "correctness@example.com", "Correctness"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def wallet_id(client, headers):
    r = client.post("/admin/api/wallets", json={"name": "正確性測試"}, headers=headers)
    assert r.status_code == 201
    return r.get_json()["id"]


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _split(client, headers, wallet_id):
    r = client.post(
        f"{ACCOUNTING}/records",
        json={
            "type": "income",
            "amount": 200,
            "category": "測試",
            "date": _today(),
            "wallet_id": wallet_id,
            "location": "bank",
            "restricted_amount": 3000,
            "restricted_description": "代收",
        },
        headers=headers,
    )
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def _unlock_expenses(restricted_id):
    return list(
        db_module.accounting_records_collection.find(
            {"source_restricted_id": ObjectId(restricted_id)}
        )
    )


class TestUnlockIsAtomic:
    def test_stale_read_cannot_create_second_expense(self, client, headers, wallet_id):
        """競態：兩個請求都在對方更新前讀到「尚未解鎖」。
        第二個請求即使拿到過期的快照，也不能再產生一筆支出。"""
        data = _split(client, headers, wallet_id)
        rid = data["restricted_id"]
        coll = db_module.accounting_records_collection
        stale = copy.deepcopy(coll.find_one({"_id": ObjectId(rid)}))
        assert stale["type"] == "restricted"

        first = client.post(
            f"{ACCOUNTING}/records/{rid}/unlock",
            json={"date": _today()},
            headers=headers,
        )
        assert first.status_code == 201

        real_find_one = coll.find_one
        calls = {"n": 0}

        def stale_find_one(query=None, *a, **kw):
            if query and query.get("_id") == ObjectId(rid) and calls["n"] == 0:
                calls["n"] += 1
                return copy.deepcopy(stale)
            return real_find_one(query, *a, **kw)

        with mock.patch.object(coll, "find_one", side_effect=stale_find_one):
            second = client.post(
                f"{ACCOUNTING}/records/{rid}/unlock",
                json={"date": _today()},
                headers=headers,
            )

        assert second.status_code == 400, second.get_json()
        assert len(_unlock_expenses(rid)) == 1

    def test_parallel_unlocks_create_exactly_one_expense(
        self, client, headers, wallet_id
    ):
        data = _split(client, headers, wallet_id)
        rid = data["restricted_id"]
        statuses = []
        barrier = threading.Barrier(6)

        def worker():
            with app.test_client() as c:
                barrier.wait()
                r = c.post(
                    f"{ACCOUNTING}/records/{rid}/unlock",
                    json={"date": _today()},
                    headers=headers,
                )
                statuses.append(r.status_code)

        threads = [threading.Thread(target=worker) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert statuses.count(201) == 1, statuses
        assert len(_unlock_expenses(rid)) == 1


class TestDeleteUnlockedIncome:
    def test_deleting_unlocked_income_removes_paired_expense(
        self, client, headers, wallet_id
    ):
        data = _split(client, headers, wallet_id)
        rid = data["restricted_id"]
        r = client.post(
            f"{ACCOUNTING}/records/{rid}/unlock",
            json={"date": _today()},
            headers=headers,
        )
        assert r.status_code == 201
        expense_id = r.get_json()["expense_id"]

        d = client.delete(f"{ACCOUNTING}/records/{rid}", headers=headers)
        assert d.status_code == 200

        coll = db_module.accounting_records_collection
        assert coll.find_one({"_id": ObjectId(rid)}) is None
        assert coll.find_one({"_id": ObjectId(expense_id)}) is None, "留下孤兒支出"

    def test_deleting_locked_restricted_leaves_other_records(
        self, client, headers, wallet_id
    ):
        data = _split(client, headers, wallet_id)
        d = client.delete(
            f"{ACCOUNTING}/records/{data['restricted_id']}", headers=headers
        )
        assert d.status_code == 200
        assert (
            db_module.accounting_records_collection.find_one(
                {"_id": ObjectId(data["id"])}
            )
            is not None
        )
