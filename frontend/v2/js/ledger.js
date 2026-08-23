/**
 * ledger.js — 帳本(手機分組列 + 結餘卡) / 明細(電腦寬表格排序篩選)。
 * 串 GET/PUT/DELETE /admin/api/accounting/records。
 */

import { apiJson, apiCall } from './api.js';
import { CATEGORY_TREE, categoryMeta } from './config.js';
import { fmtMoney, escapeHtml, showToast, showConfirm, todayStr } from './utils.js';
import { state, monthRange, shiftMonth, emit, on } from './store.js';
import { openAdd } from './add.js';
import { walletBalanceStripHtml, walletChipsHtml, walletOnlyChipsHtml, locationChipsHtml, LOCATION_META, walletMeta } from './wallet.js';
import { lockQueryParams, lockBadgeHtml, bindLockBadge, openLockPicker } from './lock.js';
import {
  pendingRecords, isOnline, updateOutbox, removeOutbox,
  enqueueOutbox, genClientId, queuedPhotoStats, MAX_QUEUED_PHOTOS, MAX_QUEUED_PHOTO_BYTES,
} from './offline.js';
import { compressImage, uploadPhotos, deletePhoto, fetchPhotoUrl } from './photos.js';

let cache = [];              // 當月記錄
let table = { type: 'all', category: '', query: '', sortBy: 'date', sortOrder: 'desc' };

async function load() {
  const { start, end } = monthRange();
  let server = [];
  try {
    const data = await apiJson(`/admin/api/accounting/records?page=1&limit=200&start_date=${start}&end_date=${end}&sort_by=date&sort_order=desc${lockQueryParams()}`);
    server = Array.isArray(data) ? data : (data.records || []);
  } catch (e) {
    // 離線且無快取時 apiJson 會丟 err.offline；仍要能顯示待同步項，故吞掉續行。
    // 其他錯誤照樣往上拋，讓呼叫端顯示錯誤訊息。
    if (!e.offline) throw e;
  }
  // 疊加「待同步」（離線建立、尚未同步）記錄——僅取當月，置於最前。
  // 包一層防護：待同步疊加是加值功能，不該因 IndexedDB 任何問題而拖垮明細渲染。
  let pend = [];
  try {
    pend = (await pendingRecords()).filter((r) => r.date >= start && r.date <= end);
  } catch {
    pend = [];
  }
  cache = [...pend, ...server];
  return cache;
}

function totals(list) {
  // 內部轉移（type=transfer）不計入收支統計，兩者皆不加總
  let income = 0, expense = 0;
  for (const r of list) {
    if (r.type === 'income') income += r.amount;
    else if (r.type === 'expense') expense += r.amount;
  }
  return { income, expense, balance: income - expense };
}
const rid = (r) => (r._id && r._id.$oid) ? r._id.$oid : r._id;

/** 待同步/需處理小標記（離線建立、尚未同步的記錄）。視覺之後可交 Design 精緻化。 */
function pendingBadge(r) {
  if (!r._pending) return '';
  const isErr = r._status === 'error';
  const color = isErr ? 'var(--expense)' : 'var(--muted2)';
  return `<span style="font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid ${color};color:${color};margin-left:6px">${isErr ? '需處理' : '待同步'}</span>`;
}

function catIconHtml(leaf, size = 38) {
  const m = categoryMeta(leaf);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg = m.color + (isDark ? '26' : '1f');
  return `<div class="cat-icon" style="width:${size}px;height:${size}px;background:${bg}"><i class="ti ${m.icon}" style="color:${m.color};font-size:${size * 0.52}px"></i></div>`;
}

function transferIconHtml(size = 38) {
  return `<div class="cat-icon" style="width:${size}px;height:${size}px;background:var(--fill)"><i class="ti ti-arrows-right-left" style="color:var(--muted2);font-size:${size * 0.5}px"></i></div>`;
}
function transferLabel(r) {
  const from = LOCATION_META[r.from_location]?.label || r.from_location;
  const to = LOCATION_META[r.to_location]?.label || r.to_location;
  return `${from} → ${to}`;
}

function restrictedIconHtml(size = 38) {
  return `<div class="cat-icon" style="width:${size}px;height:${size}px;background:var(--fill)"><i class="ti ti-lock" style="color:var(--muted2);font-size:${size * 0.48}px"></i></div>`;
}

/* ============ 手機：帳本 ============ */
export async function renderLedgerMobile(container) {
  container.innerHTML = `<div style="padding:6px 20px 0;flex-shrink:0" data-el="head"></div>
    <div class="noscroll" data-el="list" style="flex:1;overflow-y:auto;padding:18px 20px 100px"></div>`;
  const head = container.querySelector('[data-el="head"]');
  const list = container.querySelector('[data-el="list"]');
  list.innerHTML = '<div style="text-align:center;color:var(--muted2);padding:40px 0">載入中…</div>';
  let items, walletStrip;
  try {
    [items, walletStrip] = await Promise.all([load(), walletBalanceStripHtml()]);
  } catch (e) { list.innerHTML = `<div style="text-align:center;color:var(--expense);padding:40px 0">${escapeHtml(e.message)}</div>`; return; }
  const t = totals(items);
  const { label } = monthRange();
  head.innerHTML = `
    ${lockBadgeHtml()}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-weight:700;font-size:22px;color:var(--text)">帳本</span>
      <div style="display:flex;gap:8px">
        <button class="icon-btn" data-el="lock" title="鎖定篩選"><i class="ti ti-lock-open"></i></button>
        <button class="icon-btn" data-el="theme"><i class="ti ti-moon"></i></button>
      </div>
    </div>
    ${walletStrip}
    <div class="balance-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;color:rgba(255,255,255,.85)">${label} · 結餘</span>
        <div style="display:flex;gap:8px;color:rgba(255,255,255,.85)">
          <button data-el="prev" style="border:none;background:none;color:inherit;cursor:pointer"><i class="ti ti-chevron-left"></i></button>
          <button data-el="next" style="border:none;background:none;color:inherit;cursor:pointer"><i class="ti ti-chevron-right"></i></button>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:6px;margin-bottom:18px">
        <span style="font-size:15px;color:rgba(255,255,255,.85);margin-bottom:5px">NT$</span>
        <span class="balance-amt">${fmtMoney(t.balance)}</span>
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1;background:rgba(255,255,255,.08);border-radius:13px;padding:10px 13px">
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.85);margin-bottom:3px"><i class="ti ti-arrow-down-left" style="color:#C0F2DA"></i>收入</div>
          <div class="mono" style="font-size:16px;color:#C0F2DA">${fmtMoney(t.income)}</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,.08);border-radius:13px;padding:10px 13px">
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:rgba(255,255,255,.85);margin-bottom:3px"><i class="ti ti-arrow-up-right" style="color:#FBE0DD"></i>支出</div>
          <div class="mono" style="font-size:16px;color:#FBE0DD">${fmtMoney(t.expense)}</div>
        </div>
      </div>
    </div>`;
  head.querySelector('[data-el="prev"]').onclick = () => shiftMonth(-1);
  head.querySelector('[data-el="next"]').onclick = () => shiftMonth(1);
  head.querySelector('[data-el="theme"]').onclick = () => import('./theme.js').then((m) => m.cycleTheme());
  head.querySelector('[data-el="lock"]').onclick = () => openLockPicker();
  bindLockBadge(head);

  if (!items.length) { list.innerHTML = `<div style="text-align:center;color:var(--muted2);padding:50px 0"><i class="ti ti-notebook" style="font-size:40px;color:var(--faint)"></i><div style="margin-top:10px;font-size:14px">本月尚無記錄</div></div>`; return; }

  const groups = {};
  for (const r of items) (groups[r.date] = groups[r.date] || []).push(r);
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  list.innerHTML = dates.map((d) => {
    const rows = groups[d];
    // 內部轉移不計入當日收支小計
    const sum = rows.reduce((s, r) => s + (r.type === 'income' ? r.amount : r.type === 'expense' ? -r.amount : 0), 0);
    return `<div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;padding:0 2px">
        <span style="font-weight:600;font-size:13px;color:var(--text3)">${d.slice(5)}</span>
        <span class="mono" style="font-size:12px;color:var(--muted2)">${sum >= 0 ? '+' : '−'}${fmtMoney(Math.abs(sum))}</span>
      </div>
      <div class="card">${rows.map((r) => r.type === 'transfer' ? `
        <div class="list-row" data-id="${rid(r)}" style="cursor:pointer">
          ${transferIconHtml()}
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:15px;color:var(--text)">內部轉移</div>
            <div style="font-size:12px;color:var(--muted2)">${escapeHtml(r.description || transferLabel(r))}</div>
          </div>
          <span class="mono" style="font-weight:500;font-size:15px;color:var(--muted2)">${transferLabel(r)}</span>
        </div>` : r.type === 'restricted' ? `
        <div class="list-row" data-id="${rid(r)}" style="cursor:pointer">
          ${restrictedIconHtml()}
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:15px;color:var(--text)">${escapeHtml(r.description || '受限資金')}</div>
            <div style="font-size:12px;color:var(--muted2)">已鎖住，不計入可用餘額</div>
          </div>
          <span class="mono" style="font-weight:500;font-size:15px;color:var(--muted2)">${fmtMoney(r.amount)}</span>
        </div>` : `
        <div class="list-row" data-id="${rid(r)}" style="cursor:pointer">
          ${catIconHtml(r.category)}
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:15px;color:var(--text)">${escapeHtml(r.category)}${pendingBadge(r)}</div>
            <div style="font-size:12px;color:var(--muted2)">${escapeHtml(r.description || categoryMeta(r.category).group)}</div>
          </div>
          <span class="mono" style="font-weight:500;font-size:15px;color:${r.type === 'income' ? 'var(--income)' : 'var(--text)'}">${r.type === 'income' ? '+' : '−'}${fmtMoney(r.amount)}</span>
        </div>`).join('')}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-id]').forEach((row) => row.addEventListener('click', () => {
    const r = cache.find((x) => rid(x) === row.dataset.id); if (r) openEdit(r);
  }));
}

/* ============ 電腦：明細表格 ============ */
export async function renderLedgerDesktop(container) {
  container.innerHTML = `<div class="page" data-el="page"><div style="text-align:center;color:var(--muted2);padding:40px">載入中…</div></div>`;
  let items;
  try { items = await load(); } catch (e) { container.querySelector('[data-el="page"]').innerHTML = `<div style="color:var(--expense);padding:40px">${escapeHtml(e.message)}</div>`; return; }
  const { label } = monthRange();
  const page = container.querySelector('[data-el="page"]');

  const catOpts = ['', ...CATEGORY_TREE.expense.flatMap((g) => g.items), ...CATEGORY_TREE.income.flatMap((g) => g.items)];
  function filtered() {
    let list = items.filter((r) => {
      if (table.type !== 'all' && r.type !== table.type) return false;
      if (table.category && r.category !== table.category) return false;
      if (table.query) { const q = table.query.toLowerCase(); if (!(`${r.category}${r.description || ''}`.toLowerCase().includes(q))) return false; }
      return true;
    });
    list.sort((a, b) => {
      const dir = table.sortOrder === 'asc' ? 1 : -1;
      if (table.sortBy === 'amount') return (a.amount - b.amount) * dir;
      return a.date.localeCompare(b.date) * dir || (rid(a) > rid(b) ? dir : -dir);
    });
    return list;
  }

  function draw() {
    const list = filtered();
    const t = totals(list);
    const arrow = (col) => table.sortBy === col ? (table.sortOrder === 'asc' ? 'ti-chevron-up' : 'ti-chevron-down') : 'ti-selector';
    const hasFilter = table.type !== 'all' || table.category || table.query;
    page.innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px">
        <div><div class="page-title">明細</div><div class="page-sub">${label} · 共 ${list.length} 筆</div></div>
        <div style="display:flex;gap:10px;align-items:center">
          <div style="display:flex;align-items:center;gap:2px;background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:3px">
            <button class="icon-btn" data-el="prev" style="background:none"><i class="ti ti-chevron-left"></i></button>
            <span class="mono" style="min-width:64px;text-align:center;font-size:14px;color:var(--text)">${label}</span>
            <button class="icon-btn" data-el="next" style="background:none"><i class="ti ti-chevron-right"></i></button>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
        <div class="segment" style="background:var(--surface);border:1px solid var(--border)">
          ${['all', 'expense', 'income', 'transfer'].map((v) => `<button data-type="${v}" class="${table.type === v ? 'active' : ''}" style="padding:6px 16px">${v === 'all' ? '全部' : v === 'expense' ? '支出' : v === 'income' ? '收入' : '轉帳'}</button>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:8px;height:42px;padding:0 12px;background:var(--surface);border:1px solid var(--border);border-radius:11px">
          <i class="ti ti-category" style="color:var(--muted2)"></i>
          <select data-el="cat" style="border:none;background:none;outline:none;font-size:14px;color:var(--text2);cursor:pointer">
            ${catOpts.map((c) => `<option value="${escapeHtml(c)}" ${table.category === c ? 'selected' : ''}>${c || '全部分類'}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;height:42px;padding:0 13px;background:var(--surface);border:1px solid var(--border);border-radius:11px;flex:1;min-width:200px;max-width:320px">
          <i class="ti ti-search" style="color:var(--muted2)"></i>
          <input data-el="q" value="${escapeHtml(table.query)}" placeholder="搜尋備註或分類…" style="border:none;background:none;outline:none;font-size:14px;color:var(--text);width:100%">
        </div>
        ${hasFilter ? '<button data-el="clear" class="link" style="color:var(--muted)"><i class="ti ti-x"></i> 清除</button>' : ''}
        <div style="margin-left:auto;display:flex;gap:18px;font-size:13px;color:var(--muted2)">
          <span>支出 <span class="mono" style="color:var(--expense)">${fmtMoney(t.expense)}</span></span>
          <span>收入 <span class="mono" style="color:var(--income)">${fmtMoney(t.income)}</span></span>
        </div>
      </div>
      <div class="card" style="overflow:hidden">
        <div style="display:grid;grid-template-columns:130px 180px 1fr 90px 150px;gap:16px;align-items:center;padding:13px 20px;border-bottom:1px solid var(--border);background:var(--fill)">
          <button data-sort="date" style="display:flex;align-items:center;gap:5px;border:none;background:none;cursor:pointer;font-weight:600;font-size:12px;color:var(--muted)">日期<i class="ti ${arrow('date')}"></i></button>
          <span style="font-weight:600;font-size:12px;color:var(--muted)">分類</span>
          <span style="font-weight:600;font-size:12px;color:var(--muted)">備註</span>
          <span style="font-weight:600;font-size:12px;color:var(--muted)">類型</span>
          <button data-sort="amount" style="display:flex;align-items:center;justify-content:flex-end;gap:5px;border:none;background:none;cursor:pointer;font-weight:600;font-size:12px;color:var(--muted)">金額<i class="ti ${arrow('amount')}"></i></button>
        </div>
        ${list.length ? list.map((r) => r.type === 'transfer' ? `
          <div class="list-row" data-id="${rid(r)}" style="display:grid;grid-template-columns:130px 180px 1fr 90px 150px;gap:16px;cursor:pointer">
            <div class="mono" style="font-size:13px;color:var(--text2)">${r.date}</div>
            <div style="display:flex;align-items:center;gap:10px">${transferIconHtml(30)}<span style="font-size:14px;color:var(--text)">${transferLabel(r)}</span></div>
            <div style="font-size:14px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.description || '')}</div>
            <div><span style="font-size:12px;padding:2px 9px;border-radius:999px;background:var(--fill);color:var(--muted2)">轉帳</span></div>
            <div class="mono" style="text-align:right;font-weight:500;color:var(--muted2)">${fmtMoney(r.amount)}</div>
          </div>` : r.type === 'restricted' ? `
          <div class="list-row" data-id="${rid(r)}" style="display:grid;grid-template-columns:130px 180px 1fr 90px 150px;gap:16px;cursor:pointer">
            <div class="mono" style="font-size:13px;color:var(--text2)">${r.date}</div>
            <div style="display:flex;align-items:center;gap:10px">${restrictedIconHtml(30)}<span style="font-size:14px;color:var(--text)">${escapeHtml(r.description || '受限資金')}</span></div>
            <div style="font-size:14px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">已鎖住，不計入可用餘額</div>
            <div><span style="font-size:12px;padding:2px 9px;border-radius:999px;background:var(--fill);color:var(--muted2)">受限</span></div>
            <div class="mono" style="text-align:right;font-weight:500;color:var(--muted2)">${fmtMoney(r.amount)}</div>
          </div>` : `
          <div class="list-row" data-id="${rid(r)}" style="display:grid;grid-template-columns:130px 180px 1fr 90px 150px;gap:16px;cursor:pointer">
            <div class="mono" style="font-size:13px;color:var(--text2)">${r.date}</div>
            <div style="display:flex;align-items:center;gap:10px">${catIconHtml(r.category, 30)}<span style="font-size:14px;color:var(--text)">${escapeHtml(r.category)}${pendingBadge(r)}</span></div>
            <div style="font-size:14px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.description || '')}</div>
            <div><span style="font-size:12px;padding:2px 9px;border-radius:999px;background:${r.type === 'income' ? 'var(--income-soft)' : 'var(--expense-soft)'};color:${r.type === 'income' ? 'var(--income)' : 'var(--expense)'}">${r.type === 'income' ? '收入' : '支出'}</span></div>
            <div class="mono" style="text-align:right;font-weight:500;color:${r.type === 'income' ? 'var(--income)' : 'var(--text)'}">${r.type === 'income' ? '+' : '−'}${fmtMoney(r.amount)}</div>
          </div>`).join('') : '<div style="text-align:center;color:var(--muted2);padding:40px">沒有符合條件的記錄</div>'}
      </div>`;

    page.querySelector('[data-el="prev"]').onclick = () => shiftMonth(-1);
    page.querySelector('[data-el="next"]').onclick = () => shiftMonth(1);
    page.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { table.type = b.dataset.type; draw(); });
    page.querySelector('[data-el="cat"]').onchange = (e) => { table.category = e.target.value; draw(); };
    const qi = page.querySelector('[data-el="q"]');
    qi.oninput = (e) => { table.query = e.target.value; const pos = qi.selectionStart; draw(); const nq = page.querySelector('[data-el="q"]'); nq.focus(); nq.setSelectionRange(pos, pos); };
    const clr = page.querySelector('[data-el="clear"]'); if (clr) clr.onclick = () => { table = { ...table, type: 'all', category: '', query: '' }; draw(); };
    page.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => {
      const col = b.dataset.sort;
      if (table.sortBy === col) table.sortOrder = table.sortOrder === 'asc' ? 'desc' : 'asc';
      else { table.sortBy = col; table.sortOrder = 'desc'; }
      draw();
    });
    page.querySelectorAll('[data-id]').forEach((row) => row.onclick = () => { const r = cache.find((x) => rid(x) === row.dataset.id); if (r) openEdit(r); });
  }
  draw();
}

/* ============ 編輯 / 刪除 ============ */
function openEdit(record) {
  if (record.type === 'transfer') return openEditTransfer(record);
  if (record.type === 'restricted') return openEditRestricted(record);
  return openEditIncomeExpense(record);
}

function openEditIncomeExpense(record) {
  const id = rid(record);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const leaves = CATEGORY_TREE[record.type].flatMap((g) => g.items);
  const initialLocation = record.location || null;
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:17px;color:var(--text)">編輯記錄</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div class="segment" data-el="type" style="margin-bottom:14px">
        <button data-t="expense" class="${record.type === 'expense' ? 'active' : ''}">支出</button>
        <button data-t="income" class="${record.type === 'income' ? 'active' : ''}">收入</button>
      </div>
      <label style="font-size:13px;color:var(--muted2)">金額</label>
      <input data-el="amount" type="number" class="field mono" style="margin:6px 0 14px;font-size:18px" value="${record.amount}">
      <label style="font-size:13px;color:var(--muted2)">分類</label>
      <select data-el="category" class="field" style="margin:6px 0 14px">${leaves.map((l) => `<option ${l === record.category ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>
      <label style="font-size:13px;color:var(--muted2)">錢包</label>
      <div data-el="walletArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px">${walletChipsHtml(record.wallet_id && record.wallet_id.$oid ? record.wallet_id.$oid : record.wallet_id)}</div>
      <div data-el="locationWrap" class="${record.type === 'income' ? '' : 'hidden'}">
        <label style="font-size:13px;color:var(--muted2)">位置</label>
        <div data-el="locationArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px">${locationChipsHtml(initialLocation)}</div>
      </div>
      <label style="font-size:13px;color:var(--muted2)">日期</label>
      <input data-el="date" type="date" class="field" style="margin:6px 0 14px" value="${record.date}">
      <label style="font-size:13px;color:var(--muted2)">備註</label>
      <input data-el="note" class="field" style="margin:6px 0 18px" value="${escapeHtml(record.description || '')}">
      <label style="font-size:13px;color:var(--muted2)">照片</label>
      <div data-el="photoArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 18px"></div>
      <div style="display:flex;gap:10px">
        <button data-el="del" class="btn-primary" style="flex-shrink:0;background:var(--expense-soft);color:var(--expense);box-shadow:none"><i class="ti ti-trash"></i></button>
        <button data-el="save" class="btn-primary" style="flex:1">儲存</button>
      </div>
    </div>`;
  // 照片：待同步（離線建立、尚未有真正 record id）的記錄無法附加照片，只能等
  // 同步完成、之後再從明細補上——這需要額外的 client_id → record_id 對帳，
  // 不在此範圍。已有真正 record id 的記錄則離線也能「新增」（排入離線佇列，
  // 回連後 sync.js 自動以 FormData 送出），但「刪除」仍需連線（避免刪除請求
  // 也要排隊對帳，徒增複雜度換不到什麼使用情境）。
  // url 延遲載入（需認證的 blob URL，開啟編輯視窗時才逐張抓，不是清單頁就先
  // 抓，避免無謂流量）；_pending 標記的是「本地排隊中、尚未真正上傳」的項目，
  // 其 id 是本地 clientId（不是伺服器 photo id），url 是本地 blob，不必也不能
  // fetchPhotoUrl。
  let photos = record._pending ? [] : (record.photos || []).map((p) => ({ ...p, url: null }));
  function cleanupPhotoUrls() { photos.forEach((p) => { if (p.url) URL.revokeObjectURL(p.url); }); }
  function photoAreaHtml() {
    if (record._pending) return '<div style="font-size:12px;color:var(--faint)">待同步後才能管理照片</div>';
    const thumbs = photos.map((p) => {
      const canRemove = p._pending || isOnline();
      const removeBtn = canRemove
        ? `<button data-photo-remove="${p.id}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:var(--expense);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0"><i class="ti ti-x" style="font-size:12px"></i></button>`
        : '';
      const badge = p._pending
        ? `<span style="position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:9px;line-height:14px;background:rgba(0,0,0,.55);color:#fff">待同步</span>`
        : '';
      return `
      <div style="position:relative;width:56px;height:56px;flex-shrink:0;background:var(--fill);border-radius:10px;overflow:hidden;border:1px solid var(--border)">
        ${p.url ? `<img src="${p.url}" style="width:100%;height:100%;object-fit:cover">` : ''}
        ${removeBtn}
        ${badge}
      </div>`;
    }).join('');
    // 新增一律開放（離線會排隊，不是被擋下）；只有刪除受限於是否連線。
    const addBtn = `<label style="width:56px;height:56px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1px dashed var(--border-strong);border-radius:10px;color:var(--muted);cursor:pointer">
          <i class="ti ti-camera-plus" style="font-size:20px"></i>
          <input data-el="photoFile" type="file" accept="image/*" multiple style="display:none">
        </label>`;
    return thumbs + addBtn;
  }
  function renderPhotoArea() {
    const area = ov.querySelector('[data-el="photoArea"]');
    if (!area) return;
    area.innerHTML = photoAreaHtml();
    const input = area.querySelector('[data-el="photoFile"]');
    // 先等 handleAddPhotos 把檔案內容讀完（compressImage 內部會整個讀進記憶體）
    // 再清空 input.value，避免兩者交錯時清空動作影響到還沒被完整讀取的 File。
    if (input) input.addEventListener('change', async (e) => { const fl = e.target.files; await handleAddPhotos(fl); e.target.value = ''; });
  }
  async function loadPhotoThumbs() {
    const missing = photos.filter((p) => !p.url && !p._pending);
    if (!missing.length) return;
    await Promise.all(missing.map(async (p) => {
      try { p.url = await fetchPhotoUrl(id, p.id); } catch { /* 抓不到就留空白縮圖，不擋其他張 */ }
    }));
    renderPhotoArea();
  }
  async function queuePhotoOffline(compressed) {
    const stats = await queuedPhotoStats();
    if (stats.count >= MAX_QUEUED_PHOTOS || stats.bytes + compressed.size > MAX_QUEUED_PHOTO_BYTES) {
      showToast('離線待傳照片已達上限，請連線同步後再新增', 'warning');
      return;
    }
    const clientId = genClientId();
    const ok = await enqueueOutbox({
      clientId,
      kind: 'upload-photo',
      recordId: id,
      file: compressed,
      fileName: compressed.name,
      status: 'pending',
      error: null,
      createdAt: Date.now(),
    });
    if (!ok) { showToast('離線儲存失敗（瀏覽器儲存不可用）', 'error'); return; }
    photos.push({ id: clientId, url: URL.createObjectURL(compressed), _pending: true });
  }
  async function handleAddPhotos(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        if (!isOnline()) { await queuePhotoOffline(compressed); continue; }
        const uploaded = await uploadPhotos(id, [compressed]);
        photos.push({ ...uploaded[0], url: null });
      } catch (e) {
        showToast('上傳照片失敗：' + e.message, 'error');
      }
    }
    renderPhotoArea();
    await loadPhotoThumbs();
    emit('records:changed');
  }
  async function handleRemovePhoto(photoId) {
    const target = photos.find((p) => p.id === photoId);
    if (target && target._pending) {
      if (!(await showConfirm('取消這張待上傳的照片？'))) return;
      await removeOutbox(photoId);
      if (target.url) URL.revokeObjectURL(target.url);
      photos = photos.filter((p) => p.id !== photoId);
      renderPhotoArea();
      return;
    }
    if (!isOnline()) { showToast('刪除照片需連線', 'warning'); return; }
    if (!(await showConfirm('刪除這張照片？'))) return;
    try {
      await deletePhoto(id, photoId);
      const idx = photos.findIndex((p) => p.id === photoId);
      if (idx >= 0) { if (photos[idx].url) URL.revokeObjectURL(photos[idx].url); photos.splice(idx, 1); }
      renderPhotoArea();
      emit('records:changed');
    } catch (e) {
      showToast('刪除照片失敗：' + e.message, 'error');
    }
  }
  renderPhotoArea();
  loadPhotoThumbs();
  let curType = record.type;
  let curWalletId = record.wallet_id && record.wallet_id.$oid ? record.wallet_id.$oid : (record.wallet_id || null);
  let curLocation = initialLocation;
  ov.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
    curType = b.dataset.t;
    ov.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    const nl = CATEGORY_TREE[curType].flatMap((g) => g.items);
    ov.querySelector('[data-el="category"]').innerHTML = nl.map((l) => `<option>${escapeHtml(l)}</option>`).join('');
    ov.querySelector('[data-el="locationWrap"]').classList.toggle('hidden', curType !== 'income');
  });
  ov.querySelector('[data-el="walletArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wallet]'); if (!b) return;
    curWalletId = b.dataset.wallet || null;
    ov.querySelectorAll('[data-el="walletArea"] [data-wallet]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ov.querySelector('[data-el="locationArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-location]'); if (!b) return;
    curLocation = b.dataset.location;
    ov.querySelectorAll('[data-el="locationArea"] [data-location]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ov.querySelector('[data-el="save"]').onclick = async () => {
    const body = {
      type: curType,
      amount: parseFloat(ov.querySelector('[data-el="amount"]').value),
      category: ov.querySelector('[data-el="category"]').value,
      date: ov.querySelector('[data-el="date"]').value || todayStr(),
      description: ov.querySelector('[data-el="note"]').value,
      expense_type: record.expense_type || null,
      wallet_id: curWalletId,
    };
    if (!body.amount || body.amount <= 0) { showToast('金額須大於 0', 'warning'); return; }
    if (curType === 'income') {
      if (!curLocation) { showToast('請選擇位置', 'warning'); return; }
      body.location = curLocation;
    }
    // 待同步（離線建立、尚未同步）記錄 → outbox 就地合併，不送後端
    if (record._pending) {
      const queued = { ...body, client_id: record._clientId };
      if (body.type === 'expense') queued.confirm_withdrawal = true;
      const storedRecord = { _id: record._clientId, ...body, created_at: record.created_at || new Date().toISOString() };
      // 一併重設為 pending（若原本是「需處理」，等於修正後重排隊重試）
      await updateOutbox(record._clientId, { payload: queued, record: storedRecord, status: 'pending', error: null });
      showToast('已更新（待同步）', 'success'); cleanupPhotoUrls(); ov.remove(); emit('records:changed'); return;
    }
    // 已同步的 server 記錄：離線不可編輯
    if (!isOnline()) { showToast('編輯已同步記錄需連線', 'warning'); return; }
    try {
      await apiJson(`/admin/api/accounting/records/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('已更新', 'success'); cleanupPhotoUrls(); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('[data-el="del"]').onclick = async () => {
    if (!(await showConfirm('確定刪除這筆記錄？'))) return;
    if (record._pending) { await removeOutbox(record._clientId); showToast('已刪除待同步項', 'success'); cleanupPhotoUrls(); ov.remove(); emit('records:changed'); return; }
    if (!isOnline()) { showToast('刪除已同步記錄需連線', 'warning'); return; }
    try {
      const res = await apiCall(`/admin/api/accounting/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      showToast('已刪除', 'success'); cleanupPhotoUrls(); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-close]')) { cleanupPhotoUrls(); ov.remove(); return; }
    const pr = e.target.closest('[data-photo-remove]'); if (pr) return handleRemovePhoto(pr.dataset.photoRemove);
  });
  document.body.appendChild(ov);
}

/** 內部轉移記錄的編輯：方向（from/to location）建立後不可改，只能改帳戶/金額/日期/備註 */
function openEditTransfer(record) {
  const id = rid(record);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const initialWalletId = record.wallet_id && record.wallet_id.$oid ? record.wallet_id.$oid : record.wallet_id;
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:17px;color:var(--text)">編輯內部轉移</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;background:var(--fill);border-radius:var(--radius-md);padding:11px 13px;margin-bottom:16px;color:var(--muted2);font-size:13px">
        <i class="ti ti-lock"></i> 轉移方向建立後無法修改，如需更改請刪除後重新記錄
      </div>
      <label style="font-size:13px;color:var(--muted2)">方向</label>
      <div style="margin:6px 0 14px;font-weight:600;font-size:15px;color:var(--text)">${transferLabel(record)}</div>
      <label style="font-size:13px;color:var(--muted2)">帳戶</label>
      <div data-el="walletArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px">${walletOnlyChipsHtml(initialWalletId)}</div>
      <label style="font-size:13px;color:var(--muted2)">金額</label>
      <input data-el="amount" type="number" class="field mono" style="margin:6px 0 14px;font-size:18px" value="${record.amount}">
      <label style="font-size:13px;color:var(--muted2)">日期</label>
      <input data-el="date" type="date" class="field" style="margin:6px 0 14px" value="${record.date}">
      <label style="font-size:13px;color:var(--muted2)">備註</label>
      <input data-el="note" class="field" style="margin:6px 0 18px" value="${escapeHtml(record.description || '')}">
      <div style="display:flex;gap:10px">
        <button data-el="del" class="btn-primary" style="flex-shrink:0;background:var(--expense-soft);color:var(--expense);box-shadow:none"><i class="ti ti-trash"></i></button>
        <button data-el="save" class="btn-primary" style="flex:1">儲存</button>
      </div>
    </div>`;
  let curWalletId = initialWalletId;
  ov.querySelector('[data-el="walletArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wallet]'); if (!b) return;
    curWalletId = b.dataset.wallet;
    ov.querySelectorAll('[data-el="walletArea"] [data-wallet]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ov.querySelector('[data-el="save"]').onclick = async () => {
    const body = {
      amount: parseFloat(ov.querySelector('[data-el="amount"]').value),
      date: ov.querySelector('[data-el="date"]').value || todayStr(),
      description: ov.querySelector('[data-el="note"]').value,
      wallet_id: curWalletId,
    };
    if (!body.amount || body.amount <= 0) { showToast('金額須大於 0', 'warning'); return; }
    if (!isOnline()) { showToast('編輯已同步記錄需連線', 'warning'); return; }
    try {
      await apiJson(`/admin/api/accounting/records/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('已更新', 'success'); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('[data-el="del"]').onclick = async () => {
    if (!(await showConfirm('確定刪除這筆轉移記錄？'))) return;
    if (!isOnline()) { showToast('刪除已同步記錄需連線', 'warning'); return; }
    try {
      const res = await apiCall(`/admin/api/accounting/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      showToast('已刪除', 'success'); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}

/** 受限資金的編輯：金額/帳戶/位置/用途可改，解鎖動作不在這裡——請至「設定」的
 * 錢包管理面板操作，那裡才看得到完整的受限資金清單與解鎖按鈕。 */
function openEditRestricted(record) {
  const id = rid(record);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const initialWalletId = record.wallet_id && record.wallet_id.$oid ? record.wallet_id.$oid : record.wallet_id;
  const initialLocation = record.location || null;
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:17px;color:var(--text)"><i class="ti ti-lock" style="margin-right:6px;color:var(--muted2)"></i>受限資金</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;background:var(--fill);border-radius:var(--radius-md);padding:11px 13px;margin-bottom:16px;color:var(--muted2);font-size:13px">
        <i class="ti ti-info-circle"></i> 已鎖住，不計入可用餘額；解鎖請至「設定 → 錢包管理」操作
      </div>
      <label style="font-size:13px;color:var(--muted2)">金額</label>
      <input data-el="amount" type="number" class="field mono" style="margin:6px 0 14px;font-size:18px" value="${record.amount}">
      <label style="font-size:13px;color:var(--muted2)">帳戶</label>
      <div data-el="walletArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px">${walletChipsHtml(initialWalletId)}</div>
      <label style="font-size:13px;color:var(--muted2)">位置</label>
      <div data-el="locationArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px">${locationChipsHtml(initialLocation)}</div>
      <label style="font-size:13px;color:var(--muted2)">用途</label>
      <input data-el="note" class="field" style="margin:6px 0 18px" value="${escapeHtml(record.description || '')}">
      <div style="display:flex;gap:10px">
        <button data-el="del" class="btn-primary" style="flex-shrink:0;background:var(--expense-soft);color:var(--expense);box-shadow:none"><i class="ti ti-trash"></i></button>
        <button data-el="save" class="btn-primary" style="flex:1">儲存</button>
      </div>
    </div>`;
  let curWalletId = initialWalletId;
  let curLocation = initialLocation;
  ov.querySelector('[data-el="walletArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wallet]'); if (!b) return;
    curWalletId = b.dataset.wallet || null;
    ov.querySelectorAll('[data-el="walletArea"] [data-wallet]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ov.querySelector('[data-el="locationArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-location]'); if (!b) return;
    curLocation = b.dataset.location;
    ov.querySelectorAll('[data-el="locationArea"] [data-location]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ov.querySelector('[data-el="save"]').onclick = async () => {
    const body = {
      amount: parseFloat(ov.querySelector('[data-el="amount"]').value),
      description: ov.querySelector('[data-el="note"]').value,
      wallet_id: curWalletId,
      location: curLocation,
    };
    if (!body.amount || body.amount <= 0) { showToast('金額須大於 0', 'warning'); return; }
    if (!body.location) { showToast('請選擇位置', 'warning'); return; }
    if (!isOnline()) { showToast('編輯已同步記錄需連線', 'warning'); return; }
    try {
      await apiJson(`/admin/api/accounting/records/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('已更新', 'success'); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('[data-el="del"]').onclick = async () => {
    if (!(await showConfirm('確定刪除這筆受限資金？'))) return;
    if (!isOnline()) { showToast('刪除已同步記錄需連線', 'warning'); return; }
    try {
      const res = await apiCall(`/admin/api/accounting/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      showToast('已刪除', 'success'); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}

/** 依 id 抓單筆記錄並開編輯視窗；供照片瀏覽介面「點縮圖跳轉」等外部呼叫端使用
 * （不像列表點擊已經有現成的 record 物件，這裡只有 id，需先查一次）。 */
export async function openEditById(recordId) {
  try {
    const record = await apiJson(`/admin/api/accounting/records/${recordId}`);
    openEdit(record);
  } catch (e) {
    showToast('找不到該記錄，可能已被刪除', 'error');
  }
}

export { openAdd };
