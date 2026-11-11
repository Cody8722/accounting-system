/**
 * utils.test.js — escapeHtml 單元測試（node:test）。
 * escapeHtml 同時用在元素內容與屬性值（value="${escapeHtml(x)}"），
 * 守住「連引號都要跳脫」：改壞會讓使用者資料能跳出屬性、注入事件處理器。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../v2/js/utils.js';

test('escapeHtml 跳脫 & < >', () => {
  assert.equal(escapeHtml('a & b <c>'), 'a &amp; b &lt;c&gt;');
});

test('escapeHtml 跳脫雙引號與單引號（屬性值情境）', () => {
  assert.equal(escapeHtml(`"x'`), '&quot;x&#39;');
});

test('escapeHtml 讓屬性注入失效：輸出不含裸引號', () => {
  const evil = '" autofocus onfocus="alert(1)';
  const out = escapeHtml(evil);
  assert.ok(!out.includes('"'));
  // 放進屬性後整段仍只有開頭與結尾兩個引號
  assert.equal(`<input value="${out}">`.match(/"/g).length, 2);
});

test('escapeHtml 先處理 &，不會把已跳脫的結果再破壞', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('escapeHtml 對 null / undefined 回傳空字串，數字轉字串', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

test('escapeHtml 保留中文與一般文字不變', () => {
  assert.equal(escapeHtml('午餐 NT$100'), '午餐 NT$100');
});
