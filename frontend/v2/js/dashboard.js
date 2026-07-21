/**
 * dashboard.js — 電腦版概覽儀表板（僅桌面）。
 * 版型與釘選互動由 Claude Design 打磨定案（見 prototypes/pin-dashboard-prototype.html）：
 * 標題＋KPI 列＋可釘選的 2×2 deck（分類佔比/支出趨勢/最近交易/預算概覽）。
 * 內容接既有 API；釘選動畫在 pin.js（尊重 prefers-reduced-motion）。
 */

import { apiJson } from './api.js';
import { categoryMeta } from './config.js';
import { fmtMoney, escapeHtml } from './utils.js';
import { monthRange, emit } from './store.js';
import { mountPinDeck } from './pin.js';

async function fetchAll() {
  const { start, end, label } = monthRange();
  const [overview, stats, trends, recentRaw, budgetRaw] = await Promise.all([
    apiJson('/admin/api/stats/overview').catch(() => null),
    apiJson(`/admin/api/accounting/stats?start_date=${start}&end_date=${end}`),
    apiJson('/admin/api/accounting/trends?months=6'),
    apiJson(`/admin/api/accounting/records?page=1&limit=6&start_date=${start}&end_date=${end}&sort_by=date&sort_order=desc`),
    apiJson(`/admin/api/accounting/budget?month=${label}`).catch(() => ({ budget: {} })),
  ]);
  const records = Array.isArray(recentRaw) ? recentRaw : (recentRaw.records || []);
  const budget = (budgetRaw && budgetRaw.budget) || {};
  return { overview, stats, trends, records, budget, label };
}

const PIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l2 3.2H7z"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
const flinkHtml = (view, name) => `<div class="flink"><button class="full-link" type="button" data-nav="${view}">查看完整「${name}」頁 ${ARROW}</button></div>`;
const cheadHtml = (color, title) => `<div class="chead"><span class="dot" style="background:${color}"></span><span class="ctitle">${title}</span><button class="pinbtn" type="button" tabindex="-1" aria-hidden="true">${PIN_ICON}</button></div>`;

/* ---- 由真實資料產生視覺（沿用原型的 SVG/列表產生邏輯）---- */

function donutInner(segs, totalExp) {
  const r = 52, c = 2 * Math.PI * r, size = 128;
  let off = 0, parts = '';
  for (const s of segs) {
    const len = c * s.pct / 100;
    parts += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${(len - 3).toFixed(2)} ${(c - len + 3).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/>`;
    off += len;
  }
  if (!segs.length) {
    parts = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fill)" stroke-width="16"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${parts}</svg>
    <div class="center"><div class="lab">本月支出</div><div class="amt mono">${fmtMoney(totalExp)}</div></div>`;
}

function sparkInner(pts, labels) {
  const W = 320, H = 140, pad = 8, plotH = H - 30, max = Math.max(1, ...pts);
  const n = Math.max(1, pts.length - 1);
  const xs = pts.map((_, i) => pad + i * (W - pad * 2) / n);
  const ys = pts.map((v) => 12 + plotH - v / max * plotH);
  let d = ''; xs.forEach((x, i) => { d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)} `; });
  const area = `${d} L${xs[xs.length - 1].toFixed(1)} ${12 + plotH} L${xs[0].toFixed(1)} ${12 + plotH} Z`;
  const lab = xs.map((x, i) => `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted2)" font-family="var(--mono)">${escapeHtml((labels[i] || '').slice(-2))}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area}" fill="var(--expense)" opacity="0.10"/>
    <path d="${d}" fill="none" stroke="var(--expense)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${xs[xs.length - 1].toFixed(1)}" cy="${ys[ys.length - 1].toFixed(1)}" r="4" fill="var(--expense)" stroke="var(--surface)" stroke-width="2"/>
    ${lab}
  </svg>`;
}

function txRowsInner(records) {
  if (!records.length) return '<div style="text-align:center;color:var(--muted2);padding:24px 0">本月尚無記錄</div>';
  return records.slice(0, 5).map((r, i) => {
    const sub = `${escapeHtml(r.date)}${r.description ? ' · ' + escapeHtml(r.description) : ''}`;
    if (r.type === 'transfer') {
      return `<div class="tx${i >= 2 ? ' thumb-hide' : ''}"><div class="ic" style="background:color-mix(in srgb, #8a8a94 16%, transparent)"><svg viewBox="0 0 24 24" fill="none" stroke="#8a8a94" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/></svg></div>
        <div class="nm"><b>內部轉移</b><small>${sub}</small></div><div class="amt mono" style="color:var(--muted2)">${fmtMoney(r.amount)}</div></div>`;
    }
    const m = categoryMeta(r.category);
    const income = r.type === 'income';
    return `<div class="tx${i >= 2 ? ' thumb-hide' : ''}"><div class="ic" style="background:color-mix(in srgb, ${m.color} 16%, transparent)"><svg viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M4 10h16"/></svg></div>
      <div class="nm"><b>${escapeHtml(r.category)}</b><small>${sub}</small></div><div class="amt mono" style="color:${income ? 'var(--income)' : 'var(--text)'}">${income ? '+' : '−'}${fmtMoney(r.amount)}</div></div>`;
  }).join('');
}

function budRow(name, b, s) {
  const m = categoryMeta(name);
  const pct = b > 0 ? Math.min(100, s / b * 100) : 0;
  return `<div class="brow"><div class="lab"><span class="n">${escapeHtml(name)}</span><span class="v mono">${fmtMoney(s)} / ${fmtMoney(b)}</span></div>
    <div class="track"><i style="width:${pct}%;background:${m.color}"></i></div></div>`;
}

function budgetInner(budget, spentMap, totalExpense) {
  const keys = Object.keys(budget).filter((k) => budget[k] > 0);
  const totalBudget = keys.reduce((s, k) => s + budget[k], 0);
  const totalSpent = totalExpense;
  const pct = totalBudget > 0 ? Math.min(100, Math.round(totalSpent / totalBudget * 100)) : 0;
  const left = totalBudget - totalSpent;
  const top = keys.map((c) => ({ c, b: budget[c], s: spentMap[c] || 0 }))
    .sort((a, b) => b.s / b.b - a.s / a.b).slice(0, 4);
  const totalHtml = `<div class="bud-total"><span class="big mono">${fmtMoney(totalSpent)} <span style="font-size:13px;color:var(--faint)">/ ${fmtMoney(totalBudget)}</span></span><span style="font-size:12.5px;color:${left >= 0 ? 'var(--muted2)' : 'var(--expense)'}">${totalBudget === 0 ? '未設定' : (left >= 0 ? `剩 ${fmtMoney(left)}` : `超支 ${fmtMoney(-left)}`)}</span></div>
    <div class="track"><i style="width:${pct}%;background:${left >= 0 ? 'var(--accent)' : 'var(--expense)'}"></i></div>`;
  const rowsHtml = totalBudget === 0
    ? '<div id="budRows" class="thumb-hide" style="text-align:center;color:var(--muted2);padding:16px 0">尚未設定預算</div>'
    : `<div id="budRows" class="thumb-hide">${top.map((x) => budRow(x.c, x.b, x.s)).join('')}</div>`;
  return totalHtml + rowsHtml;
}

/* ---- KPI 列 ---- */
const KPI_ICONS = {
  net: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h.01"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>',
  income: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10M17 7v10H7"/></svg>',
  expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17L7 7M7 17V7h10"/></svg>',
  transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3L4 7l4 4M4 7h12M16 21l4-4-4-4M20 17H8"/></svg>',
};
function kpiCard(icon, label, valueHtml) {
  return `<div class="kpi"><div class="kl">${icon}${label}</div><div class="kv mono">${valueHtml}</div></div>`;
}
function kpiRowHtml({ overview, stats }) {
  const income = stats.total_income || 0, expense = stats.total_expense || 0;
  const cash = overview ? overview.cash_balance : (stats.balance != null ? stats.balance : income - expense);
  const net = overview ? overview.net_balance : cash;
  const sign = (v) => (v >= 0 ? 'var(--income)' : 'var(--expense)');
  const cards = [
    kpiCard(KPI_ICONS.net, '淨資產', `<span style="color:${sign(net)}">NT$ ${fmtMoney(net)}</span>`),
    kpiCard(KPI_ICONS.cash, '現金結餘', `<span style="color:${sign(cash)}">NT$ ${fmtMoney(cash)}</span>`),
    kpiCard(KPI_ICONS.income, '本月收入', `<span style="color:var(--income)">NT$ ${fmtMoney(income)}</span>`),
    kpiCard(KPI_ICONS.expense, '本月支出', `<span style="color:var(--expense)">NT$ ${fmtMoney(expense)}</span>`),
  ];
  const recv = overview ? overview.receivable : 0, pay = overview ? overview.payable : 0;
  cards.push(kpiCard(KPI_ICONS.transfer, '應收 / 應付',
    `<span style="color:var(--income)">${fmtMoney(recv)}</span> <span style="color:var(--faint)">/</span> <span style="color:var(--expense)">${fmtMoney(pay)}</span>`));
  return `<div class="kpis">${cards.join('')}</div>`;
}

/* ---- 四張卡 ---- */
function donutCardHtml(segs, totalExp) {
  const legend = segs.slice(0, 5).map((s) => `<div class="row"><span class="dot" style="background:${s.color}"></span><span class="n">${escapeHtml(s.label)}</span><span class="v mono">${Math.round(s.pct)}%</span></div>`).join('')
    || '<div class="row" style="color:var(--muted2)">本月尚無支出</div>';
  return `<article class="card" data-id="donut" tabindex="0" role="button" aria-pressed="false">
    ${cheadHtml('var(--c1, #7d6fe0)', '分類佔比')}
    <div class="cbody">
      <div class="donut-wrap skel-target">
        <div class="donut">${donutInner(segs, totalExp)}</div>
        <div class="legend thumb-hide">${legend}</div>
      </div>
      <div class="skel-overlay skel-donut">
        <div class="skel-circle" style="width:96px;height:96px"></div>
        <div class="skel-legend"><div class="skel-bar" style="width:76px;height:9px"></div><div class="skel-bar" style="width:60px;height:9px"></div><div class="skel-bar" style="width:68px;height:9px"></div></div>
      </div>
      ${flinkHtml('stats', '統計')}
    </div>
  </article>`;
}
function trendCardHtml(trends) {
  const pts = (trends && trends.expense) || [];
  const labels = (trends && trends.months) || [];
  return `<article class="card" data-id="trend" tabindex="0" role="button" aria-pressed="false">
    ${cheadHtml('var(--expense)', '支出趨勢')}
    <div class="cbody">
      <div class="spark skel-target">${sparkInner(pts.length ? pts : [0], labels)}</div>
      <div class="skel-overlay skel-trend">
        <div class="skel-bar" style="height:38%"></div><div class="skel-bar" style="height:26%"></div><div class="skel-bar" style="height:55%"></div><div class="skel-bar" style="height:22%"></div><div class="skel-bar" style="height:12%"></div><div class="skel-bar" style="height:80%"></div>
      </div>
      ${flinkHtml('stats', '統計')}
    </div>
  </article>`;
}
function recentCardHtml(records) {
  return `<article class="card" data-id="recent" tabindex="0" role="button" aria-pressed="false">
    ${cheadHtml('var(--accent)', '最近交易')}
    <div class="cbody">
      <div class="skel-target">${txRowsInner(records)}</div>
      <div class="skel-overlay skel-recent">
        <div class="skel-row"><div class="skel-circle" style="width:29px;height:29px"></div><div class="skel-lines"><div class="skel-bar" style="width:58%;height:9px"></div><div class="skel-bar" style="width:36%;height:8px"></div></div></div>
        <div class="skel-row"><div class="skel-circle" style="width:29px;height:29px"></div><div class="skel-lines"><div class="skel-bar" style="width:44%;height:9px"></div><div class="skel-bar" style="width:30%;height:8px"></div></div></div>
        <div class="skel-row"><div class="skel-circle" style="width:29px;height:29px"></div><div class="skel-lines"><div class="skel-bar" style="width:64%;height:9px"></div><div class="skel-bar" style="width:40%;height:8px"></div></div></div>
      </div>
      ${flinkHtml('ledger', '明細')}
    </div>
  </article>`;
}
function budgetCardHtml(budget, spentMap, totalExpense) {
  return `<article class="card" data-id="budget" tabindex="0" role="button" aria-pressed="false">
    ${cheadHtml('var(--income)', '預算概覽')}
    <div class="cbody">
      <div class="skel-target">${budgetInner(budget, spentMap, totalExpense)}</div>
      <div class="skel-overlay skel-budget">
        <div class="skel-bar" style="height:13px;width:60%"></div><div class="skel-bar" style="height:8px;width:100%"></div><div class="skel-bar" style="height:9px;width:85%"></div><div class="skel-bar" style="height:9px;width:70%"></div>
      </div>
      ${flinkHtml('budget', '預算')}
    </div>
  </article>`;
}

export async function renderDashboardDesktop(container) {
  container.innerHTML = '<div class="pindash"><div class="top"><div><h1>概覽</h1><div class="sub">載入中…</div></div></div></div>';
  let data;
  try {
    data = await fetchAll();
  } catch (e) {
    container.innerHTML = `<div class="pindash"><div class="top"><div><h1>概覽</h1></div></div><div style="padding:40px;color:var(--expense)">${escapeHtml(e.message)}</div></div>`;
    return;
  }

  const spentMap = {};
  for (const c of (data.stats.category_stats || [])) spentMap[c._id] = c.total;
  const segs = (data.stats.category_stats || [])
    .map((c) => ({ label: c._id || '其他', value: c.total, color: categoryMeta(c._id).color }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  // 圓心與各段比例都以「真實本月總支出」為分母（含未進圖例的長尾分類），與 KPI 本月支出一致。
  const totalExp = data.stats.total_expense || segs.reduce((s, c) => s + c.value, 0);
  segs.forEach((s) => { s.pct = totalExp ? s.value / totalExp * 100 : 0; });

  const root = document.createElement('div');
  root.className = 'pindash';
  root.innerHTML = `
    <div class="top"><div><h1>概覽</h1><div class="sub">${escapeHtml(data.label)} · 財務總覽　<b>點卡片釘選放大</b> · 再點取消</div></div></div>
    ${kpiRowHtml(data)}
    <div class="deck">
      ${donutCardHtml(segs, totalExp)}
      ${trendCardHtml(data.trends)}
      ${recentCardHtml(data.records)}
      ${budgetCardHtml(data.budget, spentMap, data.stats.total_expense || 0)}
    </div>`;
  container.innerHTML = '';
  container.appendChild(root);
  mountPinDeck(root, { onNav: (view) => emit('nav', view) });
}
