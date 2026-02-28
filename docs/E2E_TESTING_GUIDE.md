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

```
frontend/
├── tests/
│   ├── e2e/                      # E2E 測試文件
│   │   ├── auth.spec.js          # 認證流程 (7 個測試)
│   │   ├── records.spec.js       # 記帳 CRUD (6 個測試)
│   │   ├── budget-stats.spec.js  # 預算統計 (8 個測試)
│   │   └── settings.spec.js      # 設定頁面 (5 個測試)
│   ├── helpers/                  # 測試輔助函數
│   │   ├── auth.helpers.js       # 認證相關 (7 個函數)
│   │   ├── record.helpers.js     # 記帳相關 (5 個函數)
│   │   └── wait.helpers.js       # 等待相關 (6 個函數)
│   └── fixtures/                 # 測試資料
│       └── test-data.js          # 測試資料定義
├── playwright.config.js          # Playwright 配置
├── package.json                  # NPM 配置
└── README.md                     # 測試說明文檔
```

### 測試統計

| 測試套件 | 測試數量 | 涵蓋功能 |
|---------|---------|---------|
| auth.spec.js | 7 | 註冊、登入、登出、驗證 |
| records.spec.js | 6 | 新增、編輯、刪除、篩選 |
| budget-stats.spec.js | 8 | 預算設定、統計、圖表、匯出 |
| settings.spec.js | 5 | 個人資料、密碼修改 |
| **總計** | **26** | **所有核心功能** |

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
npx playwright test tests/e2e/auth.spec.js

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

✅ **測試 1**: 使用者可以成功註冊並登入
```javascript
// 流程: 註冊 → 驗證成功訊息 → 跳轉登入 → 登入 → 驗證儀表板
```

✅ **測試 2**: 弱密碼應該被拒絕
```javascript
// 測試密碼: '123456', 'password', 'abc123' 等
```

✅ **測試 3**: 無效的 Email 應該被拒絕
```javascript
// 測試 Email: 'invalid', 'invalid@', '@example.com' 等
```

✅ **測試 4**: 使用者可以登出
```javascript
// 流程: 登入 → 設定頁 → 登出 → 驗證跳轉 → 驗證 token 清除
```

✅ **測試 5**: 錯誤的憑證無法登入

✅ **測試 6**: 未登入時訪問受保護頁面應跳轉到登入頁

✅ **測試 7**: 記住我功能應正常運作

### 2. 記帳記錄測試 (records.spec.js)

✅ **測試 1**: 使用者可以新增支出記錄
✅ **測試 2**: 使用者可以新增收入記錄
✅ **測試 3**: 使用者可以編輯記錄
✅ **測試 4**: 使用者可以刪除記錄
✅ **測試 5**: 使用者可以篩選記錄
✅ **測試 6**: 無效的金額應該被拒絕

### 3. 預算與統計測試 (budget-stats.spec.js)

✅ **測試 1**: 使用者可以設定預算
✅ **測試 2**: 統計頁面應顯示正確的收支統計
✅ **測試 3**: 支出圓餅圖應正確顯示
✅ **測試 4**: 趨勢折線圖應正確顯示
✅ **測試 5**: 預算警告應正確顯示
✅ **測試 6**: 儀表板應顯示即時統計資料
✅ **測試 7**: 新增記錄後統計應自動更新
✅ **測試 8**: 匯出 CSV 功能應正常運作

### 4. 設定頁面測試 (settings.spec.js)

✅ **測試 1**: 使用者可以修改個人資料名稱
✅ **測試 2**: 使用者可以修改密碼
✅ **測試 3**: 弱密碼應被拒絕
✅ **測試 4**: 密碼不一致應被拒絕
✅ **測試 5**: 設定頁面應顯示用戶資訊

---

## 撰寫測試

### 測試結構

```javascript
import { test, expect } from '@playwright/test';
import { helperFunction } from '../helpers/helper.js';

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

```javascript
import { registerUser, loginUser } from '../helpers/auth.helpers.js';
import { addRecord } from '../helpers/record.helpers.js';

test('完整流程測試', async ({ page }) => {
  // 使用輔助函數簡化測試
  const user = generateTestUser();
  await registerUser(page, user);
  await loginUser(page, user);
  await addRecord(page, sampleRecords.expense.lunch);

  // 驗證結果
  await expect(page.locator('.record-item')).toContainText('午餐');
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

- ✅ Push 到 `main`, `develop`, `claude/**` 分支
- ✅ Pull Request 到 `main`, `develop` 分支
- ✅ 手動觸發 (workflow_dispatch)

#### 測試環境

- **OS**: Ubuntu Latest
- **Node.js**: 20.x
- **Python**: 3.11
- **MongoDB**: 7.0 (Docker Service)
- **瀏覽器**: Chromium (預設), Firefox (PR/main)

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
npx playwright test --debug tests/e2e/auth.spec.js
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

| 編號 | 測試名稱 | 測試文件 | 優先級 |
|-----|---------|---------|--------|
| 1 | 使用者可以成功註冊並登入 | auth.spec.js | P0 |
| 2 | 弱密碼應該被拒絕 | auth.spec.js | P0 |
| 3 | 使用者可以登出 | auth.spec.js | P0 |
| 4 | 錯誤的憑證無法登入 | auth.spec.js | P0 |
| 5 | 未登入時訪問受保護頁面應跳轉 | auth.spec.js | P0 |
| 6 | 使用者可以新增支出記錄 | records.spec.js | P0 |
| 7 | 使用者可以新增收入記錄 | records.spec.js | P0 |
| 8 | 使用者可以編輯記錄 | records.spec.js | P0 |
| 9 | 使用者可以刪除記錄 | records.spec.js | P0 |
| 10 | 使用者可以設定預算 | budget-stats.spec.js | P0 |
| 11 | 統計頁面應顯示正確的收支統計 | budget-stats.spec.js | P0 |
| 12 | 支出圓餅圖應正確顯示 | budget-stats.spec.js | P1 |
| 13 | 趨勢折線圖應正確顯示 | budget-stats.spec.js | P1 |
| 14 | 使用者可以修改個人資料 | settings.spec.js | P1 |
| 15 | 使用者可以修改密碼 | settings.spec.js | P0 |
| 16-26 | ... | ... | ... |

### B. 測試資料參考

詳見 `frontend/tests/fixtures/test-data.js`

### C. 參考資料

- [Playwright 官方文檔](https://playwright.dev/)
- [測試最佳實踐](https://playwright.dev/docs/best-practices)
- [除錯指南](https://playwright.dev/docs/debug)
- [CI/CD 整合](https://playwright.dev/docs/ci)

---

**文件版本:** 1.0.0
**最後更新:** 2026-02-28
**維護者:** Development Team
**下次審查:** 2026-03-28
