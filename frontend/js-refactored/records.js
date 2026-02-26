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
 */
export async function loadRecords(showLoading = true) {
    const startDate = document.getElementById('filter-start-date')?.value;
    const endDate = document.getElementById('filter-end-date')?.value;
    const filterType = document.getElementById('filter-type')?.value;
    const filterCategory = document.getElementById('filter-category')?.value;
    const recordsList = document.getElementById('records-list');

    if (!recordsList) return;

    let url = `${backendUrl}/admin/api/accounting/records?`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (filterType) url += `type=${filterType}&`;
    if (filterCategory) url += `category=${filterCategory}&`;

    if (showLoading) {
        recordsList.innerHTML = '<p class="text-center text-gray-700 py-8"><span class="spinner"></span>載入中...</p>';
    }

    try {
        const response = await apiCall(url, { cache: 'no-store' });
        const records = await response.json();

        if (!response.ok) throw new Error(records.error || '載入失敗');

        if (records.length === 0) {
            recordsList.innerHTML = '<p class="text-center text-gray-700 py-8">目前沒有記錄</p>';
            // 發送空記錄事件
            EventBus.emit(EVENTS.RECORDS_LOADED, []);
            return;
        }

        // 渲染記錄列表
        renderRecords(records);

        // 發送記錄載入完成事件（這裡是關鍵：解耦！）
        EventBus.emit(EVENTS.RECORDS_LOADED, records);

    } catch (error) {
        if (recordsList) {
            recordsList.innerHTML = `<p class="text-center text-red-500 py-8">❌ ${error.message}</p>`;
        }
    }
}

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
                <div class="record-card flex items-center justify-between p-4 bg-gray-50 rounded-lg transition" data-record-id="${record._id.$oid}" data-type="${record.type}" data-amount="${record.amount}">
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="text-2xl ${typeClass}">${typeIcon}</span>
                            <div>
                                <p class="font-medium ${typeClass}">$${record.amount.toFixed(2)}</p>
                                <p class="text-sm text-gray-800 font-medium">${escapedCategory}${escapedDescription ? '<span class="text-gray-700 font-normal"> - ' + escapedDescription + '</span>' : ''}</p>
                                <p class="text-xs text-gray-700"><i class="fas fa-calendar mr-1"></i>${record.date}${expenseTypeBadge}</p>
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

    // 暴露到全局（供 HTML onclick 使用）
    window.deleteAccountingRecord = deleteRecord;
    window.loadAccountingRecords = loadRecords;
    window.addAccountingRecord = addRecord;
    window.updateAccountingRecord = updateRecord;

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
