/**
 * 主程式入口 - 統一初始化所有模組
 *
 * 職責：
 * - 按順序初始化所有模組
 * - 處理初始載入邏輯
 * - 協調模組間的啟動依賴
 * - 處理登入驗證和頁面初始化
 *
 * 模組初始化順序：
 * 1. 基礎模組（config, utils, api, events）
 * 2. 功能模組（auth, components, categories）
 * 3. 核心模組（stats, records, charts, budget）
 * 4. 附加模組（export, settings, pwa）
 */

// ===== 基礎模組 =====
import { EventBus, EVENTS } from './events.js';
import { backendUrl } from './config.js';
import { apiCall } from './api.js';

// ===== 功能模組 =====
import { initAuth, verifyToken, hideAuthModals, showLoginModal, updateUserDisplay } from './auth.js';
import { Router, CustomKeyboard, SwipeToDelete, LongPressMenu, setAuthenticationStatus } from './components.js';
import { initCategories } from './categories.js';

// ===== 核心模組 =====
import { initStats } from './stats.js';
import { initRecords, setTodayAsDefault } from './records.js';
import { initCharts } from './charts.js';
import { initBudget, loadBudget } from './budget.js';

// ===== 附加模組 =====
import { initExport } from './export.js';
import { initSettings } from './settings.js';
import { initPWA, showIOSInstallPrompt, showAndroidInstallPrompt } from './pwa.js';
import { initAnalytics } from './analytics.js';
import { initRecurring } from './recurring.js';
import { initTheme } from './theme.js';

/**
 * 認證狀態標記
 */
let isAuthenticated = false;

/**
 * 重置密碼 token（從 URL 參數讀取）
 */
let _resetToken = null;

/**
 * 初始化所有模組
 */
function initializeModules() {
    console.log('🚀 開始初始化所有模組...');

    // 1. 初始化功能模組
    initAuth();
    initCategories();

    // 2. 初始化核心模組
    initStats();
    initRecords();
    initCharts();
    initBudget();

    // 3. 初始化附加模組
    initExport();
    initSettings();
    initPWA();
    initAnalytics();
    initRecurring();
    initTheme();

    // 4. 初始化 UI 組件
    initializeUIComponents();

    // 監聽登入成功事件，初始化日期預設值
    EventBus.on(EVENTS.AUTH_LOGIN_SUCCESS, () => {
        setTodayAsDefault();
    });

    console.log('✅ 所有模組初始化完成！');
}

/**
 * 初始化 UI 組件
 */
function initializeUIComponents() {
    // 初始化路由器
    const router = new Router();

    // 初始化自定義鍵盤
    const keyboard = new CustomKeyboard();

    // 初始化滑動刪除
    const swipeToDelete = new SwipeToDelete();

    // 初始化長按選單
    const longPressMenu = new LongPressMenu();

    // 暴露到全局（供其他模組使用）
    window.router = router;
    window.keyboard = keyboard;
    window.swipeToDelete = swipeToDelete;
    window.longPressMenu = longPressMenu;

    console.log('✅ [Main] UI 組件已初始化');
}

/**
 * 初始化篩選器分類選項（從 config.js 讀取）
 */
function initializeFilterCategories() {
    // 這個函數應該在 categories.js 中實現
    // 這裡只是佔位符，確保向後兼容
    console.log('📋 初始化篩選器分類選項');
}

/**
 * DOMContentLoaded 處理程序
 */
async function handleDOMContentLoaded() {
    console.log('📄 DOM 已載入');

    // 初始化篩選器分類選項
    initializeFilterCategories();

    // 偵測 URL 中的 reset_token（忘記密碼連結）
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset_token');

    if (resetToken) {
        _resetToken = resetToken;
        // 清除 URL 中的 token（避免重新整理後重複顯示）
        window.history.replaceState({}, '', window.location.pathname);

        // 顯示重置密碼模態框
        const resetModal = document.getElementById('reset-password-modal');
        if (resetModal) {
            document.getElementById('reset-new-password').value = '';
            document.getElementById('reset-confirm-password').value = '';
            const errorEl = document.getElementById('reset-error');
            if (errorEl) errorEl.classList.add('hidden');
            resetModal.classList.remove('hidden');
        }

        // 不繼續驗證登入
        return;
    }

    // 檢查是否已登入（驗證token）
    const isLoggedIn = await verifyToken();

    if (isLoggedIn) {
        isAuthenticated = true; // 解鎖 Router onPageLoad，允許發 API 請求
        setAuthenticationStatus(true); // 同步 components.js 的認證狀態

        // 隱藏登入模態框，顯示主內容
        hideAuthModals();
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.style.display = 'block';

        // 初始化數據
        setTodayAsDefault();
        loadBudget();
        updateUserDisplay();
        // loadRecurring 透過 AUTH_LOGIN_SUCCESS 事件由 recurring.js 自動觸發

        // 請求更新統計數據（透過事件）
        EventBus.emit(EVENTS.STATS_REQUEST_UPDATE);

        // 補發初始頁面的 PAGE_LOAD（Router 初始化時因 auth 尚未就緒而跳過）
        const initialPage = window.router?.currentPage || 'add';
        EventBus.emit(EVENTS.PAGE_LOAD, { page: initialPage });

        console.log('✅ 已自動登入');

        // 登入後顯示安裝提示（iOS / Android）
        showIOSInstallPrompt();
        showAndroidInstallPrompt();

    } else {
        // 未登入時，檢查當前 hash 是否已經是認證頁面
        const currentHash = window.location.hash;
        const isAuthPage = currentHash === '#login' ||
                          currentHash === '#register' ||
                          currentHash === '#forgot-password';

        // 如果不在認證頁面，則導航到登入頁
        // 如果已經在認證頁面（例如測試中直接訪問 #register），則保持不變
        if (!isAuthPage) {
            showLoginModal();
        } else {
            // 已經在認證頁面，只需確保不會顯示 main-content
            const mainContent = document.getElementById('main-content');
            if (mainContent) mainContent.style.display = 'none';
        }
    }
}

/**
 * 主程式入口
 */
function main() {
    console.log('🎯 [Main] 主程式啟動');
    console.log(`📍 後端 URL: ${backendUrl}`);

    // 初始化所有模組
    initializeModules();

    // 監聽 DOMContentLoaded 事件
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
    } else {
        // DOM 已經載入完成，直接執行
        handleDOMContentLoaded();
    }

    // 暴露認證狀態到全局（供調試使用）
    window.isAuthenticated = () => isAuthenticated;

    console.log('🎉 [Main] 主程式啟動完成');
}

// 執行主程式
main();

// 暴露到全局（供調試使用）
window.EventBus = EventBus;
window.EVENTS = EVENTS;
