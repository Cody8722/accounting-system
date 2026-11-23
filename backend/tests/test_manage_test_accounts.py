"""
test_manage_test_accounts.py — manage_test_accounts.py（E2E 測試帳號「用完即銷毀」）。

驗證重點：只動符合測試命名（且 @example.com）的帳號；預設只預覽不刪；--yes 才刪，
並連同記錄／預算／定期／欠款／錢包與照片目錄一起清；連到非測試庫或比對到太多帳號一律拒絕。
"""

import itertools
from datetime import datetime, timedelta

import db
import manage_test_accounts as mta
import pytest
from bson import ObjectId


@pytest.fixture(autouse=True)
def no_reinit(monkeypatch):
    """main() 會呼叫 db.init_db()；測試用 mongomock 已連好，不要重連。"""
    monkeypatch.setattr(db, "init_db", lambda: None)


@pytest.fixture
def photo_root(tmp_path, monkeypatch):
    monkeypatch.setattr(mta, "PHOTO_ROOT", tmp_path)
    return tmp_path


def _mk_user(email, created_at=None):
    uid = ObjectId()
    user = {"_id": uid, "email": email, "name": "t"}
    if created_at is not None:
        user["created_at"] = created_at
    db.users_collection.insert_one(user)
    db.accounting_records_collection.insert_one(
        {"user_id": uid, "type": "expense", "amount": 1, "date": "2026-01-01"}
    )
    db.accounting_budget_collection.insert_one(
        {"user_id": uid, "month": "2026-01", "budget": {"早餐": 1}}
    )
    db.recurring_collection.insert_one({"user_id": uid, "name": "r"})
    db.wallets_collection.insert_one({"user_id": uid, "name": "w"})
    # 歷史資料的 user_id 可能是字串
    db.debts_collection.insert_one({"user_id": str(uid), "name": "d"})
    return uid


def _count(uid):
    s = str(uid)
    return {
        "users": db.users_collection.count_documents({"_id": uid}),
        "records": db.accounting_records_collection.count_documents({"user_id": uid}),
        "budget": db.accounting_budget_collection.count_documents({"user_id": uid}),
        "recurring": db.recurring_collection.count_documents({"user_id": uid}),
        "wallets": db.wallets_collection.count_documents({"user_id": uid}),
        "debts": db.debts_collection.count_documents({"user_id": {"$in": [uid, s]}}),
    }


_seq = itertools.count(1)


def _unique(prefix, domain="example.com"):
    # 時間戳＋遞增計數（Windows 時鐘精度粗，連續呼叫會得到同一個時間戳）；全為數字以符合預設 pattern
    return f"{prefix}-{int(datetime.now().timestamp() * 1e6)}{next(_seq)}@{domain}"


class TestFind:
    def test_matches_only_test_naming(self):
        ok1 = _unique("v2")
        ok2 = _unique("probe")
        no_domain = _unique("v2", "gmail.com")
        no_prefix = f"someone-{next(_seq)}@example.com"
        no_digits = "v2-abc@example.com"
        for e in (ok1, ok2, no_domain, no_prefix, no_digits):
            _mk_user(e)
        emails = {a["email"] for a in mta.find_accounts(mta.DEFAULT_PATTERN)}
        assert {ok1, ok2} <= emails
        assert not ({no_domain, no_prefix, no_digits} & emails)

    def test_custom_pattern_still_limited_to_example_com(self):
        real = _unique("v2", "gmail.com")
        _mk_user(real)
        emails = {a["email"] for a in mta.find_accounts(r".*")}
        assert real not in emails

    def test_invalid_pattern_rejected(self):
        with pytest.raises(ValueError):
            mta.find_accounts("(")


class TestPurge:
    def test_dry_run_deletes_nothing(self, photo_root, capsys):
        uid = _mk_user(_unique("v2"))
        assert mta.main(["purge"]) == 0
        assert all(v >= 1 for v in _count(uid).values())
        assert "預覽" in capsys.readouterr().out

    def test_yes_deletes_account_and_all_data(self, photo_root):
        target = _mk_user(_unique("v2"))
        keep = _mk_user(_unique("keep", "gmail.com"))
        photo_dir = photo_root / str(target) / "rec1"
        photo_dir.mkdir(parents=True)
        (photo_dir / "p.jpg").write_bytes(b"x")
        other_dir = photo_root / str(keep)
        other_dir.mkdir()

        assert mta.main(["purge", "--yes"]) == 0

        assert all(v == 0 for v in _count(target).values())
        assert not (photo_root / str(target)).exists()
        # 不符合命名的帳號與它的資料、照片原封不動
        assert all(v >= 1 for v in _count(keep).values())
        assert other_dir.exists()

    def test_refuses_non_test_database(self, monkeypatch, photo_root, capsys):
        uid = _mk_user(_unique("v2"))
        monkeypatch.setattr(mta, "_db_name", lambda: "accounting_db")
        assert mta.main(["purge", "--yes"]) == 1
        assert all(v >= 1 for v in _count(uid).values())
        assert "測試" in capsys.readouterr().out

    def test_refuses_when_too_many_matches(self, monkeypatch, photo_root):
        uid = _mk_user(_unique("v2"))
        monkeypatch.setattr(mta, "MAX_PURGE", 0)
        assert mta.main(["purge", "--yes"]) == 1
        assert all(v >= 1 for v in _count(uid).values())

    def test_recent_minutes_only_deletes_recently_created(self, photo_root):
        now = datetime.now()
        old = _mk_user(_unique("v2"), created_at=now - timedelta(hours=3))
        fresh = _mk_user(_unique("v2"), created_at=now - timedelta(minutes=2))
        no_date = _mk_user(_unique("v2"))  # 沒有 created_at 的舊資料：保守起見不動

        assert mta.main(["purge", "--yes", "--recent-minutes", "10"]) == 0

        assert all(v == 0 for v in _count(fresh).values())
        assert all(v >= 1 for v in _count(old).values())
        assert all(v >= 1 for v in _count(no_date).values())

    @pytest.mark.parametrize("bad", ["0", "-5", "abc"])
    def test_recent_minutes_must_be_positive_number(self, bad):
        with pytest.raises(SystemExit):
            mta.main(["purge", "--recent-minutes", bad])

    def test_list_command(self, capsys):
        email = _unique("probe")
        _mk_user(email)
        assert mta.main(["list"]) == 0
        assert email in capsys.readouterr().out
