/**
 * 欠款追蹤模組 - 管理個人借貸（支援多人分帳）
 *
 * 功能：
 * - 別人欠我（lent）/ 我欠別人（borrowed）— 雙向追蹤
 * - 單筆欠款可加入多個分帳對象，各自追蹤還款進度
 * - 部分還款記錄、結清狀態切換
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { escapeHtml, showToast, showConfirm, skeletonCards } from './utils.js';

/**
 * 目前顯示的分頁（'lent' | 'borrowed'）
 */
let _currentTab = 'lent';

/**
 * 目前正在編輯的欠款 ID（null = 新增模式）
 */
let _editingId = null;

/**
 * 全部欠款資料（快取，避免重複請求）
 */
let _debtsCache = [];

/**
 * 目前已展開的欠款卡片 ID 集合（跨 re-render 保留狀態）
 */
let _expandedCards = new Set();

/**
 * 表單中暫存的分帳成員列表 {name, share}
 */
let _formMembers = [];

// ==================== 分頁切換 ====================

/**
 * 切換欠款分頁
 * @param {string} tab - 'lent' | 'borrowed'（傳入 'group' 自動導向 'lent'）
 */
export function switchDebtTab(tab) {
    _currentTab = (tab === 'group') ? 'lent' : tab;
    document.querySelectorAll('.debt-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === _currentTab);
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
    container.innerHTML = skeletonCards(3);
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
    const calcRemaining = (d) => {
        const members = d.members || [];
        if (members.length > 0) {
            return members
                .filter(m => !m.is_settled)
                .reduce((s, m) => s + Math.max(0, (m.share || 0) - (m.paid_amount || 0)), 0);
        }
        return Math.max(0, d.amount - (d.paid_amount || 0));
    };

    const lentTotal = items
        .filter(d => d.debt_type === 'lent' && !d.is_settled)
        .reduce((s, d) => s + calcRemaining(d), 0);
    const borrowedTotal = items
        .filter(d => d.debt_type === 'borrowed' && !d.is_settled)
        .reduce((s, d) => s + calcRemaining(d), 0);

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

    container.innerHTML = items.map(item => renderDebtCard(item)).join('');
}

/**
 * 渲染欠款卡片（lent / borrowed，含多人分帳）— Accordion 設計
 * @param {object} item
 */
function renderDebtCard(item) {
    const isLent = item.debt_type === 'lent';
    const id = item._id.$oid;
    const members = item.members || [];
    const hasMembers = members.length > 0;

    // 進度計算
    let paid, total, pct;
    if (hasMembers) {
        total = members.reduce((s, m) => s + (m.share || 0), 0);
        paid = members.reduce((s, m) => s + (m.paid_amount || 0), 0);
    } else {
        total = item.amount || 0;
        paid = item.paid_amount || 0;
    }
    pct = total > 0 ? Math.round(paid / total * 100) : 0;

    const isExpanded = _expandedCards.has(id);
    const settledClass = item.is_settled ? 'opacity-60' : '';
    const directionIcon = isLent ? '🟢' : '🔴';
    const directionLabel = isLent ? '別人欠我' : '我欠別人';
    const directionLabelClass = isLent ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
    const progressColor = isLent ? 'bg-green-500' : 'bg-red-500';

    // 角落 badge
    let badge = '';
    if (item.is_settled) {
        badge = '<span class="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">已結清</span>';
    } else if (hasMembers) {
        const paidCount = members.filter(m => m.is_settled).length;
        if (paidCount === members.length) {
            badge = '<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">全數已付</span>';
        } else {
            badge = `<span class="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">${paidCount}/${members.length} 已付</span>`;
        }
    } else if (paid > 0 && paid < total) {
        badge = '<span class="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">部分還款</span>';
    }

    // 多人分帳成員列表（展開時）
    const memberRows = hasMembers ? members.map((m, idx) => {
        const mPaid = m.paid_amount || 0;
        const mShare = m.share || 0;
        const mPct = mShare > 0 ? Math.round(mPaid / mShare * 100) : 0;
        const mSettled = m.is_settled;
        return `
        <div class="py-2 border-b border-gray-50 last:border-0">
            <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-gray-700">${escapeHtml(m.name)}</span>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500">$${mPaid.toLocaleString()} / $${mShare.toLocaleString()}</span>
                    ${mSettled ? '<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">已結清</span>' : ''}
                </div>
            </div>
            <div class="h-1 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                <div class="h-full ${progressColor} rounded-full" style="width:${mPct}%"></div>
            </div>
            ${!mSettled && !item.is_settled ? `
            <div class="flex items-center gap-1.5">
                <input id="member-repay-input-${id}-${idx}" type="number" min="0.01" step="0.01"
                    placeholder="還款金額"
                    class="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-teal-400">
                <button onclick="submitMemberRepay('${id}', ${idx})"
                    class="px-2.5 py-1 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition shrink-0">
                    確定
                </button>
            </div>` : ''}
        </div>`;
    }).join('') : '';

    // 展開區塊
    const expandedHtml = isExpanded ? `
        <div class="px-3 pb-3 border-t border-gray-100 pt-2">
            <div class="flex justify-between text-xs text-gray-500 mb-2">
                ${item.reason ? `<span>原因：${escapeHtml(item.reason)}</span>` : '<span></span>'}
                ${item.date ? `<span>日期：${item.date}</span>` : ''}
            </div>
            ${hasMembers ? `<div class="mb-2">${memberRows}</div>` : ''}
            ${!hasMembers && !item.is_settled ? `
            <div class="flex items-center gap-2 mb-2">
                <input id="repay-input-${id}" type="number" min="0.01" step="0.01" placeholder="還款金額"
                    class="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-400">
                <button onclick="submitInlineRepay('${id}')"
                    class="px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition shrink-0">
                    確認還款
                </button>
            </div>` : ''}
            <div class="flex gap-1.5">
                <button onclick="settleDebt('${id}', ${item.is_settled})"
                    class="flex-1 py-1.5 ${item.is_settled ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-600'} text-xs font-medium rounded-lg hover:opacity-80 transition">
                    ${item.is_settled ? '取消結清' : '結清'}
                </button>
                <button onclick="editDebt('${id}')"
                    class="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition">編輯</button>
                <button onclick="deleteDebt('${id}', '${escapeHtml(item.person)}')"
                    class="flex-1 py-1.5 bg-red-100 text-red-600 text-xs rounded-lg hover:bg-red-200 transition">刪除</button>
            </div>
        </div>` : '';

    return `
        <div class="debt-card bg-white rounded-xl border border-gray-100 mb-2 shadow-sm overflow-hidden ${settledClass}">
            <div class="p-3 cursor-pointer select-none" onclick="toggleDebtCard('${id}')">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                        <span>${directionIcon}</span>
                        <span class="font-semibold text-gray-800 text-sm">${escapeHtml(item.person)}</span>
                        <span class="text-xs px-1.5 py-0.5 rounded-full ${directionLabelClass}">${directionLabel}</span>
                        ${badge}
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="${isLent ? 'text-green-600' : 'text-red-600'} font-bold text-sm">$${(item.amount || 0).toLocaleString()}</span>
                        <span class="text-gray-400 text-xs inline-block ${isExpanded ? 'rotate-180' : ''}">▼</span>
                    </div>
                </div>
                <div class="mt-2">
                    <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full ${progressColor} rounded-full" style="width:${pct}%"></div>
                    </div>
                    <div class="flex justify-between text-xs text-gray-400 mt-0.5">
                        <span>已還 $${paid.toLocaleString()} / $${total.toLocaleString()}</span>
                        <span>${pct}%</span>
                    </div>
                </div>
            </div>
            ${expandedHtml}
        </div>`;
}

// ==================== 卡片展開/收合 ====================

/**
 * 切換欠款卡片展開狀態
 * @param {string} id
 */
export function toggleDebtCard(id) {
    if (_expandedCards.has(id)) {
        _expandedCards.delete(id);
    } else {
        _expandedCards.add(id);
    }
    renderDebtsForCurrentTab();
}

// ==================== 還款 ====================

/**
 * 提交單人 inline 還款
 * @param {string} id
 */
export async function submitInlineRepay(id) {
    const inputEl = document.getElementById(`repay-input-${id}`);
    const amount = parseFloat(inputEl?.value);
    if (!amount || amount <= 0) {
        showToast('請輸入有效還款金額', 'error');
        return;
    }
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await apiCall(`${backendUrl}/admin/api/debts/${id}/repay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, date: today })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '還款記錄失敗');
        showToast('還款已記錄', 'success');
        await loadDebts();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

/**
 * 提交分帳成員還款
 * @param {string} debtId
 * @param {number} memberIdx
 */
export async function submitMemberRepay(debtId, memberIdx) {
    const inputEl = document.getElementById(`member-repay-input-${debtId}-${memberIdx}`);
    const amount = parseFloat(inputEl?.value);
    if (!amount || amount <= 0) {
        showToast('請輸入有效還款金額', 'error');
        return;
    }
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await apiCall(`${backendUrl}/admin/api/debts/${debtId}/members/${memberIdx}/repay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, date: today })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '還款記錄失敗');
        showToast('還款已記錄', 'success');
        await loadDebts();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ==================== 表單 type 按鈕組 ====================

/**
 * 設定新增表單的欠款類型（按鈕組使用）
 * @param {string} type - 'lent' | 'borrowed'
 */
export function setDebtFormType(type) {
    const selectEl = document.getElementById('debt-type');
    if (selectEl) selectEl.value = type;
    document.querySelectorAll('.debt-type-btn').forEach(btn => {
        const isActive = btn.dataset.type === type;
        btn.classList.toggle('bg-teal-600', isActive);
        btn.classList.toggle('text-white', isActive);
        btn.classList.toggle('bg-gray-100', !isActive);
        btn.classList.toggle('text-gray-600', !isActive);
    });
}

// ==================== 表單成員管理 ====================

/**
 * 新增分帳成員（從輸入框）
 */
export function addDebtMember() {
    const input = document.getElementById('debt-member-name-input');
    const name = input?.value.trim();
    if (!name) return;
    _formMembers.push({ name, share: 0 });
    input.value = '';
    recalcMemberShares();
    renderFormMembers();
}

/**
 * 移除分帳成員
 * @param {number} idx
 */
export function removeDebtMember(idx) {
    _formMembers.splice(idx, 1);
    recalcMemberShares();
    renderFormMembers();
}

/**
 * 平分金額給所有成員
 */
function recalcMemberShares() {
    const total = parseFloat(document.getElementById('debt-amount')?.value) || 0;
    if (_formMembers.length === 0) return;
    const share = Math.round(total / _formMembers.length * 100) / 100;
    _formMembers.forEach(m => { m.share = share; });
}

/**
 * 重新計算分攤（金額改變時觸發）
 */
export function onDebtAmountChange() {
    recalcMemberShares();
    renderFormMembers();
}

/**
 * 渲染表單中的成員列表
 */
function renderFormMembers() {
    const container = document.getElementById('debt-form-members');
    if (!container) return;
    if (!_formMembers.length) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = _formMembers.map((m, idx) => `
        <div class="flex items-center gap-2 py-1">
            <span class="text-sm text-gray-700 flex-1">${escapeHtml(m.name)}</span>
            <input type="number" value="${m.share}" min="0" step="0.01"
                oninput="_formMemberShareChange(${idx}, this.value)"
                class="w-20 text-sm border border-gray-200 rounded px-1.5 py-0.5 text-right">
            <button type="button" onclick="removeDebtMember(${idx})" class="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
        </div>`).join('');
}

/**
 * 修改成員分攤金額（由 oninput 呼叫）
 */
window._formMemberShareChange = function(idx, val) {
    if (_formMembers[idx]) _formMembers[idx].share = parseFloat(val) || 0;
};

// ==================== 表單顯示 / 隱藏 ====================

/**
 * 顯示新增欠款表單（新增模式）
 */
export function showDebtForm() {
    _editingId = null;
    _formMembers = [];
    resetDebtForm();
    const modal = document.getElementById('debt-form-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('debt-form-title').textContent = '新增欠款';
        document.getElementById('debt-submit-btn').textContent = '新增';
    }
    setDebtFormType(_currentTab === 'group' ? 'lent' : _currentTab);
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
    ['debt-person', 'debt-amount', 'debt-reason', 'debt-date', 'debt-member-name-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    _formMembers = [];
    renderFormMembers();
    const errEl = document.getElementById('debt-error');
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
}

// ==================== 提交 ====================

/**
 * 提交新增或編輯欠款
 */
export async function submitDebt() {
    const errEl = document.getElementById('debt-error');
    if (errEl) errEl.classList.add('hidden');

    const type = document.getElementById('debt-type')?.value;
    const amount = parseFloat(document.getElementById('debt-amount')?.value);
    const person = document.getElementById('debt-person')?.value.trim();
    const reason = document.getElementById('debt-reason')?.value.trim() || '';
    const date = document.getElementById('debt-date')?.value || '';

    const showError = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    };

    if (!person) return showError('請輸入姓名或標題');
    if (!amount || amount <= 0) return showError('請輸入有效金額');

    const payload = { debt_type: type, person, amount, reason, date };
    if (_formMembers.length > 0) {
        payload.members = _formMembers.map(m => ({ name: m.name, share: m.share }));
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

        const wasEditing = !!_editingId;
        hideDebtForm();
        EventBus.emit(wasEditing ? EVENTS.DEBT_UPDATED : EVENTS.DEBT_ADDED, data);
        showToast(wasEditing ? '欠款已更新' : '欠款已新增', 'success');
        await loadDebts();
        switchDebtTab(type);
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
        // 載入 members（保留 name/share，編輯時不帶 paid_amount）
        _formMembers = (item.members || []).map(m => ({ name: m.name, share: m.share }));

        setDebtFormType(item.debt_type);

        const personEl = document.getElementById('debt-person');
        if (personEl) personEl.value = item.person || '';
        const amountEl = document.getElementById('debt-amount');
        if (amountEl) amountEl.value = item.amount || '';
        const reasonEl = document.getElementById('debt-reason');
        if (reasonEl) reasonEl.value = item.reason || '';
        const dateEl = document.getElementById('debt-date');
        if (dateEl) dateEl.value = item.date || '';

        renderFormMembers();

        const modal = document.getElementById('debt-form-modal');
        if (modal) modal.classList.remove('hidden');
        document.getElementById('debt-form-title').textContent = '編輯欠款';
        document.getElementById('debt-submit-btn').textContent = '儲存';
    } catch (e) {
        console.error('載入欠款編輯資料失敗:', e);
        showToast('無法載入資料', 'error');
    }
}

// ==================== 刪除 ====================

/**
 * 刪除欠款
 * @param {string} id
 * @param {string} name
 */
export async function deleteDebt(id, name) {
    if (!await showConfirm(`確定要刪除「${name}」？`, '刪除', '取消')) return;
    try {
        const response = await apiCall(`${backendUrl}/admin/api/debts/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            showToast(data.error || '刪除失敗', 'error');
            return;
        }
        EventBus.emit(EVENTS.DEBT_DELETED, { id });
        showToast('欠款已刪除', 'success');
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
            showToast(data.error || '操作失敗', 'error');
            return;
        }
        showToast(currentSettled ? '已取消結清' : '已結清', 'success');
        await loadDebts();
    } catch (e) {
        console.error('切換結清狀態失敗:', e);
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
    window.setDebtFormType = setDebtFormType;
    window.onDebtAmountChange = onDebtAmountChange;
    window.addDebtMember = addDebtMember;
    window.removeDebtMember = removeDebtMember;
    window.submitDebt = submitDebt;
    window.editDebt = editDebt;
    window.deleteDebt = deleteDebt;
    window.settleDebt = settleDebt;
    window.toggleDebtCard = toggleDebtCard;
    window.submitInlineRepay = submitInlineRepay;
    window.submitMemberRepay = submitMemberRepay;

    // 登入後自動載入
    EventBus.on(EVENTS.AUTH_LOGIN_SUCCESS, loadDebts);

    // 切換到欠款頁時自動載入
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'debts') loadDebts();
    });

    console.log('✅ [Debts] 欠款追蹤模組已初始化');
}
