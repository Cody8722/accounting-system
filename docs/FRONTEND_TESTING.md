# 前端測試實施指南

**專案:** 個人記帳系統前端測試
**目標:** 說明前端測試現況（單元測試 + E2E）與如何新增測試
**版本:** 2.0
**日期:** 2026-08-22

---

## 📑 目錄

1. [測試策略總覽](#測試策略總覽)
2. [目錄結構](#目錄結構)
3. [單元測試：Node 內建 `node --test`](#單元測試node-內建-node---test)
4. [撰寫原則：只測已抽出的純函式](#撰寫原則只測已抽出的純函式)
5. [如何新增一個單元測試](#如何新增一個單元測試)
6. [現有單元測試涵蓋範圍](#現有單元測試涵蓋範圍)
7. [尚未涵蓋的模組](#尚未涵蓋的模組)
8. [E2E 測試（摘要）](#e2e-測試摘要)
9. [執行測試 / push 前檢查](#執行測試--push-前檢查)

---

## 測試策略總覽

前端（`frontend/v2/`）是**純 ES Modules，沒有 bundler、沒有 build step**：`frontend/v2/index.html` 只用一個
`<script type="module" src="./js/main.js">` 載入，其餘全靠瀏覽器原生 `import`。這個限制直接決定了測試框架的選擇：

- **單元測試**：使用 **Node.js 內建的 `node --test`**（`node:test` + `node:assert/strict`），不是 Jest、也不是 Vitest。
  不需要安裝任何測試套件、不需要 babel 轉譯、不需要 module alias 設定——`frontend/v2/js/*.js` 本來就是標準 ESM，Node 可以直接 `import`。
- **E2E 測試**：Playwright，模擬真實瀏覽器操作。細節見獨立文件
  [`docs/E2E_TESTING_GUIDE.md`](E2E_TESTING_GUIDE.md)，本文件只做摘要（見下方「E2E 測試（摘要）」）。

> 舊版前端（`frontend/js-refactored/`）與當時規劃的 Vitest/Jest 方案已經不存在。若你在其他地方（舊 commit、舊筆記）看到
> `js-refactored`、`vitest.config.js`、`moduleNameMapper` 等字眼，那是歷史文件，現況以本文件與 `CLAUDE.md` 的「測試架構」段落為準。

### 為什麼不用 Vitest 或 Jest

| 考量 | node:test（現況） | Vitest / Jest |
|------|-------------------|----------------|
| 額外依賴 | 無（Node 內建） | 需要安裝 test runner + 相關套件 |
| ESM 支援 | 原生，與 `frontend/v2/js/` 的寫法完全一致 | Vitest 原生；Jest 需要 babel 轉譯設定 |
| 建構工具 | 不需要 | Vitest 依賴 Vite；Jest 常需 babel-jest |
| 目前測試型態 | 純函式輸入輸出斷言，用不到 jsdom/DOM 模擬 | 若要測 DOM/元件才需要 jsdom + Testing Library |

目前 4 支測試檔都只測「已抽出的純函式」（見下一節），不涉及 DOM 或網路請求，`node --test` 已經完全夠用。若未來需要測試會操作
DOM 或發 HTTP 請求的邏輯，屆時再評估是否要引入 jsdom 之類的套件（引入前依專案規則需先告知並取得確認）。

---

## 目錄結構

```
frontend/
├── v2/
│   ├── index.html                # 唯一入口，<script type="module" src="./js/main.js">
│   └── js/                       # 全部是標準 ES Modules，無 bundler
│       ├── config.js             # 後端 URL 偵測（resolveBackendUrl）、storagePrefix、分類資料
│       ├── utils.js              # escapeHtml、fmtMoney、todayStr、monthStr、debounce、showToast...
│       ├── api.js                # 統一 Fetch 封裝、Token 管理、401 處理
│       ├── store.js              # 極簡共用狀態 + 事件匯流排
│       ├── jwt.js                # 純函式：解 JWT exp、離線信任判斷
│       ├── invoice.js            # 電子發票 QR Code 解析（parseInvoiceQR）
│       ├── sync.js               # 離線佇列同步結果分類（classifySyncOutcome）
│       ├── main.js / router.js / auth.js / theme.js
│       ├── add.js / ledger.js / stats.js / budget.js / charts.js
│       ├── dashboard.js / pin.js（僅桌面）
│       ├── wallet.js / photos.js / settings.js / offline.js / lock.js / version.js
│       └── ...
│
└── tests/
    ├── package.json               # test / test:unit / test:headed / test:ui / test:debug / test:report / test:codegen
    ├── playwright.config.js       # E2E 設定
    │
    ├── unit/                      # 單元測試（node --test，本文件重點）
    │   ├── config.test.js         # resolveBackendUrl、storagePrefix
    │   ├── invoice.test.js        # parseInvoiceQR
    │   ├── jwt.test.js            # jwtExp、tokenLocallyValid
    │   └── sync.test.js           # classifySyncOutcome
    │
    └── e2e/v2/                    # E2E 測試（Playwright，詳見 E2E_TESTING_GUIDE.md）
        ├── auth.spec.js
        ├── core.spec.js
        ├── dataVersion.spec.js
        └── offline.spec.js
```

---

## 單元測試：Node 內建 `node --test`

不需要安裝依賴——`node:test` 與 `node:assert/strict` 是 Node.js 標準函式庫的一部分（Node 18+ 穩定支援）。

**`frontend/tests/package.json`（現況節錄）：**

```json
{
  "scripts": {
    "test": "playwright test",
    "test:unit": "node --test unit/*.test.js",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui",
    "test:debug": "playwright test --debug",
    "test:report": "playwright show-report",
    "test:codegen": "playwright codegen http://localhost:8080"
  }
}
```

執行方式（兩種等價寫法）：

```bash
# 方式一：在 frontend/tests/ 目錄下用 npm script
npm run test:unit --prefix frontend/tests

# 方式二：直接呼叫 node，指定測試檔案 glob（CLAUDE.md「常用指令」採用此寫法）
node --test frontend/tests/unit/*.test.js
```

`node --test` 會自動尋找符合命名規則的檔案（`*.test.js`）、平行執行每個檔案內的 `test()` 區塊，並在結尾印出通過/失敗統計，
不需要額外的 config 檔案（沒有 `vitest.config.js` 或 `jest.config.js` 這回事）。

---

## 撰寫原則：只測已抽出的純函式

現有 4 支單元測試有一個共同特徵：**只測從模組中抽出、不依賴 DOM／網路／時間（或把時間當參數傳入）的純函式**。例如：

- `config.js` 的 `resolveBackendUrl(hostname, pathname)`、`storagePrefix(pathname)` — 輸入主機名/路徑字串，回傳字串，不碰
  `window.location`（呼叫端才負責從 `window.location` 取值再傳進來）。
- `jwt.js` 的 `jwtExp(token)`、`tokenLocallyValid(token, nowMs)` — `nowMs` 當參數傳入，測試才能用固定時間戳做出決定性斷言。
- `invoice.js` 的 `parseInvoiceQR(rawString)` — 純字串解析，不觸碰掃碼元件。
- `sync.js` 的 `classifySyncOutcome({ res, err })` — 純粹依 HTTP 狀態碼/錯誤旗標做分類決策，不實際發請求。

這個設計是刻意的：只要邏輯留在模組內以「接收輸入、回傳輸出」的函式存在，`node --test` 不需要 jsdom、不需要 mock
`fetch`／`localStorage`，測試又快又穩定。反過來說，`main.js`、`router.js`、`add.js` 這類大量操作 DOM、掛
`window.xxx`、直接讀 `window.location`／`localStorage` 的模組，目前**沒有**對應的單元測試——要幫它們補測試，第一步通常是先把
其中的判斷邏輯抽成純函式（參考 `jwt.js`／`sync.js` 的做法），而不是直接對整個模組做 DOM 模擬。

---

## 如何新增一個單元測試

以下步驟與範例直接對照現有 `frontend/tests/unit/jwt.test.js` 的實際寫法：

1. 若要測的邏輯還混在有副作用的程式碼裡，先在對應的 `frontend/v2/js/<module>.js` 中把它拆成 `export function`（輸入用參數傳入，
   不要直接讀 `window`/`document`/`Date.now()`）。
2. 在 `frontend/tests/unit/` 建立 `<module>.test.js`，用相對路徑 `../../v2/js/<module>.js` import 目標函式。
3. 用 `node:test` 的 `test()` 搭配 `node:assert/strict` 的 `assert.equal`／`assert.ok` 寫斷言。
4. 執行 `node --test frontend/tests/unit/*.test.js` 確認新測試被抓到且通過。

範例骨架（風格對照 `jwt.test.js`）：

```javascript
/**
 * <module>.test.js — <被測函式> 純函式單元測試（node:test）。
 * 守住「<這段邏輯保護的是什麼>」：改壞會導致 <後果>，CI 會擋下。
 * 執行：node --test frontend/tests/unit/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yourPureFunction } from '../../v2/js/<module>.js';

test('描述正常情況', () => {
  assert.equal(yourPureFunction('input'), 'expected-output');
});

test('描述邊界情況', () => {
  assert.equal(yourPureFunction(''), null);
  assert.equal(yourPureFunction(null), null);
});
```

實際檔案中常見的斷言用法（都來自現有測試，非杜撰）：

- `assert.equal(actual, expected)` — 最常用，值相等比較（`config.test.js`、`jwt.test.js`、`invoice.test.js`、`sync.test.js` 都用）。
- `assert.ok(value, message)` — 斷言真值，`invoice.test.js` 用來確認 `parseInvoiceQR` 有解析成功（`assert.ok(p, '應解析成功')`）。
- 需要固定時間的測試，把時間戳當參數傳入被測函式（`jwt.test.js` 的 `const NOW = 1_700_000_000_000` 寫法），不要在測試裡用真的
  `Date.now()`，否則測試結果不具決定性。
- 需要組出測試資料（例如一個合法的 JWT 字串）時，直接在測試檔內寫一個小型 helper 函式（`jwt.test.js` 的 `makeToken()`），不需要
  額外的 mock 函式庫。

---

## 現有單元測試涵蓋範圍

| 測試檔案 | 對應模組 | 涵蓋函式 | 守護的邏輯 |
|---------|---------|---------|-----------|
| `config.test.js` | `frontend/v2/js/config.js` | `resolveBackendUrl`、`storagePrefix` | 依 hostname/pathname 判斷本機、區網 IP、Tailscale 正式/測試環境、Zeabur 的後端 URL 與 localStorage key 前綴推導 |
| `jwt.test.js` | `frontend/v2/js/jwt.js` | `jwtExp`、`tokenLocallyValid` | 離線時信任本地 JWT 的過期判斷，避免把過期 token 當作有效登入狀態放行 |
| `invoice.test.js` | `frontend/v2/js/invoice.js` | `parseInvoiceQR` | 電子發票 QR Code 左側 77 碼格式解析，並確保右側加密內容/雜訊不會被誤判成合法發票 |
| `sync.test.js` | `frontend/v2/js/sync.js` | `classifySyncOutcome` | 離線佇列同步的逐筆失敗政策：2xx 成功、401 停止整批、4xx 標記需處理、5xx/網路錯誤重試 |

這四支測試都聚焦在「一旦壞掉會直接影響資料正確性或帳號安全」的邊界判斷邏輯，屬於高投資報酬率的純函式測試。

---

## 尚未涵蓋的模組

`frontend/v2/js/` 目前共有 24 個模組，只有上面 4 個模組的部分匯出函式有單元測試。其餘模組（`main.js`、`router.js`、`auth.js`、
`add.js`、`ledger.js`、`stats.js`、`budget.js`、`charts.js`、`dashboard.js`、`pin.js`、`wallet.js`、`photos.js`、`settings.js`、
`offline.js`、`lock.js`、`theme.js`、`store.js`、`api.js`、`version.js`）目前**沒有**專屬的單元測試——這是「純函式優先」策略下
的自然缺口，不代表已知的 bug，這些模組的行為目前主要靠 E2E 測試（見下一節）間接覆蓋。

`frontend/v2/js/utils.js` 是一個明顯可以擴充的候選：裡面同時混了純函式（`escapeHtml`、`fmtMoney`、`todayStr`、`monthStr`、
`debounce`）與會碰 DOM 的函式（`showToast`、`showConfirm`、`el`）。若要補測試，`escapeHtml`／`fmtMoney`／`monthStr` 這類純函式
可以直接照上面「如何新增一個單元測試」的步驟加測試檔，不需要額外工具。

---

## E2E 測試（摘要）

E2E 測試用 Playwright，涵蓋登入/註冊、核心記帳流程、資料版本相容性、離線同步等跨模組的真實使用者流程，測試檔位於
`frontend/tests/e2e/v2/`（`auth.spec.js`、`core.spec.js`、`dataVersion.spec.js`、`offline.spec.js`）。

安裝、執行方式、撰寫規範、CI/CD 整合、故障排除等完整說明**已獨立在** [`docs/E2E_TESTING_GUIDE.md`](E2E_TESTING_GUIDE.md)，
本文件不重複維護細節，避免兩份文件內容漂移不一致。快速指令可參考 `CLAUDE.md` 的「常用指令」與下一節。

---

## 執行測試 / push 前檢查

```bash
# 前端單元測試（不需啟動任何服務）
node --test frontend/tests/unit/*.test.js

# E2E 測試（需先啟動後端，見 E2E_TESTING_GUIDE.md）
npx playwright test --config frontend/tests/playwright.config.js
```

依專案 `CLAUDE.md` 規則，這兩項測試是「push 前的最後守門員」：一個功能/任務完成、準備 `git push` 前執行一次即可，不需要每次
修改單一檔案後都跑。測試失敗必須先修正程式碼本身，不可為了讓測試通過而修改測試邏輯。

---

## 總結

前端測試現況：

- ✅ 單元測試：`node --test`，零額外依賴，聚焦 4 個模組的純函式邊界邏輯（後端 URL 推導、JWT 過期判斷、發票 QR 解析、離線同步分類）
- ✅ E2E 測試：Playwright，涵蓋登入、核心記帳流程、資料版本、離線同步（細節見 `docs/E2E_TESTING_GUIDE.md`）
- 🟡 待補：其餘 20 個前端模組尚無專屬單元測試，優先順序建議依「該模組壞掉的後果嚴重度」與「邏輯是否容易抽成純函式」評估，
  `utils.js` 的純函式匯出是現成的低成本起點

---

**版本:** 2.0
**最後更新:** 2026-08-22
**下次審查:** 新增純函式模組單元測試，或前端測試框架有變動時
