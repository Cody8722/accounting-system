/**
 * add.js — 記一筆：計算機式數字鍵盤（可算 120+50=）、兩層分類、備註、
 * 日期、設為定期（排程摘要），以及電子發票入口。存檔串 POST records，
 * 定期則另 POST recurring。可連續記帳。
 *
 * 兩種外殼（邏輯共用）：
 *  - 手機 (<900px)：全螢幕計算機式介面。
 *  - 電腦 (≥900px)：820px 置中兩欄彈窗（金額鍵盤輸入 + 選點展開計算機、
 *    完整分類網格、右欄發票入口）。
 */

import { apiJson } from './api.js';
import { CATEGORY_TREE, QUICK_LEAVES, categoryMeta } from './config.js';
import { showToast, showConfirm, todayStr, escapeHtml } from './utils.js';
import { emit } from './store.js';
import { openInvoiceScan } from './invoice.js';
import { fetchWallets, walletChipsHtml, locationChipsHtml } from './wallet.js';

let host = null;          // 掛載容器（覆蓋層）
let mode = 'mobile';      // mobile | desktop
let type = 'expense';     // expense | income
let category = '';        // 目前選取的葉分類
let walletId = null;      // 目前選取的錢包（null = 未分類），與 category 各自獨立的欄位
let location = null;      // 位置（bank/cash）——僅收入需要使用者手動選；支出由後端自動判斷
let splitOpen = false;     // 收入拆分欄位是否展開（預設收起，只有收入類型才會顯示切換連結）
let restrictedAmountStr = ''; // 受限資金金額（字串輸入值，僅收入拆分時使用）
let restrictedNote = '';   // 受限資金用途
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
  return buf !== '' ? buf : (acc !== null ? String(acc) : '0');
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

/** 共用鍵盤（含 C 清除鍵） */
function keypadHtml() {
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '.', '0', '⌫', '+'];
  const cells = keys.map((k) => {
    if (k === '÷' || k === '×') return `<button class="op" data-op="${k}">${k}</button>`;
    if (k === '-') return `<button class="op" data-op="-">−</button>`;
    if (k === '+') return `<button class="op" data-op="+">＋</button>`;
    if (k === '⌫') return `<button data-back="1"><i class="ti ti-backspace"></i></button>`;
    return `<button data-digit="${k}">${k}</button>`;
  }).join('');
  return cells
    + `<button data-clear="1" style="color:var(--expense)">C</button>`
    + `<button data-eq="1" style="grid-column:span 2">=</button>`
    + `<button class="save" data-save="1">儲存</button>`;
}

/** 分類選取區：手機=常用細項+更多；電腦=完整兩層網格 */
function catAreaHtml() {
  if (mode === 'desktop') {
    return CATEGORY_TREE[type].map((g) => `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:7px"><i class="ti ${g.icon}" style="color:${g.color};margin-right:5px"></i>${g.group}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px">
          ${g.items.map((leaf) => `<button class="chip${category === leaf ? ' active' : ''}" data-leaf="${escapeHtml(leaf)}"><i class="ti ${g.icon}" style="color:${g.color}"></i><span>${escapeHtml(leaf)}</span></button>`).join('')}
        </div>
      </div>`).join('');
  }
  const leaves = QUICK_LEAVES[type];
  return leaves.map((leaf) => {
    const m = categoryMeta(leaf);
    return `<button class="chip${category === leaf ? ' active' : ''}" data-leaf="${escapeHtml(leaf)}"><i class="ti ${m.icon}"></i><span>${escapeHtml(leaf)}</span></button>`;
  }).join('') + `<button class="chip" data-more="1"><i class="ti ti-dots"></i><span>更多</span></button>`;
}

function renderCatArea() {
  const area = host.querySelector('[data-el="catArea"]');
  if (area) area.innerHTML = catAreaHtml();
}
function highlightCat() {
  host.querySelectorAll('[data-el="catArea"] [data-leaf]').forEach((b) => b.classList.toggle('active', b.dataset.leaf === category));
}

function renderWalletArea() {
  const area = host.querySelector('[data-el="walletArea"]');
  if (area) area.innerHTML = walletChipsHtml(walletId);
}
function highlightWallet() {
  host.querySelectorAll('[data-el="walletArea"] [data-wallet]').forEach((b) => b.classList.toggle('active', (b.dataset.wallet || null) === walletId));
}

function renderLocationArea() {
  const area = host.querySelector('[data-el="locationArea"]');
  if (area) area.innerHTML = locationChipsHtml(location);
}
function highlightLocation() {
  host.querySelectorAll('[data-el="locationArea"] [data-location]').forEach((b) => b.classList.toggle('active', b.dataset.location === location));
}

/** 這筆收入是否要拆出受限資金（代收代付，如學費夾零用錢） */
function toggleSplit() {
  splitOpen = !splitOpen;
  const fields = host.querySelector('[data-el="splitFields"]');
  if (fields) fields.classList.toggle('hidden', !splitOpen);
  const chevron = host.querySelector('[data-el="splitChevron"]');
  if (chevron) chevron.style.transform = splitOpen ? 'rotate(90deg)' : '';
}
function resetSplit() {
  splitOpen = false; restrictedAmountStr = ''; restrictedNote = '';
  const fields = host && host.querySelector('[data-el="splitFields"]');
  if (fields) fields.classList.add('hidden');
  const chevron = host && host.querySelector('[data-el="splitChevron"]');
  if (chevron) chevron.style.transform = '';
  const ra = host && host.querySelector('[data-el="restrictedAmount"]'); if (ra) ra.value = '';
  const rn = host && host.querySelector('[data-el="restrictedNote"]'); if (rn) rn.value = '';
}

function refresh() {
  if (!host) return;
  const amt = displayAmount();
  const amountText = host.querySelector('[data-el="amount"]');
  if (amountText) amountText.textContent = amt;
  const amountInput = host.querySelector('[data-el="amountInput"]');
  if (amountInput && document.activeElement !== amountInput) amountInput.value = amt === '0' ? '' : amt;

  const sign = host.querySelector('[data-el="sign"]');
  if (sign) { sign.textContent = type === 'expense' ? '−' : '+'; sign.style.color = type === 'expense' ? 'var(--expense)' : 'var(--income)'; }

  const expBtn = host.querySelector('[data-el="expBtn"]'), incBtn = host.querySelector('[data-el="incBtn"]');
  if (expBtn && incBtn) { expBtn.classList.toggle('active', type === 'expense'); incBtn.classList.toggle('active', type === 'income'); }

  const recRow = host.querySelector('[data-el="recRow"]');
  if (recRow) { recRow.classList.toggle('hidden', !recurring); if (recurring) recRow.querySelector('[data-el="recSummary"]').textContent = recurSummary(); }
  const recBtn = host.querySelector('[data-el="recBtn"]');
  if (recBtn) recBtn.style.color = recurring ? 'var(--accent)' : 'var(--muted)';

  // 位置（銀行/現金）只有收入需要使用者選；支出完全不顯示，由後端自動判斷
  const locationWrap = host.querySelector('[data-el="locationWrap"]');
  if (locationWrap) locationWrap.classList.toggle('hidden', type !== 'income');

  // 拆分（受限資金）只有收入才有意義，且預設收合
  const splitWrap = host.querySelector('[data-el="splitWrap"]');
  if (splitWrap) splitWrap.classList.toggle('hidden', type !== 'income');

  highlightCat();
  highlightWallet();
  highlightLocation();
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
  const unitChip = (u) => `<button data-unit="${u}" style="flex:1;border:none;border-radius:9px;padding:8px 0;cursor:pointer;font-size:13px;background:${recur.unit === u ? 'var(--surface)' : 'transparent'};color:${recur.unit === u ? 'var(--text)' : 'var(--muted)'};font-weight:${recur.unit === u ? 600 : 400}">${UNIT_LABEL[u].replace('個月', '月')}</button>`;
  const endChip = (v, label) => `<button data-end="${v}" style="flex:1;border:none;border-radius:9px;padding:9px 0;cursor:pointer;font-size:13px;background:${recur.end === v ? 'var(--surface)' : 'transparent'};color:${recur.end === v ? 'var(--text)' : 'var(--muted)'};font-weight:${recur.end === v ? 600 : 400}">${label}</button>`;
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

/** 存檔成功後的共用收尾：定期排程、提示、清空計算機與備註、電腦版關閉 */
async function finishSave(amount, hadSplit = false) {
  if (recurring) {
    const day = Number(date.slice(8, 10)) || 1;
    await apiJson('/admin/api/recurring', {
      method: 'POST',
      body: JSON.stringify({ name: note || category, amount, type, category, day_of_month: day, description: `${recurSummary()}${note ? '・' + note : ''}` }),
    }).catch(() => {});
  }
  showToast(hadSplit ? '已記一筆（含受限資金）' : '已記一筆', 'success');
  emit('records:changed');
  // 連續記帳：清空金額與備註，保留類型/分類/帳戶/位置
  clearCalc();
  note = '';
  const noteInput = host.querySelector('[data-el="note"]');
  if (noteInput) noteInput.value = '';
  resetSplit();
  // 電腦版存完關閉（回到清單）；手機版留著連續記帳
  if (mode === 'desktop') close();
}

async function save() {
  const amount = evaluate();
  const restrictedAmount = parseFloat(restrictedAmountStr);
  const hasSplit = type === 'income' && splitOpen && restrictedAmount > 0;

  if (!hasSplit && (!amount || amount <= 0)) { showToast('請輸入金額', 'warning'); return; }
  if (!category) { showToast('請選擇分類', 'warning'); return; }
  if (type === 'income' && !location) { showToast('請選擇位置', 'warning'); return; }

  const payload = { type, amount: amount || 0, category, date, description: note, expense_type: null, wallet_id: walletId };
  if (type === 'income') payload.location = location;
  if (hasSplit) {
    payload.restricted_amount = restrictedAmount;
    payload.restricted_description = restrictedNote;
  }

  try {
    await apiJson('/admin/api/accounting/records', { method: 'POST', body: JSON.stringify(payload) });
    await finishSave(amount || 0, hasSplit);
  } catch (e) {
    // 支出現金不足：後端回 409 附帶提領試算，跳確認框，確認後帶 confirm_withdrawal 重送
    if (e.status === 409 && e.body && e.body.error === 'cash_insufficient') {
      const ok = await showConfirm(e.body.message, { confirmText: '確認提領', danger: false });
      if (!ok) return;
      try {
        await apiJson('/admin/api/accounting/records', {
          method: 'POST',
          body: JSON.stringify({ ...payload, confirm_withdrawal: true }),
        });
        await finishSave(amount);
      } catch (e2) {
        showToast(e2.message, 'error');
      }
      return;
    }
    showToast(e.message, 'error');
  }
}

function close() {
  if (host) { host.remove(); host = null; }
  window.dispatchEvent(new CustomEvent('add:closed'));
}

/** 靜默關閉（不觸發刷新）——供切換手機/電腦外殼時清掉舊的記帳覆蓋層 */
export function closeAdd() {
  if (host) { host.remove(); host = null; }
}

function invoiceCallback(res) {
  type = 'expense'; clearCalc(); buf = String(res.total || '');
  category = res.category || '其他支出'; note = res.note || res.seller || '';
  const ni = host.querySelector('[data-el="note"]'); if (ni) ni.value = note;
  // 發票日期只是「可編輯的預設值」——帶入後使用者仍可自由改（補記過去發票等）
  if (res.date && /^\d{4}-\d{2}-\d{2}$/.test(res.date)) {
    date = res.date;
    const de = host.querySelector('[data-el="date"]');
    if (de) de.value = res.date;
  }
  renderCatArea();
  refresh();
}

/** 共用點擊委派（兩種外殼皆用同一組 data-el） */
function onHostClick(e) {
  const t = e.target;
  if (t.closest('[data-el="cancel"]')) return close();
  if (t.closest('[data-el="invoice"]')) return openInvoiceScan(invoiceCallback);
  if (t.closest('[data-el="expBtn"]')) { type = 'expense'; category = ''; location = null; resetSplit(); renderCatArea(); refresh(); return; }
  if (t.closest('[data-el="incBtn"]')) { type = 'income'; category = ''; location = null; resetSplit(); renderCatArea(); refresh(); return; }
  if (t.closest('[data-el="splitToggle"]')) return toggleSplit();
  if (t.closest('[data-el="recBtn"]')) { recurring = !recurring; refresh(); if (recurring) openRecurSheet(); return; }
  if (t.closest('[data-el="recRow"]')) return openRecurSheet();
  if (t.closest('[data-el="calcToggle"]')) { host.querySelector('[data-el="keypadPanel"]').classList.toggle('hidden'); return; }
  const leaf = t.closest('[data-leaf]'); if (leaf) { category = leaf.dataset.leaf; highlightCat(); return; }
  if (t.closest('[data-more]')) return openCategorySheet();
  const wb = t.closest('[data-wallet]'); if (wb) { walletId = wb.dataset.wallet || null; highlightWallet(); return; }
  const lb = t.closest('[data-location]'); if (lb) { location = lb.dataset.location; highlightLocation(); return; }
  const dg = t.closest('[data-digit]'); if (dg) return pressDigit(dg.dataset.digit);
  const opb = t.closest('[data-op]'); if (opb) return pressOp(opb.dataset.op);
  if (t.closest('[data-back]')) return backspace();
  if (t.closest('[data-clear]')) return clearCalc();
  if (t.closest('[data-eq]')) return pressEq();
  if (t.closest('[data-save]')) return save();
}

/* ================= 手機外殼 ================= */
function buildMobile() {
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
        <div data-el="catArea" style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px"></div>
      </div>
      <div style="padding:6px 18px 0">
        <div style="font-size:12px;color:var(--muted2);margin-bottom:8px">錢包</div>
        <div data-el="walletArea" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      </div>
      <div data-el="locationWrap" class="hidden" style="padding:10px 18px 0">
        <div style="font-size:12px;color:var(--muted2);margin-bottom:8px">位置</div>
        <div data-el="locationArea" style="display:flex;flex-wrap:wrap;gap:8px"></div>
      </div>
      <div data-el="splitWrap" class="hidden" style="padding:10px 18px 0">
        <button data-el="splitToggle" type="button" style="border:none;background:none;color:var(--muted2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 0">
          <i class="ti ti-chevron-right" data-el="splitChevron" style="transition:transform .15s"></i>這筆包含要轉交的錢？
        </button>
        <div data-el="splitFields" class="hidden" style="margin-top:10px;background:var(--fill);border-radius:12px;padding:12px">
          <div style="font-size:12px;color:var(--muted2);margin-bottom:6px">受限金額（鎖住，不計入可用餘額）</div>
          <input data-el="restrictedAmount" type="number" min="0" step="0.01" class="field mono" style="margin-bottom:10px" placeholder="0">
          <div style="font-size:12px;color:var(--muted2);margin-bottom:6px">用途</div>
          <input data-el="restrictedNote" class="field" placeholder="如：學費代收">
        </div>
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
      <div class="keypad">${keypadHtml()}</div>
    </div>`;
  host.querySelector('[data-el="date"]').addEventListener('change', (e) => { date = e.target.value || todayStr(); });
  host.querySelector('[data-el="note"]').addEventListener('input', (e) => { note = e.target.value; });
  host.querySelector('[data-el="restrictedAmount"]').addEventListener('input', (e) => { restrictedAmountStr = e.target.value; });
  host.querySelector('[data-el="restrictedNote"]').addEventListener('input', (e) => { restrictedNote = e.target.value; });
  host.addEventListener('click', onHostClick);
  document.body.appendChild(host);
}

/* ================= 電腦外殼（820px 兩欄彈窗） ================= */
function buildDesktop() {
  host = document.createElement('div');
  host.className = 'overlay center';
  host.style.zIndex = '70';
  host.innerHTML = `
    <div style="width:820px;max-width:94vw;max-height:90vh;background:var(--surface);border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
        <span style="font-weight:600;font-size:17px;color:var(--text)">記一筆</span>
        <button class="icon-btn" data-el="cancel"><i class="ti ti-x"></i></button>
      </div>
      <div style="display:grid;grid-template-columns:1.35fr 1fr;min-height:0;flex:1">
        <!-- 左欄 -->
        <div class="noscroll" style="overflow-y:auto;padding:20px;border-right:1px solid var(--border)">
          <div class="segment" style="margin-bottom:16px"><button data-el="expBtn" class="active">支出</button><button data-el="incBtn">收入</button></div>
          <div style="display:flex;align-items:center;gap:10px;background:var(--fill);border:2px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:8px">
            <span data-el="sign" style="font-size:26px;font-weight:600;color:var(--expense)">−</span>
            <span style="font-size:13px;color:var(--muted2)">NT$</span>
            <input data-el="amountInput" type="number" min="0" step="0.01" placeholder="0" class="mono" style="flex:1;border:none;background:none;outline:none;font-size:32px;font-weight:500;color:var(--text);width:100%;letter-spacing:-1px">
            <button data-el="calcToggle" class="icon-btn" title="計算機"><i class="ti ti-calculator"></i></button>
          </div>
          <div data-el="keypadPanel" class="keypad hidden" style="margin-bottom:16px">${keypadHtml()}</div>
          <div style="font-size:13px;color:var(--muted2);margin:12px 0 8px">分類</div>
          <div data-el="catArea"></div>
          <div style="font-size:13px;color:var(--muted2);margin:12px 0 8px">錢包</div>
          <div data-el="walletArea" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px"></div>
          <div data-el="locationWrap" class="hidden">
            <div style="font-size:13px;color:var(--muted2);margin:12px 0 8px">位置</div>
            <div data-el="locationArea" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px"></div>
          </div>
          <div data-el="splitWrap" class="hidden" style="margin-top:8px">
            <button data-el="splitToggle" type="button" style="border:none;background:none;color:var(--muted2);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:2px 0">
              <i class="ti ti-chevron-right" data-el="splitChevron" style="transition:transform .15s"></i>這筆包含要轉交的錢？
            </button>
            <div data-el="splitFields" class="hidden" style="margin-top:8px;background:var(--fill);border-radius:12px;padding:12px;display:flex;gap:10px">
              <div style="flex:1">
                <div style="font-size:12px;color:var(--muted2);margin-bottom:6px">受限金額（鎖住）</div>
                <input data-el="restrictedAmount" type="number" min="0" step="0.01" class="field mono" placeholder="0">
              </div>
              <div style="flex:1">
                <div style="font-size:12px;color:var(--muted2);margin-bottom:6px">用途</div>
                <input data-el="restrictedNote" class="field" placeholder="如：學費代收">
              </div>
            </div>
          </div>
          <div style="font-size:13px;color:var(--muted2);margin:6px 0 8px">備註 / 日期</div>
          <div style="display:flex;gap:10px;margin-bottom:14px">
            <input data-el="note" class="field" placeholder="加個備註…" style="flex:1">
            <input data-el="date" type="date" class="field" style="width:160px" value="${date}">
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <button data-el="recBtn" title="設為定期" style="display:flex;align-items:center;gap:5px;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:10px 13px;cursor:pointer;color:var(--muted)"><i class="ti ti-repeat"></i><span style="font-weight:600;font-size:13px">設為定期</span></button>
            <div data-el="recRow" class="hidden" style="flex:1;display:flex;align-items:center;gap:9px;background:var(--accent-soft);border:1px solid var(--accent-soft-border);border-radius:12px;padding:10px 13px;cursor:pointer">
              <i class="ti ti-calendar-repeat" style="color:var(--accent)"></i>
              <span data-el="recSummary" style="flex:1;font-weight:600;font-size:13px;color:var(--accent-soft-text)"></span>
              <span style="font-size:13px;color:var(--accent)">編輯</span>
            </div>
          </div>
        </div>
        <!-- 右欄：發票入口 -->
        <div class="noscroll" style="overflow-y:auto;padding:20px;background:var(--bg)">
          <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:4px"><i class="ti ti-qrcode" style="color:var(--accent);margin-right:6px"></i>電子發票</div>
          <div style="font-size:12px;color:var(--muted2);margin-bottom:14px">輸入號碼或上傳圖片查詢，自動帶入金額與明細</div>
          <input data-el="invNo" class="field" placeholder="發票號碼（如 AB-12345678）" style="margin-bottom:10px">
          <label style="display:flex;align-items:center;justify-content:center;gap:8px;border:1px dashed var(--border-strong);border-radius:12px;padding:16px;cursor:pointer;color:var(--muted);margin-bottom:10px">
            <i class="ti ti-photo-up" style="font-size:20px"></i>上傳發票圖片
            <input type="file" accept="image/*" style="display:none" data-el="invFile">
          </label>
          <button data-el="invoice" class="btn-primary" style="width:100%"><i class="ti ti-search"></i> 查詢並帶入</button>
          <div style="font-size:12px;color:var(--faint);margin-top:12px;line-height:1.6">※ 品項明細示範用途；正式串接財政部電子發票平台 API 後可帶入實際明細。</div>
        </div>
      </div>
      <div style="padding:14px 20px;border-top:1px solid var(--border);flex-shrink:0">
        <button data-el="save" data-save="1" class="btn-primary" style="width:100%">儲存</button>
      </div>
    </div>`;
  host.querySelector('[data-el="date"]').addEventListener('change', (e) => { date = e.target.value || todayStr(); });
  host.querySelector('[data-el="note"]').addEventListener('input', (e) => { note = e.target.value; });
  host.querySelector('[data-el="restrictedAmount"]').addEventListener('input', (e) => { restrictedAmountStr = e.target.value; });
  host.querySelector('[data-el="restrictedNote"]').addEventListener('input', (e) => { restrictedNote = e.target.value; });
  const amountInput = host.querySelector('[data-el="amountInput"]');
  amountInput.addEventListener('input', (e) => { buf = e.target.value; acc = null; op = null; });
  // 點遮罩外關閉
  host.addEventListener('click', (e) => { if (e.target === host) close(); });
  host.addEventListener('click', onHostClick);
  document.body.appendChild(host);
}

/** 開啟記一筆（依視窗寬度選外殼） */
export function openAdd(initialType = 'expense') {
  if (host) return;
  mode = window.innerWidth >= 900 ? 'desktop' : 'mobile';
  type = initialType; category = ''; walletId = null; location = null; date = todayStr(); note = ''; recurring = false;
  splitOpen = false; restrictedAmountStr = ''; restrictedNote = '';
  acc = null; op = null; buf = '';
  if (mode === 'desktop') buildDesktop(); else buildMobile();
  renderCatArea();
  renderWalletArea();
  renderLocationArea();
  refresh();
  // 錢包清單快取可能尚未載入過（例如尚未開過設定頁的錢包管理）；抓回後重繪一次 chips
  fetchWallets().then(renderWalletArea).catch(() => {});
}
