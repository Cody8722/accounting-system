/**
 * 定期收支模組 - 管理固定週期性收支
 *
 * 功能：
 * - 列出所有定期收支項目
 * - 新增／編輯／刪除定期收支
 * - 一鍵記帳（套用為實際記帳記錄）
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { categoryData } from './config.js';
import { escapeHtml, showToast, showConfirm } from './utils.js';

/**
 * 目前正在編輯的項目 ID（null 表示新增模式）
 */
let _editingId = null;

/**
 * 依類型更新分類下拉選單
 * @param {string} type - 'expense' | 'income'
 */
export function updateRcCategories(type = 'expense') {
    const select = document.getElementById('rc-category');
    if (!select) return;
    select.innerHTML = '';
    const cats = categoryData[type] || {};
    Object.entries(cats).forEach(([group, items]) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
    });
}

/**
 * 顯示新增表單
 */
export function showRecurringForm() {
    document.getElementById('recurring-form')?.classList.remove('hidden');
    updateRcCategories(document.getElementById('rc-type')?.value || 'expense');
    document.getElementById('rc-name')?.focus();
}

/**
 * 隱藏並重置新增/編輯表單
 */
export function hideRecurringForm() {
    document.getElementById('recurring-form')?.classList.add('hidden');
    ['rc-name', 'rc-amount', 'rc-day', 'rc-description'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const typeEl = document.getElementById('rc-type');
    if (typeEl) typeEl.value = 'expense';
    const errEl = document.getElementById('rc-error');
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }

    // 清除編輯狀態，恢復新增模式
    _editingId = null;
    const titleEl = document.getElementById('rc-form-title');
    if (titleEl) titleEl.textContent = '新增定期收支';
    const submitBtn = document.getElementById('rc-submit-btn');
    if (submitBtn) submitBtn.textContent = '新增';
}

/**
 * 載入並渲染定期收支列表
 */
export async function loadRecurring() {
    const container = document.getElementById('recurring-list');
    if (!container) return;
    try {
        const response = await apiCall(`${backendUrl}/admin/api/recurring`);
        const items = await response.json();
        if (!response.ok) throw new Error(items.error || '載入失敗');
        renderRecurringList(items);
    } catch (e) {
        if (container) container.innerHTML = '<div class="text-center text-red-400 py-4 text-sm">載入失敗</div>';
        console.error('載入定期收支失敗:', e);
    }
}

/**
 * 渲染定期收支列表
 * @param {Array} items - 定期收支項目列表
 */
function renderRecurringList(items) {
    const container = document.getElementById('recurring-list');
    if (!container) return;

    if (!items.length) {
        container.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">尚無定期收支，點「新增」開始設定</div>';
        return;
    }

    const now = new Date();
    const today = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    container.innerHTML = items.map(item => {
        const effectiveDay = Math.min(item.day_of_month, daysInMonth);
        const isDue = effectiveDay <= today;
        const typeColor = item.type === 'expense' ? 'text-red-600' : 'text-green-600';
        const typeLabel = item.type === 'expense' ? '支出' : '收入';
        const dueBadge = isDue
            ? '<span class="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">本月到期</span>'
            : `<span class="text-xs text-gray-400">每月 ${item.day_of_month} 日</span>`;

        return `
            <div class="p-3 bg-gray-50 rounded-xl border border-gray-100 sm:flex sm:items-center sm:justify-between">
                <div class="min-w-0 mb-2 sm:mb-0 sm:flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold text-gray-800 text-sm">${escapeHtml(item.name)}</span>
                        <span class="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">${escapeHtml(item.category)}</span>
                        ${dueBadge}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                        <span class="${typeColor} font-bold text-sm">$${item.amount.toLocaleString()}</span>
                        <span class="text-xs text-gray-400">${typeLabel}</span>
                        ${item.description ? `<span class="text-xs text-gray-400 truncate">${escapeHtml(item.description)}</span>` : ''}
                    </div>
                </div>
                <div class="flex gap-1.5 sm:ml-2 sm:shrink-0">
                    <button onclick="applyRecurring('${item._id}', '${escapeHtml(item.name)}')"
                        class="flex-1 sm:flex-none px-2.5 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 transition font-medium">
                        一鍵記帳
                    </button>
                    <button onclick="editRecurring('${item._id}')"
                        class="flex-1 sm:flex-none px-2.5 py-1.5 bg-blue-100 text-blue-600 text-xs rounded-lg hover:bg-blue-200 transition font-medium">
                        編輯
                    </button>
                    <button onclick="deleteRecurring('${item._id}', '${escapeHtml(item.name)}')"
                        class="flex-1 sm:flex-none px-2.5 py-1.5 bg-red-100 text-red-600 text-xs rounded-lg hover:bg-red-200 transition font-medium">
                        刪除
                    </button>
                </div>
            </div>`;
    }).join('');
}

/**
 * 提交新增或編輯定期收支
 */
export async function submitRecurring() {
    const errEl = document.getElementById('rc-error');
    if (errEl) errEl.classList.add('hidden');

    const name = document.getElementById('rc-name')?.value.trim();
    const amount = parseFloat(document.getElementById('rc-amount')?.value);
    const type = document.getElementById('rc-type')?.value || 'expense';
    const category = document.getElementById('rc-category')?.value.trim() || '其他';
    const day = parseInt(document.getElementById('rc-day')?.value) || 1;
    const description = document.getElementById('rc-description')?.value.trim();

    const showError = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    };

    if (!name) return showError('請輸入名稱');
    if (!amount || amount <= 0) return showError('請輸入有效金額');
    if (day < 1 || day > 31) return showError('日期須介於 1-31');

    try {
        const url = _editingId
            ? `${backendUrl}/admin/api/recurring/${_editingId}`
            : `${backendUrl}/admin/api/recurring`;
        const method = _editingId ? 'PUT' : 'POST';

        const response = await apiCall(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, amount, type, category, day_of_month: day, description })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || (_editingId ? '更新失敗' : '新增失敗'));
        const wasEditing = !!_editingId;
        hideRecurringForm();
        showToast(wasEditing ? '定期收支已更新' : '定期收支已新增', 'success');
        loadRecurring();
    } catch (e) {
        showError(e.message);
    }
}

/**
 * 載入項目資料並切換表單為編輯模式
 * @param {string} id - 項目 ID
 */
export async function editRecurring(id) {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/recurring`);
        const items = await response.json();
        if (!response.ok) throw new Error(items.error || '載入失敗');
        const item = items.find(i => i._id === id);
        if (!item) return;

        _editingId = id;

        // 先更新分類選單，再設定值
        const typeEl = document.getElementById('rc-type');
        if (typeEl) typeEl.value = item.type;
        updateRcCategories(item.type);

        document.getElementById('rc-name').value = item.name;
        document.getElementById('rc-amount').value = item.amount;
        document.getElementById('rc-day').value = item.day_of_month;
        document.getElementById('rc-description').value = item.description || '';
        document.getElementById('rc-category').value = item.category;

        // 切換表單標題/按鈕為編輯模式
        const titleEl = document.getElementById('rc-form-title');
        if (titleEl) titleEl.textContent = '編輯定期收支';
        const submitBtn = document.getElementById('rc-submit-btn');
        if (submitBtn) submitBtn.textContent = '儲存';

        document.getElementById('recurring-form')?.classList.remove('hidden');
        document.getElementById('rc-name')?.focus();
    } catch (e) {
        console.error('載入編輯資料失敗:', e);
        showToast('無法載入項目資料', 'error');
    }
}

/**
 * 刪除定期收支項目
 * @param {string} id - 項目 ID
 * @param {string} name - 項目名稱（顯示用）
 */
export async function deleteRecurring(id, name) {
    if (!await showConfirm(`確定要刪除「${name}」？`, '刪除', '取消')) return;
    try {
        const response = await apiCall(`${backendUrl}/admin/api/recurring/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || '刪除失敗', 'error');
            return;
        }
        showToast('已刪除定期收支', 'success');
        loadRecurring();
    } catch (e) {
        console.error('刪除定期收支失敗:', e);
    }
}

/**
 * 套用定期收支為實際記帳記錄（一鍵記帳）
 * @param {string} id - 項目 ID
 * @param {string} name - 項目名稱（顯示用）
 */
export async function applyRecurring(id, name) {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/recurring/${id}/apply`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '記帳失敗');

        EventBus.emit(EVENTS.RECORD_ADDED, { source: 'recurring', name });
        EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);
        showToast('已套用定期收支', 'success');

        // 按鈕回饋
        const btn = document.activeElement;
        if (btn && btn.tagName === 'BUTTON') {
            const orig = btn.textContent;
            btn.textContent = '✓ 已記帳';
            btn.disabled = true;
            setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

/**
 * 初始化定期收支模組
 */
export function initRecurring() {
    // 暴露到 window 供 HTML onclick 使用
    window.showRecurringForm = showRecurringForm;
    window.hideRecurringForm = hideRecurringForm;
    window.submitRecurring = submitRecurring;
    window.editRecurring = editRecurring;
    window.deleteRecurring = deleteRecurring;
    window.applyRecurring = applyRecurring;
    window.loadRecurring = loadRecurring;
    window.updateRcCategories = updateRcCategories;

    // 登入成功後自動載入
    EventBus.on(EVENTS.AUTH_LOGIN_SUCCESS, loadRecurring);

    // 切換到新增記帳頁時重新載入
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'add') {
            loadRecurring();
        }
    });

    console.log('✅ [Recurring] 定期收支模組已初始化');
}
