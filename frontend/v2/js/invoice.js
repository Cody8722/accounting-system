/**
 * invoice.js — 電子發票掃描。
 *
 * 真實可用（免申請、離線）：用相機或上傳圖片讀取發票右下角 QR 碼，
 * 解析台灣電子發票 QR 的固定欄位 → 發票號碼、開立日期、總金額，
 * 直接帶入記帳金額與日期。
 *
 * 示範用途（需後端串接財政部電子發票整合服務平台 API + AppID）：
 * 「逐項明細」不在 QR 內，需以發票號碼+隨機碼查詢平台 API，此處以範例示範。
 */

import { apiJson } from './api.js';
import { CATEGORY_TREE } from './config.js';
import { showToast, todayStr, escapeHtml } from './utils.js';
import { emit } from './store.js';

const hasDetector = typeof window.BarcodeDetector !== 'undefined';

/**
 * 解析台灣電子發票 QR（左側條碼）固定欄位。
 * 版面：號碼(10) + 民國日期(7) + 隨機碼(4) + 銷售額(8,hex) + 總計(8,hex) + ...
 * @returns {{number,date,randomCode,salesAmount,totalAmount}|null}
 */
export function parseInvoiceQR(text) {
  if (!text || text.length < 37) return null;
  const number = text.slice(0, 10);
  if (!/^[A-Z]{2}\d{8}$/.test(number)) return null;
  const roc = text.slice(10, 17);            // YYYMMDD（民國年3+月2+日2）
  const y = parseInt(roc.slice(0, 3), 10) + 1911;
  const m = roc.slice(3, 5), d = roc.slice(5, 7);
  const date = `${y}-${m}-${d}`;
  const randomCode = text.slice(17, 21);
  const salesAmount = parseInt(text.slice(21, 29), 16);
  const totalAmount = parseInt(text.slice(29, 37), 16);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;
  return { number, date, randomCode, salesAmount, totalAmount };
}

/** 示範用假明細（真實明細需財政部 API） */
const DEMO_ITEMS = [
  { name: '鮮乳 936ml', price: 89, category: '飲料' },
  { name: '雞蛋 10入', price: 65, category: '其他支出' },
  { name: '全麥吐司', price: 45, category: '早餐' },
];
const expenseLeaves = CATEGORY_TREE.expense.flatMap((g) => g.items);

export function openInvoiceScan(onSingle) {
  let stopCamera = null;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-weight:600;font-size:16px;color:var(--text)"><i class="ti ti-qrcode" style="margin-right:6px;color:var(--accent)"></i>掃描電子發票</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div data-el="stage"></div>
    </div>`;
  const stage = ov.querySelector('[data-el="stage"]');

  function cleanup() { if (stopCamera) { try { stopCamera(); } catch { /* ignore */ } stopCamera = null; } }
  function done(res) { cleanup(); ov.remove(); onSingle && onSingle(res); }

  // ---- 讀到 QR 後的結果畫面 ----
  function renderResult(p) {
    cleanup();
    stage.innerHTML = `
      <div style="background:var(--income-soft);border:1px solid var(--income);border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <i class="ti ti-circle-check" style="color:var(--income)"></i><span style="font-size:13px;color:var(--income)">已讀取 QR 碼</span>
      </div>
      <div style="background:var(--fill);border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:var(--muted2);font-size:13px">總金額</span><span class="mono" style="color:var(--text);font-weight:600">NT$ ${p.totalAmount}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--muted2);font-size:13px">發票號碼</span><span class="mono" style="color:var(--text2);font-size:13px">${escapeHtml(p.number)}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--muted2);font-size:13px">開立日期</span><span class="mono" style="color:var(--text2);font-size:13px">${p.date}</span></div>
      </div>
      <button data-el="use" class="btn-primary" style="width:100%;margin-bottom:10px">帶入這筆（NT$ ${p.totalAmount}）</button>
      <button data-el="demoSplit" class="btn-primary" style="width:100%;background:var(--fill);color:var(--text2);box-shadow:none;font-weight:500"><i class="ti ti-list-details"></i> 逐項拆分（示範）</button>
      <div style="font-size:12px;color:var(--faint);margin-top:10px;line-height:1.6">※ 號碼/日期/金額由 QR 離線解析；逐項明細需後端串接財政部平台 API，此處為示範。</div>`;
    stage.querySelector('[data-el="use"]').onclick = () => done({ total: p.totalAmount, date: p.date, note: `發票 ${p.number}`, category: '其他支出' });
    stage.querySelector('[data-el="demoSplit"]').onclick = () => renderDemoSplit(p);
  }

  // ---- 逐項拆分（示範假明細，可各自指定分類、直接建立多筆）----
  function renderDemoSplit(p) {
    cleanup();
    const items = DEMO_ITEMS.map((i) => ({ ...i }));
    const catSel = (v) => `<select class="field" style="width:auto;padding:6px 8px;font-size:13px">${expenseLeaves.map((l) => `<option ${l === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>`;
    stage.innerHTML = `
      <div style="font-size:12px;color:var(--muted2);margin-bottom:10px">示範明細（實際明細需 API）。可各自指定分類後建立多筆：</div>
      <div data-el="items" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px"></div>
      <button data-el="commit" class="btn-primary" style="width:100%">記入 ${items.length} 筆</button>`;
    const wrap = stage.querySelector('[data-el="items"]');
    wrap.innerHTML = items.map((it, i) => `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="flex:1;font-size:14px;color:var(--text)">${escapeHtml(it.name)}</span>
        <span class="mono" style="font-size:13px;color:var(--text2)">${it.price}</span>
        <span data-idx="${i}">${catSel(it.category)}</span>
      </div>`).join('');
    wrap.querySelectorAll('[data-idx]').forEach((w) => {
      const i = Number(w.dataset.idx);
      w.querySelector('select').onchange = (e) => { items[i].category = e.target.value; };
    });
    stage.querySelector('[data-el="commit"]').onclick = async () => {
      try {
        for (const it of items) {
          await apiJson('/admin/api/accounting/records', {
            method: 'POST',
            body: JSON.stringify({ type: 'expense', amount: it.price, category: it.category, date: p ? p.date : todayStr(), description: `發票${p ? ' ' + p.number : ''}・${it.name}`, expense_type: null }),
          });
        }
        showToast(`已記入 ${items.length} 筆`, 'success');
        emit('records:changed');
        cleanup(); ov.remove();
      } catch (ex) { showToast(ex.message, 'error'); }
    };
  }

  // ---- 入口畫面：相機 / 上傳 / 手動 ----
  function renderHome() {
    stage.innerHTML = `
      ${hasDetector ? `
      <button data-el="camBtn" class="btn-primary" style="width:100%;margin-bottom:10px"><i class="ti ti-camera"></i> 開啟相機掃描</button>
      <label class="btn-primary" style="width:100%;margin-bottom:14px;background:var(--fill);color:var(--text);box-shadow:none;cursor:pointer"><i class="ti ti-photo-up"></i> 上傳發票圖片<input data-el="file" type="file" accept="image/*" style="display:none"></label>
      ` : `
      <div style="background:var(--expense-soft);border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px;color:var(--expense)">此瀏覽器不支援即時掃碼（BarcodeDetector）。可改用支援的瀏覽器，或用下方示範。</div>
      `}
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:12px;color:var(--muted2);margin-bottom:8px">沒有 QR？用範例示範流程：</div>
        <button data-el="demo" class="btn-primary" style="width:100%;background:var(--fill);color:var(--text2);box-shadow:none;font-weight:500">用範例發票示範</button>
      </div>`;
    const camBtn = stage.querySelector('[data-el="camBtn"]');
    if (camBtn) camBtn.onclick = startCamera;
    const file = stage.querySelector('[data-el="file"]');
    if (file) file.onchange = (e) => decodeImage(e.target.files[0]);
    stage.querySelector('[data-el="demo"]').onclick = () => renderResult({ number: 'AB12345678', date: todayStr(), randomCode: '0000', salesAmount: 190, totalAmount: 199 });
  }

  async function startCamera() {
    stage.innerHTML = `
      <div style="position:relative;border-radius:16px;overflow:hidden;background:#000;margin-bottom:12px">
        <video data-el="video" playsinline muted style="width:100%;display:block;max-height:320px;object-fit:cover"></video>
        <div style="position:absolute;inset:16% 20%;border:2px solid rgba(255,255,255,.7);border-radius:12px;pointer-events:none"></div>
      </div>
      <div style="text-align:center;font-size:13px;color:var(--muted2)">將發票右下角 QR 碼對準框內…</div>`;
    const video = stage.querySelector('[data-el="video"]');
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      let stopped = false;
      stopCamera = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); };
      const loop = async () => {
        if (stopped) return;
        try {
          const codes = await detector.detect(video);
          for (const c of codes) {
            const p = parseInvoiceQR(c.rawValue);
            if (p) { renderResult(p); return; }
          }
        } catch { /* 單幀偵測失敗忽略 */ }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      stage.innerHTML = `<div style="background:var(--expense-soft);border-radius:12px;padding:12px;margin-bottom:12px;font-size:13px;color:var(--expense)">無法開啟相機：${escapeHtml(e.message || '權限被拒')}</div><button data-el="back" class="btn-primary" style="width:100%;background:var(--fill);color:var(--text);box-shadow:none">返回</button>`;
      stage.querySelector('[data-el="back"]').onclick = renderHome;
    }
  }

  async function decodeImage(file) {
    if (!file) return;
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const bmp = await createImageBitmap(file);
      const codes = await detector.detect(bmp);
      for (const c of codes) {
        const p = parseInvoiceQR(c.rawValue);
        if (p) { renderResult(p); return; }
      }
      showToast('圖片中找不到有效的發票 QR 碼', 'warning');
    } catch (e) {
      showToast('讀取圖片失敗：' + (e.message || ''), 'error');
    }
  }

  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) { cleanup(); ov.remove(); } });
  document.body.appendChild(ov);
  renderHome();
}
