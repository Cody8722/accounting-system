/**
 * invoice.js — 電子發票掃描（免 AppID、純前端 QR 解析，合法）。
 *
 * 背景：財政部查詢明細/載具 API 自 2023 起限公司且須 ISO27001，個人不可用。
 * 故本模組只做「不需 AppID、純靠 QR Code 自行解析」的部分：
 *   1. 掃 QR（相機／上傳圖片，用 jsQR）→ 解析證明聯左側前 77 碼固定格式
 *      → 帶入 總金額、開立日期、發票號碼、隨機碼、賣方統編
 *   2. 手動輸入發票（掃不到時備援）
 *   3. 以發票號碼去重，避免同一張重複記帳
 *
 * 明確不做（需 AppID，個人拿不到）：品項明細、載具同步、重查、對獎。
 */

import { apiJson } from './api.js';
import { showToast, todayStr, escapeHtml } from './utils.js';

/**
 * 解析台灣電子發票證明聯左側 QR（前 77 碼固定格式）。
 * 號碼(10)+民國日期(7)+隨機碼(4)+銷售額(8hex)+總計(8hex)+買方統編(8)+賣方統編(8)+加密(24)
 * @returns {{number,date,randomCode,salesAmount,totalAmount,buyerId,sellerId}|null}
 */
export function parseInvoiceQR(text) {
  // 格式驗證：左側發票頭固定至少 77 碼；掃到右側加密那組會不符 → 回 null，由掃描迴圈靜默忽略續掃
  if (!text || text.length < 77) return null;
  const number = text.slice(0, 10);
  if (!/^[A-Z]{2}\d{8}$/.test(number)) return null;   // 發票號碼：2 英文 + 8 數字
  const roc = text.slice(10, 17);
  if (!/^\d{7}$/.test(roc)) return null;               // 民國日期：7 位數字
  const y = parseInt(roc.slice(0, 3), 10) + 1911;
  const date = `${y}-${roc.slice(3, 5)}-${roc.slice(5, 7)}`;
  const randomCode = text.slice(17, 21);
  const salesAmount = parseInt(text.slice(21, 29), 16);
  const totalAmount = parseInt(text.slice(29, 37), 16);
  const buyerId = text.slice(37, 45);
  const sellerId = text.slice(45, 53);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;
  return { number, date, randomCode, salesAmount, totalAmount, buyerId, sellerId };
}

/** 以發票號碼查是否已記過（去重） */
async function isDuplicate(number) {
  try {
    const data = await apiJson(`/admin/api/accounting/records?search=${encodeURIComponent(number)}&limit=1`);
    const total = Array.isArray(data) ? data.length : (data.total ?? (data.records || []).length);
    return total > 0;
  } catch { return false; }
}

/** 用 jsQR 解一張畫布影像 */
function scanCanvas(ctx, w, h) {
  if (!window.jsQR) return null;
  const img = ctx.getImageData(0, 0, w, h);
  const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return code ? code.data : null;
}

export function openInvoiceScan(onSingle) {
  let stop = null;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="sheet">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-emphasis)">
        <span style="font-weight:600;font-size:16px;color:var(--text)"><i class="ti ti-qrcode" style="margin-right:var(--space-2xs);color:var(--accent)"></i>掃描電子發票</span>
        <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
      </div>
      <div data-el="stage"></div>
    </div>`;
  const stage = ov.querySelector('[data-el="stage"]');
  const cleanup = () => { if (stop) { try { stop(); } catch { /* ignore */ } stop = null; } };
  const finish = (res) => { cleanup(); ov.remove(); onSingle && onSingle(res); };

  async function renderResult(p) {
    cleanup();
    const dup = await isDuplicate(p.number);
    stage.innerHTML = `
      <div style="background:var(--income-soft);border:1px solid var(--income);border-radius:12px;padding:10px var(--space-base);margin-bottom:var(--space-base);display:flex;align-items:center;gap:var(--space-xs)">
        <i class="ti ti-circle-check" style="color:var(--income)"></i><span style="font-size:13px;color:var(--income)">已讀取發票</span>
      </div>
      ${dup ? '<div style="background:var(--expense-soft);border-radius:12px;padding:10px var(--space-base);margin-bottom:var(--space-base);font-size:13px;color:var(--expense)"><i class="ti ti-alert-triangle"></i> 這張發票先前已記過帳，仍可再帶入。</div>' : ''}
      <div style="background:var(--fill);border-radius:14px;padding:var(--space-emphasis);margin-bottom:var(--space-emphasis)">
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-2xs)"><span style="color:var(--muted2);font-size:13px">總金額</span><span class="mono" style="color:var(--text);font-weight:600">NT$ ${p.totalAmount}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-3xs)"><span style="color:var(--muted2);font-size:13px">發票號碼</span><span class="mono" style="color:var(--text2);font-size:13px">${escapeHtml(p.number)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-3xs)"><span style="color:var(--muted2);font-size:13px">開立日期</span><span class="mono" style="color:var(--text2);font-size:13px">${p.date}</span></div>
        ${p.sellerId && /\d{8}/.test(p.sellerId) ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--muted2);font-size:13px">賣方統編</span><span class="mono" style="color:var(--text2);font-size:13px">${escapeHtml(p.sellerId)}</span></div>` : ''}
      </div>
      <button data-el="use" class="btn-primary" style="width:100%">帶入這筆（NT$ ${p.totalAmount}）</button>
      <div style="font-size:12px;color:var(--faint);margin-top:10px;line-height:1.6">※ 號碼／日期／金額／賣方統編由 QR 離線解析。品項明細需財政部 API（限公司申請），個人版不提供。</div>`;
    stage.querySelector('[data-el="use"]').onclick = () => finish({
      total: p.totalAmount, date: p.date, number: p.number,
      note: `發票 ${p.number}`, category: '其他支出',
    });
  }

  function renderHome() {
    stage.innerHTML = `
      <button data-el="camBtn" class="btn-primary" style="width:100%;margin-bottom:10px"><i class="ti ti-camera"></i> 開啟相機掃描</button>
      <label class="btn-primary" style="width:100%;margin-bottom:var(--space-emphasis);background:var(--fill);color:var(--text);box-shadow:none;cursor:pointer"><i class="ti ti-photo-up"></i> 上傳發票圖片<input data-el="file" type="file" accept="image/*" style="display:none"></label>
      <div style="border-top:1px solid var(--border);padding-top:var(--space-base)">
        <div style="font-size:12px;color:var(--muted2);margin-bottom:var(--space-xs)">掃不到？手動輸入：</div>
        <button data-el="manual" class="btn-primary" style="width:100%;background:var(--fill);color:var(--text2);box-shadow:none;font-weight:500"><i class="ti ti-keyboard"></i> 手動輸入發票</button>
      </div>`;
    stage.querySelector('[data-el="camBtn"]').onclick = startCamera;
    stage.querySelector('[data-el="file"]').onchange = (e) => decodeImage(e.target.files[0]);
    stage.querySelector('[data-el="manual"]').onclick = renderManual;
  }

  function renderManual() {
    cleanup();
    stage.innerHTML = `
      <label style="font-size:13px;color:var(--muted2)">發票號碼（選填，供去獎/去重）</label>
      <input data-el="num" class="field mono" style="margin:var(--space-2xs) 0 var(--space-base);text-transform:uppercase" placeholder="AB12345678" maxlength="10">
      <label style="font-size:13px;color:var(--muted2)">金額</label>
      <input data-el="amt" type="number" min="0.01" step="0.01" class="field mono" style="margin:var(--space-2xs) 0 var(--space-base)" placeholder="0">
      <label style="font-size:13px;color:var(--muted2)">日期</label>
      <input data-el="date" type="date" class="field" style="margin:var(--space-2xs) 0 var(--space-lg)" value="${todayStr()}">
      <button data-el="ok" class="btn-primary" style="width:100%">帶入</button>
      <button data-el="back" class="btn-primary" style="width:100%;margin-top:var(--space-xs);background:var(--fill);color:var(--text3);box-shadow:none;font-weight:500">返回掃描</button>`;
    stage.querySelector('[data-el="back"]').onclick = renderHome;
    stage.querySelector('[data-el="ok"]').onclick = async () => {
      const amt = parseFloat(stage.querySelector('[data-el="amt"]').value);
      if (!amt || amt <= 0) { showToast('請輸入金額', 'warning'); return; }
      const num = stage.querySelector('[data-el="num"]').value.trim().toUpperCase();
      const date = stage.querySelector('[data-el="date"]').value || todayStr();
      if (num && await isDuplicate(num)) showToast('提醒：此發票號碼先前已記過', 'warning');
      finish({ total: amt, date, number: num, note: num ? `發票 ${num}` : '', category: '其他支出' });
    };
  }

  async function startCamera() {
    if (!window.jsQR) { showToast('掃碼元件未載入', 'error'); return; }
    stage.innerHTML = `
      <div style="position:relative;border-radius:16px;overflow:hidden;background:#000;margin-bottom:var(--space-base)">
        <video data-el="video" playsinline muted style="width:100%;display:block;max-height:320px;object-fit:cover"></video>
        <div style="position:absolute;left:6%;right:6%;bottom:14%;height:34%;border:2px solid rgba(255,255,255,.7);border-radius:12px;pointer-events:none"></div>
      </div>
      <div style="text-align:center;font-size:13px;color:var(--muted2);margin-bottom:10px">將發票下方 QR Code 區域置中對準框內…</div>
      <button data-el="back" class="btn-primary" style="width:100%;background:var(--fill);color:var(--text3);box-shadow:none;font-weight:500">返回</button>`;
    stage.querySelector('[data-el="back"]').onclick = () => { cleanup(); renderHome(); };
    const video = stage.querySelector('[data-el="video"]');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      let stopped = false;
      stop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); };
      const loop = () => {
        if (stopped) return;
        if (video.readyState >= 2) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const raw = scanCanvas(ctx, canvas.width, canvas.height);
          const p = raw && parseInvoiceQR(raw);
          if (p) { renderResult(p); return; }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      stage.innerHTML = `<div style="background:var(--expense-soft);border-radius:12px;padding:var(--space-base);margin-bottom:var(--space-base);font-size:13px;color:var(--expense)">無法開啟相機：${escapeHtml(e.message || '權限被拒')}</div><button data-el="back" class="btn-primary" style="width:100%;background:var(--fill);color:var(--text);box-shadow:none">返回</button>`;
      stage.querySelector('[data-el="back"]').onclick = renderHome;
    }
  }

  async function decodeImage(file) {
    if (!file) return;
    if (!window.jsQR) { showToast('掃碼元件未載入', 'error'); return; }
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const raw = scanCanvas(ctx, canvas.width, canvas.height);
      const p = raw && parseInvoiceQR(raw);
      if (p) { renderResult(p); return; }
      showToast('圖片中找不到有效的發票 QR 碼', 'warning');
    } catch (e) {
      showToast('讀取圖片失敗：' + (e.message || ''), 'error');
    }
  }

  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) { cleanup(); ov.remove(); } });
  document.body.appendChild(ov);
  renderHome();
}
