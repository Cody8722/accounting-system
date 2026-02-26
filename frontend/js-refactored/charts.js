/**
 * 圖表渲染模組 - 處理數據可視化
 *
 * 功能：
 * - 支出分類圓餅圖（Doughnut Chart）
 * - 收支趨勢折線圖（Line Chart）
 * - Chart.js 實例管理
 * - 自動更新和重繪
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';

/**
 * Chart.js 實例
 */
let expenseChart = null;
let trendsChart = null;

/**
 * 更新支出分類圓餅圖
 * @param {Array} expenseRecords - 支出記錄陣列
 */
export function updateExpenseChart(expenseRecords) {
    const categoryData = {};

    // Aggregate expenses by category
    expenseRecords.forEach(record => {
        const category = record.category;
        if (!categoryData[category]) {
            categoryData[category] = 0;
        }
        categoryData[category] += record.amount;
    });

    const categories = Object.keys(categoryData);
    const amounts = Object.values(categoryData);

    // Color palette
    const colors = [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(199, 199, 199, 0.8)'
    ];

    const canvasEl = document.getElementById('expenseChart');
    if (!canvasEl) return;

    // willReadFrequently: false 提示瀏覽器不需頻繁讀取像素，iOS GPU 可更好優化繪製
    const ctx = canvasEl.getContext('2d', { willReadFrequently: false });

    // Destroy existing chart if it exists
    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }

    // 清除「暫無支出數據」提示（如果有的話）
    const emptyMsg = canvasEl.parentElement.querySelector('.chart-empty-msg');
    if (emptyMsg) emptyMsg.remove();

    // Create new chart
    if (categories.length > 0) {
        canvasEl.style.display = '';
        // 檢測是否為手機版
        const isMobile = window.innerWidth <= 768;

        expenseChart = new Chart(canvasEl, {
            type: 'doughnut',
            data: {
                labels: categories,
                datasets: [{
                    label: '支出金額',
                    data: amounts,
                    backgroundColor: colors.slice(0, categories.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: isMobile ? 'bottom' : 'right',
                        labels: {
                            font: {
                                size: isMobile ? 11 : 14
                            },
                            padding: isMobile ? 8 : 15,
                            boxWidth: isMobile ? 12 : 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: $${value.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

        // 發送圖表渲染完成事件
        EventBus.emit(EVENTS.CHART_RENDERED, { type: 'expense' });
    } else {
        // Show empty state — 隱藏 canvas，插入提示文字
        canvasEl.style.display = 'none';
        const parent = canvasEl.parentElement;
        if (!parent.querySelector('.chart-empty-msg')) {
            const msg = document.createElement('p');
            msg.className = 'chart-empty-msg text-center text-gray-700 py-8';
            msg.textContent = '暫無支出數據';
            parent.insertBefore(msg, canvasEl);
        }
    }
}

/**
 * 更新收支趨勢折線圖
 */
export async function updateTrendsChart() {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/trends?months=6`);
        if (!response.ok) {
            console.error('獲取趨勢資料失敗');
            return;
        }

        const data = await response.json();
        const canvasEl = document.getElementById('trendsChart');
        if (!canvasEl) return;

        // 銷毀舊圖表
        if (trendsChart) {
            trendsChart.destroy();
            trendsChart = null;
        }

        // 建立新圖表
        const ctx = canvasEl.getContext('2d');
        trendsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.months,
                datasets: [
                    {
                        label: '收入',
                        data: data.income,
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: '支出',
                        data: data.expense,
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });

        // 發送圖表渲染完成事件
        EventBus.emit(EVENTS.CHART_RENDERED, { type: 'trends' });

    } catch (error) {
        console.error('更新趨勢圖表失敗:', error);
    }
}

/**
 * 清理圖表實例（用於頁面切換時）
 */
export function destroyCharts() {
    if (expenseChart) {
        expenseChart.destroy();
        expenseChart = null;
    }
    if (trendsChart) {
        trendsChart.destroy();
        trendsChart = null;
    }
}

/**
 * 初始化圖表模組
 */
export function initCharts() {
    // 監聽記錄載入完成事件 -> 更新支出圓餅圖
    EventBus.on(EVENTS.RECORDS_LOADED, (records) => {
        if (!records || records.length === 0) {
            // 沒有記錄，顯示空狀態
            updateExpenseChart([]);
            return;
        }

        // 篩選支出記錄
        const expenseRecords = records.filter(r => r.type === 'expense');
        updateExpenseChart(expenseRecords);
    });

    // 監聽統計更新完成事件 -> 更新趨勢圖
    EventBus.on(EVENTS.STATS_UPDATED, () => {
        // 如果趨勢圖表的 canvas 存在於 DOM 中，才更新
        const trendsCanvas = document.getElementById('trendsChart');
        if (trendsCanvas && trendsCanvas.offsetParent !== null) {
            updateTrendsChart();
        }
    });

    // 監聽頁面切換事件
    EventBus.on(EVENTS.PAGE_CHANGED, ({ page }) => {
        // 切換到首頁時更新圖表
        if (page === 'dashboard') {
            // 延遲更新，確保 DOM 已渲染
            setTimeout(() => {
                updateTrendsChart();
            }, 100);
        }
    });

    // 監聽頁面載入事件
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'dashboard') {
            updateTrendsChart();
        }
    });

    // 暴露到全局（供測試和調試使用）
    window.updateExpenseChart = updateExpenseChart;
    window.updateTrendsChart = updateTrendsChart;

    console.log('✅ [Charts] 圖表渲染模組已初始化');
}
