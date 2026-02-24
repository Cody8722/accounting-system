# 個人記帳系統

簡單易用的個人記帳 PWA，支援多用戶帳號、收支管理、預算追蹤、離線使用等功能。

---

## 文件總覽

| 文件 | 說明 |
|------|------|
| `README.md`（本文） | 系統介紹、部署方式、快速開始 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本更新日誌 |
| [`docs/API.md`](docs/API.md) | API 完整文件（含請求/回應範例） |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 開發指南（環境設定、測試、提交規範） |
| [`frontend/PWA-README.md`](frontend/PWA-README.md) | PWA 安裝、離線功能、Service Worker 說明 |
| [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md) | 每次更新前端的必做清單 |
| [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md) | 密碼強度規則與環境變數設定 |
| [`backend/tests/README.md`](backend/tests/README.md) | 後端測試說明 |

---

## 目錄

- [功能特色](#功能特色)
- [快速開始](#快速開始)
  - [環境需求](#環境需求)
  - [後端設定](#後端設定)
  - [前端設定](#前端設定)
- [部署到 Zeabur](#部署到-zeabur)
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

- **即時統計**：本月收入 / 支出 / 結餘即時計算
- **圓餅圖**：依分類統計支出，視覺化呈現
- **趨勢分析**：月度收入/支出折線圖，顯示最近 6 個月趨勢
- **多條件篩選**：支援日期範圍、類型、分類等篩選
- **資料匯出**：CSV 格式匯出記帳記錄，支援 Excel 開啟

### 預算管理

- **預算設定**：為每個支出分類設定月度預算
- **預算追蹤**：追蹤預算執行情況
- **警告提醒**：
  - 🔴 超過 100% 顯示紅色「超出預算」
  - 🟡 80-100% 顯示黃色「接近上限」
  - 🟢 低於 80% 顯示綠色「正常」
- **使用詳情**：顯示已用百分比、已用金額、剩餘額度

### 多用戶帳號系統

- **註冊/登入**：Email + 密碼認證
- **資料隔離**：每位用戶只能看到自己的記帳資料
- **JWT Token**：認證機制，有效期 7 天
- **忘記密碼**：Email 重設密碼功能
- **個人資料**：修改使用者名稱、變更密碼
- **註冊制度**：開放註冊（無邀請碼）
- **速率限制**：防止濫用（註冊 5 次/小時、登入 10 次/小時）

### 密碼安全

- **13 項強度檢查**：長度、複雜度、重複字元、連續字元、鍵盤模式、常見密碼、個人資訊、拼音、數學模式、熵值等
- **即時驗證**：註冊和修改密碼時即時顯示密碼強度
- **視覺化指示**：進度條和顏色標示（弱/中/強/極強）
- **彈性配置**：可透過環境變數調整密碼政策

### PWA 功能

- **可安裝**：安裝到手機/桌面主畫面
- **離線查看**：快取的記錄可離線瀏覽
- **離線記帳**：離線新增記錄，連線後自動同步
- **全螢幕體驗**：iOS / Android 無瀏覽器 UI
- **自動更新**：Service Worker 自動更新機制
- **安裝引導**：Android/iOS 專屬安裝提示

### 行動優化

- **觸控友好**：加大按鈕和觸控區域（最小 44x44px）
- **防止縮放**：iOS 禁用雙擊放大（自定義鍵盤不會誤觸）
- **深色模式**：完整支援淺色/深色主題自動切換
- **響應式設計**：手機、平板、桌面全適配

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
| `FRONTEND_URLS` | | `http://localhost:8080,https://accounting-system.zeabur.app` | 允許跨域的前端網址（逗號分隔）。本地開發使用預設值即可 |

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

**後端 URL 自動偵測邏輯**（`frontend/index.html`）：

| 前端執行環境 | 自動對應後端 |
|------------|------------|
| `localhost` / `127.0.0.1` | `http://localhost:5001` |
| `accounting-system.zeabur.app` | `https://accounting-system-ghth.zeabur.app` |
| 其他 Zeabur 網域（含 `zeabur.app`） | 自動將 `frontend` 替換為 `backend` |

如需指定自訂後端網址，編輯 `frontend/index.html` 中的 `detectBackendUrl()` 函式。

**啟動前端開發伺服器：**

```bash
cd frontend
python -m http.server 8080
# 瀏覽 http://localhost:8080
```

或直接用瀏覽器開啟 `frontend/index.html`（部分 PWA 功能需要 HTTP 伺服器）。

---

## 部署到 Zeabur

### 架構說明

本系統分為兩個獨立服務部署：

```
前端（靜態網站）                後端（Flask API）
accounting-system.zeabur.app  →  accounting-system-ghth.zeabur.app
  frontend/                        backend/
```

### 後端部署

1. 在 Zeabur 建立新服務，從 Git 部署（根目錄選 `backend`）
2. 設定以下環境變數：

| 變數名稱 | 值 |
|---------|---|
| `MONGO_URI` | MongoDB Atlas 連線字串（`mongodb+srv://...`） |
| `JWT_SECRET` | 32 字元以上隨機字串 |
| `FRONTEND_URLS` | 前端網址，如 `https://accounting-system.zeabur.app` |

3. **MongoDB Atlas 設定**：在 Atlas 控制台的「Network Access」中，將 Zeabur IP 白名單設為 `0.0.0.0/0`（允許所有 IP），因為 Zeabur 的出口 IP 為動態分配，無法固定。

### 前端部署

> **每次更新前端前，務必先更新 Service Worker 版本號！**
> 詳細流程請參考 [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md)

1. 更新 `frontend/service-worker.js` 第 14 行的版本號（目前為 `v1.3.6`）
2. 在 Zeabur 建立靜態網站服務，根目錄選 `frontend`

PWA 安裝與離線功能說明請參考 [`frontend/PWA-README.md`](frontend/PWA-README.md)

### 後端測試

```bash
cd backend
pytest
```

測試說明請參考 [`backend/tests/README.md`](backend/tests/README.md)

---

## 資料庫結構

資料庫名稱：`accounting_db`，包含三個集合：

### users（用戶帳號）

```javascript
{
  _id: ObjectId,
  email: String,                    // Email（唯一索引，用於登入）
  password_hash: String,            // bcrypt 雜湊密碼
  name: String,                     // 顯示名稱
  created_at: DateTime,
  last_login: DateTime,
  is_active: Boolean,               // false 時禁止登入
  email_verified: Boolean,          // 預留欄位，目前未啟用 Email 驗證流程
  password_last_updated: DateTime,
  requires_password_change: Boolean // 強制修改密碼旗標
}
```

### records（記帳記錄）

```javascript
{
  _id: ObjectId,
  user_id: String,      // 所屬用戶 ID（對應 users._id），舊資料此欄位可能為空
  type: String,         // 'income'（收入）或 'expense'（支出）
  amount: Number,       // 金額（正數）
  category: String,     // 分類，預設 12 種或自訂字串
  expense_type: String, // 支出類型：'fixed'（固定）｜'variable'（變動）｜'onetime'（一次性）｜null
  date: String,         // 日期，格式 YYYY-MM-DD
  description: String,  // 說明備註（可為空）
  created_at: DateTime
}
```

### budget（預算設定）

```javascript
{
  _id: ObjectId,
  user_id: String,   // 所屬用戶 ID
  month: String,     // 月份，格式 YYYY-MM
  budget: {          // 各分類月度預算（元）
    早餐: Number, 午餐: Number, 晚餐: Number,
    點心: Number, 飲料: Number, 交通: Number,
    娛樂: Number, 購物: Number, 醫療: Number,
    教育: Number, 居住: Number, 其他: Number
  },
  updated_at: DateTime
}
```

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
| `POST` | `/admin/api/accounting/records` | 新增記錄 |
| `PUT` | `/admin/api/accounting/records/<id>` | 更新指定記錄（只能修改自己的） |
| `DELETE` | `/admin/api/accounting/records/<id>` | 刪除指定記錄（只能刪除自己的） |

### 統計資料（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/stats` | 當月收入 / 支出 / 結餘 / 分類統計 |

### 預算管理（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/budget` | 查詢當月預算設定 |
| `POST` | `/admin/api/accounting/budget` | 儲存預算設定 |

---

## 安全建議

1. **JWT_SECRET**：使用 32 字元以上的隨機字串，不要使用可預測的值。金鑰洩漏後需立即更換（所有用戶會被強制登出）
2. **HTTPS**：生產環境務必使用 HTTPS（Zeabur 自動提供）
3. **MongoDB**：不要使用擁有過多權限的資料庫帳號；定期備份資料
4. **`.env` 檔案**：確認 `.gitignore` 已包含 `.env`，不要將金鑰提交到 Git

---

## 密碼安全策略

系統內建嚴格的密碼驗證，確保帳號安全。以下為預設規則：

### 基本要求

- 最小長度：12 字元
- 必須同時包含大寫字母、小寫字母、數字、特殊符號

### 進階安全檢查

- 不允許 3 個以上相同字符（如 `aaa`、`111`）
- 不允許 4 個以上連續字符（如 `abcd`、`1234`、`dcba`）
- 不允許鍵盤相鄰按鍵（如 `qwer`、`asdf`、`1qaz`）
- 拒絕 50+ 個常見弱密碼
- 不能包含 Email 地址或姓名
- 不能使用費式數列、平方數等數學模式
- 不能使用常見中文拼音（如 `woaini`、`zhongguo`）
- 密碼熵值需達 50 bits 以上

所有規則均可透過環境變數調整，完整說明請參考 [`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md)。

---

## 使用說明

1. **首次使用**：點擊「前往註冊」，輸入 Email、名稱與密碼建立帳號
2. **登入**：輸入 Email 與密碼，Token 有效期 7 天，到期前會自動登出
3. **新增記帳**：填寫金額、分類、日期與說明，支出可選填支出類型
4. **查詢記錄**：在「記錄」頁設定日期範圍 / 類型 / 分類後點擊「查詢」
5. **設定預算**：在「設定」頁輸入各分類預算後點擊「儲存」
6. **刪除記錄**：在記錄列表中向左滑動，或長按記錄選擇刪除

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
- **Zeabur**：後端（Python）+ 前端（靜態網站）

---

## 授權

MIT License
