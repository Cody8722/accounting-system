# API 端點速查

> 各端點的請求／回應範例見 [API.md](API.md)。

## 認證方式

登入後取得 JWT Token，後續請求帶入 Header：

```
Authorization: Bearer <token>
```

Token 有效期：**7 天**。過期後需重新登入。

## 認證端點

| 方法 | 路徑 | 說明 | 需 Token | 速率限制 |
|------|------|------|:--------:|---------|
| `GET` | `/api/auth/registration-config` | 取得註冊模式（open / invite / closed） | | 一般限制 |
| `POST` | `/api/auth/register` | 註冊新帳號（邀請制時需 `invite_code`） | | 每 IP 每小時 5 次 |
| `POST` | `/api/auth/login` | 登入，回傳 JWT token | | 每分鐘 10 次；連續失敗 5 次鎖 15 分鐘 |
| `POST` | `/api/auth/validate-password` | 檢查密碼是否符合強度規則 | | 每分鐘 60 次 |
| `GET` | `/api/auth/password-config` | 取得目前密碼規則設定 | | 每分鐘 60 次 |
| `GET` | `/api/auth/verify` | 驗證目前 token 是否有效 | ✅ | 一般限制 |
| `POST` | `/api/auth/logout` | 登出 | ✅ | 一般限制 |
| `GET` | `/api/user/profile` | 取得個人資料 | ✅ | 一般限制 |
| `PUT` | `/api/user/profile` | 更新個人資料 | ✅ | 一般限制 |
| `POST` | `/api/user/change-password` | 修改密碼（成功後舊 token 失效） | ✅ | 每小時 5 次 |
| `GET` | `/status` | 系統健康檢查，確認後端與資料庫狀態 | ✅ | 每分鐘 10 次 |

> 一般速率限制：每用戶每日 200 次、每小時 50 次（以 JWT user_id 識別；未認證請求以 IP 計算）

## 記帳記錄（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/records` | 查詢記錄，支援 `start_date`、`end_date`、`type`、`category` 參數，最多回傳 500 筆 |
| `POST` | `/admin/api/accounting/records` | 新增記錄（可選 `wallet_id`/`location`/`client_id`；收入可選 `restricted_amount` 拆分受限資金；支出現金不足時回 409，需帶 `confirm_withdrawal:true` 確認自動提領） |
| `PUT` | `/admin/api/accounting/records/<id>` | 更新指定記錄（只能修改自己的） |
| `DELETE` | `/admin/api/accounting/records/<id>` | 刪除指定記錄（只能刪除自己的；連動刪除自動產生的提領轉帳與附加照片） |
| `POST` | `/admin/api/accounting/records/transfer` | 新增內部轉移（必要欄位 `wallet_id`/`from_location`/`to_location`/`amount`/`date`，同一帳戶內銀行↔現金搬移，不計入收支統計） |
| `POST` | `/admin/api/accounting/records/<id>/unlock` | 解鎖受限資金：整筆轉為一般收入 + 新增一筆對應支出，不支援部分解鎖 |
| `GET` | `/admin/api/accounting/data-version` | 輕量更新檢查：回傳目前使用者資料的版本簽章，供前端判斷是否需要重新抓取 |

## 統計資料（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/stats` | 當月收入 / 支出 / 結餘 / 分類統計 |
| `GET` | `/admin/api/accounting/comparison` | 環比分析，支援 `period=week/month/quarter/year` |
| `GET` | `/admin/api/accounting/trends` | 月度收支趨勢，支援 `months`（預設 6，最大 24） |
| `GET` | `/admin/api/stats/overview` | 整合財務概覽：現金餘額 + 欠款應收應付合併計算淨資產 |

## 預算管理（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/accounting/budget` | 查詢當月預算設定 |
| `POST` | `/admin/api/accounting/budget` | 儲存預算設定 |

## 定期收支（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/admin/api/recurring` | 查詢所有定期收支項目 |
| `POST` | `/admin/api/recurring` | 新增定期收支項目 |
| `PUT` | `/admin/api/recurring/<id>` | 更新指定項目 |
| `DELETE` | `/admin/api/recurring/<id>` | 刪除指定項目 |
| `POST` | `/admin/api/recurring/<id>/apply` | 套用為一筆實際記帳記錄 |

## 欠款追蹤（需 Token）

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

## 資金錢包（需 Token）

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

## 記帳照片（需 Token）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/admin/api/accounting/records/<id>/photos` | 上傳照片（multipart，欄位名 `photos`，可多檔；單筆記錄最多 20 張，單檔上限 10MB，僅 jpeg/png/webp） |
| `DELETE` | `/admin/api/accounting/records/<id>/photos/<photo_id>` | 刪除單張照片 |
| `GET` | `/admin/api/accounting/records/<id>/photos/<photo_id>` | 取得照片本體 |
| `GET` | `/admin/api/accounting/photos` | 跨記錄的照片瀏覽清單（分頁，新到舊） |

匯出/匯入（需 Token）：`GET /admin/api/accounting/export`（支援 `format=csv/xlsx/json`）、`POST /admin/api/accounting/import`（JSON 備份還原）。
