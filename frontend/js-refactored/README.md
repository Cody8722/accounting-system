# JS 重構測試模組目錄

⚠️ **注意：這是測試目錄，不影響穩定版本！**

## 目錄用途

此目錄用於測試前端模組化重構，採用事件驅動架構解決循環依賴問題。

## 當前狀態

### ✅ 已完成
- Phase 0: 測試環境準備
- Phase 1: 事件系統測試 - 通過 ✅
- Phase 2: 基礎模組提取 - 完成 ✅
  - config.js: 配置和常量
  - utils.js: 工具函數
  - api.js: API 調用

### 🧪 進行中
- Phase 2: 測試驗證中

### ⏳ 待完成
- Phase 3: 功能模組重構 (auth, components, categories)
- Phase 4: 核心模組遷移 (records, charts, budget)
- Phase 5: 路由和其他模組

## 測試方式

### 1. 訪問測試頁面
```
http://localhost/test-refactored.html
```

### 2. Phase 1: 執行事件系統測試
點擊「Phase 1: 事件系統測試」下的「▶ 執行測試」按鈕。

### 3. Phase 2: 執行基礎模組測試
點擊「Phase 2: 基礎模組測試」下的「▶ 執行測試」按鈕。

### 4. 對比測試
- 穩定版本: http://localhost/ (index.html)
- 測試版本: http://localhost/index-refactored.html

## 文件結構

```
frontend/
├── index.html                    ← 穩定版本（不動！）
├── index-refactored.html         ← 測試版本
├── test-refactored.html          ← 測試頁面
└── js-refactored/                ← 測試模組
    ├── README.md                 ← 本文件
    ├── events.js                 ← 事件系統 ✅
    ├── config.js                 ← 配置和常量 ✅
    ├── utils.js                  ← 工具函數 ✅
    ├── api.js                    ← API 調用 ✅
    ├── auth.js                   ← 待創建
    ├── components.js             ← 待創建
    ├── categories.js             ← 待創建
    ├── records.js                ← 待創建
    ├── charts.js                 ← 待創建
    ├── budget.js                 ← 待創建
    ├── router.js                 ← 待創建
    ├── settings.js               ← 待創建
    ├── export.js                 ← 待創建
    ├── pwa.js                    ← 待創建
    └── main.js                   ← 待創建
```

## 事件系統使用示例

```javascript
import { EventBus, EVENTS } from '/js-refactored/events.js';

// 發送事件
EventBus.emit(EVENTS.RECORD_ADDED, {
    type: 'expense',
    amount: 100
});

// 監聽事件
EventBus.on(EVENTS.RECORD_ADDED, (data) => {
    console.log('記錄新增:', data);
});
```

## 開發原則

1. **不修改穩定版本** - index.html 保持不變
2. **逐步測試** - 每個模組都要通過測試才繼續
3. **事件驅動** - 使用 EventBus 解耦模組
4. **獨立可測** - 每個模組都可以獨立測試
5. **隨時回退** - 出問題立即停止

## 當前進度

📊 總體進度: 30%
- ✅ Phase 0 完成（測試環境）
- ✅ Phase 1 完成（事件系統）
- ✅ Phase 2 完成（基礎模組）
- ⏳ Phase 3-5 待開始

## 注意事項

- 測試版本使用 `/js-refactored/` 目錄
- 穩定版本不受任何影響
- 所有測試都在隔離環境中進行
- 只有全部測試通過後才整合到主版本
