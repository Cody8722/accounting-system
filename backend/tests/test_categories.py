"""
test_categories.py — 自訂分類設定 API（GET / PUT /api/user/categories）。

驗證重點：未設定時回預設（config 為 None）；儲存後可讀回；格式驗證（色碼、
名稱重複、非法字元、系統保留名稱）；改名／合併會連同舊記錄、定期項目、預算一起改；
不同使用者互不影響；預算接受自訂分類。
"""

from datetime import datetime

import pytest

URL = "/api/user/categories"


def _cfg(**over):
    cfg = {
        "expense": [
            {
                "group": "飲食",
                "icon": "ti-tools-kitchen-2",
                "color": "#e0894f",
                "items": ["早餐", "午餐"],
            },
            {"group": "寵物", "icon": "ti-paw", "color": "#5fbf8a", "items": ["飼料"]},
        ],
        "income": [
            {"group": "收入", "icon": "ti-cash", "color": "#3f8f66", "items": ["薪資"]}
        ],
        "leaf_colors": {"飼料": "#123456"},
        "quick": {"expense": ["早餐", "飼料"], "income": ["薪資"]},
    }
    cfg.update(over)
    return cfg


def _put(client, headers, config, renames=None):
    body = {"config": config}
    if renames is not None:
        body["renames"] = renames
    return client.put(URL, json=body, headers=headers)


def _add_record(client, headers, category, rtype="expense"):
    r = client.post(
        "/admin/api/accounting/records",
        json={
            "type": rtype,
            "amount": 50,
            "category": category,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "description": "t",
            # 現金不足時自動從銀行補提領（測試只關心分類，不關心現金流）
            "confirm_withdrawal": True,
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.get_json()


def _second_user_headers(client):
    t = f"{datetime.now().timestamp()}"
    data = {
        "email": f"cat-second-{t}@example.com",
        "password": "MyS3cur3P@ssw0rd!XyZ",
        "name": "Cat Second",
    }
    assert client.post("/api/auth/register", json=data).status_code in (200, 201)
    login = client.post(
        "/api/auth/login", json={"email": data["email"], "password": data["password"]}
    )
    return {"Authorization": f"Bearer {login.get_json()['token']}"}


class TestGetDefault:
    def test_requires_auth(self, client):
        assert client.get(URL).status_code == 401

    def test_unset_returns_null_config(self, client, auth_headers):
        r = client.get(URL, headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        assert body["config"] is None
        assert isinstance(body["usage"], dict)

    def test_usage_counts_records(self, client, auth_headers):
        _add_record(client, auth_headers, "使用量測試分類")
        _add_record(client, auth_headers, "使用量測試分類")
        body = client.get(URL, headers=auth_headers).get_json()
        assert body["usage"]["使用量測試分類"] == 2


class TestSave:
    def test_save_and_read_back(self, client, auth_headers):
        r = _put(client, auth_headers, _cfg())
        assert r.status_code == 200
        body = client.get(URL, headers=auth_headers).get_json()
        assert body["config"]["expense"][1]["group"] == "寵物"
        assert body["config"]["leaf_colors"] == {"飼料": "#123456"}
        assert body["config"]["quick"]["expense"] == ["早餐", "飼料"]

    def test_reset_with_null(self, client, auth_headers):
        _put(client, auth_headers, _cfg())
        r = _put(client, auth_headers, None)
        assert r.status_code == 200
        assert client.get(URL, headers=auth_headers).get_json()["config"] is None

    def test_users_are_isolated(self, client, auth_headers):
        _put(client, auth_headers, _cfg())
        other = _second_user_headers(client)
        assert client.get(URL, headers=other).get_json()["config"] is None


class TestValidation:
    @pytest.mark.parametrize(
        "color", ["red", "#fff", "#12345", "#gggggg", "123456", ""]
    )
    def test_bad_group_color(self, client, auth_headers, color):
        cfg = _cfg()
        cfg["expense"][0]["color"] = color
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_bad_leaf_color(self, client, auth_headers):
        assert (
            _put(client, auth_headers, _cfg(leaf_colors={"早餐": "blue"})).status_code
            == 400
        )

    def test_leaf_color_for_unknown_leaf(self, client, auth_headers):
        assert (
            _put(
                client, auth_headers, _cfg(leaf_colors={"不存在": "#112233"})
            ).status_code
            == 400
        )

    def test_duplicate_leaf_across_groups(self, client, auth_headers):
        cfg = _cfg()
        cfg["expense"][1]["items"] = ["早餐"]
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_duplicate_leaf_between_types(self, client, auth_headers):
        cfg = _cfg()
        cfg["income"][0]["items"] = ["午餐"]
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_duplicate_group(self, client, auth_headers):
        cfg = _cfg()
        cfg["expense"][1]["group"] = "飲食"
        assert _put(client, auth_headers, cfg).status_code == 400

    @pytest.mark.parametrize("name", ["", "   ", "a.b", "$bad", "x" * 51])
    def test_bad_leaf_name(self, client, auth_headers, name):
        cfg = _cfg()
        cfg["expense"][0]["items"] = [name]
        assert _put(client, auth_headers, cfg).status_code == 400

    @pytest.mark.parametrize("name", ["債務收回", "債務償還"])
    def test_system_names_reserved(self, client, auth_headers, name):
        cfg = _cfg()
        cfg["expense"][0]["items"] = [name]
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_bad_icon(self, client, auth_headers):
        cfg = _cfg()
        cfg["expense"][0]["icon"] = "<script>"
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_quick_must_be_existing_leaves(self, client, auth_headers):
        cfg = _cfg(quick={"expense": ["不存在"], "income": []})
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_too_many_groups(self, client, auth_headers):
        cfg = _cfg()
        cfg["expense"] = [
            {"group": f"g{i}", "icon": "ti-tag", "color": "#112233", "items": [f"l{i}"]}
            for i in range(41)
        ]
        cfg["leaf_colors"] = {}
        cfg["quick"] = {"expense": [], "income": ["薪資"]}
        assert _put(client, auth_headers, cfg).status_code == 400

    def test_missing_config_key_rejected(self, client, auth_headers):
        r = client.put(URL, json={}, headers=auth_headers)
        assert r.status_code == 400

    def test_color_normalised_to_lowercase(self, client, auth_headers):
        cfg = _cfg()
        cfg["expense"][0]["color"] = "#E0894F"
        assert _put(client, auth_headers, cfg).status_code == 200
        got = client.get(URL, headers=auth_headers).get_json()["config"]
        assert got["expense"][0]["color"] == "#e0894f"


class TestRenames:
    def test_rename_updates_records(self, client, auth_headers):
        _add_record(client, auth_headers, "舊名A")
        cfg = _cfg()
        cfg["expense"][0]["items"] = ["新名A", "午餐"]
        cfg["quick"] = {"expense": [], "income": []}
        r = _put(client, auth_headers, cfg, [{"from": "舊名A", "to": "新名A"}])
        assert r.status_code == 200
        assert r.get_json()["renamed_records"] >= 1
        usage = client.get(URL, headers=auth_headers).get_json()["usage"]
        assert usage.get("新名A", 0) >= 1
        assert "舊名A" not in usage

    def test_rename_updates_recurring(self, client, auth_headers):
        client.post(
            "/admin/api/recurring",
            json={
                "name": "r",
                "amount": 10,
                "type": "expense",
                "category": "舊名B",
                "day_of_month": 1,
            },
            headers=auth_headers,
        )
        cfg = _cfg()
        cfg["expense"][0]["items"] = ["新名B", "午餐"]
        cfg["quick"] = {"expense": [], "income": []}
        assert (
            _put(
                client, auth_headers, cfg, [{"from": "舊名B", "to": "新名B"}]
            ).status_code
            == 200
        )
        items = client.get("/admin/api/recurring", headers=auth_headers).get_json()
        assert any(i["category"] == "新名B" for i in items)
        assert not any(i["category"] == "舊名B" for i in items)

    def test_rename_moves_budget_key(self, client, auth_headers):
        client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"早餐": 3000}, "month": "2026-05"},
            headers=auth_headers,
        )
        cfg = _cfg()
        cfg["expense"][0]["items"] = ["早點", "午餐"]
        cfg["quick"] = {"expense": [], "income": []}
        assert (
            _put(
                client, auth_headers, cfg, [{"from": "早餐", "to": "早點"}]
            ).status_code
            == 200
        )
        got = client.get(
            "/admin/api/accounting/budget?month=2026-05", headers=auth_headers
        ).get_json()["budget"]
        assert got == {"早點": 3000}

    def test_merge_adds_budget_amounts(self, client, auth_headers):
        client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"早餐": 1000, "午餐": 500}, "month": "2026-06"},
            headers=auth_headers,
        )
        cfg = _cfg()
        cfg["expense"][0]["items"] = ["午餐"]
        cfg["quick"] = {"expense": [], "income": []}
        assert (
            _put(
                client, auth_headers, cfg, [{"from": "早餐", "to": "午餐"}]
            ).status_code
            == 200
        )
        got = client.get(
            "/admin/api/accounting/budget?month=2026-06", headers=auth_headers
        ).get_json()["budget"]
        assert got == {"午餐": 1500}

    def test_from_still_in_config_rejected(self, client, auth_headers):
        r = _put(client, auth_headers, _cfg(), [{"from": "早餐", "to": "午餐"}])
        assert r.status_code == 400

    def test_to_must_exist_in_config(self, client, auth_headers):
        cfg = _cfg()
        cfg["expense"][0]["items"] = ["午餐"]
        cfg["quick"] = {"expense": [], "income": []}
        r = _put(client, auth_headers, cfg, [{"from": "早餐", "to": "不存在"}])
        assert r.status_code == 400

    def test_rename_does_not_touch_other_users(self, client, auth_headers):
        other = _second_user_headers(client)
        _add_record(client, other, "共用舊名")
        _add_record(client, auth_headers, "共用舊名")
        cfg = _cfg()
        cfg["expense"][0]["items"] = ["共用新名", "午餐"]
        cfg["quick"] = {"expense": [], "income": []}
        _put(client, auth_headers, cfg, [{"from": "共用舊名", "to": "共用新名"}])
        other_usage = client.get(URL, headers=other).get_json()["usage"]
        assert other_usage.get("共用舊名") == 1
        assert "共用新名" not in other_usage


class TestBudgetAcceptsCustom:
    def test_budget_rejects_unknown_when_not_configured(self, client, auth_headers):
        r = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"完全沒設過的分類": 100}},
            headers=auth_headers,
        )
        assert r.status_code == 400

    def test_budget_accepts_custom_leaf(self, client, auth_headers):
        _put(client, auth_headers, _cfg())
        r = client.post(
            "/admin/api/accounting/budget",
            json={"budget": {"飼料": 800}},
            headers=auth_headers,
        )
        assert r.status_code == 200
