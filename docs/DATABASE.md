# 資料庫結構

資料庫名稱：`accounting_db`，包含**七個**集合（`users`／`records`／`budget`／`recurring`／`debts`／`wallets`／`invites`）。

> ⚠️ 以下為對照後端實際程式碼（`backend/routes/*.py`）確認過的真實欄位。`user_id` 在 `records`／`budget` 皆為 **ObjectId**（非字串），三個資料表寫入時一律用 `ObjectId(request.user_id)`。

## users（用戶帳號）

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
  password_changed_at: DateTime,    // 最近一次改密碼／重設密碼的時間（UTC，可選）；此時間之前簽發的 token 一律失效。從未改過密碼的帳號沒有此欄位
  requires_password_change: Boolean,// 強制修改密碼旗標
  password_reset_token: String,     // 忘記密碼流程用（可選，用完即 $unset）
  password_reset_expires: DateTime  // reset token 效期（可選）
}
```

## records（記帳記錄）

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

## budget（預算設定）

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

## recurring（定期收支）

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

## debts（欠款追蹤）

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

## wallets（資金錢包）

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

## invites（邀請碼）

`REGISTRATION_MODE=invite` 時註冊用的一次性邀請碼，由 `backend/manage_invites.py` 建立與管理。

```javascript
{
  _id: ObjectId,
  code_hash: String,    // 邀請碼的 SHA-256 雜湊；明文只在建立時顯示一次，不存資料庫
  note: String,         // 備註（最多 100 字元）
  created_at: DateTime,
  expires_at: DateTime, // 到期時間
  used_at: DateTime,    // 使用時間；null 代表尚未使用（原子操作，一碼只能用一次）
  used_by: ObjectId,    // 使用這組邀請碼註冊的使用者
  revoked: Boolean      // 已撤銷
}
```
