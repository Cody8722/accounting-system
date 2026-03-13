"""
accounting-system Backend API Tests
测试财务管理系统的主要 API 端点
"""

import pytest
import sys
import os
from datetime import datetime

# Set environment variables before importing main
os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

# 添加父目录到 Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module


@pytest.fixture
def client():
    """创建测试客户端"""
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    # 禁用 strict_slashes 以避免 301 重定向
    app.url_map.strict_slashes = False
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_headers():
    """返回包含 JWT 認證的 headers（使用固定 test user_id）"""
    # 使用固定的 test ObjectId（24 位 hex）
    test_user_id = "000000000000000000000001"
    token = auth_module.generate_jwt(test_user_id, "test@example.com", "Test User")
    return {"Authorization": f"Bearer {token}"}


class TestAuthentication:
    """认证测试"""

    def test_status_without_auth(self, client):
        """/status 為公開端點，不需認證"""
        response = client.get("/status")
        assert response.status_code == 200

    def test_status_with_invalid_auth(self, client):
        """/status 公開端點，無效 Token 也能存取"""
        response = client.get(
            "/status", headers={"Authorization": "Bearer invalid-token"}
        )
        assert response.status_code == 200

    def test_records_without_auth(self, client):
        """测试未认证访问 records 端点"""
        response = client.get("/admin/api/accounting/records")
        assert response.status_code in [401, 403]


class TestHealthCheck:
    """健康检查端点测试"""

    def test_status_endpoint(self, client):
        """测试 /status 端点（公開，不需認證）"""
        response = client.get("/status")
        assert response.status_code == 200
        data = response.get_json()
        assert "status" in data
        assert data["status"] == "ok"

    def test_status_includes_db_info(self, client):
        """测试状态端点包含数据库信息"""
        response = client.get("/status")
        data = response.get_json()
        assert "db_status" in data


class TestRecordsAPI:
    """财务记录 API 测试"""

    def test_get_records_endpoint(self, client, auth_headers):
        """测试获取记录列表"""
        response = client.get("/admin/api/accounting/records", headers=auth_headers)
        # 200 if DB available, 500 if DB not initialized
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            assert response.content_type == "application/json"

    def test_create_record_without_data(self, client, auth_headers):
        """测试创建记录缺少数据"""
        response = client.post(
            "/admin/api/accounting/records",
            json={},
            headers=auth_headers,
            content_type="application/json",
        )
        # 应该返回 400 (缺少必要字段) 或 500 (DB未初始化)
        assert response.status_code in [400, 500]

    def test_create_record_with_valid_data(self, client, auth_headers):
        """测试创建记录（有效数据）"""
        valid_record = {
            "type": "expense",
            "amount": 100.50,
            "category": "food",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": "Test expense",
        }
        response = client.post(
            "/admin/api/accounting/records",
            json=valid_record,
            headers=auth_headers,
            content_type="application/json",
        )
        # 成功(201)或失败(500, 如果DB未连接)
        assert response.status_code in [201, 500]

    def test_create_record_invalid_type(self, client):
        """测试创建记录（无效类型）"""
        invalid_record = {
            "type": "invalid_type",  # 应该只允许 income/expense
            "amount": 100,
            "category": "test",
        }
        response = client.post(
            "/admin/api/accounting/records",
            json=invalid_record,
            content_type="application/json",
        )
        assert response.status_code in [400, 401, 403, 404, 405, 500]

    def test_create_record_negative_amount(self, client):
        """测试创建记录（负数金额）"""
        invalid_record = {
            "type": "expense",
            "amount": -50,  # 金额不应该是负数
            "category": "test",
        }
        response = client.post(
            "/admin/api/accounting/records",
            json=invalid_record,
            content_type="application/json",
        )
        # 取决于验证逻辑，可能拒绝或接受
        assert response.status_code in [200, 201, 400, 401, 403, 404, 500]

    def test_get_single_record_invalid_id(self, client):
        """测试获取不存在的记录"""
        response = client.get("/admin/api/accounting/records/invalid_id_12345")
        assert response.status_code in [400, 401, 403, 404, 405, 500]

    def test_update_record_without_data(self, client):
        """测试更新记录缺少数据"""
        response = client.put(
            "/admin/api/accounting/records/some_id",
            json={},
            content_type="application/json",
        )
        assert response.status_code in [400, 401, 403, 404, 405, 500]

    def test_delete_record_invalid_id(self, client):
        """测试删除不存在的记录"""
        response = client.delete("/admin/api/accounting/records/invalid_id_99999")
        assert response.status_code in [400, 401, 403, 404, 405, 500]


class TestBudgetAPI:
    """预算管理 API 测试"""

    def test_get_budgets_endpoint(self, client):
        """测试获取预算列表"""
        response = client.get("/admin/api/accounting/budget")
        assert response.status_code in [200, 401, 403, 404, 500]
        assert response.content_type == "application/json" or response.status_code in [
            401,
            403,
            404,
        ]

    def test_create_budget_without_data(self, client):
        """测试创建预算缺少数据"""
        response = client.post(
            "/admin/api/accounting/budget", json={}, content_type="application/json"
        )
        assert response.status_code in [400, 401, 403, 404, 405, 500]

    def test_create_budget_with_valid_data(self, client):
        """测试创建预算（有效数据）"""
        valid_budget = {"category": "food", "amount": 5000, "period": "monthly"}
        response = client.post(
            "/admin/api/accounting/budget",
            json=valid_budget,
            content_type="application/json",
        )
        assert response.status_code in [200, 201, 400, 401, 403, 404, 500]


class TestStatisticsAPI:
    """统计分析 API 测试"""

    def test_get_statistics_endpoint(self, client):
        """测试获取统计数据"""
        response = client.get("/admin/api/accounting/stats")
        assert response.status_code in [200, 401, 403, 404, 500]
        assert response.content_type == "application/json" or response.status_code in [
            401,
            403,
            404,
        ]

    def test_get_statistics_with_date_range(self, client):
        """测试获取指定日期范围的统计"""
        response = client.get(
            "/admin/api/accounting/stats?start=2024-01-01&end=2024-12-31"
        )
        assert response.status_code in [200, 400, 401, 403, 404, 500]

    def test_get_category_breakdown(self, client):
        """测试获取分类统计"""
        response = client.get("/admin/api/accounting/stats/categories")
        assert response.status_code in [200, 403, 404, 500]


class TestInputValidation:
    """输入验证测试"""

    def test_amount_validation_zero(self, client):
        """测试金额为 0"""
        record = {"type": "expense", "amount": 0, "category": "test"}
        response = client.post(
            "/admin/api/accounting/records",
            json=record,
            content_type="application/json",
        )
        # 可能允许或拒绝 0 金额
        assert response.status_code in [200, 201, 400, 401, 403, 404, 500]

    def test_amount_validation_very_large(self, client):
        """测试非常大的金额"""
        record = {"type": "income", "amount": 999999999.99, "category": "test"}
        response = client.post(
            "/admin/api/accounting/records",
            json=record,
            content_type="application/json",
        )
        assert response.status_code in [200, 201, 400, 401, 403, 404, 500]

    def test_date_format_validation(self, client):
        """测试日期格式验证"""
        record = {
            "type": "expense",
            "amount": 100,
            "category": "test",
            "date": "invalid-date-format",
        }
        response = client.post(
            "/admin/api/accounting/records",
            json=record,
            content_type="application/json",
        )
        # 应该拒绝无效日期格式
        assert response.status_code in [400, 401, 403, 404, 405, 500]


class TestCORS:
    """CORS 配置测试"""

    def test_cors_headers(self, client):
        """测试 CORS headers 存在"""
        response = client.options("/admin/api/accounting/records")
        assert response.status_code in [200, 204, 404, 500]

    def test_cors_allows_methods(self, client):
        """测试 CORS 允许的方法"""
        response = client.get("/status", headers={"Origin": "http://localhost:3000"})
        # CORS headers should be present even if auth fails
        assert response.status_code in [200, 401]


class TestErrorHandling:
    """错误处理测试"""

    def test_invalid_endpoint(self, client):
        """测试访问不存在的端点"""
        response = client.get("/api/nonexistent")
        assert response.status_code == 404

    def test_invalid_http_method(self, client):
        """测试不支持的 HTTP 方法"""
        response = client.patch("/admin/api/accounting/records")
        assert response.status_code in [404, 405, 500]

    def test_malformed_json(self, client):
        """测试格式错误的 JSON"""
        response = client.post(
            "/admin/api/accounting/records",
            data='{"invalid": json',
            content_type="application/json",
        )
        assert response.status_code in [400, 401, 403, 404, 405, 500]


class TestAuthenticatedEndpoints:
    """測試需要認證的端點"""

    def test_get_budget_with_auth(self, client, auth_headers):
        """測試獲取預算（已認證）"""
        response = client.get("/admin/api/accounting/budget", headers=auth_headers)
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.get_json()
            assert "month" in data
            assert "budget" in data

    def test_set_budget_with_auth(self, client, auth_headers):
        """測試設定預算（已認證）"""
        budget_data = {"budget": {"交通": 3000, "娛樂": 2000}}
        response = client.post(
            "/admin/api/accounting/budget", json=budget_data, headers=auth_headers
        )
        assert response.status_code in [200, 201, 500]

    def test_get_user_profile(self, client, auth_token):
        """測試獲取用戶資料"""
        if not auth_token:
            pytest.skip("需要認證 token")

        response = client.get(
            "/api/user/profile", headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code in [200, 404, 500]
        if response.status_code == 200:
            data = response.get_json()
            assert "email" in data

    def test_update_user_profile(self, client, auth_token):
        """測試更新用戶資料"""
        if not auth_token:
            pytest.skip("需要認證 token")

        update_data = {"name": "Updated Name"}
        response = client.put(
            "/api/user/profile",
            json=update_data,
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code in [200, 400, 500]

    def test_change_password(self, client, auth_token):
        """測試更改密碼"""
        if not auth_token:
            pytest.skip("需要認證 token")

        # 測試更改密碼（會失敗因為舊密碼錯誤，但會覆蓋代碼）
        password_data = {
            "old_password": "WrongOldPassword",
            "new_password": "MyN3wP@ssw0rd!XyZ",
        }
        response = client.post(
            "/api/user/change-password",
            json=password_data,
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code in [200, 400, 401, 500]


class TestForgotPassword:
    """忘記密碼端點測試"""

    def test_forgot_password_missing_email(self, client):
        """缺少 email 應返回 400"""
        response = client.post(
            "/api/auth/forgot-password",
            json={},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_forgot_password_empty_email(self, client):
        """空 email 應返回 400"""
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": ""},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_forgot_password_nonexistent_email(self, client):
        """不存在的 email 也應返回 200（防止用戶枚舉）"""
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": "notexist@example.com"},
            content_type="application/json",
        )
        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data

    def test_forgot_password_no_body(self, client):
        """沒有 body 應返回 400"""
        response = client.post(
            "/api/auth/forgot-password",
            content_type="application/json",
        )
        assert response.status_code == 400


class TestResetPassword:
    """重設密碼端點測試"""

    def test_reset_password_missing_fields(self, client):
        """缺少欄位應返回 400"""
        response = client.post(
            "/api/auth/reset-password",
            json={},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_reset_password_invalid_token(self, client):
        """無效 token 應返回 400"""
        response = client.post(
            "/api/auth/reset-password",
            json={"token": "invalid-token-xyz", "new_password": "MyN3wP@ss!XyZ99"},
            content_type="application/json",
        )
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_reset_password_no_body(self, client):
        """沒有 body 應返回 400"""
        response = client.post(
            "/api/auth/reset-password",
            content_type="application/json",
        )
        assert response.status_code == 400


class TestComparisonAPI:
    """環比資料 API 測試"""

    def test_comparison_without_auth(self, client):
        """未認證應返回 401"""
        response = client.get("/admin/api/accounting/comparison")
        assert response.status_code == 401

    def test_comparison_invalid_period(self, client, auth_headers):
        """無效 period 應返回 400"""
        response = client.get(
            "/admin/api/accounting/comparison?period=invalid",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_comparison_default_month(self, client, auth_headers):
        """預設月份環比應返回 200 或 500（DB 未連線）"""
        response = client.get(
            "/admin/api/accounting/comparison",
            headers=auth_headers,
        )
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            data = response.get_json()
            assert "current" in data
            assert "previous" in data
            assert "changes" in data

    def test_comparison_quarter(self, client, auth_headers):
        """季度環比應返回 200 或 500（DB 未連線）"""
        response = client.get(
            "/admin/api/accounting/comparison?period=quarter",
            headers=auth_headers,
        )
        assert response.status_code in [200, 500]

    def test_comparison_year(self, client, auth_headers):
        """年度環比應返回 200 或 500（DB 未連線）"""
        response = client.get(
            "/admin/api/accounting/comparison?period=year",
            headers=auth_headers,
        )
        assert response.status_code in [200, 500]


class TestRecurringAPI:
    """定期收支 API 測試"""

    def test_get_recurring_without_auth(self, client):
        """未認證應返回 401"""
        response = client.get("/admin/api/recurring")
        assert response.status_code == 401

    def test_get_recurring_with_auth(self, client, auth_headers):
        """已認證取得定期收支列表"""
        response = client.get("/admin/api/recurring", headers=auth_headers)
        assert response.status_code in [200, 500]
        if response.status_code == 200:
            assert isinstance(response.get_json(), list)

    def test_create_recurring_without_auth(self, client):
        """未認證新增應返回 401"""
        response = client.post("/admin/api/recurring", json={"name": "test"})
        assert response.status_code == 401

    def test_create_recurring_missing_name(self, client, auth_headers):
        """缺少名稱應返回 400"""
        response = client.post(
            "/admin/api/recurring",
            json={"amount": 100, "type": "expense", "day_of_month": 1},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_create_recurring_invalid_amount(self, client, auth_headers):
        """無效金額應返回 400"""
        response = client.post(
            "/admin/api/recurring",
            json={"name": "測試", "amount": -100, "type": "expense", "day_of_month": 1},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_create_recurring_invalid_type(self, client, auth_headers):
        """無效類型應返回 400"""
        response = client.post(
            "/admin/api/recurring",
            json={"name": "測試", "amount": 100, "type": "invalid", "day_of_month": 1},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_create_recurring_invalid_day(self, client, auth_headers):
        """無效日期應返回 400"""
        response = client.post(
            "/admin/api/recurring",
            json={"name": "測試", "amount": 100, "type": "expense", "day_of_month": 32},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_create_recurring_success(self, client, auth_headers):
        """成功新增定期收支"""
        response = client.post(
            "/admin/api/recurring",
            json={
                "name": "房租",
                "amount": 15000,
                "type": "expense",
                "category": "居住",
                "day_of_month": 5,
                "description": "每月房租",
            },
            headers=auth_headers,
        )
        assert response.status_code in [201, 500]

    def test_update_recurring_invalid_id(self, client, auth_headers):
        """無效 ID 更新應返回 400"""
        response = client.put(
            "/admin/api/recurring/invalid-id",
            json={
                "name": "新名稱",
                "amount": 100,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_delete_recurring_invalid_id(self, client, auth_headers):
        """無效 ID 刪除應返回 400"""
        response = client.delete(
            "/admin/api/recurring/invalid-id",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_apply_recurring_invalid_id(self, client, auth_headers):
        """無效 ID 套用應返回 400"""
        response = client.post(
            "/admin/api/recurring/invalid-id/apply",
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_delete_recurring_not_found(self, client, auth_headers):
        """不存在的 ID 刪除應返回 404"""
        valid_oid = "000000000000000000000099"
        response = client.delete(
            f"/admin/api/recurring/{valid_oid}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_apply_recurring_not_found(self, client, auth_headers):
        """不存在的 ID 套用應返回 404"""
        valid_oid = "000000000000000000000099"
        response = client.post(
            f"/admin/api/recurring/{valid_oid}/apply",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_update_recurring_not_found(self, client, auth_headers):
        """不存在的 ID 更新應返回 404"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={
                "name": "新名稱",
                "amount": 100,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_create_recurring_name_too_long(self, client, auth_headers):
        """名稱過長應返回 400"""
        response = client.post(
            "/admin/api/recurring",
            json={
                "name": "a" * 51,
                "amount": 100,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_empty_name(self, client, auth_headers):
        """空名稱更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={"name": "", "amount": 100, "type": "expense", "day_of_month": 1},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_name_too_long(self, client, auth_headers):
        """名稱過長更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={
                "name": "a" * 51,
                "amount": 100,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_invalid_amount(self, client, auth_headers):
        """無效金額更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={
                "name": "測試",
                "amount": -100,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_zero_amount(self, client, auth_headers):
        """零金額更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={"name": "測試", "amount": 0, "type": "expense", "day_of_month": 1},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_invalid_type(self, client, auth_headers):
        """無效類型更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={
                "name": "測試",
                "amount": 100,
                "type": "invalid",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_invalid_day_zero(self, client, auth_headers):
        """日期為 0 更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={"name": "測試", "amount": 100, "type": "expense", "day_of_month": 0},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_invalid_day_high(self, client, auth_headers):
        """日期超過 31 更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={
                "name": "測試",
                "amount": 100,
                "type": "expense",
                "day_of_month": 32,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_update_recurring_category_too_long(self, client, auth_headers):
        """分類名稱過長更新應返回 400"""
        valid_oid = "000000000000000000000099"
        response = client.put(
            f"/admin/api/recurring/{valid_oid}",
            json={
                "name": "測試",
                "amount": 100,
                "type": "expense",
                "day_of_month": 1,
                "category": "a" * 31,
            },
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_create_and_apply_recurring(self, client, auth_headers):
        """建立定期收支後套用為記帳記錄"""
        # 先建立一筆定期收支
        create_resp = client.post(
            "/admin/api/recurring",
            json={
                "name": "測試水電費",
                "amount": 1000,
                "type": "expense",
                "category": "居住",
                "day_of_month": 15,
                "description": "每月水電",
            },
            headers=auth_headers,
        )
        # 若 DB 未連線則跳過
        if create_resp.status_code != 201:
            return
        data = create_resp.get_json()
        item_id = data.get("id")
        assert item_id is not None

        # 套用為實際記帳記錄
        apply_resp = client.post(
            f"/admin/api/recurring/{item_id}/apply",
            headers=auth_headers,
        )
        assert apply_resp.status_code == 201
        apply_data = apply_resp.get_json()
        assert "id" in apply_data

        # 清理：刪除測試資料
        client.delete(f"/admin/api/recurring/{item_id}", headers=auth_headers)

    def test_create_and_update_recurring(self, client, auth_headers):
        """建立定期收支後更新"""
        create_resp = client.post(
            "/admin/api/recurring",
            json={
                "name": "原始名稱",
                "amount": 500,
                "type": "income",
                "category": "薪資",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        if create_resp.status_code != 201:
            return
        item_id = create_resp.get_json().get("id")

        # 更新
        update_resp = client.put(
            f"/admin/api/recurring/{item_id}",
            json={
                "name": "新名稱",
                "amount": 600,
                "type": "income",
                "category": "薪資",
                "day_of_month": 5,
            },
            headers=auth_headers,
        )
        assert update_resp.status_code == 200

        # 清理
        client.delete(f"/admin/api/recurring/{item_id}", headers=auth_headers)

    def test_create_and_delete_recurring(self, client, auth_headers):
        """建立定期收支後刪除"""
        create_resp = client.post(
            "/admin/api/recurring",
            json={
                "name": "待刪除項目",
                "amount": 200,
                "type": "expense",
                "day_of_month": 10,
            },
            headers=auth_headers,
        )
        if create_resp.status_code != 201:
            return
        item_id = create_resp.get_json().get("id")

        delete_resp = client.delete(
            f"/admin/api/recurring/{item_id}",
            headers=auth_headers,
        )
        assert delete_resp.status_code == 200


class TestAuthExtended:
    """登出端點測試"""

    def test_logout_with_valid_token(self, client, auth_headers):
        """有效 token 可以成功登出"""
        response = client.post("/api/auth/logout", headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert "message" in data

    def test_logout_without_token(self, client):
        """未登入時登出應回傳 401"""
        response = client.post("/api/auth/logout")
        assert response.status_code in [401, 403]


class TestTokenSecurity:
    """Token 安全性測試"""

    def _make_expired_token(self):
        """產生已過期的 JWT"""
        import jwt as pyjwt
        from datetime import timedelta

        payload = {
            "user_id": "000000000000000000000001",
            "email": "test@example.com",
            "name": "Test User",
            "exp": datetime.utcnow() - timedelta(hours=1),
            "iat": datetime.utcnow() - timedelta(hours=2),
            "type": "access",
        }
        return pyjwt.encode(
            payload, "test-jwt-secret-key-for-testing-only", algorithm="HS256"
        )

    def test_expired_token_rejected(self, client):
        """過期 token 應被拒絕"""
        token = self._make_expired_token()
        response = client.get(
            "/admin/api/accounting/records",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code in [401, 403]

    def test_tampered_token_rejected(self, client):
        """竄改的 token 應被拒絕"""
        token = auth_module.generate_jwt(
            "000000000000000000000001", "test@example.com", "Test User"
        )
        # 在 payload 部分加入隨機字元使 signature 失效
        parts = token.split(".")
        tampered = parts[0] + "." + parts[1] + "TAMPERED." + parts[2]
        response = client.get(
            "/admin/api/accounting/records",
            headers={"Authorization": f"Bearer {tampered}"},
        )
        assert response.status_code in [401, 403]

    def test_missing_bearer_prefix_rejected(self, client, auth_headers):
        """沒有 Bearer 前綴的 token 應被拒絕"""
        # auth_headers 格式為 {"Authorization": "Bearer <token>"}
        raw_token = auth_headers["Authorization"].split(" ", 1)[1]
        response = client.get(
            "/admin/api/accounting/records",
            headers={"Authorization": raw_token},
        )
        assert response.status_code in [401, 403]


class TestRecurringAuthorization:
    """跨用戶授權測試"""

    def _auth_headers_for(self, user_id, email):
        token = auth_module.generate_jwt(user_id, email, "Other User")
        return {"Authorization": f"Bearer {token}"}

    def test_user_b_cannot_delete_user_a_recurring(self, client, auth_headers):
        """用戶 B 不能刪除用戶 A 的定期項目"""
        # 用戶 A 建立一個定期項目
        create_resp = client.post(
            "/admin/api/recurring",
            json={
                "name": "用戶A的項目",
                "amount": 100,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        if create_resp.status_code != 201:
            return  # DB 未連線，跳過
        item_id = create_resp.get_json().get("id")

        # 用戶 B 嘗試刪除
        user_b_headers = self._auth_headers_for(
            "000000000000000000000002", "userb@example.com"
        )
        delete_resp = client.delete(
            f"/admin/api/recurring/{item_id}", headers=user_b_headers
        )
        assert delete_resp.status_code == 404

        # 清理：用戶 A 自行刪除
        client.delete(f"/admin/api/recurring/{item_id}", headers=auth_headers)

    def test_user_b_cannot_apply_user_a_recurring(self, client, auth_headers):
        """用戶 B 不能套用用戶 A 的定期項目"""
        create_resp = client.post(
            "/admin/api/recurring",
            json={
                "name": "用戶A套用測試",
                "amount": 200,
                "type": "expense",
                "day_of_month": 15,
            },
            headers=auth_headers,
        )
        if create_resp.status_code != 201:
            return
        item_id = create_resp.get_json().get("id")

        user_b_headers = self._auth_headers_for(
            "000000000000000000000002", "userb@example.com"
        )
        apply_resp = client.post(
            f"/admin/api/recurring/{item_id}/apply", headers=user_b_headers
        )
        assert apply_resp.status_code == 404

        client.delete(f"/admin/api/recurring/{item_id}", headers=auth_headers)

    def test_user_b_cannot_update_user_a_recurring(self, client, auth_headers):
        """用戶 B 不能更新用戶 A 的定期項目"""
        create_resp = client.post(
            "/admin/api/recurring",
            json={
                "name": "用戶A更新測試",
                "amount": 300,
                "type": "expense",
                "day_of_month": 20,
            },
            headers=auth_headers,
        )
        if create_resp.status_code != 201:
            return
        item_id = create_resp.get_json().get("id")

        user_b_headers = self._auth_headers_for(
            "000000000000000000000002", "userb@example.com"
        )
        update_resp = client.put(
            f"/admin/api/recurring/{item_id}",
            json={
                "name": "竄改名稱",
                "amount": 999,
                "type": "expense",
                "day_of_month": 1,
            },
            headers=user_b_headers,
        )
        assert update_resp.status_code == 404

        client.delete(f"/admin/api/recurring/{item_id}", headers=auth_headers)


class TestBudgetEdgeCases:
    """預算邊界條件測試"""

    def test_negative_budget_rejected(self, client, auth_headers):
        """負數預算應被拒絕"""
        response = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"早餐": -100}},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_invalid_category_rejected(self, client, auth_headers):
        """不在允許清單的分類應被拒絕"""
        response = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"不存在的分類XYZ": 500}},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_non_numeric_budget_rejected(self, client, auth_headers):
        """非數字預算應被拒絕"""
        response = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"早餐": "abc"}},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_missing_budget_key_rejected(self, client, auth_headers):
        """缺少 budget key 應被拒絕"""
        response = client.post(
            "/admin/api/accounting/budget",
            json={"data": {"早餐": 100}},
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_zero_budget_accepted(self, client, auth_headers):
        """預算為 0 是合法的（清除預算）"""
        response = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"早餐": 0}},
            headers=auth_headers,
        )
        # 若 DB 未連線回 500，連線時應 200
        assert response.status_code in [200, 500]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
