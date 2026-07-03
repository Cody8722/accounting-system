# 同域雙環境部署（正式 `/` + 測試 `/test/`）— NAS 操作手冊

單一網域 `https://ubuntu-server.tail886591.ts.net`、單一 443，由獨立 nginx proxy 依路徑分流：

| 路徑 | 環境 | 分支 / checkout | 資料庫 | 容器名 |
|------|------|-----------------|--------|--------|
| `/` | 正式 | `release` → `~/accounting-system-prod` | `accounting_db` | `accounting-backend` / `accounting-frontend` |
| `/test/` | 測試 | `develop` → `~/accounting-system-test` | `accounting_db_test` | `accounting-backend-test` / `accounting-frontend-test` |

proxy（`accounting-proxy`）獨立長駐，前後端經外部 `edge` 網路互通。三份 compose：
`docker-compose.yml`（正式）、`docker-compose.test.yml`（測試）、`docker-compose.proxy.yml`（proxy）。

> ⚠️ **排序前提**：Stage 2 目前只在 `develop`；`release`（正式 checkout）還是舊結構（proxy 內嵌、舊 nginx 不認得 `/test/`）。
> 因此**驗收階段**要先把 develop 的 Stage-2 檔手動複製到正式 checkout，讓兩邊結構一致；驗收 OK 合併回 release 後，再 `git reset --hard` 同步成官方版（見 §5）。

---

## 0. 前置條件（兩個 checkout 都要）

- 兩份獨立 checkout：
  ```bash
  # 若尚未有測試 checkout：
  git clone https://github.com/Cody8722/accounting-system.git ~/accounting-system-test
  cd ~/accounting-system-test && git checkout develop && git pull
  ```
- 各自的 `backend/.env`（提供 `JWT_SECRET` / SMTP / 密碼政策）。可兩邊相同；若想更嚴格隔離，測試 checkout 用不同的 `JWT_SECRET`（選用）。
- 各自的根目錄 `.env`（gitignore，內含 `MONGO_URI`）：
  - `~/accounting-system-prod/.env` → `MONGO_URI=mongodb://<正式帳號>:<正式密碼>@mongodb:27017/accounting_db?authSource=accounting_db`
  - `~/accounting-system-test/.env` → `MONGO_URI=mongodb://accounting_test_user:<密碼>@mongodb:27017/accounting_db_test?authSource=accounting_db_test`
- tailscale 憑證仍在 `~/nginx/certs/`（proxy 掛載用）。
- 現有 `mongodb` 容器在 `shared-db` 外部網路上，且**同時對 `accounting_db` 與 `accounting_db_test` 都有可用帳號**（正式帳號要能存取 `accounting_db`；`accounting_test_user` 只能存取 `accounting_db_test`）。

---

## 1. 一次性：建 `edge` 網路 + 把 Stage-2 檔複製到正式 checkout

```bash
# 1a. 建共用外部網路（正式/測試/proxy 共用；只需一次）
docker network create edge 2>/dev/null || echo "edge 已存在"

# 1b. 測試 checkout 取得最新 develop
cd ~/accounting-system-test && git checkout develop && git pull

# 1c. 把 Stage-2 的 3 個檔從測試 checkout 複製到正式 checkout
#     （docker-compose.test.yml 不複製——它必須在測試 checkout 跑 develop 的程式碼）
cp ~/accounting-system-test/docker-compose.yml       ~/accounting-system-prod/docker-compose.yml
cp ~/accounting-system-test/docker-compose.proxy.yml ~/accounting-system-prod/docker-compose.proxy.yml
cp ~/accounting-system-test/nginx-https.conf         ~/accounting-system-prod/nginx-https.conf
```

> 這步是「驗收階段」的暫時措施；合併回 release 後（§5）用 `git reset --hard` 就會被官方版取代，`cp` 的內容本來就一致，不會有差異。

---

## 2. 啟動順序（正式 → 測試 → proxy）

```bash
# 2a. 正式：先關掉舊的 Stage-1 堆疊（含內嵌 proxy），再用新結構起
cd ~/accounting-system-prod
docker compose down                      # 用「當下的 compose」關閉舊容器
docker rm -f accounting-proxy 2>/dev/null || true   # 保險：確保舊 proxy 不佔 443
docker compose up -d --build             # 只起 backend + frontend（接 edge）
docker logs accounting-backend | grep 使用資料庫     # 應為 accounting_db

# 2b. 測試：起 -test 容器（接 accounting_db_test）
cd ~/accounting-system-test
docker compose -f docker-compose.test.yml up -d --build
docker logs accounting-backend-test | grep 使用資料庫   # 應為 accounting_db_test

# 2c. proxy：獨立長駐（從正式 checkout 起，nginx 設定同時含 / 與 /test/）
cd ~/accounting-system-prod
docker compose -f docker-compose.proxy.yml up -d
docker compose -f docker-compose.proxy.yml logs proxy | tail -20   # 不應有 [emerg]
```

---

## 3. 驗收清單

```bash
# 3a. 五個容器都在 edge 網路上
docker network inspect edge --format '{{range .Containers}}{{.Name}} {{end}}'
#   應包含：accounting-backend accounting-frontend accounting-backend-test accounting-frontend-test accounting-proxy

# 3b. proxy 正常聽 443、無 [emerg]
docker compose -f ~/accounting-system-prod/docker-compose.proxy.yml logs proxy | grep -i emerg && echo "有錯" || echo "proxy OK"
```

瀏覽器（tailnet 內裝置）：

- [ ] `https://ubuntu-server.tail886591.ts.net/` → 正式：🔒 綠鎖、能登入、記一筆
- [ ] `https://ubuntu-server.tail886591.ts.net/test/` → 測試：🔒 綠鎖、能登入、記一筆
- [ ] **資料互不干擾**：在正式建一筆（如金額 11111），到測試「明細」看**不到**它；在測試建一筆（如 22222），到正式也看**不到**。
- [ ] DB 層再確認（可選）：
  ```bash
  docker logs accounting-backend      | grep 使用資料庫   # accounting_db
  docker logs accounting-backend-test | grep 使用資料庫   # accounting_db_test
  ```
- [ ] PWA 可安裝、相機掃描可用（兩邊皆 HTTPS 安全來源；SW scope 分別為 `/v2/` 與 `/test/v2/`，互相獨立）。

> 若畫面像舊版/怪異：DevTools → Application → Service Workers → Unregister + Ctrl+Shift+R（兩個 scope 各清一次）。

---

## 4. 常見雷（排錯）

- **proxy `[emerg] host not found in upstream`**：不該再發生（已改 resolver + 變數）。若仍有，確認容器都在 `edge`：`docker network inspect edge`。
- **`/test/` 打到正式 backend**：多半是前端快取到舊 config.js；清 SW 重載。config 規則：`.ts.net` + 路徑 `/test/` → API 走 `/test/api`（已有單元測試守著）。
- **502**：對應環境的 backend 沒起或連不到 Mongo；看 `docker logs accounting-backend[-test]`。
- **443 被占用 / 兩個 proxy**：確認只有一個 `accounting-proxy`（`docker ps | grep proxy`）；正式 compose 已不含 proxy。
- **`${HOME}` 未展開導致憑證掛載失敗**：把 `docker-compose.proxy.yml` 的 `${HOME}/nginx/certs` 改成絕對路徑（如 `/home/ubuntu/nginx/certs`）。

---

## 5. 驗收 OK → 合併回 `release`

兩環境都驗穩後，把 Stage 2 從 `develop` 合併進 `release`（正式化）：

```bash
# 開 PR（或告訴我，我用 gh 幫你開）
gh pr create --base release --head develop \
  --title "Stage 2: 同域雙環境路徑分流（/ 正式 + /test/ 測試）" \
  --body "config /test 前綴 + nginx /test 分流 + proxy/test compose 拆分。CI 單元/E2E 綠燈；NAS 雙環境驗收通過。"
# CI（Tests / E2E / Frontend Unit）綠燈後合併：
gh pr merge <PR編號> --merge
```

合併後，把正式 checkout 同步成官方版（取代 §1c 的手動 `cp`）：

```bash
cd ~/accounting-system-prod
git fetch origin
git reset --hard origin/release   # 只影響被追蹤檔；.env / backend/.env（gitignore）不受影響
# 若檔案有變動，重啟對應服務：
docker compose up -d
docker compose -f docker-compose.proxy.yml up -d
```

測試 checkout 維持追蹤 `develop`（`git pull` 取新版即可）。

---

## 附：日常操作速查

```bash
# 重啟正式
cd ~/accounting-system-prod && docker compose up -d --build
# 重啟測試
cd ~/accounting-system-test && docker compose -f docker-compose.test.yml up -d --build
# 重啟 proxy（改了 nginx-https.conf 後）
cd ~/accounting-system-prod && docker compose -f docker-compose.proxy.yml restart
# 看各自 log
docker logs -f accounting-backend
docker logs -f accounting-backend-test
docker compose -f ~/accounting-system-prod/docker-compose.proxy.yml logs -f proxy
```
