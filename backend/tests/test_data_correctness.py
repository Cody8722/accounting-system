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


DEBTS = "/admin/api/debts"


def _make_debt(client, headers, members=None):
    payload = {
        "person": "小明",
        "amount": 1000,
        "debt_type": "borrowed",
        "reason": "測試",
    }
    if members:
        payload["members"] = members
    r = client.post(DEBTS, json=payload, headers=headers)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["id"]


class TestRepaymentDateValidated:
    @pytest.mark.parametrize("bad", ["not-a-date", "2026-13-45", "20260101", 123])
    def test_repay_rejects_bad_date(self, client, headers, bad):
        debt_id = _make_debt(client, headers)
        r = client.post(
            f"{DEBTS}/{debt_id}/repay",
            json={"amount": 100, "date": bad},
            headers=headers,
        )
        assert r.status_code == 400, r.get_json()
        # 無效日期不能留下半套資料：沒有還款、沒有記帳記錄
        debt = db_module.debts_collection.find_one({"_id": ObjectId(debt_id)})
        assert not debt.get("repayments")
        assert (
            db_module.accounting_records_collection.count_documents(
                {"debt_id": ObjectId(debt_id)}
            )
            == 0
        )

    @pytest.mark.parametrize("bad", ["not-a-date", "2026-02-30"])
    def test_member_repay_rejects_bad_date(self, client, headers, bad):
        debt_id = _make_debt(client, headers, members=[{"name": "A", "share": 500}])
        r = client.post(
            f"{DEBTS}/{debt_id}/members/0/repay",
            json={"amount": 100, "date": bad},
            headers=headers,
        )
        assert r.status_code == 400, r.get_json()
        debt = db_module.debts_collection.find_one({"_id": ObjectId(debt_id)})
        assert debt["members"][0].get("paid_amount", 0) == 0

    def test_repay_without_date_uses_today(self, client, headers):
        debt_id = _make_debt(client, headers)
        r = client.post(
            f"{DEBTS}/{debt_id}/repay", json={"amount": 100}, headers=headers
        )
        assert r.status_code == 200
        rec = db_module.accounting_records_collection.find_one(
            {"debt_id": ObjectId(debt_id)}
        )
        assert rec["date"] == _today()


class TestMemberRepaySyncFailureReported:
    def test_sync_failure_is_reported_like_normal_repay(self, client, headers):
        debt_id = _make_debt(client, headers, members=[{"name": "A", "share": 500}])
        coll = db_module.accounting_records_collection
        with mock.patch.object(coll, "insert_one", side_effect=RuntimeError("boom")):
            r = client.post(
                f"{DEBTS}/{debt_id}/members/0/repay",
                json={"amount": 100},
                headers=headers,
            )
        assert r.status_code == 200
        assert r.get_json().get("sync_failed") is True


class TestRecordFiltersStrict:
    @pytest.mark.parametrize(
        "query",
        [
            "start_date=bad&end_date=2026-01-31",
            "start_date=2026-01-01&end_date=2026-13-45",
            "type=bogus",
        ],
    )
    def test_invalid_filter_returns_400(self, client, headers, query):
        r = client.get(f"{ACCOUNTING}/records?{query}", headers=headers)
        assert r.status_code == 400, r.get_json()

    @pytest.mark.parametrize(
        "query", ["start_date=bad&end_date=2026-01-31", "type=bogus"]
    )
    def test_export_invalid_filter_returns_400(self, client, headers, query):
        r = client.get(f"{ACCOUNTING}/export?format=csv&{query}", headers=headers)
        assert r.status_code == 400

    def test_valid_filters_still_work(self, client, headers):
        r = client.get(
            f"{ACCOUNTING}/records?start_date=2026-01-01&end_date=2026-01-31&type=expense",
            headers=headers,
        )
        assert r.status_code == 200


class TestRecurringApplyIdempotent:
    def _create(self, client, headers):
        r = client.post(
            "/admin/api/recurring",
            json={"name": "房租", "amount": 8000, "type": "expense", "day_of_month": 5},
            headers=headers,
        )
        assert r.status_code == 201, r.get_json()
        return r.get_json()["id"]

    def _count(self, item_id):
        return db_module.accounting_records_collection.count_documents(
            {"description": "房租", "auto_generated": {"$ne": True}}
        )

    def test_second_apply_same_month_is_rejected(self, client, headers):
        item_id = self._create(client, headers)
        first = client.post(f"/admin/api/recurring/{item_id}/apply", headers=headers)
        assert first.status_code == 201
        second = client.post(f"/admin/api/recurring/{item_id}/apply", headers=headers)
        assert second.status_code == 409, second.get_json()
        assert self._count(item_id) == 1

    def test_apply_invalidates_stats_cache(self, client, headers):
        month = datetime.now().strftime("%Y-%m")
        url = f"{ACCOUNTING}/stats?start_date={month}-01&end_date={month}-28"
        before = client.get(url, headers=headers).get_json()
        item_id = self._create(client, headers)
        client.post(f"/admin/api/recurring/{item_id}/apply", headers=headers)
        after = client.get(url, headers=headers).get_json()
        assert after["total_expense"] == before["total_expense"] + 8000

    def test_failed_insert_does_not_burn_the_month(self, client, headers):
        item_id = self._create(client, headers)
        coll = db_module.accounting_records_collection
        with mock.patch.object(coll, "insert_one", side_effect=RuntimeError("boom")):
            bad = client.post(f"/admin/api/recurring/{item_id}/apply", headers=headers)
        assert bad.status_code == 500
        ok = client.post(f"/admin/api/recurring/{item_id}/apply", headers=headers)
        assert ok.status_code == 201


class TestRepaymentInvalidatesStatsCache:
    def test_repay_updates_stats_immediately(self, client, headers):
        month = datetime.now().strftime("%Y-%m")
        url = f"{ACCOUNTING}/stats?start_date={month}-01&end_date={month}-28"
        before = client.get(url, headers=headers).get_json()
        debt_id = _make_debt(client, headers)
        r = client.post(
            f"{DEBTS}/{debt_id}/repay", json={"amount": 300}, headers=headers
        )
        assert r.status_code == 200
        after = client.get(url, headers=headers).get_json()
        assert after["total_expense"] == before["total_expense"] + 300


class TestArchivedWalletIsReadOnly:
    def _archive(self, client, headers, wallet_id):
        r = client.delete(f"/admin/api/wallets/{wallet_id}", headers=headers)
        assert r.status_code == 200

    def _record(self, client, headers, wallet_id, **extra):
        payload = {
            "type": "income",
            "amount": 500,
            "category": "測試",
            "date": _today(),
            "wallet_id": wallet_id,
            "location": "bank",
        }
        payload.update(extra)
        return client.post(f"{ACCOUNTING}/records", json=payload, headers=headers)

    def test_cannot_add_record_to_archived_wallet(self, client, headers, wallet_id):
        self._archive(client, headers, wallet_id)
        r = self._record(client, headers, wallet_id)
        assert r.status_code == 400, r.get_json()
        assert "封存" in r.get_json()["error"]

    def test_cannot_add_transfer_in_archived_wallet(self, client, headers, wallet_id):
        self._archive(client, headers, wallet_id)
        r = client.post(
            f"{ACCOUNTING}/records/transfer",
            json={
                "wallet_id": wallet_id,
                "from_location": "bank",
                "to_location": "cash",
                "amount": 10,
                "date": _today(),
                "confirm_negative": True,
            },
            headers=headers,
        )
        assert r.status_code == 400, r.get_json()

    def test_cannot_edit_or_delete_record_of_archived_wallet(
        self, client, headers, wallet_id
    ):
        rid = self._record(client, headers, wallet_id).get_json()["id"]
        self._archive(client, headers, wallet_id)
        put = client.put(
            f"{ACCOUNTING}/records/{rid}",
            json={"amount": 999},
            headers=headers,
        )
        assert put.status_code == 400, put.get_json()
        delete = client.delete(f"{ACCOUNTING}/records/{rid}", headers=headers)
        assert delete.status_code == 400, delete.get_json()
        doc = db_module.accounting_records_collection.find_one({"_id": ObjectId(rid)})
        assert doc["amount"] == 500

    def test_cannot_unlock_in_archived_wallet(self, client, headers, wallet_id):
        data = _split(client, headers, wallet_id)
        self._archive(client, headers, wallet_id)
        r = client.post(
            f"{ACCOUNTING}/records/{data['restricted_id']}/unlock",
            json={"date": _today()},
            headers=headers,
        )
        assert r.status_code == 400, r.get_json()

    def test_cannot_move_record_into_archived_wallet(self, client, headers, wallet_id):
        other = client.post(
            "/admin/api/wallets", json={"name": "另一個"}, headers=headers
        ).get_json()["id"]
        rid = self._record(client, headers, other).get_json()["id"]
        self._archive(client, headers, wallet_id)
        put = client.put(
            f"{ACCOUNTING}/records/{rid}",
            json={"wallet_id": wallet_id},
            headers=headers,
        )
        assert put.status_code == 400, put.get_json()

    def test_unarchived_wallet_works_again(self, client, headers, wallet_id):
        self._archive(client, headers, wallet_id)
        r = client.put(
            f"/admin/api/wallets/{wallet_id}",
            json={"archived": False},
            headers=headers,
        )
        assert r.status_code == 200
        assert self._record(client, headers, wallet_id).status_code == 201

    def test_reading_archived_wallet_records_still_works(
        self, client, headers, wallet_id
    ):
        self._record(client, headers, wallet_id)
        self._archive(client, headers, wallet_id)
        r = client.get(f"{ACCOUNTING}/records", headers=headers)
        assert r.status_code == 200
