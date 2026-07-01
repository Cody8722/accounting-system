/**
 * utils.js — 通用工具（v2）。由 js-refactored/utils.js 移植，icon 改用 Tabler。
 */

export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/** 千分位金額字串（無小數，四捨五入） */
export function fmtMoney(v) {
  const n = Math.round(Number(v) || 0);
  return n.toLocaleString('en-US');
}

/** YYYY-MM-DD（本地今天） */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 當月字串 YYYY-MM */
export function monthStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const TOAST_ICON = { success: 'ti-circle-check', warning: 'ti-alert-triangle', error: 'ti-circle-x', info: 'ti-info-circle' };
const TOAST_BG = { success: '#3f8f66', warning: '#c98a2e', error: '#b15c58', info: '#1f6feb' };

export function showToast(message, type = 'info', duration = 3200) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:calc(20px + env(safe-area-inset-top))', 'right:16px',
    'max-width:320px', 'padding:12px 16px', 'border-radius:12px', 'color:#fff',
    'font-size:14px', 'font-weight:500', 'z-index:99999',
    'box-shadow:0 6px 20px rgba(0,0,0,.22)', 'display:flex', 'align-items:center', 'gap:9px',
    `background:${TOAST_BG[type] || TOAST_BG.info}`, 'transition:opacity .3s ease',
  ].join(';');
  el.innerHTML = `<i class="ti ${TOAST_ICON[type] || TOAST_ICON.info}" style="font-size:18px"></i><span></span>`;
  el.querySelector('span').textContent = message;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, duration);
}

/** 非阻塞確認框，回傳 Promise<boolean> */
export function showConfirm(message, { confirmText = '確定', cancelText = '取消', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay center';
    overlay.style.zIndex = '99998';
    const accent = danger ? 'var(--expense)' : 'var(--accent)';
    overlay.innerHTML = `
      <div class="sheet dialog" style="padding:24px 20px">
        <p style="text-align:center;font-size:16px;color:var(--text);margin-bottom:20px;line-height:1.5"></p>
        <div style="display:flex;gap:12px">
          <button data-act="cancel" style="flex:1;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--surface);font-size:15px;color:var(--text3);cursor:pointer"></button>
          <button data-act="ok" style="flex:1;padding:13px;border:none;border-radius:12px;background:${accent};color:#fff;font-size:15px;font-weight:600;cursor:pointer"></button>
        </div>
      </div>`;
    overlay.querySelector('p').textContent = message;
    overlay.querySelector('[data-act="cancel"]').textContent = cancelText;
    overlay.querySelector('[data-act="ok"]').textContent = confirmText;
    const close = (r) => { overlay.remove(); resolve(r); };
    overlay.querySelector('[data-act="ok"]').onclick = () => close(true);
    overlay.querySelector('[data-act="cancel"]').onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    document.body.appendChild(overlay);
  });
}

export function debounce(fn, delay = 300) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

/** 建立 DOM 節點的極簡工具 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
