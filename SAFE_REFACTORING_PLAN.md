# 安全重構測試計劃 - 原版本零風險

## 策略：並行開發，不影響穩定版本

### 文件結構
```
frontend/
├── index.html                    ← 穩定版本（不動！）✅
├── index-refactored.html         ← 測試版本（實驗重構）🧪
├── test-refactored.html          ← 單元測試頁面 🧪
├── service-worker.js             ← 穩定版本（不動！）✅
├── js-refactored/                ← 測試模組目錄 🧪
│   ├── events.js                 ← 新增：事件系統
│   ├── config.js                 ← 從 index.html 提取
│   ├── utils.js                  ← 從 index.html 提取
│   ├── api.js                    ← 從 index.html 提取
│   ├── auth.js                   ← 從 index.html 提取
│   ├── components.js             ← 從 index.html 提取
│   ├── categories.js             ← 從 index.html 提取
│   ├── records.js                ← 從 index.html 提取（重構為事件驅動）
│   ├── charts.js                 ← 從 index.html 提取（重構為事件驅動）
│   ├── budget.js                 ← 從 index.html 提取（重構為事件驅動）
│   ├── router.js                 ← 從 index.html 提取
│   ├── settings.js               ← 從 index.html 提取
│   ├── export.js                 ← 從 index.html 提取
│   ├── pwa.js                    ← 從 index.html 提取
│   └── main.js                   ← 主入口
└── css/
    └── ... (保持不變)
```

## 執行階段

### Phase 0: 準備測試環境（30分鐘）

#### 步驟 1: 複製穩定版本
```bash
cp frontend/index.html frontend/index-refactored.html
```

#### 步驟 2: 創建測試模組目錄
```bash
mkdir frontend/js-refactored
```

#### 步驟 3: 修改 index-refactored.html
```html
<!-- 在 index-refactored.html 最底部替換 <script> 為 -->
<script type="module" src="/js-refactored/main.js"></script>
```

#### 步驟 4: 創建測試頁面
```html
<!-- test-refactored.html -->
<!DOCTYPE html>
<html>
<head>
    <title>重構測試頁面</title>
</head>
<body>
    <h1>功能測試</h1>
    <div id="test-results"></div>
    <script type="module">
        import { EventBus } from '/js-refactored/events.js';

        // 測試事件系統
        EventBus.on('test:event', (data) => {
            console.log('✅ 事件系統正常:', data);
        });

        EventBus.emit('test:event', { message: 'Hello' });
    </script>
</body>
</html>
```

### Phase 1: 創建事件系統（1小時）

#### 步驟 1: 創建 events.js
```javascript
// frontend/js-refactored/events.js
/**
 * 事件總線 - 用於模組間解耦通信
 */
export const EventBus = {
    events: {},

    /**
     * 註冊事件監聽器
     */
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
        console.log(`📡 [EventBus] 註冊監聽: ${event}`);
    },

    /**
     * 發送事件
     */
    emit(event, data) {
        console.log(`🚀 [EventBus] 發送事件: ${event}`, data);
        if (this.events[event]) {
            this.events[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ [EventBus] 事件處理錯誤 ${event}:`, error);
                }
            });
        } else {
            console.warn(`⚠️ [EventBus] 沒有監聽器: ${event}`);
        }
    },

    /**
     * 移除事件監聽器
     */
    off(event, callback) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
            console.log(`🔇 [EventBus] 移除監聽: ${event}`);
        }
    },

    /**
     * 清除所有監聽器（測試用）
     */
    clear() {
        this.events = {};
        console.log(`🧹 [EventBus] 清除所有監聽器`);
    },

    /**
     * 獲取所有事件（調試用）
     */
    getEvents() {
        return Object.keys(this.events);
    }
};

/**
 * 事件常量 - 集中管理所有事件名稱
 */
export const EVENTS = {
    // 記帳記錄事件
    RECORD_ADDED: 'record:added',
    RECORD_UPDATED: 'record:updated',
    RECORD_DELETED: 'record:deleted',
    RECORDS_LOADED: 'records:loaded',

    // 統計事件
    STATS_UPDATED: 'stats:updated',
    STATS_REQUEST_UPDATE: 'stats:request-update',

    // 圖表事件
    CHART_UPDATE_EXPENSE: 'chart:update-expense',
    CHART_UPDATE_TRENDS: 'chart:update-trends',

    // 預算事件
    BUDGET_LOADED: 'budget:loaded',
    BUDGET_UPDATED: 'budget:updated',
    BUDGET_USAGE_UPDATE: 'budget:usage-update',

    // 認證事件
    AUTH_LOGIN_SUCCESS: 'auth:login-success',
    AUTH_LOGOUT: 'auth:logout',

    // UI 事件
    UI_SHOW_TOAST: 'ui:show-toast',
    UI_SHOW_CONFIRM: 'ui:show-confirm'
};
```

#### 步驟 2: 測試事件系統
```html
<!-- test-refactored.html -->
<script type="module">
import { EventBus, EVENTS } from '/js-refactored/events.js';

// 測試 1: 基本發送/接收
console.log('=== 測試 1: 基本發送/接收 ===');
EventBus.on(EVENTS.RECORD_ADDED, (data) => {
    console.log('✅ 收到記錄新增事件:', data);
});
EventBus.emit(EVENTS.RECORD_ADDED, { type: 'expense', amount: 100 });

// 測試 2: 多個監聽器
console.log('=== 測試 2: 多個監聽器 ===');
EventBus.on(EVENTS.RECORD_DELETED, () => console.log('✅ 監聽器1'));
EventBus.on(EVENTS.RECORD_DELETED, () => console.log('✅ 監聽器2'));
EventBus.emit(EVENTS.RECORD_DELETED, {});

// 測試 3: 移除監聽器
console.log('=== 測試 3: 移除監聽器 ===');
const handler = () => console.log('✅ 應該被移除');
EventBus.on(EVENTS.RECORD_UPDATED, handler);
EventBus.off(EVENTS.RECORD_UPDATED, handler);
EventBus.emit(EVENTS.RECORD_UPDATED, {}); // 應該沒有輸出

console.log('所有事件:', EventBus.getEvents());
</script>
```

### Phase 2: 提取基礎模組（2小時）

按照依賴順序提取，每個都要測試：

1. **config.js** - 配置和常量
2. **utils.js** - 工具函數
3. **api.js** - API 調用

每個模組提取後，在 test-refactored.html 中測試。

### Phase 3: 重構關鍵模組（4-5小時）

#### 步驟 1: 在 index-refactored.html 中重構 deleteRecord

**原始代碼（緊耦合）：**
```javascript
async function deleteRecord() {
    // ... API 調用
    await loadAccountingRecords();     // ❌ 直接調用
    await updateAccountingStats();     // ❌ 直接調用
    applyOptimisticStats();            // ❌ 直接調用
}
```

**重構為事件驅動：**
```javascript
async function deleteRecord() {
    // ... API 調用
    EventBus.emit(EVENTS.RECORD_DELETED, { type, amount });  // ✅ 發送事件
}

// 在 records 部分監聽
EventBus.on(EVENTS.RECORD_DELETED, () => {
    loadAccountingRecords();
});

// 在 charts 部分監聽
EventBus.on(EVENTS.RECORD_DELETED, () => {
    updateAccountingStats();
});

EventBus.on(EVENTS.RECORD_DELETED, (data) => {
    applyOptimisticStats('delete', data.type, data.amount);
});
```

#### 步驟 2: 測試重構後的功能
```javascript
// 在 test-refactored.html 中
// 模擬刪除記錄
EventBus.emit(EVENTS.RECORD_DELETED, { type: 'expense', amount: 100 });

// 驗證所有監聽器是否被調用
// （通過 console.log 或實際測試功能）
```

#### 步驟 3: 逐步重構其他函數
- addRecord → EVENTS.RECORD_ADDED
- updateRecord → EVENTS.RECORD_UPDATED
- loadAccountingRecords → EVENTS.RECORDS_LOADED

### Phase 4: 提取到模組（2-3小時）

當 index-refactored.html 中的重構測試通過後，才開始提取到模組。

```javascript
// frontend/js-refactored/records.js
import { EventBus, EVENTS } from '/js-refactored/events.js';

export async function deleteRecord(recordId, type, amount) {
    // ... API 調用
    EventBus.emit(EVENTS.RECORD_DELETED, { type, amount });
}
```

## 測試檢查清單

### ✅ 每個階段的測試

#### Phase 0 測試
- [ ] index-refactored.html 可以訪問
- [ ] test-refactored.html 可以訪問
- [ ] 原版 index.html 保持不變

#### Phase 1 測試（事件系統）
- [ ] EventBus.on 可以註冊監聽器
- [ ] EventBus.emit 可以觸發事件
- [ ] EventBus.off 可以移除監聽器
- [ ] 多個監聽器可以同時響應
- [ ] 事件數據正確傳遞

#### Phase 2 測試（基礎模組）
- [ ] config.js 正確導出 backendUrl
- [ ] config.js 正確導出 categoryData
- [ ] utils.js 的 showToast 正常工作
- [ ] api.js 的 apiCall 可以調用 API

#### Phase 3 測試（重構功能）
- [ ] 刪除記錄觸發正確事件
- [ ] 新增記錄觸發正確事件
- [ ] 統計數據正確更新
- [ ] 圖表正確更新
- [ ] 預算正確更新

#### Phase 4 測試（模組提取）
- [ ] 所有模組可以正確導入
- [ ] 功能與原版一致
- [ ] 沒有 console 錯誤
- [ ] 性能沒有明顯下降

## 對比測試方法

### 並行運行測試
```javascript
// 創建對比測試腳本
// 同時測試原版和重構版，確保結果一致

// 測試 1: 新增記錄
// 原版: 在 index.html 中新增記錄
// 重構版: 在 index-refactored.html 中新增記錄
// 對比: 兩者的統計數據應該一致

// 測試 2: 刪除記錄
// 原版: 在 index.html 中刪除記錄
// 重構版: 在 index-refactored.html 中刪除記錄
// 對比: 兩者的統計數據應該一致
```

## 回滾策略

任何階段出現問題：
1. **立即停止** - 不繼續下一階段
2. **記錄問題** - 在 ISSUES.md 中記錄
3. **保持穩定** - 原版本 index.html 始終可用
4. **分析原因** - 理解為什麼失敗
5. **調整策略** - 修改測試計劃

## 成功標準

### 最終驗證（所有測試都通過後）
- [ ] 所有功能正常
- [ ] 性能無明顯下降
- [ ] 沒有 console 錯誤
- [ ] 代碼更清晰易維護
- [ ] 模組可獨立測試

### 整合時機
**只有在以上所有測試都通過後，才考慮：**
1. 將 js-refactored/ 重命名為 js/
2. 將 index-refactored.html 的模組引用整合到 index.html
3. 更新 service-worker.js 版本
4. 部署到生產環境

## 風險控制

### 零風險保證
1. ✅ **原版本永遠可用** - index.html 不動
2. ✅ **獨立測試環境** - index-refactored.html 隔離
3. ✅ **隨時可回退** - 刪除測試文件即可
4. ✅ **逐步驗證** - 每步都測試通過才繼續
5. ✅ **對比測試** - 確保重構版和原版行為一致

## 時間規劃

| 階段 | 時間 | 可中斷 |
|------|------|--------|
| Phase 0: 準備 | 30分鐘 | ✅ |
| Phase 1: 事件系統 | 1小時 | ✅ |
| Phase 2: 基礎模組 | 2小時 | ✅ |
| Phase 3: 重構功能 | 4-5小時 | ✅ |
| Phase 4: 模組提取 | 2-3小時 | ✅ |
| 總計 | 9.5-11.5小時 | - |

**每個階段都可以中斷，不影響穩定版本！**

## 下一步行動

準備好開始了嗎？我建議：

1. **先執行 Phase 0** - 準備測試環境（30分鐘）
2. **查看效果** - 確認測試環境可用
3. **再決定繼續** - 或者調整計劃

開始嗎？
