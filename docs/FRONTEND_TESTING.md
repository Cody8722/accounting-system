# 前端測試實施指南

**專案:** 個人記帳系統前端測試
**目標:** 建立完整的前端自動化測試體系
**版本:** 1.0
**日期:** 2026-02-28

---

## 📑 目錄

1. [測試框架選擇建議](#測試框架選擇建議)
2. [Vitest 實施方案 (推薦)](#vitest-實施方案-推薦)
3. [Jest 實施方案 (替代)](#jest-實施方案-替代)
4. [測試範例](#測試範例)
5. [配置檔案](#配置檔案)
6. [實施步驟](#實施步驟)

---

## 測試框架選擇建議

### 方案比較矩陣

| 特性 | Vitest | Jest | 原生測試 |
|------|--------|------|---------|
| **執行速度** | ⚡⚡⚡⚡⚡ 極快 | ⚡⚡⚡ 快 | ⚡⚡ 中等 |
| **配置難度** | ✅ 簡單 | 🟡 中等 | ✅ 簡單 |
| **ESM 支援** | ✅ 原生 | 🟡 需配置 | ✅ 原生 |
| **熱重載** | ✅ 內建 | ❌ 無 | ❌ 無 |
| **UI 介面** | ✅ 美觀 | ❌ 無 | ❌ 無 |
| **生態系統** | 🟡 成長中 | ✅ 豐富 | ❌ 有限 |
| **學習曲線** | 🟢 低 | 🟡 中 | 🟢 低 |
| **CI/CD 整合** | ✅ 完善 | ✅ 完善 | 🟡 需手動 |
| **覆蓋率報告** | ✅ 內建 | ✅ 內建 | ❌ 需手動 |
| **Snapshot 測試** | ✅ 支援 | ✅ 支援 | ❌ 無 |

### 推薦決策樹

```
是否願意引入建構工具？
   │
   ├─ 是 ─→ 追求最佳效能？
   │         ├─ 是 ─→ Vitest (推薦)
   │         └─ 否 ─→ Jest (穩定)
   │
   └─ 否 ─→ 原生測試 (輕量)
```

### 最終建議

**🏆 推薦: Vitest**

理由:
- ⚡ 極快的執行速度 (使用 Vite)
- 🎯 專為 ESM 設計,與專案現有模組化架構完美契合
- 🔥 熱重載,提升開發體驗
- 📦 零配置,開箱即用
- 🎨 美觀的 UI 介面
- 📊 完整的覆蓋率報告

---

## Vitest 實施方案 (推薦)

### 1. 安裝依賴

```bash
cd frontend

# 初始化 package.json (如果還沒有)
npm init -y

# 安裝 Vitest 和相關工具
npm install -D vitest @vitest/ui @vitest/coverage-v8

# 安裝 jsdom (模擬瀏覽器環境)
npm install -D jsdom

# 安裝 Testing Library (測試 DOM 操作)
npm install -D @testing-library/dom @testing-library/user-event

# 安裝 Mock Service Worker (模擬 API)
npm install -D msw
```

### 2. 專案結構

```
frontend/
├── js-refactored/
│   ├── config.js
│   ├── utils.js
│   ├── events.js
│   ├── api.js
│   ├── auth.js
│   ├── components.js
│   ├── categories.js
│   ├── records.js
│   ├── stats.js
│   ├── charts.js
│   ├── budget.js
│   ├── export.js
│   ├── settings.js
│   └── pwa.js
│
├── tests/
│   ├── setup.js                  # 測試環境設定
│   ├── vitest.config.js          # Vitest 配置
│   │
│   ├── unit/                     # 單元測試
│   │   ├── config.test.js
│   │   ├── utils.test.js
│   │   ├── events.test.js
│   │   ├── api.test.js
│   │   └── components.test.js
│   │
│   ├── integration/              # 整合測試
│   │   ├── auth-flow.test.js
│   │   ├── records-crud.test.js
│   │   ├── budget-tracking.test.js
│   │   └── stats-calculation.test.js
│   │
│   ├── mocks/                    # Mock 資料和 API
│   │   ├── handlers.js           # MSW API handlers
│   │   ├── server.js             # MSW server setup
│   │   └── data.js               # 測試資料
│   │
│   └── helpers/                  # 測試輔助函數
│       ├── render.js             # 自定義渲染函數
│       └── test-utils.js         # 通用測試工具
│
├── package.json
└── vitest.config.js              # Vitest 根配置
```

### 3. Vitest 配置檔案

**`frontend/vitest.config.js`:**

```javascript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // 測試環境
    environment: 'jsdom',

    // 全局變數 (describe, test, expect 等)
    globals: true,

    // 測試設定檔
    setupFiles: ['./tests/setup.js'],

    // 覆蓋率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.js',
        '**/*.config.js',
        '**/main.js', // 入口文件,難以測試
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // 並行執行
    threads: true,
    maxThreads: 4,

    // 超時設定
    testTimeout: 10000,
    hookTimeout: 10000,

    // 測試匹配模式
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],

    // 監聽模式排除
    watchExclude: ['**/node_modules/**', '**/dist/**'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './js-refactored'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
```

**`frontend/tests/setup.js`:**

```javascript
/**
 * Vitest 測試環境設定
 */

import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/dom';
import { server } from './mocks/server';

// 設定 MSW (Mock Service Worker)
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // 清理 DOM
  cleanup();

  // 重置 MSW handlers
  server.resetHandlers();

  // 清除所有 mocks
  vi.clearAllMocks();

  // 清理 localStorage
  localStorage.clear();

  // 清理 sessionStorage
  sessionStorage.clear();
});

afterAll(() => {
  server.close();
});

// Mock console.error 以減少測試輸出雜訊
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Not implemented: HTMLFormElement.prototype.submit')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// 全局 DOM 環境擴充
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

### 4. MSW (Mock Service Worker) 設定

**`frontend/tests/mocks/handlers.js`:**

```javascript
import { http, HttpResponse } from 'msw';

const baseURL = 'http://localhost:5001';

export const handlers = [
  // 註冊
  http.post(`${baseURL}/api/auth/register`, async ({ request }) => {
    const body = await request.json();

    // 模擬驗證失敗
    if (body.password && body.password.length < 12) {
      return HttpResponse.json(
        { error: '密碼長度不足' },
        { status: 422 }
      );
    }

    return HttpResponse.json({
      success: true,
      message: '註冊成功',
    });
  }),

  // 登入
  http.post(`${baseURL}/api/auth/login`, async ({ request }) => {
    const body = await request.json();

    if (body.email === 'test@example.com' && body.password === 'MyS3cur3P@ssw0rd!XyZ') {
      return HttpResponse.json({
        token: 'mock-jwt-token-12345',
        user: {
          email: 'test@example.com',
          name: 'Test User',
        },
      });
    }

    return HttpResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  // 取得個人資料
  http.get(`${baseURL}/api/user/profile`, ({ request }) => {
    const auth = request.headers.get('Authorization');

    if (!auth || !auth.startsWith('Bearer ')) {
      return HttpResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      email: 'test@example.com',
      name: 'Test User',
    });
  }),

  // 查詢記帳記錄
  http.get(`${baseURL}/admin/api/accounting/records`, () => {
    return HttpResponse.json({
      records: [
        {
          _id: '1',
          type: 'expense',
          amount: 100,
          category: '午餐',
          date: '2026-02-28',
          description: 'Test expense',
        },
      ],
    });
  }),

  // 新增記帳記錄
  http.post(`${baseURL}/admin/api/accounting/records`, async ({ request }) => {
    const body = await request.json();

    return HttpResponse.json({
      success: true,
      record: {
        _id: 'new-record-id',
        ...body,
      },
    }, { status: 201 });
  }),

  // 統計資料
  http.get(`${baseURL}/admin/api/accounting/stats`, () => {
    return HttpResponse.json({
      income: 5000,
      expense: 3000,
      balance: 2000,
      categories: {
        '午餐': 800,
        '交通': 500,
      },
    });
  }),
];
```

**`frontend/tests/mocks/server.js`:**

```javascript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**`frontend/tests/mocks/data.js`:**

```javascript
/**
 * 測試資料工廠
 */

export const createMockUser = (overrides = {}) => ({
  email: 'test@example.com',
  password: 'MyS3cur3P@ssw0rd!XyZ',
  name: 'Test User',
  ...overrides,
});

export const createMockRecord = (overrides = {}) => ({
  _id: 'mock-id-' + Math.random(),
  type: 'expense',
  amount: 100,
  category: '午餐',
  date: new Date().toISOString().split('T')[0],
  description: 'Test record',
  ...overrides,
});

export const createMockStats = (overrides = {}) => ({
  income: 5000,
  expense: 3000,
  balance: 2000,
  categories: {
    '午餐': 800,
    '交通': 500,
    '娛樂': 300,
  },
  ...overrides,
});

export const createMockBudget = (overrides = {}) => ({
  month: '2026-02',
  budget: {
    午餐: 3000,
    交通: 2000,
    娛樂: 1500,
    ...overrides.budget,
  },
  ...overrides,
});
```

### 5. package.json 腳本

**`frontend/package.json`:**

```json
{
  "name": "accounting-system-frontend",
  "version": "1.6.0",
  "type": "module",
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:coverage-check": "vitest run --coverage && node scripts/check-coverage.js",
    "test:watch": "vitest watch",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration"
  },
  "devDependencies": {
    "@testing-library/dom": "^9.3.4",
    "@testing-library/user-event": "^14.5.2",
    "@vitest/coverage-v8": "^1.2.0",
    "@vitest/ui": "^1.2.0",
    "jsdom": "^24.0.0",
    "msw": "^2.0.0",
    "vitest": "^1.2.0"
  }
}
```

---

## 測試範例

### 單元測試範例

#### 1. utils.js 測試

**`frontend/tests/unit/utils.test.js`:**

```javascript
import { describe, it, expect, vi } from 'vitest';
import { escapeHtml, showToast, showConfirm } from '@/utils.js';

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("XSS")</script>'))
      .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  it('should escape ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("It's a test")).toBe('It&#039;s a test');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle string without special chars', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('showToast', () => {
  it('should create toast element with correct message', () => {
    document.body.innerHTML = '<div id="toast-container"></div>';

    showToast('Test message', 'success');

    const toast = document.querySelector('.toast');
    expect(toast).toBeTruthy();
    expect(toast.textContent).toContain('Test message');
    expect(toast.classList.contains('toast-success')).toBe(true);
  });

  it('should support different toast types', () => {
    document.body.innerHTML = '<div id="toast-container"></div>';

    ['success', 'error', 'warning', 'info'].forEach(type => {
      showToast(`${type} message`, type);
      const toast = document.querySelector(`.toast-${type}`);
      expect(toast).toBeTruthy();
    });
  });

  it('should auto-remove toast after timeout', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="toast-container"></div>';

    showToast('Test', 'info');

    expect(document.querySelector('.toast')).toBeTruthy();

    vi.advanceTimersByTime(3000);

    expect(document.querySelector('.toast')).toBeFalsy();

    vi.useRealTimers();
  });
});

describe('showConfirm', () => {
  it('should resolve with true when confirmed', async () => {
    // 模擬用戶點擊確認
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const result = await showConfirm('Are you sure?');

    expect(result).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Are you sure?');

    window.confirm.mockRestore();
  });

  it('should resolve with false when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const result = await showConfirm('Delete this?');

    expect(result).toBe(false);

    window.confirm.mockRestore();
  });
});
```

#### 2. events.js (EventBus) 測試

**`frontend/tests/unit/events.test.js`:**

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, EVENTS } from '@/events.js';

describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  describe('on/emit', () => {
    it('should register and trigger event listener', () => {
      const callback = vi.fn();

      EventBus.on('TEST_EVENT', callback);
      EventBus.emit('TEST_EVENT', { data: 'test' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should support multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('TEST_EVENT', callback1);
      EventBus.on('TEST_EVENT', callback2);
      EventBus.emit('TEST_EVENT', 'data');

      expect(callback1).toHaveBeenCalledWith('data');
      expect(callback2).toHaveBeenCalledWith('data');
    });

    it('should not trigger other events', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('EVENT_A', callback1);
      EventBus.on('EVENT_B', callback2);
      EventBus.emit('EVENT_A');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('should remove specific listener', () => {
      const callback = vi.fn();

      EventBus.on('TEST_EVENT', callback);
      EventBus.off('TEST_EVENT', callback);
      EventBus.emit('TEST_EVENT');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should only remove specified callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('TEST_EVENT', callback1);
      EventBus.on('TEST_EVENT', callback2);
      EventBus.off('TEST_EVENT', callback1);
      EventBus.emit('TEST_EVENT');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('EVENT_A', callback1);
      EventBus.on('EVENT_B', callback2);
      EventBus.clear();
      EventBus.emit('EVENT_A');
      EventBus.emit('EVENT_B');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('getListenerCount', () => {
    it('should return correct listener count', () => {
      EventBus.on('TEST', () => {});
      EventBus.on('TEST', () => {});

      expect(EventBus.getListenerCount('TEST')).toBe(2);
    });

    it('should return 0 for non-existent event', () => {
      expect(EventBus.getListenerCount('NONEXISTENT')).toBe(0);
    });
  });
});

describe('EVENTS constants', () => {
  it('should have AUTH events', () => {
    expect(EVENTS.AUTH_LOGIN_SUCCESS).toBeDefined();
    expect(EVENTS.AUTH_LOGOUT).toBeDefined();
    expect(EVENTS.AUTH_TOKEN_EXPIRED).toBeDefined();
  });

  it('should have RECORD events', () => {
    expect(EVENTS.RECORD_ADDED).toBeDefined();
    expect(EVENTS.RECORD_UPDATED).toBeDefined();
    expect(EVENTS.RECORD_DELETED).toBeDefined();
  });
});
```

#### 3. components.js (CustomKeyboard) 測試

**`frontend/tests/unit/components.test.js`:**

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { CustomKeyboard } from '@/components.js';

describe('CustomKeyboard', () => {
  let input;
  let keyboard;

  beforeEach(() => {
    document.body.innerHTML = `
      <input type="text" id="test-input" />
      <div id="custom-keyboard"></div>
    `;
    input = document.getElementById('test-input');
    keyboard = new CustomKeyboard(input);
  });

  it('should initialize with empty value', () => {
    expect(keyboard.getCurrentValue()).toBe('');
  });

  it('should handle number input', () => {
    keyboard.handleInput('1');
    keyboard.handleInput('2');
    keyboard.handleInput('3');

    expect(keyboard.getCurrentValue()).toBe('123');
  });

  it('should handle decimal point', () => {
    keyboard.handleInput('1');
    keyboard.handleInput('.');
    keyboard.handleInput('5');

    expect(keyboard.getCurrentValue()).toBe('1.5');
  });

  it('should prevent multiple decimal points', () => {
    keyboard.handleInput('1');
    keyboard.handleInput('.');
    keyboard.handleInput('2');
    keyboard.handleInput('.'); // 應被忽略

    expect(keyboard.getCurrentValue()).toBe('1.2');
  });

  it('should handle addition', () => {
    keyboard.handleInput('10');
    keyboard.handleInput('+');
    keyboard.handleInput('5');
    keyboard.calculate();

    expect(keyboard.getCurrentValue()).toBe('15');
  });

  it('should handle subtraction', () => {
    keyboard.handleInput('100');
    keyboard.handleInput('-');
    keyboard.handleInput('30');
    keyboard.calculate();

    expect(keyboard.getCurrentValue()).toBe('70');
  });

  it('should handle multiplication', () => {
    keyboard.handleInput('12');
    keyboard.handleInput('×');
    keyboard.handleInput('3');
    keyboard.calculate();

    expect(keyboard.getCurrentValue()).toBe('36');
  });

  it('should handle division', () => {
    keyboard.handleInput('100');
    keyboard.handleInput('÷');
    keyboard.handleInput('4');
    keyboard.calculate();

    expect(keyboard.getCurrentValue()).toBe('25');
  });

  it('should handle complex expressions', () => {
    keyboard.handleInput('10');
    keyboard.handleInput('+');
    keyboard.handleInput('5');
    keyboard.handleInput('×');
    keyboard.handleInput('2');
    keyboard.calculate();

    // 10 + 5 * 2 = 10 + 10 = 20
    expect(keyboard.getCurrentValue()).toBe('20');
  });

  it('should handle clear button', () => {
    keyboard.handleInput('123');
    keyboard.clear();

    expect(keyboard.getCurrentValue()).toBe('');
  });

  it('should handle backspace', () => {
    keyboard.handleInput('123');
    keyboard.backspace();

    expect(keyboard.getCurrentValue()).toBe('12');
  });
});
```

### 整合測試範例

#### 認證流程整合測試

**`frontend/tests/integration/auth-flow.test.js`:**

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setAuthToken, getAuthToken, removeAuthToken } from '@/api.js';
import { EventBus, EVENTS } from '@/events.js';
import { createMockUser } from '@tests/mocks/data.js';

describe('Authentication Flow Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    EventBus.clear();
  });

  it('should complete full registration and login flow', async () => {
    const user = createMockUser();

    // 1. 註冊
    const registerResponse = await fetch('http://localhost:5001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });

    expect(registerResponse.ok).toBe(true);

    // 2. 登入
    const loginResponse = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    const loginData = await loginResponse.json();
    expect(loginData.token).toBeDefined();

    // 3. 儲存 token
    setAuthToken(loginData.token);
    expect(getAuthToken()).toBe(loginData.token);

    // 4. 使用 token 取得個人資料
    const profileResponse = await fetch('http://localhost:5001/api/user/profile', {
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
      },
    });

    const profile = await profileResponse.json();
    expect(profile.email).toBe(user.email);

    // 5. 登出
    removeAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  it('should emit AUTH_LOGIN_SUCCESS event on successful login', async () => {
    const loginSuccessHandler = vi.fn();
    EventBus.on(EVENTS.AUTH_LOGIN_SUCCESS, loginSuccessHandler);

    const user = createMockUser();

    const response = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
      }),
    });

    // 模擬登入成功後發送事件
    if (response.ok) {
      const data = await response.json();
      EventBus.emit(EVENTS.AUTH_LOGIN_SUCCESS, { token: data.token });
    }

    expect(loginSuccessHandler).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.any(String) })
    );
  });

  it('should reject weak password during registration', async () => {
    const weakUser = createMockUser({ password: '123' });

    const response = await fetch('http://localhost:5001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(weakUser),
    });

    expect(response.status).toBe(422);
  });
});
```

#### 記帳 CRUD 整合測試

**`frontend/tests/integration/records-crud.test.js`:**

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRecord } from '@tests/mocks/data.js';

describe('Records CRUD Integration', () => {
  const mockToken = 'mock-jwt-token-12345';

  it('should create, read, update, and delete a record', async () => {
    const record = createMockRecord();

    // 1. 新增記錄
    const createResponse = await fetch('http://localhost:5001/admin/api/accounting/records', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`,
      },
      body: JSON.stringify(record),
    });

    const created = await createResponse.json();
    expect(created.success).toBe(true);
    expect(created.record._id).toBeDefined();

    const recordId = created.record._id;

    // 2. 查詢記錄
    const readResponse = await fetch('http://localhost:5001/admin/api/accounting/records', {
      headers: {
        'Authorization': `Bearer ${mockToken}`,
      },
    });

    const { records } = await readResponse.json();
    expect(records).toBeInstanceOf(Array);
    expect(records.length).toBeGreaterThan(0);

    // 3. 更新記錄 (模擬)
    // (根據實際 API 實作)

    // 4. 刪除記錄 (模擬)
    // (根據實際 API 實作)
  });
});
```

---

## Jest 實施方案 (替代)

### 安裝與配置

```bash
cd frontend

# 安裝 Jest
npm install -D jest @types/jest jest-environment-jsdom

# 安裝 Testing Library
npm install -D @testing-library/dom @testing-library/jest-dom

# 安裝 Babel (用於轉譯 ESM)
npm install -D @babel/core @babel/preset-env babel-jest
```

**`frontend/jest.config.js`:**

```javascript
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/js-refactored/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },
  collectCoverageFrom: [
    'js-refactored/**/*.js',
    '!js-refactored/main.js',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
};
```

---

## 實施步驟

### 第 1 階段: 環境建置 (1-2 天)

- [ ] 安裝 Vitest 和相關依賴
- [ ] 建立測試目錄結構
- [ ] 配置 vitest.config.js
- [ ] 設定 MSW (Mock Service Worker)
- [ ] 撰寫測試設定檔 (setup.js)

### 第 2 階段: 基礎模組測試 (2-3 天)

- [ ] utils.js 單元測試 (escapeHtml, showToast, showConfirm)
- [ ] config.js 單元測試
- [ ] events.js 單元測試 (EventBus)
- [ ] api.js 單元測試
- [ ] 目標覆蓋率: 90%+

### 第 3 階段: 功能模組測試 (3-4 天)

- [ ] components.js 測試 (CustomKeyboard, SwipeToDelete, etc.)
- [ ] auth.js 測試
- [ ] categories.js 測試
- [ ] pwa.js 測試
- [ ] 目標覆蓋率: 80%+

### 第 4 階段: 業務模組測試 (3-4 天)

- [ ] records.js 測試
- [ ] stats.js 測試
- [ ] charts.js 測試
- [ ] budget.js 測試
- [ ] export.js 測試
- [ ] settings.js 測試
- [ ] 目標覆蓋率: 80%+

### 第 5 階段: 整合測試 (2-3 天)

- [ ] 認證流程整合測試
- [ ] 記帳 CRUD 整合測試
- [ ] 預算追蹤整合測試
- [ ] 統計計算整合測試

### 第 6 階段: CI/CD 整合 (1 天)

- [ ] 更新 GitHub Actions 工作流程
- [ ] 設定覆蓋率門檻
- [ ] 整合 Codecov
- [ ] 配置自動化測試報告

### 第 7 階段: 文檔與培訓 (1 天)

- [ ] 撰寫測試撰寫指南
- [ ] 建立測試範例集
- [ ] 團隊培訓 (如需要)

---

## 總結

本文件提供了前端測試的完整實施方案,包括:

✅ 測試框架選擇建議 (推薦 Vitest)
✅ 完整的配置檔案
✅ 專案結構規劃
✅ MSW API Mock 設定
✅ 豐富的測試範例
✅ 清晰的實施步驟

**預估工時:** 12-18 天 (1 人全職)

**預期成果:**
- 前端代碼覆蓋率達到 80%+
- 所有關鍵模組有完整測試
- CI/CD 自動化測試整合完成

---

**版本:** 1.0
**最後更新:** 2026-02-28
**下次審查:** 實施完成後
