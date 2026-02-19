# 個人記帳系統

簡單易用的個人記帳 PWA，支援收入支出管理、預算追蹤、支出類型分類等功能。可安裝到手機主畫面，支援離線使用。

## 功能特色

### 記帳功能
- **收入 / 支出記錄**：支援 12 種預設分類（早餐、午餐、晚餐、點心、飲料、交通、娛樂、購物、醫療、教育、居住、其他），亦可輸入自訂分類
- **支出類型標記**：可為支出標記固定支出 / 變動支出 / 一次性支出
- **日期管理**：可選擇任意日期記帳
- **描述備註**：為每筆記錄添加詳細說明

### 統計分析
- **本月收入**：即時顯示當月總收入
- **本月支出**：即時顯示當月總支出
- **結餘計算**：自動計算收支差額
- **分類統計**：按分類統計支出金額，視覺化圖表呈現

### 預算管理
- 為每個支出分類設定月度預算
- 追蹤預算執行情況

### 查詢篩選
- 按日期範圍篩選記錄
- 按類型篩選（收入 / 支出）
- 按分類篩選
- 最多顯示 500 筆記錄

### 安全性
- **用戶帳號系統**：需先註冊帳號，使用 Email + 密碼登入
- **JWT 令牌認證**：登入後以 JWT Bearer Token 進行 API 驗證
- **資料隔離**：每位用戶只能看到自己的記帳資料
- **API 速率限制**：每用戶每日 200 次、每小時 50 次上限
- **強密碼要求**：內建嚴格的密碼驗證機制（詳見下方密碼安全策略）

### PWA 功能
- 可安裝到手機 / 桌面主畫面
- 離線查看已快取的記錄
- 離線新增記錄，連線後自動同步
- iOS / Android 原生體驗（全螢幕、無瀏覽器 UI）

---

## 快速開始

### 環境需求

- Python 3.8+
- MongoDB Atlas 帳號（或本地 MongoDB）
- 現代瀏覽器（Chrome、Firefox、Safari、Edge）

### 後端設定

1. **安裝依賴**
```bash
cd backend
pip install -r requirements.txt
```

2. **設定環境變數**
```bash
cp .env.example .env
# 編輯 .env，填入以下資訊：
```

| 變數名稱 | 必填 | 說明 |
|---------|------|------|
| `MONGO_URI` | ✅ | MongoDB 連線字串（如 `mongodb+srv://...`） |
| `JWT_SECRET` | ✅ | JWT 簽名金鑰，建議使用 32 字元以上隨機字串 |
| `FRONTEND_URLS` | ✅ | 允許的前端來源，逗號分隔（如 `https://myapp.zeabur.app`） |
| `ADMIN_SECRET` | 選填 | 舊版管理員密碼，向後相容用，新部署可不設定 |

3. **啟動後端服務**
```bash
python main.py
```

後端預設運行在 `http://localhost:5001`

### 前端設定

前端會**自動偵測**後端 URL：
- 本地開發（`localhost`）→ 自動連到 `http://localhost:5001`
- Zeabur 標準部署 → 自動對應到後端 URL

如需指定自訂後端網址，編輯 `frontend/index.html` 的 `detectBackendUrl()` 函式即可。

**啟動前端：**
```bash
cd frontend
python -m http.server 8080
# 然後訪問 http://localhost:8080
```

或直接用瀏覽器開啟 `frontend/index.html`。

---

## 部署到 Zeabur

### 後端部署

1. 在 Zeabur 建立新服務，從 Git 部署（選擇 `backend` 資料夾）
2. 設定環境變數：

| 變數名稱 | 說明 |
|---------|------|
| `MONGO_URI` | MongoDB Atlas 連線字串 |
| `JWT_SECRET` | JWT 簽名金鑰（32 字元以上隨機字串） |
| `FRONTEND_URLS` | 前端網址，如 `https://accounting-system.zeabur.app` |

3. **重要**：MongoDB Atlas 需開放 `0.0.0.0/0` IP 白名單，因為 Zeabur 的 IP 為動態分配

### 前端部署

**⚠️ 每次更新前端時，請務必更新 Service Worker 版本號！**

1. 打開 `frontend/service-worker.js`，修改第 14 行：
   ```js
   const CACHE_NAME = 'accounting-system-vX.Y.Z';
   ```
   根據語義化版本號更新（Bug 修復 +PATCH，新功能 +MINOR，重大更新 +MAJOR）

2. 在 Zeabur 建立靜態網站服務，選擇 `frontend` 資料夾部署

詳細說明請參考 [`frontend/UPDATE_CHECKLIST.md`](frontend/UPDATE_CHECKLIST.md) 與 [`frontend/PWA-README.md`](frontend/PWA-README.md)

---

## 資料庫結構

### accounting_db.users

用戶帳號集合：

```javascript
{
  _id: ObjectId,
  email: String,             // Email（唯一索引）
  password_hash: String,     // bcrypt 雜湊密碼
  name: String,              // 顯示名稱
  created_at: DateTime,      // 建立時間
  last_login: DateTime,      // 最後登入時間
  is_active: Boolean,        // 帳號是否啟用
  email_verified: Boolean,   // Email 是否驗證
  password_last_updated: DateTime,
  requires_password_change: Boolean
}
```

### accounting_db.records

記帳記錄集合：

```javascript
{
  _id: ObjectId,
  user_id: String,           // 所屬用戶 ID（外鍵 → users._id）
  type: String,              // 'income' 或 'expense'
  amount: Number,            // 金額
  category: String,          // 分類（預設 12 種 + 可自訂）
  expense_type: String,      // 支出類型：'fixed'｜'variable'｜'onetime'｜null
  date: String,              // 日期 (YYYY-MM-DD)
  description: String,       // 描述
  created_at: DateTime       // 建立時間
}
```

### accounting_db.budget

預算設定集合：

```javascript
{
  _id: ObjectId,
  user_id: String,           // 所屬用戶 ID
  month: String,             // 月份 (YYYY-MM)
  budget: {                  // 各分類預算
    早餐: Number,
    午餐: Number,
    晚餐: Number,
    點心: Number,
    飲料: Number,
    交通: Number,
    娛樂: Number,
    購物: Number,
    醫療: Number,
    教育: Number,
    居住: Number,
    其他: Number
  },
  updated_at: DateTime
}
```

---

## API 端點

### 認證方式

所有 `/admin/api/` 端點需在 Header 帶入 JWT Token：

```
Authorization: Bearer <token>
```

Token 在登入後取得。

### 認證端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/auth/register` | 註冊新帳號 |
| `POST` | `/api/auth/login` | 登入，回傳 JWT token |
| `GET` | `/api/auth/verify` | 驗證目前 token 是否有效 |
| `POST` | `/api/auth/logout` | 登出 |
| `GET` | `/api/auth/profile` | 取得個人資料 |
| `PUT` | `/api/auth/profile` | 更新個人資料 |
| `POST` | `/api/auth/validate-password` | 驗證密碼強度（註冊前檢查） |
| `GET` | `/api/auth/password-config` | 取得密碼規則設定 |

### 記帳記錄

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/records` | 查詢記錄（支援日期、類型、分類篩選） |
| `POST` | `/admin/api/accounting/records` | 新增記錄 |
| `PUT` | `/admin/api/accounting/records/<id>` | 更新記錄 |
| `DELETE` | `/admin/api/accounting/records/<id>` | 刪除記錄 |

### 統計資料

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/stats` | 取得當月統計（收入、支出、結餘、分類統計） |

### 預算管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/budget` | 查詢預算 |
| `POST` | `/admin/api/accounting/budget` | 儲存預算 |

### 系統狀態

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/status` | 系統狀態檢查（不需認證） |

---

## 安全建議

1. **JWT_SECRET**：使用 32 字元以上的隨機字串，不要使用可預測的值
2. **HTTPS**：生產環境務必使用 HTTPS（Zeabur 自動提供）
3. **MongoDB 連線**：使用 MongoDB Atlas 時開放 `0.0.0.0/0` 白名單（或具體 IP）
4. **定期備份**：定期備份 MongoDB 資料
5. **環境變數**：不要將 `.env` 檔案提交到版本控制

---

## 密碼安全策略

系統內建嚴格的密碼驗證機制，確保帳號安全。

### 預設密碼要求

註冊時，密碼必須符合以下所有條件：

#### 基本要求
- **最小長度**：12 個字元
- **大寫字母**：必須包含 A-Z
- **小寫字母**：必須包含 a-z
- **數字**：必須包含 0-9
- **特殊符號**：必須包含 `!@#$%^&*()` 等

#### 安全檢查
- 不能有 3 個或以上相同字符（如 `aaa`, `111`）
- 不能有 4 個或以上連續字符（如 `abcd`, `1234`, `dcba`）
- 不能使用鍵盤相鄰按鍵（如 `qwer`, `asdf`, `1qaz`）
- 拒絕 50+ 個常見弱密碼（如 `password123`, `12345678`）
- 不能包含 Email 地址或姓名
- 不能使用費式數列、平方數等數學模式
- 不能使用常見中文拼音（如 `woaini`, `zhongguo`）
- 熵值需達到 50 bits 以上

### 即時密碼強度顯示

用戶註冊時會看到實時密碼強度評級（弱 / 中 / 強 / 非常強）及所有規則通過狀態。

### 修改密碼規則

所有密碼規則可透過環境變數設定：

```bash
# 基本要求
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGIT=true
PASSWORD_REQUIRE_SPECIAL=true

# 模式檢查
PASSWORD_CHECK_REPEATING=true
PASSWORD_CHECK_SEQUENTIAL=true
PASSWORD_CHECK_KEYBOARD_PATTERN=true
PASSWORD_CHECK_COMMON_PASSWORDS=true
PASSWORD_CHECK_PERSONAL_INFO=true
PASSWORD_CHECK_MATH_PATTERNS=true
PASSWORD_CHECK_CHINESE_PINYIN=true

# 限制參數
PASSWORD_MAX_REPEATING=2
PASSWORD_MAX_SEQUENTIAL=3
PASSWORD_MIN_ENTROPY=50
```

完整的密碼策略文檔請參考：[`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md)

---

## 使用說明

1. **註冊**：首次使用需建立帳號（Email + 密碼）
2. **登入**：輸入 Email 與密碼
3. **新增記帳**：填寫金額、分類、日期、描述，選擇支出類型後點擊「新增記帳」
4. **查詢記錄**：設定篩選條件後點擊「查詢」
5. **設定預算**：在設定頁面輸入各分類預算金額後點擊「儲存」
6. **刪除記錄**：在記錄列表中滑動或長按記錄可刪除

---

## 技術棧

### 後端
- Flask 3.0+
- PyMongo 4.6+
- PyJWT 2.8+
- passlib（bcrypt 密碼雜湊）
- Flask-CORS
- Flask-Limiter
- python-dotenv
- Gunicorn

### 前端
- HTML5 + Vanilla JavaScript
- Tailwind CSS（CDN）
- Fetch API
- Service Worker（PWA / 離線功能）
- IndexedDB（離線佇列）

### 資料庫
- MongoDB（建議使用 MongoDB Atlas）

### 部署
- Zeabur（後端 + 前端靜態托管）

---

## 授權

MIT License
