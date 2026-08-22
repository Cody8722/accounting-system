# API 文件

記帳系統後端 API 完整文件，包含所有端點的詳細說明、請求/回應範例。

## 目錄

- [認證相關](#認證相關)
- [記帳記錄](#記帳記錄)
- [資金錢包](#資金錢包)
- [記帳照片](#記帳照片)
- [統計分析](#統計分析)
- [環比分析](#環比分析)
- [預算管理](#預算管理)
- [定期收支](#定期收支)
- [欠款追蹤](#欠款追蹤)
- [資料匯出與匯入](#資料匯出與匯入)
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
- `type`: `income` (收入) 或 `expense` (支出)。`transfer`（內部轉移）與 `restricted`（受限資金）無法透過本端點直接建立，請分別見下方「新增內部轉移」端點，以及本節下方的 `restricted_amount` 拆分欄位
- `amount`: 金額（必須 > 0，最大 10,000,000）
- `category`: 分類（最多 50 字元）
- `date`: 日期 (YYYY-MM-DD 格式)
- `description`: 描述（最多 500 字元，可選）
- `expense_type`: 支出類型（可選）
  - `fixed`: 固定支出
  - `variable`: 變動支出
  - `onetime`: 一次性支出

**進階欄位（可選）**:
- `wallet_id`: 指定要記入哪個資金錢包（見[資金錢包](#資金錢包)章節）；省略、`null` 或空字串代表「未分類」
- `location`: `bank`（銀行）或 `cash`（現金）
  - `type=income` 時**必填**，由使用者指定資金進帳的位置
  - `type=expense` 時由後端自動判斷：現金餘額足夠優先扣現金，不足則需從銀行提領補齊（見下方「現金不足」情境），前端傳入的 `location` 會被忽略
- `client_id`: 離線同步冪等用的字串（最長 64 字元）。帶相同 `client_id` 重送會直接回傳既有記錄（`deduped: true`），不會重複建立；一般線上操作可不帶
- `restricted_amount` / `restricted_description`: 僅 `type=income` 適用，用於「收入拆分受限資金」——從這筆收入中拆出部分金額鎖定為受限資金（例如代收代付款項）。`restricted_amount` 需通過金額驗證；此時 `amount` 可為 `0`（代表全額皆為受限資金，不產生一般收入記錄，回應也不會有 `id` 欄位）
- `confirm_withdrawal`: `type=expense` 且現金餘額不足時，第一次請求會回傳 `409`（見下方錯誤回應）；前端需帶 `confirm_withdrawal: true` 重新送出，才會先建立一筆「自動提領」轉帳記錄（`type=transfer`、`auto_generated: true`），再建立支出本身

**回應 (201)**:
```json
{
  "message": "記帳記錄已新增",
  "id": "65d9f8a7b4c3d2e1a0b9c8d7"
}
```

> 若使用 `restricted_amount` 拆分受限資金，回應會多一個 `restricted_id` 欄位；若 `amount` 為 `0`（全額受限），則不會有 `id` 欄位（因為沒有建立一般收入記錄）。

**錯誤回應 (400)**:
```json
{
  "error": "金額必須大於 0"
}
```

**錯誤回應 (409) — 支出時現金不足，需確認自動提領**:
```json
{
  "error": "cash_insufficient",
  "message": "現金不足，需從銀行提領 NT$ 5,000 補齊，是否確認？",
  "cash_balance": 1200.0,
  "deficit": 3800.0,
  "withdrawal_amount": 5000.0
}
```
> 收到此回應後，若使用者確認提領，重新送出同一請求並加上 `"confirm_withdrawal": true` 即可完成支出。

---

### 查詢記帳記錄

**端點**: `GET /admin/api/accounting/records`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `start_date`: 開始日期 (YYYY-MM-DD)
- `end_date`: 結束日期 (YYYY-MM-DD)
- `type`: 記錄類型 (`income` 或 `expense`)
- `category`: 分類名稱
- `search`: 關鍵字搜尋（比對 `description` 欄位，不分大小寫）
- `sort_by`: 排序欄位（`date`（預設）或 `amount`）
- `sort_order`: 排序方向（`desc`（預設）或 `asc`）
- `page`: 頁碼（預設 `1`）
- `limit`: 每頁筆數（預設 `20`）

**範例請求**:
```
GET /admin/api/accounting/records?type=expense&search=午餐&sort_by=amount&sort_order=desc&page=1
```

**回應 (200)**:
```json
{
  "records": [
    {
      "_id": {"$oid": "65d9f8a7b4c3d2e1a0b9c8d7"},
      "type": "expense",
      "amount": 1250.5,
      "category": "午餐",
      "date": "2024-02-24",
      "description": "午餐",
      "expense_type": "variable",
      "created_at": {"$date": "2024-02-24T10:30:00.000Z"},
      "user_id": {"$oid": "65d9f8a7b4c3d2e1a0b9c8d6"}
    }
  ],
  "total": 42,
  "page": 1,
  "total_pages": 3
}
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

### 新增內部轉移

**端點**: `POST /admin/api/accounting/records/transfer`

**認證**: 需要 JWT Token

**描述**: 記錄同一資金錢包內、銀行與現金之間的資金搬移（例如提款、存款），不計入收入/支出統計，只影響對應位置的餘額計算。

**請求體**:
```json
{
  "wallet_id": "65d9f8a7b4c3d2e1a0b9c8d7",
  "from_location": "bank",
  "to_location": "cash",
  "amount": 3000,
  "date": "2024-02-24",
  "description": "提款"
}
```

**欄位說明**:
- `wallet_id`：必填，轉移必須指定所屬帳戶（不可為「未分類」）
- `from_location` / `to_location`：必填，皆為 `bank` 或 `cash`，且兩者不可相同
- `amount`：必須 > 0，最大 10,000,000
- `date`：日期 (YYYY-MM-DD)
- `description`：描述（最多 500 字元，可選）

**回應 (201)**:
```json
{
  "message": "轉移已記錄",
  "id": "65d9f8a7b4c3d2e1a0b9c8d8"
}
```

**錯誤回應 (400)**:
```json
{ "error": "轉出與轉入位置不可相同" }
```

> 支出時因現金不足而自動產生的提領轉帳（見「新增記帳記錄」的 `confirm_withdrawal`）也是同一種記錄型別（`type: "transfer"`），差異在於 `auto_generated` 為 `true`，且由系統直接寫入、不經過本端點。

---

### 解鎖受限資金

**端點**: `POST /admin/api/accounting/records/{record_id}/unlock`

**認證**: 需要 JWT Token

**描述**: 將一筆受限資金（`type: "restricted"`）整筆轉為一般收入，並新增一筆對應支出記錄代表這筆錢已經交出去。不支援部分解鎖，一次只能整筆處理。

**請求體**:
```json
{ "date": "2024-03-01" }
```

**欄位說明**:
- `date`：必填，代表實際交出去的日期（YYYY-MM-DD）；原受限資金記錄沿用當初記錄的收到日期，不會被覆蓋

**回應 (201)**:
```json
{
  "message": "已解鎖",
  "expense_id": "65d9f8a7b4c3d2e1a0b9c8d9"
}
```

**錯誤回應 (400)**:
```json
{ "error": "只有受限資金記錄可以解鎖" }
```
```json
{ "error": "這筆受限資金已經解鎖過了" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該記錄或無權限操作" }
```

---

### 取得資料版本簽章

**端點**: `GET /admin/api/accounting/data-version`

**認證**: 需要 JWT Token

**描述**: 輕量更新檢查端點。回傳一個不透明的版本簽章字串（由 records/budget/recurring/wallets 四個集合的筆數與最後更新時間組合計算），供前端（尤其是多裝置或 PWA 離線情境）比對是否需要重新抓取完整資料，避免每次都重新整理造成不必要的流量與畫面閃爍。

**回應 (200)**:
```json
{ "version": "3f2504e04f8964..." }
```

**備註**:
- `version` 純粹是不透明字串，非安全用途（內部以 MD5 產生），前端只需比對是否與上次快取的值相同即可
- records/budget/recurring/wallets 任一集合的新增、修改、刪除都會改變此值
- 速率限制：200 次/分鐘

---

## 資金錢包

資金錢包（wallet）代表同一登入帳號底下的不同資金來源（例如「日常帳戶」「旅遊基金」），與登入帳號（`user_id`）是不同概念——一個帳號底下可以有多個錢包。記帳記錄的 `wallet_id` 為可選欄位，`null` 代表「未分類」，沿用既有記錄相容，不強制搬遷舊資料。

以下端點皆需要 JWT Token 認證。

### 取得錢包列表

**端點**: `GET /admin/api/wallets`

**查詢參數** (可選):
- `show_archived`：`true` 時包含已封存的錢包（預設 `false`，只回傳未封存）

**回應 (200)**:
```json
[
  {
    "id": "65d9f8a7b4c3d2e1a0b9c8d7",
    "name": "日常帳戶",
    "icon": "💰",
    "color": "#2563EB",
    "is_default": true,
    "archived": false,
    "created_at": "2024-02-24T10:30:00.000000"
  }
]
```

**備註**: 速率限制 100 次/分鐘。

---

### 新增錢包

**端點**: `POST /admin/api/wallets`

**請求體**:
```json
{
  "name": "旅遊基金",
  "icon": "✈️",
  "color": "#10B981",
  "is_default": false
}
```

**欄位說明**:
- `name`：必填，1-30 字元
- `icon` / `color`：可選，最長 40 字元，空字串會被正規化為 `null`
- `is_default`：可選，預設 `false`；設為 `true` 時，同一使用者底下其他錢包會自動被取消預設狀態（同時只能有一個預設錢包）

**回應 (201)**:
```json
{ "id": "65d9f8a7b4c3d2e1a0b9c8d8", "message": "錢包已新增" }
```

**錯誤回應 (400)**:
```json
{ "error": "錢包名稱不可為空" }
```

**備註**: 速率限制 30 次/分鐘。

---

### 更新錢包

**端點**: `PUT /admin/api/wallets/{wallet_id}`

**描述**: 可改名、換圖示/顏色、設為預設、封存或還原。所有欄位皆為可選，只需傳送要修改的欄位。

**請求體範例**:
```json
{ "name": "旅遊基金 2024", "is_default": true }
```

**欄位說明**:
- `name`：1-30 字元
- `icon` / `color`：最長 40 字元
- `archived`：`true`/`false`；設為 `true` 時會一併取消該錢包的預設狀態
- `is_default`：`true`/`false`；與 `archived` 同時出現時以 `archived` 邏輯優先（`archived: true` 一律清除 `is_default`）

**回應 (200)**:
```json
{ "message": "錢包已更新" }
```

**錯誤回應 (400)**:
```json
{ "error": "沒有可更新的欄位" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該錢包或無權限修改" }
```

**備註**: 速率限制 30 次/分鐘。

---

### 封存錢包

**端點**: `DELETE /admin/api/wallets/{wallet_id}`

**描述**: 封存而非刪除——歷史關聯記錄不受影響，只是該錢包不再出現在新增記錄的選單中。封存同時會取消該錢包的預設狀態。

**回應 (200)**:
```json
{ "message": "錢包已封存" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該錢包或無權限操作" }
```

**備註**: 速率限制 30 次/分鐘。

---

### 各錢包即時餘額

**端點**: `GET /admin/api/wallets/balances`

**描述**: 回傳每個（未封存）錢包的收入、支出、餘額，並額外附加一筆 `wallet_id: null` 的「未分類」桶（涵蓋舊資料或尚未指定錢包的記錄），方便使用者核對總額。

**回應 (200)**:
```json
[
  {
    "wallet_id": "65d9f8a7b4c3d2e1a0b9c8d7",
    "name": "日常帳戶",
    "icon": "💰",
    "color": "#2563EB",
    "is_default": true,
    "income": 50000.0,
    "expense": 32500.0,
    "balance": 17500.0
  },
  {
    "wallet_id": null,
    "name": "未分類",
    "icon": null,
    "color": null,
    "is_default": false,
    "income": 0.0,
    "expense": 0.0,
    "balance": 0.0
  }
]
```

**備註**: 速率限制 100 次/分鐘。

---

### 帳戶 × 位置雙維度餘額

**端點**: `GET /admin/api/wallets/location-summary`

**描述**: 同時回傳每個帳戶在「銀行」「現金」兩個位置的餘額（收入 − 支出 + 轉入 − 轉出），以及跨帳戶的位置總計，供統計頁面顯示銀行/現金維度使用。

**回應 (200)**:
```json
{
  "wallets": [
    {
      "wallet_id": "65d9f8a7b4c3d2e1a0b9c8d7",
      "name": "日常帳戶",
      "icon": "💰",
      "color": "#2563EB",
      "is_default": true,
      "locations": {
        "bank": { "balance": 42000.0 },
        "cash": { "balance": 3500.0 }
      },
      "unclassified_balance": 0.0,
      "total_balance": 45500.0
    },
    {
      "wallet_id": null,
      "name": "未分類",
      "icon": null,
      "color": null,
      "is_default": false,
      "locations": {
        "bank": { "balance": 0.0 },
        "cash": { "balance": 0.0 }
      },
      "unclassified_balance": 0.0,
      "total_balance": 0.0
    }
  ],
  "location_totals": {
    "bank": 42000.0,
    "cash": 3500.0
  }
}
```

**備註**:
- `unclassified_balance` 為該帳戶內 `location` 欄位缺失的舊資料餘額（此功能上線前的歷史記錄）
- 速率限制 100 次/分鐘

---

### 單一錢包餘額歷史

**端點**: `GET /admin/api/wallets/{wallet_id}/balance-history`

**描述**: 回傳指定錢包近 N 個月的月度增減（`net_changes`）與月底累計餘額（`balances`）。累計餘額會從該錢包最早有記錄的月份開始逐月往下算，確保回傳區間的起始餘額正確，不會因為只看最近 N 個月而從 0 起算。

**查詢參數** (可選):
- `months`：顯示月份數量（預設 12，範圍 1-24）

**回應 (200)**:
```json
{
  "wallet_id": "65d9f8a7b4c3d2e1a0b9c8d7",
  "months": ["2023-09", "2023-10", "2023-11", "2023-12", "2024-01", "2024-02"],
  "net_changes": [5000, -2000, 3000, -1500, 4000, -2500],
  "balances": [5000, 3000, 6000, 4500, 8500, 6000]
}
```

**錯誤回應 (400)**:
```json
{ "error": "months 必須為整數" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該錢包或無權限存取" }
```

**備註**: 速率限制 100 次/分鐘。

---

### 受限資金列表

**端點**: `GET /admin/api/wallets/restricted-funds`

**描述**: 列出目前所有還鎖著（尚未解鎖）的受限資金記錄（`type: "restricted"`），供錢包管理面板顯示總額與明細。已解鎖的記錄不會出現在此列表（解鎖後 `type` 會變成 `income`）。

**回應 (200)**:
```json
{
  "total": 8000.0,
  "items": [
    {
      "id": "65d9f8a7b4c3d2e1a0b9c8da",
      "amount": 8000.0,
      "description": "代收班費",
      "date": "2024-02-24",
      "wallet_id": "65d9f8a7b4c3d2e1a0b9c8d7",
      "wallet_name": "日常帳戶",
      "location": "bank",
      "linked_income_id": "65d9f8a7b4c3d2e1a0b9c8db"
    }
  ]
}
```

**備註**:
- `wallet_name` 即使該錢包已被封存也會正確顯示（受限資金查詢會含已封存錢包的名稱對照）
- `linked_income_id` 指向拆分出這筆受限資金的原始收入記錄
- 速率限制 100 次/分鐘

---

### 單一錢包資金流向樹

**端點**: `GET /admin/api/wallets/{wallet_id}/flow-tree`

**描述**: 回傳單一錢包的銀行/現金淨額、目前鎖定中的受限資金總額，以及三種「已明確記錄的資金流向」的全時間累計次數與金額：
- `auto_withdrawal`：銀行 → 現金的自動提領（支出時現金不足，系統自動產生的轉帳，`auto_generated: true`）
- `restricted_split`：收入 → 受限資金的拆分（不分是否已解鎖，累計曾經拆出去的總額）
- `restricted_unlock`：受限資金 → 原位置的解鎖（`source_restricted_id` 不為空的支出，位置沿用原受限記錄的 `location`）

不做一般收入/支出配對追蹤，只加總這三種欄位本身已經記錄的關聯。

**回應 (200)**:
```json
{
  "wallet_id": "65d9f8a7b4c3d2e1a0b9c8d7",
  "wallet_name": "日常帳戶",
  "locations": {
    "bank": { "balance": 42000.0 },
    "cash": { "balance": 3500.0 }
  },
  "restricted_locked_total": 8000.0,
  "edges": {
    "auto_withdrawal": { "count": 3, "amount": 15000.0 },
    "restricted_split": { "count": 2, "amount": 12000.0 },
    "restricted_unlock": { "count": 1, "amount": 4000.0 }
  }
}
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該錢包或無權限存取" }
```

**備註**: 速率限制 100 次/分鐘。

---

## 記帳照片

記帳記錄可附加照片憑證。照片 metadata 內嵌在 `records.photos` 陣列（不開獨立集合），實際檔案存於伺服器端 `PHOTO_STORAGE_PATH` 目錄下，依 `<user_id>/<record_id>/<photo_id>.<副檔名>` 存放。不做伺服器端縮圖或壓縮（前端上傳前已先行壓縮），伺服器端只用「大小上限」把關。

以下端點皆需要 JWT Token 認證。

### 上傳照片

**端點**: `POST /admin/api/accounting/records/{record_id}/photos`

**描述**: 上傳一或多張照片到指定記帳記錄，`multipart/form-data` 格式，欄位名固定為 `photos`（可重複帶多個檔案達成多檔上傳）。

**請求範例**:
```bash
curl -X POST http://localhost:5001/admin/api/accounting/records/65d9f8a7b4c3d2e1a0b9c8d7/photos \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "photos=@receipt1.jpg" \
  -F "photos=@receipt2.png"
```

**驗證規則**:
- 單筆記錄最多 20 張照片（含已存在的）
- 單檔大小上限 10MB
- 僅接受 `image/jpeg`、`image/png`、`image/webp`，且會實際比對檔案開頭的簽章 magic bytes（不信任請求帶的 `Content-Type`），偽裝成圖片的任意檔案會被拒絕
- 全部檔案驗證通過才會寫入磁碟；只要有一張未通過驗證，整批都不會寫入（避免部分寫入卻資料庫沒同步的不一致狀態）

**回應 (201)**:
```json
{
  "photos": [
    {
      "id": "65d9f8a7b4c3d2e1a0b9c8dc",
      "filename": "65d9f8a7b4c3d2e1a0b9c8dc.jpg",
      "original_filename": "receipt1.jpg",
      "content_type": "image/jpeg",
      "size_bytes": 245680,
      "uploaded_at": "2024-02-24T10:30:00.000000"
    }
  ]
}
```

**錯誤回應 (400)**:
```json
{ "error": "單筆記錄最多 20 張照片" }
```
```json
{ "error": "照片檔案過大（上限 10MB）" }
```
```json
{ "error": "不支援的圖片格式" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該記錄或無權限操作" }
```

**備註**: 速率限制 30 次/分鐘。

---

### 刪除照片

**端點**: `DELETE /admin/api/accounting/records/{record_id}/photos/{photo_id}`

**描述**: 先移除資料庫內的照片參照，再刪除磁碟檔案。若磁碟刪除失敗，只會留下無害的孤兒檔案（可事後清理），不會出現「畫面顯示一張其實刪不掉的照片」的狀況。

**回應 (200)**:
```json
{ "message": "已刪除" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該照片" }
```

**備註**: 速率限制 30 次/分鐘。

---

### 取得照片本體

**端點**: `GET /admin/api/accounting/records/{record_id}/photos/{photo_id}`

**描述**: 回傳照片檔案本體（二進位）。需以 `Authorization: Bearer` header 認證——因為 `<img src>` 無法帶自訂 header，前端須改用 `fetch()` 取得 blob 後自行 `createObjectURL()` 給 `<img>` 使用。

**請求範例**:
```bash
curl -X GET http://localhost:5001/admin/api/accounting/records/65d9f8a7b4c3d2e1a0b9c8d7/photos/65d9f8a7b4c3d2e1a0b9c8dc \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o receipt1.jpg
```

**回應 (200)**: 對應 `content_type` 的二進位圖片內容。

**錯誤回應 (404)**:
```json
{ "error": "照片檔案遺失" }
```
> 資料庫內有參照但磁碟檔案不存在時回傳此錯誤（例如儲存卷未正確掛載）。

**備註**: 速率限制 300 次/分鐘。

---

### 跨記錄照片瀏覽清單

**端點**: `GET /admin/api/accounting/photos`

**描述**: 依上傳時間新到舊排序、分頁回傳使用者所有記帳記錄的照片清單，供「照片牆」瀏覽介面使用；點縮圖可依回傳的 `record_id` 跳轉到對應記錄。

**查詢參數** (可選):
- `page`：頁碼（預設 1）
- `limit`：每頁筆數（預設 30，最大 100）

**回應 (200)**:
```json
{
  "items": [
    {
      "record_id": "65d9f8a7b4c3d2e1a0b9c8d7",
      "record_type": "expense",
      "record_category": "餐飲",
      "record_date": "2024-02-24",
      "photo_id": "65d9f8a7b4c3d2e1a0b9c8dc",
      "content_type": "image/jpeg",
      "uploaded_at": "2024-02-24T10:30:00.000000"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 30,
  "total_pages": 2
}
```

**錯誤回應 (400)**:
```json
{ "error": "page 和 limit 必須為正整數" }
```

**備註**: 速率限制 100 次/分鐘。

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
- `period`: `month`（預設）/ `week` / `quarter` / `year`

**範例請求**:
```
GET /admin/api/accounting/comparison?period=week
```

**回應 (200)**:
```json
{
  "current": {
    "income": 5000,
    "expense": 3200,
    "balance": 1800,
    "label": "2026/03/09 週"
  },
  "previous": {
    "income": 4800,
    "expense": 3000,
    "balance": 1800,
    "label": "2026/03/02 週"
  },
  "changes": {
    "income_pct": 4.2,
    "expense_pct": 6.7,
    "balance_pct": 0.0
  }
}
```

> `label` 格式依 period 不同：`week` 為 `"YYYY/MM/DD 週"`，`month` 為 `"YYYY-MM"`，`quarter` 為 `"YYYY-QN"`，`year` 為 `"YYYY"`。

**錯誤 (400)**:
```json
{ "error": "period 必須為 week、month、quarter 或 year" }
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

## 欠款追蹤

欠款追蹤記錄「借出」「借入」款項，支援單一對象與多人分帳（`members`）兩種模式。還款時會自動同步寫入一筆記帳記錄（`debt_id` 指向該筆欠款、`auto_generated: true`），讓還款金額同時反映在收支統計中。

以下端點皆需要 JWT Token 認證。

### 欠款欄位說明

- `debt_type`：`lent`（借出，別人欠我）或 `borrowed`（借入，我欠別人）。註：歷史資料可能存在已淘汰的 `debt_type: "group"`（群組分帳），後端提供一次性遷移函式 `migrate_group_debts()` 自動轉為 `lent` + `members` 格式，新資料一律使用 `lent`/`borrowed`
- `person`：對象姓名或標題，最多 50 字元
- `amount`：總金額
- `reason`：原因說明，最多 200 字元（可選）
- `paid_amount`：已還款總額（單一對象模式下由 `/repay` 累加；多人分帳模式下由各成員 `paid_amount` 加總得出）
- `is_settled`：是否已結清
- `repayments`：單一對象模式的還款歷史陣列（`{amount, date, note}`）
- `members`：多人分帳陣列，每筆為 `{name, share, paid_amount, is_settled}`；空陣列代表單一對象模式
- 動態附加欄位（僅 `members` 非空時附加，由 API 即時計算，不落地儲存）：`total_members`、`paid_members`、`pending_receivable`（尚未還清的成員應收總額）

---

### 取得欠款列表

**端點**: `GET /admin/api/debts`

**查詢參數** (可選):
- `type`：篩選 `debt_type`（`lent`、`borrowed`，或已淘汰但仍相容的 `group`）
- `show_settled`：`true` 時包含已結清的欠款（預設 `false`，只回傳未結清）

**回應 (200)**:
```json
[
  {
    "_id": { "$oid": "65d9f8a7b4c3d2e1a0b9c8dd" },
    "debt_type": "lent",
    "person": "小明",
    "amount": 3000,
    "reason": "代墊聚餐費用",
    "date": "2024-02-24",
    "paid_amount": 1000,
    "is_settled": false,
    "repayments": [
      { "amount": 1000, "date": "2024-02-25", "note": "先還一部分" }
    ],
    "members": [],
    "created_at": { "$date": "2024-02-24T10:30:00.000Z" },
    "user_id": { "$oid": "65d9f8a7b4c3d2e1a0b9c8d6" }
  }
]
```

**備註**: 速率限制 100 次/分鐘。

---

### 新增欠款

**端點**: `POST /admin/api/debts`

**請求體（單一對象）**:
```json
{
  "debt_type": "lent",
  "person": "小明",
  "amount": 3000,
  "reason": "代墊聚餐費用",
  "date": "2024-02-24"
}
```

**請求體（多人分帳）**:
```json
{
  "debt_type": "lent",
  "person": "聚餐分帳",
  "amount": 3000,
  "date": "2024-02-24",
  "members": [
    { "name": "小明", "share": 1000 },
    { "name": "小華", "share": 2000 }
  ]
}
```

**欄位說明**:
- `debt_type`：必填，`lent` 或 `borrowed`
- `person`：必填，最多 50 字元
- `amount`：必填，須 > 0
- `date`：可選，預設今天
- `reason`：可選，最多 200 字元
- `members`：可選，提供時每筆需有 `name`（會 trim 並截斷至 50 字元，空白名稱會被忽略）與 `share`；提供 `members` 即進入多人分帳模式

**回應 (201)**:
```json
{ "id": "65d9f8a7b4c3d2e1a0b9c8dd", "message": "欠款記錄已新增" }
```

**錯誤回應 (400)**:
```json
{ "error": "debt_type 必須為 lent 或 borrowed" }
```
```json
{ "error": "請輸入對象姓名或標題" }
```
```json
{ "error": "請輸入有效金額" }
```

**備註**: 速率限制 50 次/分鐘。

---

### 取得單筆欠款

**端點**: `GET /admin/api/debts/{debt_id}`

**回應 (200)**: 同列表中單筆的格式（含動態附加欄位）。

**錯誤回應 (404)**:
```json
{ "error": "找不到該記錄或無權限存取" }
```

**備註**: 速率限制 100 次/分鐘。

---

### 更新欠款

**端點**: `PUT /admin/api/debts/{debt_id}`

**描述**: 可修改 `person`、`amount`、`reason`、`date`、`members`，皆為可選欄位，只需傳送要修改的欄位。修改 `members` 會整組覆蓋。

**請求體範例**:
```json
{ "amount": 3500, "reason": "追加消夜費用" }
```

**回應 (200)**:
```json
{ "message": "欠款記錄已更新" }
```

**錯誤回應 (400)**:
```json
{ "error": "沒有可更新的欄位" }
```

**備註**: 速率限制 50 次/分鐘。

---

### 刪除欠款

**端點**: `DELETE /admin/api/debts/{debt_id}`

**描述**: 刪除欠款記錄本身；曾同步產生的記帳記錄不會被刪除，但會標記 `debt_deleted: true`（`debt_id` 對應且 `auto_generated: true` 的記帳記錄）。

**回應 (200)**:
```json
{ "message": "欠款記錄已刪除" }
```

**錯誤回應 (404)**:
```json
{ "error": "找不到該記錄或無權限刪除" }
```

**備註**: 速率限制 50 次/分鐘。

---

### 新增還款（單一對象）

**端點**: `POST /admin/api/debts/{debt_id}/repay`

**描述**: 僅適用於單一對象模式（`members` 為空陣列）；多人分帳請改用「分帳成員還款」端點。還款會同步寫入一筆記帳記錄：`debt_type=lent` 寫入 `income`（分類「債務收回」），`debt_type=borrowed` 寫入 `expense`（分類「債務償還」）。

**請求體**:
```json
{ "amount": 1000, "date": "2024-02-25", "note": "先還一部分" }
```

**欄位說明**:
- `amount`：必填，須 > 0
- `date`：可選，預設今天
- `note`：可選，最多 100 字元

**回應 (200)**:
```json
{ "message": "還款記錄已新增", "is_settled": false }
```

**回應 (200) — 記帳同步失敗時**（還款本身仍會成功寫入，只是對應的記帳記錄沒有一併產生）:
```json
{
  "message": "還款記錄已新增，但記帳同步失敗，請手動補記",
  "is_settled": false,
  "sync_failed": true
}
```

**錯誤回應 (400)**:
```json
{ "error": "請輸入有效還款金額" }
```
```json
{ "error": "多人分帳請使用分帳成員還款功能" }
```

**備註**: 速率限制 50 次/分鐘。

---

### 分帳成員還款

**端點**: `POST /admin/api/debts/{debt_id}/members/{member_idx}/repay`

**描述**: `member_idx` 為 `members` 陣列的索引（從 0 起算）。還款邏輯與單一對象相同（同步寫入對應記帳記錄），但更新的是該成員的 `paid_amount`／`is_settled`，並重新計算整筆欠款的 `paid_amount`（所有成員加總）與 `is_settled`（是否全員結清）。

**請求體**:
```json
{ "amount": 1000, "date": "2024-02-25" }
```

**回應 (200)**:
```json
{ "message": "還款已記錄", "is_settled": false }
```

**錯誤回應 (400)**:
```json
{ "error": "無效的成員索引" }
```

**備註**: 速率限制 50 次/分鐘。

---

### 切換結清狀態

**端點**: `POST /admin/api/debts/{debt_id}/settle`

**描述**: 手動切換整筆欠款的 `is_settled`（true ↔ false），不受還款金額是否足額限制，供使用者手動標記「已結清」或「取消結清」。

**回應 (200)**:
```json
{ "message": "狀態已更新", "is_settled": true }
```

**備註**: 速率限制 50 次/分鐘。

---

### 群組成員付款切換

**端點**: `PUT /admin/api/debts/{debt_id}/members/{member_idx}/pay`

**描述**: 僅適用於已淘汰但仍相容的 `debt_type: "group"` 資料格式，切換指定成員的 `paid`（布林）狀態；所有成員皆 `paid` 時整筆欠款自動標記為 `is_settled`。新資料建議一律使用 `lent`/`borrowed` + `members` 格式與「分帳成員還款」端點。

**回應 (200)**:
```json
{ "message": "成員付款狀態已更新", "is_settled": false }
```

**錯誤回應 (400)**:
```json
{ "error": "此功能僅適用於群組分帳" }
```

**備註**: 速率限制 50 次/分鐘。

---

## 資料匯出與匯入

### 匯出記帳記錄

**端點**: `GET /admin/api/accounting/export`

**認證**: 需要 JWT Token

**查詢參數** (可選):
- `start_date`: 開始日期 (YYYY-MM-DD)（`format=json` 時會被忽略，JSON 備份一律匯出全部記錄）
- `end_date`: 結束日期 (YYYY-MM-DD)（同上）
- `type`: 記錄類型 (`income` 或 `expense`)（`format=json` 時同樣被忽略）
- `format`: 匯出格式，`csv`（預設）、`xlsx`、`json` 三選一；其他值一律視為 `csv`

**範例請求**:
```
GET /admin/api/accounting/export?start_date=2024-02-01&end_date=2024-02-28&type=expense&format=csv
GET /admin/api/accounting/export?format=xlsx
GET /admin/api/accounting/export?format=json
```

**回應 (200) — CSV**:
- Content-Type: `text/csv; charset=utf-8-sig`
- Content-Disposition: `attachment; filename=記帳記錄_2024-02-01_至_2024-02-28.csv`

```csv
日期,類型,分類,金額,描述,支出類型
2024-02-24,支出,餐飲,1250.5,午餐,變動支出
2024-02-23,收入,薪資,50000,月薪,
```

**回應 (200) — Excel (xlsx)**:
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename=記帳記錄_20240224.xlsx`
- 內容欄位與 CSV 相同（日期/類型/分類/金額/描述/支出類型），加上標題列樣式（藍底白字置中）與凍結首列

**回應 (200) — JSON 備份**:
- Content-Type: `application/json`
- Content-Disposition: `attachment; filename=記帳備份_20240224.json`

```json
{
  "version": "1.0",
  "exported_at": "2024-02-24T10:30:00",
  "count": 2,
  "records": [
    {
      "type": "expense",
      "amount": 1250.5,
      "category": "餐飲",
      "date": "2024-02-24",
      "description": "午餐",
      "expense_type": "variable"
    }
  ]
}
```

**功能特點**:
- CSV/Excel：UTF-8 BOM 支援 Excel 正確顯示中文；`type` 欄位轉為中文顯示（含 `transfer`「轉帳」、`restricted`「受限資金」）
- JSON 備份格式：一律匯出全部記錄（不套用日期/類型篩選），僅保留 `type`/`amount`/`category`/`date`/`description`/`expense_type` 六個欄位（不含 `wallet_id`、`location`、`photos` 等其他欄位），供搭配「匯入記帳記錄」端點還原使用
- 自動生成檔名包含日期範圍（CSV/Excel）或匯出日期（JSON）
- 速率限制：10 次/小時

---

### 匯入記帳記錄

**端點**: `POST /admin/api/accounting/import`

**認證**: 需要 JWT Token

**描述**: 從「匯出記帳記錄」的 JSON 備份格式匯入記帳記錄，逐筆驗證並寫入，不會整批失敗——單筆驗證失敗只會被計入 `invalid`，不影響其他筆的匯入。

**請求體**:
```json
{
  "records": [
    {
      "type": "expense",
      "amount": 1250.5,
      "category": "餐飲",
      "date": "2024-02-24",
      "description": "午餐",
      "expense_type": "variable"
    }
  ]
}
```

**欄位說明**（`records` 陣列內每筆）:
- `type`：須通過與新增記帳記錄相同的類型驗證（`income`/`expense`/`transfer`/`restricted`）
- `amount`：須通過金額驗證（> 0，最大 10,000,000）
- `date`：須為合法 YYYY-MM-DD 日期
- `category`：不可為空
- `description`：可選，最多 500 字元
- `expense_type`：可選，須為 `fixed`/`variable`/`onetime`，其餘值一律視為未設定

**去重邏輯**: 逐筆比對 `user_id + date + type + amount + category + description` 完全相同的既有記錄，命中即視為重複、不重複匯入（計入 `duplicates`）。匯入的記錄一律不會帶 `wallet_id`／`location`（視為「未分類」），也不會帶 `client_id`。

**回應 (200)**:
```json
{
  "imported": 8,
  "duplicates": 2,
  "invalid": 1,
  "total": 11
}
```

**錯誤回應 (400)**:
```json
{ "error": "格式錯誤：需要包含 records 陣列" }
```

**備註**: 速率限制 5 次/小時。

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

如有問題或建議，請至 [GitHub Issues](https://github.com/Cody8722/accounting-system/issues) 提出。
