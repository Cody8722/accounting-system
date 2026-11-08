"""
邀請制註冊測試：REGISTRATION_MODE（open / invite / closed）與一次性邀請碼。
"""

import uuid
from datetime import datetime, timedelta

import pytest

import db
import invites
import manage_invites

PASSWORD = "MyS3cur3P@ssw0rd!XyZ"


def _payload(**extra):
    return {
        "email": f"invitee-{uuid.uuid4().hex[:10]}@example.com",
        "password": PASSWORD,
        "name": "Invitee",
        **extra,
    }


class _Args:
    def __init__(self, **kw):
        self.__dict__.update(kw)


@pytest.fixture(autouse=True)
def _clean_invites(monkeypatch):
    """每個測試前清空邀請碼，並確保不被外部 REGISTRATION_MODE 影響。"""
    monkeypatch.delenv("REGISTRATION_MODE", raising=False)
    db.invites_collection.delete_many({})
    yield
    db.invites_collection.delete_many({})


@pytest.fixture
def invite_mode(monkeypatch):
    monkeypatch.setenv("REGISTRATION_MODE", "invite")


class TestRegistrationMode:
    def test_default_is_open(self):
        assert invites.get_registration_mode() == "open"

    @pytest.mark.parametrize("value", ["open", "invite", "closed", " INVITE "])
    def test_valid_values(self, monkeypatch, value):
        monkeypatch.setenv("REGISTRATION_MODE", value)
        assert invites.get_registration_mode() == value.strip().lower()

    @pytest.mark.parametrize("value", ["invit", "true", "no", "1"])
    def test_unrecognized_value_fails_closed(self, monkeypatch, value):
        monkeypatch.setenv("REGISTRATION_MODE", value)
        assert invites.get_registration_mode() == "closed"

    def test_config_endpoint_reports_mode(self, client, monkeypatch):
        assert client.get("/api/auth/registration-config").get_json() == {
            "mode": "open"
        }
        monkeypatch.setenv("REGISTRATION_MODE", "invite")
        assert client.get("/api/auth/registration-config").get_json() == {
            "mode": "invite"
        }


class TestOpenMode:
    def test_register_without_code_still_works(self, client):
        res = client.post("/api/auth/register", json=_payload())
        assert res.status_code == 201

    def test_invite_code_is_ignored(self, client):
        res = client.post("/api/auth/register", json=_payload(invite_code="whatever"))
        assert res.status_code == 201


class TestClosedMode:
    def test_register_rejected(self, client, monkeypatch):
        monkeypatch.setenv("REGISTRATION_MODE", "closed")
        res = client.post("/api/auth/register", json=_payload())
        assert res.status_code == 403

    def test_valid_invite_does_not_bypass_closed(self, client, monkeypatch):
        code = invites.create_invite()["code"]
        monkeypatch.setenv("REGISTRATION_MODE", "closed")
        res = client.post("/api/auth/register", json=_payload(invite_code=code))
        assert res.status_code == 403
        assert invites.is_invite_available(code)

    def test_login_still_works(self, client, monkeypatch):
        data = _payload()
        assert client.post("/api/auth/register", json=data).status_code == 201
        monkeypatch.setenv("REGISTRATION_MODE", "closed")
        res = client.post(
            "/api/auth/login",
            json={"email": data["email"], "password": data["password"]},
        )
        assert res.status_code == 200


class TestInviteMode:
    def test_missing_code_rejected(self, client, invite_mode):
        assert client.post("/api/auth/register", json=_payload()).status_code == 403

    def test_wrong_code_rejected(self, client, invite_mode):
        res = client.post("/api/auth/register", json=_payload(invite_code="nope"))
        assert res.status_code == 403

    @pytest.mark.parametrize("bad", [None, 123, ["x"], {"$ne": ""}])
    def test_non_string_code_rejected(self, client, invite_mode, bad):
        res = client.post("/api/auth/register", json=_payload(invite_code=bad))
        assert res.status_code == 403

    def test_valid_code_registers_and_is_single_use(self, client, invite_mode):
        invite = invites.create_invite(note="給朋友")
        first = _payload(invite_code=invite["code"])
        assert client.post("/api/auth/register", json=first).status_code == 201

        # 同一組碼第二次使用 → 拒絕
        second = _payload(invite_code=invite["code"])
        assert client.post("/api/auth/register", json=second).status_code == 403

        doc = db.invites_collection.find_one({"note": "給朋友"})
        assert doc["used_at"] is not None
        user = db.users_collection.find_one({"email": first["email"]})
        assert doc["used_by"] == user["_id"]

    def test_code_is_trimmed(self, client, invite_mode):
        code = invites.create_invite()["code"]
        res = client.post("/api/auth/register", json=_payload(invite_code=f"  {code} "))
        assert res.status_code == 201

    def test_expired_code_rejected(self, client, invite_mode):
        code = invites.create_invite(valid_days=1)["code"]
        db.invites_collection.update_one(
            {}, {"$set": {"expires_at": datetime.now() - timedelta(minutes=1)}}
        )
        res = client.post("/api/auth/register", json=_payload(invite_code=code))
        assert res.status_code == 403

    def test_unexpired_code_accepted(self, client, invite_mode):
        code = invites.create_invite(valid_days=7)["code"]
        res = client.post("/api/auth/register", json=_payload(invite_code=code))
        assert res.status_code == 201

    def test_revoked_code_rejected(self, client, invite_mode):
        code = invites.create_invite()["code"]
        db.invites_collection.update_one({}, {"$set": {"revoked": True}})
        res = client.post("/api/auth/register", json=_payload(invite_code=code))
        assert res.status_code == 403

    def test_code_not_consumed_by_validation_failure(self, client, invite_mode):
        """密碼太弱等驗證失敗不能燒掉邀請碼。"""
        code = invites.create_invite()["code"]
        bad = _payload(invite_code=code, password="weak")
        assert client.post("/api/auth/register", json=bad).status_code == 400
        assert invites.is_invite_available(code)

    def test_code_not_consumed_by_duplicate_email(self, client, invite_mode):
        first_code = invites.create_invite()["code"]
        data = _payload(invite_code=first_code)
        assert client.post("/api/auth/register", json=data).status_code == 201

        second_code = invites.create_invite()["code"]
        dup = {**data, "invite_code": second_code}
        assert client.post("/api/auth/register", json=dup).status_code == 409
        assert invites.is_invite_available(second_code)

    def test_no_email_enumeration_without_code(self, client, invite_mode):
        """沒有有效邀請碼時，已註冊與未註冊的 Email 回應一致（都是邀請碼錯誤）。"""
        code = invites.create_invite()["code"]
        existing = _payload(invite_code=code)
        assert client.post("/api/auth/register", json=existing).status_code == 201

        taken = {**existing, "invite_code": "bad"}
        fresh = _payload(invite_code="bad")
        r1 = client.post("/api/auth/register", json=taken)
        r2 = client.post("/api/auth/register", json=fresh)
        assert r1.status_code == r2.status_code == 403
        assert r1.get_json() == r2.get_json()


class TestInviteStorage:
    def test_only_hash_is_stored(self):
        invite = invites.create_invite()
        doc = db.invites_collection.find_one()
        assert invite["code"] not in str(doc)
        assert doc["code_hash"] == invites.hash_code(invite["code"])

    def test_codes_are_unique_and_long_enough(self):
        codes = {invites.generate_code() for _ in range(50)}
        assert len(codes) == 50
        assert all(len(c) >= 12 for c in codes)

    def test_claim_is_atomic_single_winner(self):
        code = invites.create_invite()["code"]
        assert invites.claim_invite(code) is not None
        assert invites.claim_invite(code) is None

    def test_release_makes_code_usable_again(self):
        code = invites.create_invite()["code"]
        claimed = invites.claim_invite(code)
        invites.release_invite(claimed["_id"])
        assert invites.is_invite_available(code)


class TestManageInvitesCli:
    def test_create_list_revoke(self, capsys):
        manage_invites.cmd_create(_Args(count=2, days=3, note="cli"))
        assert capsys.readouterr().out.count("(id: ") == 2

        manage_invites.cmd_list(_Args(all=False))
        assert capsys.readouterr().out.count("可用") == 2

        target = db.invites_collection.find_one()
        assert manage_invites.cmd_revoke(_Args(id=str(target["_id"]))) == 0
        manage_invites.cmd_list(_Args(all=False))
        assert capsys.readouterr().out.count("可用") == 1

    def test_revoke_used_code_fails(self):
        code = invites.create_invite()["code"]
        claimed = invites.claim_invite(code)
        assert manage_invites.cmd_revoke(_Args(id=str(claimed["_id"]))) == 1

    def test_revoke_bad_id(self):
        assert manage_invites.cmd_revoke(_Args(id="not-an-id")) == 1
