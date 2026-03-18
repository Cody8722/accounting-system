/**
 * 記錄管理模組 - 處理記帳記錄的 CRUD 操作
 *
 * 功能：
 * - 新增/編輯/刪除記錄
 * - 載入記錄列表
 * - 篩選和排序
 * - 樂觀更新
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall, api } from './api.js';
import { backendUrl } from './config.js';
import { showToast, showConfirm, escapeHtml } from './utils.js';

/**
 * 正在刪除的記錄 ID 集合（防止重複刪除）
 */
const deletingRecordIds = new Set();

/**
 * 分頁狀態
 */
let currentPage = 1;
let totalPages = 1;

/**
 * 設定今天的日期為預設值
 */
export function setTodayAsDefault() {
    const today = new Date().toISOString().split('T')[0];
    const recordDate = document.getElementById('record-date');
    const filterStartDate = document.getElementById('filter-start-date');
    const filterEndDate = document.getElementById('filter-end-date');

    if (recordDate) recordDate.value = today;

    if (filterStartDate) {
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split('T')[0];
        filterStartDate.value = firstDayOfMonth;
    }

    if (filterEndDate) filterEndDate.value = today;
}

/**
 * 驗證金額輸入
 */
export function validateAmount(amount) {
    // 檢查是否為 NaN
    if (isNaN(amount) || amount === null || amount === undefined) {
        return { valid: false, message: '金額格式無效' };
    }
    // 檢查是否小於等於 0
    if (amount <= 0) {
        return { valid: false, message: '金額必須大於 0' };
    }
    return { valid: true };
}

/**
 * 樂觀更新統計數據
 */
export function applyOptimisticStats(type, amount, isAdd) {
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');
    const balanceEl = document.getElementById('balance');

    if (!totalIncomeEl || !totalExpenseEl || !balanceEl) return;

    const currentIncome = parseFloat(totalIncomeEl.textContent.replace(/[^0-9.-]+/g, '')) || 0;
    const currentExpense = parseFloat(totalExpenseEl.textContent.replace(/[^0-9.-]+/g, '')) || 0;

    let newIncome = currentIncome;
    let newExpense = currentExpense;

    if (type === 'income') {
        newIncome = isAdd ? currentIncome + amount : currentIncome - amount;
    } else {
        newExpense = isAdd ? currentExpense + amount : currentExpense - amount;
    }

    const newBalance = newIncome - newExpense;

    totalIncomeEl.textContent = `$${newIncome.toFixed(2)}`;
    totalExpenseEl.textContent = `$${newExpense.toFixed(2)}`;
    balanceEl.textContent = `$${newBalance.toFixed(2)}`;
    balanceEl.className = newBalance >= 0 ? 'text-2xl font-bold text-green-600' : 'text-2xl font-bold text-red-600';

    // 發送事件通知統計已更新
    EventBus.emit(EVENTS.STATS_UPDATED, {
        income: newIncome,
        expense: newExpense,
        balance: newBalance
    });
}

/**
 * 新增記帳記錄
 */
export async function addRecord(recordData) {
    // 驗證金額
    const validation = validateAmount(recordData.amount);
    if (!validation.valid) {
        throw new Error(validation.message);
    }

    // 樂觀更新：API 送出前立即反映在統計數字上
    applyOptimisticStats(recordData.type, recordData.amount, true);

    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/records`, {
            method: 'POST',
            body: JSON.stringify(recordData)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '新增失敗');

        // 發送記錄新增事件
        EventBus.emit(EVENTS.RECORD_ADDED, result);

        return result;
    } catch (error) {
        // 新增失敗，發送事件請求刷新統計
        EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);
        throw error;
    }
}

/**
 * 編輯記帳記錄
 */
export async function updateRecord(recordId, recordData) {
    // 驗證金額
    const validation = validateAmount(recordData.amount);
    if (!validation.valid) {
        throw new Error(validation.message);
    }

    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/records/${recordId}`, {
            method: 'PUT',
            body: JSON.stringify(recordData)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '更新失敗');

        // 發送記錄更新事件
        EventBus.emit(EVENTS.RECORD_UPDATED, result);

        return result;
    } catch (error) {
        throw error;
    }
}

/**
 * 刪除記帳記錄
 */
export async function deleteRecord(recordId, recordType, recordAmount) {
    if (!recordId) return;

    // 防止重複點擊：若正在刪除中則跳過
    if (deletingRecordIds.has(recordId)) return;

    const confirmed = await showConfirm('確定要刪除這筆記錄嗎？', '刪除', '取消');
    if (!confirmed) return;

    // 樂觀更新：確認後立即反映在統計數字，不等 API 回應
    applyOptimisticStats(recordType, recordAmount, false);

    // 立即從 DOM 移除卡片（不等 API），讓刪除感覺即時
    const cardEl = document.querySelector(`[data-record-id="${recordId}"]`);
    const wrapperEl = cardEl ? cardEl.closest('.record-item-wrapper') : null;
    if (wrapperEl) wrapperEl.remove();

    deletingRecordIds.add(recordId);

    try {
        const response = await apiCall(`${backendUrl}/admin/api/accounting/records/${recordId}`, {
            method: 'DELETE',
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '刪除失敗');

        // 發送記錄刪除事件
        EventBus.emit(EVENTS.RECORD_DELETED, {
            id: recordId,
            type: recordType,
            amount: recordAmount
        });

    } catch (error) {
        // 刪除失敗，發送事件請求重新載入
        EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);
        EventBus.emit(EVENTS.RECORD_DELETE_REQUESTED, { id: recordId, reload: true });
        showToast(`刪除失敗: ${error.message}`, 'error');
    } finally {
        deletingRecordIds.delete(recordId);
    }
}

/**
 * 載入記帳記錄
 * @param {boolean} showLoading - 是否顯示載入畫面
 * @param {number} page - 頁碼（預設維持 currentPage）
 */
export async function loadRecords(showLoading = true, page = null) {
    if (page !== null) currentPage = page;

    const startDate = document.getElementById('filter-start-date')?.value;
    const endDate = document.getElementById('filter-end-date')?.value;
    const incomeChecked = document.getElementById('filter-type-income')?.checked ?? true;
    const expenseChecked = document.getElementById('filter-type-expense')?.checked ?? true;
    const filterCategory = document.getElementById('filter-category')?.value;
    const filterKeyword = document.getElementById('filter-keyword')?.value?.trim();
    const sortVal = document.getElementById('filter-sort')?.value || 'date-desc';
    const [sortBy, sortOrder] = sortVal.split('-');
    const recordsList = document.getElementById('records-list');

    if (!recordsList) return;

    let url = `${backendUrl}/admin/api/accounting/records?page=${currentPage}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (incomeChecked && !expenseChecked) url += 'type=income&';
    else if (!incomeChecked && expenseChecked) url += 'type=expense&';
    if (filterCategory) url += `category=${filterCategory}&`;
    if (filterKeyword) url += `search=${encodeURIComponent(filterKeyword)}&`;
    url += `sort_by=${sortBy}&sort_order=${sortOrder}&`;

    if (showLoading) {
        recordsList.innerHTML = '<p class="text-center text-gray-700 py-8"><span class="spinner"></span>載入中...</p>';
    }

    try {
        const response = await apiCall(url, { cache: 'no-store' });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || '載入失敗');

        const records = Array.isArray(data) ? data
            : Array.isArray(data.records) ? data.records
            : [];
        totalPages = data.total_pages ?? 1;
        currentPage = data.page ?? currentPage;

        // 更新總筆數顯示
        const totalCountEl = document.getElementById('records-total-count');
        if (totalCountEl && data.total !== undefined) {
            totalCountEl.textContent = `共 ${data.total} 筆`;
        }

        if (records.length === 0 && currentPage === 1) {
            recordsList.innerHTML = '<p class="text-center text-gray-700 py-8">目前沒有記錄</p>';
            renderPagination();
            EventBus.emit(EVENTS.RECORDS_LOADED, []);
            return;
        }

        // 渲染記錄列表
        renderRecords(records);
        renderPagination();

        // 發送記錄載入完成事件（解耦）
        EventBus.emit(EVENTS.RECORDS_LOADED, records);

    } catch (error) {
        if (recordsList) {
            recordsList.innerHTML = `<p class="text-center text-red-500 py-8">❌ ${escapeHtml(error.message)}</p>`;
        }
    }
}

/**
 * 渲染分頁列
 */
function renderPagination() {
    const container = document.getElementById('records-pagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="flex items-center justify-center gap-3 py-3">
            <button
                onclick="window._recordsGoPage(${currentPage - 1})"
                ${currentPage <= 1 ? 'disabled' : ''}
                class="px-4 py-2 min-w-[88px] rounded-lg border text-sm font-medium ${currentPage <= 1 ? 'text-gray-400 border-gray-200 cursor-not-allowed bg-gray-50' : 'text-purple-600 border-purple-400 hover:bg-purple-50 active:bg-purple-100'}">
                ← 上一頁
            </button>
            <span class="text-sm text-gray-500">第 ${currentPage} / ${totalPages} 頁</span>
            <button
                onclick="window._recordsGoPage(${currentPage + 1})"
                ${currentPage >= totalPages ? 'disabled' : ''}
                class="px-4 py-2 min-w-[88px] rounded-lg border text-sm font-medium ${currentPage >= totalPages ? 'text-gray-400 border-gray-200 cursor-not-allowed bg-gray-50' : 'text-purple-600 border-purple-400 hover:bg-purple-50 active:bg-purple-100'}">
                下一頁 →
            </button>
        </div>
    `;
}

/**
 * 清除所有篩選條件並重新載入
 */
export function clearFilters() {
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const startEl = document.getElementById('filter-start-date');
    const endEl = document.getElementById('filter-end-date');
    const incomeEl = document.getElementById('filter-type-income');
    const expenseEl = document.getElementById('filter-type-expense');
    const keywordEl = document.getElementById('filter-keyword');
    const sortEl = document.getElementById('filter-sort');
    const hiddenCatEl = document.getElementById('filter-category');
    const displayCatEl = document.getElementById('filter-category-display');

    if (startEl) startEl.value = firstDay;
    if (endEl) endEl.value = today;
    if (incomeEl) incomeEl.checked = true;
    if (expenseEl) expenseEl.checked = true;
    if (keywordEl) keywordEl.value = '';
    if (sortEl) sortEl.value = 'date-desc';
    if (hiddenCatEl) hiddenCatEl.value = '';
    if (displayCatEl) displayCatEl.textContent = '全部分類';

    loadRecords(true, 1);
}

/**
 * 切換進階搜尋面板展開/收合
 */
export function toggleAdvancedFilter() {
    const panel = document.getElementById('advanced-filter-panel');
    const chevron = document.getElementById('advanced-filter-chevron');
    if (!panel) return;
    const isHidden = panel.classList.toggle('hidden');
    if (chevron) chevron.style.transform = isHidden ? '' : 'rotate(180deg)';
}

// 讓 HTML inline onclick 能呼叫
window._recordsGoPage = (page) => {
    if (page < 1 || page > totalPages) return;
    loadRecords(true, page);
    document.getElementById('records-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/**
 * 渲染記錄列表
 */
function renderRecords(records) {
    const recordsList = document.getElementById('records-list');
    if (!recordsList) return;

    recordsList.innerHTML = records.map(record => {
        const typeClass = record.type === 'income' ? 'text-green-600' : 'text-red-600';
        const typeIcon = record.type === 'income' ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
        const expenseTypeBadge = record.expense_type ?
            `<span class="text-xs bg-blue-600 text-white px-2 py-0.5 rounded ml-2">
                <i class="fas fa-tag mr-1"></i>${
                    record.expense_type === 'fixed' ? '固定支出' :
                    record.expense_type === 'variable' ? '變動支出' :
                    '一次性支出'
                }</span>` : '';

        // Apply XSS protection to user input
        const escapedCategory = escapeHtml(record.category);
        const escapedDescription = escapeHtml(record.description);

        return `
            <div class="record-item-wrapper">
                <div class="delete-actions">
                    <button class="delete-btn" onclick="deleteAccountingRecord('${record._id.$oid}','${record.type}',${record.amount})">
                        <i class="fas fa-trash"></i>刪除
                    </button>
                </div>
                <div class="record-card flex items-center justify-between p-4 bg-white border border-gray-100 shadow-sm rounded-xl transition border-l-4 ${record.type === 'income' ? 'border-l-green-500' : 'border-l-red-400'}" data-record-id="${record._id.$oid}" data-type="${record.type}" data-amount="${record.amount}">
                    <div class="flex-1">
                        <div class="flex items-center gap-3">
                            <span class="text-xl ${typeClass}">${typeIcon}</span>
                            <div class="min-w-0">
                                <p class="font-semibold text-base ${typeClass}">$${record.amount.toFixed(2)}</p>
                                <p class="text-sm text-gray-800 font-medium truncate">${escapedCategory}${escapedDescription ? '<span class="text-gray-500 font-normal"> · ' + escapedDescription + '</span>' : ''}</p>
                                <p class="text-xs text-gray-400 mt-0.5"><i class="fas fa-calendar-alt mr-1"></i>${record.date}${expenseTypeBadge}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <button class="record-card-delete-btn" onclick="deleteAccountingRecord('${record._id.$oid}','${record.type}',${record.amount})">
                    <i class="fas fa-trash"></i>刪除
                </button>
            </div>
        `;
    }).join('');

    // 初始化滑動刪除功能 + 長按選單功能
    if (window.SwipeToDelete || window.longPressMenu) {
        const recordCards = document.querySelectorAll('.record-card');
        recordCards.forEach(card => {
            const recordId = card.dataset.recordId;

            // 滑動刪除
            if (window.SwipeToDelete) {
                new window.SwipeToDelete(card);
            }

            // 長按選單
            if (window.longPressMenu && recordId) {
                window.longPressMenu.bindToElement(card, recordId);
            }
        });
    }
}

/**
 * 開啟編輯記錄模態窗
 */
export async function openEditRecordModal(recordId) {
    try {
        // 直接用單筆 API 取得記錄
        const response = await apiCall(`${backendUrl}/admin/api/accounting/records/${recordId}`, {});
        const record = await response.json();

        if (!response.ok) throw new Error(record.error || '載入記錄失敗');

        if (!record || !record._id) {
            showToast('找不到該記錄', 'error');
            return;
        }

        // 填充表單
        document.getElementById('edit-record-id').value = recordId;
        document.getElementById('edit-record-type').value = record.type;
        document.getElementById('edit-record-amount').value = record.amount;
        document.getElementById('edit-record-category').value = record.category;
        document.getElementById('edit-record-date').value = record.date;
        document.getElementById('edit-record-description').value = record.description || '';
        document.getElementById('edit-expense-type').value = record.expense_type || '';

        // 顯示 Modal
        document.getElementById('edit-record-modal').classList.remove('hidden');
    } catch (error) {
        showToast(`載入記錄失敗: ${error.message}`, 'error');
    }
}

/**
 * 關閉編輯記錄模態窗
 */
export function closeEditRecordModal() {
    const modal = document.getElementById('edit-record-modal');
    if (modal) modal.classList.add('hidden');

    // 清空表單
    const form = document.getElementById('edit-record-form');
    if (form) form.reset();

    const message = document.getElementById('edit-record-message');
    if (message) message.classList.add('hidden');

    const amountError = document.getElementById('edit-amount-error');
    if (amountError) amountError.classList.add('hidden');
}

/**
 * 初始化記錄管理模組
 */
export function initRecords() {
    // 監聽記錄刪除請求（從長按選單觸發）
    EventBus.on(EVENTS.RECORD_DELETE_REQUESTED, ({ id, type, amount }) => {
        deleteRecord(id, type, amount);
    });

    // 監聽記錄編輯請求（從長按選單觸發）
    EventBus.on(EVENTS.RECORD_EDIT_REQUESTED, ({ id }) => {
        if (window.openEditRecordModal) {
            window.openEditRecordModal(id);
        }
    });

    // 監聽統計更新請求
    EventBus.on(EVENTS.STATS_REQUEST_UPDATE, () => {
        // 請求更新統計（由 stats 模組處理）
        loadRecords(false);
    });

    // 監聽記錄新增/刪除後的自動刷新
    EventBus.on(EVENTS.RECORD_ADDED, () => {
        loadRecords(false);
    });

    EventBus.on(EVENTS.RECORD_UPDATED, () => {
        loadRecords(false);
    });

    // 監聽頁面載入事件
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'records') {
            loadRecords();
        } else if (page === 'add') {
            // 記帳頁載入時設置今天日期
            setTodayAsDefault();
        }
    });

    // ===== 設置表單事件監聽器 =====
    setupFormEventListeners();

    // 排序 select / checkbox 改動後立即觸發查詢
    ['filter-sort'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadRecords(true, 1));
    });
    ['filter-type-income', 'filter-type-expense'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadRecords(true, 1));
    });

    // 排序 select / checkbox 改動後立即觸發查詢
    ['filter-sort'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadRecords(true, 1));
    });
    ['filter-type-income', 'filter-type-expense'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => loadRecords(true, 1));
    });

    // 暴露到全局（供 HTML onclick 使用）
    window.deleteAccountingRecord = deleteRecord;
    window.loadAccountingRecords = loadRecords;
    window.addAccountingRecord = addRecord;
    window.updateAccountingRecord = updateRecord;
    window.openEditRecordModal = openEditRecordModal;
    window.closeEditRecordModal = closeEditRecordModal;
    window.clearFilters = clearFilters;
    window.toggleAdvancedFilter = toggleAdvancedFilter;

    console.log('✅ [Records] 記錄管理模組已初始化');
}

/**
 * 設置表單事件監聽器
 */
function setupFormEventListeners() {
    // 獲取表單元素
    const accountingForm = document.getElementById('accounting-form');
    const recordType = document.getElementById('record-type');
    const recordAmount = document.getElementById('record-amount');
    const recordCategory = document.getElementById('record-category');
    const recordDate = document.getElementById('record-date');
    const recordDescription = document.getElementById('record-description');
    const expenseType = document.getElementById('expense-type');
    const accountingMessage = document.getElementById('accounting-message');
    const amountError = document.getElementById('amount-error');
    const loadRecordsBtn = document.getElementById('load-records-btn');

    // 根據類型更新分類選項（清空分類輸入框）
    if (recordType) {
        recordType.addEventListener('change', () => {
            if (recordCategory) {
                recordCategory.value = '';
            }
        });
    }

    // 金額輸入時即時驗證
    if (recordAmount && amountError) {
        recordAmount.addEventListener('input', () => {
            const amount = parseFloat(recordAmount.value);
            const validation = validateAmount(amount);

            if (!validation.valid && recordAmount.value !== '') {
                recordAmount.classList.add('input-error');
                amountError.textContent = validation.message;
                amountError.classList.remove('hidden');
            } else {
                recordAmount.classList.remove('input-error');
                amountError.classList.add('hidden');
            }
        });
    }

    // 表單提交處理
    if (accountingForm) {
        accountingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const amount = parseFloat(recordAmount.value);
            const validation = validateAmount(amount);

            // 前端驗證金額
            if (!validation.valid) {
                recordAmount.classList.add('input-error');
                if (amountError) {
                    amountError.textContent = validation.message;
                    amountError.classList.remove('hidden');
                }
                if (accountingMessage) {
                    accountingMessage.textContent = `❌ ${validation.message}`;
                    accountingMessage.className = 'text-center text-sm font-medium text-red-600 error-message';
                    accountingMessage.classList.remove('hidden');
                    setTimeout(() => {
                        accountingMessage.classList.add('hidden');
                    }, 3000);
                }
                return;
            }

            const recordData = {
                type: recordType.value,
                amount: amount,
                category: recordCategory.value,
                date: recordDate.value,
                description: recordDescription.value,
                expense_type: expenseType?.value || null
            };

            try {
                await addRecord(recordData);

                if (accountingMessage) {
                    accountingMessage.textContent = '✅ 記帳記錄已新增';
                    accountingMessage.className = 'text-center text-sm font-medium text-green-600';
                    accountingMessage.classList.remove('hidden');
                }

                // 清空表單
                if (recordAmount) recordAmount.value = '';
                if (recordDescription) recordDescription.value = '';
                if (expenseType) expenseType.value = '';
                if (recordAmount) recordAmount.classList.remove('input-error');
                if (amountError) amountError.classList.add('hidden');
                setTodayAsDefault();

                // 靜默刷新記錄和統計
                await loadRecords(false);
                EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);

                if (accountingMessage) {
                    setTimeout(() => {
                        accountingMessage.classList.add('hidden');
                    }, 3000);
                }
            } catch (error) {
                if (accountingMessage) {
                    accountingMessage.textContent = `❌ ${error.message}`;
                    accountingMessage.className = 'text-center text-sm font-medium text-red-600 error-message';
                    accountingMessage.classList.remove('hidden');
                }
            }
        });
    }

    // ===== 編輯記帳表單提交處理 =====
    const editRecordForm = document.getElementById('edit-record-form');
    const editRecordAmount = document.getElementById('edit-record-amount');
    const editAmountError = document.getElementById('edit-amount-error');
    const editRecordMessage = document.getElementById('edit-record-message');

    if (editRecordAmount && editAmountError) {
        editRecordAmount.addEventListener('input', () => {
            const amount = parseFloat(editRecordAmount.value);
            const validation = validateAmount(amount);
            if (!validation.valid && editRecordAmount.value !== '') {
                editRecordAmount.classList.add('input-error');
                editAmountError.textContent = validation.message;
                editAmountError.classList.remove('hidden');
            } else {
                editRecordAmount.classList.remove('input-error');
                editAmountError.classList.add('hidden');
            }
        });
    }

    if (editRecordForm) {
        editRecordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const amount = parseFloat(editRecordAmount.value);
            const validation = validateAmount(amount);

            // 前端驗證金額
            if (!validation.valid) {
                if (editRecordAmount) editRecordAmount.classList.add('input-error');
                if (editAmountError) {
                    editAmountError.textContent = validation.message;
                    editAmountError.classList.remove('hidden');
                }
                if (editRecordMessage) {
                    editRecordMessage.textContent = `❌ ${validation.message}`;
                    editRecordMessage.className = 'text-center text-sm font-medium text-red-600 error-message';
                    editRecordMessage.classList.remove('hidden');
                    setTimeout(() => {
                        editRecordMessage.classList.add('hidden');
                    }, 3000);
                }
                return;
            }

            const recordId = document.getElementById('edit-record-id')?.value;
            const recordData = {
                type: document.getElementById('edit-record-type')?.value,
                amount: amount,
                category: document.getElementById('edit-record-category')?.value,
                date: document.getElementById('edit-record-date')?.value,
                description: document.getElementById('edit-record-description')?.value,
                expense_type: document.getElementById('edit-expense-type')?.value || null
            };

            try {
                await updateRecord(recordId, recordData);

                if (editRecordMessage) {
                    editRecordMessage.textContent = '✅ 記帳記錄已更新';
                    editRecordMessage.className = 'text-center text-sm font-medium text-green-600';
                    editRecordMessage.classList.remove('hidden');
                }

                // 靜默刷新記錄和統計
                await loadRecords(false);
                EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);

                setTimeout(() => {
                    if (window.closeEditRecordModal) {
                        window.closeEditRecordModal();
                    }
                }, 1500);
            } catch (error) {
                if (editRecordMessage) {
                    editRecordMessage.textContent = `❌ ${error.message}`;
                    editRecordMessage.className = 'text-center text-sm font-medium text-red-600 error-message';
                    editRecordMessage.classList.remove('hidden');
                }
            }
        });
    }

    // ===== 載入記錄按鈕事件處理 =====
    if (loadRecordsBtn) {
        loadRecordsBtn.addEventListener('click', () => {
            loadRecords(true);
        });
    }
}
