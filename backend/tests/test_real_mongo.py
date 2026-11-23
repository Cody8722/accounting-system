"""
需要真 MongoDB 的測試（docs/ROADMAP_v2.md 的 2g）。

mongomock 驗不到唯一索引、部分索引與並發行為，這些「管錢」的保證要在真 Mongo 上驗：
    REAL_MONGO_URI=mongodb://localhost:27017/real_mongo_test pytest backend/tests -m real_mongo

沒設 REAL_MONGO_URI 時這個檔案的測試不會被收集（見 conftest.pytest_collection_modifyitems）；
CI 的 mongo:7.0 服務會另外跑一步。
"""

import os
import sys
import threading
import uuid
from datetime import datetime

import pytest
from bson import ObjectId

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module
import db as db_module

pytestmark = pytest.mark.real_mongo

ACCOUNTING = "/admin/api/accounting"
THREADS = 8


@pytest.fixture
def user():
    """每個測試一個全新使用者（隨機 ID），彼此資料不互相污染。"""
    uid = str(ObjectId())
    token = auth_module.generate_jwt(uid, f"{uid}@example.com", "Real Mongo")
    return {"id": uid, "headers": {"Authorization": f"Bearer {token}"}}


def _today():
    return datetime.now().strftime("%Y-%m-%d")


def _run_parallel(fn, n=THREADS):
    """n 個執行緒在 barrier 同時出發，回傳各自的結果。"""
    barrier = threading.Barrier(n)
    results = [None] * n
    errors = []

    def worker(i):
        try:
            with app.test_client() as c:
                barrier.wait(timeout=10)
                results[i] = fn(c, i)
        except Exception as e:  # pragma: no cover - 只在失敗時用到
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert not errors, errors
    return results


def test_connected_to_real_mongo():
    """防呆：確實不是 mongomock，否則這個檔案的其他測試沒有意義。"""
    assert "mongomock" not in type(db_module.client).__module__
    assert db_module.accounting_records_collection is not None


def test_client_id_unique_partial_index_exists():
    indexes = db_module.accounting_records_collection.index_information()
    unique = [
        v for v in indexes.values() if v.get("unique") and ("client_id", 1) in v["key"]
    ]
    assert unique, indexes
    assert unique[0].get("partialFilterExpression"), unique[0]


def test_duplicate_client_id_rejected_by_database(user):
    coll = db_module.accounting_records_collection
    base = {"user_id": ObjectId(user["id"]), "client_id": "dup-1", "amount": 1}
    coll.insert_one(dict(base))
    from pymongo.errors import DuplicateKeyError

    with pytest.raises(DuplicateKeyError):
        coll.insert_one(dict(base))
    # 不帶 client_id 的記錄不受唯一索引約束
    coll.insert_one({"user_id": ObjectId(user["id"]), "amount": 1})
    coll.insert_one({"user_id": ObjectId(user["id"]), "amount": 1})


def test_parallel_unlock_creates_exactly_one_expense(user):
    with app.test_client() as c:
        w = c.post("/admin/api/wallets", json={"name": "並發"}, headers=user["headers"])
        assert w.status_code == 201
        created = c.post(
            f"{ACCOUNTING}/records",
            json={
                "type": "income",
                "amount": 200,
                "category": "測試",
                "date": _today(),
                "wallet_id": w.get_json()["id"],
                "location": "bank",
                "restricted_amount": 3000,
            },
            headers=user["headers"],
        )
        assert created.status_code == 201, created.get_json()
        rid = created.get_json()["restricted_id"]

    def unlock(c, i):
        return c.post(
            f"{ACCOUNTING}/records/{rid}/unlock",
            json={"date": _today()},
            headers=user["headers"],
        ).status_code

    statuses = _run_parallel(unlock)
    assert statuses.count(201) == 1, statuses
    assert all(s in (201, 400) for s in statuses), statuses
    expenses = db_module.accounting_records_collection.count_documents(
        {"source_restricted_id": ObjectId(rid)}
    )
    assert expenses == 1


def test_parallel_same_client_id_creates_exactly_one_record(user):
    client_id = str(uuid.uuid4())

    def create(c, i):
        r = c.post(
            f"{ACCOUNTING}/records",
            json={
                "type": "income",
                "amount": 100,
                "category": "測試",
                "date": _today(),
                "location": "cash",
                "client_id": client_id,
            },
            headers=user["headers"],
        )
        return r.status_code, (r.get_json() or {}).get("id")

    results = _run_parallel(create)
    assert all(status in (200, 201) for status, _ in results), results
    ids = {rid for _, rid in results}
    assert len(ids) == 1, results
    count = db_module.accounting_records_collection.count_documents(
        {"user_id": ObjectId(user["id"]), "client_id": client_id}
    )
    assert count == 1


def test_parallel_recurring_apply_creates_exactly_one_record(user):
    with app.test_client() as c:
        r = c.post(
            "/admin/api/recurring",
            json={"name": "並發房租", "amount": 8000, "type": "expense"},
            headers=user["headers"],
        )
        assert r.status_code == 201, r.get_json()
        item_id = r.get_json()["id"]

    def apply(c, i):
        return c.post(
            f"/admin/api/recurring/{item_id}/apply", headers=user["headers"]
        ).status_code

    statuses = _run_parallel(apply)
    assert statuses.count(201) == 1, statuses
    assert all(s in (201, 409) for s in statuses), statuses
    count = db_module.accounting_records_collection.count_documents(
        {"user_id": ObjectId(user["id"]), "description": "並發房租"}
    )
    assert count == 1
