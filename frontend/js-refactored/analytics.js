/**
 * 分析模組 - 環比比較和期間快速切換
 *
 * 功能：
 * - 環比比較（本期 vs 上期：本月/本季/本年）
 * - 日期範圍快速切換按鈕（本月/本季/本年）
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { escapeHtml } from './utils.js';

/**
 * 設定日期範圍（供篩選器快速按鈕使用）
 * @param {string} period - 'week' | 'month' | 'quarter' | 'year'
 */
export function setDateRange(period) {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start;
    if (period === 'week') {
        const day = now.getDay() || 7; // 週一=1, 週日=7
        const mon = new Date(now);
        mon.setDate(now.getDate() - day + 1);
        start = mon.toISOString().split('T')[0];
    } else if (period === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (period === 'quarter') {
        const q = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0];
    } else if (period === 'year') {
        start = `${now.getFullYear()}-01-01`;
    }

    const startEl = document.getElementById('filter-start-date');
    const endEl = document.getElementById('filter-end-date');
    if (startEl) startEl.value = start;
    if (endEl) endEl.value = end;

    EventBus.emit(EVENTS.RECORDS_FILTERED);
    EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);
}

/**
 * 載入環比比較資料並渲染卡片
 * @param {string} period - 'month' | 'quarter' | 'year'
 */
export async function loadPeriodComparison(period = 'month') {
    // 更新按鈕高亮
    document.querySelectorAll('.comparison-period-btn').forEach(btn => {
        if (btn.dataset.period === period) {
            btn.className = 'comparison-period-btn px-3 py-1 text-sm rounded-lg border border-indigo-300 bg-indigo-600 text-white font-medium transition';
        } else {
            btn.className = 'comparison-period-btn px-3 py-1 text-sm rounded-lg border border-indigo-300 text-indigo-600 font-medium hover:bg-indigo-50 transition';
        }
    });

    const container = document.getElementById('comparison-cards');
    if (!container) return;

    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/comparison?period=${period}`);
        if (!response.ok) throw new Error('載入失敗');
        const data = await response.json();

        const fmt = (v) => `$${Math.abs(v).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

        function renderCard(label, curVal, prevVal, pct, isExpense) {
            let arrowHtml;
            if (pct !== null && pct !== undefined) {
                const isPositive = isExpense ? pct < 0 : pct > 0;
                const color = isPositive ? 'text-green-600' : 'text-red-600';
                const arrow = pct >= 0 ? '▲' : '▼';
                arrowHtml = `<span class="${color} text-sm font-semibold">${arrow} ${Math.abs(pct)}%</span>`;
            } else {
                arrowHtml = `<span class="text-gray-400 text-sm">—</span>`;
            }
            return `
                <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p class="text-sm text-gray-500 mb-1">${label}</p>
                    <p class="text-2xl font-bold text-gray-800">${fmt(curVal)}</p>
                    <div class="flex items-center gap-2 mt-1">
                        ${arrowHtml}
                        <span class="text-xs text-gray-400">vs ${escapeHtml(data.previous.label)}</span>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">上期：${fmt(prevVal)}</p>
                </div>`;
        }

        container.innerHTML =
            renderCard('收入', data.current.income, data.previous.income, data.changes.income_pct, false) +
            renderCard('支出', data.current.expense, data.previous.expense, data.changes.expense_pct, true) +
            renderCard('結餘', data.current.balance, data.previous.balance, data.changes.balance_pct, false);

    } catch (error) {
        if (container) container.innerHTML = '<div class="text-center text-red-400 py-6 col-span-3">載入失敗</div>';
        console.error('載入環比資料失敗:', error);
    }
}

/**
 * 初始化分析模組
 */
export function initAnalytics() {
    // 暴露到 window 供 HTML onclick 使用
    window.setDateRange = setDateRange;
    window.loadPeriodComparison = loadPeriodComparison;

    // 監聽頁面切換到 analytics 時自動載入
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'analytics') {
            loadPeriodComparison('month');
        }
    });

    console.log('✅ [Analytics] 分析模組已初始化');
}
