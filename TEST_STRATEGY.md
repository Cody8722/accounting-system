# 測試策略完整規劃

**專案名稱:** 個人記帳系統 (Accounting System)
**版本:** 1.0
**制定日期:** 2026-02-28
**負責人:** Development Team

---

## 📑 目錄

1. [概述](#概述)
2. [測試金字塔策略](#測試金字塔策略)
3. [後端測試策略](#後端測試策略)
4. [前端測試策略](#前端測試策略)
5. [整合測試策略](#整合測試策略)
6. [端對端測試策略](#端對端測試策略)
7. [性能測試策略](#性能測試策略)
8. [安全測試策略](#安全測試策略)
9. [測試環境配置](#測試環境配置)
10. [覆蓋率目標](#覆蓋率目標)
11. [CI/CD 整合](#cicd-整合)
12. [測試排程與維護](#測試排程與維護)

---

## 概述

### 專案背景

個人記帳系統是一個全端 PWA 應用，提供多用戶記帳、統計分析、預算管理等功能。系統採用前後端分離架構：

- **後端:** Flask (Python) + MongoDB
- **前端:** Vanilla JavaScript + Tailwind CSS
- **部署:** Zeabur (雙服務部署)

### 測試目標

1. **確保功能正確性** - 所有功能按預期運作
2. **提升代碼質量** - 通過測試驅動開發改善設計
3. **防止回歸錯誤** - 每次變更都能快速驗證
4. **提高信心** - 部署前確保系統穩定性
5. **文檔化行為** - 測試即文檔，說明系統預期行為

### 測試原則

- ✅ **快速反饋** - 單元測試秒級完成，整合測試分鐘級
- ✅ **獨立性** - 測試間互不依賴，可並行執行
- ✅ **可重複** - 相同輸入總是產生相同結果
- ✅ **可維護** - 測試代碼與產品代碼同等重要
- ✅ **真實性** - 測試環境盡可能接近生產環境

---

## 測試金字塔策略

```
           ╱╲
          ╱E2E╲         10% - 端對端測試 (最慢、最脆弱)
         ╱──────╲
        ╱ 整合測試 ╲      20% - API整合、前後端整合
       ╱──────────╲
      ╱  單元測試    ╲    70% - 單元測試 (最快、最穩定)
     ╱──────────────╲
```

### 測試比例目標

| 測試類型 | 比例 | 執行時間 | 數量目標 |
|---------|------|---------|---------|
| 單元測試 | 70% | < 10s | 150+ |
| 整合測試 | 20% | < 2min | 40+ |
| E2E 測試 | 10% | < 10min | 15+ |

---

## 後端測試策略

### 現有測試現況

✅ **已完成:**
- pytest 測試框架配置
- 密碼驗證測試 (15+ 場景)
- 認證系統測試 (註冊、登入、JWT)
- 記帳 CRUD 測試
- 極端場景測試 (邊界值、注入攻擊)
- mongomock 模擬 MongoDB
- 覆蓋率報告 (當前 74%)

⚠️ **待補強:**
- 預算功能測試
- 統計 API 測試
- 密碼重設流程測試
- 速率限制測試
- 並發測試
- 資料庫遷移測試

### 單元測試 (Unit Tests)

**範圍:** 獨立函數、類別方法、工具函數

**目標文件:**
- `auth.py` - 認證邏輯
- `main.py` - API 端點處理
- 未來的 service 層模組

**測試重點:**

1. **密碼驗證邏輯** ✅ 已完成
   ```python
   # 範例: tests/test_auth.py
   def test_password_too_short():
       assert not validate_password("Short1!")
   ```

2. **JWT Token 處理** ✅ 已完成
   - Token 生成
   - Token 驗證
   - Token 過期處理

3. **資料驗證** ✅ 已完成
   - 金額格式
   - 日期格式
   - Email 格式

4. **商業邏輯** 🔜 待補強
   - 預算計算
   - 統計計算
   - 資料聚合

**測試工具:**
- `pytest` - 測試框架
- `pytest-cov` - 覆蓋率報告
- `pytest-mock` - Mock 功能
- `mongomock` - MongoDB 模擬

**命名規範:**
```python
# 檔案: test_<模組名稱>.py
# 類別: Test<功能名稱>
# 方法: test_<場景描述>

class TestPasswordValidation:
    def test_password_meets_all_requirements_should_pass(self):
        pass

    def test_password_missing_uppercase_should_fail(self):
        pass
```

### 整合測試 (Integration Tests)

**範圍:** API 端點、資料庫操作、第三方服務整合

**目標:**
- 所有 API 端點的請求/回應
- 認證流程 (註冊 → 登入 → 使用 Token)
- 完整 CRUD 操作
- 錯誤處理

**測試場景:**

1. **認證流程整合** ✅ 已完成
   ```python
   def test_full_auth_flow(client):
       # 1. 註冊
       register_response = client.post('/api/auth/register', json=user_data)
       # 2. 登入
       login_response = client.post('/api/auth/login', json=credentials)
       # 3. 使用 Token 訪問資源
       response = client.get('/api/user/profile', headers=auth_headers)
   ```

2. **記帳完整流程** ✅ 部分完成
   - 新增記錄 → 查詢 → 更新 → 刪除
   - 設定預算 → 新增支出 → 檢查預算狀態

3. **統計功能** 🔜 待補強
   - 新增多筆記錄
   - 呼叫統計 API
   - 驗證計算結果

4. **錯誤處理** ✅ 已完成
   - 401 未認證
   - 403 權限不足
   - 404 資源不存在
   - 422 驗證失敗

**標記系統:**
```python
@pytest.mark.integration
@pytest.mark.auth
def test_user_registration_and_login_flow(client):
    pass
```

### 測試資料管理

**策略:** 每個測試使用獨立的測試資料

```python
# conftest.py
@pytest.fixture
def test_user_email():
    """生成唯一測試郵箱"""
    return f"test{datetime.now().timestamp()}@example.com"

@pytest.fixture
def clean_db():
    """測試後清理資料庫"""
    yield
    # 清理邏輯
```

### 後端測試執行命令

```bash
# 執行所有測試
pytest

# 執行特定標記的測試
pytest -m unit           # 只執行單元測試
pytest -m integration    # 只執行整合測試
pytest -m "not slow"     # 跳過慢速測試

# 覆蓋率報告
pytest --cov=. --cov-report=html
pytest --cov=. --cov-report=term-missing

# 詳細輸出
pytest -v                # 詳細模式
pytest -vv               # 超詳細模式
pytest -s                # 顯示 print 輸出

# 失敗時立即停止
pytest -x

# 並行執行 (需要 pytest-xdist)
pytest -n auto
```

---

## 前端測試策略

### 現有測試現況

✅ **已有測試頁面:**
- `test-basic-modules.html` - 基礎模組測試
- `test-refactored.html` - 模組化重構測試
- `test-phase4-integration.html` - Phase 4 整合測試

❌ **缺少:**
- 自動化測試框架
- 單元測試
- 整合測試
- E2E 測試

### 前端測試框架選擇

#### 推薦方案 A: Vitest + Testing Library (現代化)

**優點:**
- ⚡ 極快的執行速度 (基於 Vite)
- 🎯 專為 ESM 設計
- 📦 零配置，開箱即用
- 🔧 與 Jest 相容的 API
- 🎨 美觀的終端 UI

**適用情境:**
- 新專案
- 願意導入建構工具
- 追求最佳開發體驗

**基本配置:**
```javascript
// vitest.config.js
export default {
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/']
    }
  }
}
```

#### 推薦方案 B: Jest + Testing Library (穩定)

**優點:**
- ✅ 成熟穩定，社區龐大
- 📚 豐富的文檔和資源
- 🔌 豐富的插件生態
- 🎯 開箱即用的功能 (Mock, Snapshot)

**適用情境:**
- 現有專案改造
- 團隊熟悉 Jest
- 需要穩定可靠的方案

**基本配置:**
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'frontend/js-refactored/**/*.js',
    '!frontend/js-refactored/main.js'
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    }
  }
}
```

#### 方案 C: 原生瀏覽器測試 (輕量)

**優點:**
- 🚀 無需建構工具
- 📦 零依賴
- 🎯 最接近實際運行環境

**缺點:**
- ❌ 功能有限
- ❌ 需手動管理測試執行
- ❌ 難以整合 CI/CD

**適用情境:**
- 不想引入建構工具
- 簡單測試需求
- 快速原型驗證

### 前端單元測試

**測試範圍:**

1. **基礎模組 (config.js, utils.js, api.js)**
   ```javascript
   // tests/utils.test.js
   import { escapeHtml, showToast } from '../frontend/js-refactored/utils.js';

   describe('escapeHtml', () => {
     it('should escape XSS attack vectors', () => {
       expect(escapeHtml('<script>alert("XSS")</script>'))
         .toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
     });
   });
   ```

2. **EventBus (events.js)**
   ```javascript
   describe('EventBus', () => {
     it('should emit and listen to events', () => {
       const callback = jest.fn();
       EventBus.on('TEST_EVENT', callback);
       EventBus.emit('TEST_EVENT', { data: 'test' });
       expect(callback).toHaveBeenCalledWith({ data: 'test' });
     });
   });
   ```

3. **UI 組件 (components.js)**
   ```javascript
   describe('CustomKeyboard', () => {
     it('should calculate expression correctly', () => {
       const keyboard = new CustomKeyboard(mockInputElement);
       keyboard.handleInput('100+50');
       expect(keyboard.getCurrentValue()).toBe('150');
     });
   });
   ```

4. **業務邏輯模組**
   - `records.js` - validateAmount, 日期驗證
   - `budget.js` - 預算計算
   - `stats.js` - 統計計算
   - `charts.js` - 資料轉換

### 前端整合測試

**測試範圍:** 多個模組協作、DOM 操作、API 呼叫

```javascript
// tests/integration/records.test.js
import { render, screen, fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';

describe('Records Integration', () => {
  it('should add new record and update stats', async () => {
    // 1. 模擬 API
    fetchMock.mockResponseOnce(JSON.stringify({ success: true }));

    // 2. 觸發新增
    fireEvent.click(screen.getByText('新增記帳'));
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('確認'));

    // 3. 驗證結果
    await screen.findByText('新增成功');
    expect(fetchMock).toHaveBeenCalledWith('/admin/api/accounting/records', {
      method: 'POST',
      body: JSON.stringify({ amount: 100, ... })
    });
  });
});
```

### 視覺回歸測試 (可選)

**工具:** Percy, Chromatic, BackstopJS

**用途:** 偵測 UI 意外變化

```javascript
// 範例: 使用 BackstopJS
{
  "scenarios": [
    {
      "label": "Login Page",
      "url": "http://localhost:8080/#login",
      "selectors": ["#login-page"]
    },
    {
      "label": "Dashboard",
      "url": "http://localhost:8080/#dashboard",
      "selectors": ["#dashboard"]
    }
  ]
}
```

### 前端測試目錄結構

```
frontend/
├── js-refactored/
│   ├── config.js
│   ├── utils.js
│   └── ...
├── tests/
│   ├── unit/
│   │   ├── config.test.js
│   │   ├── utils.test.js
│   │   ├── events.test.js
│   │   └── components.test.js
│   ├── integration/
│   │   ├── auth-flow.test.js
│   │   ├── records-crud.test.js
│   │   └── budget.test.js
│   ├── e2e/
│   │   └── (見 E2E 章節)
│   ├── setup.js         # 測試環境設定
│   └── mocks/
│       ├── api.mock.js  # API Mock
│       └── data.mock.js # 測試資料
├── package.json
└── vitest.config.js     # 或 jest.config.js
```

---

## 整合測試策略

### 前後端整合測試

**目標:** 驗證前後端協作是否正常

**方案 1: 使用真實後端 API**

```javascript
// tests/integration/api.test.js
describe('Real API Integration', () => {
  beforeAll(async () => {
    // 啟動測試後端伺服器
    await startTestServer();
  });

  it('should register, login, and fetch profile', async () => {
    const email = `test-${Date.now()}@example.com`;

    // 1. 註冊
    const registerRes = await fetch('http://localhost:5001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test123!@#Abc', name: 'Test' })
    });
    expect(registerRes.status).toBe(200);

    // 2. 登入
    const loginRes = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test123!@#Abc' })
    });
    const { token } = await loginRes.json();

    // 3. 取得個人資料
    const profileRes = await fetch('http://localhost:5001/api/user/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const profile = await profileRes.json();
    expect(profile.email).toBe(email);
  });
});
```

**方案 2: 使用 API Mock**

```javascript
// tests/integration/records.mock.test.js
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.post('/admin/api/accounting/records', (req, res, ctx) => {
    return res(ctx.json({ success: true, id: '123' }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Records with Mocked API', () => {
  it('should handle record creation', async () => {
    // 測試邏輯
  });
});
```

### Contract Testing (契約測試)

**工具:** Pact

**目的:** 確保前後端 API 契約一致

```javascript
// 前端消費者測試
const { Pact } = require('@pact-foundation/pact');

describe('Accounting API Contract', () => {
  const provider = new Pact({
    consumer: 'Frontend',
    provider: 'Backend-API'
  });

  it('should get user profile', async () => {
    await provider.addInteraction({
      state: 'user exists',
      uponReceiving: 'a request for user profile',
      withRequest: {
        method: 'GET',
        path: '/api/user/profile',
        headers: { Authorization: 'Bearer valid-token' }
      },
      willRespondWith: {
        status: 200,
        body: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }
    });

    // 執行實際測試
  });
});
```

---

## 端對端測試策略

### E2E 測試框架選擇

#### 推薦: Playwright

**優點:**
- ✅ 支援多瀏覽器 (Chromium, Firefox, WebKit)
- ✅ 自動等待機制，減少 flaky tests
- ✅ 強大的除錯工具
- ✅ 支援網路攔截、模擬
- ✅ 並行執行

**基本配置:**
```javascript
// playwright.config.js
module.exports = {
  testDir: './frontend/tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 12'] } }
  ]
};
```

#### 替代方案: Cypress

**優點:**
- 📸 優秀的時間旅行除錯
- 🎥 自動錄製影片
- 🔄 實時重載

**適用情境:**
- 團隊熟悉 Cypress
- 需要即時除錯功能

### 關鍵使用者流程測試

**優先級高 (P0):**

1. **使用者註冊與登入**
   ```javascript
   // tests/e2e/auth.spec.js
   test('user can register and login', async ({ page }) => {
     // 1. 前往註冊頁面
     await page.goto('/#register');

     // 2. 填寫註冊表單
     const email = `test-${Date.now()}@example.com`;
     await page.fill('input[name="email"]', email);
     await page.fill('input[name="password"]', 'MyS3cur3P@ssw0rd!XyZ');
     await page.fill('input[name="name"]', 'Test User');

     // 3. 提交註冊
     await page.click('button:has-text("註冊")');

     // 4. 驗證成功訊息
     await expect(page.locator('.toast-success')).toBeVisible();

     // 5. 自動跳轉到登入頁
     await expect(page).toHaveURL('/#login');

     // 6. 登入
     await page.fill('input[name="email"]', email);
     await page.fill('input[name="password"]', 'MyS3cur3P@ssw0rd!XyZ');
     await page.click('button:has-text("登入")');

     // 7. 驗證登入成功
     await expect(page).toHaveURL('/#dashboard');
     await expect(page.locator('.user-name')).toContainText('Test User');
   });
   ```

2. **新增記帳記錄**
   ```javascript
   test('user can add expense record', async ({ page }) => {
     // 前置: 已登入
     await loginUser(page, testUser);

     // 1. 點擊新增記帳
     await page.click('button:has-text("新增記帳")');

     // 2. 選擇類型: 支出
     await page.click('input[value="expense"]');

     // 3. 輸入金額
     await page.fill('input[name="amount"]', '100');

     // 4. 選擇分類
     await page.click('button:has-text("選擇分類")');
     await page.click('.category-item:has-text("午餐")');

     // 5. 選擇日期 (預設今天)
     // 6. 填寫說明
     await page.fill('textarea[name="description"]', '公司附近便當');

     // 7. 提交
     await page.click('button:has-text("確認")');

     // 8. 驗證成功
     await expect(page.locator('.toast-success')).toContainText('新增成功');

     // 9. 驗證記錄出現在列表
     await page.click('a:has-text("記錄")');
     await expect(page.locator('.record-item').first()).toContainText('午餐');
     await expect(page.locator('.record-item').first()).toContainText('100');
   });
   ```

3. **設定預算並查看統計**
   ```javascript
   test('user can set budget and view stats', async ({ page }) => {
     await loginUser(page, testUser);

     // 1. 前往設定頁面
     await page.click('a:has-text("設定")');

     // 2. 設定預算
     await page.fill('input[data-category="午餐"]', '3000');
     await page.fill('input[data-category="交通"]', '2000');
     await page.click('button:has-text("儲存預算")');

     // 3. 驗證儲存成功
     await expect(page.locator('.toast-success')).toBeVisible();

     // 4. 前往統計頁面
     await page.click('a:has-text("統計")');

     // 5. 驗證預算顯示
     await expect(page.locator('.budget-午餐')).toContainText('3000');

     // 6. 驗證圖表顯示
     await expect(page.locator('#expenseChart')).toBeVisible();
   });
   ```

**優先級中 (P1):**

4. 編輯記帳記錄
5. 刪除記帳記錄 (滑動刪除)
6. 篩選記帳記錄
7. 匯出 CSV
8. 修改個人資料
9. 修改密碼
10. 登出

**優先級低 (P2):**

11. PWA 安裝提示
12. 離線功能
13. 深色模式切換
14. 響應式布局 (手機/平板/桌面)

### 跨瀏覽器測試矩陣

| 瀏覽器 | 桌面 | 手機 | 優先級 |
|--------|------|------|--------|
| Chrome | ✅ | ✅ | P0 |
| Firefox | ✅ | ❌ | P1 |
| Safari | ✅ | ✅ | P0 |
| Edge | ✅ | ❌ | P2 |

### E2E 測試最佳實踐

```javascript
// ✅ 好的做法
test('user can complete checkout', async ({ page }) => {
  // 使用 Page Object Model
  const loginPage = new LoginPage(page);
  await loginPage.login(testUser);

  // 使用語意化選擇器
  await page.click('button[aria-label="Add to cart"]');

  // 使用自動等待
  await expect(page.locator('.cart-count')).toHaveText('1');
});

// ❌ 不好的做法
test('checkout test', async ({ page }) => {
  // 硬編碼選擇器
  await page.click('#btn-123');

  // 固定等待時間
  await page.waitForTimeout(3000);

  // 測試太多功能
  // (應拆分為多個獨立測試)
});
```

---

## 性能測試策略

### 負載測試

**工具:** Locust (Python-based)

**目標:**
- 驗證系統在預期負載下的表現
- 找出性能瓶頸
- 確定系統容量上限

**測試場景:**

```python
# locustfile.py
from locust import HttpUser, task, between

class AccountingUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        """登入並取得 token"""
        response = self.client.post("/api/auth/login", json={
            "email": "loadtest@example.com",
            "password": "LoadTest123!@#"
        })
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def view_records(self):
        """查詢記錄 (70% 流量)"""
        self.client.get("/admin/api/accounting/records", headers=self.headers)

    @task(2)
    def view_stats(self):
        """查看統計 (20% 流量)"""
        self.client.get("/admin/api/accounting/stats", headers=self.headers)

    @task(1)
    def add_record(self):
        """新增記錄 (10% 流量)"""
        self.client.post("/admin/api/accounting/records",
                        headers=self.headers,
                        json={
                            "type": "expense",
                            "amount": 100,
                            "category": "午餐",
                            "date": "2026-02-28"
                        })
```

**執行命令:**
```bash
# 100 個並發用戶，每秒增加 10 個，持續 5 分鐘
locust -f locustfile.py --users 100 --spawn-rate 10 --run-time 5m --host http://localhost:5001
```

**性能指標目標:**

| 指標 | 目標 | 說明 |
|------|------|------|
| 回應時間 (P95) | < 500ms | 95% 的請求應在 500ms 內回應 |
| 回應時間 (P99) | < 1s | 99% 的請求應在 1s 內回應 |
| 吞吐量 | > 100 req/s | 每秒至少處理 100 個請求 |
| 錯誤率 | < 0.1% | 錯誤率低於 0.1% |

### 前端性能測試

**工具:** Lighthouse CI

**配置:**
```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:8080'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', {minScore: 0.9}],
        'categories:accessibility': ['error', {minScore: 0.9}],
        'categories:best-practices': ['error', {minScore: 0.9}],
        'categories:seo': ['error', {minScore: 0.8}],
        'first-contentful-paint': ['error', {maxNumericValue: 2000}],
        'interactive': ['error', {maxNumericValue: 3500}],
      },
    },
  },
};
```

**執行:**
```bash
npm install -g @lhci/cli
lhci autorun
```

### 資料庫性能測試

**測試場景:**
```python
# tests/performance/test_db_performance.py
import pytest
import time
from pymongo import MongoClient

@pytest.mark.performance
def test_query_performance_with_large_dataset():
    """測試大資料集查詢性能"""
    # 1. 準備 10,000 筆測試資料
    records = generate_test_records(10000)
    db.records.insert_many(records)

    # 2. 測試查詢時間
    start = time.time()
    results = list(db.records.find({"user_id": "test-user", "type": "expense"}).limit(100))
    duration = time.time() - start

    # 3. 驗證性能
    assert duration < 0.1, f"Query took {duration}s, expected < 0.1s"
    assert len(results) == 100

    # 4. 清理
    db.records.delete_many({"user_id": "test-user"})
```

---

## 安全測試策略

### OWASP Top 10 測試

**1. SQL Injection (NoSQL Injection)**

雖然使用 MongoDB，仍需防範 NoSQL 注入：

```python
# tests/security/test_nosql_injection.py
@pytest.mark.security
def test_nosql_injection_in_login(client):
    """測試登入端點是否防範 NoSQL 注入"""
    malicious_payload = {
        "email": {"$ne": None},  # NoSQL 注入嘗試
        "password": {"$ne": None}
    }
    response = client.post("/api/auth/login", json=malicious_payload)
    assert response.status_code in [400, 422], "Should reject malicious payload"
```

**2. XSS (Cross-Site Scripting)**

```javascript
// tests/security/xss.test.js
test('should escape user input to prevent XSS', () => {
  const maliciousInput = '<script>alert("XSS")</script>';
  const escaped = escapeHtml(maliciousInput);
  expect(escaped).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
  expect(escaped).not.toContain('<script>');
});
```

**3. CSRF (Cross-Site Request Forgery)**

```python
def test_csrf_protection_on_state_changing_endpoints(client, auth_headers):
    """確保狀態變更端點有 CSRF 保護"""
    # 嘗試不帶 CSRF token 的請求
    response = client.post("/admin/api/accounting/records",
                          headers=auth_headers,
                          json=test_record)
    # 根據實作，可能需要檢查 CSRF token
```

**4. Broken Authentication**

```python
@pytest.mark.security
class TestAuthenticationSecurity:
    def test_weak_password_rejected(self, client):
        """弱密碼應被拒絕"""
        response = client.post("/api/auth/register", json={
            "email": "test@example.com",
            "password": "123456",  # 弱密碼
            "name": "Test"
        })
        assert response.status_code == 422

    def test_expired_token_rejected(self, client):
        """過期 token 應被拒絕"""
        expired_token = generate_expired_token()
        response = client.get("/api/user/profile",
                            headers={"Authorization": f"Bearer {expired_token}"})
        assert response.status_code == 401

    def test_rate_limiting_on_login(self, client):
        """登入應有速率限制"""
        for _ in range(11):  # 超過限制
            client.post("/api/auth/login", json={"email": "test@ex.com", "password": "wrong"})

        response = client.post("/api/auth/login", json={"email": "test@ex.com", "password": "wrong"})
        assert response.status_code == 429  # Too Many Requests
```

**5. Sensitive Data Exposure**

```python
def test_password_not_exposed_in_response(client, registered_user):
    """確保密碼不會在回應中洩漏"""
    token = get_auth_token(client, registered_user)
    response = client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"})
    data = response.get_json()

    assert "password" not in data
    assert "password_hash" not in data
```

### 依賴漏洞掃描

**後端: Safety**

```bash
# 安裝
pip install safety

# 掃描已知漏洞
safety check --json

# 在 CI/CD 中整合
safety check --exit-code 1  # 發現漏洞時失敗
```

**前端: npm audit**

```bash
# 掃描依賴漏洞
npm audit

# 自動修復
npm audit fix

# 在 CI/CD 中整合
npm audit --audit-level=high  # 只在高危漏洞時失敗
```

### 滲透測試工具

**OWASP ZAP (Zed Attack Proxy)**

```yaml
# .github/workflows/security-scan.yml
- name: OWASP ZAP Scan
  uses: zaproxy/action-baseline@v0.7.0
  with:
    target: 'http://localhost:8080'
    rules_file_name: '.zap/rules.tsv'
    cmd_options: '-a'
```

---

## 測試環境配置

### 環境分類

| 環境 | 用途 | 資料庫 | 配置 |
|------|------|--------|------|
| **Local** | 本地開發 | MongoDB (本機或 Docker) | `.env.local` |
| **CI** | GitHub Actions | MongoDB Service Container | 環境變數 |
| **Staging** | 預發布測試 | MongoDB Atlas (測試集群) | `.env.staging` |
| **Production** | 正式環境 | MongoDB Atlas (生產集群) | Zeabur 環境變數 |

### 本地測試環境

**後端啟動:**
```bash
# 使用 Docker 啟動 MongoDB
docker run -d -p 27017:27017 --name mongo-test mongo:7.0

# 設定環境變數
export MONGO_URI="mongodb://localhost:27017/test_db"
export JWT_SECRET="test-jwt-secret-key"
export TESTING="true"

# 執行測試
cd backend
pytest
```

**前端測試環境:**
```bash
# 安裝依賴 (如使用 Vitest/Jest)
npm install

# 執行單元測試
npm test

# 執行 E2E 測試 (需同時啟動前後端)
npm run test:e2e
```

### CI 環境配置

**GitHub Actions:**
```yaml
# .github/workflows/test.yml
services:
  mongodb:
    image: mongo:7.0
    ports:
      - 27017:27017
    options: >-
      --health-cmd "mongosh --eval 'db.adminCommand({ping: 1})'"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

env:
  MONGO_URI: mongodb://localhost:27017/
  JWT_SECRET: test-jwt-secret-key-for-ci
  ADMIN_SECRET: test-admin-secret-key
```

### 測試資料管理

**策略 1: 每個測試獨立資料**

```python
@pytest.fixture
def unique_user():
    """每個測試使用唯一用戶"""
    return {
        "email": f"test-{uuid.uuid4()}@example.com",
        "password": "MyS3cur3P@ssw0rd!XyZ",
        "name": "Test User"
    }
```

**策略 2: 測試後清理**

```python
@pytest.fixture
def clean_db():
    """測試後清理資料庫"""
    yield
    # 清理測試資料
    db.users.delete_many({"email": {"$regex": "^test-"}})
    db.records.delete_many({"user_id": {"$regex": "^test-"}})
```

**策略 3: 使用測試資料工廠**

```python
# tests/factories.py
import factory
from datetime import datetime, timedelta

class UserFactory(factory.Factory):
    class Meta:
        model = dict

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    password = "MyS3cur3P@ssw0rd!XyZ"
    name = factory.Faker('name')

class RecordFactory(factory.Factory):
    class Meta:
        model = dict

    type = "expense"
    amount = factory.Faker('pyfloat', left_digits=3, right_digits=2, positive=True)
    category = factory.Faker('random_element', elements=['午餐', '交通', '娛樂'])
    date = factory.LazyFunction(lambda: datetime.now().strftime("%Y-%m-%d"))
    description = factory.Faker('sentence')
```

---

## 覆蓋率目標

### 總體覆蓋率要求

| 類型 | 當前 | 目標 | 說明 |
|------|------|------|------|
| **後端** | 74% | 90% | 逐步提升至 90% |
| **前端** | 0% | 80% | 新增測試框架後達到 |
| **整體** | 37% | 85% | 加權平均 |

### 分模組覆蓋率目標

**後端:**

| 模組 | 目標覆蓋率 | 優先級 | 原因 |
|------|-----------|--------|------|
| `auth.py` | 95% | 🔴 高 | 安全關鍵 |
| `main.py` (API 端點) | 90% | 🔴 高 | 核心功能 |
| `manage_password_rules.py` | 95% | 🔴 高 | 安全關鍵 |
| 其他工具函數 | 80% | 🟡 中 | 輔助功能 |

**前端:**

| 模組 | 目標覆蓋率 | 優先級 |
|------|-----------|--------|
| `config.js` | 90% | 🔴 高 |
| `utils.js` | 90% | 🔴 高 |
| `api.js` | 85% | 🔴 高 |
| `events.js` | 95% | 🔴 高 |
| `auth.js` | 85% | 🔴 高 |
| `records.js` | 85% | 🔴 高 |
| `components.js` | 75% | 🟡 中 |
| `charts.js` | 70% | 🟡 中 |
| `stats.js` | 80% | 🟡 中 |
| `budget.js` | 80% | 🔴 高 |
| `export.js` | 70% | 🟢 低 |
| `settings.js` | 75% | 🟡 中 |
| `pwa.js` | 60% | 🟢 低 |

### 覆蓋率例外

某些代碼可能無需測試或難以測試：

```python
# backend/.coveragerc
[run]
omit =
    */tests/*
    */venv/*
    */migrations/*
    */__pycache__/*
    */site-packages/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
```

### 覆蓋率監控

**在 CI/CD 中強制覆蓋率:**

```yaml
# .github/workflows/test.yml
- name: Check coverage threshold
  run: |
    cd backend
    pytest --cov=. --cov-report=term --cov-fail-under=90
```

**Codecov 整合:**

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    file: ./backend/coverage.xml
    flags: backend
    fail_ci_if_error: true
```

---

## CI/CD 整合

### GitHub Actions 工作流程設計

**完整測試流程:**

```
┌─────────────────┐
│   Push/PR       │
└────────┬────────┘
         │
         ├──────────┬──────────┬──────────┬──────────┐
         │          │          │          │          │
         ▼          ▼          ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ Lint   │ │後端測試│ │前端測試│ │ E2E   │ │安全掃描│
    └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘
         │          │          │          │          │
         └──────────┴──────────┴──────────┴──────────┘
                              │
                              ▼
                        ┌──────────┐
                        │部署到測試 │
                        │   環境   │
                        └─────┬────┘
                              │
                        (手動審核)
                              │
                              ▼
                        ┌──────────┐
                        │部署到生產 │
                        └──────────┘
```

### 測試工作流程分類

**1. 快速反饋流程 (< 5分鐘)**

每次 push 到任何分支時執行：

```yaml
# .github/workflows/quick-check.yml
name: Quick Check

on: [push]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint Backend
        run: |
          cd backend
          pip install flake8 black
          flake8 . --select=E9,F63,F7,F82
          black --check .

      - name: Lint Frontend
        run: |
          cd frontend
          npm install
          npm run lint

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backend Unit Tests
        run: |
          cd backend
          pip install -r requirements-dev.txt
          pytest -m "unit and not slow" --maxfail=1
```

**2. 完整測試流程 (< 15分鐘)**

PR 和 push 到 main/develop 時執行：

```yaml
# .github/workflows/full-test.yml
name: Full Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements-dev.txt

      - name: Run all backend tests
        env:
          MONGO_URI: mongodb://localhost:27017/
          JWT_SECRET: test-jwt-secret
        run: |
          cd backend
          pytest --cov=. --cov-report=xml --cov-report=html

      - name: Check coverage
        run: |
          cd backend
          coverage report --fail-under=90

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./backend/coverage.xml

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: |
          cd frontend
          npm ci

      - name: Run frontend tests
        run: |
          cd frontend
          npm test -- --coverage

      - name: Check coverage
        run: |
          cd frontend
          npm run test:coverage-check

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Playwright
        run: |
          cd frontend
          npm ci
          npx playwright install --with-deps

      - name: Start Backend
        run: |
          cd backend
          pip install -r requirements.txt
          python main.py &
          sleep 5
        env:
          MONGO_URI: ${{ secrets.TEST_MONGO_URI }}
          JWT_SECRET: test-jwt-secret

      - name: Start Frontend
        run: |
          cd frontend
          python -m http.server 8080 &
          sleep 2

      - name: Run E2E tests
        run: |
          cd frontend
          npx playwright test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

**3. 夜間測試流程 (無時間限制)**

每天執行完整測試，包括慢速測試和性能測試：

```yaml
# .github/workflows/nightly.yml
name: Nightly Full Suite

on:
  schedule:
    - cron: '0 2 * * *'  # 每天 02:00 UTC
  workflow_dispatch:

jobs:
  comprehensive-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run all tests including slow ones
        run: |
          cd backend
          pytest --cov=. -m "" --maxfail=0

      - name: Performance tests
        run: |
          cd backend
          pip install locust
          locust -f tests/performance/locustfile.py --headless -u 100 -r 10 -t 5m

      - name: Security scan
        run: |
          pip install safety
          safety check --json
```

### 部署工作流程

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests, e2e-tests]
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Zeabur
        run: |
          echo "✅ All tests passed! Deploying to Zeabur..."
          # Zeabur 會自動從 Git push 觸發部署

      - name: Notify team
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: '✅ Deployed to production successfully!'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### 測試結果報告

**Codecov 覆蓋率追蹤:**

```yaml
- name: Upload coverage reports
  uses: codecov/codecov-action@v4
  with:
    files: ./backend/coverage.xml,./frontend/coverage/lcov.info
    flags: unittests
    name: codecov-umbrella
    fail_ci_if_error: true
```

**測試報告匯總:**

```yaml
- name: Publish Test Report
  uses: dorny/test-reporter@v1
  if: always()
  with:
    name: Test Results
    path: '**/test-results/*.xml'
    reporter: jest-junit
```

---

## 測試排程與維護

### 測試執行頻率

| 測試類型 | 執行時機 | 頻率 |
|---------|---------|------|
| **Lint** | 每次 commit | 即時 |
| **單元測試** | 每次 push | 即時 |
| **整合測試** | PR + push to main/develop | 每次變更 |
| **E2E 測試 (關鍵流程)** | PR + push to main | 每次變更 |
| **E2E 測試 (完整)** | 夜間排程 | 每日 |
| **性能測試** | 夜間排程 + 每週 | 定期 |
| **安全掃描** | 夜間排程 | 每日 |
| **依賴更新檢查** | 自動 PR (Dependabot) | 每週 |

### 測試維護策略

**1. Flaky Test 管理**

```python
# 標記 flaky tests
@pytest.mark.flaky(reruns=3, reruns_delay=2)
def test_sometimes_fails():
    pass

# 追蹤並修復
# 使用 pytest-flakefinder 找出不穩定的測試
pytest --flake-finder
```

**2. 測試代碼審查清單**

在 PR 中包含測試時，檢查：

- [ ] 測試名稱清楚描述測試場景
- [ ] 測試獨立，不依賴執行順序
- [ ] 測試資料在測試後清理
- [ ] Mock 使用適當，不過度 mock
- [ ] 測試覆蓋正常和異常情況
- [ ] 斷言清晰，失敗時容易除錯

**3. 測試覆蓋率追蹤**

```bash
# 生成覆蓋率趨勢報告
coverage report --show-missing
coverage html

# 在 CI 中記錄覆蓋率變化
echo "$(date),$(coverage report | grep TOTAL | awk '{print $NF}')" >> coverage-history.csv
```

**4. 定期測試審計**

每季度進行：

- [ ] 檢查是否有未執行的測試
- [ ] 移除過時的測試
- [ ] 更新測試資料
- [ ] 審查測試覆蓋率盲點
- [ ] 更新測試文檔

### 測試失敗處理流程

```
測試失敗
   │
   ├─ 是新變更導致？
   │    ├─ 是 → 修復代碼
   │    └─ 否 → 往下檢查
   │
   ├─ 是 Flaky Test？
   │    ├─ 是 → 修復測試 + 標記 @pytest.mark.flaky
   │    └─ 否 → 往下檢查
   │
   ├─ 是環境問題？
   │    ├─ 是 → 修復環境配置
   │    └─ 否 → 往下檢查
   │
   └─ 真實 Bug → 建立 Issue + 修復
```

---

## 附錄

### A. 測試工具安裝指南

**後端:**

```bash
cd backend

# 安裝開發依賴
pip install -r requirements-dev.txt

# 或手動安裝
pip install pytest pytest-cov pytest-mock pytest-flask mongomock
pip install black flake8 mypy
pip install locust safety
```

**前端 (Vitest 方案):**

```bash
cd frontend

# 初始化 package.json
npm init -y

# 安裝測試依賴
npm install -D vitest @vitest/ui jsdom
npm install -D @testing-library/dom @testing-library/user-event
npm install -D playwright @playwright/test

# 安裝覆蓋率工具
npm install -D @vitest/coverage-v8
```

**前端 (Jest 方案):**

```bash
npm install -D jest @types/jest jest-environment-jsdom
npm install -D @testing-library/dom @testing-library/jest-dom
npm install -D playwright @playwright/test
```

### B. 參考資料

**測試理論:**
- [Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) - Martin Fowler
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

**工具文檔:**
- [pytest](https://docs.pytest.org/)
- [Vitest](https://vitest.dev/)
- [Playwright](https://playwright.dev/)
- [Locust](https://docs.locust.io/)

**安全測試:**
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [OWASP ZAP](https://www.zaproxy.org/docs/)

### C. 測試檢查清單

**每次 PR 前:**

- [ ] 所有單元測試通過
- [ ] 新代碼有對應測試
- [ ] 覆蓋率未降低
- [ ] Lint 檢查通過
- [ ] 本地執行 E2E 測試 (關鍵流程)

**部署到測試環境前:**

- [ ] 所有 CI 測試通過
- [ ] E2E 測試通過
- [ ] 性能測試通過 (如有變更)
- [ ] 安全掃描無高危漏洞

**部署到生產環境前:**

- [ ] 測試環境驗證完成
- [ ] Smoke Test 通過
- [ ] 監控告警配置完成
- [ ] 回滾計畫準備完成

---

## 總結

本測試策略文件提供了完整的測試規劃，涵蓋：

✅ **後端測試** - 單元、整合、API 測試 (當前 74% → 目標 90%)
✅ **前端測試** - 單元、整合、視覺測試 (當前 0% → 目標 80%)
✅ **E2E 測試** - 關鍵使用者流程、跨瀏覽器測試
✅ **性能測試** - 負載測試、前端性能、資料庫性能
✅ **安全測試** - OWASP Top 10、依賴掃描、滲透測試
✅ **CI/CD 整合** - 多階段工作流程、自動化部署
✅ **維護策略** - Flaky test 管理、定期審計

**下一步行動:**

1. 📋 審查並確認測試策略
2. 🔧 選擇前端測試框架 (Vitest/Jest)
3. 📝 建立前端測試基礎設施
4. 🧪 撰寫缺失的後端測試
5. 🚀 撰寫 E2E 測試
6. 🔄 更新 CI/CD 工作流程
7. 📊 設定覆蓋率監控

---

**文件版本:** 1.0
**最後更新:** 2026-02-28
**維護者:** Development Team
**下次審查:** 2026-05-28 (每 3 個月)
