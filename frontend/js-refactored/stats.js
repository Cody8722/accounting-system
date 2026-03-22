/**
 * 統計數據模組 - 處理收支統計和數字動畫
 *
 * 功能：
 * - 載入和更新統計數據（收入、支出、餘額）
 * - 數字滾動動畫
 * - Stale-while-revalidate 策略（立即顯示快取，背景更新）
 * - 樂觀更新協調
 * - 簡潔統計列同步
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';

/**
 * DOM 元素引用
 */
let totalIncomeEl = null;
let totalExpenseEl = null;
let balanceEl = null;

/**
 * 統計記憶：上次成功取得的統計資料，用於切頁時立即顯示（Stale-while-revalidate）
 */
let lastKnownStats = null;

/**
 * 數字滾動動畫函數
 * @param {HTMLElement} element - 要更新的元素
 * @param {string|number} targetValue - 目標值
 * @param {number} duration - 動畫持續時間（毫秒）
 * @param {boolean} forceAnimate - 強制播放動畫（即使值相同）
 */
export function animateNumber(element, targetValue, duration = 1000, forceAnimate = false) {
    // 檢查元素是否存在
    if (!element) return;

    const startText = element.textContent;
    const startValue = parseFloat(startText.replace(/[^0-9.-]/g, '')) || 0;
    const target = parseFloat(targetValue);

    // 若值相同且非強制動畫，直接跳過
    if (!forceAnimate && Math.abs(startValue - target) < 0.01) {
        return;
    }

    const startTime = performance.now();
    const diff = target - startValue;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 使用緩動函數（ease-out）
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const current = startValue + (diff * easeProgress);
        element.textContent = `$${current.toFixed(2)}`;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // 確保最終值準確
            element.textContent = `$${target.toFixed(2)}`;
        }
    }

    requestAnimationFrame(update);
}

/**
 * 直接將統計數字寫入 DOM（不帶動畫，用於立即呈現快取值）
 * @param {Object} stats - 統計數據 {total_income, total_expense, balance}
 */
export function applyStatsToDOM(stats) {
    const fmt = (v) => `$${parseFloat(v).toFixed(2)}`;

    if (totalIncomeEl)  totalIncomeEl.textContent  = fmt(stats.total_income);
    if (totalExpenseEl) totalExpenseEl.textContent = fmt(stats.total_expense);
    if (balanceEl) {
        balanceEl.textContent  = fmt(stats.balance);
        balanceEl.className = `text-3xl font-bold ${stats.balance >= 0 ? 'text-blue-700' : 'text-red-700'}`;
    }

    // 同步更新簡潔統計列
    const compactIncome = document.getElementById('compact-income');
    const compactExpense = document.getElementById('compact-expense');
    const compactBalance = document.getElementById('compact-balance');

    if (compactIncome)  compactIncome.textContent  = fmt(stats.total_income);
    if (compactExpense) compactExpense.textContent = fmt(stats.total_expense);
    if (compactBalance) {
        compactBalance.textContent = fmt(stats.balance);
        compactBalance.style.color = stats.balance >= 0 ? '#1d4ed8' : '#b91c1c';
    }
}

/**
 * 更新統計資料（主函數）
 * @param {boolean} forceAnimate - 強制播放動畫
 */
export async function updateAccountingStats(forceAnimate = false) {
    const startDate = document.getElementById('filter-start-date')?.value || '';
    const endDate = document.getElementById('filter-end-date')?.value || '';

    let url = `${backendUrl}/admin/api/accounting/stats?`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}`;

    // ① 立刻顯示上次已知的統計（Stale-while-revalidate，不等網路）
    if (lastKnownStats) {
        applyStatsToDOM(lastKnownStats);
    }

    try {
        // cache: 'no-store' 強制略過瀏覽器 HTTP cache，確保每次都從伺服器取得最新統計
        // 手機端 HTTP cache 較積極，若不加此選項，刪除後統計可能仍顯示舊資料
        const response = await apiCall(url, { cache: 'no-store' });

        const stats = await response.json();
        if (!response.ok) throw new Error(stats.error || '載入失敗');

        // ② 儲存最新統計
        lastKnownStats = stats;

        // ③ 若值有變化，播放平滑動畫；相同則跳過（animateNumber 自動判斷）
        // forceAnimate = true 只在分析頁等「慶祝式」場合使用
        animateNumber(totalIncomeEl, stats.total_income.toFixed(2), 1000, forceAnimate);
        animateNumber(totalExpenseEl, stats.total_expense.toFixed(2), 1000, forceAnimate);
        animateNumber(balanceEl, stats.balance.toFixed(2), 1000, forceAnimate);

        if (balanceEl) {
            balanceEl.className = `text-3xl font-bold ${stats.balance >= 0 ? 'text-blue-700' : 'text-red-700'}`;
        }

        // 同步更新簡潔統計列
        const compactIncome = document.getElementById('compact-income');
        const compactExpense = document.getElementById('compact-expense');
        const compactBalance = document.getElementById('compact-balance');

        if (compactIncome) animateNumber(compactIncome, stats.total_income.toFixed(2), 1000, forceAnimate);
        if (compactExpense) animateNumber(compactExpense, stats.total_expense.toFixed(2), 1000, forceAnimate);
        if (compactBalance) {
            animateNumber(compactBalance, stats.balance.toFixed(2), 1000, forceAnimate);
            compactBalance.style.color = stats.balance >= 0 ? '#1d4ed8' : '#b91c1c';
        }

        // 發送統計更新完成事件（包含分類統計，供預算模組使用）
        EventBus.emit(EVENTS.STATS_UPDATED, {
            income: stats.total_income,
            expense: stats.total_expense,
            balance: stats.balance,
            categoryStats: stats.category_stats || []
        });

    } catch (error) {
        console.error('更新統計失敗:', error);
    }
}

/**
 * 樂觀更新統計數據（用於立即反映 UI 變化）
 * @param {Object} optimisticStats - 樂觀統計數據
 */
export function applyOptimisticStatsUpdate(optimisticStats) {
    lastKnownStats = optimisticStats;
    applyStatsToDOM(optimisticStats);
}

/**
 * 更新簡潔統計列（不帶動畫）
 */
export function updateCompactStats() {
    if (lastKnownStats) {
        const compactIncome = document.getElementById('compact-income');
        const compactExpense = document.getElementById('compact-expense');
        const compactBalance = document.getElementById('compact-balance');

        const fmt = (v) => `$${parseFloat(v).toFixed(2)}`;

        if (compactIncome)  compactIncome.textContent  = fmt(lastKnownStats.total_income);
        if (compactExpense) compactExpense.textContent = fmt(lastKnownStats.total_expense);
        if (compactBalance) {
            compactBalance.textContent = fmt(lastKnownStats.balance);
            compactBalance.style.color = lastKnownStats.balance >= 0 ? '#1d4ed8' : '#b91c1c';
        }
    }
}

/**
 * 獲取上次已知的統計數據
 * @returns {Object|null} 統計數據或 null
 */
export function getLastKnownStats() {
    return lastKnownStats;
}

/**
 * 設置上次已知的統計數據（供樂觀更新使用）
 * @param {Object} stats - 統計數據
 */
export function setLastKnownStats(stats) {
    lastKnownStats = stats;
}

/**
 * 載入整合財務概覽（記帳 + 欠款）
 */
async function loadOverviewStats() {
    // 先顯示佔位符，避免顯示 $0 或舊數值
    ['net-balance', 'total-receivable', 'total-payable', 'debt-counts'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '---';
    });

    try {
        const response = await apiCall(`${backendUrl}/admin/api/stats/overview`);
        const data = await response.json();
        const fmt = (n) => `$${Math.abs(n).toLocaleString()}`;

        const netEl = document.getElementById('net-balance');
        const recEl = document.getElementById('total-receivable');
        const payEl = document.getElementById('total-payable');
        const cntEl = document.getElementById('debt-counts');

        if (netEl) {
            netEl.textContent = fmt(data.net_balance);
            netEl.className = `text-xl font-bold ${data.net_balance >= 0 ? 'text-blue-600' : 'text-red-500'}`;
        }
        if (recEl) recEl.textContent = `+${fmt(data.receivable + data.group_receivable)}`;
        if (payEl) payEl.textContent = `-${fmt(data.payable)}`;
        if (cntEl) {
            const parts = [];
            if (data.lent_count) parts.push(`借出 ${data.lent_count}`);
            if (data.borrowed_count) parts.push(`借入 ${data.borrowed_count}`);
            if (data.group_count) parts.push(`群組 ${data.group_count}`);
            cntEl.textContent = parts.length ? parts.join(' / ') : '無未結清';
        }
    } catch (e) {
        console.warn('[Stats] 整合統計載入失敗:', e);
    }
}

/**
 * 初始化統計模組
 */
export function initStats() {
    // 獲取 DOM 元素引用
    totalIncomeEl = document.getElementById('total-income');
    totalExpenseEl = document.getElementById('total-expense');
    balanceEl = document.getElementById('balance');

    // 監聽統計更新請求事件
    EventBus.on(EVENTS.STATS_REQUEST_UPDATE, () => {
        updateAccountingStats(false);
        loadOverviewStats();
    });

    // 監聽記錄變更事件，自動更新統計
    EventBus.on(EVENTS.RECORD_ADDED, () => {
        // 記錄新增後，靜默刷新統計（不帶動畫）
        updateAccountingStats(false);
    });

    EventBus.on(EVENTS.RECORD_UPDATED, () => {
        // 記錄更新後，靜默刷新統計
        updateAccountingStats(false);
    });

    EventBus.on(EVENTS.RECORD_DELETED, () => {
        // 記錄刪除後，靜默刷新統計
        updateAccountingStats(false);
    });

    // 監聽頁面切換事件
    EventBus.on(EVENTS.PAGE_CHANGED, ({ page }) => {
        if (page === 'add') {
            // 記帳頁：先立刻呈現快取統計，再背景更新（Stale-while-revalidate）
            // forceAnimate=false：值有改變才播動畫，避免每次切頁都從 0 重播
            updateAccountingStats(false);
        } else if (page === 'analytics') {
            // 分析頁：每次切換都播放動畫（慶祝式體驗）
            updateAccountingStats(true);
        }
    });

    // 監聽頁面載入事件
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'dashboard' || page === 'add' || page === 'analytics') {
            updateAccountingStats(false);
            loadOverviewStats();
        }
    });

    // 暴露到全局（供 HTML onclick 和調試使用）
    window.updateAccountingStats = updateAccountingStats;
    window.applyStatsToDOM = applyStatsToDOM;
    window.animateNumber = animateNumber;

    console.log('✅ [Stats] 統計數據模組已初始化');
}
