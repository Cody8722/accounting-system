# 前端更新檢查清單

## ⚠️ 每次更新前端時必須執行

### 1. 更新 Service Worker 版本號

📁 **檔案位置**：`frontend/service-worker.js` (第 4 行)

```javascript
const CACHE_NAME = 'accounting-system-v8';  // ← 記得更新這裡！
```

**操作步驟**：
1. 打開 `service-worker.js`
2. 找到 `CACHE_NAME` 常數
3. 將版本號 `v8` 改為 `v9`（遞增）
4. 保存檔案

**為什麼重要**？
- 修改版本號會觸發 Service Worker 更新
- 用戶才能獲得最新的 PWA 功能
- 舊的快取會被清除，避免用戶看到舊版本

---

### 2. 測試更新機制

**本地測試**：
```bash
# 啟動本地伺服器
cd frontend
python -m http.server 8080
```

**驗證步驟**：
1. 訪問 http://localhost:8080
2. 打開 Chrome DevTools → Console
3. 看到 "🔍 檢查是否有新版本..." 表示正常
4. 修改任何前端檔案並刷新
5. 應該會看到更新橫幅出現

---

### 3. 部署到 Zeabur

**自動更新時機**：
- ✅ 用戶每次開啟 PWA 時立即檢查
- ✅ 每 30 分鐘自動檢查一次
- ✅ 發現新版本時顯示更新橫幅

**部署後驗證**：
1. 訪問生產環境 URL
2. 打開 DevTools → Application → Service Workers
3. 確認新版本已註冊
4. 手動點擊 "Update" 按鈕測試

---

## 📋 版本記錄

追蹤每次更新的版本號：

| 版本 | 日期 | 更新內容 |
|------|------|----------|
| v8 | 2026-02-16 | 改進自動更新機制，添加更新橫幅 |
| v7 | 2026-02-14 | 添加離線功能支援 |

**下次更新請使用**: `v9`

---

## 🚨 常見錯誤

### 錯誤 1：忘記更新版本號
**症狀**：用戶看不到更新，仍顯示舊版本
**解決**：更新 `CACHE_NAME` 並重新部署

### 錯誤 2：版本號格式錯誤
**錯誤範例**：`accounting-system-8` （缺少 v）
**正確格式**：`accounting-system-v8`

### 錯誤 3：快取未清除
**症狀**：本地測試看到舊版本
**解決**：
1. DevTools → Application → Storage
2. 點擊 "Clear site data"
3. 重新整理頁面

---

## 📚 參考資料

- [Service Worker 更新機制](https://developer.chrome.com/docs/workbox/service-worker-lifecycle/)
- [PWA 最佳實踐](https://web.dev/pwa-checklist/)
