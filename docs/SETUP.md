# 安裝與設定

> 精簡版見 [README](../README.md)。正式環境（NAS 雙環境）部署見 [DEPLOY_TWO_ENV.md](DEPLOY_TWO_ENV.md)。

## 環境需求

- Python 3.8+
- MongoDB 7（本地用 Docker，或 [MongoDB Atlas](https://www.mongodb.com/atlas) 免費方案）
- 現代瀏覽器（Chrome、Safari、Firefox、Edge）

---

## 後端

**1. 安裝依賴**

```bash
cd backend
pip install -r requirements.txt
```

**2. 設定環境變數**

```bash
cp .env.example .env
```

`.env.example` 有每個變數的註解，最小設定只需要兩個：

```
MONGO_URI=mongodb://localhost:27017/
JWT_SECRET=any-local-secret
```

完整環境變數：

| 變數名稱 | 必填 | 預設值 | 說明 |
|---------|:----:|--------|------|
| `MONGO_URI` | ✅ | 無 | MongoDB 連線字串。本地測試可用 `mongodb://localhost:27017/accounting_db` |
| `JWT_SECRET` | ✅ | 無 | JWT 簽名金鑰，32 字元以上。產生方式：`python -c "import secrets; print(secrets.token_hex(32))"` |
| `FRONTEND_URLS` | | `http://localhost:8080,https://accounting-system.zeabur.app` | 允許跨域的前端網址（逗號分隔）。**前端用別的 port 時必須加進來**，正式環境請明確設定為實際網域 |
| `REGISTRATION_MODE` | | `open` | 註冊模式：`open` 開放 / `invite` 需一次性邀請碼 / `closed` 關閉；無法辨識的值視為 `closed` |
| `TRUSTED_PROXY_COUNT` | | `1` | 限速與登入鎖定取客戶端 IP 時，信任幾層反向代理（`X-Forwarded-For` 由右往左數第 N 筆）。見下方說明 |
| `PORT` | | `5001` | 後端監聽埠 |
| `SMTP_*`、`PASSWORD_*` | | 見 `.env.example` | 忘記密碼寄信設定、密碼強度規則 |

> `.env` 不可提交到 Git。確認 `.gitignore` 已包含 `.env`。

**`TRUSTED_PROXY_COUNT` 怎麼設**

限速和登入鎖定依客戶端 IP 計算，IP 取自 `X-Forwarded-For` 由右往左數第 N 筆（左邊的部分客戶端可以偽造）。

- 只有一層代理（nginx 或本專案的 nginx-gateway 直接轉給後端）：用預設 `1`。
- 代理前面還有另一層（例如 Cloudflare、另一台 nginx）：設 `2`。
- 設太小：所有人共用同一個 IP 的額度。設太大：限速可被偽造標頭繞過。

**3. 啟動**

```bash
cd backend
python main.py        # http://localhost:5001
```

### 邀請制註冊

`REGISTRATION_MODE=invite` 時，註冊要帶一次性邀請碼。資料庫只存雜湊，明文只在建立時顯示一次：

```bash
cd backend
python manage_invites.py create [--count N] [--note "給誰的"]   # 建立邀請碼
python manage_invites.py list [--all]                           # 列出（--all 含已使用／撤銷／過期）
python manage_invites.py revoke <id>                            # 撤銷
```

---

## 前端

純靜態網頁，沒有建構步驟。`frontend/` 根目錄沒有 `index.html`，要指向 `frontend/v2`：

```bash
python -m http.server 8080 --directory frontend/v2    # http://localhost:8080
```

- Windows 上 8080 可能被其他軟體佔用（例如工業軟體）。改用別的 port（例如 8081），並把 `http://localhost:8081` 加進後端的 `FRONTEND_URLS`，重啟後端 CORS 才會生效。
- 部分 PWA 功能（Service Worker）需要 HTTP 伺服器，不能直接雙擊開 `index.html`。

**後端網址自動偵測**（`frontend/v2/js/config.js` 的 `resolveBackendUrl()`，任何地方都不要寫死後端網址）：

| 前端執行環境 | 對應後端 |
|------------|---------|
| `localhost` / `127.0.0.1` | `http://localhost:5001` |
| 區域網路 IP（`192.168.*`／`10.*`／`172.16-31.*`） | `http://<該 IP>:5001` |
| Tailscale 網域（`*.ts.net`，NAS 同域雙環境） | 同源相對路徑；依路徑是否為 `/test/` 分流到 `/test/api` 或 `/api`，由 nginx 代理 |

---

## 測試

```bash
pip install -r backend/requirements-dev.txt

# 後端（從專案根目錄執行）
TESTING=true pytest backend/tests/
black --check backend/

# 前端單元測試
node --test frontend/tests/unit/*.test.js

# E2E（需先啟動後端）
npm install --prefix frontend/tests
npx playwright test --config frontend/tests/playwright.config.js
```

> **後端測試一定要設 `TESTING=true`**：沒設的話 Flask 會連到真實 MongoDB，測試資料會污染正式資料庫。

更多說明：[backend/tests/README.md](../backend/tests/README.md)、[E2E_TESTING_GUIDE.md](E2E_TESTING_GUIDE.md)、[FRONTEND_TESTING.md](FRONTEND_TESTING.md)、[TESTING_BEST_PRACTICES.md](TESTING_BEST_PRACTICES.md)。

---

## 部署

正式環境為自架 NAS，Docker Compose + nginx reverse proxy，**手動部署，沒有任何 CI/CD 自動部署**。`develop`／`release` 的 GitHub Actions 只跑測試，合併 PR 後要自己 SSH 進 NAS：

```bash
ssh <NAS>
cd ~/accounting-system-prod
git pull origin release
docker compose up -d --build --force-recreate
```

- 雙環境（正式 `/` + 測試 `/test/`）的完整操作手冊：[DEPLOY_TWO_ENV.md](DEPLOY_TWO_ENV.md)。
- 改了前端要先升 Service Worker 版本號，否則使用者端快取不會更新：[frontend/UPDATE_CHECKLIST.md](../frontend/UPDATE_CHECKLIST.md)。
- 前端 nginx（`nginx.conf`）對靜態頁面加了 CSP 與基本安全標頭，改動後要重建前端容器才會生效。
- PWA 安裝與離線功能：[frontend/PWA-README.md](../frontend/PWA-README.md)。

---

## 安全建議

1. **`JWT_SECRET`**：32 字元以上的隨機字串。更換後所有使用者會被強制登出。
2. **HTTPS**：正式環境務必使用（NAS 由 nginx + Tailscale 憑證提供）。
3. **註冊模式**：`REGISTRATION_MODE` 預設是 `open`，網址被知道就能註冊。正式環境建議設 `invite` 或 `closed`。
4. **MongoDB**：不要用權限過大的資料庫帳號；定期備份。
5. **`.env`**：不要提交到 Git。

## 密碼規則

預設最少 12 字元、含大小寫字母／數字／特殊符號、熵值 50 bits 以上，並檢查連續字符、鍵盤模式、常見弱密碼、個人資訊。每條規則都能用環境變數開關，詳見 [backend/PASSWORD_POLICY.md](../backend/PASSWORD_POLICY.md)。

## 帳號安全機制

- 登入每分鐘 10 次；同一來源 IP 對同一 Email 連續失敗 5 次，鎖定 15 分鐘（記憶體內，後端重啟會清空）。
- 修改密碼或重設密碼後，舊裝置的登入立即失效；從未改過密碼的帳號不受影響。
- Token 有效期 7 天。
