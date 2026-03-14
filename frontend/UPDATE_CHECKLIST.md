# 前端更新檢查清單

## ⚠️ 每次更新前端時必須執行

### 1. 更新 Service Worker 版本號

📁 **檔案位置**：`frontend/service-worker.js` (第 14 行)

```javascript
const CACHE_NAME = 'accounting-system-v1.6.2';  // ← 記得更新這裡！
```

---

## 📊 語義化版本控制規則

我們使用 **Semantic Versioning**（語義化版本控制）格式：`v{major}.{minor}.{patch}`

### 版本號格式：`vX.Y.Z`

```
v1.2.3
│ │ │
│ │ └─ PATCH（修訂版本）：向下兼容的問題修正
│ └─── MINOR（次版本）：向下兼容的功能性新增
└───── MAJOR（主版本）：不兼容的 API 修改或重大更新
```

### 何時遞增各個版本號？

#### 🔴 MAJOR（主版本）- 重大更新

修改第一位數字，後面歸零：`v1.2.3` → `v2.0.0`

**使用時機**：
- ❌ 不兼容的 API 變更（breaking changes）
- 🏗️ 重大架構重構
- 🎨 完全重新設計的 UI/UX
- 🔄 資料庫結構重大變更

**範例**：
- 從單用戶系統改為多用戶系統
- 移除舊的 API 端點
- 改變資料格式導致不兼容

---

#### 🟡 MINOR（次版本）- 新功能

修改第二位數字，patch 歸零：`v1.2.3` → `v1.3.0`

**使用時機**：
- ✨ 新增功能（向下兼容）
- 📈 新增 API 端點
- 🎨 新增頁面或模組
- 🔧 新增配置選項

**範例**：
- 新增預算追蹤功能
- 新增圖表統計頁面
- 新增匯出功能
- 新增深色模式

---

#### 🟢 PATCH（修訂版本）- 修復與優化

修改第三位數字：`v1.2.3` → `v1.2.4`

**使用時機**：
- 🐛 Bug 修復
- ⚡ 效能優化
- 📝 文案修正
- 🎨 UI 微調（不影響功能）
- 🔒 安全性修補

**範例**：
- 修復登入按鈕無法點擊
- 優化載入速度
- 修正錯別字
- 修復 RWD 排版問題

---

## 🎯 實際操作範例

### 範例 1：修復 Bug

**情境**：修復刪除記錄時的權限錯誤

```javascript
// 修改前
const CACHE_NAME = 'accounting-system-v1.6.2';

// 修改後（PATCH +1）
const CACHE_NAME = 'accounting-system-v1.6.3';
```

**說明**：Bug 修復 → PATCH 版本 +1

---

### 範例 2：新增功能

**情境**：新增統計報表功能

```javascript
// 修改前
const CACHE_NAME = 'accounting-system-v1.6.3';

// 修改後（MINOR +1，PATCH 歸零）
const CACHE_NAME = 'accounting-system-v1.7.0';
```

**說明**：新功能且向下兼容 → MINOR 版本 +1

---

### 範例 3：重大更新

**情境**：完全重寫前端，從 Vanilla JS 改為 React

```javascript
// 修改前
const CACHE_NAME = 'accounting-system-v1.7.0';

// 修改後（MAJOR +1，後面歸零）
const CACHE_NAME = 'accounting-system-v2.0.0';
```

**說明**：不兼容的重大變更 → MAJOR 版本 +1

---

## 📋 版本記錄

追蹤每次更新的版本號：

| 版本 | 日期 | 類型 | 更新內容 |
|------|------|------|----------|
| v1.6.2 | 2026-03-14 | PATCH | 修復記錄顯示（Array.isArray）、SW 認證端點錯誤處理、密碼表單警告 |
| v1.6.0 ~ v1.6.1 | 2026-03-13 | MINOR/PATCH | 定期收支、主題切換、XSS 修復、重複驗證邏輯重構 |
| v1.5.1 | 2026-03-08 | MINOR | 前端重構模組化（js-refactored）、離線同步補全、模糊測試 |
| v1.3.7 ~ v1.5.0 | — | — | 中間版本未逐一記錄，詳見 git log |
| v1.3.6 | 2026-03-08 | PATCH | 安全加固、Bug 修復與文件改善 |
| v1.1.0 ~ v1.3.5 | — | — | 中間版本未逐一記錄，詳見 git log |
| v1.0.0 | 2026-02-16 | MAJOR | 採用語義化版本控制，改進自動更新機制 |
| v0.8.0 | 2026-02-16 | MINOR | 添加更新橫幅功能 |
| v0.7.0 | 2026-02-14 | MINOR | 添加離線功能支援 |

**當前版本**: `v1.6.2`
**下次更新**: 根據變更類型選擇 `v1.6.3`（修復）、`v1.7.0`（功能）或 `v2.0.0`（重大更新）

---

## 🔄 更新步驟

### 步驟 1：確定版本號

根據變更類型選擇：

```bash
# Bug 修復
v1.6.2 → v1.6.3

# 新增功能
v1.6.3 → v1.7.0

# 重大更新
v1.7.0 → v2.0.0
```

### 步驟 2：修改版本號

打開 `frontend/service-worker.js`，修改第 14 行：

```javascript
const CACHE_NAME = 'accounting-system-v1.6.3';  // ← 更新版本號
```

### 步驟 3：提交變更

```bash
git add frontend/service-worker.js
git commit -m "chore: bump version to v1.6.3"
git push
```

### 步驟 4：更新版本記錄

在本檔案的「版本記錄」表格中新增一行。

---

## 🧪 測試更新機制

### 本地測試

```bash
# 啟動本地伺服器
cd frontend
python -m http.server 8080
```

### 驗證步驟

1. 訪問 http://localhost:8080
2. 打開 Chrome DevTools → Console
3. 看到 "🔍 檢查是否有新版本..." 表示正常
4. 修改版本號並重新整理
5. 應該會看到更新橫幅出現

---

## 🚀 部署到 Zeabur

### 自動更新時機

- ✅ 用戶每次開啟 PWA 時立即檢查
- ✅ 每 30 分鐘自動檢查一次
- ✅ 發現新版本時顯示更新橫幅

### 部署後驗證

1. 訪問生產環境 URL
2. 打開 DevTools → Application → Service Workers
3. 確認新版本已註冊（檢查版本號）
4. 手動點擊 "Update" 按鈕測試

---

## 🚨 常見錯誤

### 錯誤 1：忘記更新版本號

**症狀**：用戶看不到更新，仍顯示舊版本
**解決**：更新 `CACHE_NAME` 並重新部署

---

### 錯誤 2：版本號格式錯誤

**錯誤範例**：
- ❌ `accounting-system-1.0.0` （缺少 v）
- ❌ `accounting-system-v1.0` （缺少 patch）
- ❌ `accounting-system-v1` （格式不完整）

**正確格式**：
- ✅ `accounting-system-v1.0.0`
- ✅ `accounting-system-v2.5.3`

---

### 錯誤 3：版本號邏輯錯誤

**錯誤範例**：
- ❌ `v1.0.0` → `v1.0.0.1` （不能有第四位）
- ❌ `v1.2.3` → `v1.3.4` （MINOR 更新時 PATCH 應該歸零）
- ❌ `v2.0.5` → `v2.0.4` （版本號不能倒退）

**正確做法**：
- ✅ `v1.0.0` → `v1.0.1` （PATCH +1）
- ✅ `v1.2.3` → `v1.3.0` （MINOR +1，PATCH 歸零）
- ✅ `v2.0.5` → `v2.0.6` （只能遞增）

---

### 錯誤 4：快取未清除

**症狀**：本地測試看到舊版本

**解決方法**：
1. DevTools → Application → Storage
2. 點擊 "Clear site data"
3. 重新整理頁面

或者使用無痕模式測試。

---

## 📚 參考資料

- [Semantic Versioning 規範](https://semver.org/lang/zh-TW/)
- [Service Worker 更新機制](https://developer.chrome.com/docs/workbox/service-worker-lifecycle/)
- [PWA 最佳實踐](https://web.dev/pwa-checklist/)

---

## 💡 快速決策表

| 變更類型 | 版本變化 | 範例 |
|---------|---------|------|
| 🐛 Bug 修復 | PATCH +1 | v1.6.2 → v1.6.3 |
| ⚡ 效能優化 | PATCH +1 | v1.6.3 → v1.6.4 |
| 📝 文案修正 | PATCH +1 | v1.6.4 → v1.6.5 |
| ✨ 新增小功能 | MINOR +1 | v1.6.5 → v1.7.0 |
| 📈 新增頁面 | MINOR +1 | v1.7.0 → v1.8.0 |
| 🎨 UI 重新設計 | MAJOR +1 | v1.8.0 → v2.0.0 |
| 🔄 架構重構 | MAJOR +1 | v2.0.0 → v3.0.0 |

**原則**：如果不確定，選擇較保守的版本號（PATCH 或 MINOR）。
