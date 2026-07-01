/**
 * invoice.js — 電子發票掃描（前端 DEMO）。
 * QR 掃描動畫 → 帶出範例發票（賣方/號碼/日期/總額 + 品項明細）。
 * 可「整筆記入」（回傳給 add.js）或「逐項拆分」逐項指定分類、直接建立多筆記錄。
 * 真實品項明細需後端串接財政部電子發票平台 API；此處為示範假資料。
 */

import { apiJson } from './api.js';
import { CATEGORY_TREE } from './config.js';
import { showToast, todayStr, escapeHtml } from './utils.js';
import { emit } from './store.js';

const SAMPLE = {
  seller: '全聯福利中心',
  number: 'AB-12345678',
  date: todayStr(),
  items: [
    { name: '鮮乳 936ml', price: 89, category: '飲料' },
    { name: '雞蛋 10入', price: 65, category: '其他支出' },
    { name: '全麥吐司', price: 45, category: '早餐' },
  ],
};
const total = (its) => its.reduce((s, i) => s + i.price, 0);

const expenseLeaves = CATEGORY_TREE.expense.flatMap((g) => g.items);
function catSelect(value) {
  return `<select class="field" style="width:auto;padding:6px 8px;font-size:13px">${expenseLeaves.map((l) => `<option ${l === value ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
}

export function openInvoiceScan(onSingle) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="sheet" data-el="body">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-weight:600;font-size:16px;color:var(--text)"><i class="ti ti-qrcode" style="margin-right:6px;color:var(--accent)"></i>掃描電子發票</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div data-el="stage"></div>
    </div>`;
  const stage = ov.querySelector('[data-el="stage"]');

  function renderScanning() {
    stage.innerHTML = `
      <div style="position:relative;height:200px;border-radius:16px;background:#0c0c10;overflow:hidden;display:flex;align-items:center;justify-content:center">
        <div style="width:150px;height:150px;border:2px solid rgba(255,255,255,.35);border-radius:14px;position:relative">
          <div style="position:absolute;left:8%;right:8%;height:2px;background:var(--accent);box-shadow:0 0 12px var(--accent);animation:scanline 1.6s ease-in-out infinite"></div>
        </div>
        <div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#bbb;font-size:12px">對準發票右下角 QR 碼…</div>
      </div>
      <style>@keyframes scanline{0%{top:8%}50%{top:88%}100%{top:8%}}</style>`;
    setTimeout(renderResult, 1500);
  }

  function renderResult() {
    let items = SAMPLE.items.map((i) => ({ ...i }));
    stage.innerHTML = `
      <div style="background:var(--fill);border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-weight:600;color:var(--text)">${escapeHtml(SAMPLE.seller)}</span><span class="mono" style="color:var(--text2)">NT$ ${total(items)}</span></div>
        <div style="font-size:12px;color:var(--muted2)">${SAMPLE.number}・${SAMPLE.date}</div>
      </div>
      <div data-el="items" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px"></div>
      <div style="display:flex;gap:10px">
        <button data-el="whole" class="btn-primary" style="flex:1;background:var(--fill);color:var(--text);box-shadow:none">整筆記入</button>
        <button data-el="split" class="btn-primary" style="flex:1">逐項拆分記帳</button>
      </div>`;
    const itemsWrap = stage.querySelector('[data-el="items"]');
    let splitMode = false;
    function drawItems() {
      itemsWrap.innerHTML = items.map((it, idx) => `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="flex:1;font-size:14px;color:var(--text)">${escapeHtml(it.name)}</span>
          <span class="mono" style="font-size:13px;color:var(--text2)">${it.price}</span>
          ${splitMode ? `<span data-idx="${idx}">${catSelect(it.category)}</span>` : ''}
        </div>`).join('');
      if (splitMode) {
        itemsWrap.querySelectorAll('[data-idx]').forEach((wrap) => {
          const idx = Number(wrap.dataset.idx);
          wrap.querySelector('select').addEventListener('change', (e) => { items[idx].category = e.target.value; });
        });
      }
    }
    drawItems();

    stage.querySelector('[data-el="whole"]').addEventListener('click', () => {
      ov.remove();
      onSingle && onSingle({ total: total(items), seller: SAMPLE.seller, note: SAMPLE.seller, category: '其他支出' });
    });
    stage.querySelector('[data-el="split"]').addEventListener('click', async (e) => {
      if (!splitMode) { splitMode = true; drawItems(); e.target.textContent = '確認記入 ' + items.length + ' 筆'; return; }
      try {
        for (const it of items) {
          await apiJson('/admin/api/accounting/records', {
            method: 'POST',
            body: JSON.stringify({ type: 'expense', amount: it.price, category: it.category, date: SAMPLE.date, description: `${SAMPLE.seller}・${it.name}`, expense_type: null }),
          });
        }
        showToast(`已記入 ${items.length} 筆`, 'success');
        emit('records:changed');
        ov.remove();
      } catch (ex) { showToast(ex.message, 'error'); }
    });
  }

  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
  renderScanning();
}
