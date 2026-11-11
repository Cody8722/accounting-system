"""
改密碼／重設密碼後，舊 token 必須失效：
- token 的簽發時間早於「密碼最後變更時間」就拒絕
- 沒有 password_changed_at 欄位的舊帳號不受影響（不強制全員重新登入）
- 改密碼後重新登入拿到的新 token 可用
"""

import time
from datetime import datetime, timedelta

import jwt as pyjwt
from bson import ObjectId

import auth
import db

NEW_PASSWORD = "An0ther-Str0ng!Passw0rd#42"


def _protected(client, headers):
    return client.get("/api/auth/verify", headers=headers)


def _user_id(headers):
    token = headers["Authorization"].split(" ")[1]
    return auth.verify_jwt(token)["user_id"]


class TestChangePasswordRevokesTokens:
    def test_old_token_rejected_after_change_password(
        self, client, auth_headers, registered_user
    ):
        assert _protected(client, auth_headers).status_code == 200
        time.sleep(1.1)  # iat 為整數秒，確保變更時間晚於簽發時間
        resp = client.post(
            "/api/user/change-password",
            json={
                "old_password": registered_user["password"],
                "new_password": NEW_PASSWORD,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert _protected(client, auth_headers).status_code == 401

    def test_new_login_token_works_after_change_password(
        self, client, auth_headers, registered_user
    ):
        time.sleep(1.1)
        client.post(
            "/api/user/change-password",
            json={
                "old_password": registered_user["password"],
                "new_password": NEW_PASSWORD,
            },
            headers=auth_headers,
        )
        time.sleep(1.1)
        login = client.post(
            "/api/auth/login",
            json={"email": registered_user["email"], "password": NEW_PASSWORD},
        )
        assert login.status_code == 200
        new_headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
        assert _protected(client, new_headers).status_code == 200


class TestResetPasswordRevokesTokens:
    def test_old_token_rejected_after_reset_password(
        self, client, auth_headers, registered_user
    ):
        uid = _user_id(auth_headers)
        db.users_collection.update_one(
            {"_id": ObjectId(uid)},
            {
                "$set": {
                    "password_reset_token": "revoke-test-token",
                    "password_reset_expires": datetime.now() + timedelta(hours=1),
                }
            },
        )
        time.sleep(1.1)
        resp = client.post(
            "/api/auth/reset-password",
            json={"token": "revoke-test-token", "new_password": NEW_PASSWORD},
        )
        assert resp.status_code == 200
        assert _protected(client, auth_headers).status_code == 401


class TestLegacyAccountsUnaffected:
    def test_user_without_password_changed_at_keeps_working(self, client, auth_headers):
        uid = _user_id(auth_headers)
        db.users_collection.update_one(
            {"_id": ObjectId(uid)}, {"$unset": {"password_changed_at": ""}}
        )
        assert _protected(client, auth_headers).status_code == 200

    def test_token_issued_after_change_is_accepted(self, client, auth_headers):
        uid = _user_id(auth_headers)
        db.users_collection.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"password_changed_at": datetime.utcnow() - timedelta(days=1)}},
        )
        assert _protected(client, auth_headers).status_code == 200


class TestTokenWithoutIat:
    def test_token_without_iat_rejected_when_password_changed(
        self, client, auth_headers
    ):
        uid = _user_id(auth_headers)
        db.users_collection.update_one(
            {"_id": ObjectId(uid)},
            {"$set": {"password_changed_at": datetime.utcnow()}},
        )
        forged = pyjwt.encode(
            {
                "user_id": uid,
                "email": "x@example.com",
                "name": "",
                "type": "access",
                "exp": datetime.utcnow() + timedelta(hours=1),
            },
            auth.JWT_SECRET,
            algorithm=auth.JWT_ALGORITHM,
        )
        resp = _protected(client, {"Authorization": f"Bearer {forged}"})
        assert resp.status_code == 401
