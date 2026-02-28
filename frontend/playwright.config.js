import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置文件
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* 測試超時時間 */
  timeout: 30000,

  /* 每個測試的重試次數 */
  retries: process.env.CI ? 2 : 0,

  /* 並行執行的 worker 數量 */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter 配置 */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],

  /* 共用設定 */
  use: {
    /* 基礎 URL */
    baseURL: process.env.BASE_URL || 'http://localhost:8080',

    /* 截圖設定 */
    screenshot: 'only-on-failure',

    /* 錄影設定 */
    video: 'retain-on-failure',

    /* 追蹤設定 */
    trace: 'on-first-retry',

    /* 瀏覽器上下文選項 */
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    /* 等待設定 */
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  /* 測試項目配置 */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 啟用 localStorage
        storageState: undefined
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: undefined
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: undefined
      },
    },

    /* 手機測試 */
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: undefined
      },
    },

    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
        storageState: undefined
      },
    },
  ],

  /* 本地開發伺服器配置 */
  webServer: {
    command: 'python3 -m http.server 8080',
    cwd: './',
    port: 8080,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
