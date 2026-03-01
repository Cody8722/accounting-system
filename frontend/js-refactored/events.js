/**
 * 事件總線 - 用於模組間解耦通信
 *
 * 使用事件驅動架構解決模組間的循環依賴問題
 * 各模組只需監聽和發送事件，不需要直接相互調用
 */

export const EventBus = {
    events: {},
    debug: true, // 開發模式下啟用調試日誌

    /**
     * 註冊事件監聽器
     * @param {string} event - 事件名稱
     * @param {Function} callback - 回調函數
     */
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        if (this.debug) {
            console.log(`📡 [EventBus] 註冊監聽: ${event} (共 ${this.events[event].length} 個監聽器)`);
        }
    },

    /**
     * 發送事件
     * @param {string} event - 事件名稱
     * @param {any} data - 事件數據
     */
    emit(event, data) {
        if (this.debug) {
            console.log(`🚀 [EventBus] 發送事件: ${event}`, data);
        }

        if (this.events[event]) {
            this.events[event].forEach((callback, index) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ [EventBus] 事件處理錯誤 ${event} (監聽器 #${index}):`, error);
                }
            });
        } else {
            if (this.debug) {
                console.warn(`⚠️ [EventBus] 沒有監聽器: ${event}`);
            }
        }
    },

    /**
     * 移除事件監聽器
     * @param {string} event - 事件名稱
     * @param {Function} callback - 要移除的回調函數
     */
    off(event, callback) {
        if (this.events[event]) {
            const before = this.events[event].length;
            this.events[event] = this.events[event].filter(cb => cb !== callback);
            const after = this.events[event].length;

            if (this.debug) {
                console.log(`🔇 [EventBus] 移除監聽: ${event} (${before} → ${after} 個監聽器)`);
            }
        }
    },

    /**
     * 清除所有監聽器（測試用）
     */
    clear() {
        const count = Object.keys(this.events).length;
        this.events = {};
        if (this.debug) {
            console.log(`🧹 [EventBus] 清除所有監聽器 (共 ${count} 個事件)`);
        }
    },

    /**
     * 獲取所有事件名稱（調試用）
     * @returns {string[]} 事件名稱列表
     */
    getEvents() {
        return Object.keys(this.events);
    },

    /**
     * 獲取指定事件的監聽器數量
     * @param {string} event - 事件名稱
     * @returns {number} 監聽器數量
     */
    getListenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    },

    /**
     * 設置調試模式
     * @param {boolean} enabled - 是否啟用調試
     */
    setDebug(enabled) {
        this.debug = enabled;
        console.log(`🔧 [EventBus] 調試模式: ${enabled ? '啟用' : '禁用'}`);
    }
};

/**
 * 事件常量 - 集中管理所有事件名稱
 * 使用常量可以避免字符串拼寫錯誤，並提供智能提示
 */
export const EVENTS = {
    // ===== 記帳記錄事件 =====
    RECORD_ADDED: 'record:added',           // 記錄新增完成
    RECORD_UPDATED: 'record:updated',       // 記錄更新完成
    RECORD_DELETED: 'record:deleted',       // 記錄刪除完成
    RECORDS_LOADED: 'records:loaded',       // 記錄列表載入完成
    RECORDS_FILTERED: 'records:filtered',   // 記錄篩選完成
    RECORD_EDIT_REQUESTED: 'record:edit-requested',     // 請求編輯記錄
    RECORD_DELETE_REQUESTED: 'record:delete-requested', // 請求刪除記錄

    // ===== 統計事件 =====
    STATS_UPDATED: 'stats:updated',                 // 統計數據更新完成
    STATS_REQUEST_UPDATE: 'stats:request-update',   // 請求更新統計數據

    // ===== 圖表事件 =====
    CHART_UPDATE_EXPENSE: 'chart:update-expense',   // 請求更新支出圖表
    CHART_UPDATE_TRENDS: 'chart:update-trends',     // 請求更新趨勢圖表
    CHART_RENDERED: 'chart:rendered',               // 圖表渲染完成

    // ===== 預算事件 =====
    BUDGET_LOADED: 'budget:loaded',                 // 預算載入完成
    BUDGET_UPDATED: 'budget:updated',               // 預算更新完成
    BUDGET_USAGE_UPDATE: 'budget:usage-update',     // 預算使用率更新
    BUDGET_WARNING: 'budget:warning',               // 預算警告

    // ===== 認證事件 =====
    AUTH_LOGIN_SUCCESS: 'auth:login-success',       // 登入成功
    AUTH_REGISTER_SUCCESS: 'auth:register-success', // 註冊成功
    AUTH_LOGOUT: 'auth:logout',                     // 登出
    AUTH_TOKEN_INVALID: 'auth:token-invalid',       // Token 無效
    AUTH_MODAL_OPENED: 'auth:modal-opened',         // 認證模態框打開
    AUTH_MODAL_CLOSED: 'auth:modal-closed',         // 認證模態框關閉
    USER_DISPLAY_UPDATED: 'user:display-updated',   // 用戶顯示更新
    USER_PROFILE_UPDATED: 'user:profile-updated',   // 用戶資料更新
    USER_PASSWORD_CHANGED: 'user:password-changed', // 密碼已更改

    // ===== 分類事件 =====
    CATEGORY_SELECTED: 'category:selected',                     // 分類被選擇
    CATEGORY_MODAL_OPENED: 'category:modal-opened',             // 分類選擇器打開
    CATEGORY_MODAL_CLOSED: 'category:modal-closed',             // 分類選擇器關閉
    FILTER_CATEGORY_SELECTED: 'filter-category:selected',       // 篩選分類被選擇
    FILTER_CATEGORY_MODAL_OPENED: 'filter-category:modal-opened', // 篩選器打開
    FILTER_CATEGORY_MODAL_CLOSED: 'filter-category:modal-closed', // 篩選器關閉

    // ===== UI 事件 =====
    UI_SHOW_TOAST: 'ui:show-toast',                 // 顯示 Toast 通知
    UI_SHOW_CONFIRM: 'ui:show-confirm',             // 顯示確認對話框
    UI_PAGE_CHANGED: 'ui:page-changed',             // 頁面切換（舊）
    PAGE_CHANGED: 'page:changed',                   // 頁面切換
    PAGE_LOAD: 'page:load',                         // 頁面載入
    KEYBOARD_OPENED: 'keyboard:opened',             // 鍵盤打開
    KEYBOARD_CLOSED: 'keyboard:closed',             // 鍵盤關閉

    // ===== 導出事件 =====
    EXPORT_CSV_START: 'export:csv-start',           // 開始導出 CSV
    EXPORT_CSV_COMPLETE: 'export:csv-complete',     // CSV 導出完成

    // ===== 設置事件 =====
    SETTINGS_UPDATED: 'settings:updated',           // 設置更新
    PROFILE_UPDATED: 'profile:updated',             // 個人資料更新
    PASSWORD_CHANGED: 'password:changed'            // 密碼修改
};

// 開發環境下輸出事件列表
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('📋 [EventBus] 可用事件列表:', Object.keys(EVENTS).length, '個事件');
    console.log('💡 使用 EventBus.setDebug(false) 可關閉調試日誌');
}
