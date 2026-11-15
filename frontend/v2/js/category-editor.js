/**
 * category-editor.js — 「我的 → 分類設定」編輯畫面：新增／改名／刪除大類與細項、
 * 自訂顏色（內建色盤＋自選色）、大類圖示、常用細項。
 *
 * 改名或刪除（改歸到別的分類）會連同舊記錄、定期項目、預算一起改——
 * 這裡只負責算出 renames 清單，實際搬動在後端 PUT /api/user/categories 一次完成。
 */

import { PALETTES, ICON_CHOICES, getCategoryConfig } from './config.js';
import { escapeHtml, showToast, showConfirm } from './utils.js';
import { emit } from './store.js';
import { fetchCategoryUsage, saveCategoryConfig } from './categories.js';

const RESERVED = ['債務收回', '債務償還'];
const MAX_QUICK = 12;
const TYPE_LABEL = { expense: '支出', income: '收入' };

let seq = 0;
const uid = () => `u${++seq}`;
let lastPalette = 0; // 色盤分頁記住上次選的

/** 編輯中的草稿：每個細項帶 origin（原名稱）以便算出改名清單 */
function fromConfig(cfg) {
  const build = (type) => cfg[type].map((g) => ({
    uid: uid(),
    group: g.group,
    icon: g.icon,
    color: g.color,
    items: g.items.map((name) => ({
      uid: uid(),
      name,
      origin: name,
      color: cfg.leaf_colors[name] || null,
      quick: cfg.quick[type].includes(name),
    })),
  }));
  return { expense: build('expense'), income: build('income') };
}

function toConfig(trees) {
  const out = { leaf_colors: {}, quick: { expense: [], income: [] } };
  for (const type of ['expense', 'income']) {
    out[type] = trees[type].map((g) => ({
      group: g.group.trim(),
      icon: g.icon,
      color: g.color,
      items: g.items.map((it) => {
        const name = it.name.trim();
        if (it.color) out.leaf_colors[name] = it.color;
        if (it.quick) out.quick[type].push(name);
        return name;
      }),
    }));
  }
  return out;
}

function validName(raw, what) {
  const name = raw.trim();
  if (!name) return `${what}不可為空`;
  if (name.length > 50) return `${what}不可超過 50 個字`;
  if (name.includes('.') || name.startsWith('$')) return `${what}不可包含「.」或以「$」開頭`;
  return '';
}

function overlay(title, bodyHtml) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-lg)">
      <span style="font-weight:600;font-size:17px;color:var(--text)">${title}</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div data-el="body">${bodyHtml}</div>
  </div>`;
  document.body.appendChild(ov);
  return ov;
}

/** 色盤＋自選色。onChange(hex|null)；allowInherit 時多一顆「沿用大類顏色」 */
function mountColorPicker(host, { value, allowInherit = false, inheritColor = '', onChange }) {
  let current = value;
  function render() {
    const pal = PALETTES[lastPalette];
    host.innerHTML = `
      <div class="segment" style="margin-bottom:var(--space-xs)">${PALETTES.map((p, i) => `<button data-pal="${i}" class="${i === lastPalette ? 'active' : ''}">${p.name}</button>`).join('')}</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:var(--space-xs)">
        ${pal.colors.map((c) => `<button data-color="${c}" aria-label="${c}" style="height:34px;border-radius:var(--radius-sm);border:${current === c ? '3px solid var(--text)' : '1px solid var(--border)'};background:${c};cursor:pointer"></button>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <label style="font-size:13px;color:var(--muted2)">自選顏色</label>
        <input data-el="custom" type="color" value="${current || inheritColor || '#8a8a94'}" style="width:48px;height:32px;border:none;background:none;padding:0;cursor:pointer">
        ${allowInherit ? `<button class="link" data-inherit="1" style="margin-left:auto">${current ? '沿用大類顏色' : '✓ 沿用大類顏色'}</button>` : ''}
      </div>`;
    host.querySelectorAll('[data-pal]').forEach((b) => b.onclick = () => { lastPalette = Number(b.dataset.pal); render(); });
    host.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => { current = b.dataset.color; onChange(current); render(); });
    host.querySelector('[data-el="custom"]').oninput = (e) => { current = e.target.value.toLowerCase(); onChange(current); };
    host.querySelector('[data-el="custom"]').onchange = () => render();
    const inh = host.querySelector('[data-inherit]');
    if (inh) inh.onclick = () => { current = null; onChange(null); render(); };
  }
  render();
}

export async function openCategoryEditor() {
  const base = getCategoryConfig();
  const usage = await fetchCategoryUsage();
  const trees = fromConfig(base);
  const removed = []; // {origin, target:item}：被刪除、舊記錄要改歸到 target 的細項
  let type = 'expense';
  const snapshot = () => JSON.stringify([toConfig(trees), removed.map((r) => [r.origin, r.target && r.target.uid])]);
  let saved = snapshot();

  const ov = overlay('分類設定', '');
  const body = ov.querySelector('[data-el="body"]');

  const findGroup = (gid) => trees[type].find((g) => g.uid === gid);
  const allItems = (t) => trees[t].flatMap((g) => g.items);

  function nameTaken(name, exceptUid) {
    const n = name.trim();
    return RESERVED.includes(n) || [...allItems('expense'), ...allItems('income')].some((i) => i.uid !== exceptUid && i.name.trim() === n);
  }

  function render() {
    body.innerHTML = `
      <div class="segment" style="margin-bottom:var(--space-lg)">${['expense', 'income'].map((t) => `<button data-type="${t}" class="${t === type ? 'active' : ''}">${TYPE_LABEL[t]}</button>`).join('')}</div>
      ${trees[type].map((g) => `
        <div class="card" style="padding:var(--space-base);margin-bottom:var(--space-base)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-xs)">
            <button class="icon-btn" data-act="group" data-g="${g.uid}" style="background:${g.color}1f" aria-label="編輯大類"><i class="ti ${g.icon}" style="color:${g.color}"></i></button>
            <span style="flex:1;font-weight:600;font-size:var(--text-emphasis);color:var(--text)">${escapeHtml(g.group)}</span>
            <button class="icon-btn" data-act="add-item" data-g="${g.uid}" aria-label="新增細項"><i class="ti ti-plus"></i></button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2xs)">
            ${g.items.map((it) => `<button data-act="item" data-g="${g.uid}" data-i="${it.uid}" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text3);background:var(--fill);border:none;border-radius:var(--radius-sm);padding:5px 10px;cursor:pointer"><span style="width:10px;height:10px;border-radius:50%;background:${it.color || g.color}"></span>${escapeHtml(it.name)}${it.quick ? ' <i class="ti ti-star-filled" style="font-size:12px;color:var(--accent)"></i>' : ''}</button>`).join('') || '<span style="font-size:13px;color:var(--muted2)">還沒有細項</span>'}
          </div>
        </div>`).join('')}
      <button class="btn-primary" data-act="add-group" style="width:100%;margin-bottom:var(--space-xs);background:var(--fill);color:var(--text);box-shadow:none">＋ 新增大類</button>
      <div style="font-size:var(--text-base);color:var(--muted2);text-align:center;margin:var(--space-xs) 0 var(--space-lg)">點大類圖示改名稱／顏色／圖示，點細項改名稱／顏色／常用。<br>★ 代表手機記帳畫面的常用細項。</div>
      <button class="btn-primary" data-act="save" style="width:100%;margin-bottom:var(--space-xs)">儲存</button>
      <button class="link" data-act="reset" style="display:block;margin:0 auto;color:var(--expense)">還原成內建分類</button>`;
  }

  /** 刪除時舊記錄要改歸哪裡：回傳目標細項，取消回傳 null */
  function pickTarget(exclude, count, label) {
    return new Promise((resolve) => {
      const choices = trees[type].flatMap((g) => g.items.filter((i) => !exclude.includes(i)).map((i) => ({ item: i, group: g.group })));
      if (!choices.length) { showToast('至少要保留一個可以改歸的細項', 'warning'); resolve(null); return; }
      const dlg = overlay('改歸到哪個分類？', `
        <div style="font-size:var(--text-base);color:var(--muted2);margin-bottom:var(--space-base)">「${escapeHtml(label)}」有 ${count} 筆記錄（含定期項目），刪除後要改歸到：</div>
        <select data-el="target" class="field" style="margin-bottom:var(--space-lg)">${choices.map((c, i) => `<option value="${i}">${escapeHtml(c.group)} › ${escapeHtml(c.item.name)}</option>`).join('')}</select>
        <button class="btn-primary" data-ok="1" style="width:100%">改歸並刪除</button>`);
      dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) { dlg.remove(); resolve(null); } };
      dlg.querySelector('[data-ok]').onclick = () => { const pick = choices[Number(dlg.querySelector('[data-el="target"]').value)].item; dlg.remove(); resolve(pick); };
    });
  }

  const needsTarget = (it) => (it.origin && (usage[it.origin] || 0) > 0) || removed.some((r) => r.target === it);

  function dropItems(items, target) {
    for (const it of items) {
      for (const r of removed) if (r.target === it) r.target = target;
      if (it.origin && target) removed.push({ origin: it.origin, target });
    }
  }

  async function deleteItem(g, it, dlg) {
    let target = null;
    if (needsTarget(it)) {
      target = await pickTarget([it], usage[it.origin] || 0, it.name);
      if (!target) return;
    }
    dropItems([it], target);
    g.items = g.items.filter((x) => x !== it);
    dlg.remove();
    render();
  }

  async function deleteGroup(g, dlg) {
    if (trees[type].length <= 1) { showToast('至少要保留一個大類', 'warning'); return; }
    const total = g.items.reduce((s, it) => s + (usage[it.origin] || 0), 0);
    const pending = g.items.some(needsTarget);
    let target = null;
    if (pending) {
      target = await pickTarget(g.items, total, g.group);
      if (!target) return;
    }
    dropItems(g.items, target);
    trees[type] = trees[type].filter((x) => x !== g);
    dlg.remove();
    render();
  }

  function openItemForm(g, existing) {
    const it = existing || { uid: uid(), name: '', origin: null, color: null, quick: false };
    const dlg = overlay(existing ? '編輯細項' : '新增細項', `
      <input data-el="name" class="field" style="margin-bottom:var(--space-base)" placeholder="細項名稱" maxlength="50" value="${escapeHtml(it.name)}">
      <div style="font-size:13px;color:var(--muted2);margin-bottom:var(--space-xs)">顏色</div>
      <div data-el="color" style="margin-bottom:var(--space-base)"></div>
      <label style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-lg);color:var(--text);font-size:var(--text-emphasis)"><input data-el="quick" type="checkbox" ${it.quick ? 'checked' : ''}> 設為手機記帳的常用細項 ★</label>
      <button class="btn-primary" data-ok="1" style="width:100%;margin-bottom:var(--space-xs)">完成</button>
      ${existing ? '<button class="link" data-del="1" style="display:block;margin:0 auto;color:var(--expense)">刪除這個細項</button>' : ''}`);
    let color = it.color;
    mountColorPicker(dlg.querySelector('[data-el="color"]'), { value: color, allowInherit: true, inheritColor: g.color, onChange: (c) => { color = c; } });
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.remove(); };
    dlg.querySelector('[data-ok]').onclick = () => {
      const name = dlg.querySelector('[data-el="name"]').value;
      const err = validName(name, '細項名稱') || (nameTaken(name, it.uid) ? '已有同名的分類' : '');
      if (err) { showToast(err, 'warning'); return; }
      const wantQuick = dlg.querySelector('[data-el="quick"]').checked;
      if (wantQuick && !it.quick && allItems(type).filter((x) => x.quick).length >= MAX_QUICK) { showToast(`常用細項最多 ${MAX_QUICK} 個`, 'warning'); return; }
      it.name = name.trim();
      it.color = color;
      it.quick = wantQuick;
      if (!existing) g.items.push(it);
      dlg.remove();
      render();
    };
    const del = dlg.querySelector('[data-del]');
    if (del) del.onclick = () => deleteItem(g, it, dlg);
  }

  function openGroupForm(existing) {
    const g = existing || { uid: uid(), group: '', icon: 'ti-tag', color: PALETTES[0].colors[0], items: [] };
    const dlg = overlay(existing ? '編輯大類' : '新增大類', `
      <input data-el="name" class="field" style="margin-bottom:var(--space-base)" placeholder="大類名稱" maxlength="50" value="${escapeHtml(g.group)}">
      <div style="font-size:13px;color:var(--muted2);margin-bottom:var(--space-xs)">圖示</div>
      <div data-el="icons" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:var(--space-base)"></div>
      <div style="font-size:13px;color:var(--muted2);margin-bottom:var(--space-xs)">顏色（底下的細項沒單獨設定時都用這個色）</div>
      <div data-el="color" style="margin-bottom:var(--space-lg)"></div>
      <button class="btn-primary" data-ok="1" style="width:100%;margin-bottom:var(--space-xs)">完成</button>
      ${existing ? '<button class="link" data-del="1" style="display:block;margin:0 auto;color:var(--expense)">刪除這個大類</button>' : ''}`);
    let icon = g.icon;
    let color = g.color;
    const iconsEl = dlg.querySelector('[data-el="icons"]');
    function renderIcons() {
      iconsEl.innerHTML = ICON_CHOICES.map((i) => `<button data-icon="${i}" class="icon-btn" style="width:100%;height:38px;border:${i === icon ? '2px solid var(--accent)' : '1px solid var(--border)'}"><i class="ti ${i}" style="color:${color}"></i></button>`).join('');
      iconsEl.querySelectorAll('[data-icon]').forEach((b) => b.onclick = () => { icon = b.dataset.icon; renderIcons(); });
    }
    renderIcons();
    mountColorPicker(dlg.querySelector('[data-el="color"]'), { value: color, onChange: (c) => { color = c; renderIcons(); } });
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.remove(); };
    dlg.querySelector('[data-ok]').onclick = () => {
      const name = dlg.querySelector('[data-el="name"]').value;
      const err = validName(name, '大類名稱') || (trees[type].some((x) => x !== g && x.group.trim() === name.trim()) ? '已有同名的大類' : '');
      if (err) { showToast(err, 'warning'); return; }
      g.group = name.trim();
      g.icon = icon;
      g.color = color;
      if (!existing) trees[type].push(g);
      dlg.remove();
      render();
    };
    const del = dlg.querySelector('[data-del]');
    if (del) del.onclick = () => deleteGroup(g, dlg);
  }

  /** 算出 renames；名稱互相頂替（A→B 同時 B→C）時回傳 null，請使用者分兩次儲存 */
  function computeRenames() {
    const finalNames = new Set([...allItems('expense'), ...allItems('income')].map((i) => i.name.trim()));
    const list = [];
    for (const t of ['expense', 'income']) {
      for (const it of allItems(t)) if (it.origin && it.origin !== it.name.trim()) list.push({ from: it.origin, to: it.name.trim() });
    }
    for (const r of removed) list.push({ from: r.origin, to: r.target.name.trim() });
    if (list.some((r) => finalNames.has(r.from))) return null;
    return list;
  }

  async function save() {
    const renames = computeRenames();
    if (renames === null) { showToast('有名稱互相頂替（例如 A 改成 B、B 又改成別的），請分兩次儲存', 'warning', 5000); return; }
    try {
      const res = await saveCategoryConfig(toConfig(trees), renames);
      saved = snapshot();
      showToast(res.renamed_records ? `已儲存，${res.renamed_records} 筆記錄已跟著改名` : '分類已儲存', 'success');
      emit('records:changed');
      ov.remove();
    } catch (e) {
      showToast(e.message || '儲存失敗', 'error');
    }
  }

  async function resetDefault() {
    if (!(await showConfirm('還原成內建分類？自訂分類的舊記錄不會被刪除，但會顯示成「其他」。'))) return;
    try {
      await saveCategoryConfig(null);
      showToast('已還原內建分類', 'success');
      emit('records:changed');
      ov.remove();
    } catch (e) {
      showToast(e.message || '還原失敗', 'error');
    }
  }

  body.addEventListener('click', (e) => {
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) { type = typeBtn.dataset.type; render(); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const g = act.dataset.g ? findGroup(act.dataset.g) : null;
    switch (act.dataset.act) {
      case 'group': openGroupForm(g); break;
      case 'add-group': openGroupForm(null); break;
      case 'add-item': openItemForm(g, null); break;
      case 'item': openItemForm(g, g.items.find((i) => i.uid === act.dataset.i)); break;
      case 'save': save(); break;
      case 'reset': resetDefault(); break;
      default: break;
    }
  });

  ov.addEventListener('click', async (e) => {
    if (e.target !== ov && !e.target.closest('[data-close]')) return;
    if (snapshot() !== saved && !(await showConfirm('有尚未儲存的修改，確定放棄？', { confirmText: '放棄' }))) return;
    ov.remove();
  });

  render();
}
