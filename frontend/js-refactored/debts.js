/**
 * 欠款追蹤模組 - 管理個人借貸與群組分帳
 *
 * 功能：
 * - 別人欠我（lent）/ 我欠別人（borrowed）— 雙向追蹤
 * - 群組分帳（group）— 一筆費用多人分攤
 * - 部分還款紀錄、結清狀態切換
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { escapeHtml } from './utils.js';

/**
 * 目前顯示的分頁（'lent' | 'borrowed' | 'group'）
 */
let _currentTab = 'lent';

/**
 * 目前正在編輯的欠款 ID（null = 新增模式）
 */
let _editingId = null;

/**
 * 目前正在還款的欠款 ID
 */
let _repayingId = null;

/**
 * 全部欠款資料（快取，避免重複請求）
 */
let _debtsCache = [];

// ==================== 分頁切換 ====================

/**
 * 切換欠款分頁
 * @param {string} tab - 'lent' | 'borrowed' | 'group'
 */
export function switchDebtTab(tab) {
    _currentTab = tab;
    document.querySelectorAll('.debt-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    renderDebtsForCurrentTab();
}

// ==================== 載入與渲染 ====================

/**
 * 載入並渲染欠款列表
 */
export async function loadDebts() {
    const container = document.getElementById('debts-list');
    if (!container) return;
    container.innerHTML = '<div class="text-center text-gray-400 py-6 text-sm">載入中...</div>';
    try {
        const response = await apiCall(`${backendUrl}/admin/api/debts`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '載入失敗');
        _debtsCache = data;
        renderSummary(data);
        renderDebtsForCurrentTab();
    } catch (e) {
        if (container) container.innerHTML = '<div class="text-center text-red-400 py-4 text-sm">載入失敗</div>';
        console.error('載入欠款失敗:', e);
    }
}

/**
 * 依目前分頁渲染列表
 */
function renderDebtsForCurrentTab() {
    const items = _debtsCache.filter(d => d.debt_type === _currentTab);
    renderDebtsList(items);
}

/**
 * 渲染摘要卡片（別人欠我總額 / 我欠別人總額）
 * @param {Array} items
 */
function renderSummary(items) {
    const lentTotal = items
        .filter(d => d.debt_type === 'lent' && !d.is_settled)
        .reduce((s, d) => s + (d.amount - (d.paid_amount || 0)), 0);
    const borrowedTotal = items
        .filter(d => d.debt_type === 'borrowed' && !d.is_settled)
        .reduce((s, d) => s + (d.amount - (d.paid_amount || 0)), 0);

    const summaryEl = document.getElementById('debts-summary');
    if (!summaryEl) return;
    summaryEl.innerHTML = `
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-green-50 rounded-xl p-3 border border-green-100">
                <div class="text-xs text-green-600 font-medium mb-1">別人欠我</div>
                <div class="text-lg font-bold text-green-700">$${lentTotal.toLocaleString()}</div>
            </div>
            <div class="bg-red-50 rounded-xl p-3 border border-red-100">
                <div class="text-xs text-red-600 font-medium mb-1">我欠別人</div>
                <div class="text-lg font-bold text-red-700">$${borrowedTotal.toLocaleString()}</div>
            </div>
        </div>`;
}

/**
 * 渲染欠款列表
 * @param {Array} items
 */
function renderDebtsList(items) {
    const container = document.getElementById('debts-list');
    if (!container) return;

    if (!items.length) {
        container.innerHTML = '<div class="text-center text-gray-400 py-6 text-sm">尚無記錄，點「＋ 新增」開始追蹤</div>';
        return;
    }

    container.innerHTML = items.map(item => {
        if (item.debt_type === 'group') return renderGroupCard(item);
        return renderDebtCard(item);
    }).join('');
}

/**
 * 渲染個人欠款卡片（lent / borrowed）
 * @param {object} item
 */
function renderDebtCard(item) {
    const isLent = item.debt_type === 'lent';
    const remaining = item.amount - (item.paid_amount || 0);
    const pct = item.amount > 0 ? Math.round((item.paid_amount || 0) / item.amount * 100) : 0;
    const settledClass = item.is_settled ? 'opacity-50' : '';
    const settledBadge = item.is_settled
        ? '<span class="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">已結清</span>'
        : (remaining < item.amount && remaining > 0
            ? `<span class="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">部分還款</span>`
            : '');
    const directionColor = isLent ? 'text-green-600' : 'text-red-600';

    return `
        <div class="debt-card p-3 bg-gray-50 rounded-xl border border-gray-100 mb-2 ${settledClass}">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap mb-0.5">
                        <span class="font-semibold text-gray-800 text-sm">${escapeHtml(item.person)}</span>
                        ${settledBadge}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="${directionColor} font-bold text-sm">$${item.amount.toLocaleString()}</span>
                        ${item.paid_amount > 0 ? `<span class="text-xs text-gray-400">已還 $${(item.paid_amount).toLocaleString()}</span>` : ''}
                    </div>
                    ${item.reason ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${escapeHtml(item.reason)}</div>` : ''}
                    <div class="text-xs text-gray-400">${item.date || ''}</div>
                    ${item.amount > 0 ? `
                    <div class="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full ${isLent ? 'bg-green-500' : 'bg-red-500'} rounded-full transition-all" style="width:${pct}%"></div>
                    </div>` : ''}
                </div>
                <div class="flex flex-col gap-1 shrink-0">
                    ${!item.is_settled ? `
                    <button onclick="showRepayModal('${item._id.$oid}')" class="px-2 py-1 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 transition font-medium">還款</button>
                    ` : ''}
                    <button onclick="settleDebt('${item._id.$oid}', ${item.is_settled})" class="px-2 py-1 ${item.is_settled ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-600'} text-xs rounded-lg hover:opacity-80 transition font-medium">${item.is_settled ? '取消結清' : '結清'}</button>
                    <button onclick="editDebt('${item._id.$oid}')" class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition">編輯</button>
                    <button onclick="deleteDebt('${item._id.$oid}', '${escapeHtml(item.person)}')" class="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-lg hover:bg-red-200 transition">刪除</button>
                </div>
            </div>
        </div>`;
}

/**
 * 渲染群組分帳卡片
 * @param {object} item
 */
function renderGroupCard(item) {
    const members = item.members || [];
    const paidCount = members.filter(m => m.paid).length;
    const totalShare = members.reduce((s, m) => s + (m.share || 0), 0);
    const paidShare = members.filter(m => m.paid).reduce((s, m) => s + (m.share || 0), 0);
    const settledClass = item.is_settled ? 'opacity-50' : '';
    const settledBadge = item.is_settled
        ? '<span class="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">已結清</span>'
        : (paidCount === members.length && members.length > 0
            ? '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">全數已付</span>'
            : `<span class="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">${paidCount}/${members.length} 已付</span>`);

    const memberRows = members.map((m, idx) => `
        <div class="flex items-center justify-between py-0.5">
            <span class="text-xs text-gray-600">${escapeHtml(m.name)}</span>
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">$${(m.share || 0).toLocaleString()}</span>
                <button onclick="toggleMemberPaid('${item._id.$oid}', ${idx}, ${m.paid})"
                    class="text-xs px-1.5 py-0.5 rounded ${m.paid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} hover:opacity-80 transition">
                    ${m.paid ? '✓ 已付' : '未付'}
                </button>
            </div>
        </div>`).join('');

    return `
        <div class="debt-card p-3 bg-gray-50 rounded-xl border border-gray-100 mb-2 ${settledClass}">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap mb-0.5">
                        <span class="font-semibold text-gray-800 text-sm">${escapeHtml(item.title)}</span>
                        ${settledBadge}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-blue-600 font-bold text-sm">$${(item.total_amount || 0).toLocaleString()}</span>
                        <span class="text-xs text-gray-400">已收 $${paidShare.toLocaleString()}</span>
                    </div>
                    ${item.reason ? `<div class="text-xs text-gray-400 truncate">${escapeHtml(item.reason)}</div>` : ''}
                    <div class="text-xs text-gray-400">${item.date || ''}</div>
                    <div class="mt-2 border-t border-gray-100 pt-2">${memberRows}</div>
                </div>
                <div class="flex flex-col gap-1 shrink-0">
                    <button onclick="settleDebt('${item._id.$oid}', ${item.is_settled})" class="px-2 py-1 ${item.is_settled ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-600'} text-xs rounded-lg hover:opacity-80 transition font-medium">${item.is_settled ? '取消結清' : '結清'}</button>
                    <button onclick="editDebt('${item._id.$oid}')" class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition">編輯</button>
                    <button onclick="deleteDebt('${item._id.$oid}', '${escapeHtml(item.title)}')" class="px-2 py-1 bg-red-100 text-red-600 text-xs rounded-lg hover:bg-red-200 transition">刪除</button>
                </div>
            </div>
        </div>`;
}

// ==================== 表單顯示 / 隱藏 ====================

/**
 * 顯示新增欠款表單（新增模式）
 */
export function showDebtForm() {
    _editingId = null;
    _groupMembers = [];
    resetDebtForm();
    const modal = document.getElementById('debt-form-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('debt-form-title').textContent = '新增欠款';
        document.getElementById('debt-submit-btn').textContent = '新增';
    }
    // 同步表單的 debt_type 預設為目前分頁
    const typeEl = document.getElementById('debt-type');
    if (typeEl) {
        typeEl.value = _currentTab === 'group' ? 'group' : _currentTab;
        onDebtTypeChange();
    }
}

/**
 * 隱藏新增/編輯表單
 */
export function hideDebtForm() {
    document.getElementById('debt-form-modal')?.classList.add('hidden');
    resetDebtForm();
    _editingId = null;
}

/**
 * 重置表單欄位
 */
function resetDebtForm() {
    ['debt-person', 'debt-title', 'debt-amount', 'debt-reason', 'debt-date', 'debt-members-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const errEl = document.getElementById('debt-error');
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
    renderMembersList([]);
}

/**
 * 依 debt_type 切換顯示個人欄位 vs 群組欄位
 */
export function onDebtTypeChange() {
    const type = document.getElementById('debt-type')?.value;
    const individualFields = document.getElementById('debt-individual-fields');
    const groupFields = document.getElementById('debt-group-fields');
    const groupMembersFields = document.getElementById('debt-group-fields-members');
    if (individualFields) individualFields.classList.toggle('hidden', type === 'group');
    if (groupFields) groupFields.classList.toggle('hidden', type !== 'group');
    if (groupMembersFields) groupMembersFields.classList.toggle('hidden', type !== 'group');
}

// ==================== 群組成員管理 ====================

/**
 * 暫存群組成員列表
 */
let _groupMembers = [];

/**
 * 新增成員（從輸入框）
 */
export function addGroupMember() {
    const input = document.getElementById('debt-members-input');
    const name = input?.value.trim();
    if (!name) return;
    _groupMembers.push({ name, share: 0, paid: false });
    input.value = '';
    recalcEqualShares();
    renderMembersList(_groupMembers);
}

/**
 * 移除成員
 * @param {number} idx
 */
export function removeGroupMember(idx) {
    _groupMembers.splice(idx, 1);
    recalcEqualShares();
    renderMembersList(_groupMembers);
}

/**
 * 平分金額給所有成員
 */
function recalcEqualShares() {
    const total = parseFloat(document.getElementById('debt-amount')?.value) || 0;
    if (_groupMembers.length === 0) return;
    const share = Math.round(total / _groupMembers.length * 100) / 100;
    _groupMembers.forEach(m => { m.share = share; });
}

/**
 * 重新計算分攤（金額改變時觸發）
 */
export function onDebtAmountChange() {
    if (document.getElementById('debt-type')?.value === 'group') {
        recalcEqualShares();
        renderMembersList(_groupMembers);
    }
}

/**
 * 渲染群組成員列表
 * @param {Array} members
 */
function renderMembersList(members) {
    const container = document.getElementById('debt-members-list');
    if (!container) return;
    if (!members.length) {
        container.innerHTML = '<div class="text-xs text-gray-400 py-1">尚未新增成員</div>';
        return;
    }
    container.innerHTML = members.map((m, idx) => `
        <div class="flex items-center gap-2 py-1">
            <span class="text-sm text-gray-700 flex-1">${escapeHtml(m.name)}</span>
            <input type="number" value="${m.share}" min="0" step="0.01"
                onchange="_groupMemberShareChange(${idx}, this.value)"
                class="w-20 text-sm border border-gray-200 rounded px-1.5 py-0.5 text-right">
            <button onclick="removeGroupMember(${idx})" class="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
        </div>`).join('');
}

/**
 * 修改成員分攤金額
 * @param {number} idx
 * @param {string} val
 */
window._groupMemberShareChange = function(idx, val) {
    if (_groupMembers[idx]) _groupMembers[idx].share = parseFloat(val) || 0;
};

// ==================== 提交 ====================

/**
 * 提交新增或編輯欠款
 */
export async function submitDebt() {
    const errEl = document.getElementById('debt-error');
    if (errEl) errEl.classList.add('hidden');

    const type = document.getElementById('debt-type')?.value;
    const amount = parseFloat(document.getElementById('debt-amount')?.value);
    const reason = document.getElementById('debt-reason')?.value.trim() || '';
    const date = document.getElementById('debt-date')?.value || '';

    const showError = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    };

    if (!amount || amount <= 0) return showError('請輸入有效金額');

    let payload;
    if (type === 'group') {
        const title = document.getElementById('debt-title')?.value.trim();
        if (!title) return showError('請輸入群組標題');
        if (_groupMembers.length === 0) return showError('請至少新增一位成員');
        payload = { debt_type: 'group', title, total_amount: amount, reason, date, members: _groupMembers };
    } else {
        const person = document.getElementById('debt-person')?.value.trim();
        if (!person) return showError('請輸入姓名');
        payload = { debt_type: type, person, amount, reason, date };
    }

    try {
        const url = _editingId
            ? `${backendUrl}/admin/api/debts/${_editingId}`
            : `${backendUrl}/admin/api/debts`;
        const method = _editingId ? 'PUT' : 'POST';
        const response = await apiCall(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || (_editingId ? '更新失敗' : '新增失敗'));

        hideDebtForm();
        EventBus.emit(_editingId ? EVENTS.DEBT_UPDATED : EVENTS.DEBT_ADDED, data);
        await loadDebts();
        // 切換到對應分頁
        const tab = type === 'group' ? 'group' : type;
        switchDebtTab(tab);
    } catch (e) {
        showError(e.message);
    }
}

// ==================== 編輯 ====================

/**
 * 載入欠款資料並切換表單為編輯模式
 * @param {string} id
 */
export async function editDebt(id) {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/debts/${id}`);
        const item = await response.json();
        if (!response.ok) throw new Error(item.error || '載入失敗');

        _editingId = id;
        _groupMembers = item.members ? JSON.parse(JSON.stringify(item.members)) : [];

        const typeEl = document.getElementById('debt-type');
        if (typeEl) typeEl.value = item.debt_type;
        onDebtTypeChange();

        if (item.debt_type === 'group') {
            const titleEl = document.getElementById('debt-title');
            if (titleEl) titleEl.value = item.title || '';
            const amountEl = document.getElementById('debt-amount');
            if (amountEl) amountEl.value = item.total_amount || '';
            renderMembersList(_groupMembers);
        } else {
            const personEl = document.getElementById('debt-person');
            if (personEl) personEl.value = item.person || '';
            const amountEl = document.getElementById('debt-amount');
            if (amountEl) amountEl.value = item.amount || '';
        }

        const reasonEl = document.getElementById('debt-reason');
        if (reasonEl) reasonEl.value = item.reason || '';
        const dateEl = document.getElementById('debt-date');
        if (dateEl) dateEl.value = item.date || '';

        const modal = document.getElementById('debt-form-modal');
        if (modal) modal.classList.remove('hidden');
        document.getElementById('debt-form-title').textContent = '編輯欠款';
        document.getElementById('debt-submit-btn').textContent = '儲存';
    } catch (e) {
        console.error('載入欠款編輯資料失敗:', e);
        alert('無法載入資料');
    }
}

// ==================== 刪除 ====================

/**
 * 刪除欠款
 * @param {string} id
 * @param {string} name
 */
export async function deleteDebt(id, name) {
    if (!confirm(`確定要刪除「${name}」？`)) return;
    try {
        const response = await apiCall(`${backendUrl}/admin/api/debts/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            alert(data.error || '刪除失敗');
            return;
        }
        EventBus.emit(EVENTS.DEBT_DELETED, { id });
        await loadDebts();
    } catch (e) {
        console.error('刪除欠款失敗:', e);
    }
}

// ==================== 結清 ====================

/**
 * 切換結清狀態
 * @param {string} id
 * @param {boolean} currentSettled
 */
export async function settleDebt(id, currentSettled) {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/debts/${id}/settle`, { method: 'POST' });
        if (!response.ok) {
            const data = await response.json();
            alert(data.error || '操作失敗');
            return;
        }
        await loadDebts();
    } catch (e) {
        console.error('切換結清狀態失敗:', e);
    }
}

// ==================== 還款 Modal ====================

/**
 * 顯示還款 Modal
 * @param {string} id
 */
export function showRepayModal(id) {
    _repayingId = id;
    const modal = document.getElementById('repay-modal');
    if (modal) modal.classList.remove('hidden');
    const errEl = document.getElementById('repay-error');
    if (errEl) errEl.classList.add('hidden');
    const amountEl = document.getElementById('repay-amount');
    if (amountEl) amountEl.value = '';
    const noteEl = document.getElementById('repay-note');
    if (noteEl) noteEl.value = '';
}

/**
 * 隱藏還款 Modal
 */
export function hideRepayModal() {
    document.getElementById('repay-modal')?.classList.add('hidden');
    _repayingId = null;
}

/**
 * 提交還款記錄
 */
export async function submitRepay() {
    const errEl = document.getElementById('repay-error');
    if (errEl) errEl.classList.add('hidden');

    const amount = parseFloat(document.getElementById('repay-amount')?.value);
    const note = document.getElementById('repay-note')?.value.trim() || '';

    if (!amount || amount <= 0) {
        if (errEl) { errEl.textContent = '請輸入有效還款金額'; errEl.classList.remove('hidden'); }
        return;
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await apiCall(`${backendUrl}/admin/api/debts/${_repayingId}/repay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, date: today, note })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '還款記錄失敗');
        hideRepayModal();
        await loadDebts();
    } catch (e) {
        if (errEl) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
    }
}

// ==================== 群組成員已付款切換 ====================

/**
 * 切換群組成員已付款狀態
 * @param {string} id - debt ID
 * @param {number} idx - member index
 * @param {boolean} currentPaid
 */
export async function toggleMemberPaid(id, idx, currentPaid) {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/debts/${id}/members/${idx}/pay`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paid: !currentPaid })
        });
        if (!response.ok) {
            const data = await response.json();
            alert(data.error || '操作失敗');
            return;
        }
        await loadDebts();
    } catch (e) {
        console.error('切換成員付款狀態失敗:', e);
    }
}

// ==================== 初始化 ====================

/**
 * 初始化欠款模組
 */
export function initDebts() {
    // 暴露到 window 供 HTML onclick 使用
    window.loadDebts = loadDebts;
    window.switchDebtTab = switchDebtTab;
    window.showDebtForm = showDebtForm;
    window.hideDebtForm = hideDebtForm;
    window.onDebtTypeChange = onDebtTypeChange;
    window.onDebtAmountChange = onDebtAmountChange;
    window.addGroupMember = addGroupMember;
    window.removeGroupMember = removeGroupMember;
    window.submitDebt = submitDebt;
    window.editDebt = editDebt;
    window.deleteDebt = deleteDebt;
    window.settleDebt = settleDebt;
    window.showRepayModal = showRepayModal;
    window.hideRepayModal = hideRepayModal;
    window.submitRepay = submitRepay;
    window.toggleMemberPaid = toggleMemberPaid;

    // 登入後自動載入
    EventBus.on(EVENTS.AUTH_LOGIN_SUCCESS, loadDebts);

    // 切換到欠款頁時自動載入
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'debts') loadDebts();
    });

    console.log('✅ [Debts] 欠款追蹤模組已初始化');
}
