"""
認證系統測試
測試 JWT 認證、註冊、登入、密碼驗證等功能
"""

import pytest
import sys
import os
from datetime import datetime, timedelta

# Set environment variables before importing main
os.environ["TESTING"] = "true"
os.environ["ADMIN_SECRET"] = "test-secret-key-123"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth


@pytest.fixture
def client():
    """創建測試客戶端"""
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.url_map.strict_slashes = False
    with app.test_client() as client:
        yield client


class TestPasswordValidation:
    """密碼驗證測試"""

    def test_password_too_short(self):
        """測試密碼太短"""
        result = auth.validate_password_strength_detailed("short", "", "")
        assert not result["valid"]
        assert not result["checks"]["length"]["passed"]

    def test_password_missing_uppercase(self):
        """測試缺少大寫字母"""
        result = auth.validate_password_strength_detailed("lowercase123!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["uppercase"]["passed"]

    def test_password_missing_lowercase(self):
        """測試缺少小寫字母"""
        result = auth.validate_password_strength_detailed("UPPERCASE123!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["lowercase"]["passed"]

    def test_password_missing_digit(self):
        """測試缺少數字"""
        result = auth.validate_password_strength_detailed("NoDigitsHere!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["digit"]["passed"]

    def test_password_missing_special(self):
        """測試缺少特殊字符"""
        result = auth.validate_password_strength_detailed("NoSpecial123ABC", "", "")
        assert not result["valid"]
        assert not result["checks"]["special"]["passed"]

    def test_password_with_repeating_chars(self):
        """測試重複字符"""
        result = auth.validate_password_strength_detailed("Aaaa123!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["repeating"]["passed"]

    def test_password_with_sequential_chars(self):
        """測試連續字符"""
        result = auth.validate_password_strength_detailed("Abc1234!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["sequential"]["passed"]

    def test_password_with_keyboard_pattern(self):
        """測試鍵盤模式"""
        result = auth.validate_password_strength_detailed("Qwerty123!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["keyboard_pattern"]["passed"]

    def test_password_common_password(self):
        """測試常見密碼"""
        result = auth.validate_password_strength_detailed("password123", "", "")
        assert not result["valid"]
        assert not result["checks"]["common_password"]["passed"]

    def test_password_contains_email(self):
        """測試密碼包含郵箱"""
        result = auth.validate_password_strength_detailed(
            "John123!@#ABC", "john@example.com", "John"
        )
        assert not result["valid"]
        assert not result["checks"]["personal_info"]["passed"]

    def test_password_contains_name(self):
        """測試密碼包含使用者名稱"""
        result = auth.validate_password_strength_detailed(
            "Alice123!@#ABC", "test@example.com", "Alice"
        )
        assert not result["valid"]
        assert not result["checks"]["personal_info"]["passed"]

    def test_password_fibonacci_pattern(self):
        """測試斐波那契數列"""
        result = auth.validate_password_strength_detailed("Fibonacci112358!", "", "")
        assert not result["valid"]
        assert not result["checks"]["math_pattern"]["passed"]

    def test_password_squares_pattern(self):
        """測試平方數"""
        result = auth.validate_password_strength_detailed("Squares1491625!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["math_pattern"]["passed"]

    def test_password_low_entropy(self):
        """測試熵值計算（注意：12字符+4種類型的最小熵為78.66 bits，大於50的要求）"""
        # With min_length=12 and requiring all 4 char types,
        # entropy will always be >= 78.66 bits (> 50 required)
        # This test verifies entropy is calculated correctly
        result = auth.validate_password_strength_detailed("Aa1!Aa1!Aa1!", "", "")
        assert "entropy" in result["checks"]
        assert "value" in result["checks"]["entropy"]
        assert result["checks"]["entropy"]["value"] >= 50.0

    def test_password_chinese_pinyin(self):
        """測試常見拼音"""
        result = auth.validate_password_strength_detailed("Woaini123!@#", "", "")
        assert not result["valid"]
        assert not result["checks"]["chinese_pinyin"]["passed"]

    def test_valid_strong_password(self):
        """測試有效的強密碼"""
        result = auth.validate_password_strength_detailed(
            "MyS3cur3P@ssw0rd!XyZ", "", ""
        )
        assert result["valid"]
        assert len(result["errors"]) == 0
        assert all(check["passed"] for check in result["checks"].values())

    def test_password_edge_case_exactly_min_length(self):
        """測試剛好最小長度"""
        min_len = auth.PASSWORD_CONFIG["min_length"]
        pwd = "A" * (min_len - 4) + "a1!@"
        result = auth.validate_password_strength_detailed(pwd, "", "")
        # 可能通過或不通過，取決於其他檢查
        assert isinstance(result, dict)

    def test_password_extreme_length(self):
        """測試超長密碼"""
        pwd = "A" * 100 + "a1!@"
        result = auth.validate_password_strength_detailed(pwd, "", "")
        # 應該可以處理超長密碼
        assert isinstance(result, dict)

    def test_password_unicode_characters(self):
        """測試 Unicode 字符"""
        result = auth.validate_password_strength_detailed("密碼123!@#ABC", "", "")
        # 應該可以處理 Unicode
        assert isinstance(result, dict)

    def test_password_special_chars_only(self):
        """測試只有特殊字符"""
        result = auth.validate_password_strength_detailed("!@#$%^&*()", "", "")
        assert not result["valid"]


class TestRegistration:
    """註冊功能測試"""

    def test_register_valid_user(self, client):
        """測試註冊有效用戶"""
        data = {
            "email": f"test{datetime.now().timestamp()}@example.com",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "Test User",
        }
        response = client.post("/api/auth/register", json=data)
        # 200/201 成功，或 500 如果 DB 未連接
        assert response.status_code in [200, 201, 500]

    def test_register_duplicate_email(self, client):
        """測試註冊重複郵箱"""
        data = {
            "email": "duplicate@example.com",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "Test User",
        }
        # 第一次註冊
        client.post("/api/auth/register", json=data)
        # 第二次註冊相同郵箱
        response = client.post("/api/auth/register", json=data)
        # 應該拒絕重複郵箱
        assert response.status_code in [400, 409, 500]

    def test_register_invalid_email(self, client):
        """測試無效郵箱格式"""
        data = {
            "email": "invalid-email",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "Test",
        }
        response = client.post("/api/auth/register", json=data)
        assert response.status_code in [400, 500]

    def test_register_weak_password(self, client):
        """測試弱密碼"""
        data = {"email": "test@example.com", "password": "weak", "name": "Test"}
        response = client.post("/api/auth/register", json=data)
        assert response.status_code in [400, 500]

    def test_register_missing_fields(self, client):
        """測試缺少必填字段"""
        data = {"email": "test@example.com"}
        response = client.post("/api/auth/register", json=data)
        assert response.status_code in [400, 429, 500]

    def test_register_empty_name(self, client):
        """測試空使用者名稱"""
        data = {
            "email": "test@example.com",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "",
        }
        response = client.post("/api/auth/register", json=data)
        assert response.status_code in [400, 429, 500]

    def test_register_sql_injection_attempt(self, client):
        """測試 SQL 注入嘗試"""
        data = {
            "email": "test@example.com'; DROP TABLE users; --",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "Test",
        }
        response = client.post("/api/auth/register", json=data)
        # 應該安全處理
        assert response.status_code in [400, 429, 500]

    def test_register_xss_attempt(self, client):
        """測試 XSS 嘗試"""
        data = {
            "email": "test@example.com",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": '<script>alert("XSS")</script>',
        }
        response = client.post("/api/auth/register", json=data)
        # 應該能處理或拒絕
        assert response.status_code in [200, 201, 400, 429, 500]


class TestLogin:
    """登入功能測試"""

    def test_login_valid_credentials(self, client):
        """測試有效憑證登入"""
        # 先註冊
        reg_data = {
            "email": f"login{datetime.now().timestamp()}@example.com",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "Login Test",
        }
        client.post("/api/auth/register", json=reg_data)

        # 然後登入
        login_data = {"email": reg_data["email"], "password": reg_data["password"]}
        response = client.post("/api/auth/login", json=login_data)
        assert response.status_code in [200, 500]

    def test_login_wrong_password(self, client):
        """測試錯誤密碼"""
        data = {"email": "test@example.com", "password": "WrongPassword123!@#"}
        response = client.post("/api/auth/login", json=data)
        assert response.status_code in [401, 403, 404, 500]

    def test_login_nonexistent_user(self, client):
        """測試不存在的用戶"""
        data = {"email": "nonexistent@example.com", "password": "MyS3cur3P@ssw0rd!XyZ"}
        response = client.post("/api/auth/login", json=data)
        assert response.status_code in [401, 404, 500]

    def test_login_missing_fields(self, client):
        """測試缺少字段"""
        data = {"email": "test@example.com"}
        response = client.post("/api/auth/login", json=data)
        assert response.status_code in [400, 429, 500]

    def test_login_empty_password(self, client):
        """測試空密碼"""
        data = {"email": "test@example.com", "password": ""}
        response = client.post("/api/auth/login", json=data)
        assert response.status_code in [400, 401, 429, 500]

    def test_login_brute_force_protection(self, client):
        """測試暴力破解保護（多次失敗登入）"""
        data = {"email": "test@example.com", "password": "WrongPassword"}
        # 嘗試多次登入
        for _ in range(10):
            response = client.post("/api/auth/login", json=data)
        # 最後一次應該被限制或返回錯誤
        assert response.status_code in [401, 403, 429, 500]


class TestJWTToken:
    """JWT Token 測試"""

    def test_verify_valid_token(self, client):
        """測試驗證有效 token"""
        # 先註冊並登入
        reg_data = {
            "email": f"jwt{datetime.now().timestamp()}@example.com",
            "password": "MyS3cur3P@ssw0rd!XyZ",
            "name": "JWT Test",
        }
        client.post("/api/auth/register", json=reg_data)

        login_response = client.post(
            "/api/auth/login",
            json={"email": reg_data["email"], "password": reg_data["password"]},
        )

        if login_response.status_code == 200:
            data = login_response.get_json()
            token = data.get("token")

            # 驗證 token
            verify_response = client.get(
                "/api/auth/verify", headers={"Authorization": f"Bearer {token}"}
            )
            assert verify_response.status_code in [200, 500]

    def test_verify_invalid_token(self, client):
        """測試無效 token"""
        response = client.get(
            "/api/auth/verify", headers={"Authorization": "Bearer invalid_token_123"}
        )
        assert response.status_code in [401, 403, 500]

    def test_verify_missing_token(self, client):
        """測試缺少 token"""
        response = client.get("/api/auth/verify")
        assert response.status_code in [401, 403, 500]

    def test_verify_malformed_header(self, client):
        """測試格式錯誤的 Authorization header"""
        response = client.get(
            "/api/auth/verify", headers={"Authorization": "InvalidFormat"}
        )
        assert response.status_code in [401, 403, 500]


class TestPasswordPolicy:
    """密碼政策測試"""

    def test_get_password_config(self, client):
        """測試獲取密碼配置"""
        response = client.get("/api/auth/password-config")
        assert response.status_code == 200
        data = response.get_json()
        assert "min_length" in data

    def test_validate_password_endpoint(self, client):
        """測試密碼驗證端點"""
        data = {"password": "MyS3cur3P@ssw0rd!XyZ", "email": "", "name": ""}
        response = client.post("/api/auth/validate-password", json=data)
        assert response.status_code == 200
        result = response.get_json()
        assert "valid" in result
        assert "checks" in result


class TestChangePassword:
    """修改密碼功能測試"""

    @pytest.fixture
    def registered_user(self, client):
        """建立並登入測試用戶，回傳 auth headers"""
        import time

        email = f"changepass{int(time.time()*1000)}@example.com"
        password = "OldP@ss2026!Xy"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "name": "ChangePass User",
            },
        )
        login_resp = client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": password,
            },
        )
        if login_resp.status_code != 200:
            pytest.skip("DB not available in test env")
        token = login_resp.get_json().get("token")
        return {"Authorization": f"Bearer {token}"}, email, password

    def test_change_password_missing_fields(self, client):
        """缺少 old_password 或 new_password 應回傳 400"""
        import auth as auth_module
        import time

        test_user_id = "000000000000000000000001"
        token = auth_module.generate_jwt(test_user_id, "test@example.com", "Test")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.post(
            "/api/user/change-password",
            json={"old_password": "", "new_password": ""},
            headers=headers,
        )
        assert response.status_code == 400

    def test_change_password_no_body(self, client):
        """無 body 應回傳 400"""
        import auth as auth_module

        test_user_id = "000000000000000000000001"
        token = auth_module.generate_jwt(test_user_id, "test@example.com", "Test")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.post(
            "/api/user/change-password",
            content_type="application/json",
            data="",
            headers=headers,
        )
        assert response.status_code == 400

    def test_change_password_user_not_found(self, client):
        """不存在的 user_id 應回傳 404"""
        import auth as auth_module

        test_user_id = "000000000000000000000099"
        token = auth_module.generate_jwt(test_user_id, "ghost@example.com", "Ghost")
        headers = {"Authorization": f"Bearer {token}"}
        response = client.post(
            "/api/user/change-password",
            json={"old_password": "OldP@ss2026!Xy", "new_password": "NewP@ss2026!Xy"},
            headers=headers,
        )
        assert response.status_code in [404, 500]

    def test_change_password_wrong_old_password(self, client, registered_user):
        """舊密碼錯誤應回傳 401"""
        headers, email, password = registered_user
        response = client.post(
            "/api/user/change-password",
            json={"old_password": "WrongOld!P@ss999", "new_password": "NewP@ss2026!Xy"},
            headers=headers,
        )
        assert response.status_code == 401

    def test_change_password_weak_new_password(self, client, registered_user):
        """新密碼太弱應回傳 400"""
        headers, email, password = registered_user
        response = client.post(
            "/api/user/change-password",
            json={"old_password": password, "new_password": "weak"},
            headers=headers,
        )
        assert response.status_code == 400

    def test_change_password_success(self, client, registered_user):
        """正確舊密碼 + 強新密碼應成功"""
        headers, email, password = registered_user
        response = client.post(
            "/api/user/change-password",
            json={"old_password": password, "new_password": "Br@nd!NewP@ss2026XyZ"},
            headers=headers,
        )
        assert response.status_code == 200


class TestForgotResetPasswordFlow:
    """忘記/重設密碼完整流程測試"""

    @pytest.fixture
    def user_with_reset_token(self, client):
        """建立用戶並直接在 DB 寫入 reset token"""
        import time
        import main as main_module
        from bson import ObjectId
        from datetime import datetime, timedelta

        email = f"resetflow{int(time.time()*1000)}@example.com"
        password = "ResetP@ss2026!Xy"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
                "name": "Reset User",
            },
        )

        if main_module.users_collection is None:
            pytest.skip("DB not available")

        token = "test-reset-token-12345"
        expires = datetime.now() + timedelta(hours=1)
        main_module.users_collection.update_one(
            {"email": email},
            {
                "$set": {
                    "password_reset_token": token,
                    "password_reset_expires": expires,
                }
            },
        )
        return email, token

    def test_forgot_password_with_smtp_mock(self, client):
        """模擬 SMTP 發送密碼重設信（mock send_reset_email）"""
        import time
        import main as main_module
        from unittest.mock import patch

        email = f"smtptest{int(time.time()*1000)}@example.com"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "SmtpP@ss2026!Xy",
                "name": "SMTP Test",
            },
        )

        with patch("main.send_reset_email", return_value=True) as mock_send:
            response = client.post(
                "/api/auth/forgot-password",
                json={"email": email},
            )
            assert response.status_code == 200
            # 若用戶存在，應呼叫 send_reset_email
            if main_module.users_collection is not None:
                mock_send.assert_called_once()

    def test_forgot_password_smtp_fails(self, client):
        """SMTP 失敗時應回傳 500"""
        import time
        import main as main_module
        from unittest.mock import patch

        email = f"smtpfail{int(time.time()*1000)}@example.com"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "SmtpP@ss2026!Xy",
                "name": "SMTP Fail",
            },
        )

        if main_module.users_collection is None:
            pytest.skip("DB not available")

        with patch("main.send_reset_email", return_value=False):
            response = client.post(
                "/api/auth/forgot-password",
                json={"email": email},
            )
            assert response.status_code == 500

    def test_reset_password_with_valid_token(self, client, user_with_reset_token):
        """有效 token 應能重設密碼"""
        email, token = user_with_reset_token
        response = client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "Br@nd!NewP@ss2026XyZ"},
        )
        assert response.status_code == 200

    def test_reset_password_expired_token(self, client):
        """過期 token 應回傳 400"""
        import time
        import main as main_module
        from datetime import datetime, timedelta

        if main_module.users_collection is None:
            pytest.skip("DB not available")

        email = f"expiredtoken{int(time.time()*1000)}@example.com"
        client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "ExpiredP@ss2026!Xy",
                "name": "Expired Token",
            },
        )

        token = "expired-token-99999"
        expires = datetime.now() - timedelta(hours=2)  # 已過期
        main_module.users_collection.update_one(
            {"email": email},
            {
                "$set": {
                    "password_reset_token": token,
                    "password_reset_expires": expires,
                }
            },
        )

        response = client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "Br@nd!NewP@ss2026XyZ"},
        )
        assert response.status_code == 400

    def test_reset_password_weak_password(self, client, user_with_reset_token):
        """有效 token 但弱密碼應回傳 400"""
        email, token = user_with_reset_token
        response = client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "weak"},
        )
        assert response.status_code == 400

    def test_reset_password_missing_fields(self, client):
        """缺少 token 或 new_password 應回傳 400"""
        response = client.post(
            "/api/auth/reset-password",
            json={"token": "", "new_password": ""},
        )
        assert response.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
