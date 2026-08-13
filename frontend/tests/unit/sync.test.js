/**
 * sync.test.js — classifySyncOutcome 純函式單元測試（node:test）。
 * 守住離線佇列同步的逐筆失敗政策：2xx 成功 / 401 停批 / 4xx 需處理 / 5xx 重試 / 網路重試。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySyncOutcome } from '../../v2/js/sync.js';

const errWith = (props) => Object.assign(new Error('x'), props);

test('2xx → synced', () => {
  assert.equal(classifySyncOutcome({ res: { ok: true, status: 201 } }), 'synced');
  assert.equal(classifySyncOutcome({ res: { ok: true, status: 200 } }), 'synced');
});

test('401（res 或 authExpired err）→ stop-auth', () => {
  assert.equal(classifySyncOutcome({ res: { ok: false, status: 401 } }), 'stop-auth');
  assert.equal(classifySyncOutcome({ err: errWith({ authExpired: true }) }), 'stop-auth');
});

test('網路錯誤（offline err）→ stop-retry', () => {
  assert.equal(classifySyncOutcome({ err: errWith({ offline: true }) }), 'stop-retry');
});

test('4xx（409/422/400）→ needs-attention', () => {
  assert.equal(classifySyncOutcome({ res: { ok: false, status: 409 } }), 'needs-attention');
  assert.equal(classifySyncOutcome({ res: { ok: false, status: 422 } }), 'needs-attention');
  assert.equal(classifySyncOutcome({ res: { ok: false, status: 400 } }), 'needs-attention');
});

test('5xx → stop-retry', () => {
  assert.equal(classifySyncOutcome({ res: { ok: false, status: 500 } }), 'stop-retry');
  assert.equal(classifySyncOutcome({ res: { ok: false, status: 503 } }), 'stop-retry');
});

test('非預期錯誤（無 flag）→ error（標記需處理）', () => {
  assert.equal(classifySyncOutcome({ err: new Error('boom') }), 'error');
});
