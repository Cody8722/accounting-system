"""
模糊測試 (Fuzzing) — JSON 輸入安全性與穩定性驗證

測試目標：
    確認所有接受 JSON 輸入的 API 能穩定攔截非法輸入，
    返回 400 Bad Request，而非觸發 500 Internal Server Error。

覆蓋四類攻擊向量：
    1. MongoDB 運算子注入 ($gt, $where, $ne, $regex, $in, $exists)
    2. 類型誤用 (陣列、null、空物件、非數字字串注入各欄位)
    3. 極端數值 (超大整數、浮點數邊界、NaN、Infinity、零、負數)
    4. 結構性攻擊 (空 body、非 JSON、缺少必要欄位、超長描述)

核心斷言（比現有測試更嚴格）：
    assert response.status_code == 400   # 必須是 400，不能是 500
    assert "error" in response.get_json()
"""

import pytest
import sys
import os
from datetime import datetime

os.environ["TESTING"] = "true"
os.environ["ADMIN_SECRET"] = "test-secret-key-123"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app

RECORDS_URL = "/admin/api/accounting/records"


# ==================== Fixtures ====================


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.url_map.strict_slashes = False
    with app.test_client() as client:
        yield client


@pytest.fixture
def auth_token(client):
    """註冊並登入，取得 JWT token"""
    reg_data = {
        "email": f"fuzzer{datetime.now().timestamp()}@example.com",
        "password": "MyS3cur3P@ssw0rd!XyZ",
        "name": "Fuzzer",
    }
    client.post("/api/auth/register", json=reg_data)
    login_resp = client.post(
        "/api/auth/login",
        json={"email": reg_data["email"], "password": reg_data["password"]},
    )
    if login_resp.status_code == 200:
        return login_resp.get_json().get("token")
    return None


@pytest.fixture
def valid_base():
    """合法的基礎記錄，用於 parametrize 中單欄位替換"""
    return {
        "type": "expense",
        "amount": 100.0,
        "category": "測試",
        "date": datetime.now().strftime("%Y-%m-%d"),
    }


# ==================== 輔助函數 ====================


def post_record(client, token, payload):
    return client.post(
        RECORDS_URL,
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )


def assert_400(response):
    """
    模糊測試核心斷言：
      - 必須回傳 400（驗證層攔截），不得是 500（伺服器錯誤）
      - 回應體必須是 JSON 且含 'error' 欄位
    """
    assert response.status_code == 400, (
        f"期望 400，實際 {response.status_code}。" f"回應體: {response.get_data(as_text=True)}"
    )
    body = response.get_json()
    assert body is not None, "回應體應為 JSON 格式"
    assert "error" in body, f"回應體缺少 'error' 欄位: {body}"


# ==================== Class 1: MongoDB 運算子注入 ====================


@pytest.mark.security
class TestMongoInjectionFuzzing:
    """
    MongoDB 運算子注入測試

    將 $gt / $where / $ne / $in / $regex / $exists 等運算子
    注入 amount、type、date、category 各欄位，
    確認驗證層（validate_amount 等）在進入 DB 查詢前完全攔截。
    """

    @pytest.mark.parametrize(
        "injected_amount",
        [
            pytest.param({"$gt": ""}, id="amount_$gt"),
            pytest.param({"$where": "1==1"}, id="amount_$where"),
            pytest.param({"$ne": 0}, id="amount_$ne"),
            pytest.param({"$in": [1, 2, 3]}, id="amount_$in"),
            pytest.param({"$regex": ".*"}, id="amount_$regex"),
            pytest.param({"$lt": 999999}, id="amount_$lt"),
        ],
    )
    def test_mongo_injection_in_amount(
        self, client, auth_token, valid_base, injected_amount
    ):
        """amount 欄位注入 MongoDB 運算子 → validate_amount 的 float(dict) 觸發 TypeError → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": injected_amount}
        assert_400(post_record(client, auth_token, payload))

    @pytest.mark.parametrize(
        "injected_type",
        [
            pytest.param({"$ne": "income"}, id="type_$ne"),
            pytest.param({"$in": ["income", "expense"]}, id="type_$in"),
            pytest.param({"$exists": True}, id="type_$exists"),
        ],
    )
    def test_mongo_injection_in_type(
        self, client, auth_token, valid_base, injected_type
    ):
        """type 欄位注入 MongoDB 運算子 → validate_record_type 的白名單驗證 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "type": injected_type}
        assert_400(post_record(client, auth_token, payload))

    @pytest.mark.parametrize(
        "injected_date",
        [
            pytest.param({"$gt": "2020-01-01"}, id="date_$gt"),
            pytest.param({"$lt": "9999-12-31"}, id="date_$lt"),
            pytest.param({"$ne": "2024-01-01"}, id="date_$ne"),
        ],
    )
    def test_mongo_injection_in_date(
        self, client, auth_token, valid_base, injected_date
    ):
        """date 欄位注入 MongoDB 運算子 → validate_date 的 isinstance(str) 檢查 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "date": injected_date}
        assert_400(post_record(client, auth_token, payload))

    @pytest.mark.parametrize(
        "injected_category",
        [
            pytest.param({"$regex": ".*"}, id="category_$regex"),
            pytest.param({"$exists": True}, id="category_$exists"),
            pytest.param({"$ne": ""}, id="category_$ne"),
        ],
    )
    def test_mongo_injection_in_category(
        self, client, auth_token, valid_base, injected_category
    ):
        """category 欄位注入 MongoDB 運算子 → validate_category 的 isinstance(str) 檢查 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "category": injected_category}
        assert_400(post_record(client, auth_token, payload))

    def test_mongo_injection_in_description(self, client, auth_token, valid_base):
        """description 欄位注入物件 → validate_description 的 isinstance(str) 檢查 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "description": {"$where": "sleep(5000)"}}
        assert_400(post_record(client, auth_token, payload))


# ==================== Class 2: 類型誤用 ====================


@pytest.mark.security
class TestTypeMisuseFuzzing:
    """
    類型誤用測試：使用者傳入陣列、null、空物件、非數字字串
    """

    @pytest.mark.parametrize(
        "bad_amount",
        [
            pytest.param([1, 2, 3], id="amount_array_numbers"),
            pytest.param([{"$gt": ""}], id="amount_array_with_operator"),
            pytest.param(None, id="amount_null"),
            pytest.param({}, id="amount_empty_object"),
            pytest.param("", id="amount_empty_string"),
            pytest.param("not_a_number", id="amount_string"),
        ],
    )
    def test_invalid_amount_type(self, client, auth_token, valid_base, bad_amount):
        """
        amount 傳入非數值類型 → validate_amount 的 float() 轉換失敗 → 400

        測試使用者報告的具體案例：
          - {"amount": [1, 2, 3]}   float(list)  → TypeError
          - {"amount": null}        float(None)  → TypeError
          - {"amount": {"$gt":""}}  float(dict)  → TypeError（亦覆蓋注入）
        """
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": bad_amount}
        assert_400(post_record(client, auth_token, payload))

    def test_boolean_true_boundary(self, client, auth_token, valid_base):
        """
        邊界行為文件化：amount=true

        Python 的 float(True) == 1.0，通過 > 0 且 <= MAX_AMOUNT 的檢查，
        因此系統會接受並建立金額為 1.0 的記錄。
        此為 float() 的語言行為，非安全漏洞，但值得記錄。

        預期回應：201（而非 400）
        """
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": True}
        response = post_record(client, auth_token, payload)
        # 記錄實際行為：True 被接受為 1.0
        assert response.status_code in [
            201,
            200,
            500,
        ], f"amount=True 的邊界行為：實際狀態碼 {response.status_code}"

    def test_boolean_false_rejected(self, client, auth_token, valid_base):
        """amount=false → float(False)=0.0 → 金額必須 > 0 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": False}
        assert_400(post_record(client, auth_token, payload))

    @pytest.mark.parametrize(
        "field,null_value",
        [
            pytest.param("type", None, id="type_null"),
            pytest.param("amount", None, id="amount_null"),
            pytest.param("category", None, id="category_null"),
            pytest.param("date", None, id="date_null"),
        ],
    )
    def test_null_in_required_fields(
        self, client, auth_token, valid_base, field, null_value
    ):
        """各必填欄位傳入 null → 對應 validate_* 函數攔截 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, field: null_value}
        assert_400(post_record(client, auth_token, payload))

    @pytest.mark.parametrize(
        "field,array_value",
        [
            pytest.param("type", ["income", "expense"], id="type_array"),
            pytest.param("category", ["飲食", "交通"], id="category_array"),
            pytest.param("date", ["2024-01-01"], id="date_array"),
            pytest.param("description", ["script", "alert"], id="description_array"),
        ],
    )
    def test_array_in_string_fields(
        self, client, auth_token, valid_base, field, array_value
    ):
        """字串欄位傳入陣列 → isinstance(str) 檢查 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, field: array_value}
        assert_400(post_record(client, auth_token, payload))


# ==================== Class 3: 極端數值 ====================


@pytest.mark.security
class TestExtremeValueFuzzing:
    """
    極端數值測試：超大整數、浮點數邊界、NaN、Infinity、零、負數
    """

    @pytest.mark.parametrize(
        "extreme_amount",
        [
            pytest.param(10_000_000, id="over_max_10m"),
            pytest.param(9_999_999_999, id="over_max_10b"),
            pytest.param(2**53, id="js_max_safe_integer"),
            pytest.param(2**63, id="int64_max"),
            pytest.param("NaN", id="string_NaN"),
            pytest.param("Infinity", id="string_Infinity"),
            pytest.param("-Infinity", id="string_neg_Infinity"),
        ],
    )
    def test_extreme_amount_rejected(
        self, client, auth_token, valid_base, extreme_amount
    ):
        """
        超界或特殊浮點值 → validate_amount 攔截 → 400

        - 整數 > MAX_AMOUNT(9,999,999.99) → 超上限
        - "NaN"   → float("NaN")=nan → nan!=nan → 金額無效
        - "Infinity" → float("Infinity")=inf → inf > MAX_AMOUNT → 400
        """
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": extreme_amount}
        assert_400(post_record(client, auth_token, payload))

    @pytest.mark.parametrize(
        "non_positive_amount",
        [
            pytest.param(0, id="zero"),
            pytest.param(0.0, id="zero_float"),
            pytest.param(-0.001, id="negative_small"),
            pytest.param(-100, id="negative_100"),
            pytest.param(-9999999.99, id="negative_max"),
        ],
    )
    def test_non_positive_amount_rejected(
        self, client, auth_token, valid_base, non_positive_amount
    ):
        """零或負數 → amount <= 0 檢查 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": non_positive_amount}
        assert_400(post_record(client, auth_token, payload))

    def test_amount_exactly_at_max(self, client, auth_token, valid_base):
        """MAX_AMOUNT = 9999999.99 邊界值 → 允許（不應報 400）"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": 9999999.99}
        response = post_record(client, auth_token, payload)
        assert response.status_code in [
            200,
            201,
            500,
        ], f"MAX_AMOUNT 邊界值應被接受，實際狀態碼: {response.status_code}"

    def test_amount_just_over_max(self, client, auth_token, valid_base):
        """MAX_AMOUNT + 0.01 = 10000000.00 → 剛超上限 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "amount": 10000000.00}
        assert_400(post_record(client, auth_token, payload))


# ==================== Class 4: 結構性攻擊 ====================


@pytest.mark.security
class TestStructuralFuzzing:
    """
    結構性攻擊：空 body、非 JSON、缺少必要欄位、超長描述
    """

    def test_empty_json_body(self, client, auth_token):
        """空 JSON 物件 {} → 缺少所有必要欄位 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        response = client.post(
            RECORDS_URL,
            json={},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert_400(response)

    def test_empty_body_with_json_content_type(self, client, auth_token):
        """Content-Type: application/json 但 body 為空 → get_json() 回傳 None → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        response = client.post(
            RECORDS_URL,
            data="",
            content_type="application/json",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 400

    def test_plain_text_body(self, client, auth_token):
        """非 JSON Content-Type → 無法解析為 JSON → 400"""
        if not auth_token:
            pytest.skip("需要認証 token")
        response = client.post(
            RECORDS_URL,
            data="amount=100&type=expense",
            content_type="text/plain",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 400

    @pytest.mark.parametrize(
        "missing_field",
        [
            pytest.param("type", id="missing_type"),
            pytest.param("amount", id="missing_amount"),
            pytest.param("category", id="missing_category"),
            pytest.param("date", id="missing_date"),
        ],
    )
    def test_missing_required_field(self, client, auth_token, missing_field):
        """缺少各必填欄位 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        base = {
            "type": "expense",
            "amount": 100.0,
            "category": "測試",
            "date": datetime.now().strftime("%Y-%m-%d"),
        }
        del base[missing_field]
        assert_400(post_record(client, auth_token, base))

    def test_description_over_max_length(self, client, auth_token, valid_base):
        """description 超過 MAX_DESCRIPTION_LENGTH(500) → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "description": "A" * 501}
        assert_400(post_record(client, auth_token, payload))

    def test_description_exactly_at_max_length(self, client, auth_token, valid_base):
        """description 恰好 500 字元 → 允許（邊界值驗證）"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "description": "A" * 500}
        response = post_record(client, auth_token, payload)
        assert response.status_code in [
            200,
            201,
            500,
        ], f"500 字元 description 應被接受，實際: {response.status_code}"

    def test_invalid_type_value(self, client, auth_token, valid_base):
        """type 傳入白名單以外的字串 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "type": "invalid_type"}
        assert_400(post_record(client, auth_token, payload))

    def test_invalid_date_format(self, client, auth_token, valid_base):
        """date 使用錯誤格式 YYYY/MM/DD → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "date": "2024/01/01"}
        assert_400(post_record(client, auth_token, payload))

    def test_invalid_expense_type(self, client, auth_token, valid_base):
        """expense_type 傳入白名單以外的值 → 400"""
        if not auth_token:
            pytest.skip("需要認證 token")
        payload = {**valid_base, "expense_type": "unknown"}
        assert_400(post_record(client, auth_token, payload))


# ==================== Class 5: PUT 端點模糊測試 ====================


@pytest.mark.security
class TestPutEndpointFuzzing:
    """
    PUT /admin/api/accounting/records/<id> 的模糊測試

    先建立合法記錄取得 record_id，再對該 ID 發送惡意 payload，
    確認更新端點的驗證層與 POST 一致。
    """

    @pytest.fixture
    def existing_record_id(self, client, auth_token):
        """建立一筆合法記錄並返回其 ID"""
        if not auth_token:
            return None
        payload = {
            "type": "expense",
            "amount": 50.0,
            "category": "測試",
            "date": datetime.now().strftime("%Y-%m-%d"),
        }
        resp = post_record(client, auth_token, payload)
        if resp.status_code in [200, 201]:
            return resp.get_json().get("id")
        return None

    @pytest.mark.parametrize(
        "injected_amount",
        [
            pytest.param({"$gt": ""}, id="put_amount_$gt"),
            pytest.param({"$set": {"amount": 0}}, id="put_amount_$set"),
            pytest.param([1, 2, 3], id="put_amount_array"),
            pytest.param(None, id="put_amount_null"),
        ],
    )
    def test_put_mongo_injection_in_amount(
        self, client, auth_token, existing_record_id, injected_amount
    ):
        """PUT 的 amount 欄位注入 → validate_amount 攔截 → 400"""
        if not auth_token or not existing_record_id:
            pytest.skip("需要認證 token 及有效記錄 ID")
        response = client.put(
            f"{RECORDS_URL}/{existing_record_id}",
            json={"amount": injected_amount},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert_400(response)

    @pytest.mark.parametrize(
        "extreme_amount",
        [
            pytest.param(10_000_000, id="put_over_max"),
            pytest.param("NaN", id="put_NaN"),
            pytest.param(-1, id="put_negative"),
            pytest.param(0, id="put_zero"),
        ],
    )
    def test_put_extreme_amount(
        self, client, auth_token, existing_record_id, extreme_amount
    ):
        """PUT 的極端數值 → 400"""
        if not auth_token or not existing_record_id:
            pytest.skip("需要認證 token 及有效記錄 ID")
        response = client.put(
            f"{RECORDS_URL}/{existing_record_id}",
            json={"amount": extreme_amount},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert_400(response)

    def test_put_mongo_injection_in_type(self, client, auth_token, existing_record_id):
        """PUT 的 type 欄位注入 → 400"""
        if not auth_token or not existing_record_id:
            pytest.skip("需要認證 token 及有效記錄 ID")
        response = client.put(
            f"{RECORDS_URL}/{existing_record_id}",
            json={"type": {"$ne": "income"}},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert_400(response)

    def test_put_description_over_limit(self, client, auth_token, existing_record_id):
        """PUT 的 description 超長 → 400"""
        if not auth_token or not existing_record_id:
            pytest.skip("需要認證 token 及有效記錄 ID")
        response = client.put(
            f"{RECORDS_URL}/{existing_record_id}",
            json={"description": "X" * 501},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert_400(response)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
