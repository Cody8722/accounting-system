/**
 * invoice.test.js — parseInvoiceQR 純函式單元測試（node:test）。
 * 守住電子發票左側 77 碼解析與格式驗證：右側加密那組/雜訊必須被判為 null。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceQR } from '../../v2/js/invoice.js';

// 左側發票頭（77 碼）：號碼(10)+民國日期(7)+隨機(4)+銷售額(8hex)+總計(8hex)+買方(8)+賣方(8)+加密(24)
const LEFT =
  'AB12345678' + '1150701' + '1234' + '000000BE' + '000000C7' + '00000000' + '12345678' +
  'ABCDEFGHIJKLMNOPQRSTUVWX';

test('合法左側 QR → 解析出號碼/日期/金額/賣方統編', () => {
  const p = parseInvoiceQR(LEFT);
  assert.equal(LEFT.length, 77);
  assert.ok(p, '應解析成功');
  assert.equal(p.number, 'AB12345678');
  assert.equal(p.date, '2026-07-01');      // 民國 115 → 西元 2026
  assert.equal(p.randomCode, '1234');
  assert.equal(p.salesAmount, 190);        // 0x000000BE
  assert.equal(p.totalAmount, 199);        // 0x000000C7
  assert.equal(p.sellerId, '12345678');
});

test('右側加密那組（** 開頭）→ null', () => {
  assert.equal(parseInvoiceQR('**' + 'QWxhZGRpbjpvcGVuIHNlc2FtZQ=='.repeat(4)), null);
});

test('長度不足 77 → null', () => {
  assert.equal(parseInvoiceQR('AB123456781150701'), null);
  assert.equal(parseInvoiceQR(''), null);
  assert.equal(parseInvoiceQR(null), null);
});

test('長度夠但非發票格式（號碼段不符）→ null', () => {
  // 77 碼但開頭不是「2 英文+8 數字」
  assert.equal(parseInvoiceQR('HTTPS://EX.'.padEnd(77, 'X')), null);
  // 號碼對但民國日期段非 7 位數字
  assert.equal(parseInvoiceQR('AB12345678' + 'ABCDEFG' + '1234'.padEnd(60, '0')), null);
});
