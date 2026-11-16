"""
test_account_trash.py — 自助刪除帳號（垃圾桶）。

驗證重點：要輸入密碼；進垃圾桶後既有 token 立即失效、不能登入使用、不能走忘記密碼；
保留期內可用 Email＋密碼還原（舊 token 不會復活）；資料在垃圾桶期間完整保留；
0 天 = 立即永久刪除；Email 被新註冊接管；到期清除只動已過期的垃圾桶帳號。
"""

import time
from datetime import datetime, timedelta

import account_trash
import db
import manage_trash
import pytest
from bson import ObjectId


@pytest.fixture(autouse=True)
def no_reinit(monkeypatch):
    """manage_trash.main() 會呼叫 db.init_db()；測試用 mongomock 已連好，不要重連。"""
    monkeypatch.setattr(db, "init_db", lambda: None)


def _uid(email):
    return db.users_collection.find_one({"email": email})["_id"]


def _add_record(uid):
    db.accounting_records_collection.insert_one(
        {"user_id": uid, "type": "expense", "amount": 10, "date": "2026-01-01"}
    )


def _record_count(uid):
    return db.accounting_records_collection.count_documents({"user_id": uid})


def _delete(client, headers, password, **extra):
    return client.post(
        "/api/user/delete-account",
        json={"password": password, **extra},
        headers=headers,
    )


def _login(client, user):
    return client.post(
        "/api/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )


def _restore(client, user, password=None):
    return client.post(
        "/api/auth/restore-account",
        json={
            "email": user["email"],
            "password": password if password is not None else user["password"],
        },
    )


class TestDeleteAccount:
    def test_requires_password(self, client, auth_headers):
        assert _delete(client, auth_headers, "").status_code == 400

    def test_wrong_password_is_400_not_401(self, client, auth_headers, registered_user):
        # 401 會讓前端誤判為 JWT 過期而登出
        resp = _delete(client, auth_headers, "wrong-password")
        assert resp.status_code == 400
        assert "deleted_at" not in db.users_collection.find_one(
            {"email": registered_user["email"]}
        )

    @pytest.mark.parametrize("bad", [5, "30", True, None, -1, 365])
    def test_invalid_retention_rejected(
        self, client, auth_headers, registered_user, bad
    ):
        resp = _delete(
            client, auth_headers, registered_user["password"], retention_days=bad
        )
        assert resp.status_code == 400

    def test_requires_auth(self, client):
        assert _delete(client, {}, "x").status_code == 401

    def test_default_goes_to_trash_for_30_days(
        self, client, auth_headers, registered_user
    ):
        resp = _delete(client, auth_headers, registered_user["password"])
        assert resp.status_code == 200
        user = db.users_collection.find_one({"email": registered_user["email"]})
        assert user["deleted_at"] is not None
        assert (user["purge_at"] - user["deleted_at"]).days == 30
        # MongoDB 只存到毫秒，回應帶微秒，容許 1 秒內的差
        returned = datetime.fromisoformat(resp.get_json()["purge_at"])
        assert abs(returned - user["purge_at"]) < timedelta(seconds=1)

    @pytest.mark.parametrize("days", [7, 30, 90])
    def test_retention_choices(self, client, auth_headers, registered_user, days):
        _delete(client, auth_headers, registered_user["password"], retention_days=days)
        user = db.users_collection.find_one({"email": registered_user["email"]})
        assert (user["purge_at"] - user["deleted_at"]).days == days

    def test_existing_token_revoked_immediately(
        self, client, auth_headers, registered_user
    ):
        _delete(client, auth_headers, registered_user["password"])
        assert client.get("/api/auth/verify", headers=auth_headers).status_code == 401

    def test_data_kept_while_in_trash(self, client, auth_headers, registered_user):
        uid = _uid(registered_user["email"])
        _add_record(uid)
        _delete(client, auth_headers, registered_user["password"])
        assert _record_count(uid) == 1

    def test_zero_days_purges_immediately(self, client, auth_headers, registered_user):
        uid = _uid(registered_user["email"])
        _add_record(uid)
        db.wallets_collection.insert_one({"user_id": uid, "name": "w"})
        resp = _delete(
            client, auth_headers, registered_user["password"], retention_days=0
        )
        assert resp.status_code == 200
        assert resp.get_json()["purge_at"] is None
        assert db.users_collection.find_one({"_id": uid}) is None
        assert _record_count(uid) == 0
        assert db.wallets_collection.count_documents({"user_id": uid}) == 0
        assert _login(client, registered_user).status_code == 401


class TestLoginAndRestore:
    def _trash(self, client, auth_headers, user):
        _delete(client, auth_headers, user["password"])

    def test_login_in_trash_tells_to_restore(
        self, client, auth_headers, registered_user
    ):
        self._trash(client, auth_headers, registered_user)
        resp = _login(client, registered_user)
        assert resp.status_code == 403
        body = resp.get_json()
        assert body["code"] == "account_in_trash"
        assert body["purge_at"]
        assert "token" not in body

    def test_login_wrong_password_in_trash_reveals_nothing(
        self, client, auth_headers, registered_user
    ):
        self._trash(client, auth_headers, registered_user)
        resp = client.post(
            "/api/auth/login",
            json={"email": registered_user["email"], "password": "wrong"},
        )
        assert resp.status_code == 401
        assert "code" not in resp.get_json()

    def test_forgot_password_ignores_trashed_account(
        self, client, auth_headers, registered_user
    ):
        self._trash(client, auth_headers, registered_user)
        resp = client.post(
            "/api/auth/forgot-password", json={"email": registered_user["email"]}
        )
        assert resp.status_code == 200
        user = db.users_collection.find_one({"email": registered_user["email"]})
        assert "password_reset_token" not in user

    def test_reset_password_rejects_trashed_account(
        self, client, auth_headers, registered_user
    ):
        db.users_collection.update_one(
            {"email": registered_user["email"]},
            {
                "$set": {
                    "password_reset_token": "tok-trash",
                    "password_reset_expires": datetime.now() + timedelta(hours=1),
                }
            },
        )
        self._trash(client, auth_headers, registered_user)
        resp = client.post(
            "/api/auth/reset-password",
            json={"token": "tok-trash", "new_password": "An0ther-Str0ng!Passw0rd#42"},
        )
        assert resp.status_code == 400

    def test_restore_returns_working_token_and_keeps_data(
        self, client, auth_headers, registered_user
    ):
        uid = _uid(registered_user["email"])
        _add_record(uid)
        self._trash(client, auth_headers, registered_user)

        resp = _restore(client, registered_user)
        assert resp.status_code == 200
        new_headers = {"Authorization": f"Bearer {resp.get_json()['token']}"}
        assert client.get("/api/auth/verify", headers=new_headers).status_code == 200
        user = db.users_collection.find_one({"_id": uid})
        assert "deleted_at" not in user and "purge_at" not in user
        assert _record_count(uid) == 1
        assert _login(client, registered_user).status_code == 200

    def test_restore_does_not_revive_old_token(
        self, client, auth_headers, registered_user
    ):
        time.sleep(1.1)  # iat 為整數秒，確保刪除時間晚於舊 token 簽發時間
        self._trash(client, auth_headers, registered_user)
        _restore(client, registered_user)
        assert client.get("/api/auth/verify", headers=auth_headers).status_code == 401

    def test_restore_wrong_password(self, client, auth_headers, registered_user):
        self._trash(client, auth_headers, registered_user)
        assert _restore(client, registered_user, "wrong").status_code == 401
        assert "deleted_at" in db.users_collection.find_one(
            {"email": registered_user["email"]}
        )

    def test_restore_active_account_is_not_possible(self, client, registered_user):
        assert _restore(client, registered_user).status_code == 401

    def test_restore_after_retention_expired_is_refused(
        self, client, auth_headers, registered_user
    ):
        self._trash(client, auth_headers, registered_user)
        db.users_collection.update_one(
            {"email": registered_user["email"]},
            {"$set": {"purge_at": datetime.now() - timedelta(minutes=1)}},
        )
        assert _restore(client, registered_user).status_code == 410


class TestEmailTakeover:
    def test_active_email_still_conflicts(self, client, registered_user):
        resp = client.post("/api/auth/register", json=registered_user)
        assert resp.status_code == 409

    def test_new_registration_takes_over_trashed_email(
        self, client, auth_headers, registered_user
    ):
        old_uid = _uid(registered_user["email"])
        _add_record(old_uid)
        _delete(client, auth_headers, registered_user["password"])

        resp = client.post("/api/auth/register", json=registered_user)
        assert resp.status_code == 201

        old = db.users_collection.find_one({"_id": old_uid})
        assert old["original_email"] == registered_user["email"]
        assert old["email"].endswith("@deleted.invalid")
        # 舊帳號資料與保留期不動
        assert "deleted_at" in old and "purge_at" in old
        assert _record_count(old_uid) == 1
        # 新帳號可正常登入，且是不同的帳號
        login = _login(client, registered_user)
        assert login.status_code == 200
        assert login.get_json()["user"]["id"] != str(old_uid)

    def test_taken_over_account_cannot_be_restored_by_old_email(
        self, client, auth_headers, registered_user
    ):
        _delete(client, auth_headers, registered_user["password"])
        client.post("/api/auth/register", json=registered_user)
        assert _restore(client, registered_user).status_code == 401


class TestPurgeExpired:
    def _trashed(self, email, purge_at):
        uid = ObjectId()
        db.users_collection.insert_one(
            {
                "_id": uid,
                "email": email,
                "name": "t",
                "deleted_at": datetime.now() - timedelta(days=40),
                "purge_at": purge_at,
            }
        )
        _add_record(uid)
        return uid

    @staticmethod
    def _stamp():
        return int(datetime.now().timestamp() * 1e6)

    def test_only_expired_trashed_accounts_removed(self):
        stamp = self._stamp()
        expired = self._trashed(
            f"exp{stamp}@example.com", datetime.now() - timedelta(days=1)
        )
        pending = self._trashed(
            f"pen{stamp}@example.com", datetime.now() + timedelta(days=5)
        )
        active_uid = ObjectId()
        db.users_collection.insert_one(
            {"_id": active_uid, "email": f"act{stamp}@example.com", "name": "a"}
        )
        _add_record(active_uid)

        assert manage_trash.main(["purge-expired", "--yes"]) == 0

        assert db.users_collection.find_one({"_id": expired}) is None
        assert _record_count(expired) == 0
        assert db.users_collection.find_one({"_id": pending}) is not None
        assert _record_count(pending) == 1
        assert db.users_collection.find_one({"_id": active_uid}) is not None
        assert _record_count(active_uid) == 1

    def test_dry_run_deletes_nothing(self, capsys):
        uid = self._trashed(
            f"dry{self._stamp()}@example.com", datetime.now() - timedelta(days=1)
        )
        assert manage_trash.main(["purge-expired"]) == 0
        assert db.users_collection.find_one({"_id": uid}) is not None
        assert "預覽" in capsys.readouterr().out

    def test_list_shows_trashed_accounts(self, capsys):
        email = f"lst{self._stamp()}@example.com"
        self._trashed(email, datetime.now() + timedelta(days=3))
        assert manage_trash.main(["list"]) == 0
        assert email in capsys.readouterr().out

    def test_photos_removed_with_account(self, tmp_path):
        uid = ObjectId()
        db.users_collection.insert_one({"_id": uid, "email": "p@example.com"})
        photo_dir = tmp_path / str(uid) / "rec1"
        photo_dir.mkdir(parents=True)
        (photo_dir / "p.jpg").write_bytes(b"x")
        other = tmp_path / "someone-else"
        other.mkdir()

        account_trash.purge_user(uid, photo_root=tmp_path.resolve())

        assert not (tmp_path / str(uid)).exists()
        assert other.exists()
