"""
輸入驗證錯誤路徑與 DB 例外處理測試
覆蓋 main.py 中兩類未測試的路徑：
  1. 驗證函式的邊界情況（送入壞資料觸發 400）
  2. DB 操作拋出例外時的 500 錯誤處理
"""

import pytest
import sys
import os
from datetime import datetime
from unittest.mock import patch
from bson import ObjectId

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("ADMIN_SECRET", "test-secret-key-123")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/test_accounting_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-key-for-testing")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import (
    validate_amount,
    validate_date,
    validate_expense_type,
    validate_category,
    validate_description,
)
import main as main_module

TODAY = datetime.now().strftime("%Y-%m-%d")


# ==================== 驗證函式單元測試 ====================


class TestValidateAmount:
    def test_non_numeric_string(self):
        """字串無法轉為 float → 金額格式錯誤 (line 255-256)"""
        ok, msg = validate_amount("abc")
        assert not ok
        assert "格式" in msg

    def test_none_value(self):
        """None 無法轉為 float → 金額格式錯誤 (line 255-256)"""
        ok, msg = validate_amount(None)
        assert not ok


class TestValidateDate:
    def test_none_input(self):
        """None 不是字串 → 日期格式錯誤 (line 262)"""
        ok, msg = validate_date(None)
        assert not ok
        assert "格式" in msg

    def test_integer_input(self):
        """整數不是字串 → 日期格式錯誤 (line 262)"""
        ok, msg = validate_date(20240101)
        assert not ok

    def test_impossible_date(self):
        """格式正確但日期不存在 → 無效的日期 (line 271-272)"""
        ok, msg = validate_date("2024-13-45")
        assert not ok
        assert "無效" in msg


class TestValidateExpenseType:
    def test_invalid_type(self):
        """非法支出類型 (line 277-280)"""
        ok, msg = validate_expense_type("weekly")
        assert not ok
        assert "fixed" in msg

    def test_none_is_valid(self):
        """None 表示無支出類型，合法"""
        ok, _ = validate_expense_type(None)
        assert ok

    def test_valid_types(self):
        for t in ["fixed", "variable", "onetime"]:
            ok, _ = validate_expense_type(t)
            assert ok


class TestValidateCategory:
    def test_whitespace_only(self):
        """純空白 strip 後為空 → 分類不可為空 (line 300-301)"""
        ok, msg = validate_category("   ")
        assert not ok
        assert "空" in msg

    def test_empty_string(self):
        """空字串 → 分類不可為空"""
        ok, msg = validate_category("")
        assert not ok

    def test_too_long(self):
        """51 字元 → 超過長度限制 (line 304-305)"""
        ok, msg = validate_category("a" * 51)
        assert not ok
        assert "50" in msg


class TestValidateDescription:
    def test_non_string_integer(self):
        """整數不是字串 → 描述格式錯誤 (line 316)"""
        ok, msg = validate_description(12345)
        assert not ok
        assert "格式" in msg

    def test_non_string_list(self):
        """list 不是字串 → 描述格式錯誤 (line 316)"""
        ok, msg = validate_description(["bad"])
        assert not ok


# ==================== 健康檢查端點 ====================


class TestHealthCheck:
    def test_health_endpoint(self, client):
        """GET /health → 200 (line 338)"""
        r = client.get("/health")
        assert r.status_code == 200
        assert r.get_json()["status"] == "healthy"


# ==================== 記錄端點輸入驗證路徑 ====================


class TestCreateRecordValidation:
    def test_invalid_expense_type(self, client, auth_headers):
        """送入非法 expense_type → 400 (line 441-443)"""
        if not auth_headers:
            pytest.skip("需要認證")
        r = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 100,
                "category": "測試",
                "date": TODAY,
                "expense_type": "weekly",
            },
            headers=auth_headers,
        )
        assert r.status_code == 400


class TestUpdateRecordValidation:
    """更新記錄時各欄位的驗證錯誤路徑"""

    @pytest.fixture
    def record_id(self, client, auth_headers):
        """建立一筆測試記錄，回傳其 ID"""
        if not auth_headers:
            return None
        r = client.post(
            "/admin/api/accounting/records",
            json={"type": "expense", "amount": 100, "category": "測試", "date": TODAY},
            headers=auth_headers,
        )
        if r.status_code in (200, 201):
            return r.get_json().get("id")
        return None

    def test_invalid_type(self, client, auth_headers, record_id):
        """更新時送入非法 type → 400 (line 501-504)"""
        if not record_id:
            pytest.skip("無法建立測試記錄")
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"type": "invalid"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_amount(self, client, auth_headers, record_id):
        """更新時送入非數字 amount → 400 (line 510)"""
        if not record_id:
            pytest.skip("無法建立測試記錄")
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"amount": "abc"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_category(self, client, auth_headers, record_id):
        """更新時送入空 category → 400 (line 515-518)"""
        if not record_id:
            pytest.skip("無法建立測試記錄")
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"category": ""},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_date(self, client, auth_headers, record_id):
        """更新時送入錯誤格式日期 → 400 (line 522-525)"""
        if not record_id:
            pytest.skip("無法建立測試記錄")
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"date": "2024/01/01"},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_description(self, client, auth_headers, record_id):
        """更新時送入非字串 description → 400 (line 529-532)"""
        if not record_id:
            pytest.skip("無法建立測試記錄")
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"description": 99999},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_invalid_expense_type(self, client, auth_headers, record_id):
        """更新時送入非法 expense_type → 400 (line 536-540)"""
        if not record_id:
            pytest.skip("無法建立測試記錄")
        r = client.put(
            f"/admin/api/accounting/records/{record_id}",
            json={"expense_type": "weekly"},
            headers=auth_headers,
        )
        assert r.status_code == 400


# ==================== DB 例外 → 500 錯誤處理 ====================


class TestDBExceptions:
    """mock DB 操作拋出例外，確認各端點的 except 區塊回傳 500"""

    def test_get_records_db_error(self, client, auth_headers):
        """GET records → DB 例外 → 500 (line 387-389)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "accounting_records_collection") as m:
            m.find.side_effect = Exception("DB error")
            r = client.get("/admin/api/accounting/records", headers=auth_headers)
        assert r.status_code == 500

    def test_create_record_db_error(self, client, auth_headers):
        """POST records → insert_one 例外 → 500 (line 464-466)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "accounting_records_collection") as m:
            m.insert_one.side_effect = Exception("DB error")
            r = client.post(
                "/admin/api/accounting/records",
                json={"type": "expense", "amount": 100, "category": "測試", "date": TODAY},
                headers=auth_headers,
            )
        assert r.status_code == 500

    def test_update_record_db_error(self, client, auth_headers):
        """PUT records → update_one 例外 → 500 (line 551-553)"""
        if not auth_headers:
            pytest.skip("需要認證")
        valid_id = str(ObjectId())
        with patch.object(main_module, "accounting_records_collection") as m:
            m.find_one.return_value = {"_id": ObjectId(valid_id), "user_id": ObjectId()}
            m.update_one.side_effect = Exception("DB error")
            r = client.put(
                f"/admin/api/accounting/records/{valid_id}",
                json={"amount": 200},
                headers=auth_headers,
            )
        assert r.status_code == 500

    def test_delete_record_db_error(self, client, auth_headers):
        """DELETE records → delete_one 例外 → 500 (line 582-584)"""
        if not auth_headers:
            pytest.skip("需要認證")
        valid_id = str(ObjectId())
        with patch.object(main_module, "accounting_records_collection") as m:
            m.find_one.return_value = {"_id": ObjectId(valid_id)}
            m.delete_one.side_effect = Exception("DB error")
            r = client.delete(
                f"/admin/api/accounting/records/{valid_id}", headers=auth_headers
            )
        assert r.status_code == 500

    def test_get_stats_db_error(self, client, auth_headers):
        """GET stats → aggregate 例外 → 500 (line 648-650)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "accounting_records_collection") as m:
            m.aggregate.side_effect = Exception("DB error")
            r = client.get("/admin/api/accounting/stats", headers=auth_headers)
        assert r.status_code == 500

    def test_get_budget_db_error(self, client, auth_headers):
        """GET budget → find_one 例外 → 500 (line 679-681)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "accounting_budget_collection") as m:
            m.find_one.side_effect = Exception("DB error")
            r = client.get("/admin/api/accounting/budget", headers=auth_headers)
        assert r.status_code == 500

    def test_save_budget_db_error(self, client, auth_headers):
        """POST budget → update_one 例外 → 500 (line 715-717)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "accounting_budget_collection") as m:
            m.update_one.side_effect = Exception("DB error")
            r = client.post(
                "/admin/api/accounting/budget",
                json={"month": "2024-01", "budget": {"飲食": 3000}},
                headers=auth_headers,
            )
        assert r.status_code == 500

    def test_get_profile_db_error(self, client, auth_headers):
        """GET profile → find_one 例外 → 500 (line 1018-1020)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "users_collection") as m:
            m.find_one.side_effect = Exception("DB error")
            r = client.get("/api/user/profile", headers=auth_headers)
        assert r.status_code == 500

    def test_update_profile_db_error(self, client, auth_headers):
        """PUT profile → update_one 例外 → 500 (line 1079-1081)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "users_collection") as m:
            m.find_one.return_value = {"_id": ObjectId(), "name": "Test"}
            m.update_one.side_effect = Exception("DB error")
            r = client.put(
                "/api/user/profile", json={"name": "New Name"}, headers=auth_headers
            )
        assert r.status_code == 500

    def test_login_db_error(self, client):
        """POST login → find_one 例外 → 500 (line 932-934)"""
        with patch.object(main_module, "users_collection") as m:
            m.find_one.side_effect = Exception("DB error")
            r = client.post(
                "/api/auth/login",
                json={"email": "test@example.com", "password": "anypassword"},
            )
        assert r.status_code == 500

    def test_verify_token_db_error(self, client, auth_headers):
        """GET verify → find_one 例外 → 500 (line 966-968)"""
        if not auth_headers:
            pytest.skip("需要認證")
        with patch.object(main_module, "users_collection") as m:
            m.find_one.side_effect = Exception("DB error")
            r = client.get("/api/auth/verify", headers=auth_headers)
        assert r.status_code == 500


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
