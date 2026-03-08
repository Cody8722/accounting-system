# 密碼重置功能修復說明

## 問題描述

之前的密碼重置功能存在以下問題:

1. **後端問題**: 當郵件服務未配置或發送失敗時,後端沒有檢查 `send_reset_email()` 的返回值,仍然回傳成功訊息給前端
2. **前端問題**: 前端沒有檢查 HTTP 回應狀態碼,即使後端返回錯誤,也會顯示成功訊息
3. **結果**: 用戶點擊「忘記密碼」後會看到「重設連結已寄出」的訊息,但實際上並沒有收到郵件

## 修復內容

### 後端修改 (backend/main.py)

```python
# 修改前 (line 1450-1451):
send_reset_email(email, reset_url)
logger.info(f"密碼重設信已寄送: {email}")

# 修改後 (line 1450-1457):
# 檢查郵件是否成功發送
email_sent = send_reset_email(email, reset_url)
if not email_sent:
    logger.error(f"密碼重設信寄送失敗: {email}，請檢查 RESEND_API_KEY 是否已設定")
    return jsonify({"error": "郵件服務未配置或發送失敗，請聯繫系統管理員"}), 500

logger.info(f"密碼重設信已寄送: {email}")
```

**改進**:
- 檢查 `send_reset_email()` 的返回值
- 如果發送失敗,返回 500 錯誤和明確的錯誤訊息
- 記錄詳細的錯誤日誌

### 前端修改 (frontend/js-refactored/auth.js)

```javascript
// 修改前:
const data = await resp.json();
if (successEl) {
    successEl.textContent = data.message || '重設連結已寄出';
    successEl.classList.remove('hidden');
}

// 修改後:
const data = await resp.json();
if (resp.ok) {
    if (successEl) {
        successEl.textContent = data.message || '重設連結已寄出';
        successEl.classList.remove('hidden');
    }
} else {
    if (errEl) {
        errEl.textContent = data.error || '發送失敗，請稍後再試';
        errEl.classList.remove('hidden');
    }
}
```

**改進**:
- 檢查 HTTP 回應狀態碼 (`resp.ok`)
- 正確處理錯誤回應,顯示錯誤訊息而非成功訊息

## 如何啟用密碼重置功能

密碼重置功能需要配置郵件服務才能正常工作。請按照以下步驟配置:

### 1. 準備 Gmail 帳號

**選項 A: 使用現有 Gmail 帳號**
- 可以使用您的個人 Gmail 帳號
- 建議使用專門的郵件發送帳號

**選項 B: 註冊新的 Gmail 帳號**
1. 前往 [Gmail](https://mail.google.com/) 註冊新帳號
2. 選擇一個專門用於系統發送郵件的名稱（例如: noreply.accounting@gmail.com）

### 2. 啟用兩步驟驗證並生成應用程式密碼

**步驟 1: 啟用兩步驟驗證**
1. 前往 [Google 帳戶安全性設定](https://myaccount.google.com/security)
2. 在「登入 Google」區塊中,點擊「兩步驟驗證」
3. 按照指示完成兩步驟驗證設定

**步驟 2: 生成應用程式密碼**
1. 前往 [應用程式密碼頁面](https://myaccount.google.com/apppasswords)
2. 選擇「郵件」作為應用程式
3. 選擇「其他（自訂名稱）」作為裝置,輸入「記帳系統」
4. 點擊「產生」
5. 複製生成的 16 位密碼（不含空格）,例如: `abcd efgh ijkl mnop`
6. 記下這個密碼,之後無法再次查看

### 3. 設定環境變數

在你的部署環境中設定以下環境變數:

```bash
# Gmail SMTP 設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Gmail 帳號和應用程式密碼 (必需)
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=abcdefghijklmnop        # 16位應用程式密碼（不含空格）

# 寄件者 Email (選填，預設使用 SMTP_USERNAME)
SMTP_FROM_EMAIL=your-email@gmail.com
```

#### 本地開發環境

複製 `backend/.env.example` 為 `backend/.env`:

```bash
cd backend
cp .env.example .env
```

然後編輯 `.env` 檔案,填入你的 API Key 和寄件者 Email。

#### Zeabur 部署

1. 前往 Zeabur 專案設定
2. 選擇你的後端服務
3. 進入「Environment Variables」設定
4. 新增以下環境變數:
   - `SMTP_HOST`: smtp.gmail.com
   - `SMTP_PORT`: 587
   - `SMTP_USERNAME`: 你的 Gmail 帳號
   - `SMTP_PASSWORD`: 你的應用程式密碼
   - `SMTP_FROM_EMAIL`: 寄件者 Email（選填）

#### 其他平台

- **Heroku**: `heroku config:set SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USERNAME=xxx SMTP_PASSWORD=xxx`
- **Docker**: 在 `docker-compose.yml` 中設定環境變數
- **Vercel/Netlify**: 在專案設定中新增環境變數

### 4. 重啟服務

設定環境變數後,記得重啟後端服務讓變更生效。

### 5. 測試

1. 前往前端頁面
2. 點擊「忘記密碼」
3. 輸入已註冊的 Email
4. 檢查是否收到密碼重設郵件
5. 如果沒有收到,請檢查垃圾郵件資料夾

## 錯誤排查

### 問題: 顯示「郵件服務未配置或發送失敗」

**可能原因**:
1. `SMTP_USERNAME` 或 `SMTP_PASSWORD` 環境變數未設定
2. Gmail 應用程式密碼錯誤或包含空格
3. Gmail 帳號未啟用兩步驟驗證
4. SMTP 連線被防火牆封鎖
5. Gmail 帳號安全性設定阻擋登入

**解決方法**:
1. 檢查環境變數是否正確設定
2. 確認應用程式密碼正確（16位,不含空格）
3. 確認已啟用兩步驟驗證: https://myaccount.google.com/security
4. 檢查後端日誌查看詳細錯誤訊息:
   ```bash
   # 查看日誌
   tail -f backend/logs/*.log
   # 或使用 docker
   docker logs <container_name>
   ```
5. 確認伺服器可以連線到 smtp.gmail.com:587
6. 如果出現「登入失敗」錯誤,請重新生成應用程式密碼

### 問題: 沒有收到郵件

**可能原因**:
1. 郵件被歸類為垃圾郵件
2. Gmail 每日發送限制（免費帳號每日限制 500 封）
3. 郵箱地址不存在或無效
4. Gmail 帳號被暫時停用

**解決方法**:
1. 檢查垃圾郵件資料夾
2. 檢查 Gmail 發送配額: https://support.google.com/mail/answer/22839
3. 確認郵箱地址正確且可接收郵件
4. 登入 Gmail 檢查是否有安全性警告

## 安全說明

修復後的代碼仍然保持以下安全特性:

1. **防止用戶枚舉**: 無論 Email 是否存在,都返回相同的成功訊息(當郵件服務正常時)
2. **速率限制**: 每小時最多 5 次忘記密碼請求(透過 `@limiter.limit("5 per hour")`)
3. **Token 過期**: 重設連結在 1 小時後自動失效
4. **密碼強度驗證**: 重設密碼時仍需通過所有密碼強度檢查

## 測試檢查清單

- [ ] Gmail 帳號已啟用兩步驟驗證
- [ ] Gmail 應用程式密碼已生成
- [ ] 後端環境變數已設定 (SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD)
- [ ] 後端服務已重啟
- [ ] 測試用戶已註冊
- [ ] 點擊「忘記密碼」功能
- [ ] 輸入已註冊的 Email
- [ ] 檢查是否收到郵件（包含垃圾郵件資料夾）
- [ ] 點擊郵件中的重設連結
- [ ] 成功設定新密碼
- [ ] 使用新密碼登入成功
- [ ] 測試郵件服務未配置時的錯誤訊息

## 相關檔案

- `backend/main.py`: 後端 API 實作 (line 1364-1508)
- `frontend/js-refactored/auth.js`: 前端認證模組 (line 147-209)
- `backend/.env.example`: 環境變數範例
- `backend/PASSWORD_POLICY.md`: 密碼政策說明

---

修復日期: 2026-02-28
修復者: Claude Code
