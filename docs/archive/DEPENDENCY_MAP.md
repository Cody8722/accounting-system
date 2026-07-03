# 前端模組依賴關係圖

## 關鍵發現：互相依賴和隱藏依賴

### 1. 核心依賴鏈

```
config.js (基礎層 - 無依賴)
  ├── backendUrl
  ├── categoryData
  └── getItemIcon()

utils.js (基礎層 - 無依賴)
  ├── escapeHtml()
  ├── showToast()
  └── showConfirm()

api.js (依賴: config, utils)
  └── apiCall()
      ├── 使用 backendUrl
      ├── 使用 getAuthToken()
      └── 錯誤時調用 showToast()

auth.js (依賴: api, utils, config)
  ├── getAuthToken(), setAuthToken(), removeAuthToken()
  ├── getUserData(), setUserData()
  ├── verifyToken() → 調用 apiCall()
  ├── showLoginModal(), showRegisterModal()
  ├── validatePasswordRealtime() → fetch() to backendUrl
  └── handleLogout() → 調用 apiCall()
```

### 2. 記帳記錄模組依賴（複雜）

```
records.js (依賴: api, utils, categories, components, charts)
  │
  ├── loadAccountingRecords()
  │   ├── 調用 apiCall()
  │   ├── 調用 updateExpenseChart() ⚠️ 依賴 charts.js
  │   ├── 調用 escapeHtml()
  │   ├── 需要 SwipeToDelete class ⚠️ 依賴 components.js
  │   ├── 需要 LongPressMenu instance ⚠️ 依賴 components.js
  │   └── 需要 window.deleteAccountingRecord
  │
  ├── openEditRecordModal()
  │   ├── 調用 apiCall()
  │   ├── 調用 renderCategoryModal() ⚠️ 依賴 categories.js
  │   └── 調用 getItemIcon() ⚠️ 依賴 config.js
  │
  ├── deleteAccountingRecord() (window 函數)
  │   ├── 調用 showConfirm() ⚠️ 依賴 utils.js
  │   ├── 調用 apiCall()
  │   ├── 調用 showToast()
  │   ├── 調用 loadAccountingRecords() ⚠️ 遞迴依賴
  │   ├── 調用 updateAccountingStats() ⚠️ 依賴 charts.js
  │   └── 調用 applyOptimisticStats() ⚠️ 依賴 charts.js
  │
  └── accountingForm submit handler
      ├── 調用 validateAmount()
      ├── 調用 apiCall()
      ├── 調用 showToast()
      ├── 調用 loadAccountingRecords() ⚠️ 遞迴依賴
      ├── 調用 updateAccountingStats() ⚠️ 依賴 charts.js
      └── 調用 applyOptimisticStats() ⚠️ 依賴 charts.js
```

### 3. 統計與圖表模組（被多處依賴）

```
charts.js (依賴: api, utils, budget)
  │
  ├── updateAccountingStats() ⚠️ 被 records, router 調用
  │   ├── 調用 apiCall()
  │   ├── 調用 animateNumber()
  │   ├── 調用 applyStatsToDOM()
  │   └── 調用 updateBudgetUsage() ⚠️ 依賴 budget.js
  │
  ├── updateExpenseChart() ⚠️ 被 records, router 調用
  │   ├── 使用全局 expenseChart 變數
  │   ├── Chart.js destroy/create
  │   └── 需要 categoryData ⚠️ 依賴 config.js
  │
  ├── updateTrendsChart() ⚠️ 被 router 調用
  │   ├── 調用 apiCall()
  │   ├── 使用全局 trendsChart 變數
  │   └── Chart.js destroy/create
  │
  ├── animateNumber() (requestAnimationFrame)
  ├── applyStatsToDOM()
  └── applyOptimisticStats()
```

### 4. 分類系統（被記帳使用）

```
categories.js (依賴: config)
  │
  ├── 使用 categoryData ⚠️ 來自 config.js
  ├── 使用 getItemIcon() ⚠️ 來自 config.js
  │
  ├── openCategoryModal()
  │   ├── 讀取 record-type 值
  │   └── 調用 renderCategoryModal()
  │
  ├── renderCategoryModal()
  │   ├── 使用 categoryData
  │   ├── 使用 getItemIcon()
  │   └── 動態生成 onclick="switchCategory(...)"
  │
  ├── selectCategory()
  │   └── 更新 record-category 或 edit-record-category
  │
  └── openFilterCategoryModal()
      ├── 使用 categoryData
      ├── 使用 getItemIcon()
      └── 動態生成 onclick="selectFilterCategory(...)"
```

### 5. Router 類別（依賴最多）

```
router.js (依賴: records, charts, budget)
  │
  ├── Router.navigate()
  │   └── 頁面切換邏輯
  │
  └── Router.onPageLoad() ⚠️ 關鍵依賴點
      ├── 如果是 'records' → 調用 window.loadAccountingRecords()
      ├── 如果是 'analytics' →
      │   ├── 調用 window.updateAccountingStats()
      │   ├── 調用 window.updateExpenseChart()
      │   └── 調用 window.updateTrendsChart()
      └── 如果是 'settings' → 調用 window.loadBudget()
```

### 6. UI 組件（被記帳使用）

```
components.js (依賴: 無，但被其他模組實例化)
  │
  ├── CustomKeyboard class
  │   ├── 需要 custom-keyboard DOM
  │   ├── 需要 keyboard-display DOM
  │   └── 需要 mobile-nav DOM
  │
  ├── SwipeToDelete class ⚠️ 被 loadAccountingRecords 使用
  │   ├── 監聽 touchstart/move/end
  │   └── 顯示刪除按鈕
  │
  └── LongPressMenu class ⚠️ 被 loadAccountingRecords 使用
      ├── 需要 context-menu DOM
      ├── 需要 context-menu-overlay DOM
      └── currentRecord 需要調用 window.openEditRecordModal()
```

### 7. 預算管理

```
budget.js (依賴: api, utils)
  │
  ├── loadBudget() ⚠️ 被 router 調用
  │   └── 調用 apiCall()
  │
  ├── updateBudgetUsage() ⚠️ 被 charts.updateAccountingStats 調用
  │   └── DOM 操作 budget-usage-list
  │
  └── saveBudgetBtn handler
      ├── 調用 apiCall()
      └── 調用 showToast()
```

### 8. PWA 功能

```
pwa.js (依賴: utils, 但是獨立運行)
  │
  ├── Service Worker 註冊
  │   ├── 檢測更新
  │   ├── 自動重載
  │   └── showNetworkStatus() → 調用 showToast()
  │
  ├── Android 安裝提示
  │   ├── shouldShowAndroidPrompt()
  │   ├── showAndroidInstallPrompt()
  │   ├── dismissAndroidPrompt()
  │   └── triggerAndroidInstall()
  │
  └── iOS 安裝提示
      ├── isIOS()
      ├── isInStandaloneMode()
      ├── shouldShowIOSPrompt()
      ├── showIOSInstallPrompt()
      └── dismissIOSPrompt()
```

## ⚠️ 關鍵依賴問題

### 問題 1: 循環依賴風險
```
records.js → charts.js → budget.js
     ↓          ↓
  charts.js  apiCall()
     ↑
 router.js
```

### 問題 2: 全局變數共享
- `expenseChart`, `trendsChart` - 必須在 charts.js 中管理
- `categoryData` - 必須在 config.js 中定義
- `backendUrl` - 必須在 config.js 中定義

### 問題 3: Window 函數暴露時機
Router.onPageLoad() 調用的函數必須在 Router 初始化前就暴露到 window：
- window.loadAccountingRecords
- window.updateAccountingStats
- window.updateExpenseChart
- window.updateTrendsChart
- window.loadBudget

### 問題 4: DOM 元素依賴
許多函數依賴特定 DOM 元素存在：
- CustomKeyboard → 需要 #custom-keyboard, #keyboard-display, #mobile-nav
- LongPressMenu → 需要 #context-menu, #context-menu-overlay
- loadAccountingRecords → 需要 #records-list
- updateExpenseChart → 需要 #expenseChart canvas

### 問題 5: 事件監聽器中的函數調用
```javascript
// 在 loadAccountingRecords 中
recordCards.forEach(card => {
    new SwipeToDelete(card);  // ⚠️ 需要 SwipeToDelete class
    longPressMenu.bindToElement(card, recordId);  // ⚠️ 需要 longPressMenu instance
});
```

## 🎯 解決方案

### 方案 A: 初始化順序（推薦）
```javascript
// main.js
import { config, categoryData, getItemIcon } from '/js/config.js';
import { showToast, showConfirm, escapeHtml } from '/js/utils.js';
import { apiCall } from '/js/api.js';
import { initAuth, getAuthToken } from '/js/auth.js';
import { CustomKeyboard, SwipeToDelete, LongPressMenu } from '/js/components.js';
import { initCategories } from '/js/categories.js';
import { initRecords, loadAccountingRecords } from '/js/records.js';
import { updateAccountingStats, updateExpenseChart, updateTrendsChart } from '/js/charts.js';
import { initBudget, loadBudget } from '/js/budget.js';
import { initRouter } from '/js/router.js';
import { initPWA } from '/js/pwa.js';

// 1. 暴露給 window（給 HTML onclick 和 Router 使用）
window.loadAccountingRecords = loadAccountingRecords;
window.updateAccountingStats = updateAccountingStats;
window.updateExpenseChart = updateExpenseChart;
window.updateTrendsChart = updateTrendsChart;
window.loadBudget = loadBudget;
// ... 其他 window 函數

// 2. 初始化順序很重要！
async function initApp() {
    // 階段1: 基礎設施
    initPWA();  // 獨立，可以先跑

    // 階段2: 認證
    const isAuthenticated = await initAuth();

    if (isAuthenticated) {
        // 階段3: UI 組件
        initCategories();
        const customKeyboard = new CustomKeyboard();
        const longPressMenu = new LongPressMenu();

        // 階段4: 功能模組（依賴組件）
        initRecords(customKeyboard, longPressMenu);  // ⚠️ 傳入依賴
        initBudget();

        // 階段5: 路由（依賴所有功能模組）
        const router = initRouter();
        router.setAuthenticated(true);
        router.onPageLoad(router.currentPage);
    }
}
```

### 方案 B: 依賴注入
```javascript
// records.js
export function initRecords(dependencies) {
    const {
        SwipeToDelete,
        LongPressMenu,
        updateExpenseChart,
        updateAccountingStats
    } = dependencies;

    // 現在 loadAccountingRecords 可以使用這些依賴
}
```

## 📋 測試檢查清單

### Phase 2 測試（config + utils + api）
- [ ] backendUrl 正確偵測
- [ ] showToast 正常顯示
- [ ] showConfirm 返回正確結果
- [ ] apiCall 能正確調用 API
- [ ] Token 管理正常

### Phase 3 測試（auth）
- [ ] 登入流程
- [ ] 註冊流程
- [ ] 密碼強度檢查
- [ ] Token 驗證
- [ ] 登出功能

### Phase 4 測試（components）
- [ ] CustomKeyboard 顯示和計算
- [ ] SwipeToDelete 滑動刪除
- [ ] LongPressMenu 長按選單

### Phase 5 測試（categories）
- [ ] 分類選擇器打開/關閉
- [ ] 切換大分類
- [ ] 選擇子分類
- [ ] 圖標正確顯示
- [ ] 編輯模式分類選擇

### Phase 6 測試（records + charts 一起測試）⚠️
因為 records 強依賴 charts，必須一起測試：
- [ ] 新增記帳
- [ ] 載入記錄列表
- [ ] 編輯記錄
- [ ] 刪除記錄（滑動、長按）
- [ ] 統計數據更新
- [ ] 圖表更新
- [ ] 數字動畫

### Phase 7 測試（budget）
- [ ] 載入預算
- [ ] 儲存預算
- [ ] 預算使用率顯示

### Phase 8 測試（router）
- [ ] 頁面切換
- [ ] 每個頁面的 onPageLoad
- [ ] 移動端導航欄
- [ ] 桌面側邊欄

### Phase 9 測試（整合）
- [ ] 完整用戶流程
- [ ] PWA 功能
- [ ] 所有功能點

## 🚨 關鍵風險點

1. **records.js 和 charts.js 強耦合** - 必須同時遷移或使用依賴注入
2. **Router 依賴所有模組** - 必須最後遷移
3. **組件實例需要傳遞** - CustomKeyboard, LongPressMenu
4. **Chart.js 實例管理** - 全局變數問題
5. **初始化順序錯誤** - 會導致 undefined 錯誤

## 建議的修正策略

### 選項 1: 分層遷移（更安全）
1. Phase 2: config + utils + api（基礎層）
2. Phase 3: auth（獨立功能）
3. Phase 4: components（UI 組件）
4. Phase 5: categories（分類系統）
5. **Phase 6: records + charts + budget 一起遷移**（避免循環依賴）
6. Phase 7: router（最後）
7. Phase 8: pwa（獨立）

### 選項 2: 重構後再遷移
先重構 records.js 和 charts.js 的耦合，使用依賴注入或事件系統解耦，然後再遷移。

---

**結論：模組化不只是拆分代碼，更重要的是理解依賴關係並正確處理它們。**
