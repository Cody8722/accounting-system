# PWA 部署與使用指南

## 什麼是 PWA？

PWA（Progressive Web App）是可以「安裝」到手機主畫面的網頁應用，使用起來就像原生 App。

本記帳系統的 PWA 版本具備：
- 可安裝到手機 / 桌面主畫面
- 全螢幕體驗（無瀏覽器 UI）
- **離線查看**：無網路時可查看已快取的記錄
- **離線新增**：沒有網路時新增的記錄會暫存到本地
- **自動同步**：網路恢復後自動同步記錄到伺服器
- **自動更新**：部署新版本後用戶自動更新

---

## 部署步驟

### 步驟 1：生成 App 圖示

1. 用瀏覽器開啟 `icon-generator.html`
2. 下載 `icon-192.png` 與 `icon-512.png`
3. 將兩個檔案放到 `frontend/` 資料夾

也可以使用自行設計的圖示（PNG 格式，尺寸分別為 192×192 與 512×512）。

### 步驟 2：更新 Service Worker 版本號

**每次更新前端時都必須更新版本號**，否則用戶不會收到更新。

編輯 `frontend/service-worker.js` 第 14 行：

```js
const CACHE_NAME = 'accounting-system-vX.Y.Z';
```

使用語義化版本控制：
- Bug 修復：`v1.3.5` → `v1.3.6`（PATCH +1）
- 新功能：`v1.3.6` → `v1.4.0`（MINOR +1）
- 重大更新：`v1.4.0` → `v2.0.0`（MAJOR +1）

目前版本：`v1.3.6`

### 步驟 3：部署到 Zeabur

```bash
git add .
git commit -m "Update: ..."
git push
```

Zeabur 會自動部署靜態網站。

---

## 安裝到手機

### iOS（Safari）

1. 用 Safari 開啟網站
2. 點擊底部「分享」按鈕（方框加向上箭頭）
3. 滑動找到「加入主畫面」
4. 點擊「新增」

### Android（Chrome）

1. 用 Chrome 開啟網站
2. 瀏覽器會自動提示「安裝應用程式」
3. 點擊「安裝」或「加入主畫面」

若未自動提示：點擊右上角選單（三個點）→「安裝應用程式」

### 桌面（Chrome / Edge）

1. 開啟網站後，網址列右側會出現「安裝」圖示
2. 點擊並確認安裝

---

## 離線功能說明

### 離線查看記錄

1. 有網路時正常瀏覽，記錄自動快取
2. 離線時仍可查看已快取的記錄

### 離線新增記錄

1. 離線時新增記錄，會顯示「記錄已儲存，將在連線後同步」
2. 記錄暫存在手機本地（IndexedDB）
3. 網路恢復後自動同步到伺服器

### 同步狀態通知

- 網路斷線：右上角顯示橘色通知「離線模式：記錄將在連線後同步」
- 網路恢復：右上角顯示綠色通知「已連線，正在同步記錄...」
- 同步完成：顯示「離線記錄已同步」

---

## 技術細節

### 快取策略

| 資源類型 | 策略 | 說明 |
|---------|------|------|
| 靜態資源（HTML、圖示、manifest） | Cache First | 優先使用快取，變更後需更新版本號 |
| API 查詢（GET /admin/api/） | Network First | 永遠優先從伺服器取得最新資料，失敗才用快取 |
| 認證端點（/status、/api/auth/） | 永不快取 | 每次都直接向伺服器驗證 |
| 寫入請求（POST/PUT/DELETE） | 離線暫存 | 離線時存入 IndexedDB，連線後同步 |

### 離線佇列

使用 **IndexedDB**（`AccountingOfflineDB`）暫存離線期間的新增/修改/刪除操作，網路恢復後由 Service Worker 依序同步。

### iOS PWA 特殊處理

iOS Standalone 模式有一些特殊行為，系統已針對以下情況做處理：

- **BFCache 恢復**：iOS 從背景喚醒時，`DOMContentLoaded` 不會重新觸發。系統監聽 `pageshow` 事件，在 `event.persisted === true` 時主動刷新當前頁面資料。
- **App 重新可見**：監聽 `visibilitychange` 事件，App 從背景回到前景且超過 60 秒未操作時，自動刷新資料。

---

## 驗證 PWA 功能

### 檢查 Service Worker 狀態

1. 開啟 Chrome DevTools（F12）
2. 切換到「Application」分頁
3. 左側選單找到「Service Workers」
4. 確認 `service-worker.js` 狀態為「activated and is running」

### 檢查快取

1. Application 分頁 → 左側「Cache Storage」
2. 應看到 `accounting-system-v1.3.6` 快取（版本號對應當前部署版本）

### 檢查離線佇列

1. Application 分頁 → 左側「IndexedDB」
2. 找到「AccountingOfflineDB」→「offline-queue」
3. 離線新增的記錄同步後，此處應為空

### 測試離線功能

1. 登入並瀏覽一些記錄（使其被快取）
2. DevTools → Network 分頁 → 勾選「Offline」
3. 重新整理頁面，應仍可正常顯示已快取記錄
4. 嘗試新增記錄，應顯示「將在連線後同步」
5. 取消「Offline」勾選
6. 應看到同步通知，記錄已上傳到伺服器

---

## 常見問題

**Q：為什麼沒有出現「安裝」提示？**

確認：
- 使用 HTTPS（Zeabur 自動提供）
- 有有效的 `manifest.json`
- Service Worker 正常運作
- 有 192×192 和 512×512 圖示

**Q：離線記錄沒有自動同步？**

1. 確認網路已恢復
2. 開啟瀏覽器 Console 查看是否有錯誤訊息
3. 檢查 IndexedDB 的 `offline-queue` 是否還有記錄
4. 手動重新整理頁面以觸發同步

**Q：更新了前端但手機還是看到舊版本？**

確認 `service-worker.js` 的版本號已更新。版本號不變時，Service Worker 不會觸發更新，用戶看不到新版本。

**Q：如何卸載 PWA？**

- **iOS**：長按圖示 → 刪除 App
- **Android**：長按圖示 → 解除安裝
- **桌面**：App 視窗右上角選單 → 解除安裝

---

## 效能與限制

### 儲存空間

- Cache API（靜態資源快取）：依瀏覽器而定，通常至少 50MB
- IndexedDB（離線佇列）：依瀏覽器而定，通常至少 50MB
- 對記帳應用而言空間充裕

### 離線功能限制

- 無法查詢**未快取**的記錄（首次瀏覽需要網路）
- 離線時無法載入圖表（需要統計 API）
- 可查看已快取的記錄
- 可新增記錄（連線後同步）
- 可使用所有 UI 功能
