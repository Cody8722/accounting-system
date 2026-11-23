"""
審查修正的回歸測試（docs/ROADMAP_v2.md 的 2h）。

這個檔案每個測試在修正前都會失敗，修正後才通過：
- 趨勢要取「最近」N 個月，不是最舊的
- 環比的「本期」要含今天
- HTTP 例外（壞 JSON 等）不能被全域錯誤處理器變成 500
- 金額驗證在欠款、預算、定期收支、記帳各端點一致：拒絕 NaN、無限大、布林

刻意不使用 skip：拿不到 token 就直接失敗，避免註冊壞掉時整檔靜默跳過。
"""

from datetime import datetime

import pytest

ACCOUNTING = "/admin/api/accounting"
DEBTS = "/admin/api/debts"
RECURRING = "/admin/api/recurring"

# 以「原始 JSON 文字」代入金額，才能送出 NaN、Infinity、true 這類 Python
# 的 json= 參數不容易（或不會）原樣送出的字面值。
BAD_AMOUNT_TOKENS = ["NaN", "Infinity", "-Infinity", "true"]


@pytest.fixture
def headers(auth_headers):
    assert auth_headers, "拿不到認證 token（註冊或登入壞了）"
    return auth_headers


def _post_raw(client, url, raw, headers):
    return client.post(
        url,
        data=raw,
        content_type="application/json",
        headers=headers,
    )


def _last_months(n):
    """回傳以本月結尾的最近 n 個月（舊→新），格式 YYYY-MM。"""
    now = datetime.now()
    months = []
    year, month = now.year, now.month
    for _ in range(n):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return list(reversed(months))


def _create_expense(client, headers, date, amount):
    res = client.post(
        f"{ACCOUNTING}/records",
        json={
            "type": "expense",
            "amount": amount,
            "category": "午餐",
            "date": date,
            "description": "回歸測試",
            "confirm_withdrawal": True,
        },
        headers=headers,
    )
    assert res.status_code == 201, res.get_data(as_text=True)


class TestTrendsLatestMonths:
    def test_trends_returns_most_recent_months_not_oldest(self, client, headers):
        """記了 9 個月以上的資料，months=6 要回最近 6 個月，今天那筆要在裡面。"""
        today = datetime.now().strftime("%Y-%m-%d")
        months9 = _last_months(9)
        amounts = {}
        for i, month in enumerate(months9):
            amount = 100 + i
            date = today if month == months9[-1] else f"{month}-15"
            _create_expense(client, headers, date, amount)
            amounts[month] = float(amount)

        res = client.get(f"{ACCOUNTING}/trends?months=6", headers=headers)
        assert res.status_code == 200
        data = res.get_json()

        expected = _last_months(6)
        assert data["months"] == expected
        assert data["expense"] == [amounts[m] for m in expected]

    def test_trends_empty_months_are_zero_filled(self, client, headers):
        """沒資料的月份補 0，且仍是最近 N 個月。"""
        res = client.get(f"{ACCOUNTING}/trends?months=3", headers=headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["months"] == _last_months(3)
        assert data["income"] == [0, 0, 0]
        assert data["expense"] == [0, 0, 0]


class TestComparisonIncludesToday:
    @pytest.mark.parametrize("period", ["week", "month", "quarter", "year"])
    def test_today_record_counted_in_current_period(self, client, headers, period):
        today = datetime.now().strftime("%Y-%m-%d")
        res = client.post(
            f"{ACCOUNTING}/records",
            json={
                "type": "income",
                "amount": 500,
                "category": "薪水",
                "date": today,
                "description": "回歸測試",
                "location": "bank",
            },
            headers=headers,
        )
        assert res.status_code == 201, res.get_data(as_text=True)

        cmp_res = client.get(
            f"{ACCOUNTING}/comparison?period={period}", headers=headers
        )
        assert cmp_res.status_code == 200
        assert cmp_res.get_json()["current"]["income"] == 500.0


class TestHttpErrorsKeepStatus:
    def test_malformed_json_returns_400_not_500(self, client, headers):
        res = _post_raw(client, f"{ACCOUNTING}/import", "{壞掉的 json", headers)
        assert res.status_code == 400
        assert "error" in res.get_json()

    def test_unknown_route_still_404(self, client):
        assert client.get("/不存在的路徑").status_code == 404

    def test_real_server_error_still_500(self, client, headers, monkeypatch):
        """真正的未預期例外仍回 500（不能因為修 HTTP 例外而把它也放掉）。"""
        import db

        def boom(*_a, **_k):
            raise RuntimeError("測試用")

        monkeypatch.setattr(db.accounting_records_collection, "aggregate", boom)
        res = client.get(f"{ACCOUNTING}/trends", headers=headers)
        assert res.status_code == 500


class TestAmountValidationConsistent:
    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_record_rejects_bad_amount(self, client, headers, token):
        raw = (
            '{"type":"expense","category":"午餐","date":"2026-01-01",'
            f'"confirm_withdrawal":true,"amount":{token}}}'
        )
        res = _post_raw(client, f"{ACCOUNTING}/records", raw, headers)
        assert res.status_code == 400

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_create_debt_rejects_bad_amount(self, client, headers, token):
        raw = f'{{"debt_type":"lent","person":"小明","amount":{token}}}'
        assert _post_raw(client, DEBTS, raw, headers).status_code == 400

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_create_debt_rejects_bad_member_share(self, client, headers, token):
        raw = (
            '{"debt_type":"lent","person":"聚餐","amount":300,'
            f'"members":[{{"name":"甲","share":{token}}}]}}'
        )
        assert _post_raw(client, DEBTS, raw, headers).status_code == 400

    def _make_debt(self, client, headers, members=None):
        body = {"debt_type": "lent", "person": "小明", "amount": 100}
        if members:
            body["members"] = members
        res = client.post(DEBTS, json=body, headers=headers)
        assert res.status_code == 201, res.get_data(as_text=True)
        return res.get_json()["id"]

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_repay_rejects_bad_amount_and_leaves_debt_untouched(
        self, client, headers, token
    ):
        debt_id = self._make_debt(client, headers)
        res = _post_raw(
            client, f"{DEBTS}/{debt_id}/repay", f'{{"amount":{token}}}', headers
        )
        assert res.status_code == 400
        debt = client.get(f"{DEBTS}/{debt_id}", headers=headers).get_json()
        assert debt["paid_amount"] == 0
        # 沒有被污染的記帳記錄：總收入仍是 0
        stats = client.get(f"{ACCOUNTING}/stats", headers=headers).get_json()
        assert stats["total_income"] == 0

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_member_repay_rejects_bad_amount(self, client, headers, token):
        debt_id = self._make_debt(
            client, headers, members=[{"name": "甲", "share": 100}]
        )
        res = _post_raw(
            client,
            f"{DEBTS}/{debt_id}/members/0/repay",
            f'{{"amount":{token}}}',
            headers,
        )
        assert res.status_code == 400

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_update_debt_rejects_bad_amount(self, client, headers, token):
        debt_id = self._make_debt(client, headers)
        res = client.put(
            f"{DEBTS}/{debt_id}",
            data=f'{{"amount":{token}}}',
            content_type="application/json",
            headers=headers,
        )
        assert res.status_code == 400
        debt = client.get(f"{DEBTS}/{debt_id}", headers=headers).get_json()
        assert debt["amount"] == 100

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_budget_rejects_bad_amount(self, client, headers, token):
        raw = f'{{"budget":{{"午餐":{token}}}}}'
        res = _post_raw(client, f"{ACCOUNTING}/budget", raw, headers)
        assert res.status_code == 400

    @pytest.mark.parametrize("token", BAD_AMOUNT_TOKENS)
    def test_recurring_rejects_bad_amount(self, client, headers, token):
        raw = '{"name":"房租","type":"expense","day_of_month":1,' f'"amount":{token}}}'
        assert _post_raw(client, RECURRING, raw, headers).status_code == 400

    def test_valid_amounts_still_accepted(self, client, headers):
        """確認收緊驗證沒有誤傷正常輸入（含預算 0 代表「不設預算」）。"""
        debt = client.post(
            DEBTS,
            json={"debt_type": "lent", "person": "小明", "amount": 123.45},
            headers=headers,
        )
        assert debt.status_code == 201
        budget = client.post(
            f"{ACCOUNTING}/budget", json={"budget": {"午餐": 0}}, headers=headers
        )
        assert budget.status_code == 200
        rec = client.post(
            RECURRING,
            json={"name": "房租", "type": "expense", "day_of_month": 1, "amount": 9999},
            headers=headers,
        )
        assert rec.status_code == 201
