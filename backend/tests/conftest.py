"""
Pytest配置和共享 fixtures
"""
import pytest
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app


@pytest.fixture(scope='session')
def test_app():
    """創建測試應用實例"""
    app.config['TESTING'] = True
    app.url_map.strict_slashes = False
    return app


@pytest.fixture
def client(test_app):
    """創建測試客戶端"""
    with test_app.test_client() as client:
        yield client


@pytest.fixture
def test_user_email():
    """生成唯一的測試用戶郵箱"""
    return f'test{datetime.now().timestamp()}@example.com'


@pytest.fixture
def test_user_data(test_user_email):
    """測試用戶數據"""
    return {
        'email': test_user_email,
        'password': 'MyS3cur3P@ssw0rd!XyZ',
        'name': 'Test User'
    }


@pytest.fixture
def registered_user(client, test_user_data):
    """註冊並返回用戶數據"""
    response = client.post('/api/auth/register', json=test_user_data)
    if response.status_code in [200, 201]:
        return test_user_data
    return None


@pytest.fixture
def auth_token(client, registered_user):
    """獲取認證 token"""
    if not registered_user:
        return None

    login_response = client.post('/api/auth/login', json={
        'email': registered_user['email'],
        'password': registered_user['password']
    })

    if login_response.status_code == 200:
        data = login_response.get_json()
        return data.get('token')
    return None


@pytest.fixture
def auth_headers(auth_token):
    """返回包含認證 token 的 headers"""
    if auth_token:
        return {'Authorization': f'Bearer {auth_token}'}
    return {}


@pytest.fixture
def sample_expense_record():
    """示例支出記錄"""
    return {
        'type': 'expense',
        'amount': 100.50,
        'category': '飲食',
        'date': datetime.now().strftime('%Y-%m-%d'),
        'description': '午餐'
    }


@pytest.fixture
def sample_income_record():
    """示例收入記錄"""
    return {
        'type': 'income',
        'amount': 5000.00,
        'category': '薪水',
        'date': datetime.now().strftime('%Y-%m-%d'),
        'description': '月薪'
    }


def pytest_configure(config):
    """Pytest 配置"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "unit: marks tests as unit tests"
    )
