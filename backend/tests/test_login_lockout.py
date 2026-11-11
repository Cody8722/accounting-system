"""
登入失敗鎖定（extensions._is_locked_out 等，routes/auth.py 的 login 使用）：
- 鎖定以「來源 IP + email」為鍵：別人從其他 IP 亂試密碼，不能把本人鎖在外面
- 查詢不為任意 email 建立記錄、記錄表有上限，避免記憶體被灌爆
現有測試環境（TESTING=true）會略過鎖定，所以這裡用 monkeypatch 暫時關掉該旗標。
"""

import pytest

import extensions

LOGIN_URL = "/api/auth/login"


@pytest.fixture(autouse=True)
def _enable_lockout(monkeypatch):
    monkeypatch.setenv("TESTING", "false")
    extensions._login_failures.clear()
    yield
    extensions._login_failures.clear()


def _login(client, email, password, ip):
    return client.post(
        LOGIN_URL,
        json={"email": email, "password": password},
        headers={"X-Forwarded-For": ip},
    )


class TestLockoutIsPerIp:
    def test_attacker_ip_locked_but_owner_ip_still_works(self, client, registered_user):
        email = registered_user["email"]
        for _ in range(extensions.LOCKOUT_THRESHOLD):
            assert (
                _login(client, email, "wrong-password", "203.0.113.9").status_code
                == 401
            )

        # 攻擊者自己被鎖
        assert _login(client, email, "wrong-password", "203.0.113.9").status_code == 429
        # 本人從另一個 IP 仍可登入
        ok = _login(client, email, registered_user["password"], "198.51.100.7")
        assert ok.status_code == 200

    def test_success_clears_only_that_ip(self, client, registered_user):
        email = registered_user["email"]
        for _ in range(2):
            _login(client, email, "wrong-password", "203.0.113.9")
        _login(client, email, "wrong-password", "198.51.100.7")
        _login(client, email, registered_user["password"], "198.51.100.7")

        assert not extensions._is_locked_out(email, "198.51.100.7")
        assert len(extensions._login_failures) == 1  # 攻擊者那筆仍在


class TestLockoutStorage:
    def test_check_does_not_create_entries(self):
        for i in range(20):
            extensions._is_locked_out(f"nobody{i}@example.com", "203.0.113.1")
        assert len(extensions._login_failures) == 0

    def test_table_size_is_bounded(self, monkeypatch):
        monkeypatch.setattr(extensions, "MAX_TRACKED_LOGIN_KEYS", 50)
        for i in range(200):
            extensions._record_login_failure(f"u{i}@example.com", f"10.0.0.{i % 250}")
        assert len(extensions._login_failures) <= 50

    def test_locks_after_threshold_and_not_before(self):
        ip = "203.0.113.5"
        email = "target@example.com"
        for _ in range(extensions.LOCKOUT_THRESHOLD - 1):
            extensions._record_login_failure(email, ip)
        assert not extensions._is_locked_out(email, ip)
        extensions._record_login_failure(email, ip)
        assert extensions._is_locked_out(email, ip)
