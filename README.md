# 個人記帳系統

手機優先的個人記帳 PWA：多用戶、離線可用、資金錢包分離，前端純 ES Modules、不需要建構步驟。

## 亮點

- **離線也能記帳**：可安裝到手機／桌面，離線新增的記錄與照片會排隊，回連後自動同步
- **資金錢包**：多個錢包、銀行／現金雙維度、受限資金（代收代付）、內部轉移，並可看資金流向樹
- **記一筆很快**：計算機式鍵盤、兩層分類、拍照或選圖附件（自動壓縮）
- **看得懂的統計**：分類佔比、收支趨勢、環比分析、月度預算，定期收支一鍵套用
- **電腦版儀表板**：KPI 卡與功能卡可自由釘選
- **多用戶資料隔離**：每個人只看得到自己的資料；註冊可設為邀請制或關閉
- **帳號安全**：JWT、登入失敗鎖定、改密碼後舊裝置立即登出、前端 CSP
- **資料帶得走**：匯出 CSV／Excel／JSON，JSON 備份可匯入還原
- **簡單部署**：Docker Compose + nginx，前端無 bundler、無 build step

## 快速安裝（本機）

需要 Python 3.8+、Docker（跑 MongoDB）。

```bash
# 1. MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7.0

# 2. 後端（專案根目錄）
cd backend
cp .env.example .env           # 填入 MONGO_URI 和 JWT_SECRET（本機用任意字串即可）
pip install -r requirements.txt
python main.py                 # http://localhost:5001

# 3. 前端（另開終端機，回到專案根目錄）
python -m http.server 8080 --directory frontend/v2    # http://localhost:8080
```

`.env` 最小設定：

```
MONGO_URI=mongodb://localhost:27017/
JWT_SECRET=any-local-secret
```

跑測試：

```bash
pip install -r backend/requirements-dev.txt
TESTING=true pytest backend/tests/
```

完整的環境變數、前端設定、測試與部署說明見 [`docs/SETUP.md`](docs/SETUP.md)。

## 需要注意

1. **註冊預設是開放的**：沒設 `REGISTRATION_MODE` 就是 `open`，知道網址的人都能註冊。正式環境請設 `invite`（需一次性邀請碼，用 `backend/manage_invites.py` 管理）或 `closed`。
2. **正式環境是手動部署**：沒有任何 CI/CD 自動部署，GitHub Actions 只跑測試。合併後要自己 SSH 進 NAS 重建容器，見 [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md)。
3. **改了前端要升版號**：`frontend/v2/service-worker.js` 的 `CACHE_NAME` 與 `frontend/v2/js/version.js` 的 `APP_VERSION` 要一起改，否則使用者端快取不會更新。
4. **後端測試一定要設 `TESTING=true`**：沒設會連到真實 MongoDB，測試資料會污染正式資料庫。
5. **前端用別的 port 時**，要把那個網址加進後端 `.env` 的 `FRONTEND_URLS`，並重啟後端，否則 CORS 會擋。Windows 上 8080 常被其他軟體佔用。
6. **`TRUSTED_PROXY_COUNT`**：限速與登入鎖定依客戶端 IP 計算。只有一層代理用預設 `1`；代理前面還有另一層才改 `2`，設錯會讓限速失準。
7. **`JWT_SECRET` 與 `.env`**：`.env` 不可提交到 Git；更換 `JWT_SECRET` 會讓所有人被登出。
8. **不要寫死後端網址**：前端由 `resolveBackendUrl()`（`frontend/v2/js/config.js`）依執行環境自動判斷。

## 文件

| 想知道 | 看這裡 |
|--------|--------|
| 完整安裝、環境變數、部署、安全建議 | [`docs/SETUP.md`](docs/SETUP.md) |
| 完整功能清單 | [`docs/FEATURES.md`](docs/FEATURES.md) |
| API 範例（請求／回應）／端點速查 | [`docs/API.md`](docs/API.md)、[`docs/API_ENDPOINTS.md`](docs/API_ENDPOINTS.md) |
| 資料庫結構 | [`docs/DATABASE.md`](docs/DATABASE.md) |
| NAS 雙環境部署手冊 | [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md) |
| 開發指南、提交規範 | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| 現行藍圖與開發順序 | [`docs/ROADMAP_v2.md`](docs/ROADMAP_v2.md)（舊版 [`ROADMAP.md`](docs/ROADMAP.md) 僅作歷史參考） |
| 版本更新日誌 | [`CHANGELOG.md`](CHANGELOG.md) |
| PWA 安裝與離線、前端更新清單 | [`frontend/PWA-README.md`](frontend/PWA-README.md)、[`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md) |
| 密碼規則 | [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md) |
| 測試（後端／E2E／前端） | [`backend/tests/README.md`](backend/tests/README.md)、[`docs/E2E_TESTING_GUIDE.md`](docs/E2E_TESTING_GUIDE.md)、[`docs/FRONTEND_TESTING.md`](docs/FRONTEND_TESTING.md)、[`docs/TESTING_BEST_PRACTICES.md`](docs/TESTING_BEST_PRACTICES.md) |
| 欠款與記帳整合規格 | [`docs/DEBT_ACCOUNTING_INTEGRATION.md`](docs/DEBT_ACCOUNTING_INTEGRATION.md) |

## 技術

後端 Flask + MongoDB；前端純 ES Modules（無框架、無 bundler）的 PWA；Docker Compose + nginx 自架部署。

## 授權

MIT License
