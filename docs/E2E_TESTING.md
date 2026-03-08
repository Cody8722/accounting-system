# 端對端測試 (E2E) 實施指南

**專案:** 個人記帳系統 E2E 測試
**工具:** Playwright
**版本:** 1.0
**日期:** 2026-02-28

---

## 📑 目錄

1. [為什麼選擇 Playwright](#為什麼選擇-playwright)
2. [環境建置](#環境建置)
3. [測試架構](#測試架構)
4. [Page Object Model](#page-object-model)
5. [測試範例](#測試範例)
6. [最佳實踐](#最佳實踐)
7. [CI/CD 整合](#cicd-整合)
8. [故障排除](#故障排除)

---

## 為什麼選擇 Playwright

### Playwright vs Selenium vs Cypress

| 特性 | Playwright | Cypress | Selenium |
|------|-----------|---------|----------|
| **速度** | ⚡⚡⚡⚡⚡ | ⚡⚡⚡⚡ | ⚡⚡⚡ |
| **穩定性** | ✅ 極佳 | ✅ 良好 | 🟡 中等 |
| **多瀏覽器** | ✅ Chrome/Firefox/Safari | 🟡 有限 | ✅ 完整 |
| **自動等待** | ✅ 內建 | ✅ 內建 | ❌ 需手動 |
| **並行執行** | ✅ 內建 | 💰 付費 | ✅ 支援 |
| **除錯工具** | ✅ Inspector | ✅ 時間旅行 | 🟡 基本 |
| **網路攔截** | ✅ 完整 | ✅ 完整 | 🟡 有限 |
| **學習曲線** | 🟢 低 | 🟢 低 | 🟡 中 |
| **文檔品質** | ✅ 優秀 | ✅ 優秀 | 🟡 一般 |

### Playwright 優勢

✅ **跨瀏覽器支援** - Chromium, Firefox, WebKit (Safari)
✅ **自動等待** - 自動等待元素可操作,減少 flaky tests
✅ **快速執行** - 並行執行,速度極快
✅ **強大的選擇器** - 支援 CSS、XPath、文字、ARIA 等
✅ **網路控制** - 攔截、修改、模擬網路請求
✅ **移動模擬** - 模擬移動裝置
✅ **錄製功能** - Codegen 自動生成測試代碼
✅ **追蹤功能** - 記錄完整測試執行過程

---

## 環境建置

### 1. 安裝 Playwright

```bash
cd frontend

# 安裝 Playwright
npm install -D @playwright/test

# 安裝瀏覽器 (Chromium, Firefox, WebKit)
npx playwright install

# 或只安裝 Chromium
npx playwright install chromium
```

### 2. 初始化配置

```bash
# 產生初始配置檔
npx playwright init
```

### 3. 專案結構

```
frontend/
├── tests/
│   ├── e2e/
│   │   ├── auth/
│   │   │   ├── login.spec.js
│   │   │   ├── register.spec.js
│   │   │   └── password-reset.spec.js
│   │   │
│   │   ├── records/
│   │   │   ├── create-record.spec.js
│   │   │   ├── edit-record.spec.js
│   │   │   ├── delete-record.spec.js
│   │   │   └── filter-records.spec.js
│   │   │
│   │   ├── budget/
│   │   │   ├── set-budget.spec.js
│   │   │   └── budget-tracking.spec.js
│   │   │
│   │   ├── stats/
│   │   │   └── view-statistics.spec.js
│   │   │
│   │   └── critical-flows/
│   │       ├── complete-user-journey.spec.js
│   │       └── smoke-test.spec.js
│   │
│   ├── page-objects/
│   │   ├── LoginPage.js
│   │   ├── RegisterPage.js
│   │   ├── DashboardPage.js
│   │   ├── RecordsPage.js
│   │   ├── SettingsPage.js
│   │   └── BasePage.js
│   │
│   ├── fixtures/
│   │   ├── test-data.js
│   │   └── authenticated.js
│   │
│   └── helpers/
│       ├── test-utils.js
│       └── api-helpers.js
│
├── playwright.config.js
└── package.json
```

### 4. Playwright 配置

**`frontend/playwright.config.js`:**

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // 測試目錄
  testDir: './tests/e2e',

  // 並行執行的 worker 數量
  workers: process.env.CI ? 2 : 4,

  // 重試次數 (CI 環境重試更多次)
  retries: process.env.CI ? 2 : 1,

  // 超時設定
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  // 測試報告
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'], // 終端輸出
  ],

  use: {
    // Base URL
    baseURL: process.env.BASE_URL || 'http://localhost:8080',

    // 追蹤設定 (失敗時保留)
    trace: 'retain-on-failure',

    // 截圖設定
    screenshot: 'only-on-failure',

    // 錄影設定
    video: 'retain-on-failure',

    // 瀏覽器上下文選項
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    colorScheme: 'light',
  },

  // 測試專案 (多瀏覽器)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // 移動裝置
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // 開發伺服器 (可選)
  webServer: process.env.CI
    ? undefined
    : {
        command: 'python -m http.server 8080',
        port: 8080,
        timeout: 120000,
        reuseExistingServer: !process.env.CI,
      },
});
```

---

## 測試架構

### Fixture 系統

**`frontend/tests/fixtures/authenticated.js`:**

```javascript
import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage';

// 擴充 test fixture 以包含已認證狀態
export const test = base.extend({
  // 自動登入的 context
  authenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);

    // 前往登入頁面
    await page.goto('/#login');

    // 執行登入
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'MyS3cur3P@ssw0rd!XyZ',
    };

    // 先註冊用戶
    await page.goto('/#register');
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="name"]', 'E2E Test User');
    await page.click('button:has-text("註冊")');

    // 等待註冊完成並跳轉到登入頁
    await page.waitForURL('**/login', { timeout: 5000 });

    // 登入
    await loginPage.login(testUser.email, testUser.password);

    // 驗證登入成功
    await expect(page).toHaveURL('**/dashboard', { timeout: 5000 });

    // 使用已認證的 page
    await use(page);
  },
});

export { expect };
```

**`frontend/tests/fixtures/test-data.js`:**

```javascript
export const testUsers = {
  valid: {
    email: 'test@example.com',
    password: 'MyS3cur3P@ssw0rd!XyZ',
    name: 'Test User',
  },
  weakPassword: {
    email: 'weak@example.com',
    password: '123456',
    name: 'Weak User',
  },
};

export const testRecords = {
  expense: {
    type: 'expense',
    amount: '100',
    category: '午餐',
    description: 'Test lunch expense',
  },
  income: {
    type: 'income',
    amount: '5000',
    category: '薪水',
    description: 'Monthly salary',
  },
};

export const testBudget = {
  午餐: 3000,
  交通: 2000,
  娛樂: 1500,
};

// 生成唯一 email
export function generateUniqueEmail() {
  return `test-${Date.now()}@example.com`;
}

// 生成隨機金額
export function generateRandomAmount(min = 10, max = 1000) {
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}
```

---

## Page Object Model

### BasePage (基礎頁面類別)

**`frontend/tests/page-objects/BasePage.js`:**

```javascript
export class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(path) {
    await this.page.goto(path);
  }

  async waitForToast(type = 'success', timeout = 5000) {
    const selector = `.toast.toast-${type}`;
    await this.page.waitForSelector(selector, { timeout });
  }

  async getToastMessage() {
    const toast = await this.page.locator('.toast').first();
    return await toast.textContent();
  }

  async clickButton(text) {
    await this.page.click(`button:has-text("${text}")`);
  }

  async fillInput(selector, value) {
    await this.page.fill(selector, value);
  }

  async selectOption(selector, value) {
    await this.page.selectOption(selector, value);
  }

  async waitForNavigation(url) {
    await this.page.waitForURL(url);
  }
}
```

### LoginPage

**`frontend/tests/page-objects/LoginPage.js`:**

```javascript
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  constructor(page) {
    super(page);

    // 選擇器
    this.emailInput = 'input[name="email"]';
    this.passwordInput = 'input[name="password"]';
    this.loginButton = 'button:has-text("登入")';
    this.registerLink = 'a:has-text("前往註冊")';
    this.forgotPasswordLink = 'a:has-text("忘記密碼")';
  }

  async goto() {
    await this.page.goto('/#login');
  }

  async login(email, password) {
    await this.fillInput(this.emailInput, email);
    await this.fillInput(this.passwordInput, password);
    await this.clickButton('登入');
  }

  async getErrorMessage() {
    return await this.getToastMessage();
  }

  async goToRegister() {
    await this.page.click(this.registerLink);
  }

  async goToForgotPassword() {
    await this.page.click(this.forgotPasswordLink);
  }
}
```

### RegisterPage

**`frontend/tests/page-objects/RegisterPage.js`:**

```javascript
import { BasePage } from './BasePage';

export class RegisterPage extends BasePage {
  constructor(page) {
    super(page);

    this.emailInput = 'input[name="email"]';
    this.passwordInput = 'input[name="password"]';
    this.nameInput = 'input[name="name"]';
    this.registerButton = 'button:has-text("註冊")';
    this.loginLink = 'a:has-text("已有帳號?")';
    this.passwordStrengthIndicator = '.password-strength';
  }

  async goto() {
    await this.page.goto('/#register');
  }

  async register(email, password, name) {
    await this.fillInput(this.emailInput, email);
    await this.fillInput(this.passwordInput, password);
    await this.fillInput(this.nameInput, name);
    await this.clickButton('註冊');
  }

  async getPasswordStrength() {
    const indicator = await this.page.locator(this.passwordStrengthIndicator);
    return await indicator.textContent();
  }

  async waitForPasswordValidation() {
    await this.page.waitForSelector(this.passwordStrengthIndicator, {
      state: 'visible',
      timeout: 3000,
    });
  }
}
```

### DashboardPage

**`frontend/tests/page-objects/DashboardPage.js`:**

```javascript
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  constructor(page) {
    super(page);

    this.addRecordButton = 'button:has-text("新增記帳")';
    this.recordsList = '.records-list';
    this.statsContainer = '.stats-container';
    this.chartContainer = '#expenseChart';
  }

  async goto() {
    await this.page.goto('/#dashboard');
  }

  async openAddRecordModal() {
    await this.page.click(this.addRecordButton);
  }

  async addRecord({ type, amount, category, description }) {
    await this.openAddRecordModal();

    // 選擇類型
    await this.page.click(`input[value="${type}"]`);

    // 輸入金額
    await this.fillInput('input[name="amount"]', amount);

    // 選擇分類
    await this.page.click('button:has-text("選擇分類")');
    await this.page.click(`.category-item:has-text("${category}")`);

    // 輸入說明
    if (description) {
      await this.fillInput('textarea[name="description"]', description);
    }

    // 提交
    await this.clickButton('確認');

    // 等待成功訊息
    await this.waitForToast('success');
  }

  async getStats() {
    const incomeElement = await this.page.locator('#total-income');
    const expenseElement = await this.page.locator('#total-expense');
    const balanceElement = await this.page.locator('#balance');

    return {
      income: await incomeElement.textContent(),
      expense: await expenseElement.textContent(),
      balance: await balanceElement.textContent(),
    };
  }

  async isChartVisible() {
    return await this.page.locator(this.chartContainer).isVisible();
  }
}
```

### RecordsPage

**`frontend/tests/page-objects/RecordsPage.js`:**

```javascript
import { BasePage } from './BasePage';

export class RecordsPage extends BasePage {
  constructor(page) {
    super(page);

    this.recordsList = '.records-list';
    this.recordItem = '.record-item';
    this.filterButton = 'button:has-text("篩選")';
    this.exportButton = 'button:has-text("匯出")';
  }

  async goto() {
    await this.page.goto('/#records');
  }

  async getRecordsCount() {
    return await this.page.locator(this.recordItem).count();
  }

  async getFirstRecord() {
    const firstRecord = await this.page.locator(this.recordItem).first();
    return {
      category: await firstRecord.locator('.category').textContent(),
      amount: await firstRecord.locator('.amount').textContent(),
      description: await firstRecord.locator('.description').textContent(),
    };
  }

  async deleteRecordBySwipe(index = 0) {
    const record = await this.page.locator(this.recordItem).nth(index);

    // 模擬滑動刪除
    const box = await record.boundingBox();
    await this.page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + 50, box.y + box.height / 2);
    await this.page.mouse.up();

    // 點擊刪除按鈕
    await this.page.click('.delete-button');

    // 確認刪除
    await this.page.click('button:has-text("確認")');

    await this.waitForToast('success');
  }

  async editRecord(index, updates) {
    const record = await this.page.locator(this.recordItem).nth(index);

    // 長按觸發編輯選單
    await record.click({ button: 'right' });
    await this.page.click('button:has-text("編輯")');

    // 更新欄位
    if (updates.amount) {
      await this.fillInput('input[name="amount"]', updates.amount);
    }
    if (updates.description) {
      await this.fillInput('textarea[name="description"]', updates.description);
    }

    // 儲存
    await this.clickButton('儲存');
    await this.waitForToast('success');
  }

  async filterRecords({ startDate, endDate, type, category }) {
    await this.page.click(this.filterButton);

    if (startDate) {
      await this.fillInput('input[name="start-date"]', startDate);
    }
    if (endDate) {
      await this.fillInput('input[name="end-date"]', endDate);
    }
    if (type) {
      await this.selectOption('select[name="type"]', type);
    }
    if (category) {
      await this.selectOption('select[name="category"]', category);
    }

    await this.clickButton('套用篩選');
  }

  async exportRecords() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.click(this.exportButton);
    const download = await downloadPromise;
    return download;
  }
}
```

---

## 測試範例

### 認證測試

**`frontend/tests/e2e/auth/login.spec.js`:**

```javascript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../page-objects/LoginPage';
import { DashboardPage } from '../../page-objects/DashboardPage';
import { generateUniqueEmail } from '../../fixtures/test-data';

test.describe('Login Flow', () => {
  let loginPage;
  let dashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.goto();
  });

  test('successful login with valid credentials', async ({ page }) => {
    // 先註冊一個用戶
    const email = generateUniqueEmail();
    const password = 'MyS3cur3P@ssw0rd!XyZ';

    await page.goto('/#register');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="name"]', 'E2E Test User');
    await page.click('button:has-text("註冊")');

    // 等待跳轉到登入頁
    await page.waitForURL('**/login');

    // 執行登入
    await loginPage.login(email, password);

    // 驗證登入成功
    await expect(page).toHaveURL('**/dashboard');
    await expect(page.locator('.user-name')).toContainText('E2E Test User');
  });

  test('login fails with invalid credentials', async ({ page }) => {
    await loginPage.login('invalid@example.com', 'WrongPassword123!');

    // 應顯示錯誤訊息
    await loginPage.waitForToast('error');
    const errorMsg = await loginPage.getErrorMessage();
    expect(errorMsg).toContain('Invalid credentials');

    // 應停留在登入頁面
    await expect(page).toHaveURL('**/login');
  });

  test('login form validation', async ({ page }) => {
    // 空白表單提交
    await loginPage.clickButton('登入');

    // 應顯示驗證錯誤
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('remember me functionality', async ({ page, context }) => {
    // TODO: 實作「記住我」功能測試
    test.skip();
  });
});
```

**`frontend/tests/e2e/auth/register.spec.js`:**

```javascript
import { test, expect } from '@playwright/test';
import { RegisterPage } from '../../page-objects/RegisterPage';
import { generateUniqueEmail } from '../../fixtures/test-data';

test.describe('Registration Flow', () => {
  let registerPage;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    await registerPage.goto();
  });

  test('successful registration with valid data', async ({ page }) => {
    const email = generateUniqueEmail();

    await registerPage.register(email, 'MyS3cur3P@ssw0rd!XyZ', 'New User');

    // 驗證註冊成功
    await registerPage.waitForToast('success');

    // 應跳轉到登入頁面
    await expect(page).toHaveURL('**/login');
  });

  test('registration fails with weak password', async ({ page }) => {
    const email = generateUniqueEmail();

    await registerPage.register(email, '123456', 'Weak User');

    // 應顯示密碼強度錯誤
    await registerPage.waitForToast('error');
    const errorMsg = await registerPage.getToastMessage();
    expect(errorMsg).toContain('密碼');
  });

  test('password strength indicator updates in real-time', async ({ page }) => {
    await page.fill('input[name="password"]', 'weak');
    await registerPage.waitForPasswordValidation();

    let strength = await registerPage.getPasswordStrength();
    expect(strength).toContain('弱');

    // 輸入更強的密碼
    await page.fill('input[name="password"]', 'MyS3cur3P@ssw0rd!XyZ');
    await page.waitForTimeout(500); // 等待即時驗證

    strength = await registerPage.getPasswordStrength();
    expect(strength).toContain('強');
  });

  test('cannot register with duplicate email', async ({ page }) => {
    const email = generateUniqueEmail();

    // 第一次註冊
    await registerPage.register(email, 'MyS3cur3P@ssw0rd!XyZ', 'User 1');
    await registerPage.waitForToast('success');

    // 嘗試用相同 email 再次註冊
    await registerPage.goto();
    await registerPage.register(email, 'DifferentP@ssw0rd123', 'User 2');

    // 應顯示錯誤
    await registerPage.waitForToast('error');
    const errorMsg = await registerPage.getToastMessage();
    expect(errorMsg).toContain('已存在');
  });
});
```

### 記帳功能測試

**`frontend/tests/e2e/records/create-record.spec.js`:**

```javascript
import { test, expect } from '../../fixtures/authenticated';
import { DashboardPage } from '../../page-objects/DashboardPage';
import { RecordsPage } from '../../page-objects/RecordsPage';
import { testRecords } from '../../fixtures/test-data';

test.describe('Create Record', () => {
  test('add expense record successfully', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.goto();

    // 新增支出記錄
    await dashboardPage.addRecord(testRecords.expense);

    // 驗證記錄已新增
    const recordsPage = new RecordsPage(authenticatedPage);
    await recordsPage.goto();

    const recordsCount = await recordsPage.getRecordsCount();
    expect(recordsCount).toBeGreaterThan(0);

    const firstRecord = await recordsPage.getFirstRecord();
    expect(firstRecord.category).toContain('午餐');
    expect(firstRecord.amount).toContain('100');
  });

  test('add income record successfully', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.goto();

    await dashboardPage.addRecord(testRecords.income);

    // 驗證統計更新
    const stats = await dashboardPage.getStats();
    expect(stats.income).toContain('5000');
  });

  test('custom keyboard calculation works', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.goto();

    await dashboardPage.openAddRecordModal();

    // 使用自定義鍵盤輸入計算式
    const amountInput = authenticatedPage.locator('input[name="amount"]');
    await amountInput.click();

    // 輸入: 100 + 50
    await authenticatedPage.click('.keyboard-btn:has-text("1")');
    await authenticatedPage.click('.keyboard-btn:has-text("0")');
    await authenticatedPage.click('.keyboard-btn:has-text("0")');
    await authenticatedPage.click('.keyboard-btn:has-text("+")');
    await authenticatedPage.click('.keyboard-btn:has-text("5")');
    await authenticatedPage.click('.keyboard-btn:has-text("0")');
    await authenticatedPage.click('.keyboard-btn:has-text("=")');

    // 驗證計算結果
    await expect(amountInput).toHaveValue('150');
  });
});
```

### 完整使用者旅程測試

**`frontend/tests/e2e/critical-flows/complete-user-journey.spec.js`:**

```javascript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../page-objects/LoginPage';
import { RegisterPage } from '../../page-objects/RegisterPage';
import { DashboardPage } from '../../page-objects/DashboardPage';
import { RecordsPage } from '../../page-objects/RecordsPage';
import { generateUniqueEmail } from '../../fixtures/test-data';

test.describe('Complete User Journey', () => {
  test('new user complete workflow: register → login → add records → view stats → logout', async ({
    page,
  }) => {
    const email = generateUniqueEmail();
    const password = 'MyS3cur3P@ssw0rd!XyZ';
    const name = 'Journey Test User';

    // 1. 註冊
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.register(email, password, name);
    await registerPage.waitForToast('success');

    // 2. 登入
    await expect(page).toHaveURL('**/login');
    const loginPage = new LoginPage(page);
    await loginPage.login(email, password);
    await expect(page).toHaveURL('**/dashboard');

    // 3. 新增多筆記錄
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.addRecord({
      type: 'expense',
      amount: '100',
      category: '午餐',
      description: '便當',
    });

    await dashboardPage.addRecord({
      type: 'expense',
      amount: '50',
      category: '交通',
      description: '公車',
    });

    await dashboardPage.addRecord({
      type: 'income',
      amount: '5000',
      category: '薪水',
      description: '月薪',
    });

    // 4. 查看記錄列表
    const recordsPage = new RecordsPage(page);
    await recordsPage.goto();

    const recordsCount = await recordsPage.getRecordsCount();
    expect(recordsCount).toBe(3);

    // 5. 查看統計
    await dashboardPage.goto();
    const stats = await dashboardPage.getStats();
    expect(stats.income).toContain('5000');
    expect(stats.expense).toContain('150');
    expect(stats.balance).toContain('4850');

    // 6. 驗證圖表顯示
    const isChartVisible = await dashboardPage.isChartVisible();
    expect(isChartVisible).toBe(true);

    // 7. 登出
    await page.click('a:has-text("登出")');
    await expect(page).toHaveURL('**/login');
  });
});
```

### Smoke Test (冒煙測試)

**`frontend/tests/e2e/critical-flows/smoke-test.spec.js`:**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/記帳系統/);
  });

  test('all main pages are accessible', async ({ page }) => {
    const pages = [
      { path: '/#login', selector: 'button:has-text("登入")' },
      { path: '/#register', selector: 'button:has-text("註冊")' },
    ];

    for (const { path, selector } of pages) {
      await page.goto(path);
      await expect(page.locator(selector)).toBeVisible();
    }
  });

  test('API health check', async ({ request }) => {
    const response = await request.get('http://localhost:5001/status');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
  });
});
```

---

## 最佳實踐

### 1. 使用語意化選擇器

```javascript
// ✅ 好的選擇器
await page.click('button:has-text("登入")');
await page.click('[aria-label="關閉"]');
await page.click('data-testid=submit-button');

// ❌ 避免使用脆弱的選擇器
await page.click('#btn-123'); // ID 可能變動
await page.click('.btn.btn-primary.mt-3'); // class 太具體
await page.click('body > div > div > button'); // XPath 太脆弱
```

### 2. 善用自動等待

```javascript
// ✅ Playwright 會自動等待
await page.click('button'); // 自動等待按鈕可點擊
await expect(page.locator('.result')).toBeVisible(); // 自動等待元素可見

// ❌ 不需要手動等待
await page.waitForTimeout(3000); // 避免固定等待時間
```

### 3. 使用 Page Object Model

```javascript
// ✅ 使用 Page Object
const loginPage = new LoginPage(page);
await loginPage.login(email, password);

// ❌ 直接操作 DOM
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button');
```

### 4. 測試隔離

```javascript
// ✅ 每個測試獨立
test('test 1', async ({ page }) => {
  // 使用唯一資料
  const email = generateUniqueEmail();
  // ...
});

// ❌ 測試間共享狀態
let sharedUser; // 避免共享變數
```

### 5. 有意義的斷言

```javascript
// ✅ 清楚的斷言
await expect(page.locator('.toast-success')).toContainText('新增成功');

// ❌ 模糊的斷言
await expect(page.locator('.toast')).toBeVisible(); // 沒驗證內容
```

---

## CI/CD 整合

### GitHub Actions 配置

**`.github/workflows/e2e-tests.yml`:**

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest

    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install backend dependencies
        run: |
          cd backend
          pip install -r requirements.txt

      - name: Install frontend dependencies
        run: |
          cd frontend
          npm ci

      - name: Install Playwright browsers
        run: |
          cd frontend
          npx playwright install --with-deps chromium

      - name: Start backend server
        run: |
          cd backend
          python main.py &
          sleep 5
        env:
          MONGO_URI: mongodb://localhost:27017/test_db
          JWT_SECRET: test-jwt-secret

      - name: Start frontend server
        run: |
          cd frontend
          python -m http.server 8080 &
          sleep 2

      - name: Run E2E tests
        run: |
          cd frontend
          npx playwright test --project=chromium
        env:
          BASE_URL: http://localhost:8080

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 30

      - name: Upload test videos
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-videos
          path: frontend/test-results/
          retention-days: 7
```

### 執行命令

```bash
# 執行所有 E2E 測試
npm run test:e2e

# 只在 Chromium 執行
npx playwright test --project=chromium

# UI 模式 (互動式除錯)
npx playwright test --ui

# Debug 模式
npx playwright test --debug

# 只執行特定測試
npx playwright test auth/login.spec.js

# 並行執行
npx playwright test --workers=4

# 產生測試報告
npx playwright show-report
```

### package.json 腳本

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:chrome": "playwright test --project=chromium",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## 故障排除

### 常見問題

**1. 元素找不到**

```javascript
// 問題: TimeoutError: waiting for selector
await page.click('.non-existent');

// 解決: 使用更寬鬆的選擇器或增加等待時間
await page.click('button:has-text("登入")', { timeout: 10000 });

// 或使用 waitForSelector
await page.waitForSelector('.dynamic-element');
await page.click('.dynamic-element');
```

**2. 測試不穩定 (Flaky)**

```javascript
// 問題: 測試有時通過有時失敗

// 解決: 確保使用自動等待
await expect(page.locator('.result')).toBeVisible();

// 而非固定延遲
// await page.waitForTimeout(3000); ❌
```

**3. 網路請求失敗**

```javascript
// 使用網路攔截來模擬回應
await page.route('**/api/auth/login', (route) =>
  route.fulfill({
    status: 200,
    body: JSON.stringify({ token: 'mock-token' }),
  })
);
```

**4. 截圖和除錯**

```javascript
// 截圖
await page.screenshot({ path: 'debug.png', fullPage: true });

// 追蹤
await page.context().tracing.start({ screenshots: true, snapshots: true });
// ... 測試步驟 ...
await page.context().tracing.stop({ path: 'trace.zip' });
```

---

## 總結

本文件提供了 Playwright E2E 測試的完整實施方案:

✅ Playwright 優勢分析與選擇理由
✅ 完整的專案結構與配置
✅ Page Object Model 架構
✅ Fixture 系統設計
✅ 豐富的測試範例 (認證、記帳、完整旅程)
✅ 最佳實踐與常見陷阱
✅ CI/CD 整合配置
✅ 故障排除指南

**下一步:**
1. 安裝 Playwright
2. 建立 Page Objects
3. 撰寫關鍵流程測試
4. 整合到 CI/CD

---

**版本:** 1.0
**最後更新:** 2026-02-28
