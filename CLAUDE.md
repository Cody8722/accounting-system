# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 操作規則

- 禁止單獨使用 `cd`，優先使用相對路徑。
- 禁止使用 `cd ... && <指令>`，直接用 `<指令> path/to/target`。
- 避免複雜 Bash 組合：如需複雜操作，請分開多次執行。
- 每個 bash 呼叫是獨立 session，不依賴上一條指令的環境變數。
- 禁止使用 `sleep` 等待非同步任務；等待 GitHub Action 用 `gh run watch`。
- 執行刪除或移動指令時，無需再次確認。
- 修改檔案前必須先完整讀過，不靠假設。
- 不刪除未觸及的程式碼、注解、TODO。
- 不主動重構超出需求範圍的程式碼。
- 遇到不確定的需求先問，不自行假設後執行。
- 失敗時回報具體錯誤訊息與指令，不要空泛說「發生錯誤」。
- 不可覆寫 `.env` 檔案。
- 不可為了讓測試通過而修改測試邏輯，應修正程式碼本身。

## 向下兼容原則

所有新功能、重構或優化，必須保持向下兼容：

- **API**：現有端點的參數、回應格式不可破壞；新增參數必須有預設值
- **資料庫**：不可刪除或重命名現有欄位；新增欄位必須有預設值或允許 null
- **前端**：不可移除現有的 HTML id/class（若其他模組有依賴）；JS 公開介面（window.xxx）不可改名
- **測試**：現有測試不可因重構而失敗；新功能必須補上對應測試

如需破壞性變更，必須先與使用者確認並在 CHANGELOG.md 標注為 Breaking Change。

## Commit 規範

格式：`<類型>: <簡短描述>`

| 類型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修復 |
| `refactor` | 重構（非新功能、非 bug）|
| `docs` | 文件變更 |
| `test` | 測試相關 |
| `perf` | 效能優化 |
| `chore` | 建置工具或雜項變更 |
| `ci` | CI/CD 設定變更 |
| `style` | 格式調整（不影響邏輯）|

每約 5 個相關變更，或一個功能階段完成後才 commit，保持 git history 乾淨。

**commit 完成後必須立即推送到遠端**：`git push origin <當前分支>`，不可只 commit 不 push。

## Git 分支策略

```
feature/* → develop → release
```

- `feature/<name>`：所有新功能與 bug 修復在此開發
- `develop`：整合分支，CI 自動觸發測試
- `release`：生產前準備分支，CI 自動觸發測試 + 部署
- 直接 push 到 `develop` 僅限小修（文件、設定），功能一律開 feature branch

---

## 架構總覽

```
frontend/（純靜態 HTML + Vanilla JS）
    ↕ HTTP Fetch API (JWT Bearer Token)
backend/（Flask Python API）
    ↕ PyMongo
MongoDB（accounting_db）
```

前端與後端分開部署。前端透過 `detectBackendUrl()` 自動偵測後端 URL（本地 → localhost:5001；Zeabur → 自動替換網域）。

### 後端（`backend/`）

單一應用程式，所有路由集中於 `main.py`，認證邏輯分離至 `auth.py`：

- **`main.py`**：Flask app 主體，包含所有 API 路由（records、stats、budget、recurring）及中介層（JWT 驗證 decorator `@require_auth`、速率限制）
- **`auth.py`**：獨立認證模組，處理密碼強度驗證（多層規則、熵值計算）、bcrypt 雜湊、JWT 簽發
- **速率限制**：Flask-Limiter，以 JWT user_id 識別；每用戶每日 200 次、每小時 50 次；註冊端點每 IP 每小時 5 次

API 路由前綴：
- `/api/auth/` — 認證（登入、註冊、驗證）
- `/api/user/` — 用戶個人資料
- `/admin/api/accounting/` — 記帳記錄、統計、預算
- `/admin/api/recurring/` — 定期收支
- `/status` — 健康檢查

### 前端（`frontend/`）

單頁應用程式（SPA），主 HTML 為 `index.html`，JS 邏輯全部模組化於 `js-refactored/`（ES Modules）：

**模組載入順序**（`main.js` 控制）：
1. **基礎層**：`config.js`（後端 URL）、`utils.js`、`api.js`（統一 Fetch 封裝）、`events.js`（EventBus 事件匯流排）
2. **功能層**：`auth.js`（JWT 管理）、`components.js`（Router、SwipeToDelete、LongPressMenu）、`categories.js`
3. **核心層**：`stats.js`、`records.js`、`charts.js`、`budget.js`
4. **附加層**：`export.js`、`settings.js`、`pwa.js`、`analytics.js`、`recurring.js`、`theme.js`

模組間通訊透過 **EventBus**（`events.js`）解耦，不直接呼叫彼此的函式。

PWA 相關：`service-worker.js`（快取策略、版本號控制）、`manifest.json`、IndexedDB（離線操作佇列）。

### 資料庫（MongoDB `accounting_db`）

四個集合：`users`、`records`、`budget`、`recurring`。詳細 schema 見 `README.md`。

### 測試架構

- **後端單元測試**：`backend/tests/`（pytest），使用 `conftest.py` 共享 fixtures，測試時設定 `TESTING=true` 環境變數
- **E2E 測試**：`frontend/tests/e2e/`（Playwright），測試檔案：`auth.spec.js`、`records.spec.js`、`budget-stats.spec.js`、`settings.spec.js`；同一 spec 內串行執行（避免 MongoDB 帳號資料競爭）

---

## 常用指令

### 後端

```bash
# 啟動後端
python backend/main.py                        # http://localhost:5001

# 安裝依賴
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt   # 含測試工具

# 後端測試（需在 backend/ 目錄）
TESTING=true pytest tests/ -v
pytest tests/test_auth.py                     # 單一檔案
pytest tests/test_auth.py::TestPasswordValidation::test_password_too_short  # 單一測試
pytest --cov=. --cov-report=term-missing      # 含覆蓋率（目標 ≥ 90%）
pytest -m unit                                # 只跑單元測試
pytest -m "not slow"                          # 跳過慢速測試

# 格式化
black .                                       # 自動修正格式
black --check .                               # 只檢查不修正
```

### 前端

```bash
# 啟動前端靜態伺服器
python -m http.server 8080 --directory frontend  # http://localhost:8080

# 安裝 E2E 測試依賴（在 frontend/tests/ 目錄）
npm install

# E2E 測試
npx playwright test                           # 預設只跑 Chromium
BROWSERS=all npx playwright test              # 跑全瀏覽器（Chrome/Firefox/Safari/Mobile）
npx playwright test e2e/auth.spec.js          # 單一檔案
npx playwright show-report                   # 查看 HTML 報告
```

## 每次 commit 前必須執行

```bash
# 1. 後端格式檢查（在 backend/ 目錄執行）
black --check .

# 2. 後端單元測試
TESTING=true pytest tests/ -v

# 3. E2E 測試（在 frontend/tests/ 目錄執行，需先啟動後端）
npx playwright test
```

如有失敗，必須先修正才能 commit。

**推送前必須確認本地測試全數通過**：所有測試（後端 pytest + 前端 E2E）在本地執行成功後，才可執行 `git push`。禁止在測試失敗或未跑測試的狀態下推送到遠端。

---

## 程式碼風格

### Python（後端）
- 工具：**Black**（每行 88 字元，雙引號，4 空格縮排）
- 命名：函數 `snake_case`、類別 `PascalCase`、常數 `UPPER_CASE`、私有變數 `_leading_underscore`

### JavaScript（前端）
- 縮排：2 空格；字串：單引號；優先用 `const` / `let`，禁用 `var`
- 命名：函數 `camelCase`、類別 `PascalCase`、常數 `UPPER_CASE`
- 禁止在生產環境使用 `console.log`，改用 `debugLog()`

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
| `FRONTEND_URLS` | | 允許 CORS 的前端網址（逗號分隔） |

測試用最小設定：`MONGO_URI=mongodb://localhost:27017/` + `JWT_SECRET=any-local-secret`

---

## 已知地雷 / 歷史包袱

- **`records.user_id` 舊資料可能為空**：資料庫中歷史記錄的 `user_id` 欄位可能為 null，查詢時必須做 null 處理，不可假設一定有值。
- **`records` vs `recurring` 的 `user_id` 型別不同**：`records.user_id` 是 **String**，`recurring.user_id` 是 **ObjectId**，跨集合操作時注意型別轉換。
- **不要硬寫後端 URL**：前端 `detectBackendUrl()`（`index.html`）會依執行環境自動切換後端位址（localhost:5001 或 Zeabur 網域），任何地方都不要 hardcode URL。
- **Service Worker 版本號需手動更新**：每次修改前端後，必須升版 `frontend/service-worker.js` 第 14 行的 `CACHE_NAME`，否則用戶端快取不會自動清除。
- **E2E 測試並行策略**：同一 spec file 內**串行**（避免同帳號資料競爭），spec files **之間**才是並行（最多 4 workers）。不要在同一 spec file 內加 `test.parallel()`。
- **後端測試必須設 `TESTING=true`**：未設定時 Flask app 會連接真實 MongoDB，測試資料會污染生產資料庫。

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
| [`docs/ZEABUR_DEPLOYMENT.md`](docs/ZEABUR_DEPLOYMENT.md) | Zeabur 部署指南 |
| [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md) | 前端更新版本號檢查清單（Service Worker） |
| [`frontend/PWA-README.md`](frontend/PWA-README.md) | PWA 安裝與離線功能說明 |
| [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md) | 密碼強度規則與環境變數設定 |
| [`backend/tests/README.md`](backend/tests/README.md) | 後端測試說明與覆蓋率目標 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本更新日誌 |
