# 前端模組化完整計劃

## 當前狀態
- **檔案**: `frontend/index.html`
- **行數**: 5221 行
- **函數數量**: ~50+ 個
- **事件綁定**: 43 個 addEventListener
- **HTML 事件**: 20+ 個 onclick/onsubmit

## 問題分析

### 之前失敗的原因
1. ❌ 沒有完整的功能清單盤點
2. ❌ 沒有識別所有需要暴露到 window 的函數
3. ❌ 沒有追蹤全局變數和它們的依賴關係
4. ❌ 一次性改動太大，難以定位問題
5. ❌ 沒有逐步測試機制

## 完整功能清單

### 1. 認證系統 (Auth)
- [x] 登入 (showLoginModal, loginForm submit handler)
- [x] 註冊 (showRegisterModal, registerForm submit handler)
- [x] 登出 (handleLogout)
- [x] Token 管理 (getAuthToken, setAuthToken, removeAuthToken, verifyToken)
- [x] 用戶資料 (getUserData, setUserData)
- [x] 密碼重置 (showForgotPasswordModal, submitForgotPassword, submitResetPassword)
- [x] 密碼強度驗證 (validatePasswordRealtime, validateChangePasswordRealtime)
- [x] 密碼 UI 更新 (updatePasswordStrengthUI, updateChangePasswordStrengthUI, updateCheck)
- [x] 13個密碼檢查項目（長度、大小寫、數字、特殊符號、重複、連續、鍵盤模式、常見密碼、個人資訊、拼音、數學模式、熵值）
- [x] 用戶顯示更新 (updateUserDisplay)
- [x] 模態框管理 (hideAuthModals)

### 2. 記帳記錄 (Records)
- [x] 新增記帳 (accountingForm submit handler)
- [x] 載入記錄 (loadAccountingRecords)
- [x] 編輯記錄 (openEditRecordModal, closeEditRecordModal, editRecordForm submit)
- [x] 刪除記錄 (deleteAccountingRecord - window 函數)
- [x] 滑動刪除 (SwipeToDelete class - 完整實現)
- [x] 長按選單 (LongPressMenu class - 完整實現)
- [x] 金額驗證 (validateAmount)
- [x] 日期設置 (setTodayAsDefault)
- [x] 篩選功能 (loadRecordsBtn, filter-type, filter-start-date, filter-end-date, filter-category)

### 3. 分類系統 (Categories)
- [x] 分類資料 (categoryData)
- [x] 分類選擇器 (openCategoryModal, closeCategoryModal)
- [x] 切換分類 (switchCategory)
- [x] 選擇分類 (selectCategory)
- [x] 編輯模式分類選擇 (openCategoryModalForEdit, selectCategoryForEdit)
- [x] 分類圖標 (getItemIcon)
- [x] 渲染分類 (renderCategoryModal)
- [x] 分類篩選器 (openFilterCategoryModal, closeFilterCategoryModal, selectFilterCategory)

### 4. 自定義組件 (Components)
- [x] 自定義鍵盤 (CustomKeyboard class)
- [x] 滑動刪除 (SwipeToDelete class)
- [x] 長按選單 (LongPressMenu class)
- [x] Toast 通知 (showToast)
- [x] 確認對話框 (showConfirm)

### 5. 統計與圖表 (Stats & Charts)
- [x] 統計資料更新 (updateAccountingStats)
- [x] 支出圖表 (updateExpenseChart - Chart.js instance management)
- [x] 趨勢圖表 (updateTrendsChart - Chart.js instance management)
- [x] 數字動畫 (animateNumber - requestAnimationFrame)
- [x] 樂觀更新 (applyOptimisticStats)
- [x] 統計應用 (applyStatsToDOM)
- [x] 精簡統計顯示 (compact-income, compact-expense, compact-balance)
- [x] Chart 實例管理 (expenseChart, trendsChart - destroy & recreate)

### 6. 預算管理 (Budget)
- [x] 載入預算 (loadBudget)
- [x] 儲存預算 (saveBudgetBtn click handler)
- [x] 預算使用率 (updateBudgetUsage)
- [x] 預算使用列表 (budget-usage-list, budget-usage-section)

### 7. 匯出功能 (Export)
- [x] 匯出 CSV (exportRecordsBtn click handler)

### 8. 設置頁面 (Settings)
- [x] 編輯使用者名稱 (toggleEditName, saveProfileName)
- [x] 修改密碼 (toggleChangePassword, saveNewPassword)

### 9. 路由系統 (Router)
- [x] Router class (完整實現 - 4562行開始)
  - navigate() - 頁面導航
  - onPageLoad() - 頁面載入事件
  - setAuthenticated() - 設置認證狀態
- [x] 頁面切換 (page-add, page-records, page-analytics, page-settings)
- [x] 移動端導航欄 (mobile-nav - 事件綁定)
- [x] 桌面側邊欄 (desktop-sidebar)

### 10. PWA 功能
**Service Worker:**
- [x] 註冊 Service Worker
- [x] 檢測更新
- [x] 自動重載機制
- [x] 控制器變更處理
- [x] 後台同步
- [x] 網路狀態監聽 (showNetworkStatus) — 含 online/offline 事件、MessageChannel 同步、Background Sync、EventBus 整合

**Android 安裝提示:**
- [x] shouldShowAndroidPrompt - 檢查顯示條件
- [x] showAndroidInstallPrompt - 顯示安裝提示
- [x] dismissAndroidPrompt - 關閉提示
- [x] triggerAndroidInstall - 觸發安裝流程

**iOS 安裝提示:**
- [x] isIOS - 檢測 iOS 設備
- [x] isInStandaloneMode - 檢測獨立模式
- [x] shouldShowIOSPrompt - 檢查顯示條件
- [x] showIOSInstallPrompt - 顯示安裝提示
- [x] dismissIOSPrompt - 關閉提示

### 11. 工具函數 (Utils)
- [x] API 調用 (apiCall - 含錯誤處理)
- [x] HTML 轉義 (escapeHtml)
- [x] 後端 URL 偵測 (detectBackendUrl, isDevelopment)
- [x] Toast 通知系統 (showToast - 4種類型)
- [x] 確認對話框 (showConfirm - Promise-based)

## 模組劃分策略

### 方案：按功能域劃分

```
frontend/
├── index.html (精簡版，只保留 HTML 結構和樣式)
├── js/
│   ├── main.js          # 主入口，初始化所有模組
│   ├── config.js        # 配置和常量 (backendUrl, categoryData)
│   ├── utils.js         # 工具函數 (escapeHtml, showToast, showConfirm)
│   ├── api.js           # API 調用封裝 (apiCall)
│   ├── auth.js          # 認證系統
│   ├── records.js       # 記帳記錄 CRUD
│   ├── categories.js    # 分類系統
│   ├── components.js    # UI 組件 (鍵盤、滑動、選單)
│   ├── charts.js        # 圖表功能
│   ├── budget.js        # 預算管理
│   ├── export.js        # 匯出功能
│   ├── settings.js      # 設置頁面
│   ├── router.js        # 路由系統
│   └── pwa.js           # PWA 功能
└── service-worker.js
```

## window 物件函數清單

**必須暴露到 window 的函數（用於 HTML onclick 等）：**

### 認證相關
- showLoginModal
- showRegisterModal
- showForgotPasswordModal
- submitForgotPassword
- submitResetPassword
- handleLogout

### 分類相關
- openCategoryModal
- closeCategoryModal
- switchCategory
- selectCategory
- openCategoryModalForEdit
- selectCategoryForEdit
- openFilterCategoryModal
- closeFilterCategoryModal
- selectFilterCategory

### 記錄相關
- openEditRecordModal
- closeEditRecordModal
- deleteAccountingRecord (window 函數，用於刪除)

### 設置相關
- toggleEditName
- toggleChangePassword
- saveProfileName
- saveNewPassword
- updateUserDisplay

### PWA 相關
- dismissAndroidPrompt
- triggerAndroidInstall
- dismissIOSPrompt
- shouldShowAndroidPrompt
- showAndroidInstallPrompt
- isIOS
- isInStandaloneMode
- shouldShowIOSPrompt
- showIOSInstallPrompt

### Router 相關（Router class 需要調用）
- loadAccountingRecords
- updateAccountingStats
- updateExpenseChart
- updateTrendsChart
- loadBudget

### 組件相關（可能需要暴露）
- CustomKeyboard instance
- SwipeToDelete class
- LongPressMenu instance

## 全局變數清單

### 需要在模組間共享的變數
- `backendUrl` (config.js)
- `categoryData` (config.js)
- `currentCategoryType` (categories.js - 內部變數)
- `currentMainCategory` (categories.js - 內部變數)
- `isEditMode` (categories.js - 內部變數)

### Chart 實例
- `expenseChart` (charts.js)
- `trendsChart` (charts.js)

### DOM 元素引用
- 各模組內部管理，不需全局

## 遷移步驟（逐步進行）

### Phase 1: 準備階段
1. ✅ 創建 `js/` 目錄
2. ✅ 創建所有模組文件骨架
3. ✅ 在每個文件中添加模組描述註釋

### Phase 2: 提取配置和工具（最少依賴）
1. ✅ 提取 `config.js` (backendUrl, categoryData, getItemIcon)
2. ✅ 提取 `utils.js` (escapeHtml, showToast, showConfirm)
3. ✅ 提取 `api.js` (apiCall, token 相關)
4. ✅ 測試：創建 test-basic.html 測試基礎功能

### Phase 3: 提取認證系統（獨立功能）
1. ✅ 提取 `auth.js` (所有認證相關函數)
2. ✅ 測試：測試登入、註冊、登出流程

### Phase 4: 提取 UI 組件（獨立功能）
1. ✅ 提取 `components.js` (CustomKeyboard, SwipeToDelete, LongPressMenu)
2. ✅ 測試：測試鍵盤、滑動、長按功能

### Phase 5: 提取分類系統
1. ✅ 提取 `categories.js` (所有分類相關函數)
2. ✅ 確保正確暴露到 window
3. ✅ 測試：測試分類選擇器

### Phase 6: 提取記帳記錄
1. ✅ 提取 `records.js` (CRUD 操作)
2. ✅ 依賴：categories.js, components.js
3. ✅ 測試：測試新增、編輯、刪除記錄

### Phase 7: 提取圖表功能
1. ✅ 提取 `charts.js` (圖表相關)
2. ✅ 測試：測試圖表顯示

### Phase 8: 提取其他功能
1. ✅ 提取 `budget.js`
2. ✅ 提取 `export.js`
3. ✅ 提取 `settings.js`
4. ✅ 測試各個功能

### Phase 9: 提取路由系統
1. ✅ 提取 `router.js`
2. ✅ 測試：測試頁面切換

### Phase 10: 整合和測試
1. ✅ 創建 `main.js` 整合所有模組
2. ✅ 更新 `index.html` 使用模組化版本
3. ✅ 全面測試所有功能
4. ✅ 更新 Service Worker

## 測試策略

### 每個 Phase 的測試
1. 創建獨立測試頁面 `test-phase-X.html`
2. 只加載當前 Phase 相關的模組
3. 測試該 Phase 的所有功能
4. 確認沒有錯誤後才進入下一個 Phase

### 最終測試清單
- [ ] 登入/註冊/登出
- [ ] 新增記帳記錄
- [ ] 編輯記帳記錄
- [ ] 刪除記帳記錄（滑動、長按）
- [ ] 分類選擇器
- [ ] 自定義鍵盤
- [ ] 篩選記錄
- [ ] 圖表顯示
- [ ] 預算管理
- [ ] 匯出 CSV
- [ ] 修改使用者名稱
- [ ] 修改密碼
- [ ] 頁面導航
- [ ] 移動端導航欄
- [ ] PWA 安裝提示

## 關鍵注意事項

### 1. 導入/導出規則
```javascript
// 導出函數
export function functionName() { ... }

// 導出常量
export const CONSTANT = value;

// 導入
import { functionName, CONSTANT } from '/js/module.js';
```

### 2. Window 暴露規則
```javascript
// 在模組末尾暴露需要給 HTML 使用的函數
window.functionName = functionName;
```

### 3. 事件監聽器綁定
```javascript
// 在模組初始化函數中綁定
export function initModule() {
    const button = document.getElementById('btn');
    if (button) {
        button.addEventListener('click', handleClick);
    }
}
```

### 4. 全局變數處理
```javascript
// 使用模組作用域變數，不要使用 window
let moduleVariable = null;

// 如果需要跨模組共享，通過導入/導出
export function getVariable() {
    return moduleVariable;
}
```

### 5. Chart.js 實例管理
```javascript
// 在 charts.js 中管理
let expenseChart = null;
let trendsChart = null;

export function getExpenseChart() {
    return expenseChart;
}
```

## 回滾計劃

如果遷移過程中出現問題：
1. 立即停止當前 Phase
2. 記錄出現的問題
3. 回退到上一個穩定的 Phase
4. 分析問題原因
5. 調整計劃後再嘗試

## 成功標準

### 功能完整性
- ✅ 所有功能正常運作
- ✅ 沒有 console 錯誤
- ✅ 用戶體驗無變化

### 代碼品質
- ✅ 模組職責清晰
- ✅ 依賴關係明確
- ✅ 代碼可維護性提升

### 性能
- ✅ 載入時間無明顯增加
- ✅ 運行性能無降低

## 下一步行動

1. **創建模組骨架** - 創建所有 .js 文件的空白模板
2. **Phase 2: 提取配置** - 從最簡單、依賴最少的開始
3. **逐步測試** - 每完成一個 Phase 就測試
4. **記錄問題** - 遇到問題立即記錄和解決
5. **保持溝通** - 每個 Phase 完成後與用戶確認

---

**重要原則：穩健優於快速，測試優於假設**
