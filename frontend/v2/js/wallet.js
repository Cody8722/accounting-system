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
import { escapeHtml, showToast, showConfirm, fmtMoney, todayStr } from './utils.js';
import { emit } from './store.js';
import { flowTree } from './charts.js';

let cache = null; // 錢包清單快取（不含已封存）；null = 尚未載入過

/** 位置維度（銀行/現金）：固定兩個值，不像 wallets 可自訂 */
export const LOCATION_META = {
  bank: { label: '銀行', icon: 'ti-building-bank' },
  cash: { label: '現金', icon: 'ti-cash' },
};

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

/** 錢包 chips，不含「未分類」——內部轉移一定要指定帳戶 */
export function walletOnlyChipsHtml(selectedId) {
  const wallets = walletsCache();
  return wallets.map((w) => `<button type="button" class="chip${selectedId === w.id ? ' active' : ''}" data-wallet="${w.id}"><i class="ti ${w.icon || 'ti-tag'}"></i><span>${escapeHtml(w.name)}</span></button>`).join('');
}

/** 記一筆（收入）用：位置選擇 chips（銀行/現金，沒有「未分類」——收入位置必填） */
export function locationChipsHtml(selectedLocation) {
  return Object.entries(LOCATION_META).map(([loc, m]) => `<button type="button" class="chip${selectedLocation === loc ? ' active' : ''}" data-location="${loc}"><i class="ti ${m.icon}"></i><span>${m.label}</span></button>`).join('');
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

function walletRowHtml(w, locEntry) {
  const bal = locEntry ? locEntry.total_balance : 0;
  const bankBal = locEntry ? locEntry.locations.bank.balance : 0;
  const cashBal = locEntry ? locEntry.locations.cash.balance : 0;
  if (w.archived) {
    return `<div class="list-row" data-wallet-row="${w.id}">
      <div class="cat-icon" style="width:34px;height:34px;background:var(--fill)"><i class="ti ${w.icon || 'ti-tag'}" style="color:var(--faint)"></i></div>
      <div style="flex:1;min-width:0">
        <span style="font-weight:500;font-size:var(--text-emphasis);color:var(--muted)">${escapeHtml(w.name)}</span>
        <div style="font-size:var(--text-base);color:var(--faint)">已封存</div>
      </div>
      <button class="icon-btn" data-restore-wallet="${w.id}" title="還原"><i class="ti ti-arrow-back-up" style="color:var(--accent)"></i></button>
    </div>`;
  }
  return `<div class="list-row" data-wallet-row="${w.id}">
    <div class="cat-icon" style="width:34px;height:34px;background:${w.color || 'var(--fill)'}1f"><i class="ti ${w.icon || 'ti-tag'}" style="color:${w.color || 'var(--muted)'}"></i></div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-weight:500;font-size:var(--text-emphasis);color:var(--text)">${escapeHtml(w.name)}</span>
        ${w.is_default ? '<span style="font-size:11px;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:1px 8px">預設</span>' : ''}
      </div>
      <div class="mono" style="font-size:var(--text-base);color:${bal >= 0 ? 'var(--muted2)' : 'var(--expense)'}">${bal >= 0 ? '' : '−'}NT$ ${fmtMoney(Math.abs(bal))}</div>
      <div style="display:flex;gap:10px;margin-top:2px">
        <span style="font-size:11px;color:var(--faint)"><i class="ti ${LOCATION_META.bank.icon}"></i> ${fmtMoney(bankBal)}</span>
        <span style="font-size:11px;color:var(--faint)"><i class="ti ${LOCATION_META.cash.icon}"></i> ${fmtMoney(cashBal)}</span>
      </div>
    </div>
    <button class="icon-btn" data-flow-tree="${w.id}" title="資金流向"><i class="ti ti-sitemap" style="color:var(--muted2)"></i></button>
    <button class="icon-btn" data-edit-wallet="${w.id}"><i class="ti ti-pencil"></i></button>
    <button class="icon-btn" data-archive-wallet="${w.id}"><i class="ti ti-archive" style="color:var(--expense)"></i></button>
  </div>`;
}

function restrictedRowHtml(item) {
  const locMeta = LOCATION_META[item.location];
  return `<div class="list-row" data-restricted-row="${item.id}">
    <div class="cat-icon" style="width:34px;height:34px;background:var(--fill)"><i class="ti ti-lock" style="color:var(--muted2)"></i></div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:500;font-size:var(--text-emphasis);color:var(--text)">${escapeHtml(item.description || '（無說明）')}</div>
      <div style="font-size:11px;color:var(--faint)">${escapeHtml(item.wallet_name)}${locMeta ? ' · ' + locMeta.label : ''} · ${item.date}</div>
    </div>
    <span class="mono" style="font-weight:500;font-size:var(--text-emphasis);color:var(--text);margin-right:4px">NT$ ${fmtMoney(item.amount)}</span>
    <button class="icon-btn" data-unlock="${item.id}" title="解鎖"><i class="ti ti-lock-open" style="color:var(--accent)"></i></button>
  </div>`;
}

/** 解鎖受限資金：整筆一次處理（不支援部分解鎖），日期為實際交出去的那天 */
function openUnlockDialog(item, onUnlocked) {
  const ov = document.createElement('div');
  ov.className = 'overlay center';
  ov.style.zIndex = '99998';
  ov.innerHTML = `<div class="sheet dialog" style="padding:24px 20px">
    <div style="font-weight:600;font-size:var(--text-lg);color:var(--text);margin-bottom:6px">解鎖受限資金</div>
    <div style="font-size:13px;color:var(--muted2);margin-bottom:16px">${escapeHtml(item.description || '（無說明）')}・NT$ ${fmtMoney(item.amount)}</div>
    <label style="font-size:13px;color:var(--muted2)">實際交出去的日期</label>
    <input data-el="date" type="date" class="field" style="margin:6px 0 18px" value="${todayStr()}">
    <div style="display:flex;gap:12px">
      <button data-act="cancel" style="flex:1;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--surface);font-size:15px;color:var(--text3);cursor:pointer">取消</button>
      <button data-act="ok" style="flex:1;padding:13px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-size:15px;font-weight:600;cursor:pointer">確認解鎖</button>
    </div>
  </div>`;
  ov.querySelector('[data-act="cancel"]').onclick = () => ov.remove();
  ov.querySelector('[data-act="ok"]').onclick = async () => {
    const date = ov.querySelector('[data-el="date"]').value || todayStr();
    try {
      await apiJson(`/admin/api/accounting/records/${item.id}/unlock`, { method: 'POST', body: JSON.stringify({ date }) });
      showToast('已解鎖', 'success');
      ov.remove();
      emit('records:changed');
      if (onUnlocked) onUnlocked();
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

/** 資金流向樹：單一錢包的銀行/現金/受限資金 + 三種明確關聯（自動提領／拆分／解鎖）
 * 的靜態加總，不做一般收支的配對追蹤（圓餅圖已處理）、不下鑽明細。 */
function openFlowTree(wallet) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span style="font-weight:600;font-size:17px;color:var(--text)"><i class="ti ti-sitemap" style="margin-right:6px;color:var(--muted2)"></i>${escapeHtml(wallet.name)}・資金流向</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div data-el="body"><div style="text-align:center;color:var(--muted2);padding:20px">載入中…</div></div>
  </div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);

  const body = ov.querySelector('[data-el="body"]');
  apiJson(`/admin/api/wallets/${wallet.id}/flow-tree`)
    .then((data) => {
      body.innerHTML = '<div data-el="chart"></div>';
      flowTree(body.querySelector('[data-el="chart"]'), data);
    })
    .catch((e) => { body.innerHTML = `<div style="color:var(--expense)">${escapeHtml(e.message)}</div>`; });
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
      <span style="font-size:var(--text-emphasis);color:var(--text)">設為預設錢包</span>
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
    let wallets, summary, restricted;
    try {
      [wallets, summary, restricted] = await Promise.all([
        apiJson(`/admin/api/wallets${showArchived ? '?show_archived=true' : ''}`),
        apiJson('/admin/api/wallets/location-summary').catch(() => null),
        apiJson('/admin/api/wallets/restricted-funds').catch(() => null),
      ]);
      cache = wallets.filter((w) => !w.archived); // 同步共用快取，供 add.js 等其他模組使用
    } catch (e) {
      body.innerHTML = `<div style="color:var(--expense)">${escapeHtml(e.message)}</div>`;
      return;
    }
    const locMap = {};
    if (summary) for (const entry of summary.wallets) locMap[entry.wallet_id] = entry;

    const totalsBar = summary ? `<div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1;background:var(--fill);border-radius:12px;padding:10px 13px">
          <div style="font-size:11px;color:var(--muted2)"><i class="ti ${LOCATION_META.bank.icon}"></i> 銀行總計</div>
          <div class="mono" style="font-size:var(--text-lg);font-weight:500;color:var(--text)">NT$ ${fmtMoney(summary.location_totals.bank)}</div>
        </div>
        <div style="flex:1;background:var(--fill);border-radius:12px;padding:10px 13px">
          <div style="font-size:11px;color:var(--muted2)"><i class="ti ${LOCATION_META.cash.icon}"></i> 現金總計</div>
          <div class="mono" style="font-size:var(--text-lg);font-weight:500;color:var(--text)">NT$ ${fmtMoney(summary.location_totals.cash)}</div>
        </div>
      </div>` : '';

    // 受限資金：只有存在還鎖著的項目才顯示這張卡片，平常不佔畫面
    const restrictedSection = restricted && restricted.items.length ? `
      <div class="card" style="padding:14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-weight:600;font-size:var(--text-emphasis);color:var(--text)"><i class="ti ti-lock" style="color:var(--muted2);margin-right:6px"></i>受限資金</span>
          <span class="mono" style="font-size:var(--text-emphasis);color:var(--text)">NT$ ${fmtMoney(restricted.total)}</span>
        </div>
        ${restricted.items.map(restrictedRowHtml).join('')}
      </div>` : '';

    body.innerHTML = `
      ${totalsBar}
      ${restrictedSection}
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">
        ${wallets.length ? wallets.map((w) => walletRowHtml(w, locMap[w.id])).join('') : '<div style="text-align:center;color:var(--muted2);padding:20px">尚無錢包，新增一個開始分類記帳資金來源</div>'}
      </div>
      <button class="btn-primary" data-add="1" style="width:100%;margin-bottom:10px">＋ 新增錢包</button>
      <button class="link" data-el="transfer" style="width:100%;text-align:center;padding:6px 0"><i class="ti ti-arrows-right-left"></i> 內部轉移（存錢／領錢）</button>
      <button class="link" data-toggle-archived="1" style="width:100%;text-align:center;padding:6px 0">${showArchived ? '只顯示使用中的錢包' : '顯示已封存的錢包'}</button>`;

    if (restricted) {
      body.querySelectorAll('[data-unlock]').forEach((b) => b.onclick = () => {
        const item = restricted.items.find((x) => x.id === b.dataset.unlock);
        if (item) openUnlockDialog(item, refresh);
      });
    }

    body.querySelectorAll('[data-flow-tree]').forEach((b) => b.onclick = () => {
      const w = wallets.find((x) => x.id === b.dataset.flowTree);
      if (w) openFlowTree(w);
    });
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
    body.querySelector('[data-el="transfer"]').onclick = () => openTransferForm(refresh);
    body.querySelector('[data-toggle-archived]').onclick = () => { showArchived = !showArchived; refresh(); };
  }

  refresh();
}

/* ============ 內部轉移（存錢／領錢） ============ */

/** 開啟內部轉移表單：同一帳戶內，銀行/現金互轉，不計入收支統計 */
export function openTransferForm(onSaved) {
  const wallets = walletsCache();
  if (!wallets.length) {
    showToast('請先新增一個錢包', 'warning');
    return;
  }
  let walletId = (wallets.find((w) => w.is_default) || wallets[0]).id;
  let fromLocation = 'bank';

  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span style="font-weight:600;font-size:17px;color:var(--text)">內部轉移</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div style="font-size:var(--text-base);color:var(--muted2);margin-bottom:14px">同一帳戶內，銀行與現金之間的資金移動，不計入收入/支出統計</div>
    <label style="font-size:13px;color:var(--muted2)">帳戶</label>
    <div data-el="walletArea" style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 16px">${walletOnlyChipsHtml(walletId)}</div>
    <label style="font-size:13px;color:var(--muted2)">從</label>
    <div data-el="fromArea" style="display:flex;gap:8px;margin:6px 0 8px">${locationChipsHtml(fromLocation)}</div>
    <div style="text-align:center;color:var(--faint);margin:4px 0"><i class="ti ti-arrow-down"></i></div>
    <label style="font-size:13px;color:var(--muted2)">到</label>
    <div data-el="toDisplay" style="margin:6px 0 16px"></div>
    <label style="font-size:13px;color:var(--muted2)">金額</label>
    <input data-el="amount" type="number" min="0" class="field mono" style="margin:6px 0 14px" placeholder="0">
    <label style="font-size:13px;color:var(--muted2)">備註</label>
    <input data-el="note" class="field" style="margin:6px 0 18px" placeholder="如：提領現金">
    <button class="btn-primary" data-save="1" style="width:100%">確認轉移</button>
  </div>`;

  function renderTo() {
    const to = fromLocation === 'bank' ? 'cash' : 'bank';
    const m = LOCATION_META[to];
    ov.querySelector('[data-el="toDisplay"]').innerHTML = `<div class="chip active" style="display:inline-flex"><i class="ti ${m.icon}"></i><span>${m.label}</span></div>`;
    return to;
  }
  renderTo();

  ov.querySelector('[data-el="walletArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wallet]'); if (!b) return;
    walletId = b.dataset.wallet;
    ov.querySelectorAll('[data-el="walletArea"] [data-wallet]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ov.querySelector('[data-el="fromArea"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-location]'); if (!b) return;
    fromLocation = b.dataset.location;
    ov.querySelectorAll('[data-el="fromArea"] [data-location]').forEach((x) => x.classList.toggle('active', x === b));
    renderTo();
  });
  ov.querySelector('[data-save="1"]').onclick = async () => {
    const amount = parseFloat(ov.querySelector('[data-el="amount"]').value);
    if (!amount || amount <= 0) { showToast('請輸入金額', 'warning'); return; }
    const toLocation = fromLocation === 'bank' ? 'cash' : 'bank';
    try {
      await apiJson('/admin/api/accounting/records/transfer', {
        method: 'POST',
        body: JSON.stringify({
          wallet_id: walletId,
          from_location: fromLocation,
          to_location: toLocation,
          amount,
          date: todayStr(),
          description: ov.querySelector('[data-el="note"]').value,
        }),
      });
      showToast('已記錄轉移', 'success');
      ov.remove();
      emit('records:changed');
      if (onSaved) onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}
