# API 文件

記帳系統後端 API 完整文件，包含所有端點的詳細說明、請求/回應範例。

## 目錄

- [認證相關](#認證相關)
- [記帳記錄](#記帳記錄)
- [統計分析](#統計分析)
- [環比分析](#環比分析)
- [預算管理](#預算管理)
- [定期收支](#定期收支)
- [資料匯出](#資料匯出)
- [趨勢分析](#趨勢分析)
- [用戶管理](#用戶管理)
- [系統狀態](#系統狀態)

---

## 認證相關

### 註冊用戶

**端點**: `POST /api/auth/register`

**描述**: 註冊新用戶

**請求標頭**: 無需認證

**請求體**:
```json
{
  "email": "user@example.com",
  "password": "MyS3cur3P@ssw0rd!XyZ",
  "name": "張三"
}
```

**回應 (200)**:
```json
{
  "message": "註冊成功",
  "user": {
    "email": "user@example.com",
    "name": "張三"
  }
}
```

**錯誤回應 (400)**:
```json
{
  "error": "Email 已被使用"
}
```

**密碼要求**:
- 至少 12 個字元
- 包含大寫字母、小寫字母、數字、特殊符號
- 不能有超過 2 個重複字元
- 不能有超過 3 個連續字元
- 不能包含常見密碼
- 不能包含 Email 或姓名
- 熵值需 >= 3.0

---

### 登入

**端點**: `POST /api/auth/login`

**請求體**:
```json
{
  "email": "user@example.com",
  "password": "MyS3cur3P@ssw0rd!XyZ"
}
```

**回應 (200)**:
```json
{
  "message": "登入成功",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "user@example.com",
    "name": "張三"
  }
}
```

**錯誤回應 (401)**:
```json
{
  "error": "密碼錯誤"
}
```

---

### 忘記密碼

**端點**: `POST /api/auth/forgot-password`

**請求體**:
```json
{
  "email": "user@example.com"
}
```

**回應 (200)**:
```json
{
  "message": "重設密碼連結已發送至您的 Email"
}
```

---

### 重設密碼

**端點**: `POST /api/auth/reset-password`

**請求體**:
```json
{
  "token": "abc123...",
  "new_password": "N3wP@ssw0rd!Xyz"
}
```

**回應 (200)**:
```json
{
  "message": "密碼已重設，請重新登入"
}
```

---

### 修改密碼

**端點**: `POST /api/auth/change-password`

**認證**: 需要 JWT Token

**請求標頭**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**請求體**:
```json
{
  "old_password": "OldP@ssw0rd!123",
  "new_password": "N3wP@ssw0rd!Xyz"
}
```

**回應 (200)**:
```json
{
  "message": "密碼已更新"
}
```

---

### 修改個人資料

**端點**: `POST /api/auth/update-profile`

**認證**: 需要 JWT Token

**請求體**:
```json
{
  "name": "新名字"
}
```

**回應 (200)**:
```json
{
  "message": "個人資料已更新"
}
```

---

### 即時密碼驗證

**端點**: `POST /api/auth/validate-password`

**描述**: 即時驗證密碼強度（用於前端即時顯示）

**請求體**:
```json
{
  "password": "Test123!",
  "email": "user@example.com",
  "name": "張三"
}
```

**回應 (200)**:
```json
{
  "valid": false,
  "checks": {
    "length": true,
    "uppercase": true,
    "lowercase": true,
    "digit": true,
    "special": true,
    "repeating": true,
    "sequential": false,
    "keyboard_pattern": true,
    "common_password": true,
    "personal_info": true,
    "pinyin": true,
    "math_pattern": true,
    "entropy": false
  },
  "errors": [
    "連續字元不能超過 3 個（例如：abc, 123）",
    "熵值過低，密碼太容易猜測"
  ]
}
```

---

### 獲取密碼配置

**端點**: `GET /api/auth/password-config`

**回應 (200)**:
```json
{
  "min_length": 12,
  "require_uppercase": true,
  "require_lowercase": true,
  "require_digit": true,
  "require_special": true,
  "max_repeating": 2,
  "max_sequential": 3
}
```

---

## 記帳記錄

### 新增記帳記錄

**端點**: `POST /admin/api/accounting/records`

**認證**: 需要 JWT Token

**請求體**:
```json
{
  "type": "expense",
  "amount": 1250.50,
  "category": "餐飲",
  "date": "2024-02-24",
  "description": "午餐",
  "expense_type": "variable"
}
```

**欄位說明**:
- `type`: `income` (收入) 或 `expense` (支出)
- `amount`: 金額（必須 > 0，最大 10,000,000）
- `category`: 分類（最多 50 字元）
- `date`: 日期 (YYYY-MM-DD 格式)
- `description`: 描述（最多 500 字元，可選）
- `expense_type`: 支出類型（可選）
  - `fixed`: 固定支出
  - `variable`: 變動支出
  - `onetime`: 一次性支出

**回應 (201)**:
```json
{
  "message": "記帳記錄已新增",
  "id": "65d9f8a7b4c3d2e1a0b9c8d7"
}
```

**錯誤回應 (400)**:
```json
{
  "error": "金額必須大於 0"
}
```

---

### 查詢記帳記錄

**端點**: `GET /admin/api/accounting/records`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `start_date`: 開始日期 (YYYY-MM-DD)
- `end_date`: 結束日期 (YYYY-MM-DD)
- `type`: 記錄類型 (`income` 或 `expense`)
- `category`: 分類名稱

**範例請求**:
```
GET /admin/api/accounting/records?start_date=2024-02-01&end_date=2024-02-28&type=expense
```

**回應 (200)**:
```json
[
  {
    "_id": {"$oid": "65d9f8a7b4c3d2e1a0b9c8d7"},
    "type": "expense",
    "amount": 1250.5,
    "category": "餐飲",
    "date": "2024-02-24",
    "description": "午餐",
    "expense_type": "variable",
    "created_at": {"$date": "2024-02-24T10:30:00.000Z"},
    "user_id": {"$oid": "65d9f8a7b4c3d2e1a0b9c8d6"}
  }
]
```

---

### 修改記帳記錄

**端點**: `PUT /admin/api/accounting/records/{record_id}`

**認證**: 需要 JWT Token

**請求體**:
```json
{
  "type": "expense",
  "amount": 1500.0,
  "category": "交通",
  "date": "2024-02-24",
  "description": "計程車"
}
```

**回應 (200)**:
```json
{
  "message": "記帳記錄已更新"
}
```

---

### 刪除記帳記錄

**端點**: `DELETE /admin/api/accounting/records/{record_id}`

**認證**: 需要 JWT Token

**回應 (200)**:
```json
{
  "message": "記帳記錄已刪除"
}
```

---

## 統計分析

### 獲取統計資料

**端點**: `GET /admin/api/accounting/stats`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `start_date`: 開始日期 (YYYY-MM-DD)
- `end_date`: 結束日期 (YYYY-MM-DD)

**範例請求**:
```
GET /admin/api/accounting/stats?start_date=2024-02-01&end_date=2024-02-28
```

**回應 (200)**:
```json
{
  "total_income": 50000,
  "total_expense": 32500,
  "balance": 17500,
  "category_stats": [
    {
      "_id": "餐飲",
      "total": 8500
    },
    {
      "_id": "交通",
      "total": 3200
    }
  ]
}
```

---

## 環比分析

### 取得環比資料

**端點**: `GET /admin/api/accounting/comparison`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `period`: `month`（預設）/ `quarter` / `year`

**範例請求**:
```
GET /admin/api/accounting/comparison?period=month
```

**回應 (200)**:
```json
{
  "current": {
    "income": 50000,
    "expense": 32000,
    "balance": 18000,
    "label": "2026-03"
  },
  "previous": {
    "income": 48000,
    "expense": 30000,
    "balance": 18000,
    "label": "2026-02"
  },
  "changes": {
    "income_pct": 4.2,
    "expense_pct": 6.7,
    "balance_pct": 0.0
  }
}
```

**錯誤 (400)**:
```json
{ "error": "period 必須為 month、quarter 或 year" }
```

---

## 預算管理

### 獲取預算設定

**端點**: `GET /admin/api/accounting/budget`

**認證**: 需要 JWT Token

**回應 (200)**:
```json
{
  "month": "2024-02",
  "budget": {
    "餐飲": 10000,
    "交通": 5000,
    "娛樂": 3000
  }
}
```

---

### 儲存預算設定

**端點**: `POST /admin/api/accounting/budget`

**認證**: 需要 JWT Token

**請求體**:
```json
{
  "budget": {
    "餐飲": 10000,
    "交通": 5000,
    "娛樂": 3000,
    "購物": 8000
  }
}
```

**回應 (200)**:
```json
{
  "message": "預算已儲存"
}
```

---

## 定期收支

所有端點均需要 JWT Token，速率限制 30 次/分鐘。

### 取得定期收支列表

**端點**: `GET /admin/api/recurring`

**回應 (200)**:
```json
[
  {
    "_id": "abc123",
    "name": "房租",
    "amount": 15000,
    "type": "expense",
    "category": "居住",
    "day_of_month": 5,
    "description": "每月房租",
    "created_at": "2026-03-01T00:00:00"
  }
]
```

### 新增定期收支

**端點**: `POST /admin/api/recurring`

**請求體**:
```json
{
  "name": "房租",
  "amount": 15000,
  "type": "expense",
  "category": "居住",
  "day_of_month": 5,
  "description": "每月房租"
}
```

**欄位驗證**:
- `name`：必填，1-50 字元
- `amount`：必填，正數
- `type`：`income` 或 `expense`
- `day_of_month`：1-31
- `category`：最多 30 字元（預設「其他」）
- `description`：最多 200 字元

**回應 (201)**:
```json
{ "id": "abc123", "message": "新增成功" }
```

### 更新定期收支

**端點**: `PUT /admin/api/recurring/<id>`

請求體格式同新增，所有欄位均需提供。

**回應 (200)**:
```json
{ "message": "更新成功" }
```

### 刪除定期收支

**端點**: `DELETE /admin/api/recurring/<id>`

**回應 (200)**:
```json
{ "message": "刪除成功" }
```

### 套用為實際記帳記錄

**端點**: `POST /admin/api/recurring/<id>/apply`

**說明**: 依定期項目設定的日期，在當月建立一筆實際記帳記錄。若 `day_of_month` 超出當月天數（如 31 日在二月），自動調整至月底。

**回應 (201)**:
```json
{ "id": "新建記錄ID", "message": "記帳成功" }
```

---

## 資料匯出

### 匯出記帳記錄 (CSV)

**端點**: `GET /admin/api/accounting/export`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `start_date`: 開始日期 (YYYY-MM-DD)
- `end_date`: 結束日期 (YYYY-MM-DD)
- `type`: 記錄類型 (`income` 或 `expense`)

**範例請求**:
```
GET /admin/api/accounting/export?start_date=2024-02-01&end_date=2024-02-28&type=expense
```

**回應 (200)**:
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename=記帳記錄_2024-02-01_至_2024-02-28.csv`

**CSV 格式**:
```csv
日期,類型,分類,金額,描述,支出類型
2024-02-24,支出,餐飲,1250.5,午餐,變動支出
2024-02-23,收入,薪資,50000,月薪,
```

**功能特點**:
- UTF-8 BOM 支援 Excel 正確顯示中文
- 自動生成檔名包含日期範圍
- 支援篩選條件匯出
- 速率限制：10 次/小時

---

## 趨勢分析

### 獲取月度趨勢

**端點**: `GET /admin/api/accounting/trends`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `months`: 顯示月份數量 (預設 6，最大 24)

**範例請求**:
```
GET /admin/api/accounting/trends?months=12
```

**回應 (200)**:
```json
{
  "months": ["2023-08", "2023-09", "2023-10", "2023-11", "2023-12", "2024-01", "2024-02"],
  "income": [50000, 52000, 50000, 55000, 50000, 60000, 50000],
  "expense": [32000, 35000, 28000, 40000, 45000, 38000, 32500]
}
```

**功能特點**:
- 預設顯示最近 6 個月
- 支援自訂月份數量（1-24）
- 自動補齊缺少資料的月份（顯示為 0）
- 按月份升冪排序
- 速率限制：100 次/分鐘

**前端應用範例** (Chart.js):
```javascript
const response = await fetch('/admin/api/accounting/trends?months=6', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

new Chart(ctx, {
  type: 'line',
  data: {
    labels: data.months,
    datasets: [
      {
        label: '收入',
        data: data.income,
        borderColor: 'rgb(34, 197, 94)'
      },
      {
        label: '支出',
        data: data.expense,
        borderColor: 'rgb(239, 68, 68)'
      }
    ]
  }
});
```

---

## 用戶管理

### 獲取當前用戶資訊

**端點**: `GET /api/user/profile`

**認證**: 需要 JWT Token

**回應 (200)**:
```json
{
  "email": "user@example.com",
  "name": "張三",
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

## 系統狀態

### 健康檢查

**端點**: `GET /health` 或 `GET /`

**描述**: 輕量級健康檢查（無需認證）

**回應 (200)**:
```json
{
  "status": "healthy",
  "service": "accounting-system"
}
```

---

### 系統狀態

**端點**: `GET /status`

**描述**: 系統狀態檢查（包含資料庫連線狀態）

**回應 (200)**:
```json
{
  "status": "ok",
  "db_status": "connected",
  "message": "記帳系統運作正常"
}
```

---

## 認證機制

所有需要認證的端點都必須在請求標頭中包含 JWT Token：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token 有效期
- 預設 7 天
- 過期後需要重新登入

### 錯誤回應
未認證或 Token 無效時：
```json
{
  "error": "未授權"
}
```
HTTP 狀態碼: 401

---

## 速率限制

為防止濫用，API 實施速率限制：

| 端點類別 | 限制 |
|---------|------|
| 註冊 | 5 次/小時 |
| 登入 | 10 次/小時 |
| 資料匯出 | 10 次/小時 |
| 修改密碼 | 5 次/小時 |
| 一般 API | 100 次/分鐘 |

超過限制會返回：
```json
{
  "error": "Too Many Requests"
}
```
HTTP 狀態碼: 429

---

## 錯誤代碼

| 狀態碼 | 說明 |
|--------|------|
| 200 | 成功 |
| 201 | 創建成功 |
| 400 | 請求錯誤（驗證失敗、參數錯誤） |
| 401 | 未認證 |
| 403 | 無權限 |
| 404 | 資源不存在 |
| 429 | 請求次數過多 |
| 500 | 伺服器錯誤 |

---

## 資料驗證規則

### 金額 (amount)
- 必須大於 0
- 最大值：10,000,000
- 格式：數字或浮點數

### 日期 (date)
- 格式：YYYY-MM-DD
- 必須為有效日期

### 分類 (category)
- 不可為空
- 最大長度：50 字元
- 允許自訂分類

### 描述 (description)
- 最大長度：500 字元
- 可選欄位

### Email
- 必須符合 Email 格式
- 不可重複

### 密碼
- 最小長度：12 字元
- 必須包含大小寫字母、數字、特殊符號
- 詳細規則見[認證相關](#註冊用戶)

---

## 範例：完整記帳流程

### 1. 註冊
```bash
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MyS3cur3P@ssw0rd!XyZ",
    "name": "張三"
  }'
```

### 2. 登入
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MyS3cur3P@ssw0rd!XyZ"
  }'
```

### 3. 新增記帳記錄
```bash
curl -X POST http://localhost:5001/admin/api/accounting/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "expense",
    "amount": 1250.5,
    "category": "餐飲",
    "date": "2024-02-24",
    "description": "午餐"
  }'
```

### 4. 查詢統計
```bash
curl -X GET "http://localhost:5001/admin/api/accounting/stats?start_date=2024-02-01&end_date=2024-02-28" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. 匯出 CSV
```bash
curl -X GET "http://localhost:5001/admin/api/accounting/export?start_date=2024-02-01&end_date=2024-02-28" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o "記帳記錄.csv"
```

---

## 更新日誌

查看 [CHANGELOG.md](../CHANGELOG.md) 獲取最新的 API 變更資訊。

---

## 技術支援

如有問題或建議，請至 [GitHub Issues](https://github.com/your-repo/accounting-system/issues) 提出。
