/**
 * store.js — 極簡共用狀態 + 事件匯流排。
 * 螢幕模組讀 state、訂閱事件；新增/編輯/刪除後 emit('records:changed')。
 */

export const state = {
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // 當前檢視月份（該月 1 號）
  view: 'ledger', // ledger | stats | budget | settings
};

const bus = new Map();

export function on(event, fn) {
  if (!bus.has(event)) bus.set(event, new Set());
  bus.get(event).add(fn);
  return () => bus.get(event).delete(fn);
}

export function emit(event, payload) {
  (bus.get(event) || []).forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(`[store] listener error on ${event}`, e); }
  });
}

/** 當前檢視月份的起訖（YYYY-MM-DD） */
export function monthRange(d = state.month) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end), label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` };
}

export function shiftMonth(delta) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
  emit('month:changed', state.month);
}
