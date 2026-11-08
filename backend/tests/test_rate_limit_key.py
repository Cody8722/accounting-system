"""
限速 key 測試：不能被客戶端偽造的 X-Forwarded-For 繞過。
"""

import pytest

import auth
from extensions import client_ip_from_forwarded_for, get_rate_limit_key


class TestClientIpFromForwardedFor:
    def test_single_proxy_takes_rightmost(self):
        # nginx 附加的是它實際看到的對端 IP（最右）；最左是客戶端自己填的
        assert client_ip_from_forwarded_for("1.1.1.1, 9.9.9.9", "10.0.0.1") == "9.9.9.9"

    def test_spoofed_left_entries_are_ignored(self):
        a = client_ip_from_forwarded_for("evil-1, 9.9.9.9", "10.0.0.1")
        b = client_ip_from_forwarded_for("evil-2, 9.9.9.9", "10.0.0.1")
        assert a == b == "9.9.9.9"

    def test_header_with_only_nginx_entry(self):
        assert client_ip_from_forwarded_for("9.9.9.9", "10.0.0.1") == "9.9.9.9"

    def test_missing_header_falls_back_to_remote_addr(self):
        assert client_ip_from_forwarded_for("", "10.0.0.1") == "10.0.0.1"

    def test_whitespace_and_empty_segments(self):
        assert client_ip_from_forwarded_for(" , 9.9.9.9 ,", "10.0.0.1") == "9.9.9.9"

    def test_two_trusted_proxies(self, monkeypatch):
        monkeypatch.setenv("TRUSTED_PROXY_COUNT", "2")
        assert (
            client_ip_from_forwarded_for("evil, 7.7.7.7, 8.8.8.8", "10.0.0.1")
            == "7.7.7.7"
        )

    def test_not_enough_entries_falls_back(self, monkeypatch):
        monkeypatch.setenv("TRUSTED_PROXY_COUNT", "3")
        assert (
            client_ip_from_forwarded_for("7.7.7.7, 8.8.8.8", "10.0.0.1") == "10.0.0.1"
        )

    @pytest.mark.parametrize("bad", ["abc", "", "0", "-2"])
    def test_invalid_count_behaves_like_one(self, monkeypatch, bad):
        monkeypatch.setenv("TRUSTED_PROXY_COUNT", bad)
        assert client_ip_from_forwarded_for("1.1.1.1, 9.9.9.9", "10.0.0.1") == "9.9.9.9"


class TestGetRateLimitKey:
    def test_anonymous_requests_cannot_dodge_by_changing_header(self, test_app):
        with test_app.test_request_context(
            "/", headers={"X-Forwarded-For": "fake-a, 9.9.9.9"}
        ):
            key_a = get_rate_limit_key()
        with test_app.test_request_context(
            "/", headers={"X-Forwarded-For": "fake-b, 9.9.9.9"}
        ):
            key_b = get_rate_limit_key()
        assert key_a == key_b == "9.9.9.9"

    def test_different_real_ips_get_different_keys(self, test_app):
        with test_app.test_request_context("/", headers={"X-Forwarded-For": "1.1.1.1"}):
            key_a = get_rate_limit_key()
        with test_app.test_request_context("/", headers={"X-Forwarded-For": "2.2.2.2"}):
            key_b = get_rate_limit_key()
        assert key_a != key_b

    def test_authenticated_requests_still_keyed_by_user(
        self, test_app, auth_headers, monkeypatch
    ):
        # 多個測試檔在 import 時各自覆寫 os.environ["JWT_SECRET"]，整套一起跑時
        # 環境變數的值可能與 auth 模組啟動時記下的不同；這裡對齊，避免測試順序影響結果
        monkeypatch.setenv("JWT_SECRET", auth.JWT_SECRET)
        with test_app.test_request_context(
            "/", headers={**auth_headers, "X-Forwarded-For": "fake, 9.9.9.9"}
        ):
            assert get_rate_limit_key().startswith("user:")
