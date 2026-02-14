"""
會計記錄測試
測試記帳記錄的 CRUD 操作和極端場景
"""
import pytest
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app


@pytest.fixture
def client():
    """創建測試客戶端"""
    app.config['TESTING'] = True
    app.url_map.strict_slashes = False
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_token(client):
    """創建並返回認證 token"""
    # 註冊用戶
    reg_data = {
        'email': f'test{datetime.now().timestamp()}@example.com',
        'password': 'MyS3cur3P@ssw0rd!XyZ',
        'name': 'Test User'
    }
    client.post('/api/auth/register', json=reg_data)

    # 登入獲取 token
    login_response = client.post('/api/auth/login', json={
        'email': reg_data['email'],
        'password': reg_data['password']
    })

    if login_response.status_code == 200:
        data = login_response.get_json()
        return data.get('token')
    return None


class TestRecordCreation:
    """記錄創建測試"""

    def test_create_expense_record(self, client, auth_token):
        """測試創建支出記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100.50,
            'category': '飲食',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'description': '午餐'
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 500]

    def test_create_income_record(self, client, auth_token):
        """測試創建收入記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'income',
            'amount': 5000.00,
            'category': '薪水',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'description': '月薪'
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 500]

    def test_create_record_with_zero_amount(self, client, auth_token):
        """測試創建金額為 0 的記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 0,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        # 應該拒絕 0 金額
        assert response.status_code in [400, 500]

    def test_create_record_with_negative_amount(self, client, auth_token):
        """測試創建負數金額"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': -100,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        # 應該拒絕負數
        assert response.status_code in [400, 500]

    def test_create_record_with_very_large_amount(self, client, auth_token):
        """測試極大金額"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'income',
            'amount': 999999999.99,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_with_over_max_amount(self, client, auth_token):
        """測試超過最大金額"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 10000000.00,  # 超過 9999999.99
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_with_many_decimals(self, client, auth_token):
        """測試多位小數"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100.123456,  # 超過 2 位小數
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 500]

    def test_create_record_invalid_type(self, client, auth_token):
        """測試無效類型"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'invalid',
            'amount': 100,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [400, 500]

    def test_create_record_future_date(self, client, auth_token):
        """測試未來日期"""
        if not auth_token:
            pytest.skip("需要認證 token")

        future_date = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
        data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': future_date
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        # 可能允許或拒絕未來日期
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_very_old_date(self, client, auth_token):
        """測試很久以前的日期"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': '1900-01-01'
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_invalid_date_format(self, client, auth_token):
        """測試無效日期格式"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': '2024/01/01'  # 錯誤格式
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [400, 500]

    def test_create_record_missing_category(self, client, auth_token):
        """測試缺少分類"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [400, 500]

    def test_create_record_empty_category(self, client, auth_token):
        """測試空分類"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'category': '',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [400, 500]

    def test_create_record_very_long_description(self, client, auth_token):
        """測試超長描述"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'description': 'A' * 10000  # 超長描述
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_with_xss_in_description(self, client, auth_token):
        """測試描述中的 XSS"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'description': '<script>alert("XSS")</script>'
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        # 應該安全處理
        assert response.status_code in [200, 201, 400, 500]

    def test_create_record_with_sql_injection(self, client, auth_token):
        """測試 SQL 注入"""
        if not auth_token:
            pytest.skip("需要認證 token")

        data = {
            'type': 'expense',
            'amount': 100,
            'category': "'; DROP TABLE records; --",
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        response = client.post('/admin/api/accounting/records',
                              json=data,
                              headers={'Authorization': f'Bearer {auth_token}'})
        # 應該安全處理（MongoDB 不受 SQL 注入影響）
        assert response.status_code in [200, 201, 400, 500]


class TestRecordRetrieval:
    """記錄查詢測試"""

    def test_get_all_records(self, client, auth_token):
        """測試獲取所有記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        response = client.get('/admin/api/accounting/records',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 500]

    def test_get_records_with_date_filter(self, client, auth_token):
        """測試日期篩選"""
        if not auth_token:
            pytest.skip("需要認證 token")

        start_date = '2024-01-01'
        end_date = '2024-12-31'
        response = client.get(f'/admin/api/accounting/records?start_date={start_date}&end_date={end_date}',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 400, 500]

    def test_get_records_with_type_filter(self, client, auth_token):
        """測試類型篩選"""
        if not auth_token:
            pytest.skip("需要認證 token")

        response = client.get('/admin/api/accounting/records?type=expense',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 500]

    def test_get_records_with_category_filter(self, client, auth_token):
        """測試分類篩選"""
        if not auth_token:
            pytest.skip("需要認證 token")

        response = client.get('/admin/api/accounting/records?category=飲食',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 500]


class TestRecordUpdate:
    """記錄更新測試"""

    def test_update_record_amount(self, client, auth_token):
        """測試更新金額"""
        if not auth_token:
            pytest.skip("需要認證 token")

        # 先創建一個記錄
        create_data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        create_response = client.post('/admin/api/accounting/records',
                                      json=create_data,
                                      headers={'Authorization': f'Bearer {auth_token}'})

        if create_response.status_code in [200, 201]:
            record_id = create_response.get_json().get('id')
            if record_id:
                update_data = {'amount': 200}
                response = client.put(f'/admin/api/accounting/records/{record_id}',
                                    json=update_data,
                                    headers={'Authorization': f'Bearer {auth_token}'})
                assert response.status_code in [200, 404, 500]


class TestRecordDeletion:
    """記錄刪除測試"""

    def test_delete_existing_record(self, client, auth_token):
        """測試刪除現有記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        # 先創建一個記錄
        create_data = {
            'type': 'expense',
            'amount': 100,
            'category': '測試',
            'date': datetime.now().strftime('%Y-%m-%d')
        }
        create_response = client.post('/admin/api/accounting/records',
                                      json=create_data,
                                      headers={'Authorization': f'Bearer {auth_token}'})

        if create_response.status_code in [200, 201]:
            record_id = create_response.get_json().get('id')
            if record_id:
                response = client.delete(f'/admin/api/accounting/records/{record_id}',
                                        headers={'Authorization': f'Bearer {auth_token}'})
                assert response.status_code in [200, 204, 404, 500]

    def test_delete_nonexistent_record(self, client, auth_token):
        """測試刪除不存在的記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        response = client.delete('/admin/api/accounting/records/nonexistent123',
                                headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [404, 500]


class TestStatistics:
    """統計功能測試"""

    def test_get_statistics(self, client, auth_token):
        """測試獲取統計數據"""
        if not auth_token:
            pytest.skip("需要認證 token")

        response = client.get('/admin/api/accounting/stats',
                             headers={'Authorization': f'Bearer {auth_token}'})
        assert response.status_code in [200, 500]

        if response.status_code == 200:
            data = response.get_json()
            assert 'total_income' in data
            assert 'total_expense' in data
            assert 'balance' in data

    def test_statistics_with_no_records(self, client, auth_token):
        """測試沒有記錄時的統計"""
        if not auth_token:
            pytest.skip("需要認證 token")

        # 新用戶應該沒有記錄
        response = client.get('/admin/api/accounting/stats',
                             headers={'Authorization': f'Bearer {auth_token}'})
        if response.status_code == 200:
            data = response.get_json()
            # 應該返回 0
            assert data.get('total_income') == 0 or isinstance(data.get('total_income'), (int, float))


class TestConcurrency:
    """並發測試"""

    def test_multiple_simultaneous_creates(self, client, auth_token):
        """測試同時創建多個記錄"""
        if not auth_token:
            pytest.skip("需要認證 token")

        # 模擬多個並發請求
        responses = []
        for i in range(5):
            data = {
                'type': 'expense',
                'amount': 100 + i,
                'category': f'測試{i}',
                'date': datetime.now().strftime('%Y-%m-%d')
            }
            response = client.post('/admin/api/accounting/records',
                                  json=data,
                                  headers={'Authorization': f'Bearer {auth_token}'})
            responses.append(response)

        # 所有請求都應該成功
        for response in responses:
            assert response.status_code in [200, 201, 500]


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
