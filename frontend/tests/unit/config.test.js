/**
 * config.test.js — resolveBackendUrl 純函式單元測試（node:test，無需瀏覽器）。
 * 守住「前端後端 URL 推導」這條關鍵邏輯：改 config.js 若打壞規則，CI 會擋下。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackendUrl, storagePrefix } from '../../v2/js/config.js';

test('本機開發 → localhost:5001', () => {
  assert.equal(resolveBackendUrl('localhost'), 'http://localhost:5001');
  assert.equal(resolveBackendUrl('127.0.0.1'), 'http://localhost:5001');
});

test('Tailscale/反向代理同源，根路徑 → 空字串（正式，/api）', () => {
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net'), '');            // pathname 預設 '/'
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/'), '');
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/v2/'), '');
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/index.html'), '');
});

test('Tailscale/反向代理同源，/test/ 路徑 → "/test"（測試，/test/api）', () => {
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/test/'), '/test');
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/test/v2/'), '/test');
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/test/v2/index.html'), '/test');
  // 邊界：/testing/ 不應被誤判為 /test/ 前綴
  assert.equal(resolveBackendUrl('ubuntu-server.tail886591.ts.net', '/testing/'), '');
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

test('未知網域 → 預設 localhost:5001', () => {
  assert.equal(resolveBackendUrl('example.com'), 'http://localhost:5001');
});

test('storagePrefix：正式(根/含/v2/) → ""，測試(/test/) → "test:"', () => {
  assert.equal(storagePrefix('/'), '');
  assert.equal(storagePrefix('/index.html'), '');
  assert.equal(storagePrefix('/v2/'), '');
  assert.equal(storagePrefix('/test/'), 'test:');
  assert.equal(storagePrefix('/test/v2/'), 'test:');
  assert.equal(storagePrefix('/test/index.html'), 'test:');
  assert.equal(storagePrefix('/testing/'), '');   // 邊界：不誤判
  assert.equal(storagePrefix(), '');               // 預設
});

// ── 自訂分類（applyCategoryConfig 等）──
import {
  CATEGORY_TREE, QUICK_LEAVES, applyCategoryConfig, getCategoryConfig,
  categoryMeta, customBudgetLeaves, PALETTES, ICON_CHOICES,
} from '../../v2/js/config.js';

const CUSTOM = {
  expense: [
    { group: '飲食', icon: 'ti-coffee', color: '#112233', items: ['早餐', '手搖'] },
    { group: '寵物', icon: 'ti-paw', color: '#445566', items: ['飼料'] },
  ],
  income: [{ group: '收入', icon: 'ti-cash', color: '#3f8f66', items: ['薪資'] }],
  leaf_colors: { 手搖: '#abcdef' },
  quick: { expense: ['手搖'], income: ['薪資'] },
};

test('applyCategoryConfig 原地更新，物件參考不變', () => {
  const treeRef = CATEGORY_TREE;
  const quickRef = QUICK_LEAVES;
  applyCategoryConfig(CUSTOM);
  assert.equal(CATEGORY_TREE, treeRef);
  assert.equal(QUICK_LEAVES, quickRef);
  assert.deepEqual(CATEGORY_TREE.expense.map((g) => g.group), ['飲食', '寵物']);
  assert.deepEqual(QUICK_LEAVES.expense, ['手搖']);
  applyCategoryConfig(null);
});

test('categoryMeta：細項個別顏色優先，沒設就沿用大類', () => {
  applyCategoryConfig(CUSTOM);
  assert.equal(categoryMeta('手搖').color, '#abcdef');
  assert.equal(categoryMeta('早餐').color, '#112233');
  assert.equal(categoryMeta('飼料').icon, 'ti-paw');
  // 系統自動分類不受自訂影響
  assert.equal(categoryMeta('債務收回').type, 'income');
  applyCategoryConfig(null);
});

test('applyCategoryConfig(null) 還原內建預設', () => {
  const before = JSON.stringify(CATEGORY_TREE);
  applyCategoryConfig(CUSTOM);
  assert.notEqual(JSON.stringify(CATEGORY_TREE), before);
  applyCategoryConfig(null);
  assert.equal(JSON.stringify(CATEGORY_TREE), before);
  assert.equal(categoryMeta('飼料').group, '其他'); // 回到未知分類 fallback
});

test('getCategoryConfig：常用細項只保留真的存在的（預設的「交通」等偽細項會被濾掉）', () => {
  applyCategoryConfig(null);
  const cfg = getCategoryConfig();
  const leaves = new Set(cfg.expense.flatMap((g) => g.items));
  assert.ok(cfg.quick.expense.length > 0);
  assert.ok(cfg.quick.expense.every((l) => leaves.has(l)));
  assert.ok(!cfg.quick.expense.includes('交通'));
});

test('getCategoryConfig 回傳深拷貝，改它不影響生效中的分類', () => {
  applyCategoryConfig(null);
  const cfg = getCategoryConfig();
  cfg.expense[0].group = '被改掉了';
  assert.notEqual(CATEGORY_TREE.expense[0].group, '被改掉了');
});

test('customBudgetLeaves：只列非內建的自訂支出細項', () => {
  applyCategoryConfig(null);
  assert.deepEqual(customBudgetLeaves(), []);
  applyCategoryConfig(CUSTOM);
  assert.deepEqual(customBudgetLeaves().sort(), ['手搖', '飼料'].sort());
  applyCategoryConfig(null);
});

test('色盤與圖示：色碼都是 #rrggbb、圖示都是 ti- 開頭', () => {
  assert.ok(PALETTES.length >= 3);
  for (const p of PALETTES) {
    assert.ok(p.colors.length >= 8);
    for (const c of p.colors) assert.match(c, /^#[0-9a-f]{6}$/);
  }
  for (const i of ICON_CHOICES) assert.match(i, /^ti-[a-z0-9-]+$/);
});
