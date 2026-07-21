# CLAUDE.md — 記帳系統

@~/.claude/rules/common/claude-md-guide.md
@~/.claude/rules/common/development-workflow.md
@~/.claude/rules/common/git-workflow.md
@~/.claude/rules/common/coding-style.md
@~/.claude/rules/python/coding-style.md
@~/.claude/rules/typescript/coding-style.md

> 通用操作規則（Bash、git、commit、分支主幹、程式碼風格、memory 維護）見 `~/.claude/CLAUDE.md`。本檔只列本專案專屬內容。

## 向下兼容原則

所有新功能、重構或優化，必須保持向下兼容：

- **API**：現有端點的參數、回應格式不可破壞；新增參數必須有預設值
- **資料庫**：不可刪除或重命名現有欄位；新增欄位必須有預設值或允許 null
- **前端**：不可移除現有的 HTML id/class（若其他模組有依賴）；JS 公開介面（window.xxx）不可改名
- **測試**：現有測試不可因重構而失敗；新功能必須補上對應測試

如需破壞性變更，必須先與使用者確認並在 CHANGELOG.md 標注為 Breaking Change。

## 分支策略（本專案額外）

分支主幹見全域，本專案額外：
- `develop`：CI 自動觸發測試
- `release`：CI 自動觸發測試（**不含部署**）。正式環境部署完全手動：SSH 進 NAS 執行 `docker compose up -d --build --force-recreate`，詳見 [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md)。

---

## 架構總覽

```
frontend/（純靜態 HTML + Vanilla JS）
    ↕ HTTP Fetch API (JWT Bearer Token)
backend/（Flask Python API）
    ↕ PyMongo
MongoDB（accounting_db）
```

前端與後端分開部署。前端透過 `resolveBackendUrl()`（`frontend/v2/js/config.js`）自動偵測後端 URL（本地 → localhost:5001；區網 IP → 對應 IP:5001；`*.ts.net` Tailscale 網域 → 同源相對路徑，由 nginx 依 `/test/` 前綴分流至正式/測試環境）。正式環境為自架 NAS，透過 Docker Compose + nginx reverse proxy 手動部署，無任何 CI/CD 自動部署機制，詳見 [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md)。

### 後端（`backend/`）

Flask 應用程式，路由拆分為 `backend/routes/` 目錄下的 Blueprint 模組：

- **`main.py`**：Flask app 主體，設定 CORS、gzip 壓縮、速率限制、CSRF 防護，並以 `register_blueprints()` 統一載入所有路由
- **`auth.py`**：獨立認證模組，處理密碼強度驗證（多層規則、熵值計算）、bcrypt 雜湊、JWT 簽發
- **`extensions.py`**：共用工具：`require_auth` JWT 驗證 decorator、Flask-Limiter 實例、輸入驗證函式（`validate_amount`、`validate_category` 等）
- **`db.py`**：MongoDB 連線初始化，暴露各 collection 物件
- **`routes/`**：各功能 Blueprint
  - `auth.py` — 登入、註冊、驗證、忘記/重設密碼、密碼強度檢查
  - `user.py` — 個人資料、修改密碼
  - `records.py` — 記帳記錄 CRUD
  - `stats.py` — 統計、趨勢、期間比較、整合概覽
  - `budget.py` — 預算設定
  - `recurring.py` — 定期收支
  - `debts.py` — 欠款追蹤（含多人分帳、還款、結清）
  - `io.py` — 匯出（CSV/Excel/JSON）、匯入

**速率限制**：Flask-Limiter，以 JWT user_id 識別；記錄查詢 100/min；新增/更新/刪除 50/min；註冊端點每 IP 每小時 5 次。

**API 路由前綴**：
- `/api/auth/` — 認證（登入、註冊、驗證、忘記/重設密碼）
- `/api/user/` — 用戶個人資料、修改密碼
- `/admin/api/accounting/` — 記帳記錄、統計、預算、匯出匯入
- `/admin/api/recurring/` — 定期收支
- `/admin/api/debts/` — 欠款追蹤
- `/admin/api/stats/` — 整合財務概覽
- `/` 或 `/health` — 健康檢查（無需認證）

### 前端（`frontend/`）

單頁應用程式（SPA），主 HTML 為 `index.html`，JS 邏輯全部模組化於 `js-refactored/`（ES Modules）：

**模組載入順序**（`main.js` 控制）：
1. **基礎層**：`config.js`（後端 URL 偵測、`debugLog`、分類資料）、`utils.js`（`escapeHtml`、`showToast`、`showConfirm`、`debounce`）、`api.js`（統一 Fetch 封裝、Token 管理、401 處理）、`events.js`（EventBus 事件匯流排、EVENTS 常量）
2. **功能層**：`auth.js`（登入/註冊/登出/密碼管理）、`components.js`（Router、CustomKeyboard、SwipeToDelete、LongPressMenu）、`categories.js`（分類選擇器、篩選器）
3. **核心層**：`stats.js`（統計數字、動畫、Stale-while-revalidate）、`records.js`（記錄 CRUD、分頁、篩選）、`charts.js`（支出圓餅圖、趨勢折線圖）、`budget.js`（預算設定與使用率）
4. **附加層**：`export.js`（匯出 CSV/Excel/JSON、匯入）、`settings.js`（帳號設定）、`pwa.js`（Service Worker、安裝提示、離線同步）、`analytics.js`（期間比較、日期快速切換）、`recurring.js`（定期收支）、`theme.js`（深色/淺色/系統主題）、`debts.js`（欠款追蹤）

模組間通訊透過 **EventBus**（`events.js`）解耦，不直接呼叫彼此的函式。各模組透過 `window.xxx` 暴露函式供 HTML `onclick` 呼叫。

PWA 相關：`service-worker.js`（快取策略、版本號控制）、`manifest.json`、IndexedDB（離線操作佇列）。

### 資料庫（MongoDB `accounting_db`）

五個集合：`users`、`records`、`budget`、`recurring`、`debts`。詳細 schema 見 `README.md`。

### 測試架構

- **後端單元測試**：`backend/tests/`（pytest），使用 `conftest.py` 共享 fixtures，測試時設定 `TESTING=true` 環境變數
- **E2E 測試**：`frontend/tests/e2e/`（Playwright），測試檔案：`auth.spec.js`、`records.spec.js`、`budget-stats.spec.js`、`settings.spec.js`；同一 spec 內串行執行（避免 MongoDB 帳號資料競爭）

---

## 常用指令

### 後端

```bash
# 啟動後端
python backend/main.py                                        # http://localhost:5001

# 安裝依賴
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt                   # 含測試工具

# 後端測試（從根目錄執行）
TESTING=true pytest backend/tests/ -v
TESTING=true pytest backend/tests/test_auth.py                # 單一檔案
TESTING=true pytest backend/tests/test_auth.py::TestPasswordValidation::test_password_too_short  # 單一測試
TESTING=true pytest backend/tests/ --cov=backend --cov-report=term-missing  # 含覆蓋率（目標 ≥ 90%）
TESTING=true pytest backend/tests/ -m unit                    # 只跑單元測試
TESTING=true pytest backend/tests/ -m "not slow"              # 跳過慢速測試

# 格式化
black backend/                                                # 自動修正格式
black --check backend/                                        # 只檢查不修正
```

### 前端

```bash
# 啟動前端靜態伺服器
python -m http.server 8081 --directory frontend               # http://localhost:8081
# 注意：port 8080 在 Windows 上可能被其他程式佔用（如 FANUC），改用 8081

# 安裝 E2E 測試依賴
npm install --prefix frontend/tests

# E2E 測試
npx playwright test --config frontend/tests/playwright.config.js           # 預設只跑 Chromium
BROWSERS=all npx playwright test --config frontend/tests/playwright.config.js  # 跑全瀏覽器
npx playwright test e2e/auth.spec.js --config frontend/tests/playwright.config.js  # 單一檔案
npx playwright show-report                                    # 查看 HTML 報告
```

## push 前必須執行

測試是「推送前的最後守門員」，在一個功能/任務完成、準備 `git push` 時執行一次即可，**不需要每次 commit 後都跑**。

```bash
# 1. 後端格式檢查
black --check backend/

# 2. 後端單元測試
TESTING=true pytest backend/tests/ -v

# 3. E2E 測試（需先啟動後端）
npx playwright test --config frontend/tests/playwright.config.js
```

如有失敗，必須先修正才能 push。禁止在測試失敗或未跑測試的狀態下推送到遠端。

---

## 程式碼風格

### Python（後端）
- 工具：**Black**（每行 88 字元，雙引號，4 空格縮排）
- 命名額外：私有變數用 `_leading_underscore`

### JavaScript（前端）
- 縮排：2 空格；字串：單引號
- 禁止在生產環境使用 `console.log`，改用 `debugLog()`（`config.js` 匯出，僅在 localhost 輸出）

---

## 前端更新必做事項

每次修改前端後，**必須**更新 `frontend/service-worker.js` 第 14 行的版本號：

```javascript
const CACHE_NAME = 'accounting-system-vX.Y.Z';
```

版本號規則：Bug 修復 → PATCH+1；新功能 → MINOR+1，PATCH 歸零；重大變更 → MAJOR+1。
詳見 `frontend/UPDATE_CHECKLIST.md`。

---

## 環境變數（`backend/.env`）

| 變數 | 必填 | 說明 |
|------|:----:|------|
| `MONGO_URI` | ✅ | MongoDB 連線字串 |
| `JWT_SECRET` | ✅ | JWT 簽名金鑰（32 字元以上） |
| `FRONTEND_URLS` | | 允許 CORS 的前端網址（逗號分隔，預設含 8080/8081） |
| `SMTP_HOST` | | Gmail SMTP 伺服器（預設 smtp.gmail.com） |
| `SMTP_PORT` | | SMTP 埠號（587=TLS） |
| `SMTP_USERNAME` | | Gmail 帳號 |
| `SMTP_PASSWORD` | | Gmail 應用程式密碼（16位） |
| `SMTP_FROM_EMAIL` | | 寄件者 Email |
| `PASSWORD_MIN_LENGTH` | | 最小密碼長度（預設 12） |
| `PASSWORD_MIN_ENTROPY` | | 最小熵值（預設 50 bits） |

測試用最小設定：`MONGO_URI=mongodb://localhost:27017/` + `JWT_SECRET=any-local-secret`

---

## 已知地雷 / 歷史包袱

- **`records.user_id` 舊資料可能為空**：資料庫中歷史記錄的 `user_id` 欄位可能為 null，查詢時必須做 null 處理，不可假設一定有值。
- **`records` vs `recurring` 的 `user_id` 型別不同**：`records.user_id` 是 **ObjectId**（經 `require_auth` 轉換），`recurring.user_id` 也是 ObjectId，但歷史資料可能混有 String，跨集合查詢時注意。
- **不要硬寫後端 URL**：前端 `resolveBackendUrl()`（`frontend/v2/js/config.js`）會依執行環境自動切換後端位址（localhost:5001、區網 IP，或 NAS 的 `*.ts.net` 網域），任何地方都不要 hardcode URL。
- **Service Worker 版本號需手動更新**：每次修改前端後，必須升版 `frontend/service-worker.js` 第 14 行的 `CACHE_NAME`，否則用戶端快取不會自動清除。詳見「前端更新必做事項」。
- **E2E 測試並行策略**：同一 spec file 內**串行**（避免同帳號資料競爭），spec files **之間**才是並行（最多 4 workers）。不要在同一 spec file 內加 `test.parallel()`。
- **後端測試必須設 `TESTING=true`**：未設定時 Flask app 會連接真實 MongoDB，測試資料會污染生產資料庫。
- **Port 8080 可能被佔用**：Windows 上 FANUC 等工業軟體會佔用 8080；改用 8081，並確保 `backend/.env` 的 `FRONTEND_URLS` 包含 `http://localhost:8081`，重啟後端才能讓 CORS 生效。
- **路由在 Blueprint，不在 main.py**：修改或新增 API 端點請操作 `backend/routes/` 下對應檔案，而非 `main.py`。`main.py` 只負責 app 設定與 blueprint 註冊。
- **`SwipeToDelete` 需傳入元素**：`new SwipeToDelete(element)` 必須傳入具體 DOM 元素，不像其他組件無參數構建；在 `records.js` 的 `renderRecords()` 中為每張卡片單獨 new 一個實例。

---

## 相關文件

| 文件 | 說明 |
|------|------|
| [`docs/API.md`](docs/API.md) | 完整 API 端點文件（請求/回應範例） |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 開發環境設定、提交規範 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 專案發展藍圖（短期/中期/長期目標） |
| [`docs/E2E_TESTING_GUIDE.md`](docs/E2E_TESTING_GUIDE.md) | Playwright E2E 測試完整指南 |
| [`docs/FRONTEND_TESTING.md`](docs/FRONTEND_TESTING.md) | 前端測試實施指南 |
| [`docs/TESTING_BEST_PRACTICES.md`](docs/TESTING_BEST_PRACTICES.md) | 測試最佳實踐指南 |
| [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md) | NAS 同域雙環境部署操作手冊（正式 `/` + 測試 `/test/`） |
| [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md) | 前端更新版本號檢查清單（Service Worker） |
| [`frontend/PWA-README.md`](frontend/PWA-README.md) | PWA 安裝與離線功能說明 |
| [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md) | 密碼強度規則與環境變數設定 |
| [`backend/tests/README.md`](backend/tests/README.md) | 後端測試說明與覆蓋率目標 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本更新日誌 |
