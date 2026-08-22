# E2E 測試完整指南

**版本:** 1.0.0
**建立日期:** 2026-02-28
**維護者:** Development Team

---

## 📋 目錄

1. [概述](#概述)
2. [測試架構](#測試架構)
3. [安裝與設定](#安裝與設定)
4. [執行測試](#執行測試)
5. [測試涵蓋範圍](#測試涵蓋範圍)
6. [撰寫測試](#撰寫測試)
7. [CI/CD 整合](#cicd-整合)
8. [故障排除](#故障排除)

---

## 概述

### 什麼是 E2E 測試？

端對端 (End-to-End, E2E) 測試模擬真實用戶操作，驗證整個應用程式的工作流程。

### 為什麼需要 E2E 測試？

✅ **確保功能完整性** - 驗證所有功能按預期運作
✅ **防止回歸錯誤** - 每次變更都能快速驗證
✅ **提升信心** - 部署前確保系統穩定性
✅ **文檔化行為** - 測試即文檔，說明系統預期行為

### 技術棧

- **測試框架**: Playwright
- **語言**: JavaScript (ES Modules)
- **瀏覽器**: Chromium, Firefox, WebKit
- **CI/CD**: GitHub Actions

---

## 測試架構

### 目錄結構

現行前端只有 `frontend/v2/`（舊版 `frontend/js-refactored/` 已整個移除），E2E 測試對應放在 `frontend/tests/e2e/v2/`：

```
frontend/
├── tests/
│   ├── e2e/
│   │   └── v2/                   # E2E 測試文件（現行 v2 前端）
│   │       ├── auth.spec.js      # 認證流程 (2 個測試)
│   │       ├── core.spec.js      # 核心流程：記帳/預算/發票/統計/主題/受限資金/更新提示 (13 個測試)
│   │       ├── dataVersion.spec.js  # 輕量更新檢查（資料版本閘門） (1 個測試)
│   │       ├── offline.spec.js   # 離線瀏覽/離線寫入同步/登出清快取 (4 個測試)
│   │       └── helpers.js        # 共用輔助函數（genUser/apiRegister/loginV2）
│   ├── unit/                     # 前端單元測試（node --test，非本文件範圍，見下方連結）
│   │   └── *.test.js
│   └── package.json              # NPM 配置
├── playwright.config.js          # Playwright 配置（位於 frontend/tests/ 下）
└── ...
```

> 前端單元測試（`frontend/tests/unit/`，Node 內建 `node --test`）不在本文件範圍，詳見 [`docs/FRONTEND_TESTING.md`](FRONTEND_TESTING.md)。

### 測試統計

| 測試套件 | 測試數量 | 涵蓋功能 |
|---------|---------|---------|
| auth.spec.js | 2 | 註冊並登入、錯誤憑證提示 |
| core.spec.js | 13 | 記一筆、編輯/刪除記錄、預算、發票輸入、統計/設定渲染、電腦版概覽與釘選、主題切換、受限資金拆分與解鎖、更新提示 Toast |
| dataVersion.spec.js | 1 | 資料版本閘門（未變不重抓、變更後立即重抓） |
| offline.spec.js | 4 | 離線快取渲染、離線記一筆回連同步、IndexedDB 舊版升級不卡住、登出清離線佇列 |
| **總計** | **20** | **v2 前端核心與離線流程** |

---

## 安裝與設定

### 1. 安裝 Node.js 依賴

```bash
cd frontend
npm install
```

這會安裝：
- `@playwright/test` - Playwright 測試框架
- `playwright` - Playwright 核心

### 2. 安裝 Playwright 瀏覽器

```bash
# 安裝所有瀏覽器
npx playwright install

# 或只安裝 Chromium
npx playwright install chromium

# 包含系統依賴
npx playwright install --with-deps
```

### 3. 驗證安裝

```bash
npx playwright --version
```

應該顯示類似：`Version 1.41.0`

---

## 執行測試

### 基本命令

```bash
# 執行所有測試
npm test

# 執行所有測試（完整命令）
npx playwright test
```

### 進階選項

```bash
# 以 headed 模式執行（顯示瀏覽器視窗）
npm run test:headed
npx playwright test --headed

# 使用 UI 模式執行
npm run test:ui
npx playwright test --ui

# 除錯模式
npm run test:debug
npx playwright test --debug

# 執行特定測試文件
npx playwright test e2e/v2/auth.spec.js --config frontend/tests/playwright.config.js

# 執行特定測試（使用名稱過濾）
npx playwright test --grep "使用者可以成功註冊"

# 只在 Chromium 上執行
npx playwright test --project=chromium

# 並行執行（4 個 worker）
npx playwright test --workers=4
```

### 查看測試報告

```bash
# 開啟 HTML 報告
npm run test:report
npx playwright show-report

# 測試報告位置
# frontend/playwright-report/index.html
```

---

## 測試涵蓋範圍

### 1. 認證流程測試 (auth.spec.js)

✅ 可透過 v2 UI 註冊並登入
✅ 錯誤憑證顯示錯誤訊息

### 2. 核心流程測試 (core.spec.js)

桌面外殼（viewport 1280×720），每個 spec 只註冊一次帳號（避開註冊速率限制），各測試各自登入、用不同金額避免互相干擾：

✅ 用計算機鍵盤記一筆，明細出現該筆
✅ 編輯記錄：改金額後明細更新
✅ 刪除記錄：確認後從明細消失
✅ 預算：設定分類預算後顯示
✅ 發票手動輸入：金額帶入記帳表單
✅ 統計 / 預算 / 設定 皆可渲染
✅ 電腦版預設落地在概覽，KPI 卡與四張卡渲染
✅ 概覽：釘選卡片放大，再點取消
✅ 概覽：釘選後從「查看完整頁」導向明細
✅ 主題切換並持久化到 localStorage
✅ 收入拆分受限資金：明細顯示、面板可見、可解鎖
✅ 偵測到新版本後跳出更新說明 Toast
✅ 首次載入（無上次版本記錄）不跳 Toast

### 3. 輕量更新檢查測試 (dataVersion.spec.js)

✅ 資料未變時切頁不重抓；寫入後版本改變、立即重抓並看到新資料

對應後端 `GET /admin/api/accounting/data-version` 簽章端點（見 `backend/routes/records.py` 的 `_compute_data_version()`），前端輪詢比對簽章決定是否重抓資料，避免多裝置間顯示過期資料。

### 4. 離線功能測試 (offline.spec.js)

✅ 離線 reload 仍能進入 App 並以快取渲染概覽
✅ 離線記一筆 → 顯示待同步 → 回連自動同步（Phase 2）
✅ 既有 v1 IndexedDB 升級被擋時，明細仍正常渲染（不卡載入中）
✅ 登出清除離線佇列，A 未同步的離線記錄不會流入下一位登入者 B 的帳戶

---

## 撰寫測試

### 測試結構

```javascript
import { test, expect } from '@playwright/test';

test.describe('功能模組測試', () => {

  test.beforeEach(async ({ page }) => {
    // 每個測試前執行（設置初始狀態）
  });

  test('應該執行某個操作', async ({ page }) => {
    // 1. 準備 (Arrange)
    // 2. 操作 (Act)
    // 3. 驗證 (Assert)
  });

  test.afterEach(async ({ page }) => {
    // 每個測試後執行（清理）
  });
});
```

### 使用輔助函數

現行共用輔助函數集中在單一檔案 `frontend/tests/e2e/v2/helpers.js`（不是舊版的 `helpers/` 目錄拆多檔）：

```javascript
import { test, expect } from '@playwright/test';
import { genUser, apiRegister, loginV2 } from './helpers.js';

test.describe('功能模組測試', () => {
  const user = genUser();

  // 整個 spec 只註冊一次（避開註冊速率限制），每個測試各自登入
  test.beforeAll(async () => { await apiRegister(user); });
  test.beforeEach(async ({ page }) => { await loginV2(page, user); });

  test('應該執行某個操作', async ({ page }) => {
    // ...實際操作與驗證
  });
});
```

### 最佳實踐

#### ✅ 好的做法

```javascript
// 使用有意義的測試名稱
test('使用者可以成功註冊並登入', async ({ page }) => {
  // ...
});

// 使用 Playwright 的自動等待
await expect(page.locator('.toast')).toBeVisible();

// 使用語意化選擇器
await page.click('button:has-text("登入")');

// 使用輔助函數避免重複
await loginUser(page, user);
```

#### ❌ 避免的做法

```javascript
// 不要使用模糊的測試名稱
test('test1', async ({ page }) => { ... });

// 不要使用固定等待時間
await page.waitForTimeout(5000); // ❌

// 不要使用脆弱的選擇器
await page.click('#btn-123'); // ❌

// 不要重複代碼
// 應該使用輔助函數
```

---

## CI/CD 整合

### GitHub Actions 工作流程

專案已配置自動化測試工作流程 (`.github/workflows/e2e-tests.yml`)

#### 觸發條件

- ✅ Push 到 `develop`, `release` 分支
- ✅ Pull Request 到 `main`, `develop` 分支
- ✅ 手動觸發 (workflow_dispatch)

Chromium 一律執行；Firefox 只在 Pull Request 或推送到 `release` 分支時額外執行（`e2e-tests-firefox` job）。

#### 測試環境

- **OS**: Ubuntu Latest
- **Node.js**: 20.x
- **Python**: 3.11
- **MongoDB**: 7.0 (Docker Service)
- **瀏覽器**: Chromium (一律執行), Firefox (PR / push to release)

#### 工作流程步驟

1. **Checkout 代碼**
2. **設置 Node.js 和 Python**
3. **安裝依賴**
4. **啟動 MongoDB 服務**
5. **啟動後端 API**
6. **啟動前端伺服器**
7. **執行 E2E 測試**
8. **上傳測試報告**
9. **留言 PR 測試結果**

#### 查看測試結果

1. 前往 GitHub Repository
2. 點擊 "Actions" 標籤
3. 選擇 "E2E Tests" 工作流程
4. 查看執行結果

#### 下載測試報告

在 Actions 頁面，點擊執行記錄，在 "Artifacts" 區域下載：
- `playwright-report` - HTML 測試報告
- `test-results` - JSON 測試結果

---

## 故障排除

### 常見問題

#### 1. 測試超時

**錯誤訊息:**
```
Timeout 30000ms exceeded
```

**解決方法:**
```javascript
// 增加特定測試的超時時間
test.setTimeout(60000);

// 或在 playwright.config.js 中全局設置
timeout: 60000
```

#### 2. 元素找不到

**錯誤訊息:**
```
Locator not found: button:has-text("登入")
```

**解決方法:**
```javascript
// 等待元素出現
await page.waitForSelector('button:has-text("登入")');

// 使用更寬鬆的選擇器
await page.click('button:has-text("登入"), button:has-text("Login")');

// 使用除錯模式查看實際 DOM
npm run test:debug
```

#### 3. 網路請求失敗

**錯誤訊息:**
```
net::ERR_CONNECTION_REFUSED
```

**解決方法:**
```bash
# 確認後端服務正在運行
curl http://localhost:5001/api/health

# 檢查 playwright.config.js 中的 baseURL 設置
baseURL: 'http://localhost:8080'
```

#### 4. MongoDB 連線失敗

**錯誤訊息:**
```
MongoServerError: Authentication failed
```

**解決方法:**
```bash
# 檢查 MongoDB 是否正在運行
docker ps | grep mongo

# 啟動 MongoDB
docker run -d -p 27017:27017 mongo:7.0

# 檢查環境變數
echo $MONGO_URI
```

#### 5. 測試不穩定 (Flaky)

**症狀:** 測試有時通過，有時失敗

**解決方法:**
```javascript
// 使用 Playwright 的自動等待，而非固定時間
await expect(page.locator('.toast')).toBeVisible();

// 增加重試次數
test.describe.configure({ retries: 2 });

// 使用更可靠的選擇器
await page.click('[data-testid="login-button"]');
```

### 除錯工具

#### Playwright Inspector

```bash
# 啟動除錯模式
npm run test:debug

# 或指定測試文件
npx playwright test --debug e2e/v2/auth.spec.js --config frontend/tests/playwright.config.js
```

功能：
- 逐步執行測試
- 查看元素選擇器
- 檢查 DOM 結構
- 查看網路請求

#### Playwright Trace Viewer

```bash
# 生成 trace
npx playwright test --trace on

# 查看 trace
npx playwright show-trace trace.zip
```

#### 截圖和錄影

測試失敗時會自動生成：
- **截圖**: `test-results/**/*.png`
- **錄影**: `test-results/**/*.webm`

---

## 附錄

### A. 完整測試清單

| 編號 | 測試名稱 | 測試文件 |
|-----|---------|---------|
| 1 | 可透過 v2 UI 註冊並登入 | auth.spec.js |
| 2 | 錯誤憑證顯示錯誤訊息 | auth.spec.js |
| 3 | 用計算機鍵盤記一筆，明細出現該筆 | core.spec.js |
| 4 | 編輯記錄：改金額後明細更新 | core.spec.js |
| 5 | 刪除記錄：確認後從明細消失 | core.spec.js |
| 6 | 預算：設定分類預算後顯示 | core.spec.js |
| 7 | 發票手動輸入：金額帶入記帳表單 | core.spec.js |
| 8 | 統計 / 預算 / 設定 皆可渲染 | core.spec.js |
| 9 | 電腦版預設落地在概覽，KPI 卡與四張卡渲染 | core.spec.js |
| 10 | 概覽：釘選卡片放大，再點取消 | core.spec.js |
| 11 | 概覽：釘選後從「查看完整頁」導向明細 | core.spec.js |
| 12 | 主題切換並持久化到 localStorage | core.spec.js |
| 13 | 收入拆分受限資金：明細顯示、面板可見、可解鎖 | core.spec.js |
| 14 | 偵測到新版本後跳出更新說明 Toast | core.spec.js |
| 15 | 首次載入（無上次版本記錄）不跳 Toast | core.spec.js |
| 16 | 資料未變時切頁不重抓；寫入後版本改變、立即重抓 | dataVersion.spec.js |
| 17 | 離線 reload 仍能進入 App 並以快取渲染概覽 | offline.spec.js |
| 18 | 離線記一筆 → 顯示待同步 → 回連自動同步 | offline.spec.js |
| 19 | 既有 v1 IndexedDB 升級被擋時，明細仍正常渲染 | offline.spec.js |
| 20 | 登出清除離線佇列，避免流入下一位登入者帳戶 | offline.spec.js |

### B. 測試資料參考

測試資料直接在各 spec 內用 `helpers.js` 的 `genUser()` 產生（隨機 email/密碼），沒有集中的 fixtures 檔案。

### C. 參考資料

- [Playwright 官方文檔](https://playwright.dev/)
- [測試最佳實踐](https://playwright.dev/docs/best-practices)
- [除錯指南](https://playwright.dev/docs/debug)
- [CI/CD 整合](https://playwright.dev/docs/ci)

---

**文件版本:** 2.0.0（改版對應 v2 前端 E2E 測試架構）
**最後更新:** 2026-08-22
**維護者:** Development Team
