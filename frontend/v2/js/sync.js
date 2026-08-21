/**
 * sync.js — 離線寫入佇列的回連同步器（Phase 2）。
 *
 * 線上時把 outbox 依 FIFO 逐筆送後端。逐筆失敗處理：
 *  - 2xx（含後端 client_id 冪等命中）→ 移出 outbox（成功）
 *  - 401 → 停止整批、保留佇列（apiCall 已清憑證並觸發重登）
 *  - 4xx（如 409/422 業務規則）→ 標記 status:error「需處理」、不丟棄，續處理下一筆
 *  - 5xx / 網路中斷 → 保留 pending、停批，稍後（下次 online）再重試
 * 同步成功會 emit records:changed 讓清單重抓，樂觀記錄無縫換成 server 記錄。
 *
 * kind === 'upload-photo'（離線相片佇列）用 FormData 送出，跟一般 JSON 寫入
 * （create-record 等）走不同 body 組裝方式，但成功/失敗分類與移出佇列的邏輯
 * 完全共用——只有「怎麼組這次請求」不同，其餘一視同仁。只支援「附加到已存在
 * 記錄」的照片（record_id 為真正 server id，不支援連同離線建立的記錄一起排隊，
 * 那需要額外的 client_id → record_id 對帳，目前範圍不含）。
 */

import { apiCall } from './api.js';
import { listOutbox, updateOutbox, removeOutbox, isOnline } from './offline.js';
import { emit } from './store.js';

let flushing = false;

/**
 * 純函式：依同步結果決定動作，方便單元測試。
 * @param {{res?: Response, err?: Error}} outcome
 * @returns {'synced'|'needs-attention'|'stop-auth'|'stop-retry'|'error'}
 */
export function classifySyncOutcome({ res, err }) {
  if (err) {
    if (err.authExpired) return 'stop-auth';
    if (err.offline) return 'stop-retry';
    return 'error';
  }
  if (res.ok) return 'synced';
  if (res.status === 401) return 'stop-auth';
  if (res.status >= 400 && res.status < 500) return 'needs-attention';
  return 'stop-retry';
}

/** 目前 outbox 待處理筆數（pending，不含已標記需處理的 error）。 */
export async function pendingCount() {
  const entries = await listOutbox();
  return entries.filter((e) => e.status !== 'error').length;
}

/** 把 outbox 依 FIFO 逐筆送後端。離線或已在同步中則直接返回。 */
export async function flushOutbox() {
  if (flushing || !isOnline()) return;
  const entries = await listOutbox();
  if (!entries.length) return;

  flushing = true;
  emit('sync:start');
  let synced = 0;
  let failed = 0;
  try {
    for (const e of entries) {
      // 已標記「需處理」的項目略過（等使用者處理），但仍計入 failed 呈現
      if (e.status === 'error') {
        failed++;
        continue;
      }
      let res = null;
      let err = null;
      try {
        if (e.kind === 'upload-photo') {
          const form = new FormData();
          form.append('photos', e.file, e.fileName || 'photo.jpg');
          res = await apiCall(`/admin/api/accounting/records/${e.recordId}/photos`, {
            method: 'POST',
            body: form,
          });
        } else {
          res = await apiCall(e.endpoint, { method: e.method, body: JSON.stringify(e.payload) });
        }
      } catch (ex) {
        err = ex;
      }
      const action = classifySyncOutcome({ res, err });
      if (action === 'synced') {
        await removeOutbox(e.clientId);
        synced++;
      } else if (action === 'needs-attention') {
        let body = {};
        try { body = await res.json(); } catch { /* 忽略 */ }
        await updateOutbox(e.clientId, {
          status: 'error',
          error: { status: res.status, message: body.error || `同步失敗 (${res.status})` },
        });
        failed++;
      } else if (action === 'error') {
        await updateOutbox(e.clientId, { status: 'error', error: { message: err && err.message } });
        failed++;
      } else {
        // stop-auth / stop-retry：停止整批，保留佇列
        break;
      }
    }
  } finally {
    flushing = false;
    emit('outbox:changed');
    emit('sync:done', { synced, failed });
    // 有成功同步 → 讓清單重抓，樂觀記錄換成 server 記錄
    if (synced > 0) emit('records:changed');
  }
}
