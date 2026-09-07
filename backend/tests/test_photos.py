"""
記帳記錄照片端點測試 (test_photos.py)

覆蓋 routes/photos.py：上傳（含檔案簽章驗證、大小上限、張數上限）、刪除
（DB 參照 + 磁碟檔案都要清乾淨）、取得照片本體（require_auth、跨使用者
隔離）、跨記錄照片瀏覽清單（分頁、依上傳時間新到舊排序）。

PHOTO_STORAGE_PATH 指到測試專用的臨時目錄（tempfile.mkdtemp()），
每個測試 session 結束後由作業系統自然回收，不寫進真正的 NAS 路徑。
"""

import os
import sys
import tempfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

import pytest
from bson import ObjectId

import db

os.environ["TESTING"] = "true"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-for-testing-only"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
import auth as auth_module
import routes.photos as photos_module

# conftest.py 在 collection 階段就已經 import 過 main（連帶 import routes.photos），
# 那時 PHOTO_STORAGE_PATH 這個模組常數已經用預設值定案；此時再設 os.environ 不會
# 讓已經 import 過的模組重新讀取。直接覆寫模組常數，讓這個檔案的測試寫進獨立的
# 臨時目錄，不要真的寫進 repo 裡的 backend/photo_storage。
photos_module.PHOTO_STORAGE_PATH = Path(
    tempfile.mkdtemp(prefix="accounting-photos-test-")
)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    app.url_map.strict_slashes = False
    with app.test_client() as c:
        yield c


@pytest.fixture
def auth_headers():
    # 每個測試都用全新的 user_id：mongomock 在整個 pytest session 內是同一份
    # in-memory store，用固定 user_id 的話，跨記錄的照片瀏覽清單（依 user_id
    # 聚合）會被其他測試留下的資料污染，導致分頁/計數斷言失準。
    user_id = str(ObjectId())
    token = auth_module.generate_jwt(
        user_id, f"photos_test_{user_id}@example.com", "Photos Test User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    user_id = str(ObjectId())
    token = auth_module.generate_jwt(
        user_id, f"photos_other_{user_id}@example.com", "Other User"
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def record_id(client, auth_headers):
    r = client.post(
        "/admin/api/accounting/records",
        json={
            "type": "expense",
            "amount": 100,
            "category": "測試",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "confirm_withdrawal": True,
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.get_json()
    return r.get_json()["id"]


# 最小可通過簽章檢查的假圖片內容（不是真的可解碼圖片，但 photos.py 不做
# 伺服器端解碼，只比對開頭 magic bytes，這樣就夠測邏輯了）
JPEG_BYTES = b"\xff\xd8\xff" + b"\x00" * 32
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
WEBP_BYTES = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32


def _upload(client, headers, record_id, files):
    """files: [(bytes, filename, content_type), ...]"""
    data = {"photos": [(BytesIO(b), fn, ct) for b, fn, ct in files]}
    return client.post(
        f"/admin/api/accounting/records/{record_id}/photos",
        data=data,
        headers=headers,
        content_type="multipart/form-data",
    )


@pytest.mark.integration
class TestUploadPhotos:
    def test_upload_single_jpeg(self, client, auth_headers, record_id):
        r = _upload(
            client, auth_headers, record_id, [(JPEG_BYTES, "receipt.jpg", "image/jpeg")]
        )
        assert r.status_code == 201, r.get_json()
        photos = r.get_json()["photos"]
        assert len(photos) == 1
        assert photos[0]["content_type"] == "image/jpeg"
        assert photos[0]["size_bytes"] == len(JPEG_BYTES)
        assert photos[0]["original_filename"] == "receipt.jpg"

        # 記錄本身的 photos 陣列也要有這筆
        rec = client.get(
            f"/admin/api/accounting/records/{record_id}", headers=auth_headers
        ).get_json()
        assert len(rec["photos"]) == 1
        assert rec["photos"][0]["id"] == photos[0]["id"]

    def test_upload_multiple_files_one_request(self, client, auth_headers, record_id):
        r = _upload(
            client,
            auth_headers,
            record_id,
            [
                (JPEG_BYTES, "a.jpg", "image/jpeg"),
                (PNG_BYTES, "b.png", "image/png"),
                (WEBP_BYTES, "c.webp", "image/webp"),
            ],
        )
        assert r.status_code == 201
        assert len(r.get_json()["photos"]) == 3

    def test_upload_rejects_disguised_file(self, client, auth_headers, record_id):
        """Content-Type 宣稱是 jpeg，但實際內容不是 —— 簽章比對要擋下來"""
        r = _upload(
            client,
            auth_headers,
            record_id,
            [(b"not really a jpeg", "fake.jpg", "image/jpeg")],
        )
        assert r.status_code == 400

    def test_upload_rejects_unsupported_type(self, client, auth_headers, record_id):
        r = _upload(
            client,
            auth_headers,
            record_id,
            [(b"%PDF-1.4 fake pdf content", "doc.pdf", "application/pdf")],
        )
        assert r.status_code == 400

    def test_upload_rejects_oversized_file(self, client, auth_headers, record_id):
        oversized = b"\xff\xd8\xff" + b"\x00" * (10 * 1024 * 1024 + 1)
        r = _upload(
            client, auth_headers, record_id, [(oversized, "big.jpg", "image/jpeg")]
        )
        assert r.status_code == 400

    def test_upload_rejects_over_max_photos_per_record(
        self, client, auth_headers, record_id
    ):
        files = [(JPEG_BYTES, f"{i}.jpg", "image/jpeg") for i in range(21)]
        r = _upload(client, auth_headers, record_id, files)
        assert r.status_code == 400

    def test_upload_no_files_rejected(self, client, auth_headers, record_id):
        r = client.post(
            f"/admin/api/accounting/records/{record_id}/photos",
            data={},
            headers=auth_headers,
            content_type="multipart/form-data",
        )
        assert r.status_code == 400

    def test_upload_to_nonexistent_record_404(self, client, auth_headers):
        r = _upload(
            client,
            auth_headers,
            "000000000000000000000000",
            [(JPEG_BYTES, "a.jpg", "image/jpeg")],
        )
        assert r.status_code == 404

    def test_upload_invalid_record_id_404(self, client, auth_headers):
        r = _upload(
            client, auth_headers, "not-an-id", [(JPEG_BYTES, "a.jpg", "image/jpeg")]
        )
        assert r.status_code == 404

    def test_other_user_cannot_upload_to_records_theyre_not_owner_of(
        self, client, other_auth_headers, record_id
    ):
        r = _upload(
            client,
            other_auth_headers,
            record_id,
            [(JPEG_BYTES, "a.jpg", "image/jpeg")],
        )
        assert r.status_code == 404


@pytest.mark.integration
class TestDeletePhoto:
    def _upload_one(self, client, auth_headers, record_id):
        r = _upload(
            client, auth_headers, record_id, [(JPEG_BYTES, "receipt.jpg", "image/jpeg")]
        )
        return r.get_json()["photos"][0]["id"]

    def test_delete_removes_from_record_and_disk(self, client, auth_headers, record_id):
        photo_id = self._upload_one(client, auth_headers, record_id)

        r = client.delete(
            f"/admin/api/accounting/records/{record_id}/photos/{photo_id}",
            headers=auth_headers,
        )
        assert r.status_code == 200

        rec = client.get(
            f"/admin/api/accounting/records/{record_id}", headers=auth_headers
        ).get_json()
        assert rec["photos"] == []

        # 刪掉之後再取得應該 404（磁碟檔案跟 DB 參照都清掉了）
        get_r = client.get(
            f"/admin/api/accounting/records/{record_id}/photos/{photo_id}",
            headers=auth_headers,
        )
        assert get_r.status_code == 404

    def test_delete_nonexistent_photo_404(self, client, auth_headers, record_id):
        r = client.delete(
            f"/admin/api/accounting/records/{record_id}/photos/000000000000000000000000",
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_other_user_cannot_delete(
        self, client, auth_headers, other_auth_headers, record_id
    ):
        photo_id = self._upload_one(client, auth_headers, record_id)
        r = client.delete(
            f"/admin/api/accounting/records/{record_id}/photos/{photo_id}",
            headers=other_auth_headers,
        )
        assert r.status_code == 404
        # 原使用者仍然拿得到（確認沒有真的被刪掉）
        get_r = client.get(
            f"/admin/api/accounting/records/{record_id}/photos/{photo_id}",
            headers=auth_headers,
        )
        assert get_r.status_code == 200


@pytest.mark.integration
class TestGetPhoto:
    def test_get_returns_correct_bytes_and_content_type(
        self, client, auth_headers, record_id
    ):
        upload_r = _upload(
            client, auth_headers, record_id, [(PNG_BYTES, "a.png", "image/png")]
        )
        photo_id = upload_r.get_json()["photos"][0]["id"]

        r = client.get(
            f"/admin/api/accounting/records/{record_id}/photos/{photo_id}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.content_type == "image/png"
        assert r.data == PNG_BYTES

    def test_get_requires_auth(self, client, record_id):
        r = client.get(
            f"/admin/api/accounting/records/{record_id}/photos/000000000000000000000000"
        )
        assert r.status_code == 401

    def test_other_user_cannot_view(
        self, client, auth_headers, other_auth_headers, record_id
    ):
        upload_r = _upload(
            client, auth_headers, record_id, [(JPEG_BYTES, "a.jpg", "image/jpeg")]
        )
        photo_id = upload_r.get_json()["photos"][0]["id"]
        r = client.get(
            f"/admin/api/accounting/records/{record_id}/photos/{photo_id}",
            headers=other_auth_headers,
        )
        assert r.status_code == 404


@pytest.mark.integration
class TestGalleryListing:
    def test_lists_photos_across_records_with_record_id_for_jump(
        self, client, auth_headers
    ):
        # 兩筆不同記錄，各上傳一張照片
        r1 = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 50,
                "category": "測試",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "confirm_withdrawal": True,
            },
            headers=auth_headers,
        )
        r2 = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 60,
                "category": "測試",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "confirm_withdrawal": True,
            },
            headers=auth_headers,
        )
        assert r1.status_code == 201, r1.get_json()
        assert r2.status_code == 201, r2.get_json()
        rec1, rec2 = r1.get_json()["id"], r2.get_json()["id"]
        _upload(client, auth_headers, rec1, [(JPEG_BYTES, "a.jpg", "image/jpeg")])
        _upload(client, auth_headers, rec2, [(PNG_BYTES, "b.png", "image/png")])

        r = client.get("/admin/api/accounting/photos", headers=auth_headers)
        assert r.status_code == 200
        body = r.get_json()
        record_ids_in_gallery = {item["record_id"] for item in body["items"]}
        assert rec1 in record_ids_in_gallery
        assert rec2 in record_ids_in_gallery
        assert body["total"] >= 2

    def test_empty_gallery_when_no_photos(self, client, auth_headers):
        r = client.get("/admin/api/accounting/photos", headers=auth_headers)
        assert r.status_code == 200
        assert r.get_json()["items"] == []
        assert r.get_json()["total"] == 0

    def test_pagination(self, client, auth_headers, record_id):
        _upload(
            client,
            auth_headers,
            record_id,
            [(JPEG_BYTES, f"{i}.jpg", "image/jpeg") for i in range(5)],
        )
        r = client.get(
            "/admin/api/accounting/photos?page=1&limit=2", headers=auth_headers
        )
        body = r.get_json()
        assert len(body["items"]) == 2
        assert body["total"] == 5
        assert body["total_pages"] == 3


@pytest.mark.integration
class TestRecordCreationIncludesPhotosField:
    """新建的記錄（不只是遷移過的舊資料）也要一律有 photos: []，
    這是所有記錄插入點都要遵守的規則，不是只有這個功能本身要處理。"""

    def test_new_expense_record_has_empty_photos(self, client, auth_headers):
        r = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 10,
                "category": "測試",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "confirm_withdrawal": True,
            },
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()
        rec = client.get(
            f"/admin/api/accounting/records/{r.get_json()['id']}", headers=auth_headers
        ).get_json()
        assert rec["photos"] == []

    def test_manual_transfer_record_has_empty_photos(self, client, auth_headers):
        wallet_r = client.post(
            "/admin/api/wallets", json={"name": "照片測試錢包"}, headers=auth_headers
        )
        wallet_id = wallet_r.get_json()["id"]
        r = client.post(
            "/admin/api/accounting/records/transfer",
            json={
                "wallet_id": wallet_id,
                "from_location": "bank",
                "to_location": "cash",
                "amount": 100,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "confirm_negative": True,
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        rec = client.get(
            f"/admin/api/accounting/records/{r.get_json()['id']}", headers=auth_headers
        ).get_json()
        assert rec["photos"] == []


@pytest.mark.integration
class TestDeleteRecordCleansUpPhotos:
    """刪除整筆記錄時，該記錄附加的照片檔案要跟著從磁碟清掉，不能只刪 DB
    參照、留下永遠不會再被存取到的孤兒檔案。"""

    def test_delete_record_removes_photo_files_from_disk(
        self, client, auth_headers, record_id
    ):
        upload_r = _upload(
            client, auth_headers, record_id, [(JPEG_BYTES, "a.jpg", "image/jpeg")]
        )
        assert upload_r.status_code == 201, upload_r.get_json()
        photo = upload_r.get_json()["photos"][0]
        rec = db.accounting_records_collection.find_one({"_id": ObjectId(record_id)})
        photo_path = (
            photos_module.PHOTO_STORAGE_PATH
            / str(rec["user_id"])
            / record_id
            / photo["filename"]
        )
        assert photo_path.is_file()

        del_r = client.delete(
            f"/admin/api/accounting/records/{record_id}", headers=auth_headers
        )
        assert del_r.status_code == 200

        assert not photo_path.is_file()
        # 記錄目錄應該一併被清掉（已空），不留下永遠不會再用到的空目錄
        assert not photo_path.parent.is_dir()
        # 照片端點也拿不到了（record 本身已經不存在）
        get_r = client.get(
            f"/admin/api/accounting/records/{record_id}/photos/{photo['id']}",
            headers=auth_headers,
        )
        assert get_r.status_code == 404

    def test_delete_expense_with_auto_withdrawal_cleans_up_transfer_photos(
        self, client, auth_headers
    ):
        """支出現金不足觸發自動提領時連帶產生的轉帳記錄，理論上也可能被附加
        照片（後端沒有限制照片只能掛在 income/expense，即使目前前端 UI 不會
        這樣做）；刪除主記錄、連動刪除轉帳記錄時，轉帳記錄的照片也要一併清掉。
        """
        r = client.post(
            "/admin/api/accounting/records",
            json={
                "type": "expense",
                "amount": 100,
                "category": "測試",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "confirm_withdrawal": True,
            },
            headers=auth_headers,
        )
        assert r.status_code == 201, r.get_json()
        primary_id = r.get_json()["id"]
        primary = db.accounting_records_collection.find_one(
            {"_id": ObjectId(primary_id)}
        )
        transfer_id = str(primary["source_transfer_id"])
        assert transfer_id

        upload_r = _upload(
            client, auth_headers, transfer_id, [(PNG_BYTES, "t.png", "image/png")]
        )
        assert upload_r.status_code == 201, upload_r.get_json()
        photo = upload_r.get_json()["photos"][0]
        transfer_doc = db.accounting_records_collection.find_one(
            {"_id": ObjectId(transfer_id)}
        )
        photo_path = (
            photos_module.PHOTO_STORAGE_PATH
            / str(transfer_doc["user_id"])
            / transfer_id
            / photo["filename"]
        )
        assert photo_path.is_file()

        del_r = client.delete(
            f"/admin/api/accounting/records/{primary_id}", headers=auth_headers
        )
        assert del_r.status_code == 200
        # 轉帳記錄本身也該連動被刪了（既有行為，不是這次改動的範圍，這裡順便斷言）
        assert (
            db.accounting_records_collection.find_one({"_id": ObjectId(transfer_id)})
            is None
        )
        assert not photo_path.is_file()
