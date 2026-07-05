/**
 * dashboard.js — 電腦版概覽儀表板（僅桌面）。
 * 一頁式吃滿寬：KPI 列（含欠款淨資產）＋ 分類佔比／支出趨勢 ＋ 最近交易／預算概覽。
 * 複用 stats.js 的圖表卡與 budget.js 的預算摘要卡，不重寫圖表與計算邏輯。
 */

import { apiJson } from './api.js';
import { categoryMeta } from './config.js';
import { fmtMoney, escapeHtml } from './utils.js';
import { monthRange, emit } from './store.js';
import { donutCard, lineCard } from './stats.js';
import { budgetSummaryCard } from './budget.js';

async function fetchAll() {
  const { start, end, label } = monthRange();
  const [overview, stats, trends, recentRaw] = await Promise.all([
    // 整合概覽（含欠款）為較新端點；失敗時不讓整個儀表板壞掉，退回純現金視角
    apiJson('/admin/api/stats/overview').catch(() => null),
    apiJson(`/admin/api/accounting/stats?start_date=${start}&end_date=${end}`),
    apiJson('/admin/api/accounting/trends?months=6'),
    apiJson(`/admin/api/accounting/records?page=1&limit=8&start_date=${start}&end_date=${end}&sort_by=date&sort_order=desc`),
  ]);
  const records = Array.isArray(recentRaw) ? recentRaw : (recentRaw.records || []);
  return { overview, stats, trends, records, label };
}

function kpiCard(label, valueHtml, { color, icon, sub } = {}) {
  return `<div class="kpi">
    <div class="kpi-label">${icon ? `<i class="ti ${icon}"></i>` : ''}${escapeHtml(label)}</div>
    <div class="kpi-value mono"${color ? ` style="color:${color}"` : ''}>${valueHtml}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function kpisHtml({ overview, stats }) {
  const income = stats.total_income || 0;
  const expense = stats.total_expense || 0;
  const cash = overview ? overview.cash_balance : (stats.balance != null ? stats.balance : income - expense);
  const net = overview ? overview.net_balance : cash;
  const sign = (v) => (v >= 0 ? 'var(--income)' : 'var(--expense)');
  const cards = [
    kpiCard('淨資產', `NT$ ${fmtMoney(net)}`, { color: sign(net), icon: 'ti-wallet', sub: overview ? '現金 + 應收 − 應付' : '現金（欠款資料暫無）' }),
    kpiCard('現金結餘', `NT$ ${fmtMoney(cash)}`, { color: sign(cash), icon: 'ti-cash' }),
    kpiCard('本月收入', `NT$ ${fmtMoney(income)}`, { color: 'var(--income)', icon: 'ti-arrow-down-left' }),
    kpiCard('本月支出', `NT$ ${fmtMoney(expense)}`, { color: 'var(--expense)', icon: 'ti-arrow-up-right' }),
  ];
  if (overview) {
    cards.push(kpiCard(
      '應收 / 應付',
      `<span style="color:var(--income)">${fmtMoney(overview.receivable)}</span> <span style="color:var(--faint)">/</span> <span style="color:var(--expense)">${fmtMoney(overview.payable)}</span>`,
      { icon: 'ti-transfer', sub: `借出 ${overview.lent_count || 0} · 借入 ${overview.borrowed_count || 0}` },
    ));
  }
  return `<div class="dash-kpis">${cards.join('')}</div>`;
}

function recentCard(records) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.cssText = 'padding:18px';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const rowsHtml = records.length
    ? records.map((r) => {
      const m = categoryMeta(r.category);
      const bg = m.color + (isDark ? '26' : '1f');
      return `<div class="dash-recent-row" style="display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--border)">
        <div class="cat-icon" style="width:32px;height:32px;background:${bg}"><i class="ti ${m.icon}" style="color:${m.color};font-size:17px"></i></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;color:var(--text)">${escapeHtml(r.category)}</div>
          <div style="font-size:12px;color:var(--muted2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.date)}${r.description ? ' · ' + escapeHtml(r.description) : ''}</div>
        </div>
        <span class="mono" style="font-size:14px;font-weight:500;color:${r.type === 'income' ? 'var(--income)' : 'var(--text)'}">${r.type === 'income' ? '+' : '−'}${fmtMoney(r.amount)}</span>
      </div>`;
    }).join('')
    : '<div style="text-align:center;color:var(--muted2);padding:24px 0">本月尚無記錄</div>';
  wrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-weight:600;font-size:15px;color:var(--text)">最近交易</span>
      <button class="link" data-el="all">看全部 <i class="ti ti-chevron-right"></i></button>
    </div>${rowsHtml}`;
  const rows = wrap.querySelectorAll('.dash-recent-row');
  if (rows.length) rows[rows.length - 1].style.borderBottom = 'none';
  wrap.querySelector('[data-el="all"]').onclick = () => emit('nav', 'ledger');
  return wrap;
}

export async function renderDashboardDesktop(container) {
  container.innerHTML = '<div class="page"><div class="page-title">概覽</div><div class="page-sub">載入中…</div></div>';
  let data;
  try {
    data = await fetchAll();
  } catch (e) {
    container.innerHTML = `<div class="page"><div style="color:var(--expense);padding:40px">${escapeHtml(e.message)}</div></div>`;
    return;
  }

  const page = document.createElement('div');
  page.className = 'page';
  page.innerHTML = `<div style="margin-bottom:20px"><div class="page-title">概覽</div><div class="page-sub">${data.label} · 財務總覽</div></div>${kpisHtml(data)}`;

  const charts = document.createElement('div');
  charts.className = 'dash-row charts';
  charts.append(donutCard(data.stats), lineCard(data.trends));
  page.appendChild(charts);

  const panels = document.createElement('div');
  panels.className = 'dash-row panels';
  panels.appendChild(recentCard(data.records));
  const budgetHolder = document.createElement('div');
  budgetHolder.className = 'card';
  budgetHolder.style.cssText = 'padding:18px;color:var(--muted2)';
  budgetHolder.textContent = '預算載入中…';
  panels.appendChild(budgetHolder);
  page.appendChild(panels);

  // 先掛上（讓圖表以正確寬度渲染），預算摘要就緒後再替換佔位卡
  container.innerHTML = '';
  container.appendChild(page);
  const budgetCard = await budgetSummaryCard().catch(() => null);
  if (budgetCard) budgetHolder.replaceWith(budgetCard);
  else budgetHolder.textContent = '預算載入失敗';
}
