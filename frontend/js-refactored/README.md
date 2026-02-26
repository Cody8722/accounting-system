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
- Phase 3: 功能模組完成 - 完成 ✅
  - auth.js: 認證系統 (850+ 行)
  - components.js: UI 組件 (740+ 行)
  - categories.js: 分類選擇器 (200+ 行)
- Phase 4: 核心模組完成 - 完成 ✅
  - records.js: 記錄管理 (343 行)
  - charts.js: 圖表渲染 (290+ 行)
  - budget.js: 預算管理 (235+ 行)
- Phase 5: 整合與附加模組 - 完成 ✅
  - stats.js: 統計數據 (260+ 行)
  - export.js: CSV 匯出 (100+ 行)
  - settings.js: 個人設定 (320+ 行)
  - pwa.js: PWA 功能 (220+ 行)
  - main.js: 主程式入口 (150+ 行)

### 🎉 全部完成
- ✅ index-refactored.html 已創建（完整應用頁面）

### 🧪 待測試
- 端到端功能測試
- 性能對比測試
- 與 index.html 行為對比

## 測試方式

### 1. 訪問測試頁面
```
http://localhost/test-refactored.html
```

### 2. Phase 1: 執行事件系統測試
點擊「Phase 1: 事件系統測試」下的「▶ 執行測試」按鈕。

### 3. Phase 2: 執行基礎模組測試
點擊「Phase 2: 基礎模組測試」下的「▶ 執行測試」按鈕。

### 4. Phase 3: 執行功能模組測試
點擊「Phase 3: 功能模組測試」下的「▶ 執行測試」按鈕。

### 5. Phase 4: 執行核心模組測試
點擊「Phase 4: 核心模組測試」下的「▶ 執行測試」按鈕。

### 6. 對比測試
- 穩定版本: http://localhost/ (index.html)
- 測試版本: http://localhost/index-refactored.html

## 文件結構

```
frontend/
├── index.html                    ← 穩定版本（不動！）
├── index-refactored.html         ← 測試版本（待創建）
├── test-refactored.html          ← 測試頁面 ✅
└── js-refactored/                ← 測試模組
    ├── README.md                 ← 本文件 ✅
    ├── events.js                 ← 事件系統 ✅
    ├── config.js                 ← 配置和常量 ✅
    ├── utils.js                  ← 工具函數 ✅
    ├── api.js                    ← API 調用 ✅
    ├── auth.js                   ← 認證系統 ✅
    ├── components.js             ← UI 組件 ✅
    ├── categories.js             ← 分類選擇器 ✅
    ├── records.js                ← 記錄管理 ✅
    ├── charts.js                 ← 圖表渲染 ✅
    ├── budget.js                 ← 預算管理 ✅
    ├── stats.js                  ← 統計數據 ✅
    ├── export.js                 ← CSV 匯出 ✅
    ├── settings.js               ← 個人設定 ✅
    ├── pwa.js                    ← PWA 功能 ✅
    └── main.js                   ← 主程式入口 ✅
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

📊 總體進度: 100% 🎉
- ✅ Phase 0 完成（測試環境）
- ✅ Phase 1 完成（事件系統）
- ✅ Phase 2 完成（基礎模組：config, utils, api）
- ✅ Phase 3 完成（功能模組：auth, components, categories）
- ✅ Phase 4 完成（核心模組：records, charts, budget）
- ✅ Phase 5 完成（統計、匯出、設定、PWA、主程式）
- ✅ index-refactored.html 完成（完整應用頁面）
- 🧪 端到端測試中

## 注意事項

- 測試版本使用 `/js-refactored/` 目錄
- 穩定版本不受任何影響
- 所有測試都在隔離環境中進行
- 只有全部測試通過後才整合到主版本
