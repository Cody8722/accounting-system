/**
 * jwt.js — 純函式：解碼 JWT 的 exp、判斷本地 token 是否未過期。
 * 供「離線信任本地憑證」用；不依賴任何瀏覽器 API，可獨立單元測試。
 */

/** 解碼 JWT payload 的 exp（Unix 秒）；無法解析或無 exp 時回 null。 */
export function jwtExp(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + (b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '');
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');
    const obj = JSON.parse(json);
    return typeof obj.exp === 'number' ? obj.exp : null;
  } catch {
    return null;
  }
}

/**
 * 本地判斷 token 是否仍有效（未過期）。
 * 無 exp 資訊時：有 token 即視為 valid（是否真有效交給線上驗證）。
 * @param {string} token
 * @param {number} nowMs 目前時間（毫秒），預設 Date.now()，可注入以利測試
 */
export function tokenLocallyValid(token, nowMs = Date.now()) {
  const exp = jwtExp(token);
  if (exp === null) return !!token;
  return exp * 1000 > nowMs;
}
