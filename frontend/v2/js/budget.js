/**
 * budget.js — 預算：總預算卡（已用/總預算/還可花）+ 各分類進度條。
 * 串 GET·POST /admin/api/accounting/budget（key 限 ALLOWED_CATEGORIES）、
 * GET stats 取當月各分類已用。
 */

import { apiJson } from './api.js';
import { BUDGET_CATEGORIES, categoryMeta } from './config.js';
import { fmtMoney, escapeHtml, showToast } from './utils.js';
import { monthRange, emit } from './store.js';

async function fetchData() {
  const { start, end } = monthRange();
  const [budget, stats] = await Promise.all([
    apiJson('/admin/api/accounting/budget'),
    apiJson(`/admin/api/accounting/stats?start_date=${start}&end_date=${end}`),
  ]);
  const spentMap = {};
  for (const c of (stats.category_stats || [])) spentMap[c._id] = c.total;
  return { budget: budget.budget || {}, spentMap, totalExpense: stats.total_expense || 0 };
}

function rowHtml(cat, budgetAmt, spent) {
  const m = categoryMeta(cat);
  const pct = budgetAmt > 0 ? Math.min(100, spent / budgetAmt * 100) : 0;
  const over = spent > budgetAmt;
  const left = budgetAmt - spent;
  const barColor = over ? 'var(--expense)' : pct > 80 ? '#c98a2e' : 'var(--accent)';
  return `<div style="margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:11px">
      <div class="cat-icon" style="width:34px;height:34px;background:${m.color}1f"><i class="ti ${m.icon}" style="color:${m.color};font-size:18px"></i></div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:500;font-size:14px;color:var(--text)">${escapeHtml(cat)}</span>
          <span class="mono" style="font-size:13px;color:var(--text2)">${fmtMoney(spent)} <span style="color:var(--faint)">/ ${fmtMoney(budgetAmt)}</span></span>
        </div>
        <div style="font-size:12px;color:${over ? 'var(--expense)' : 'var(--muted2)'}">${over ? `超支 ${fmtMoney(-left)}` : `剩 ${fmtMoney(left)}`}</div>
      </div>
    </div>
    <div class="track" style="margin-top:7px"><div class="bar" style="width:${pct}%;background:${barColor}"></div></div>
  </div>`;
}

function openEditor(current, onSaved) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <span style="font-weight:600;font-size:17px;color:var(--text)">設定各分類預算</span>
      <button class="icon-btn" data-close="1"><i class="ti ti-x"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px">
      ${BUDGET_CATEGORIES.map((c) => `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="flex:1;font-size:14px;color:var(--text)">${escapeHtml(c)}</span>
          <input data-cat="${escapeHtml(c)}" type="number" min="0" class="field mono" style="width:120px;text-align:right" value="${current[c] || ''}" placeholder="0">
        </div>`).join('')}
    </div>
    <button class="btn-primary" data-save="1" style="width:100%">儲存預算</button>
  </div>`;
  ov.querySelector('[data-save="1"]').onclick = async () => {
    const budget = {};
    ov.querySelectorAll('[data-cat]').forEach((inp) => { const v = parseFloat(inp.value); if (v > 0) budget[inp.dataset.cat] = v; });
    try {
      await apiJson('/admin/api/accounting/budget', { method: 'POST', body: JSON.stringify({ budget }) });
      showToast('預算已儲存', 'success'); ov.remove(); onSaved();
    } catch (e) { showToast(e.message, 'error'); }
  };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov);
}

async function render(container, mode) {
  const title = mode === 'desktop'
    ? '<div class="page-title" style="margin-bottom:20px">預算</div>'
    : '<div style="padding:6px 20px 0;flex-shrink:0"><span style="font-weight:700;font-size:22px;color:var(--text)">預算</span></div>';
  container.innerHTML = mode === 'desktop' ? `<div class="page">${title}<div class="page-sub">載入中…</div></div>` : `${title}<div style="padding:40px;text-align:center;color:var(--muted2)">載入中…</div>`;
  let data;
  try { data = await fetchData(); } catch (e) { container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--expense)">${escapeHtml(e.message)}</div>`; return; }

  const totalBudget = Object.values(data.budget).reduce((s, v) => s + v, 0);
  const totalSpent = data.totalExpense;
  const pct = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100) : 0;
  const left = totalBudget - totalSpent;
  const cats = BUDGET_CATEGORIES.filter((c) => data.budget[c] > 0);

  const inner = document.createElement('div');
  inner.innerHTML = `
    <div style="background:var(--accent);border-radius:22px;padding:20px 22px;color:#fff;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:13px;color:#cfe0ff">本月已用 / 總預算</span>
        <button data-el="edit" style="border:none;background:rgba(255,255,255,.18);color:#fff;border-radius:9px;padding:5px 12px;font-size:13px;cursor:pointer"><i class="ti ti-adjustments"></i> 設定</button>
      </div>
      <div style="display:flex;align-items:flex-end;gap:6px;margin-bottom:14px">
        <span class="mono" style="font-weight:500;font-size:32px;line-height:1">${fmtMoney(totalSpent)}</span>
        <span class="mono" style="font-size:16px;color:#cfe0ff;margin-bottom:2px">/ ${fmtMoney(totalBudget)}</span>
      </div>
      <div style="height:10px;border-radius:5px;background:rgba(255,255,255,.25);overflow:hidden"><div style="height:100%;border-radius:5px;background:#fff;width:${Math.min(100, pct)}%"></div></div>
      <div style="font-size:12px;color:#cfe0ff;margin-top:9px">${totalBudget === 0 ? '尚未設定預算，點右上「設定」開始' : left >= 0 ? `還可花 NT$ ${fmtMoney(left)}（${pct}%）` : `已超支 NT$ ${fmtMoney(-left)}`}</div>
    </div>
    <div data-el="rows">${cats.map((c) => rowHtml(c, data.budget[c], data.spentMap[c] || 0)).join('') || '<div style="text-align:center;color:var(--muted2);padding:20px">尚未設定任何分類預算</div>'}</div>`;
  inner.querySelector('[data-el="edit"]').onclick = () => openEditor(data.budget, () => emit('records:changed'));

  if (mode === 'desktop') {
    const page = document.createElement('div'); page.className = 'page';
    page.innerHTML = title; page.appendChild(inner);
    inner.style.maxWidth = '640px';
    container.innerHTML = ''; container.appendChild(page);
  } else {
    container.innerHTML = title;
    const scroll = document.createElement('div');
    scroll.className = 'noscroll';
    scroll.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px 100px';
    scroll.appendChild(inner);
    container.appendChild(scroll);
  }
}

export function renderBudgetMobile(c) { return render(c, 'mobile'); }
export function renderBudgetDesktop(c) { return render(c, 'desktop'); }
