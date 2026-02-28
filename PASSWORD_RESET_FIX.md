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

### 1. 註冊 Resend 帳號

1. 前往 [Resend.com](https://resend.com/) 註冊帳號
2. 登入後,前往 [API Keys 頁面](https://resend.com/api-keys)
3. 點擊「Create API Key」建立新的 API Key
4. 複製 API Key (只會顯示一次,請妥善保存)

### 2. 驗證寄件者網域

**選項 A: 使用測試網域 (開發環境)**
- 使用 Resend 提供的測試郵箱: `onboarding@resend.dev`
- 測試郵件只會發送到你的 Resend 帳號郵箱

**選項 B: 使用自己的網域 (正式環境)**
1. 在 Resend 中新增網域
2. 按照指示設定 DNS 記錄 (SPF、DKIM、DMARC)
3. 等待驗證完成

### 3. 設定環境變數

在你的部署環境中設定以下環境變數:

```bash
# Resend API Key (必需)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

# 寄件者 Email (必需)
# 測試環境使用:
RESEND_FROM_EMAIL=onboarding@resend.dev
# 正式環境使用你驗證過的網域:
# RESEND_FROM_EMAIL=noreply@yourdomain.com
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
   - `RESEND_API_KEY`: 你的 API Key
   - `RESEND_FROM_EMAIL`: 你的寄件者 Email

#### 其他平台

- **Heroku**: `heroku config:set RESEND_API_KEY=xxx RESEND_FROM_EMAIL=xxx`
- **Docker**: 在 `docker-compose.yml` 中設定環境變數
- **Vercel/Netlify**: 在專案設定中新增環境變數

### 4. 重啟服務

設定環境變數後,記得重啟後端服務讓變更生效。

### 5. 測試

1. 前往前端頁面
2. 點擊「忘記密碼」
3. 輸入已註冊的 Email
4. 檢查是否收到密碼重設郵件

如果使用測試網域,郵件會發送到你的 Resend 帳號郵箱,而非輸入的 Email。

## 錯誤排查

### 問題: 顯示「郵件服務未配置或發送失敗」

**可能原因**:
1. `RESEND_API_KEY` 環境變數未設定或設定錯誤
2. `RESEND_FROM_EMAIL` 環境變數未設定
3. API Key 無效或已過期
4. 寄件者 Email 網域未驗證

**解決方法**:
1. 檢查環境變數是否正確設定
2. 檢查後端日誌查看詳細錯誤訊息:
   ```bash
   # 查看日誌
   tail -f backend/logs/*.log
   # 或使用 docker
   docker logs <container_name>
   ```
3. 確認 Resend API Key 有效
4. 確認寄件者 Email 網域已驗證(或使用 `onboarding@resend.dev` 測試)

### 問題: 沒有收到郵件

**可能原因**:
1. 郵件被歸類為垃圾郵件
2. 使用測試網域時,郵件發送到 Resend 帳號郵箱而非目標郵箱
3. 郵箱地址不存在或無效

**解決方法**:
1. 檢查垃圾郵件資料夾
2. 如果使用 `onboarding@resend.dev`,請檢查你的 Resend 帳號郵箱
3. 確認郵箱地址正確且可接收郵件

## 安全說明

修復後的代碼仍然保持以下安全特性:

1. **防止用戶枚舉**: 無論 Email 是否存在,都返回相同的成功訊息(當郵件服務正常時)
2. **速率限制**: 每小時最多 5 次忘記密碼請求(透過 `@limiter.limit("5 per hour")`)
3. **Token 過期**: 重設連結在 1 小時後自動失效
4. **密碼強度驗證**: 重設密碼時仍需通過所有密碼強度檢查

## 測試檢查清單

- [ ] 後端環境變數已設定 (RESEND_API_KEY, RESEND_FROM_EMAIL)
- [ ] 後端服務已重啟
- [ ] 測試用戶已註冊
- [ ] 點擊「忘記密碼」功能
- [ ] 輸入已註冊的 Email
- [ ] 檢查是否收到郵件(或檢查 Resend 儀表板)
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
