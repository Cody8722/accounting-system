# 前端 E2E 測試

## 📋 概述

本專案使用 Playwright 進行端對端 (E2E) 測試，涵蓋所有關鍵使用者流程。

## 🚀 快速開始

### 安裝依賴

```bash
cd frontend
npm install
```

### 安裝 Playwright 瀏覽器

```bash
npx playwright install
```

## 🧪 執行測試

### 執行所有測試

```bash
npm test
```

### 執行特定測試文件

```bash
npx playwright test tests/e2e/auth.spec.js
```

### 以 headed 模式執行（顯示瀏覽器視窗）

```bash
npm run test:headed
```

### 使用 UI 模式執行

```bash
npm run test:ui
```

### 除錯模式

```bash
npm run test:debug
```

### 查看測試報告

```bash
npm run test:report
```

## 📁 測試結構

```
frontend/
├── tests/
│   ├── e2e/                      # E2E 測試文件
│   │   ├── auth.spec.js          # 認證流程測試
│   │   ├── records.spec.js       # 記帳 CRUD 測試
│   │   ├── budget-stats.spec.js  # 預算與統計測試
│   │   └── settings.spec.js      # 設定頁面測試
│   ├── helpers/                  # 測試輔助函數
│   │   ├── auth.helpers.js       # 認證相關輔助函數
│   │   ├── record.helpers.js     # 記帳相關輔助函數
│   │   └── wait.helpers.js       # 等待相關輔助函數
│   └── fixtures/                 # 測試資料
│       └── test-data.js          # 測試資料定義
├── playwright.config.js          # Playwright 配置
└── package.json                  # NPM 配置
```

## 🎯 測試涵蓋範圍

### ✅ 認證流程 (auth.spec.js)
- 使用者註冊與登入
- 弱密碼驗證
- 無效 Email 驗證
- 登出功能
- 錯誤憑證處理
- 受保護頁面重定向
- 記住我功能

### ✅ 記帳記錄 (records.spec.js)
- 新增支出記錄
- 新增收入記錄
- 編輯記錄
- 刪除記錄
- 篩選記錄
- 無效金額驗證

### ✅ 預算與統計 (budget-stats.spec.js)
- 設定預算
- 查看統計資料
- 支出圓餅圖
- 趨勢折線圖
- 預算警告
- 即時統計更新
- CSV 匯出

### ✅ 設定頁面 (settings.spec.js)
- 修改個人資料
- 修改密碼
- 弱密碼拒絕
- 密碼不一致驗證
- 用戶資訊顯示

## 🌐 支援的瀏覽器

- ✅ Chromium (Chrome/Edge)
- ✅ Firefox
- ✅ WebKit (Safari)
- ✅ Mobile Chrome (Pixel 5)
- ✅ Mobile Safari (iPhone 12)

## 📊 測試報告

測試執行後會生成以下報告：

- **HTML 報告**: `playwright-report/index.html`
- **JSON 結果**: `test-results/results.json`
- **截圖**: `test-results/` (僅失敗的測試)
- **錄影**: `test-results/` (僅失敗的測試)

## 🔧 配置

### 環境變數

可以通過環境變數自訂測試配置：

```bash
# 設定後端 URL
BASE_URL=http://localhost:8080 npm test

# 設定測試超時時間
TIMEOUT=60000 npm test
```

### Playwright 配置

主要配置在 `playwright.config.js` 中：

- **測試目錄**: `./tests/e2e`
- **超時時間**: 30 秒
- **重試次數**: CI 環境 2 次，本地 0 次
- **截圖**: 僅失敗時
- **錄影**: 僅失敗時保留
- **追蹤**: 第一次重試時啟用

## 🏃 CI/CD 整合

### GitHub Actions

專案已配置 GitHub Actions 工作流程 (`.github/workflows/e2e-tests.yml`)：

- **觸發條件**: Push 到 main/develop/claude/** 分支，或 PR
- **測試環境**: Ubuntu Latest + MongoDB 7.0
- **瀏覽器**: Chromium (預設), Firefox (PR/main)
- **報告**: 自動上傳測試報告和結果

### 查看 CI 測試結果

1. 前往 GitHub Actions 標籤
2. 選擇 "E2E Tests" 工作流程
3. 查看測試結果和下載報告

## 📝 撰寫測試

### 基本測試範例

```javascript
import { test, expect } from '@playwright/test';
import { registerUser, loginUser } from '../helpers/auth.helpers.js';

test('使用者可以新增記帳記錄', async ({ page }) => {
  // 準備：註冊並登入
  const user = generateTestUser();
  await registerUser(page, user);
  await loginUser(page, user);

  // 操作：新增記錄
  await page.goto('/#dashboard');
  await page.click('button:has-text("新增記帳")');
  await page.fill('input#amount', '100');
  await page.click('button:has-text("確認")');

  // 驗證：檢查結果
  await expect(page.locator('.swal2-success')).toBeVisible();
});
```

### 使用輔助函數

```javascript
import { addRecord } from '../helpers/record.helpers.js';
import { sampleRecords } from '../fixtures/test-data.js';

test('使用輔助函數新增記錄', async ({ page }) => {
  await addRecord(page, sampleRecords.expense.lunch);
  // 記錄已新增，繼續測試其他功能
});
```

## 🐛 故障排除

### 測試超時

如果測試經常超時，可以：

1. 增加超時時間：`test.setTimeout(60000)`
2. 檢查網路連線
3. 確認後端服務正常運行

### 元素找不到

1. 使用 `page.waitForSelector()` 等待元素出現
2. 檢查選擇器是否正確
3. 使用 Playwright Inspector 除錯：`npm run test:debug`

### 測試不穩定 (Flaky)

1. 使用 Playwright 的自動等待機制
2. 避免使用 `waitForTimeout()`
3. 增加重試次數

## 📚 更多資源

- [Playwright 官方文檔](https://playwright.dev/)
- [測試最佳實踐](https://playwright.dev/docs/best-practices)
- [除錯指南](https://playwright.dev/docs/debug)
- [CI/CD 整合](https://playwright.dev/docs/ci)

## 🤝 貢獻

撰寫新測試時請遵循：

1. 使用描述性的測試名稱
2. 使用輔助函數避免重複代碼
3. 確保測試獨立且可重複執行
4. 為新功能添加相應的測試

## 📄 授權

MIT License
