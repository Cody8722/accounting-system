/**
 * add.js — 記一筆：計算機式數字鍵盤（可算 120+50=）、兩層分類、備註、
 * 日期、設為定期（排程摘要），以及電子發票入口。存檔串 POST records，
 * 定期則另 POST recurring。可連續記帳。
 */

import { apiJson } from './api.js';
import { CATEGORY_TREE, QUICK_LEAVES, categoryMeta } from './config.js';
import { showToast, todayStr, escapeHtml } from './utils.js';
import { emit } from './store.js';
import { openInvoiceScan } from './invoice.js';

let host = null;          // 掛載容器（覆蓋層）
let type = 'expense';     // expense | income
let category = '';        // 目前選取的葉分類
let date = todayStr();
let note = '';
let recurring = false;
let recur = { every: 1, unit: 'month', end: 'never', count: 12 };
// 計算機狀態
let acc = null, op = null, buf = '';

const UNIT_LABEL = { day: '天', week: '週', month: '個月', year: '年' };

function evaluate() {
  const b = buf === '' ? (acc === null ? 0 : acc) : parseFloat(buf);
  if (op !== null && acc !== null && buf !== '') return apply(acc, op, parseFloat(buf));
  return acc !== null && buf === '' ? acc : b;
}
function apply(a, o, b) {
  const r = o === '+' ? a + b : o === '-' ? a - b : o === '×' ? a * b : o === '÷' ? (b === 0 ? a : a / b) : b;
  return Math.round(r * 100) / 100;
}
function displayAmount() {
  const v = buf !== '' ? buf : (acc !== null ? String(acc) : '0');
  return v;
}
function pressDigit(d) {
  if (d === '.' && buf.includes('.')) return;
  if (buf === '0' && d !== '.') buf = d; else buf += d;
  refresh();
}
function pressOp(o) {
  if (buf === '' && acc === null) return;
  if (op !== null && buf !== '') { acc = apply(acc, op, parseFloat(buf)); }
  else if (buf !== '') { acc = parseFloat(buf); }
  op = o; buf = '';
  refresh();
}
function pressEq() {
  if (op !== null && buf !== '') { acc = apply(acc, op, parseFloat(buf)); op = null; buf = ''; }
  else if (buf !== '') { acc = parseFloat(buf); buf = ''; }
  refresh();
}
function backspace() { if (buf) buf = buf.slice(0, -1); refresh(); }
function clearCalc() { acc = null; op = null; buf = ''; refresh(); }

function recurSummary() {
  const endText = recur.end === 'never' ? '永不結束' : recur.end === 'count' ? `重複 ${recur.count} 次` : '至指定日期';
  return `每 ${recur.every} ${UNIT_LABEL[recur.unit]}・${endText}`;
}

function quickChips() {
  const leaves = QUICK_LEAVES[type];
  return leaves.map((leaf) => {
    const m = categoryMeta(leaf);
    const active = category === leaf ? ' active' : '';
    return `<button class="chip${active}" data-leaf="${escapeHtml(leaf)}"><i class="ti ${m.icon}"></i><span>${escapeHtml(leaf)}</span></button>`;
  }).join('') + `<button class="chip" data-more="1"><i class="ti ti-dots"></i><span>更多</span></button>`;
}

function refresh() {
  if (!host) return;
  host.querySelector('[data-el="amount"]').textContent = displayAmount();
  const sign = host.querySelector('[data-el="sign"]');
  sign.textContent = type === 'expense' ? '−' : '+';
  sign.style.color = type === 'expense' ? 'var(--expense)' : 'var(--income)';
  host.querySelector('[data-el="chips"]').innerHTML = quickChips();
  bindChips();
  host.querySelector('[data-el="expBtn"]').classList.toggle('active', type === 'expense');
  host.querySelector('[data-el="incBtn"]').classList.toggle('active', type === 'income');
  const recRow = host.querySelector('[data-el="recRow"]');
  recRow.classList.toggle('hidden', !recurring);
  if (recurring) recRow.querySelector('[data-el="recSummary"]').textContent = recurSummary();
  host.querySelector('[data-el="recBtn"]').style.color = recurring ? 'var(--accent)' : 'var(--muted)';
}

function bindChips() {
  host.querySelectorAll('[data-el="chips"] .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.more) { openCategorySheet(); return; }
      category = btn.dataset.leaf;
      refresh();
    });
  });
}

function openCategorySheet() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const groups = CATEGORY_TREE[type];
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-weight:600;font-size:16px;color:var(--text)">選擇分類</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      ${groups.map((g) => `
        <div style="margin-bottom:14px">
          <div style="font-size:13px;color:var(--text3);font-weight:600;margin-bottom:8px"><i class="ti ${g.icon}" style="color:${g.color};margin-right:5px"></i>${g.group}</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${g.items.map((leaf) => `<button class="chip" data-leaf="${escapeHtml(leaf)}"><i class="ti ${g.icon}" style="color:${g.color}"></i><span>${escapeHtml(leaf)}</span></button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-close]')) { ov.remove(); return; }
    const b = e.target.closest('[data-leaf]');
    if (b) { category = b.dataset.leaf; refresh(); ov.remove(); }
  });
  document.body.appendChild(ov);
}

function openRecurSheet() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  const unitChip = (u) => `<button class="seg-u ${recur.unit === u ? 'active' : ''}" data-unit="${u}" style="flex:1;border:none;border-radius:9px;padding:8px 0;cursor:pointer;font-size:13px;background:${recur.unit === u ? 'var(--surface)' : 'transparent'};color:${recur.unit === u ? 'var(--text)' : 'var(--muted)'};font-weight:${recur.unit === u ? 600 : 400}">${UNIT_LABEL[u].replace('個月', '月')}</button>`;
  const endChip = (v, label) => `<button class="seg-e ${recur.end === v ? 'active' : ''}" data-end="${v}" style="flex:1;border:none;border-radius:9px;padding:9px 0;cursor:pointer;font-size:13px;background:${recur.end === v ? 'var(--surface)' : 'transparent'};color:${recur.end === v ? 'var(--text)' : 'var(--muted)'};font-weight:${recur.end === v ? 600 : 400}">${label}</button>`;
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-weight:600;font-size:17px;color:var(--text)">定期排程</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div style="display:flex;align-items:center;gap:7px;background:var(--accent-soft);border-radius:11px;padding:11px 13px;margin:6px 0 18px"><i class="ti ti-calendar-repeat" style="color:var(--accent)"></i><span data-el="sum" style="font-weight:600;font-size:14px;color:var(--accent-soft-text)">${recurSummary()}</span></div>
      <div style="font-size:13px;color:var(--muted2);margin-bottom:9px">重複頻率</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
        <span style="font-size:15px;color:var(--text3)">每</span>
        <div class="stepper"><button data-step="-1"><i class="ti ti-minus"></i></button><span class="val" data-el="every">${recur.every}</span><button data-step="1"><i class="ti ti-plus"></i></button></div>
        <div class="segment" style="flex:1" data-el="units">${['day', 'week', 'month', 'year'].map(unitChip).join('')}</div>
      </div>
      <div style="font-size:13px;color:var(--muted2);margin-bottom:9px">結束</div>
      <div class="segment" data-el="ends" style="margin-bottom:20px">${endChip('never', '永不')}${endChip('date', '指定日期')}${endChip('count', '重複次數')}</div>
      <button class="btn-primary" data-done="1" style="width:100%">完成</button>
    </div>`;
  const sync = () => { ov.querySelector('[data-el="sum"]').textContent = recurSummary(); ov.querySelector('[data-el="every"]').textContent = recur.every; };
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-close]') || e.target.closest('[data-done]')) { ov.remove(); refresh(); return; }
    const step = e.target.closest('[data-step]');
    if (step) { recur.every = Math.max(1, recur.every + Number(step.dataset.step)); sync(); }
    const u = e.target.closest('[data-unit]');
    if (u) { recur.unit = u.dataset.unit; ov.querySelector('[data-el="units"]').innerHTML = ['day', 'week', 'month', 'year'].map(unitChip).join(''); sync(); }
    const en = e.target.closest('[data-end]');
    if (en) { recur.end = en.dataset.end; ov.querySelector('[data-el="ends"]').innerHTML = endChip('never', '永不') + endChip('date', '指定日期') + endChip('count', '重複次數'); }
  });
  document.body.appendChild(ov);
}

async function save() {
  const amount = evaluate();
  if (!amount || amount <= 0) { showToast('請輸入金額', 'warning'); return; }
  if (!category) { showToast('請選擇分類', 'warning'); return; }
  try {
    await apiJson('/admin/api/accounting/records', {
      method: 'POST',
      body: JSON.stringify({ type, amount, category, date, description: note, expense_type: null }),
    });
    if (recurring) {
      const day = Number(date.slice(8, 10)) || 1;
      await apiJson('/admin/api/recurring', {
        method: 'POST',
        body: JSON.stringify({ name: note || category, amount, type, category, day_of_month: day, description: `${recurSummary()}${note ? '・' + note : ''}` }),
      }).catch(() => {});
    }
    showToast('已記一筆', 'success');
    emit('records:changed');
    // 連續記帳：清空金額與備註，保留類型/分類
    clearCalc();
    note = '';
    const noteInput = host.querySelector('[data-el="note"]');
    if (noteInput) noteInput.value = '';
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function close() {
  if (host) { host.remove(); host = null; }
  window.dispatchEvent(new CustomEvent('add:closed'));
}

/** 開啟記一筆覆蓋層 */
export function openAdd(initialType = 'expense') {
  if (host) return;
  type = initialType; category = ''; date = todayStr(); note = ''; recurring = false;
  acc = null; op = null; buf = '';
  host = document.createElement('div');
  host.className = 'add-screen';
  host.innerHTML = `
    <div style="height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;flex-shrink:0">
      <button data-el="cancel" style="border:none;background:none;color:var(--muted);font-size:15px;cursor:pointer;padding:6px 8px">取消</button>
      <span style="font-weight:600;font-size:16px;color:var(--text)">記一筆</span>
      <label style="display:flex;align-items:center;gap:4px;color:var(--accent);font-size:14px;cursor:pointer">
        <i class="ti ti-calendar-event"></i>
        <input data-el="date" type="date" value="${date}" style="border:none;background:none;color:var(--accent);font-family:inherit;cursor:pointer">
      </label>
    </div>
    <div style="padding:6px 20px 0;flex-shrink:0">
      <div class="segment"><button data-el="expBtn" class="active">支出</button><button data-el="incBtn">收入</button></div>
    </div>
    <div class="noscroll" style="flex:1;overflow-y:auto;min-height:0">
      <div style="padding:12px 20px 0">
        <button data-el="invoice" style="width:100%;display:flex;align-items:center;gap:11px;background:var(--accent-soft);border:1px solid var(--accent-soft-border);border-radius:13px;padding:12px 14px;cursor:pointer;text-align:left">
          <i class="ti ti-qrcode" style="font-size:21px;color:var(--accent)"></i>
          <div style="flex:1"><div style="font-weight:600;font-size:14px;color:var(--accent-soft-text)">掃描電子發票</div><div style="font-size:12px;color:var(--muted)">對準 QR 碼自動帶入金額與明細</div></div>
          <i class="ti ti-chevron-right" style="color:var(--accent)"></i>
        </button>
      </div>
      <div style="margin:16px 20px 0;background:var(--fill);border:2px solid var(--border);border-radius:18px;padding:18px 0 16px;text-align:center">
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:7px">
          <span data-el="sign" style="font-size:30px;font-weight:600;color:var(--expense);align-self:center">−</span>
          <span style="font-size:13px;color:var(--muted2);align-self:flex-start;margin-top:11px">NT$</span>
          <span data-el="amount" class="mono" style="font-weight:500;font-size:44px;color:var(--text);letter-spacing:-1.5px;line-height:1">0</span>
        </div>
      </div>
      <div style="padding:16px 18px 6px">
        <div data-el="chips" style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px"></div>
      </div>
      <div style="margin:6px 18px 0;display:flex;align-items:center;gap:10px">
        <div style="flex:1;display:flex;align-items:center;gap:9px;background:var(--fill);border-radius:12px;padding:11px 13px">
          <i class="ti ti-pencil" style="color:var(--muted2)"></i>
          <input data-el="note" placeholder="加個備註…" style="border:none;background:none;outline:none;font-size:14px;color:var(--text);width:100%">
        </div>
        <button data-el="recBtn" title="設為定期" style="display:flex;align-items:center;gap:5px;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:11px 13px;cursor:pointer;color:var(--muted)"><i class="ti ti-repeat"></i><span style="font-weight:600;font-size:13px">定期</span></button>
      </div>
      <div data-el="recRow" class="hidden" style="margin:10px 18px 0;display:flex;align-items:center;gap:9px;background:var(--accent-soft);border:1px solid var(--accent-soft-border);border-radius:12px;padding:11px 13px;cursor:pointer">
        <i class="ti ti-calendar-repeat" style="color:var(--accent)"></i>
        <span data-el="recSummary" style="flex:1;font-weight:600;font-size:13px;color:var(--accent-soft-text)"></span>
        <span style="font-size:13px;color:var(--accent)">編輯</span>
      </div>
    </div>
    <div style="background:var(--surface);border-top:1px solid var(--border);padding:12px 14px 18px;flex-shrink:0">
      <div class="keypad" data-el="keypad"></div>
    </div>`;

  // 鍵盤
  const keypad = host.querySelector('[data-el="keypad"]');
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−op', '.', '0', '⌫', '+op'];
  keypad.innerHTML = keys.map((k) => {
    if (k === '÷' || k === '×') return `<button class="op" data-op="${k}">${k}</button>`;
    if (k === '−op') return `<button class="op" data-op="-">−</button>`;
    if (k === '+op') return `<button class="op" data-op="+">＋</button>`;
    if (k === '⌫') return `<button data-back="1"><i class="ti ti-backspace"></i></button>`;
    return `<button data-digit="${k}">${k}</button>`;
  }).join('') + `<button data-eq="1" style="grid-column:span 3">=</button><button class="save" data-save="1">儲存</button>`;

  host.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-el="cancel"]')) return close();
    if (t.closest('[data-el="invoice"]')) return openInvoiceScan((res) => {
      // 發票帶入：金額、備註；分類預設「其他支出」
      type = 'expense'; clearCalc(); buf = String(res.total || ''); category = res.category || '其他支出'; note = res.note || res.seller || '';
      const ni = host.querySelector('[data-el="note"]'); if (ni) ni.value = note;
      refresh();
    });
    if (t.closest('[data-el="expBtn"]')) { type = 'expense'; category = ''; refresh(); }
    if (t.closest('[data-el="incBtn"]')) { type = 'income'; category = ''; refresh(); }
    if (t.closest('[data-el="recBtn"]')) { recurring = !recurring; refresh(); if (recurring) openRecurSheet(); }
    if (t.closest('[data-el="recRow"]')) openRecurSheet();
    const dg = t.closest('[data-digit]'); if (dg) pressDigit(dg.dataset.digit);
    const opb = t.closest('[data-op]'); if (opb) pressOp(opb.dataset.op);
    if (t.closest('[data-back]')) backspace();
    if (t.closest('[data-eq]')) pressEq();
    if (t.closest('[data-save]')) save();
  });
  host.querySelector('[data-el="date"]').addEventListener('change', (e) => { date = e.target.value || todayStr(); });
  host.querySelector('[data-el="note"]').addEventListener('input', (e) => { note = e.target.value; });

  document.body.appendChild(host);
  refresh();
}
