/**
 * ledger.js — 帳本(手機分組列 + 結餘卡) / 明細(電腦寬表格排序篩選)。
 * 串 GET/PUT/DELETE /admin/api/accounting/records。
 */

import { apiJson, apiCall } from './api.js';
import { CATEGORY_TREE, categoryMeta } from './config.js';
import { fmtMoney, escapeHtml, showToast, showConfirm, todayStr } from './utils.js';
import { state, monthRange, shiftMonth, emit, on } from './store.js';
import { openAdd } from './add.js';

let cache = [];              // 當月記錄
let table = { type: 'all', category: '', query: '', sortBy: 'date', sortOrder: 'desc' };

async function load() {
  const { start, end } = monthRange();
  const data = await apiJson(`/admin/api/accounting/records?page=1&limit=200&start_date=${start}&end_date=${end}&sort_by=date&sort_order=desc`);
  cache = Array.isArray(data) ? data : (data.records || []);
  return cache;
}

function totals(list) {
  let income = 0, expense = 0;
  for (const r of list) { if (r.type === 'income') income += r.amount; else expense += r.amount; }
  return { income, expense, balance: income - expense };
}
const rid = (r) => (r._id && r._id.$oid) ? r._id.$oid : r._id;

function catIconHtml(leaf, size = 38) {
  const m = categoryMeta(leaf);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg = m.color + (isDark ? '26' : '1f');
  return `<div class="cat-icon" style="width:${size}px;height:${size}px;background:${bg}"><i class="ti ${m.icon}" style="color:${m.color};font-size:${size * 0.52}px"></i></div>`;
}

/* ============ 手機：帳本 ============ */
export async function renderLedgerMobile(container) {
  container.innerHTML = `<div style="padding:6px 20px 0;flex-shrink:0" data-el="head"></div>
    <div class="noscroll" data-el="list" style="flex:1;overflow-y:auto;padding:18px 20px 100px"></div>`;
  const head = container.querySelector('[data-el="head"]');
  const list = container.querySelector('[data-el="list"]');
  list.innerHTML = '<div style="text-align:center;color:var(--muted2);padding:40px 0">載入中…</div>';
  let items;
  try { items = await load(); } catch (e) { list.innerHTML = `<div style="text-align:center;color:var(--expense);padding:40px 0">${escapeHtml(e.message)}</div>`; return; }
  const t = totals(items);
  const { label } = monthRange();
  head.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-weight:700;font-size:22px;color:var(--text)">帳本</span>
      <button class="icon-btn" data-el="theme"><i class="ti ti-moon"></i></button>
    </div>
    <div class="balance-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;color:var(--muted2)">${label} · 結餘</span>
        <div style="display:flex;gap:8px;color:var(--faint)">
          <button data-el="prev" style="border:none;background:none;color:inherit;cursor:pointer"><i class="ti ti-chevron-left"></i></button>
          <button data-el="next" style="border:none;background:none;color:inherit;cursor:pointer"><i class="ti ti-chevron-right"></i></button>
        </div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:6px;margin-bottom:18px">
        <span style="font-size:15px;color:var(--faint);margin-bottom:5px">NT$</span>
        <span class="balance-amt">${fmtMoney(t.balance)}</span>
      </div>
      <div style="display:flex;gap:10px">
        <div style="flex:1;background:rgba(255,255,255,.08);border-radius:13px;padding:10px 13px">
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted2);margin-bottom:3px"><i class="ti ti-arrow-down-left" style="color:#5fb98a"></i>收入</div>
          <div class="mono" style="font-size:16px;color:#7fd0a3">${fmtMoney(t.income)}</div>
        </div>
        <div style="flex:1;background:rgba(255,255,255,.08);border-radius:13px;padding:10px 13px">
          <div style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted2);margin-bottom:3px"><i class="ti ti-arrow-up-right" style="color:#e08a85"></i>支出</div>
          <div class="mono" style="font-size:16px;color:#eaa19c">${fmtMoney(t.expense)}</div>
        </div>
      </div>
    </div>`;
  head.querySelector('[data-el="prev"]').onclick = () => shiftMonth(-1);
  head.querySelector('[data-el="next"]').onclick = () => shiftMonth(1);
  head.querySelector('[data-el="theme"]').onclick = () => import('./theme.js').then((m) => m.cycleTheme());

  if (!items.length) { list.innerHTML = `<div style="text-align:center;color:var(--muted2);padding:50px 0"><i class="ti ti-notebook" style="font-size:40px;color:var(--faint)"></i><div style="margin-top:10px;font-size:14px">本月尚無記錄</div></div>`; return; }

  const groups = {};
  for (const r of items) (groups[r.date] = groups[r.date] || []).push(r);
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  list.innerHTML = dates.map((d) => {
    const rows = groups[d];
    const sum = rows.reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);
    return `<div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;padding:0 2px">
        <span style="font-weight:600;font-size:13px;color:var(--text3)">${d.slice(5)}</span>
        <span class="mono" style="font-size:12px;color:var(--muted2)">${sum >= 0 ? '+' : '−'}${fmtMoney(Math.abs(sum))}</span>
      </div>
      <div class="card">${rows.map((r) => `
        <div class="list-row" data-id="${rid(r)}" style="cursor:pointer">
          ${catIconHtml(r.category)}
          <div style="flex:1;min-width:0">
            <div style="font-weight:500;font-size:15px;color:var(--text)">${escapeHtml(r.category)}</div>
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
          ${['all', 'expense', 'income'].map((v) => `<button data-type="${v}" class="${table.type === v ? 'active' : ''}" style="padding:6px 16px">${v === 'all' ? '全部' : v === 'expense' ? '支出' : '收入'}</button>`).join('')}
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
        ${list.length ? list.map((r) => `
          <div class="list-row" data-id="${rid(r)}" style="display:grid;grid-template-columns:130px 180px 1fr 90px 150px;gap:16px;cursor:pointer">
            <div class="mono" style="font-size:13px;color:var(--text2)">${r.date}</div>
            <div style="display:flex;align-items:center;gap:10px">${catIconHtml(r.category, 30)}<span style="font-size:14px;color:var(--text)">${escapeHtml(r.category)}</span></div>
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
  const id = rid(record);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const leaves = CATEGORY_TREE[record.type].flatMap((g) => g.items);
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
      <label style="font-size:13px;color:var(--muted2)">日期</label>
      <input data-el="date" type="date" class="field" style="margin:6px 0 14px" value="${record.date}">
      <label style="font-size:13px;color:var(--muted2)">備註</label>
      <input data-el="note" class="field" style="margin:6px 0 18px" value="${escapeHtml(record.description || '')}">
      <div style="display:flex;gap:10px">
        <button data-el="del" class="btn-primary" style="flex-shrink:0;background:var(--expense-soft);color:var(--expense);box-shadow:none"><i class="ti ti-trash"></i></button>
        <button data-el="save" class="btn-primary" style="flex:1">儲存</button>
      </div>
    </div>`;
  let curType = record.type;
  ov.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
    curType = b.dataset.t;
    ov.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    const nl = CATEGORY_TREE[curType].flatMap((g) => g.items);
    ov.querySelector('[data-el="category"]').innerHTML = nl.map((l) => `<option>${escapeHtml(l)}</option>`).join('');
  });
  ov.querySelector('[data-el="save"]').onclick = async () => {
    const body = {
      type: curType,
      amount: parseFloat(ov.querySelector('[data-el="amount"]').value),
      category: ov.querySelector('[data-el="category"]').value,
      date: ov.querySelector('[data-el="date"]').value || todayStr(),
      description: ov.querySelector('[data-el="note"]').value,
      expense_type: record.expense_type || null,
    };
    if (!body.amount || body.amount <= 0) { showToast('金額須大於 0', 'warning'); return; }
    try {
      await apiJson(`/admin/api/accounting/records/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('已更新', 'success'); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('[data-el="del"]').onclick = async () => {
    if (!(await showConfirm('確定刪除這筆記錄？'))) return;
    try {
      const res = await apiCall(`/admin/api/accounting/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      showToast('已刪除', 'success'); ov.remove(); emit('records:changed');
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}

export { openAdd };
