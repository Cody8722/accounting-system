/**
 * wallet.js — 資金錢包：資料層（快取清單）、管理 UI（設定頁掛載）、
 * 帳本頁的即時餘額摘要條。
 * 串 GET/POST/PUT/DELETE /admin/api/wallets、GET /admin/api/wallets/balances。
 *
 * 「錢包」是同一登入帳號底下的資金來源分類（如「零用錢」「薪資帳戶」），
 * 與登入帳號（user_id）本身無關；記錄的 wallet_id 為可選欄位，
 * 未指定時視為「未分類」，不影響既有記錄。
 */

import { apiJson, apiCall } from './api.js';
import { escapeHtml, showToast, showConfirm, fmtMoney } from './utils.js';
import { emit } from './store.js';

let cache = null; // 錢包清單快取（不含已封存）；null = 尚未載入過

/** 取得錢包清單（快取；force=true 強制重新拉取） */
export async function fetchWallets(force = false) {
  if (cache && !force) return cache;
  try {
    cache = await apiJson('/admin/api/wallets');
  } catch (e) {
    cache = cache || [];
    throw e;
  }
  return cache;
}

/** 同步讀取目前快取（未 fetch 過時回傳空陣列，不觸發網路請求） */
export function walletsCache() { return cache || []; }

/** id → 錢包 meta（找不到回傳 null，包含「已封存但曾經存在」的情況——僅在快取中找不到） */
export function walletMeta(id) {
  if (!id) return null;
  return (cache || []).find((w) => w.id === id) || null;
}

async function invalidate() {
  await fetchWallets(true).catch(() => {});
  emit('wallets:changed');
}

/** 記一筆表單用：錢包選擇 chips（含「未分類」，永遠排最前） */
export function walletChipsHtml(selectedId) {
  const wallets = walletsCache();
  const chip = (id, name, icon) => `<button type="button" class="chip${(selectedId || null) === id ? ' active' : ''}" data-wallet="${id || ''}">${icon ? `<i class="ti ${icon}"></i>` : '<i class="ti ti-tag"></i>'}<span>${escapeHtml(name)}</span></button>`;
  return chip(null, '未分類', 'ti-tag') + wallets.map((w) => chip(w.id, w.name, w.icon)).join('');
}

/* ============ 帳本頁：即時餘額摘要條 ============ */

/** 回傳帳本頁用的錢包餘額橫向摘要條 HTML（自帶資料抓取，失敗時回傳空字串不影響帳本頁其他部分） */
export async function walletBalanceStripHtml() {
  let balances;
  try { balances = await apiJson('/admin/api/wallets/balances'); } catch { return ''; }
  if (!balances || !balances.length) return '';
  // 只有一個桶且是「未分類」→ 使用者根本還沒建立任何錢包，不顯示這條摘要，避免空氣感的 UI
  if (balances.length === 1 && balances[0].wallet_id === null) return '';

  const card = (b) => `<div class="wallet-pill">
      <div class="wallet-pill-name"><i class="ti ${b.icon || 'ti-tag'}"></i>${escapeHtml(b.name)}</div>
      <div class="wallet-pill-amt mono" style="color:${b.balance >= 0 ? 'var(--income)' : 'var(--expense)'}">${b.balance >= 0 ? '' : '−'}${fmtMoney(Math.abs(b.balance))}</div>
    </div>`;
  return `<div class="wallet-strip noscroll">${balances.map(card).join('')}</div>`;
}

/* ============ 設定頁：錢包管理面板 ============ */

function walletRowHtml(w, balance) {
  const bal = balance != null ? balance : 0;
  if (w.archived) {
    return `<div class="list-row" data-wallet-row="${w.id}">
      <div class="cat-icon" style="width:34px;height:34px;background:var(--fill)"><i class="ti ${w.icon || 'ti-tag'}" style="color:var(--faint)"></i></div>
      <div style="flex:1;min-width:0">
        <span style="font-weight:500;font-size:14px;color:var(--muted)">${escapeHtml(w.name)}</span>
        <div style="font-size:12px;color:var(--faint)">已封存</div>
      </div>
      <button class="icon-btn" data-restore-wallet="${w.id}" title="還原"><i class="ti ti-arrow-back-up" style="color:var(--accent)"></i></button>
    </div>`;
  }
  return `<div class="list-row" data-wallet-row="${w.id}">
    <div class="cat-icon" style="width:34px;height:34px;background:${w.color || 'var(--fill)'}1f"><i class="ti ${w.icon || 'ti-tag'}" style="color:${w.color || 'var(--muted)'}"></i></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:500;font-size:14px;color:var(--text)">${escapeHtml(w.name)}</span>
        ${w.is_default ? '<span style="font-size:11px;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:1px 8px">預設</span>' : ''}
      </div>
      <div class="mono" style="font-size:12px;color:${bal >= 0 ? 'var(--muted2)' : 'var(--expense)'}">${bal >= 0 ? '' : '−'}NT$ ${fmtMoney(Math.abs(bal))}</div>
    </div>
    <button class="icon-btn" data-edit-wallet="${w.id}"><i class="ti ti-pencil"></i></button>
    <button class="icon-btn" data-archive-wallet="${w.id}"><i class="ti ti-archive" style="color:var(--expense)"></i></button>
  </div>`;
}

function openWalletForm(existing, onSaved) {
  const isEdit = !!existing;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span style="font-weight:600;font-size:17px;color:var(--text)">${isEdit ? '編輯錢包' : '新增錢包'}</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <label style="font-size:13px;color:var(--muted2)">名稱</label>
    <input data-el="name" class="field" style="margin:6px 0 14px" maxlength="30" placeholder="如：零用錢" value="${escapeHtml(existing ? existing.name : '')}">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:18px">
      <input data-el="isDefault" type="checkbox" ${existing && existing.is_default ? 'checked' : ''} style="width:18px;height:18px">
      <span style="font-size:14px;color:var(--text)">設為預設錢包</span>
    </label>
    <button class="btn-primary" data-save="1" style="width:100%">${isEdit ? '儲存' : '新增'}</button>
  </div>`;
  ov.querySelector('[data-save="1"]').onclick = async () => {
    const name = ov.querySelector('[data-el="name"]').value.trim();
    const isDefault = ov.querySelector('[data-el="isDefault"]').checked;
    if (!name) { showToast('請輸入錢包名稱', 'warning'); return; }
    try {
      if (isEdit) {
        await apiJson(`/admin/api/wallets/${existing.id}`, { method: 'PUT', body: JSON.stringify({ name, is_default: isDefault }) });
      } else {
        await apiJson('/admin/api/wallets', { method: 'POST', body: JSON.stringify({ name, is_default: isDefault }) });
      }
      showToast(isEdit ? '已更新' : '已新增', 'success');
      ov.remove();
      await invalidate();
      onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}

/** 設定頁呼叫：開啟錢包管理面板（列表含即時餘額、新增/編輯/封存） */
export async function openWalletManager() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span style="font-weight:600;font-size:17px;color:var(--text)">錢包管理</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div data-el="body"><div style="text-align:center;color:var(--muted2);padding:20px">載入中…</div></div>
  </div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);

  const body = ov.querySelector('[data-el="body"]');
  let showArchived = false;

  async function refresh() {
    let wallets, balances;
    try {
      [wallets, balances] = await Promise.all([
        apiJson(`/admin/api/wallets${showArchived ? '?show_archived=true' : ''}`),
        apiJson('/admin/api/wallets/balances').catch(() => []),
      ]);
      cache = wallets.filter((w) => !w.archived); // 同步共用快取，供 add.js 等其他模組使用
    } catch (e) {
      body.innerHTML = `<div style="color:var(--expense)">${escapeHtml(e.message)}</div>`;
      return;
    }
    const balMap = {};
    for (const b of balances) if (b.wallet_id) balMap[b.wallet_id] = b.balance;

    body.innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">
        ${wallets.length ? wallets.map((w) => walletRowHtml(w, balMap[w.id])).join('') : '<div style="text-align:center;color:var(--muted2);padding:20px">尚無錢包，新增一個開始分類記帳資金來源</div>'}
      </div>
      <button class="btn-primary" data-add="1" style="width:100%;margin-bottom:10px">＋ 新增錢包</button>
      <button class="link" data-toggle-archived="1" style="width:100%;text-align:center;padding:6px 0">${showArchived ? '只顯示使用中的錢包' : '顯示已封存的錢包'}</button>`;

    body.querySelectorAll('[data-edit-wallet]').forEach((b) => b.onclick = () => {
      const w = wallets.find((x) => x.id === b.dataset.editWallet);
      if (w) openWalletForm(w, refresh);
    });
    body.querySelectorAll('[data-archive-wallet]').forEach((b) => b.onclick = async () => {
      if (!(await showConfirm('封存這個錢包？歷史記錄會保留，可隨時還原。', { danger: false }))) return;
      try {
        const res = await apiCall(`/admin/api/wallets/${b.dataset.archiveWallet}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('封存失敗');
        showToast('已封存', 'success');
        await invalidate();
        refresh();
      } catch (e) { showToast(e.message, 'error'); }
    });
    body.querySelectorAll('[data-restore-wallet]').forEach((b) => b.onclick = async () => {
      try {
        await apiJson(`/admin/api/wallets/${b.dataset.restoreWallet}`, { method: 'PUT', body: JSON.stringify({ archived: false }) });
        showToast('已還原', 'success');
        await invalidate();
        refresh();
      } catch (e) { showToast(e.message, 'error'); }
    });
    body.querySelector('[data-add]').onclick = () => openWalletForm(null, refresh);
    body.querySelector('[data-toggle-archived]').onclick = () => { showArchived = !showArchived; refresh(); };
  }

  refresh();
}
