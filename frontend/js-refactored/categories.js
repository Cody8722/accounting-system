/**
 * 分類選擇器模組 - 處理記帳分類選擇功能
 *
 * 功能：
 * - 分類選擇器模態框（記帳頁面使用）
 * - 分類篩選器模態框（記錄頁面使用）
 * - 編輯模式的分類選擇
 */

import { EventBus, EVENTS } from './events.js';
import { categoryData, getItemIcon } from './config.js';
import { escapeHtml } from './utils.js';

/**
 * 分類選擇器狀態
 */
let currentCategoryType = 'expense';
let currentMainCategory = null;
let isEditMode = false;
let currentFilterMainCategory = ''; // '' = 全部

/**
 * 打開分類選擇器模態框
 */
export function openCategoryModal() {
    const recordType = document.getElementById('record-type').value;
    currentCategoryType = recordType;

    const categories = categoryData[currentCategoryType];
    const mainCategories = Object.keys(categories);

    // 設定第一個大分類為預設選中
    currentMainCategory = mainCategories[0];

    renderCategoryModal();

    const modal = document.getElementById('category-modal');
    if (modal) modal.classList.remove('hidden');

    EventBus.emit(EVENTS.CATEGORY_MODAL_OPENED, { type: currentCategoryType });
}

/**
 * 關閉分類選擇器模態框
 */
export function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) modal.classList.add('hidden');

    EventBus.emit(EVENTS.CATEGORY_MODAL_CLOSED);
}

/**
 * 切換大分類
 */
export function switchCategory(mainCategory) {
    currentMainCategory = mainCategory;
    renderCategoryModal();
}

/**
 * 選擇分類
 */
export function selectCategory(category) {
    if (isEditMode) {
        selectCategoryForEdit(category);
    } else {
        const categoryInput = document.getElementById('record-category');
        if (categoryInput) categoryInput.value = category;
        closeCategoryModal();

        EventBus.emit(EVENTS.CATEGORY_SELECTED, { category });
    }
}

/**
 * 打開編輯模式的分類選擇器
 */
export function openCategoryModalForEdit() {
    isEditMode = true;
    openCategoryModal();
}

/**
 * 編輯模式下選擇分類
 */
function selectCategoryForEdit(category) {
    const categoryInput = document.getElementById('edit-record-category');
    if (categoryInput) categoryInput.value = category;
    isEditMode = false;
    closeCategoryModal();

    EventBus.emit(EVENTS.CATEGORY_SELECTED, { category, mode: 'edit' });
}

/**
 * 渲染分類選擇器模態框
 */
function renderCategoryModal() {
    const categories = categoryData[currentCategoryType];
    const mainCategories = Object.keys(categories);

    // 渲染大分類標籤
    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
        tabsContainer.innerHTML = mainCategories.map(mainCat => `
            <div class="category-tab ${mainCat === currentMainCategory ? 'active' : ''}"
                 data-cat="${escapeHtml(mainCat)}">
                ${escapeHtml(mainCat)}
            </div>
        `).join('');
        tabsContainer.onclick = (e) => {
            const tab = e.target.closest('[data-cat]');
            if (tab) switchCategory(tab.dataset.cat);
        };
    }

    // 渲染細項
    const itemsContainer = document.getElementById('category-items');
    const items = categories[currentMainCategory] || [];

    if (itemsContainer) {
        itemsContainer.innerHTML = items.map(item => `
            <div class="category-item" data-item="${escapeHtml(item)}">
                <div class="category-item-icon">${getItemIcon(item)}</div>
                <div class="category-item-text">${escapeHtml(item)}</div>
            </div>
        `).join('');
        itemsContainer.onclick = (e) => {
            const itemEl = e.target.closest('[data-item]');
            if (itemEl) selectCategory(itemEl.dataset.item);
        };
    }
}

/**
 * 渲染篩選分類 modal（大分類 tabs + 小分類卡片）
 */
function renderFilterCategoryModal(allMainCategories) {
    const tabsContainer = document.getElementById('filter-category-tabs');
    const itemsContainer = document.getElementById('filter-category-items');

    // 渲染大分類 tabs（含「全部」）
    if (tabsContainer) {
        tabsContainer.innerHTML =
            `<div class="category-tab ${currentFilterMainCategory === '' ? 'active' : ''}"
                  onclick="switchFilterCategory('')">全部</div>` +
            allMainCategories.map(([mainCat]) =>
                `<div class="category-tab ${mainCat === currentFilterMainCategory ? 'active' : ''}"
                      onclick="switchFilterCategory('${escapeHtml(mainCat)}')">${escapeHtml(mainCat)}</div>`
            ).join('');
    }

    // 決定要顯示的小分類
    let items;
    if (currentFilterMainCategory === '') {
        const all = new Set();
        allMainCategories.forEach(([, subs]) => subs.forEach(s => all.add(s)));
        items = Array.from(all).sort();
    } else {
        const found = allMainCategories.find(([k]) => k === currentFilterMainCategory);
        items = found ? found[1] : [];
    }

    // 渲染小分類卡片
    if (itemsContainer) {
        itemsContainer.innerHTML = items.map(category => {
            const icon = getItemIcon(category);
            return `<button type="button"
                class="category-item flex flex-col items-center justify-center p-3 bg-white border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition cursor-pointer"
                onclick="selectFilterCategory('${escapeHtml(category)}', '${icon} ${escapeHtml(category)}')">
                <span class="text-3xl mb-1">${icon}</span>
                <span class="text-xs text-center text-gray-700 font-medium">${escapeHtml(category)}</span>
            </button>`;
        }).join('');
    }
}

/**
 * 打開分類篩選器模態框（記錄頁面使用）
 */
export function openFilterCategoryModal() {
    const modal = document.getElementById('filter-category-modal');
    if (!modal) return;

    const allMainCategories = [
        ...Object.entries(categoryData.expense || {}),
        ...Object.entries(categoryData.income || {})
    ];

    renderFilterCategoryModal(allMainCategories);
    modal.classList.remove('hidden');

    EventBus.emit(EVENTS.FILTER_CATEGORY_MODAL_OPENED);
}

/**
 * 切換篩選分類大分類 tab
 */
export function switchFilterCategory(mainCategory) {
    currentFilterMainCategory = mainCategory;
    const allMainCategories = [
        ...Object.entries(categoryData.expense || {}),
        ...Object.entries(categoryData.income || {})
    ];
    renderFilterCategoryModal(allMainCategories);
}

/**
 * 關閉分類篩選器模態框
 */
export function closeFilterCategoryModal() {
    const modal = document.getElementById('filter-category-modal');
    if (modal) modal.classList.add('hidden');

    EventBus.emit(EVENTS.FILTER_CATEGORY_MODAL_CLOSED);
}

/**
 * 選擇篩選分類
 */
export function selectFilterCategory(category, displayText) {
    const hiddenInput = document.getElementById('filter-category');
    const displaySpan = document.getElementById('filter-category-display');

    if (hiddenInput) {
        hiddenInput.value = category;
    }

    if (displaySpan) {
        if (category === '') {
            displaySpan.innerHTML = '<span class="text-gray-500">全部</span>';
        } else {
            displaySpan.innerHTML = `<span class="text-gray-800">${displayText}</span>`;
        }
    }

    closeFilterCategoryModal();

    EventBus.emit(EVENTS.FILTER_CATEGORY_SELECTED, { category });

    // 選完分類後立即觸發查詢
    if (window.loadAccountingRecords) window.loadAccountingRecords(true, 1);
}

/**
 * 初始化分類選擇器功能
 * 暴露函數到全局，以便 HTML 的 onclick 可以調用
 */
export function initCategories() {
    // 暴露函數到全局
    window.openCategoryModal = openCategoryModal;
    window.closeCategoryModal = closeCategoryModal;
    window.switchCategory = switchCategory;
    window.selectCategory = selectCategory;
    window.openCategoryModalForEdit = openCategoryModalForEdit;
    window.openFilterCategoryModal = openFilterCategoryModal;
    window.closeFilterCategoryModal = closeFilterCategoryModal;
    window.selectFilterCategory = selectFilterCategory;
    window.switchFilterCategory = switchFilterCategory;

    console.log('✅ [Categories] 分類選擇器已初始化');
}
