/**
 * settings.js — 我的：帳戶管理、分類設定、定期項目、資料同步、匯出報表、
 * 記帳提醒、外觀主題。點項目滑出細項面板（手機/電腦共用 sheet）。
 */

import { apiJson, apiCall, getUserData } from './api.js';
import { CATEGORY_TREE } from './config.js';
import { escapeHtml, showToast, showConfirm, fmtMoney, monthStr } from './utils.js';
import { getThemePref, setThemePref } from './theme.js';
import { logout, changePassword } from './auth.js';
import { monthRange, emit } from './store.js';
import { openWalletManager } from './wallet.js';
import { isOnline } from './offline.js';
import { fetchPhotoGallery, fetchPhotoUrl } from './photos.js';
import { openEditById } from './ledger.js';

function sheet(title, bodyHtml) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg)">
      <span style="font-weight:600;font-size:17px;color:var(--text)">${title}</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div data-el="body">${bodyHtml}</div>
  </div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}

async function openAccount() {
  const ov = sheet('帳戶管理', '<div style="text-align:center;color:var(--muted2);padding:var(--space-xl)">載入中…</div>');
  let p;
  try { p = await apiJson('/api/user/profile'); } catch (e) { ov.querySelector('[data-el="body"]').innerHTML = `<div style="color:var(--expense)">${escapeHtml(e.message)}</div>`; return; }
  const fmtD = (s) => s ? s.slice(0, 10) : '—';
  ov.querySelector('[data-el="body"]').innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:var(--space-lg)">
      <div class="list-row"><span style="flex:1;color:var(--muted)">顯示名稱</span><input data-el="name" class="field" style="width:150px" value="${escapeHtml(p.name || '')}"></div>
      <div class="list-row"><span style="flex:1;color:var(--muted)">Email</span><span style="color:var(--text2);font-size:14px">${escapeHtml(p.email)}</span></div>
      <div class="list-row"><span style="flex:1;color:var(--muted)">加入時間</span><span class="mono" style="color:var(--text3);font-size:13px">${fmtD(p.created_at)}</span></div>
      <div class="list-row"><span style="flex:1;color:var(--muted)">上次登入</span><span class="mono" style="color:var(--text3);font-size:13px">${fmtD(p.last_login)}</span></div>
    </div>
    <button class="btn-primary" data-el="saveName" style="width:100%;margin-bottom:10px">儲存名稱</button>
    <div style="border-top:1px solid var(--border);margin:var(--space-emphasis) 0;padding-top:var(--space-emphasis)">
      <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:var(--space-2xs)">變更密碼</div>
      <div style="font-size:12px;color:var(--muted2);margin-bottom:10px">需 ≥12 字元，含大小寫 + 數字 + 特殊符號</div>
      <input data-el="oldpw" type="password" class="field" style="margin-bottom:var(--space-xs)" placeholder="目前密碼">
      <input data-el="newpw" type="password" class="field" style="margin-bottom:var(--space-base)" placeholder="新密碼">
      <button class="btn-primary" data-el="chpw" style="width:100%;background:var(--fill);color:var(--text);box-shadow:none">更新密碼</button>
    </div>
    <button class="btn-primary" data-el="logout" style="width:100%;margin-top:var(--space-lg);background:var(--expense-soft);color:var(--expense);box-shadow:none"><i class="ti ti-logout"></i> 登出</button>`;
  ov.querySelector('[data-el="saveName"]').onclick = async () => {
    try { await apiJson('/api/user/profile', { method: 'PUT', body: JSON.stringify({ name: ov.querySelector('[data-el="name"]').value.trim() }) }); showToast('已更新名稱', 'success'); } catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('[data-el="chpw"]').onclick = async () => {
    const oldpw = ov.querySelector('[data-el="oldpw"]').value, newpw = ov.querySelector('[data-el="newpw"]').value;
    if (!oldpw || !newpw) { showToast('請輸入密碼', 'warning'); return; }
    try { await changePassword(oldpw, newpw); showToast('密碼已更新', 'success'); ov.querySelector('[data-el="oldpw"]').value = ''; ov.querySelector('[data-el="newpw"]').value = ''; }
    catch (e) { showToast(e.message, 'error'); }
  };
  ov.querySelector('[data-el="logout"]').onclick = async () => { if (await showConfirm('確定要登出？')) logout(); };
}

function openCategory() {
  const body = CATEGORY_TREE.expense.concat(CATEGORY_TREE.income).map((g) => `
    <div style="margin-bottom:var(--space-base)">
      <div style="font-weight:600;font-size:14px;color:var(--text);margin-bottom:var(--space-xs)"><i class="ti ${g.icon}" style="color:${g.color};margin-right:var(--space-2xs)"></i>${g.group}</div>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2xs)">${g.items.map((l) => `<span style="font-size:13px;color:var(--text3);background:var(--fill);border-radius:8px;padding:5px 10px">${escapeHtml(l)}</span>`).join('')}</div>
    </div>`).join('');
  sheet('分類設定', body + '<div style="font-size:12px;color:var(--muted2);text-align:center;margin-top:var(--space-xs)">分類結構內建於前端，記錄以細項名稱儲存</div>');
}

async function openRecurring() {
  const ov = sheet('定期項目', '<div style="text-align:center;color:var(--muted2);padding:var(--space-xl)">載入中…</div>');
  async function refresh() {
    let items;
    try { items = await apiJson('/admin/api/recurring'); } catch (e) { ov.querySelector('[data-el="body"]').innerHTML = `<div style="color:var(--expense)">${escapeHtml(e.message)}</div>`; return; }
    ov.querySelector('[data-el="body"]').innerHTML = `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:var(--space-emphasis)">
        ${items.length ? items.map((it) => `
          <div class="list-row">
            <div style="flex:1"><div style="font-weight:500;font-size:14px;color:var(--text)">${escapeHtml(it.name)}</div><div style="font-size:12px;color:var(--muted2)">每月 ${it.day_of_month} 號 · ${escapeHtml(it.category)}</div></div>
            <span class="mono" style="color:${it.type === 'income' ? 'var(--income)' : 'var(--text)'};font-size:14px">${it.type === 'income' ? '+' : '−'}${fmtMoney(it.amount)}</span>
            <button class="icon-btn" data-apply="${it._id}" title="立即記一筆" style="background:var(--accent-soft)"><i class="ti ti-player-play" style="color:var(--accent)"></i></button>
            <button class="icon-btn" data-del="${it._id}"><i class="ti ti-trash" style="color:var(--expense)"></i></button>
          </div>`).join('') : '<div style="text-align:center;color:var(--muted2);padding:var(--space-xl)">尚無定期項目</div>'}
      </div>
      <button class="btn-primary" data-add="1" style="width:100%">＋ 新增定期項目</button>`;
    ov.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!(await showConfirm('刪除此定期項目？'))) return;
      try { const r = await apiCall(`/admin/api/recurring/${b.dataset.del}`, { method: 'DELETE' }); if (!r.ok) throw new Error('刪除失敗'); showToast('已刪除', 'success'); refresh(); } catch (e) { showToast(e.message, 'error'); }
    });
    ov.querySelectorAll('[data-apply]').forEach((b) => b.onclick = async () => {
      try { await apiJson(`/admin/api/recurring/${b.dataset.apply}/apply`, { method: 'POST' }); showToast('已記一筆', 'success'); emit('records:changed'); } catch (e) { showToast(e.message, 'error'); }
    });
    ov.querySelector('[data-add]').onclick = () => openRecurForm(refresh);
  }
  refresh();
}

function openRecurForm(onSaved) {
  const leaves = CATEGORY_TREE.expense.flatMap((g) => g.items);
  const ov = sheet('新增定期項目', `
    <input data-el="name" class="field" style="margin-bottom:10px" placeholder="名稱（如 房租）">
    <input data-el="amount" type="number" class="field mono" style="margin-bottom:10px" placeholder="金額">
    <div class="segment" data-el="type" style="margin-bottom:10px"><button data-t="expense" class="active">支出</button><button data-t="income">收入</button></div>
    <select data-el="category" class="field" style="margin-bottom:10px">${leaves.map((l) => `<option>${escapeHtml(l)}</option>`).join('')}</select>
    <label style="font-size:13px;color:var(--muted2)">每月幾號</label>
    <input data-el="day" type="number" min="1" max="31" class="field mono" style="margin:var(--space-2xs) 0 var(--space-lg)" value="1">
    <button class="btn-primary" data-save="1" style="width:100%">新增</button>`);
  let type = 'expense';
  ov.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { type = b.dataset.t; ov.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b)); });
  ov.querySelector('[data-save]').onclick = async () => {
    const body = {
      name: ov.querySelector('[data-el="name"]').value.trim(),
      amount: parseFloat(ov.querySelector('[data-el="amount"]').value),
      type, category: ov.querySelector('[data-el="category"]').value,
      day_of_month: parseInt(ov.querySelector('[data-el="day"]').value, 10) || 1,
    };
    if (!body.name || !body.amount) { showToast('請填名稱與金額', 'warning'); return; }
    try { await apiJson('/admin/api/recurring', { method: 'POST', body: JSON.stringify(body) }); showToast('已新增', 'success'); ov.remove(); onSaved(); } catch (e) { showToast(e.message, 'error'); }
  };
}

function openExport() {
  const ov = sheet('匯出報表', `
    <div style="font-size:13px;color:var(--muted2);margin-bottom:var(--space-xs)">格式</div>
    <div class="segment" data-el="fmt" style="margin-bottom:var(--space-emphasis)"><button data-f="csv" class="active">CSV</button><button data-f="xlsx">Excel</button><button data-f="json">JSON 備份</button></div>
    <div style="font-size:13px;color:var(--muted2);margin-bottom:var(--space-xs)">區間</div>
    <div class="segment" data-el="range" style="margin-bottom:18px"><button data-r="month" class="active">本月</button><button data-r="year">今年</button><button data-r="all">全部</button></div>
    <button class="btn-primary" data-el="go" style="width:100%"><i class="ti ti-download"></i> 下載</button>`);
  let fmt = 'csv', range = 'month';
  ov.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { fmt = b.dataset.f; ov.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b)); });
  ov.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { range = b.dataset.r; ov.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('active', x === b)); });
  ov.querySelector('[data-el="go"]').onclick = async () => {
    let qs = `format=${fmt}`;
    if (fmt !== 'json' && range !== 'all') {
      const now = new Date();
      if (range === 'month') { const { start, end } = monthRange(); qs += `&start_date=${start}&end_date=${end}`; }
      else { qs += `&start_date=${now.getFullYear()}-01-01&end_date=${now.getFullYear()}-12-31`; }
    }
    try {
      const res = await apiCall(`/admin/api/accounting/export?${qs}`);
      if (!res.ok) throw new Error('匯出失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `記帳_${monthStr()}.${fmt === 'xlsx' ? 'xlsx' : fmt}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast('已開始下載', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
}

/** 照片瀏覽介面（功能性版本，視覺細節之後再調整）：跨記錄縮圖網格，分頁
 * 用「載入更多」，點縮圖跳轉到對應記帳記錄的編輯視窗。 */
function openPhotoGallery() {
  const ov = sheet('照片', '<div style="text-align:center;color:var(--muted2);padding:var(--space-xl)">載入中…</div>');
  const PAGE_SIZE = 30;
  let items = [];
  let page = 1;
  let totalPages = 1;
  const objectUrls = [];

  async function loadThumb(item, idx) {
    try {
      const url = await fetchPhotoUrl(item.record_id, item.photo_id);
      objectUrls.push(url);
      const el = ov.querySelector(`[data-el="thumb-${idx}"]`);
      if (el) el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`;
    } catch {
      /* 抓不到就留預設圖示，不擋其他張 */
    }
  }

  function itemHtml(it, idx) {
    const dateShort = (it.record_date || '').slice(5);
    return `<div data-photo-idx="${idx}" style="cursor:pointer;border-radius:10px;overflow:hidden;background:var(--fill);aspect-ratio:1;position:relative">
      <div data-el="thumb-${idx}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:20px"><i class="ti ti-photo"></i></div>
      <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:2px var(--space-3xs);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(it.record_category || '')} ${dateShort}</div>
    </div>`;
  }

  async function loadPage() {
    const data = await fetchPhotoGallery(page, PAGE_SIZE);
    totalPages = data.total_pages;
    const newItems = data.items || [];
    const startIdx = items.length;
    items = items.concat(newItems);
    const body = ov.querySelector('[data-el="body"]');
    if (!items.length) {
      body.innerHTML = '<div style="text-align:center;color:var(--muted2);padding:30px 0">尚無照片</div>';
      return;
    }
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:var(--space-xs)">${items.map(itemHtml).join('')}</div>
      ${page < totalPages ? '<button class="btn-primary" data-el="more" style="width:100%;margin-top:var(--space-emphasis);background:var(--fill);color:var(--text);box-shadow:none">載入更多</button>' : ''}`;
    const moreBtn = body.querySelector('[data-el="more"]');
    if (moreBtn) moreBtn.onclick = async () => { page++; await loadPage(); };
    newItems.forEach((it, i) => loadThumb(it, startIdx + i));
  }

  function cleanup() { objectUrls.forEach((u) => URL.revokeObjectURL(u)); }
  // 點縮圖跳轉：只掛一次在 ov 上（loadPage 會重繪內容多次，掛在會被整批替換
  // 的節點上會累積重複監聽）
  ov.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-photo-idx]');
    if (cell) {
      const it = items[Number(cell.dataset.photoIdx)];
      if (!it) return;
      cleanup();
      ov.remove();
      emit('nav', 'ledger');
      openEditById(it.record_id);
      return;
    }
    if (e.target === ov || e.target.closest('[data-close]')) cleanup();
  });

  loadPage().catch((e) => {
    const body = ov.querySelector('[data-el="body"]');
    if (body) body.innerHTML = `<div style="color:var(--expense)">${escapeHtml(e.message)}</div>`;
  });
}

const REMINDER_KEY = 'v2-reminder';
function getReminder() { try { return JSON.parse(localStorage.getItem(REMINDER_KEY)) || { on: false, time: '21:00' }; } catch { return { on: false, time: '21:00' }; } }
function openReminder() {
  const r = getReminder();
  const ov = sheet('記帳提醒', `
    <div class="list-row" style="border:none;padding:0 0 var(--space-emphasis)">
      <span style="flex:1;color:var(--text)">每日提醒</span>
      <label style="position:relative;display:inline-block;width:46px;height:26px">
        <input data-el="on" type="checkbox" ${r.on ? 'checked' : ''} style="opacity:0;width:0;height:0">
        <span data-el="track" style="position:absolute;inset:0;border-radius:999px;background:${r.on ? 'var(--accent)' : 'var(--border-strong)'};transition:.2s;cursor:pointer"></span>
        <span data-el="knob" style="position:absolute;top:3px;left:${r.on ? '23px' : '3px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s;pointer-events:none"></span>
      </label>
    </div>
    <div class="list-row" style="border:none;padding:0"><span style="flex:1;color:var(--text)">提醒時間</span><input data-el="time" type="time" class="field" style="width:130px" value="${r.time}"></div>
    <div style="font-size:12px;color:var(--muted2);margin-top:var(--space-base)">提醒為本機功能，需允許瀏覽器通知權限</div>`);
  const cb = ov.querySelector('[data-el="on"]'), track = ov.querySelector('[data-el="track"]'), knob = ov.querySelector('[data-el="knob"]'), time = ov.querySelector('[data-el="time"]');
  function save() { localStorage.setItem(REMINDER_KEY, JSON.stringify({ on: cb.checked, time: time.value })); }
  track.onclick = () => { cb.checked = !cb.checked; track.style.background = cb.checked ? 'var(--accent)' : 'var(--border-strong)'; knob.style.left = cb.checked ? '23px' : '3px'; if (cb.checked && 'Notification' in window) Notification.requestPermission(); save(); };
  time.onchange = save;
}

const THEME_LABEL = [['system', '系統', 'ti-device-desktop'], ['light', '亮色', 'ti-sun'], ['dark', '暗色', 'ti-moon']];
function themeSegment() {
  const pref = getThemePref();
  return `<div class="segment" data-el="theme">${THEME_LABEL.map(([v, l, ic]) => `<button data-theme-v="${v}" class="${pref === v ? 'active' : ''}" style="display:flex;align-items:center;justify-content:center;gap:5px"><i class="ti ${ic}"></i>${l}</button>`).join('')}</div>`;
}

let detachSyncStatus = null;

// 讓「資料同步」那格即時反映線上/離線。router 的 view 沒有 unmount hook，
// 用模組級 detach 守衛：每次重新 wire 前先移除上一組監聽，避免累積洩漏
// （同時只會有一個設定頁存在，最多殘留一組指向已卸載元素的監聽，無害）。
function wireSyncStatus(scope) {
  if (detachSyncStatus) { detachSyncStatus(); detachSyncStatus = null; }
  const el = scope.querySelector('[data-el="sync-status"]');
  if (!el) return;
  const update = () => { el.textContent = isOnline() ? '已同步' : '離線'; };
  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  detachSyncStatus = () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}

function menuGroup(rows) {
  return `<div class="card" style="padding:0;overflow:hidden;margin-bottom:var(--space-lg)">${rows.map((r) => `
    <div class="list-row" data-act="${r.act}" style="cursor:pointer">
      <i class="ti ${r.icon}" style="font-size:20px;color:var(--muted)"></i>
      <span style="flex:1;color:var(--text);font-size:15px">${r.label}</span>
      ${r.extra ? `<span ${r.extraEl ? `data-el="${r.extraEl}"` : ''} style="font-size:13px;color:var(--muted2)">${r.extra}</span>` : ''}
      <i class="ti ti-chevron-right" style="color:var(--faint)"></i>
    </div>`).join('')}</div>`;
}

async function render(container, mode) {
  const user = getUserData() || {};
  const initial = (user.name || 'U').slice(0, 1);
  let recurCount = '';
  try { const rc = await apiJson('/admin/api/recurring'); recurCount = `${rc.length} 項`; } catch { /* 忽略 */ }

  const inner = document.createElement('div');
  inner.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:var(--space-emphasis);padding:var(--space-lg);margin-bottom:18px">
      <div class="avatar" style="width:50px;height:50px;font-size:20px">${escapeHtml(initial)}</div>
      <div style="flex:1"><div style="font-weight:600;font-size:16px;color:var(--text)">${escapeHtml(user.name || '使用者')}</div><div style="font-size:13px;color:var(--muted2)">${escapeHtml(user.email || '')}</div></div>
    </div>
    ${menuGroup([
      { act: 'account', icon: 'ti-wallet', label: '帳戶管理' },
      { act: 'wallet', icon: 'ti-coin', label: '錢包管理' },
      { act: 'category', icon: 'ti-category', label: '分類設定' },
      { act: 'recurring', icon: 'ti-repeat', label: '定期項目', extra: recurCount },
      { act: 'photos', icon: 'ti-photo', label: '照片' },
    ])}
    ${menuGroup([
      { act: 'sync', icon: 'ti-refresh', label: '資料同步', extra: isOnline() ? '已同步' : '離線', extraEl: 'sync-status' },
      { act: 'export', icon: 'ti-file-export', label: '匯出報表' },
      { act: 'reminder', icon: 'ti-bell', label: '記帳提醒' },
    ])}
    <div class="card" style="padding:var(--space-emphasis);margin-bottom:var(--space-lg)">
      <div style="display:flex;align-items:center;gap:13px;margin-bottom:var(--space-base)"><i class="ti ti-palette" style="font-size:20px;color:var(--muted)"></i><span style="flex:1;color:var(--text);font-size:15px">外觀主題</span></div>
      ${themeSegment()}
    </div>
    <div style="text-align:center;font-size:12px;color:var(--faint)">記帳 App v2 · 設計稿實作</div>`;

  inner.addEventListener('click', (e) => {
    const row = e.target.closest('[data-act]');
    if (row) {
      const act = row.dataset.act;
      if (act === 'account') openAccount();
      else if (act === 'wallet') openWalletManager();
      else if (act === 'category') openCategory();
      else if (act === 'recurring') openRecurring();
      else if (act === 'photos') openPhotoGallery();
      else if (act === 'export') openExport();
      else if (act === 'reminder') openReminder();
      else if (act === 'sync') showToast(isOnline() ? '資料即時同步至雲端，免手動備份' : '目前離線，顯示本地快取；恢復連線後會即時同步', 'info');
      return;
    }
    const tb = e.target.closest('[data-theme-v]');
    if (tb) { setThemePref(tb.dataset.themeV); inner.querySelectorAll('[data-theme-v]').forEach((x) => x.classList.toggle('active', x === tb)); }
  });

  wireSyncStatus(inner);

  if (mode === 'desktop') {
    const page = document.createElement('div'); page.className = 'page';
    page.innerHTML = '<div class="page-title" style="margin-bottom:var(--space-xl)">我的</div>';
    inner.style.maxWidth = '560px'; page.appendChild(inner);
    container.innerHTML = ''; container.appendChild(page);
  } else {
    container.innerHTML = '<div style="padding:var(--space-2xs) var(--space-xl) 0;flex-shrink:0"><span style="font-weight:700;font-size:22px;color:var(--text)">我的</span></div>';
    const scroll = document.createElement('div');
    scroll.className = 'noscroll';
    scroll.style.cssText = 'flex:1;overflow-y:auto;padding:var(--space-lg) var(--space-xl) 100px';
    scroll.appendChild(inner);
    container.appendChild(scroll);
  }
}

export function renderSettingsMobile(c) { return render(c, 'mobile'); }
export function renderSettingsDesktop(c) { return render(c, 'desktop'); }
