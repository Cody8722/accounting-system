import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置文件
 * @see https://playwright.dev/docs/test-configuration
 *
 * 並行策略：
 * - spec files 之間由 workers 並行（最多 4 個）
 * - 同一 spec file 內的測試串行（保持帳號隔離）
 * - 不使用 fullyParallel（避免同 file 的測試競搶同一 MongoDB 帳號的資料）
 */
export default defineConfig({
  testDir: './e2e',

  /** 測試超時時間 */
  timeout: 30000,

  /** 每個測試的重試次數 */
  retries: process.env.CI ? 2 : 0,

  /** 並行 worker 數量（spec files 之間並行） */
  workers: process.env.CI ? 2 : 4,

  /** Reporter 配置 */
  reporter: [
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['list'],
  ],

  /** 共用設定 */
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',

    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',

    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    actionTimeout: 10000,
    navigationTimeout: 20000,
  },

  /**
   * 測試項目配置
   *
   * 本地預設只跑 Chromium，避免跑 5 個瀏覽器導致速度過慢。
   * 需要跑全部瀏覽器時：BROWSERS=all npx playwright test
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    ...(process.env.BROWSERS === 'all'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
          { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
        ]
      : []),
  ],

  /** 本地開發伺服器配置（靜態前端） */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'python3 -m http.server 8080',
        cwd: '../',
        port: 8080,
        timeout: 30000,
        reuseExistingServer: true,
      },
});
