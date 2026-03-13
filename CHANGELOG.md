# Changelog

本專案遵循[語義化版本](https://semver.org/lang/zh-TW/)規範。

## [Unreleased]

---

## [1.6.1] - 2026-03-13

### Security
- 修復 3 處 XSS 漏洞：`showToast`、`showConfirm` 的 message 參數及 `budget.js` 分類名稱，改用 `escapeHtml()` 跳脫後再插入 innerHTML

### Changed
- 重構 `backend/main.py`：提取 `_validate_recurring_data()` 函數，消除 `create_recurring` 與 `update_recurring` 的重複驗證邏輯（~47 行）

### Added
- 新增測試（`test_api.py`）：登出端點、過期/竄改 token 拒絕、跨用戶操作授權（定期收支 delete/update/apply）、預算邊界條件（負數、非法分類、非數字）

---

## [1.6.0] - 2026-03-13

### Added
- 定期收支功能（後端 + 前端完整實作）
  - 後端 CRUD API：`GET/POST /admin/api/recurring`、`PUT/DELETE /admin/api/recurring/<id>`
  - 一鍵套用 API：`POST /admin/api/recurring/<id>/apply`（套用為實際記帳記錄）
  - 前端 `js-refactored/recurring.js` 模組
- 環比分析 API：`GET /admin/api/accounting/comparison`（本期 vs 上期，支援 month/quarter/year）
- 主題切換功能：深色 / 白天 / 跟隨系統（`js-refactored/theme.js`）

### Changed
- `index-refactored.html` 正式合併為 `index.html`，舊版移除，完成模組化重構
- 預算管理整合至定期收支頁面，界面更為集中
- 後端測試覆蓋率提升至 75%+（新增環比、定期收支驗證、整合鏈測試）

### Fixed
- E2E 測試修復：
  - `registerUser` 等待登入 modal 顯示，而非不可見的錯誤元素
  - 未登入保護頁跳轉：改用 `localStorage` 清除 + 完整頁面重載（解決 hash navigation 不觸發 `verifyToken` 問題）
  - 預算測試：導航至正確頁面（add 而非 settings）
  - 密碼變更：`settings.js` 改用正確端點 `POST /api/user/change-password`
- `Content-Disposition` RFC 5987 URL 編碼測試（加 `unquote` 解碼後再 assert）
- black 格式問題（`Strict-Transport-Security` 賦值、f-string 拆行、inline JSON dict 展開）

---

## [1.5.1] - 2026-03-08

### Added
- 前端模組化重構（`frontend/js-refactored/`）：13 個 ES6 模組，含 EventBus 事件總線
- PWA 網路狀態監聽：online/offline 事件、浮動通知、MessageChannel 離線同步
- PWA EventBus 整合：NETWORK_ONLINE / NETWORK_OFFLINE / NETWORK_SYNC_COMPLETE / NETWORK_SYNC_FAILED 事件
- 忘記密碼 / 重設密碼 API（後端 + 前端）
- CSV 匯出後端 API（`/admin/api/accounting/export`）
- 月度趨勢 API（`/admin/api/accounting/trends`）
- 篩選分類 UI 模組（`categories.js`）
- 模糊測試（`tests/test_fuzzing.py`）
- 輸入驗證邊界測試（`tests/test_validation_errors.py`）

### Changed
- EventBus debug 模式改為環境感知（僅 localhost/127.0.0.1 啟用）
- CI 測試覆蓋率門檻：main.py ≥ 75%、auth.py ≥ 80%
- 刪除冗餘文件：TEST_REPORT.md、PASSWORD_RESET_FIX.md、TEST_STRATEGY.md、重複 E2E 文件

### Fixed
- syncOfflineQueue 錯誤使用 RECORDS_LOADED 事件，改為直接呼叫 `window.loadAccountingRecords()`
- Black 格式化問題（test_validation_errors.py）

---

## [1.3.6] - 2026-03-08

### Added
- 安全加固：密碼雜湊驗證、Token 刷新機制
- 詳細文件：PASSWORD_POLICY.md、E2E_TESTING_GUIDE.md、TESTING_BEST_PRACTICES.md

### Fixed
- 多項前端 Bug 修復與 RWD 排版問題

---

## [1.0.0] - 2026-02-16

### Added
- 採用語義化版本控制（Semantic Versioning）
- 改進 Service Worker 自動更新機制（CACHE_NAME 版本號觸發）
- PWA 安裝提示（Android `beforeinstallprompt` + iOS 手動指引）

---

## [0.10.0] - 2024-02-24

### Added
- 🎯 **預算警告提醒功能**
  - 紅/黃/綠三級警告系統（超過 100%/80%/正常）
  - 顯示預算使用百分比、已用金額、剩餘額度
  - 整合至分析頁面統計區塊
- 📊 **資料匯出功能**
  - 後端 API 端點 `/admin/api/accounting/export`
  - 支援 CSV 格式匯出
  - 支援日期範圍和記錄類型篩選
  - UTF-8 BOM 支援 Excel 正確顯示中文
  - 自動生成檔名包含日期範圍
- 📈 **月度趨勢圖表**
  - 後端 API 端點 `/admin/api/accounting/trends`
  - 顯示最近 6 個月收入/支出折線圖
  - 使用 Chart.js 雙線圖呈現
  - 支援自訂月份數量（最多 24 個月）
- 📱 **iOS 雙擊放大修復**
  - viewport meta 標籤防縮放設定
  - CSS touch-action 多層防護
  - 自定義鍵盤區域優化
  - 移除 iOS 點擊高亮效果

### Changed
- 用詞規範化：將所有「姓名」改為「使用者名稱」

### Fixed
- 修正支出分類頁面同時顯示圓餅圖和「暫無支出數據」的 bug
- 修正修改密碼 API 欄位名稱不一致（current_password → old_password）

---

## [0.9.0] - 2024-02-23

### Added
- ✨ **密碼強度即時驗證**
  - 修改密碼區塊新增 13 項即時檢查
  - 密碼進度條與強度評級（弱/中/強/極強）
  - 與註冊頁面一致的使用者體驗
- 🎨 **深色模式完整支援**
  - 修改姓名和修改密碼區塊深色模式
  - 統一所有 modal 和 dialog 配色方案
  - 移除硬編碼的 text-black 類別
  - 動態偵測深淺色模式 (prefers-color-scheme)
- 📦 **個人資料編輯功能**
  - 修改使用者名稱
  - 修改密碼（含舊密碼驗證）
  - 整合至設定頁面

### Fixed
- 修正 Android 安裝提示位置和樣式
  - 從底部提示改為置中 modal
  - 深色模式文字可見性問題
- 修正忘記密碼與重設密碼 modal 未置中
- 將 `manage_password_rules.py` 加入 Docker 生產映像檔

---

## [0.8.0] - 2024-02-20

### Added
- 🔐 **忘記密碼功能**
  - Email 重設密碼流程
  - 重設連結有效期限 1 小時
  - 安全的 token 驗證機制
- 📱 **Android PWA 安裝提示**
  - 自動偵測 Android 瀏覽器
  - 引導使用者安裝 PWA
- 📊 **支出分類圓餅圖**
  - 視覺化分類支出比例
  - 使用 Chart.js 繪製

### Changed
- 公開 `/status` 端點（無需認證）
- 優化測試覆蓋率至 81%+

### Fixed
- 修正 manifest.json icon 格式錯誤
- 修正 Black 格式檢查的長行問題

---

## [0.7.0] - 2024-02-18

### Added
- 🔒 **密碼政策強化**
  - 13 項密碼強度檢查（長度、複雜度、模式、熵值）
  - 即時密碼強度驗證 API
  - 禁止常見密碼、鍵盤模式、個人資訊
  - 支援數學模式檢測（費氏、平方數）
  - 中文拼音模式檢測
- 📱 **iOS Safari 優化**
  - 修正視窗高度問題（使用 100dvh）
  - 修正底部導航被遮蓋
  - 修正 iOS 返回時頁面空白（BFCache）
- 📄 **文件完善**
  - API 文件（docs/API.md）
  - 密碼政策文件（PASSWORD_POLICY.md）
  - 部署指南（DEPLOYMENT.md）

### Changed
- 測試覆蓋率從 65% 提升至 81%
- 強化密碼驗證錯誤訊息

### Fixed
- 修正離線記錄同步問題
- 修正深色模式按鈕文字顏色

---

## [0.6.0] - 2024-02-15

### Added
- 💰 **預算管理功能**
  - 每月各分類預算設定
  - 預算追蹤與統計
- 📱 **PWA 離線支援**
  - Service Worker 快取策略
  - 離線記帳功能
  - 自動同步機制
- 🎨 **完整深色模式**
  - 自動偵測系統深淺色模式
  - 動態切換主題
  - 所有元件支援深色模式

### Changed
- 優化記帳記錄 UI
- 改善手機版觸控體驗

---

## [0.5.0] - 2024-02-10

### Added
- 📊 **統計分析功能**
  - 本月收入/支出/結餘
  - 分類統計
  - 支出分類圓餅圖
- 🔐 **JWT 認證機制**
  - 安全的 token 認證
  - 用戶數據隔離
  - 登入狀態持久化

### Changed
- 優化資料庫查詢效能
- 改善錯誤處理機制

---

## [0.4.0] - 2024-02-05

### Added
- 📝 **記帳記錄 CRUD 功能**
  - 新增記帳記錄
  - 查詢記帳記錄（支援篩選）
  - 修改記帳記錄
  - 刪除記帳記錄
- 🏷️ **支出類型分類**
  - 固定支出
  - 變動支出
  - 一次性支出

---

## [0.3.0] - 2024-02-01

### Added
- 👤 **用戶註冊與登入**
  - Email 註冊
  - 密碼加密（bcrypt）
  - 基本表單驗證
- 🎨 **基本 UI 介面**
  - 登入/註冊頁面
  - 記帳頁面
  - 記錄查詢頁面
  - 分析頁面

---

## [0.2.0] - 2024-01-25

### Added
- 🗄️ **MongoDB 資料庫整合**
  - 用戶集合
  - 記帳記錄集合
  - 預算集合
- 🔧 **環境變數配置**
  - .env 檔案支援
  - 敏感資訊保護

---

## [0.1.0] - 2024-01-20

### Added
- 🚀 **專案初始化**
  - Flask 後端框架
  - 基本專案結構
  - Docker 部署設定
  - GitHub Actions CI/CD

---

## 版本命名規範

- **Major (x.0.0)**: 重大架構變更或破壞性更新
- **Minor (0.x.0)**: 新功能增加
- **Patch (0.0.x)**: Bug 修復和小改進

## 標籤說明

- 🚀 **Added**: 新功能
- ✨ **Changed**: 功能變更或改進
- 🐛 **Fixed**: Bug 修復
- 🗑️ **Deprecated**: 即將移除的功能
- ❌ **Removed**: 已移除的功能
- 🔒 **Security**: 安全性修復
