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
