/**
 * photos.js — 記帳記錄照片：上傳前壓縮、上傳/刪除、取得需認證的照片 blob URL。
 *
 * 壓縮在前端做（canvas 長邊縮到 1600px、JPEG 品質 0.8），後端只信任大小上限
 * 當安全網、不做伺服器端縮圖——避免多一個處理相依套件。
 *
 * 取得照片本體一律要帶 Authorization header，<img src> 辦不到，所以用
 * fetch() 拿 blob 後自己 createObjectURL（跟 settings.js 匯出下載同一套模式）。
 */
import { apiCall } from './api.js';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

function renameToJpg(name) {
  const base = (name || 'photo').replace(/\.[^./\\]+$/, '');
  return `${base}.jpg`;
}

/** Canvas 壓縮單張圖片；非圖片檔或壓縮過程失敗則原樣回傳，不擋上傳。 */
export async function compressImage(file) {
  if (!file.type || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    // 壓縮後檔案反而更大（極簡圖片、已高度壓縮過的原圖等）就用原檔
    if (blob.size >= file.size) return file;
    return new File([blob], renameToJpg(file.name), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** 上傳一或多張照片到指定記錄。files 為呼叫端已 compressImage() 過的 File[]。 */
export async function uploadPhotos(recordId, files) {
  const form = new FormData();
  files.forEach((f) => form.append('photos', f));
  const res = await apiCall(`/admin/api/accounting/records/${recordId}/photos`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `上傳照片失敗 (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data.photos;
}

/** 刪除指定記錄底下的一張照片。 */
export async function deletePhoto(recordId, photoId) {
  const res = await apiCall(`/admin/api/accounting/records/${recordId}/photos/${photoId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `刪除照片失敗 (${res.status})`);
  }
}

/** 取得照片 blob URL；呼叫端用完（如覆蓋層關閉時）須自行 URL.revokeObjectURL()。 */
export async function fetchPhotoUrl(recordId, photoId) {
  const res = await apiCall(`/admin/api/accounting/records/${recordId}/photos/${photoId}`);
  if (!res.ok) throw new Error(`取得照片失敗 (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** 跨記錄的照片瀏覽清單（分頁，新到舊）。 */
export async function fetchPhotoGallery(page = 1, limit = 30) {
  const res = await apiCall(`/admin/api/accounting/photos?page=${page}&limit=${limit}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `取得照片清單失敗 (${res.status})`);
  return data;
}
