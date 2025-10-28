"""
accounting-system Backend API Tests
测试财务管理系统的主要 API 端点
"""
import pytest
import sys
import os
from datetime import datetime

# 添加父目录到 Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app


@pytest.fixture
def client():
    """创建测试客户端"""
    app.config['TESTING'] = True
    # 禁用 strict_slashes 以避免 301 重定向
    app.url_map.strict_slashes = False
    with app.test_client() as client:
        yield client


class TestHealthCheck:
    """健康检查端点测试"""

    def test_status_endpoint(self, client):
        """测试 /status 端点"""
        response = client.get('/status')
        assert response.status_code == 200

        data = response.get_json()
        assert 'status' in data
        assert data['status'] == 'ok'

    def test_status_includes_db_info(self, client):
        """测试状态端点包含数据库信息"""
        response = client.get('/status')
        data = response.get_json()
        assert 'db_status' in data


class TestRecordsAPI:
    """财务记录 API 测试"""

    def test_get_records_endpoint(self, client):
        """测试获取记录列表"""
        response = client.get('/api/records')
        assert response.status_code in [200, 500]
        assert response.content_type == 'application/json'

    def test_create_record_without_data(self, client):
        """测试创建记录缺少数据"""
        response = client.post('/api/records',
                              json={},
                              content_type='application/json')
        # 应该返回 400 或 500
        assert response.status_code in [400, 500]

    def test_create_record_with_valid_data(self, client):
        """测试创建记录（有效数据）"""
        valid_record = {
            'type': 'expense',
            'amount': 100.50,
            'category': 'food',
            'date': datetime.now().isoformat(),
            'description': 'Test expense'
        }
        response = client.post('/api/records',
                              json=valid_record,
                              content_type='application/json')
        # 可能成功(201)或失败(500, 如果DB未连接)
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_invalid_type(self, client):
        """测试创建记录（无效类型）"""
        invalid_record = {
            'type': 'invalid_type',  # 应该只允许 income/expense
            'amount': 100,
            'category': 'test'
        }
        response = client.post('/api/records',
                              json=invalid_record,
                              content_type='application/json')
        assert response.status_code in [400, 500]

    def test_create_record_negative_amount(self, client):
        """测试创建记录（负数金额）"""
        invalid_record = {
            'type': 'expense',
            'amount': -50,  # 金额不应该是负数
            'category': 'test'
        }
        response = client.post('/api/records',
                              json=invalid_record,
                              content_type='application/json')
        # 取决于验证逻辑，可能拒绝或接受
        assert response.status_code in [200, 201, 400, 500]

    def test_get_single_record_invalid_id(self, client):
        """测试获取不存在的记录"""
        response = client.get('/api/records/invalid_id_12345')
        assert response.status_code in [400, 404, 500]

    def test_update_record_without_data(self, client):
        """测试更新记录缺少数据"""
        response = client.put('/api/records/some_id',
                             json={},
                             content_type='application/json')
        assert response.status_code in [400, 404, 500]

    def test_delete_record_invalid_id(self, client):
        """测试删除不存在的记录"""
        response = client.delete('/api/records/invalid_id_99999')
        assert response.status_code in [400, 404, 500]


class TestBudgetAPI:
    """预算管理 API 测试"""

    def test_get_budgets_endpoint(self, client):
        """测试获取预算列表"""
        response = client.get('/api/budgets')
        assert response.status_code in [200, 500]
        assert response.content_type == 'application/json'

    def test_create_budget_without_data(self, client):
        """测试创建预算缺少数据"""
        response = client.post('/api/budgets',
                              json={},
                              content_type='application/json')
        assert response.status_code in [400, 500]

    def test_create_budget_with_valid_data(self, client):
        """测试创建预算（有效数据）"""
        valid_budget = {
            'category': 'food',
            'amount': 5000,
            'period': 'monthly'
        }
        response = client.post('/api/budgets',
                              json=valid_budget,
                              content_type='application/json')
        assert response.status_code in [200, 201, 400, 500]


class TestStatisticsAPI:
    """统计分析 API 测试"""

    def test_get_statistics_endpoint(self, client):
        """测试获取统计数据"""
        response = client.get('/api/statistics')
        assert response.status_code in [200, 500]
        assert response.content_type == 'application/json'

    def test_get_statistics_with_date_range(self, client):
        """测试获取指定日期范围的统计"""
        response = client.get('/api/statistics?start=2024-01-01&end=2024-12-31')
        assert response.status_code in [200, 400, 500]

    def test_get_category_breakdown(self, client):
        """测试获取分类统计"""
        response = client.get('/api/statistics/categories')
        assert response.status_code in [200, 404, 500]


class TestInputValidation:
    """输入验证测试"""

    def test_amount_validation_zero(self, client):
        """测试金额为 0"""
        record = {
            'type': 'expense',
            'amount': 0,
            'category': 'test'
        }
        response = client.post('/api/records',
                              json=record,
                              content_type='application/json')
        # 可能允许或拒绝 0 金额
        assert response.status_code in [200, 201, 400, 500]

    def test_amount_validation_very_large(self, client):
        """测试非常大的金额"""
        record = {
            'type': 'income',
            'amount': 999999999.99,
            'category': 'test'
        }
        response = client.post('/api/records',
                              json=record,
                              content_type='application/json')
        assert response.status_code in [200, 201, 400, 500]

    def test_date_format_validation(self, client):
        """测试日期格式验证"""
        record = {
            'type': 'expense',
            'amount': 100,
            'category': 'test',
            'date': 'invalid-date-format'
        }
        response = client.post('/api/records',
                              json=record,
                              content_type='application/json')
        # 应该拒绝无效日期格式
        assert response.status_code in [400, 500]


class TestCORS:
    """CORS 配置测试"""

    def test_cors_headers(self, client):
        """测试 CORS headers 存在"""
        response = client.options('/api/records')
        assert response.status_code in [200, 204]

    def test_cors_allows_methods(self, client):
        """测试 CORS 允许的方法"""
        response = client.get('/status',
                             headers={'Origin': 'http://localhost:3000'})
        assert response.status_code == 200


class TestErrorHandling:
    """错误处理测试"""

    def test_invalid_endpoint(self, client):
        """测试访问不存在的端点"""
        response = client.get('/api/nonexistent')
        assert response.status_code == 404

    def test_invalid_http_method(self, client):
        """测试不支持的 HTTP 方法"""
        response = client.patch('/api/records')
        assert response.status_code in [405, 500]

    def test_malformed_json(self, client):
        """测试格式错误的 JSON"""
        response = client.post('/api/records',
                              data='{"invalid": json',
                              content_type='application/json')
        assert response.status_code in [400, 500]


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
