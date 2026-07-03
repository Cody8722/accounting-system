/**
 * config.test.js — resolveBackendUrl 純函式單元測試（node:test，無需瀏覽器）。
 * 守住「前端後端 URL 推導」這條關鍵邏輯：改 config.js 若打壞規則，CI 會擋下。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackendUrl } from '../../v2/js/config.js';

test('本機開發 → localhost:5001', () => {
  assert.equal(resolveBackendUrl('localhost'), 'http://localhost:5001');
  assert.equal(resolveBackendUrl('127.0.0.1'), 'http://localhost:5001');
});

test('Tailscale/反向代理同源 → 空字串（相對路徑）', () => {
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net'), '');
  assert.equal(resolveBackendUrl('anything.tailABC.ts.net'), '');
});

test('區域網路 IP → http://<同IP>:5001', () => {
  assert.equal(resolveBackendUrl('192.168.113.103'), 'http://192.168.113.103:5001');
  assert.equal(resolveBackendUrl('10.0.0.5'), 'http://10.0.0.5:5001');
  assert.equal(resolveBackendUrl('172.16.0.1'), 'http://172.16.0.1:5001');
  assert.equal(resolveBackendUrl('172.31.255.254'), 'http://172.31.255.254:5001');
});

test('172 的非私有段落不套 LAN 規則（落到預設）', () => {
  // 172.15 與 172.32 不在私有範圍
  assert.equal(resolveBackendUrl('172.15.0.1'), 'http://localhost:5001');
  assert.equal(resolveBackendUrl('172.32.0.1'), 'http://localhost:5001');
});

test('Zeabur 正式與通用備援', () => {
  assert.equal(resolveBackendUrl('accounting-system.zeabur.app'), 'https://accounting-system-ghth.zeabur.app');
  assert.equal(resolveBackendUrl('myapp-frontend.zeabur.app'), 'https://myapp-backend.zeabur.app');
});

test('未知網域 → 預設 localhost:5001', () => {
  assert.equal(resolveBackendUrl('example.com'), 'http://localhost:5001');
});
