/**
 * stats.js — 統計：分類佔比甜甜圈 + 月度收支長條 + 支出趨勢折線（皆互動）。
 * 串 GET stats（當月分類）、GET trends（近 6 月）。
 */

import { apiJson } from './api.js';
import { categoryMeta } from './config.js';
import { fmtMoney, escapeHtml } from './utils.js';
import { monthRange } from './store.js';
import { donut, bars, line } from './charts.js';
import { lockQueryParams, lockBadgeHtml, bindLockBadge } from './lock.js';

async function fetchData() {
  const { start, end } = monthRange();
  const lock = lockQueryParams();
  const [stats, trends] = await Promise.all([
    apiJson(`/admin/api/accounting/stats?start_date=${start}&end_date=${end}${lock}`),
    apiJson(`/admin/api/accounting/trends?months=6${lock}`),
  ]);
  return { stats, trends };
}

export function donutCard(stats) {
  const cats = (stats.category_stats || []).map((c) => ({ label: c._id || '其他', value: c.total, color: categoryMeta(c._id).color }));
  const totalExp = cats.reduce((s, c) => s + c.value, 0);
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.cssText = 'padding:18px';
  wrap.innerHTML = `<div style="font-weight:600;font-size:15px;color:var(--text);margin-bottom:12px">分類佔比</div>
    <div style="display:flex;justify-content:center;position:relative;margin-bottom:6px">
      <div data-el="donut"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
        <div data-el="cLabel" style="font-size:var(--text-base);color:var(--muted2)">本月支出</div>
        <div data-el="cAmt" class="mono" style="font-weight:500;font-size:var(--text-2xl);color:var(--text)">${fmtMoney(totalExp)}</div>
        <div data-el="cSub" style="font-size:11px;color:var(--faint)">${cats.length} 個分類</div>
      </div>
    </div>
    <div data-el="legend" style="display:flex;flex-direction:column;gap:9px;margin-top:14px"></div>`;
  const dEl = wrap.querySelector('[data-el="donut"]');
  const setCenter = (item) => {
    wrap.querySelector('[data-el="cLabel"]').textContent = item ? item.label : '本月支出';
    wrap.querySelector('[data-el="cAmt"]').textContent = fmtMoney(item ? item.value : totalExp);
    wrap.querySelector('[data-el="cSub"]').textContent = item ? `${item.pct.toFixed(1)}%` : `${cats.length} 個分類`;
  };
  // 延後渲染（等進 DOM 有寬度）
  requestAnimationFrame(() => donut(dEl, cats, { size: 200, onSelect: setCenter }));
  wrap.querySelector('[data-el="legend"]').innerHTML = cats.slice(0, 6).map((c) => `
    <div style="display:flex;align-items:center;gap:10px">
      <span style="width:10px;height:10px;border-radius:3px;background:${c.color};flex-shrink:0"></span>
      <span style="flex:1;font-size:var(--text-emphasis);color:var(--text)">${escapeHtml(c.label)}</span>
      <span class="mono" style="font-size:13px;color:var(--text2)">${fmtMoney(c.value)}</span>
      <span style="font-size:var(--text-base);color:var(--muted2);min-width:44px;text-align:right">${totalExp ? (c.value / totalExp * 100).toFixed(0) : 0}%</span>
    </div>`).join('') || '<div style="text-align:center;color:var(--muted2);padding:10px">本月尚無支出</div>';
  return wrap;
}

function barsCard(trends) {
  const rows = trends.months.map((m, i) => ({ label: m, income: trends.income[i] || 0, expense: trends.expense[i] || 0 }));
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.cssText = 'padding:18px';
  wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-weight:600;font-size:15px;color:var(--text)">月度收支比較</span>
      <span style="font-size:var(--text-base);color:var(--muted2)"><span style="color:var(--income)">■</span> 收 <span style="color:var(--expense);margin-left:6px">■</span> 支</span>
    </div><div data-el="bars" style="height:200px"></div>`;
  requestAnimationFrame(() => bars(wrap.querySelector('[data-el="bars"]'), rows));
  return wrap;
}

export function lineCard(trends) {
  const pts = trends.months.map((m, i) => ({ label: m, value: trends.expense[i] || 0 }));
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.cssText = 'padding:18px';
  wrap.innerHTML = `<div style="font-weight:600;font-size:15px;color:var(--text);margin-bottom:12px">支出趨勢</div><div data-el="line" style="height:190px"></div>`;
  requestAnimationFrame(() => line(wrap.querySelector('[data-el="line"]'), pts, { color: 'var(--expense)' }));
  return wrap;
}

async function render(container, mode) {
  container.innerHTML = mode === 'desktop'
    ? '<div class="page"><div class="page-title">統計</div><div class="page-sub">載入中…</div></div>'
    : '<div style="padding:6px 20px 0"><span style="font-weight:700;font-size:22px;color:var(--text)">統計</span></div><div style="padding:40px;text-align:center;color:var(--muted2)">載入中…</div>';
  let data;
  try { data = await fetchData(); } catch (e) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--expense)">${escapeHtml(e.message)}</div>`; return;
  }
  if (mode === 'desktop') {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = '<div class="page-title" style="margin-bottom:20px">統計</div>';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:18px';
    grid.append(donutCard(data.stats), barsCard(data.trends));
    const lc = lineCard(data.trends); lc.style.gridColumn = '1 / -1';
    grid.append(lc);
    page.appendChild(grid);
    container.innerHTML = ''; container.appendChild(page);
  } else {
    container.innerHTML = `<div style="padding:6px 20px 0;flex-shrink:0">${lockBadgeHtml()}<span style="font-weight:700;font-size:22px;color:var(--text)">統計</span></div>`;
    bindLockBadge(container);
    const scroll = document.createElement('div');
    scroll.className = 'noscroll';
    scroll.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px 100px;display:flex;flex-direction:column;gap:16px';
    scroll.append(donutCard(data.stats), barsCard(data.trends), lineCard(data.trends));
    container.appendChild(scroll);
  }
}

export function renderStatsMobile(c) { return render(c, 'mobile'); }
export function renderStatsDesktop(c) { return render(c, 'desktop'); }
