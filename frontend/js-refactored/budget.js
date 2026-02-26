/**
 * 預算管理模組 - 處理預算設定和使用情況顯示
 *
 * 功能：
 * - 載入預算設定
 * - 儲存預算設定
 * - 顯示預算使用情況（進度條、警告）
 * - 自動更新預算使用狀態
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { showToast } from './utils.js';

/**
 * 載入預算設定
 */
export async function loadBudget() {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/budget`);
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || '載入失敗');

        if (result.budget) {
            document.querySelectorAll('.budget-input').forEach(input => {
                const category = input.dataset.category;
                if (result.budget[category] !== undefined) {
                    input.value = result.budget[category];
                }
            });
        }

        // 發送預算載入完成事件
        EventBus.emit(EVENTS.BUDGET_LOADED, result.budget || {});

    } catch (error) {
        console.error('載入預算失敗:', error);
    }
}

/**
 * 儲存預算設定
 */
export async function saveBudget() {
    const budget = {};

    document.querySelectorAll('.budget-input').forEach(input => {
        const category = input.dataset.category;
        const amount = parseFloat(input.value) || 0;
        budget[category] = amount;
    });

    const saveBudgetBtn = document.getElementById('save-budget-btn');
    if (!saveBudgetBtn) return;

    saveBudgetBtn.disabled = true;
    saveBudgetBtn.innerHTML = '<span class="spinner"></span>儲存中...';

    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/budget`, {
            method: 'POST',
            body: JSON.stringify({ budget })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '儲存失敗');

        saveBudgetBtn.innerHTML = '<i class="fas fa-check mr-2"></i>已儲存';

        // 發送預算儲存完成事件
        EventBus.emit(EVENTS.BUDGET_UPDATED, budget);

        // 儲存成功後，請求更新統計數據（stats 模組會處理）
        EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);

        setTimeout(() => {
            saveBudgetBtn.innerHTML = '<i class="fas fa-save mr-2"></i>儲存預算';
            saveBudgetBtn.disabled = false;
        }, 2000);

    } catch (error) {
        showToast(`儲存預算失敗: ${error.message}`, 'error');
        saveBudgetBtn.innerHTML = '<i class="fas fa-save mr-2"></i>儲存預算';
        saveBudgetBtn.disabled = false;
    }
}

/**
 * 更新預算使用情況顯示
 * @param {Array} categoryStats - 分類統計數據 [{_id: '食物', total: 1000}, ...]
 */
export async function updateBudgetUsage(categoryStats) {
    try {
        // 載入預算數據
        const response = await apiCall(`${backendUrl}/admin/api/accounting/budget`);
        const result = await response.json();

        const budgetUsageSection = document.getElementById('budget-usage-section');
        const budgetUsageList = document.getElementById('budget-usage-list');

        if (!response.ok || !result.budget) {
            if (budgetUsageSection) budgetUsageSection.classList.add('hidden');
            return;
        }

        if (!budgetUsageList) return;

        const budget = result.budget;

        // 建立分類支出 map
        const categorySpending = {};
        categoryStats.forEach(stat => {
            categorySpending[stat._id] = stat.total;
        });

        // 生成預算使用情況 HTML
        let hasAnyBudget = false;
        const items = [];

        for (const [category, budgetAmount] of Object.entries(budget)) {
            if (budgetAmount > 0) {
                hasAnyBudget = true;
                const spent = categorySpending[category] || 0;
                const percentage = (spent / budgetAmount) * 100;
                const remaining = budgetAmount - spent;

                // 決定狀態和樣式
                let statusClass, statusIcon, statusText, progressColor;
                if (percentage >= 100) {
                    statusClass = 'text-red-600';
                    statusIcon = 'fa-exclamation-triangle';
                    statusText = '超出預算';
                    progressColor = 'bg-red-500';
                } else if (percentage >= 80) {
                    statusClass = 'text-yellow-600';
                    statusIcon = 'fa-exclamation-circle';
                    statusText = '接近上限';
                    progressColor = 'bg-yellow-500';
                } else {
                    statusClass = 'text-green-600';
                    statusIcon = 'fa-check-circle';
                    statusText = '正常';
                    progressColor = 'bg-green-500';
                }

                items.push(`
                    <div class="p-4 bg-gray-50 rounded-lg">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-gray-800">${category}</span>
                                <span class="${statusClass} text-xs flex items-center gap-1">
                                    <i class="fas ${statusIcon}"></i>
                                    ${statusText}
                                </span>
                            </div>
                            <span class="text-sm text-gray-600">
                                $${spent.toFixed(2)} / $${budgetAmount.toFixed(2)}
                            </span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                            <div class="${progressColor} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.min(percentage, 100).toFixed(1)}%"></div>
                        </div>
                        <div class="flex justify-between text-xs text-gray-600">
                            <span>${percentage.toFixed(1)}% 已使用</span>
                            <span class="${remaining >= 0 ? 'text-green-600' : 'text-red-600'}">
                                剩餘 $${Math.abs(remaining).toFixed(2)}
                            </span>
                        </div>
                    </div>
                `);
            }
        }

        if (hasAnyBudget) {
            budgetUsageList.innerHTML = items.join('');
            if (budgetUsageSection) budgetUsageSection.classList.remove('hidden');

            // 發送預算使用情況更新完成事件
            EventBus.emit(EVENTS.BUDGET_USAGE_UPDATE, {
                hasAnyBudget,
                categoryCount: items.length
            });
        } else {
            if (budgetUsageSection) budgetUsageSection.classList.add('hidden');
        }

    } catch (error) {
        console.error('更新預算使用情況失敗:', error);
        const budgetUsageSection = document.getElementById('budget-usage-section');
        if (budgetUsageSection) budgetUsageSection.classList.add('hidden');
    }
}

/**
 * 初始化預算管理模組
 */
export function initBudget() {
    // 監聽統計更新完成事件 -> 更新預算使用情況
    EventBus.on(EVENTS.STATS_UPDATED, ({ categoryStats }) => {
        if (categoryStats && categoryStats.length > 0) {
            updateBudgetUsage(categoryStats);
        }
    });

    // 監聽頁面載入事件
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'budget') {
            // 預算設定頁載入時，載入預算數據
            loadBudget();
        }
    });

    // 監聽預算更新完成事件（可能需要更新其他元件）
    EventBus.on(EVENTS.BUDGET_UPDATED, () => {
        console.log('✅ [Budget] 預算已儲存');
    });

    // 設定儲存按鈕事件
    const saveBudgetBtn = document.getElementById('save-budget-btn');
    if (saveBudgetBtn) {
        saveBudgetBtn.addEventListener('click', saveBudget);
    }

    // 暴露到全局（供 HTML onclick 使用）
    window.loadBudget = loadBudget;
    window.saveBudget = saveBudget;
    window.updateBudgetUsage = updateBudgetUsage;

    console.log('✅ [Budget] 預算管理模組已初始化');
}
