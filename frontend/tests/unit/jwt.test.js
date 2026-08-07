/**
 * jwt.test.js — jwtExp / tokenLocallyValid 純函式單元測試（node:test）。
 * 守住「離線信任本地憑證」的過期判斷：改壞會誤放過期 token 進場，CI 會擋下。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtExp, tokenLocallyValid } from '../../v2/js/jwt.js';

/** 組出可解的 JWT（header.payload.sig；只解 payload，不驗簽章） */
function makeToken(payloadObj) {
  const b64url = (o) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payloadObj)}.sig`;
}

const NOW = 1_700_000_000_000; // 固定 nowMs 供決定性測試

test('jwtExp 解出 payload 的 exp', () => {
  assert.equal(jwtExp(makeToken({ exp: 1234567890 })), 1234567890);
});

test('jwtExp 無法解析或無 exp → null', () => {
  assert.equal(jwtExp('not-a-jwt'), null);
  assert.equal(jwtExp(''), null);
  assert.equal(jwtExp(null), null);
  assert.equal(jwtExp(makeToken({ sub: 'x' })), null); // 有 payload 但無 exp
});

test('tokenLocallyValid：未過期 → true、已過期 → false', () => {
  const future = Math.floor(NOW / 1000) + 3600;
  const past = Math.floor(NOW / 1000) - 3600;
  assert.equal(tokenLocallyValid(makeToken({ exp: future }), NOW), true);
  assert.equal(tokenLocallyValid(makeToken({ exp: past }), NOW), false);
});

test('tokenLocallyValid：無 exp 的 token → 視為 valid（交給線上驗證）', () => {
  assert.equal(tokenLocallyValid(makeToken({ sub: 'x' }), NOW), true);
});

test('tokenLocallyValid：空字串 → false', () => {
  assert.equal(tokenLocallyValid('', NOW), false);
});
