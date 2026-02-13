# 💰 個人記帳系統

簡單易用的個人記帳應用程式，支援收入支出管理、預算追蹤、重複記帳等功能。

## ✨ 功能特色

### 📊 記帳功能
- **收入/支出記錄**：支援多種分類（早餐、午餐、晚餐、點心、飲料、其他）
- **日期管理**：可選擇任意日期記帳
- **描述備註**：為每筆記錄添加詳細說明
- **重複記帳**：支援每日/每週/每月自動重複記帳

### 📈 統計分析
- **本月收入**：即時顯示當月總收入
- **本月支出**：即時顯示當月總支出
- **結餘計算**：自動計算收支差額
- **分類統計**：按分類統計支出金額

### 🎯 預算管理
- 為每個支出分類設定月度預算
- 追蹤預算執行情況

### 🔍 查詢篩選
- 按日期範圍篩選記錄
- 按類型篩選（收入/支出）
- 按分類篩選
- 最多顯示 500 筆記錄

### 🔐 安全性
- 管理員密碼保護
- API 請求速率限制
- Session 認證機制

## 🚀 快速開始

### 環境需求

- Python 3.8+
- MongoDB 資料庫
- 現代瀏覽器（Chrome、Firefox、Safari、Edge）

### 後端設定

1. **安裝依賴**
```bash
cd backend
pip install -r requirements.txt
```

2. **設定環境變數**
```bash
# 複製環境變數範例檔案
cp .env.example .env

# 編輯 .env 檔案，填入以下資訊：
# MONGO_URI=mongodb+srv://your_connection_string
# ADMIN_SECRET=your_strong_password
```

3. **啟動後端服務**
```bash
python main.py
```

後端預設運行在 `http://localhost:5001`

### 前端設定

1. **修改後端 URL**

編輯 `frontend/index.html`，修改第 8 行的後端 URL：

```javascript
// 本地開發
window.BACKEND_URL = 'http://localhost:5001';

// 生產環境（替換為您的後端網址）
window.BACKEND_URL = 'https://your-backend.zeabur.app';
```

2. **啟動前端**

直接用瀏覽器開啟 `frontend/index.html` 即可使用。

或使用 Python 簡易 HTTP 伺服器：
```bash
cd frontend
python -m http.server 8080
```

然後訪問 `http://localhost:8080`

## 📦 部署到 Zeabur

### 後端部署

1. 在 Zeabur 建立新服務
2. 選擇從 Git 部署
3. 選擇 `backend` 資料夾
4. 設定環境變數：
   - `MONGO_URI`：MongoDB 連線字串
   - `ADMIN_SECRET`：管理員密碼
5. 部署完成後記下後端 URL

### 前端部署

1. 修改 `frontend/index.html` 的 `BACKEND_URL` 為後端 URL
2. 在 Zeabur 建立新服務
3. 選擇靜態網站部署
4. 選擇 `frontend` 資料夾
5. 部署完成

## 🗄️ 資料庫結構

### accounting_db.records

記帳記錄集合：

```javascript
{
  _id: ObjectId,
  type: String,              // 'income' 或 'expense'
  amount: Number,            // 金額
  category: String,          // 分類
  date: String,              // 日期 (YYYY-MM-DD)
  description: String,       // 描述
  is_recurring: Boolean,     // 是否重複
  recurring_type: String,    // 'daily', 'weekly', 'monthly'
  created_at: DateTime       // 建立時間
}
```

### accounting_db.budget

預算設定集合：

```javascript
{
  _id: ObjectId,
  month: String,             // 月份 (YYYY-MM)
  budget: {                  // 各分類預算
    早餐: Number,
    午餐: Number,
    晚餐: Number,
    點心: Number,
    飲料: Number,
    其他: Number
  },
  updated_at: DateTime       // 更新時間
}
```

## 🛠️ API 端點

所有 API 都需要在 Header 中帶入 `X-Admin-Secret`

### 記帳記錄

- `GET /admin/api/accounting/records` - 查詢記錄
- `POST /admin/api/accounting/records` - 新增記錄
- `PUT /admin/api/accounting/records/<id>` - 更新記錄
- `DELETE /admin/api/accounting/records/<id>` - 刪除記錄

### 統計資料

- `GET /admin/api/accounting/stats` - 取得統計資料

### 預算管理

- `GET /admin/api/accounting/budget` - 查詢預算
- `POST /admin/api/accounting/budget` - 儲存預算

### 系統狀態

- `GET /status` - 系統狀態檢查

## 🔒 安全建議

1. **使用強密碼**：`ADMIN_SECRET` 建議使用 32 字元以上的隨機密碼
2. **HTTPS**：生產環境務必使用 HTTPS
3. **定期備份**：定期備份 MongoDB 資料
4. **環境變數**：不要將 `.env` 檔案提交到版本控制

## 🔐 密碼安全策略

系統內建嚴格的密碼驗證機制，確保用戶帳號安全。

### 📋 預設密碼要求

註冊時，密碼必須符合以下所有條件：

#### 基本要求
- ✅ **最小長度**: 12 個字元
- ✅ **大寫字母**: 必須包含 A-Z
- ✅ **小寫字母**: 必須包含 a-z
- ✅ **數字**: 必須包含 0-9
- ✅ **特殊符號**: 必須包含 `!@#$%^&*()` 等

#### 安全檢查
- ❌ **重複字符**: 不能有 3 個或以上相同字符（如 `aaa`, `111`）
- ❌ **連續字符**: 不能有 4 個或以上連續字符（如 `abcd`, `1234`, `dcba`）
- ❌ **鍵盤模式**: 不能使用鍵盤相鄰按鍵（如 `qwer`, `asdf`, `1qaz`）
- ❌ **常見密碼**: 拒絕 50+ 個常見弱密碼（如 `password123`, `12345678`）
- ❌ **個人資訊**: 不能包含 Email 地址或姓名
- ❌ **數學模式**: 不能使用費式數列、平方數（如 `112358`, `1491625`）
- ❌ **中文拼音**: 不能使用常見拼音（如 `woaini`, `zhongguo`）
- ✅ **複雜度**: 熵值需達到 50 bits 以上

### 💻 即時密碼強度顯示

用戶註冊時會看到：
- 實時密碼強度評級（弱/中/強/非常強）
- 彩色進度條（🔴紅/🟡黃/🔵藍/🟢綠）
- 所有 13 個規則的通過/未通過狀態
- 具體的錯誤提示

![密碼強度檢查器示意]
```
密碼要求：
✅ 至少 12 個字元
✅ 包含大寫字母 (A-Z)
✅ 包含小寫字母 (a-z)
✅ 包含數字 (0-9)
❌ 包含特殊符號 (!@#$%^&* 等)  ← 未通過
✅ 無重複字符
✅ 無連續字符
...
強度：強 ███████████░░░ 85%
```

### ⚙️ 修改密碼規則

所有密碼規則都可以通過**環境變數**進行配置。

#### 方法 1：本地開發（.env 文件）

編輯 `backend/.env` 文件：

```bash
# 基本要求
PASSWORD_MIN_LENGTH=16                   # 提高到 16 字元
PASSWORD_REQUIRE_UPPERCASE=true          # 需要大寫字母
PASSWORD_REQUIRE_LOWERCASE=true          # 需要小寫字母
PASSWORD_REQUIRE_DIGIT=true              # 需要數字
PASSWORD_REQUIRE_SPECIAL=false           # ❌ 禁用特殊符號要求

# 模式檢查
PASSWORD_CHECK_REPEATING=true            # 檢查重複字符
PASSWORD_CHECK_SEQUENTIAL=true           # 檢查連續字符
PASSWORD_CHECK_KEYBOARD_PATTERN=true     # 檢查鍵盤模式
PASSWORD_CHECK_COMMON_PASSWORDS=true     # 檢查常見密碼
PASSWORD_CHECK_PERSONAL_INFO=true        # 檢查個人資訊
PASSWORD_CHECK_MATH_PATTERNS=true        # 檢查數學模式
PASSWORD_CHECK_CHINESE_PINYIN=false      # ❌ 禁用中文拼音檢查

# 限制參數
PASSWORD_MAX_REPEATING=2                 # 最大允許重複 2 次（3個以上拒絕）
PASSWORD_MAX_SEQUENTIAL=3                # 最大允許連續 3 次（4個以上拒絕）
PASSWORD_MIN_ENTROPY=60                  # 提高複雜度要求到 60 bits
```

**修改後需要重啟後端服務：**
```bash
cd backend
python main.py
```

#### 方法 2：Zeabur 部署

在 Zeabur 後端服務的「環境變數」設定中添加：

| 變數名稱 | 值 | 說明 |
|---------|-----|------|
| `PASSWORD_MIN_LENGTH` | `16` | 最小長度 16 字元 |
| `PASSWORD_REQUIRE_SPECIAL` | `false` | 不強制特殊符號 |
| `PASSWORD_CHECK_CHINESE_PINYIN` | `false` | 不檢查中文拼音 |
| `PASSWORD_MIN_ENTROPY` | `60` | 提高複雜度要求 |

**修改後需要重新部署後端服務。**

#### 方法 3：Docker 部署

在 `docker-compose.yml` 中設定：

```yaml
services:
  backend:
    environment:
      - PASSWORD_MIN_LENGTH=16
      - PASSWORD_REQUIRE_SPECIAL=false
      - PASSWORD_MIN_ENTROPY=60
```

### 🛠️ 密碼規則管理命令

系統提供管理命令工具，方便查看和管理密碼規則。

#### 查看當前配置

```bash
cd backend
python manage_password_rules.py show
```

**輸出範例：**
```
============================================================
📋 當前密碼規則配置
============================================================
min_length                | 📊 12       | 最小密碼長度
require_uppercase         | ✅ 啟用     | 需要大寫字母
require_lowercase         | ✅ 啟用     | 需要小寫字母
require_digit             | ✅ 啟用     | 需要數字
require_special           | ✅ 啟用     | 需要特殊符號
check_repeating           | ✅ 啟用     | 檢查重複字符
check_sequential          | ✅ 啟用     | 檢查連續字符
check_keyboard_pattern    | ✅ 啟用     | 檢查鍵盤模式
check_common_passwords    | ✅ 啟用     | 檢查常見密碼
check_personal_info       | ✅ 啟用     | 檢查個人資訊
check_math_patterns       | ✅ 啟用     | 檢查數學模式
check_chinese_pinyin      | ✅ 啟用     | 檢查中文拼音
min_entropy               | 📊 50       | 最小熵值（複雜度）
max_repeating             | 📊 2        | 最大允許重複次數
max_sequential            | 📊 3        | 最大允許連續次數
============================================================

👥 用戶統計:
   總用戶數: 5
   需要更新密碼: 0
```

#### 啟用/禁用規則

```bash
# 查看可用規則
python manage_password_rules.py show

# 提示啟用規則（需手動編輯 .env）
python manage_password_rules.py enable require_special

# 提示禁用規則（需手動編輯 .env）
python manage_password_rules.py disable check_chinese_pinyin
```

**注意：** 命令會提示你如何在 `.env` 中設定，修改後需要重啟後端服務。

#### 強制用戶更新密碼

當密碼規則變更後（例如提高安全要求），可以強制所有現有用戶更新密碼：

```bash
python manage_password_rules.py force-update
```

**確認提示：**
```
⚠️  警告：這將標記所有用戶需要更新密碼
確定要繼續嗎？(yes/no): yes
✅ 成功標記 5 個用戶需要更新密碼
📝 用戶下次登入時將被要求更改密碼
```

用戶下次登入時會被要求更改密碼以符合新規則。

#### 取消強制更新

```bash
python manage_password_rules.py reset-force
```

### 🎯 實際應用場景

#### 場景 1：降低密碼要求（開發測試）

開發階段可能想要降低密碼要求以方便測試：

```bash
# 編輯 backend/.env
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_SPECIAL=false
PASSWORD_CHECK_KEYBOARD_PATTERN=false
PASSWORD_CHECK_MATH_PATTERNS=false
PASSWORD_CHECK_CHINESE_PINYIN=false
PASSWORD_MIN_ENTROPY=30

# 重啟後端
cd backend
python main.py
```

**現在可以使用簡單密碼：** `Test1234` ✅

#### 場景 2：提高安全性（正式環境）

正式環境建議使用嚴格的密碼要求：

```bash
# 在 Zeabur 環境變數設定
PASSWORD_MIN_LENGTH=16
PASSWORD_REQUIRE_SPECIAL=true
PASSWORD_MIN_ENTROPY=60

# 重新部署後端
```

**需要更強密碼：** `mK9#vL2$wN5pRt8X` ✅

#### 場景 3：規則升級後強制更新

當你提高密碼要求後，希望現有用戶也更新密碼：

```bash
# 1. 修改規則（提高要求）
# 在 .env 中：PASSWORD_MIN_LENGTH=16

# 2. 重啟後端
python main.py

# 3. 強制所有用戶更新密碼
python manage_password_rules.py force-update

# 4. 查看狀態
python manage_password_rules.py show
```

**輸出：**
```
👥 用戶統計:
   總用戶數: 5
   需要更新密碼: 5  ← 所有用戶都需要更新
```

現有用戶下次登入時會被要求更改密碼。

#### 場景 4：針對中文用戶調整

如果用戶主要是中文使用者，可以啟用中文拼音檢查：

```bash
PASSWORD_CHECK_CHINESE_PINYIN=true   # 啟用
```

這樣會拒絕 `woaini123`, `zhongguo`, `beijing` 等常見拼音密碼。

如果用戶不是中文使用者，可以禁用以避免誤判：

```bash
PASSWORD_CHECK_CHINESE_PINYIN=false  # 禁用
```

### 💡 密碼範例

#### ❌ 不安全的密碼（會被拒絕）

```
password123       # 常見密碼
12345678         # 純數字，太短
abcd1234         # 連續字符
qwer@1234        # 鍵盤模式
john@2024        # 包含Email（如果 Email 是 john@xxx.com）
woaini123        # 中文拼音
11235813         # 費式數列
Password1        # 太短（<12字元），無特殊符號
P@ssw0rd!        # 太短，常見模式
MyName123!       # 包含姓名（如果姓名是 MyName）
```

#### ✅ 安全的密碼（符合所有要求）

```
mK9#vL2$wN5p     # 隨機字符組合，長度 12
Tr!umph@2024Zx   # 長度 14，包含所有字符類型
G7$mX#Qp2Wn5Rt   # 長度 14，無明顯模式
bL9!kP#3Rt8Mx    # 長度 13，高熵值
Sky7@Blue$Moon3  # 長度 15，混合單字+符號+數字
```

### 🔧 完整配置參考

所有可用的環境變數（預設值）：

```bash
# 基本要求
PASSWORD_MIN_LENGTH=12                      # 最小密碼長度
PASSWORD_REQUIRE_UPPERCASE=true             # 需要大寫字母
PASSWORD_REQUIRE_LOWERCASE=true             # 需要小寫字母
PASSWORD_REQUIRE_DIGIT=true                 # 需要數字
PASSWORD_REQUIRE_SPECIAL=true               # 需要特殊符號

# 模式檢查
PASSWORD_CHECK_REPEATING=true               # 檢查重複字符
PASSWORD_CHECK_SEQUENTIAL=true              # 檢查連續字符
PASSWORD_CHECK_KEYBOARD_PATTERN=true        # 檢查鍵盤模式
PASSWORD_CHECK_COMMON_PASSWORDS=true        # 檢查常見密碼
PASSWORD_CHECK_PERSONAL_INFO=true           # 檢查個人資訊
PASSWORD_CHECK_MATH_PATTERNS=true           # 檢查數學模式
PASSWORD_CHECK_CHINESE_PINYIN=true          # 檢查中文拼音

# 限制參數
PASSWORD_MAX_REPEATING=2                    # 最大允許重複次數
PASSWORD_MAX_SEQUENTIAL=3                   # 最大允許連續次數
PASSWORD_MIN_ENTROPY=50                     # 最小熵值（bits）
```

### 📚 詳細文檔

完整的密碼策略文檔請參考：[`backend/PASSWORD_POLICY.md`](backend/PASSWORD_POLICY.md)

包含：
- 詳細的驗證規則說明
- API 端點文檔
- 密碼生成建議
- FAQ 常見問題
- 安全最佳實踐

## 📝 使用說明

1. **登入**：首次使用需輸入管理員密碼（ADMIN_SECRET）
2. **新增記帳**：填寫表單後點擊「新增記帳」
3. **查詢記錄**：設定篩選條件後點擊「查詢」
4. **設定預算**：在右側輸入各分類預算金額後點擊「儲存預算」
5. **刪除記錄**：在記錄列表中點擊「刪除」按鈕

## 🎨 技術棧

### 後端
- Flask 3.0+
- PyMongo
- Flask-CORS
- Flask-Limiter
- Python-dotenv
- Gunicorn

### 前端
- HTML5
- Tailwind CSS
- Vanilla JavaScript
- Fetch API

### 資料庫
- MongoDB

## 📄 授權

MIT License

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📧 聯絡方式

如有問題或建議，歡迎聯繫。
