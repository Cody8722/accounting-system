# 個人記帳系統

簡單易用的個人記帳 PWA，支援多用戶帳號、收支管理、預算追蹤、離線使用等功能。

---

## 文件總覽

| 文件 | 說明 |
|------|------|
| `README.md`（本文） | 系統介紹、部署方式、API 參考 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本更新日誌 |
| [`docs/API.md`](docs/API.md) | API 完整文件（含請求/回應範例） |
| [`docs/DEBT_ACCOUNTING_INTEGRATION.md`](docs/DEBT_ACCOUNTING_INTEGRATION.md) | 欠款與記帳整合功能規格書（整合統計/還款同步/群組分帳） |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 開發指南（環境設定、測試、提交規範） |
| [`frontend/PWA-README.md`](frontend/PWA-README.md) | PWA 安裝、離線功能、Service Worker 說明 |
| [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md) | 每次更新前端的必做清單 |
| [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md) | 密碼強度規則與環境變數設定 |
| [`backend/tests/README.md`](backend/tests/README.md) | 後端測試說明 |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | 專案發展藍圖（短期/中期/長期目標） |
| [`docs/ROADMAP_v2.md`](docs/ROADMAP_v2.md) | v2 發展藍圖（UX 優先） |
| [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md) | NAS 同域雙環境部署操作手冊（正式 `/` + 測試 `/test/`） |
| [`docs/E2E_TESTING_GUIDE.md`](docs/E2E_TESTING_GUIDE.md) | Playwright E2E 測試完整指南 |
| [`docs/FRONTEND_TESTING.md`](docs/FRONTEND_TESTING.md) | 前端測試實施指南 |
| [`docs/TESTING_BEST_PRACTICES.md`](docs/TESTING_BEST_PRACTICES.md) | 測試最佳實踐指南 |

---

## 本地快速啟動

```bash
# 1. 啟動 MongoDB（需要 Docker）
docker run -d -p 27017:27017 --name mongo mongo:7.0

# 2. 後端
cd backend
cp .env.example .env          # 填入 MONGO_URI 和 JWT_SECRET（本地用隨意字串即可）
pip install -r requirements.txt
python main.py                # http://localhost:5001

# 3. 前端（另開終端機）
cd frontend
python -m http.server 8080    # http://localhost:8080
```

**跑測試：**

```bash
cd backend
pip install -r requirements-dev.txt
pytest                        # 跑全部測試
pytest --cov=. --cov-report=term-missing   # 含覆蓋率
```

> `.env` 測試用最小設定：
> ```
> MONGO_URI=mongodb://localhost:27017/
> JWT_SECRET=any-local-secret
> ```

---

## 目錄

- [功能特色](#功能特色)
- [快速開始](#快速開始)
  - [環境需求](#環境需求)
  - [後端設定](#後端設定)
  - [前端設定](#前端設定)
- [部署](#部署)
- [資料庫結構](#資料庫結構)
- [API 端點](#api-端點)
- [安全建議](#安全建議)
- [密碼安全策略](#密碼安全策略)
- [使用說明](#使用說明)
- [技術棧](#技術棧)

---

## 功能特色

### 記帳功能

- **收入 / 支出記錄**：支援 12 種預設分類（早餐、午餐、晚餐、點心、飲料、交通、娛樂、購物、醫療、教育、居住、其他），亦可輸入自訂分類
- **支出類型標記**：可為支出標記「固定支出」、「變動支出」或「一次性支出」
- **日期管理**：可選擇任意日期記帳（預設今天）
- **描述備註**：可為每筆記錄添加說明

### 統計分析

- 本月收入 / 支出 / 結餘即時計算
- 依分類統計支出，搭配視覺化圓餅圖呈現
- 支援日期範圍、類型、分類等多條件篩選

### 定期收支管理

- 設定每月固定收入 / 支出（房租、薪資、訂閱等）
- 可指定每月幾號自動計算，超出月份天數時自動調整
- 一鍵套用：將定期項目即時新增為一筆實際記帳記錄

### 預算管理

- 為每個支出分類設定月度預算（整合於定期收支頁面）
- 追蹤預算執行情況

### 資金錢包分離

- 同一登入帳號可建立多個「錢包」（如零用錢、薪資帳戶），與收支記錄脫鉤：記錄可選填 `wallet_id`，未分類記錄仍可正常使用
- **帳戶 × 位置雙維度**：每筆收支需標記位置（銀行／現金），支出時系統自動判斷位置；現金不足會提示自動從銀行提領補齊
- **受限資金**：收入可拆分出一筆「代收代付」性質的受限資金（例如代收款項），解鎖前不計入可用餘額，解鎖後轉為一般收入 + 支出
- **內部轉移**：同一帳戶內銀行/現金間的資金移動，不計入收支統計
- 各錢包即時餘額、近 N 月餘額變化歷史、資金流向樹視覺化（見下）

### 資金流向樹

- 針對單一錢包，以樹狀圖呈現銀行／現金／受限資金三者間的資金流向與加總關係，快速看懂一筆錢實際去了哪裡

### 記帳照片

- 記一筆時可直接拍照或選圖上傳（自動壓縮），既有記錄也可事後補充或刪除照片
- 離線時可先將照片排入待同步佇列，回連後自動上傳
- 提供跨記錄的照片瀏覽介面（設定頁「照片」入口）

### 輕量更新檢查

- 前端定期比對後端資料版本簽章，資料有變更時才重新抓取，避免多裝置間顯示過期資料，同時不需要每次都整包重抓

### 電腦版儀表板

- 電腦版另有概覽儀表板，KPI 卡與功能卡可自由釘選、放大檢視

### 多用戶帳號系統

- 使用 Email + 密碼註冊 / 登入
- **資料完全隔離**：每位用戶只能看到自己的記帳資料
- JWT Token 認證，Token 有效期 7 天
- **註冊目前為開放制**：任何人知道網址即可自行註冊帳號（無邀請碼機制）
- API 速率限制：每用戶每日 200 次、每小時 50 次；註冊端點限制每小時 5 次

### 主題設定

- 深色 / 白天 / 跟隨系統三種主題模式，設定後持久保存

### PWA 功能

- 可安裝到手機 / 桌面主畫面
- 離線查看已快取的記錄
- 離線新增記錄，連線後自動同步
- iOS / Android 全螢幕體驗（無瀏覽器 UI）

安裝步驟、快取策略與 Service Worker 詳細說明請參考 [`frontend/PWA-README.md`](frontend/PWA-README.md)。

---

## 快速開始

### 環境需求

- Python 3.8+
- MongoDB（建議使用 [MongoDB Atlas](https://www.mongodb.com/atlas) 免費方案）
- 現代瀏覽器（Chrome、Safari、Firefox、Edge）

---

### 後端設定

**1. 安裝依賴**

```bash
cd backend
pip install -r requirements.txt
```

**2. 設定環境變數**

在 `backend/` 目錄建立 `.env` 檔案：

```
MONGO_URI=mongodb+srv://<用戶名>:<密碼>@<cluster>.mongodb.net/<db名>
JWT_SECRET=<32 字元以上的隨機字串>
FRONTEND_URLS=http://localhost:8080
```

完整環境變數說明：

| 變數名稱 | 必填 | 預設值 | 說明 |
|---------|:----:|--------|------|
| `MONGO_URI` | ✅ | 無 | MongoDB 連線字串。本地測試可用 `mongodb://localhost:27017/accounting_db` |
| `JWT_SECRET` | ✅ | 無 | JWT 簽名金鑰。使用下方指令產生：`python -c "import secrets; print(secrets.token_hex(32))"` |
| `FRONTEND_URLS` | | `http://localhost:8080` | 允許跨域的前端網址（逗號分隔）。本地開發使用預設值即可；正式環境請明確設定為實際部署網域 |

> **注意**：`.env` 檔案不應提交到 Git。請確認 `.gitignore` 已包含 `.env`。

**3. 啟動後端**

```bash
cd backend
python main.py
```

後端預設在 `http://localhost:5001` 啟動（`PORT` 環境變數可覆蓋）。

---

### 前端設定

前端是純靜態網頁，不需要建構工具。

**後端 URL 自動偵測邏輯**（`frontend/v2/js/config.js` 的 `resolveBackendUrl()`）：

| 前端執行環境 | 自動對應後端 |
|------------|------------|
| `localhost` / `127.0.0.1` | `http://localhost:5001` |
| 區域網路 IP（`192.168.*`／`10.*`／`172.16-31.*`） | `http://<該 IP>:5001` |
| Tailscale 網域（`*.ts.net`，NAS 同域雙環境部署） | 同源相對路徑；依路徑是否為 `/test/` 分流至 `/test/api` 或 `/api`，由 nginx 代理到對應環境的後端 |

如需指定自訂後端網址，編輯 `frontend/v2/js/config.js` 中的 `resolveBackendUrl()` 函式。

**啟動前端開發伺服器：**

```bash
cd frontend
python -m http.server 8080
# 瀏覽 http://localhost:8080
```

或直接用瀏覽器開啟 `frontend/v2/index.html`（部分 PWA 功能需要 HTTP 伺服器）。

---

## 部署

正式環境為自架 NAS，透過 Docker Compose + nginx reverse proxy 手動部署，**沒有任何 CI/CD 自動部署機制**——`develop`/`release` 的 GitHub Actions 只跑測試，不會觸發部署。合併 PR 後仍需自行 SSH 進 NAS 執行部署指令。

完整的雙環境（正式 `/` + 測試 `/test/`）部署操作手冊請參考 [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md)，涵蓋：Tailscale 網域下的路徑分流、`docker-compose.yml`/`docker-compose.test.yml`/`docker-compose.proxy.yml` 三份 compose 的啟動順序、驗收清單與常見排錯。

日常更新（以正式環境為例）：

```bash
ssh <NAS>
cd ~/accounting-system-prod
git pull origin release
docker compose up -d --build --force-recreate
```

> **每次更新前端前，務必先更新 Service Worker 版本號！**
> 詳細流程請參考 [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md)

PWA 安裝與離線功能說明請參考 [`frontend/PWA-README.md`](frontend/PWA-README.md)

### 後端測試

```bash
cd backend
pytest
```

測試說明請參考 [`backend/tests/README.md`](backend/tests/README.md)

---

## 資料庫結構

資料庫名稱：`accounting_db`，包含**六個**集合（`users`／`records`／`budget`／`recurring`／`debts`／`wallets`）。

> ⚠️ 以下為對照後端實際程式碼（`backend/routes/*.py`）確認過的真實欄位。`user_id` 在 `records`／`budget` 皆為 **ObjectId**（非字串），三個資料表寫入時一律用 `ObjectId(request.user_id)`。

### users（用戶帳號）

```javascript
{
  _id: ObjectId,
  email: String,                    // Email（唯一索引，用於登入）
  password_hash: String,            // PBKDF2-SHA256 雜湊密碼
  name: String,                     // 顯示名稱
  created_at: DateTime,
  last_login: DateTime,
  is_active: Boolean,               // false 時禁止登入
  email_verified: Boolean,          // 預留欄位，目前未啟用 Email 驗證流程
  password_last_updated: DateTime,
  requires_password_change: Boolean,// 強制修改密碼旗標
  password_reset_token: String,     // 忘記密碼流程用（可選，用完即 $unset）
  password_reset_expires: DateTime  // reset token 效期（可選）
}
```

### records（記帳記錄）

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,     // 所屬用戶 ID（對應 users._id）；舊資料可能為空，查詢須做 null 處理
  type: String,          // 'income'｜'expense'｜'transfer'（帳戶內部轉移）｜'restricted'（受限資金）
  amount: Number,        // 金額（正數，上限 9,999,999.99）；transfer/restricted 皆適用同一欄位
  category: String,      // 分類，預設集合或自訂字串（最多 50 字元）；restricted 固定為 null
  expense_type: String,  // 支出類型：'fixed'｜'variable'｜'onetime'｜null（可選，僅 expense）
  date: String,          // 日期，格式 YYYY-MM-DD
  description: String,   // 說明備註（可為空，最多 500 字元）
  created_at: DateTime,
  updated_at: DateTime,  // 更新記錄時才有（可選）

  // 資金錢包分離（見 wallets 集合）：income/expense/transfer/restricted 皆適用
  wallet_id: ObjectId,   // 所屬錢包；null 代表「未分類」（相容舊資料，不強制搬遷）
  location: String,      // 'bank'｜'cash'；income 由使用者手動選，expense 由系統依現金餘額自動判斷
  client_id: String,     // 離線同步冪等去重用（可選，≤64 字元）；線上請求通常不帶

  // 僅 type='transfer' 才有：同一帳戶內位置間資金移動，不計入收支統計
  from_location: String, // 'bank'｜'cash'
  to_location: String,   // 'bank'｜'cash'，與 from_location 不可相同

  // 僅 expense 因現金不足觸發「自動從銀行提領」時才有：指向系統自動產生的那筆 transfer 記錄
  source_transfer_id: ObjectId,

  // 僅 type='restricted' 才有：收入拆分出的受限資金，解鎖前不計入可用餘額
  linked_income_id: ObjectId,   // 對應同時產生的一般收入記錄（可能為 null，見「全額受限」情況）
  unlocked_at: DateTime,        // 解鎖時間；null 代表尚未解鎖
  source_restricted_id: ObjectId, // 解鎖後產生的一般收入/支出記錄，回指原本的受限資金記錄

  photos: [               // 附加照片 metadata（見「記帳照片」API），檔案存於 PHOTO_STORAGE_PATH
    { id: String, filename: String, original_filename: String, content_type: String, size_bytes: Number, uploaded_at: String }
  ],

  // 以下三個欄位僅「欠款還款同步寫入」的記錄才有（見 debts 集合）；
  // 一般手動記帳不會帶這些欄位，前端也不提供手動輸入介面
  debt_id: ObjectId,     // 對應 debts._id（可選）
  auto_generated: Boolean, // true = 由還款動作或現金不足自動提領產生（可選）
  debt_deleted: Boolean  // 對應的欠款已被刪除，但保留這筆記帳歷史（可選）
}
```

### budget（預算設定）

```javascript
{
  _id: ObjectId,
  user_id: ObjectId, // 所屬用戶 ID
  month: String,     // 月份，格式 YYYY-MM；與 user_id 組成唯一索引
  budget: {          // 各分類月度預算（元），key 僅限 ALLOWED_CATEGORIES（見 backend/extensions.py）
    早餐: Number, 午餐: Number, 晚餐: Number,
    點心: Number, 飲料: Number, 交通: Number,
    娛樂: Number, 購物: Number, 醫療: Number,
    教育: Number, 居住: Number, 其他: Number
  },
  updated_at: DateTime
}
```

### recurring（定期收支）

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,   // 所屬用戶
  name: String,        // 名稱（1-50 字元）
  amount: Number,      // 金額（正數）
  type: String,        // 'income'（收入）或 'expense'（支出）
  category: String,    // 分類（最多 30 字元，預設「其他」）
  day_of_month: Number,// 每月幾號（1-31，超出月份天數自動調整）
  description: String, // 說明（可為空，最多 200 字元）
  created_at: DateTime
}
```

### debts（欠款追蹤）

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,     // 所屬用戶
  debt_type: String,     // 'lent'（我借出）或 'borrowed'（我借入）
                          // 舊資料可能仍有 'group'，啟動時由 migrate_group_debts() 一次性遷移為 lent+members
  person: String,        // 對象姓名或標題（最多 50 字元）
  amount: Number,        // 總金額
  reason: String,        // 事由（可選，最多 200 字元）
  date: String,          // YYYY-MM-DD
  paid_amount: Number,   // 已還金額累計
  is_settled: Boolean,   // 是否已結清
  repayments: [          // 單人欠款的還款紀錄
    { amount: Number, date: String, note: String }
  ],
  members: [             // 多人分帳時才有（單人欠款為空陣列）
    { name: String, share: Number, paid_amount: Number, is_settled: Boolean }
  ],
  created_at: DateTime
}
```

> 還款時（`POST /admin/api/debts/<id>/repay` 或分帳成員還款）會**同步在 `records` 插入一筆**帶 `debt_id`/`auto_generated: true` 的記帳記錄（收入分類「債務收回」或支出分類「債務償還」），讓現金流與欠款狀態保持一致。刪除欠款時，對應的自動記帳記錄不會被刪除，而是標記 `debt_deleted: true` 保留歷史。
>
> 列表/單筆查詢回傳時，`members` 非空的欠款會動態附加 `total_members`／`paid_members`／`pending_receivable`（未存於資料庫，即時計算）。

### wallets（資金錢包）

```javascript
{
  _id: ObjectId,
  user_id: ObjectId,   // 所屬用戶
  name: String,        // 錢包名稱
  icon: String,        // 圖示（可選，最多 40 字元）
  color: String,       // 顏色（可選，最多 40 字元）
  is_default: Boolean, // 是否為預設錢包；同一用戶僅能有一個 true（設定新的會自動取消舊的）
  archived: Boolean,   // 封存（軟刪除，歷史關聯記錄不受影響；封存時 is_default 會一併設為 false）
  created_at: DateTime,
  updated_at: DateTime
}
```

> 錢包只是「同一登入帳號底下的資金分組」，與 `user_id`（登入帳號）是獨立概念。`records.wallet_id` 為可選欄位，未分類（`null`）的記錄仍完全可用，不強制搬遷舊資料。餘額、位置維度、受限資金、資金流向樹皆是即時從 `records` 聚合計算，不存於 `wallets` 本身。

---

## API 端點

### 認證方式

登入後取得 JWT Token，後續請求帶入 Header：

```
Authorization: Bearer <token>
```

Token 有效期：**7 天**。過期後需重新登入。

### 認證端點

| 方法 | 路徑 | 說明 | 需 Token | 速率限制 |
|------|------|------|:--------:|---------|
| `POST` | `/api/auth/register` | 註冊新帳號 | | 每 IP 每小時 5 次 |
| `POST` | `/api/auth/login` | 登入，回傳 JWT token | | 一般限制 |
| `POST` | `/api/auth/validate-password` | 檢查密碼是否符合強度規則 | | 一般限制 |
| `GET` | `/api/auth/password-config` | 取得目前密碼規則設定 | | 一般限制 |
| `GET` | `/api/auth/verify` | 驗證目前 token 是否有效 | ✅ | 一般限制 |
| `POST` | `/api/auth/logout` | 登出 | ✅ | 一般限制 |
| `GET` | `/api/user/profile` | 取得個人資料 | ✅ | 一般限制 |
| `PUT` | `/api/user/profile` | 更新個人資料 | ✅ | 一般限制 |
| `POST` | `/api/user/change-password` | 修改密碼 | ✅ | 一般限制 |
| `GET` | `/status` | 系統健康檢查，確認後端與資料庫狀態 | ✅ | 每分鐘 10 次 |

> 一般速率限制：每用戶每日 200 次、每小時 50 次（以 JWT user_id 識別；未認證請求以 IP 計算）

### 記帳記錄（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/records` | 查詢記錄，支援 `start_date`、`end_date`、`type`、`category` 參數，最多回傳 500 筆 |
| `POST` | `/admin/api/accounting/records` | 新增記錄（可選 `wallet_id`/`location`/`client_id`；收入可選 `restricted_amount` 拆分受限資金；支出現金不足時回 409，需帶 `confirm_withdrawal:true` 確認自動提領） |
| `PUT` | `/admin/api/accounting/records/<id>` | 更新指定記錄（只能修改自己的） |
| `DELETE` | `/admin/api/accounting/records/<id>` | 刪除指定記錄（只能刪除自己的；連動刪除自動產生的提領轉帳與附加照片） |
| `POST` | `/admin/api/accounting/records/transfer` | 新增內部轉移（必要欄位 `wallet_id`/`from_location`/`to_location`/`amount`/`date`，同一帳戶內銀行↔現金搬移，不計入收支統計） |
| `POST` | `/admin/api/accounting/records/<id>/unlock` | 解鎖受限資金：整筆轉為一般收入 + 新增一筆對應支出，不支援部分解鎖 |
| `GET` | `/admin/api/accounting/data-version` | 輕量更新檢查：回傳目前使用者資料的版本簽章，供前端判斷是否需要重新抓取 |

### 統計資料（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/stats` | 當月收入 / 支出 / 結餘 / 分類統計 |
| `GET` | `/admin/api/accounting/comparison` | 環比分析，支援 `period=week/month/quarter/year` |
| `GET` | `/admin/api/accounting/trends` | 月度收支趨勢，支援 `months`（預設 6，最大 24） |
| `GET` | `/admin/api/stats/overview` | 整合財務概覽：現金餘額 + 欠款應收應付合併計算淨資產 |

### 預算管理（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/budget` | 查詢當月預算設定 |
| `POST` | `/admin/api/accounting/budget` | 儲存預算設定 |

### 定期收支（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/recurring` | 查詢所有定期收支項目 |
| `POST` | `/admin/api/recurring` | 新增定期收支項目 |
| `PUT` | `/admin/api/recurring/<id>` | 更新指定項目 |
| `DELETE` | `/admin/api/recurring/<id>` | 刪除指定項目 |
| `POST` | `/admin/api/recurring/<id>/apply` | 套用為一筆實際記帳記錄 |

### 欠款追蹤（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/debts` | 列出欠款，支援 `type=lent/borrowed`、`show_settled=true` |
| `POST` | `/admin/api/debts` | 新增欠款（`debt_type` 為 `lent` 我借出或 `borrowed` 我借入，可選 `members` 陣列做多人分帳） |
| `GET` | `/admin/api/debts/<id>` | 取得單筆欠款 |
| `PUT` | `/admin/api/debts/<id>` | 更新欠款 |
| `DELETE` | `/admin/api/debts/<id>` | 刪除欠款（對應的自動記帳記錄保留，標記 `debt_deleted`） |
| `POST` | `/admin/api/debts/<id>/repay` | 新增還款（單人），**同步寫入一筆記帳記錄** |
| `POST` | `/admin/api/debts/<id>/members/<idx>/repay` | 分帳成員還款，同步寫入記帳記錄 |
| `POST` | `/admin/api/debts/<id>/settle` | 切換結清狀態 |
| `PUT` | `/admin/api/debts/<id>/members/<idx>/pay` | 群組分帳：切換成員已付款狀態 |

### 資金錢包（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/wallets` | 列出錢包（預設不含已封存，`?show_archived=true` 可含） |
| `POST` | `/admin/api/wallets` | 新增錢包 |
| `PUT` | `/admin/api/wallets/<id>` | 更新錢包（改名／圖示／顏色／設為預設／封存還原） |
| `DELETE` | `/admin/api/wallets/<id>` | 封存錢包（軟刪除，不影響歷史關聯記錄） |
| `GET` | `/admin/api/wallets/balances` | 各錢包即時餘額（含「未分類」） |
| `GET` | `/admin/api/wallets/location-summary` | 帳戶 × 位置（銀行/現金）雙維度餘額 |
| `GET` | `/admin/api/wallets/<id>/balance-history` | 單一錢包近 N 月餘額變化 |
| `GET` | `/admin/api/wallets/restricted-funds` | 目前還鎖著的受限資金列表（未解鎖） |
| `GET` | `/admin/api/wallets/<id>/flow-tree` | 單一錢包資金流向樹（銀行/現金/受限資金三者關聯加總） |

### 記帳照片（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/admin/api/accounting/records/<id>/photos` | 上傳照片（multipart，欄位名 `photos`，可多檔；單筆記錄最多 20 張，單檔上限 10MB，僅 jpeg/png/webp） |
| `DELETE` | `/admin/api/accounting/records/<id>/photos/<photo_id>` | 刪除單張照片 |
| `GET` | `/admin/api/accounting/records/<id>/photos/<photo_id>` | 取得照片本體 |
| `GET` | `/admin/api/accounting/photos` | 跨記錄的照片瀏覽清單（分頁，新到舊） |

匯出/匯入（需 Token）：`GET /admin/api/accounting/export`（支援 `format=csv/xlsx/json`）、`POST /admin/api/accounting/import`（JSON 備份還原）。

---

## 安全建議

1. **JWT_SECRET**：使用 32 字元以上的隨機字串，不要使用可預測的值。金鑰洩漏後需立即更換（所有用戶會被強制登出）
2. **HTTPS**：生產環境務必使用 HTTPS（NAS 部署由 nginx + Tailscale 憑證提供，詳見 [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md)）
3. **MongoDB**：不要使用擁有過多權限的資料庫帳號；定期備份資料
4. **`.env` 檔案**：確認 `.gitignore` 已包含 `.env`，不要將金鑰提交到 Git

---

## 密碼安全策略

系統內建嚴格的密碼驗證，預設要求：**最少 12 字元**、包含大小寫字母、數字與特殊符號，並對連續字符、鍵盤模式、常見弱密碼、個人資訊及數學模式進行多層檢查，密碼熵值需達 50 bits 以上。

所有規則均可透過環境變數個別開啟或關閉，完整規則說明與設定方式請參考 [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md)。

---

## 使用說明

1. **首次使用**：點擊「前往註冊」，輸入 Email、名稱與密碼建立帳號
2. **登入**：輸入 Email 與密碼，Token 有效期 7 天，到期前會自動登出
3. **新增記帳**：填寫金額、分類、日期與說明，支出可選填支出類型
4. **查詢記錄**：在「記錄」頁設定日期範圍 / 類型 / 分類後點擊「查詢」
5. **定期收支**：在「定期」頁新增固定收支項目，可一鍵套用為實際記帳
6. **設定預算**：在「定期」頁設定各分類預算後點擊「儲存」
7. **刪除記錄**：在記錄列表中向左滑動，或長按記錄選擇刪除

---

## 技術棧

### 後端

| 套件 | 版本 | 用途 |
|------|------|------|
| Flask | 3.0+ | Web 框架 |
| PyMongo | 4.6+ | MongoDB 驅動 |
| PyJWT | 2.8+ | JWT 簽發與驗證 |
| passlib | 1.7+ | bcrypt 密碼雜湊 |
| Flask-CORS | 4.0+ | 跨域設定 |
| Flask-Limiter | 3.5+ | API 速率限制 |
| python-dotenv | 1.0+ | 環境變數載入 |
| Gunicorn | 21.2+ | WSGI 伺服器（生產環境） |

### 前端

| 技術 | 用途 |
|------|------|
| HTML5 + Vanilla JavaScript | 主體，無框架依賴 |
| Tailwind CSS（CDN） | 樣式 |
| Fetch API | 與後端通訊 |
| Service Worker | PWA 離線功能 |
| IndexedDB | 離線操作佇列 |

### 資料庫 / 部署

- **MongoDB Atlas**（建議）或本地 MongoDB
- **Docker Compose + nginx reverse proxy**：自架 NAS 手動部署（無 CI/CD 自動部署），詳見 [`docs/DEPLOY_TWO_ENV.md`](docs/DEPLOY_TWO_ENV.md)

---

## 授權

MIT License
