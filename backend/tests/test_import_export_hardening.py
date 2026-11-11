"""
匯入／匯出強化測試：
- 匯入後要清統計快取
- CSV／Excel 匯出不能讓備註、分類被試算表當公式執行
- 分類只收字串並存整理後的值
- 匯入筆數上限
- 記錄項目不是物件時算無效，不能整批 500
"""

import csv
from io import BytesIO, StringIO

import openpyxl
import pytest

from routes import io as io_routes

IMPORT_URL = "/admin/api/accounting/import"
EXPORT_URL = "/admin/api/accounting/export"


def _record(**overrides):
    base = {
        "type": "expense",
        "amount": 100,
        "category": "午餐",
        "date": "2026-03-01",
        "description": "hardening-test",
    }
    base.update(overrides)
    return base


def _import(client, headers, records):
    return client.post(IMPORT_URL, json={"records": records}, headers=headers)


class TestImportInvalidatesCache:
    def test_import_clears_user_stats_cache(self, client, auth_headers, monkeypatch):
        calls = []
        monkeypatch.setattr(io_routes, "_cache_invalidate_user", calls.append)
        resp = _import(client, auth_headers, [_record(description="cache-1")])
        assert resp.status_code == 200
        assert resp.get_json()["imported"] == 1
        assert len(calls) == 1


class TestImportCategoryValidation:
    @pytest.mark.parametrize("bad", [123, {"a": 1}, ["x"], True, 1.5])
    def test_non_string_category_is_invalid(self, client, auth_headers, bad):
        resp = _import(client, auth_headers, [_record(category=bad)])
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["invalid"] == 1
        assert body["imported"] == 0

    def test_category_whitespace_is_trimmed_before_storing(self, client, auth_headers):
        import db

        resp = _import(
            client,
            auth_headers,
            [_record(category="  交通  ", description="trim-category-check")],
        )
        assert resp.get_json()["imported"] == 1
        stored = db.accounting_records_collection.find_one(
            {"description": "trim-category-check"}
        )
        assert stored["category"] == "交通"

    def test_trimmed_duplicate_is_detected(self, client, auth_headers):
        first = _import(
            client,
            auth_headers,
            [_record(category="交通", description="trim-dup-check")],
        )
        assert first.get_json()["imported"] == 1
        second = _import(
            client,
            auth_headers,
            [_record(category=" 交通 ", description="trim-dup-check")],
        )
        assert second.get_json()["duplicates"] == 1


class TestImportShape:
    def test_non_object_items_are_counted_invalid_not_500(self, client, auth_headers):
        records = ["oops", 5, None, ["a"], _record(description="after-garbage")]
        resp = _import(client, auth_headers, records)
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["invalid"] == 4
        assert body["imported"] == 1
        assert body["total"] == 5

    def test_too_many_records_rejected(self, client, auth_headers):
        records = [_record()] * (io_routes.MAX_IMPORT_RECORDS + 1)
        resp = _import(client, auth_headers, records)
        assert resp.status_code == 400
        assert "筆" in resp.get_json()["error"]

    def test_exactly_max_records_accepted(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr(io_routes, "MAX_IMPORT_RECORDS", 3)
        resp = _import(
            client,
            auth_headers,
            [_record(description=f"max-ok-{i}") for i in range(3)],
        )
        assert resp.status_code == 200
        assert resp.get_json()["imported"] == 3


class TestExportFormulaNeutralization:
    EVIL = ["=1+1", "+cmd|' /C calc'!A0", "-2+3", "@SUM(1,1)", "\t=1", "\r=1"]

    def test_helper_prefixes_dangerous_strings_only(self):
        f = io_routes.neutralize_formula
        for evil in self.EVIL:
            assert f(evil) == "'" + evil
        assert f("午餐 -100") == "午餐 -100"
        assert f("normal") == "normal"
        assert f("") == ""
        assert f(12.5) == 12.5
        assert f(None) is None

    def test_csv_export_neutralizes_description_and_category(
        self, client, auth_headers
    ):
        _import(
            client,
            auth_headers,
            [_record(category="=evil-cat", description='=HYPERLINK("x")')],
        )
        resp = client.get(EXPORT_URL + "?format=csv", headers=auth_headers)
        assert resp.status_code == 200
        text = resp.data.decode("utf-8-sig")
        rows = list(csv.reader(StringIO(text)))
        body = [r for r in rows[1:] if "evil-cat" in r[2]]
        assert body, "找不到匯入的測試記錄"
        for row in body:
            assert row[2] == "'=evil-cat"
            assert row[4].startswith("'=")
            # 金額仍是數字，不被加前綴
            assert row[3].replace(".", "", 1).isdigit()

    def test_xlsx_export_keeps_formula_strings_as_text(self, client, auth_headers):
        _import(
            client,
            auth_headers,
            [_record(category="=xlsx-cat", description="=1+1")],
        )
        resp = client.get(EXPORT_URL + "?format=xlsx", headers=auth_headers)
        assert resp.status_code == 200
        ws = openpyxl.load_workbook(BytesIO(resp.data)).active
        hits = [row for row in ws.iter_rows(min_row=2) if row[2].value == "=xlsx-cat"]
        assert hits, "找不到匯入的測試記錄"
        for row in hits:
            assert row[2].data_type == "s"
            assert row[4].data_type == "s"
            assert row[4].value == "=1+1"
            assert isinstance(row[3].value, (int, float))

    def test_json_backup_is_not_modified(self, client, auth_headers):
        _import(client, auth_headers, [_record(description="=raw-json")])
        resp = client.get(EXPORT_URL + "?format=json", headers=auth_headers)
        descs = [r["description"] for r in resp.get_json()["records"]]
        assert "=raw-json" in descs
