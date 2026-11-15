#!/usr/bin/env bash
# 對「遠端測試環境」跑 E2E，結束後（成功、失敗、Ctrl+C 都一樣）自動清掉測試帳號。
#
# E2E 每個 spec 會用 API 註冊一次性帳號；留在測試資料庫會越積越多，所以跑完就銷毀。
# 清理用 backend/manage_test_accounts.py（只刪 v2-*／probe-* @example.com 的帳號，
# 且只能在資料庫名稱含 test 的環境執行）。
#
# 必填環境變數：
#   E2E_REMOTE_URL   站台網址，如 https://host.example.net
#   E2E_PURGE_CMD    在測試環境後端容器內執行清理的完整指令（結尾要有 --yes；腳本會自動再補上
#                    --recent-minutes，只清這次執行期間建立的帳號），例如：
#                    ssh -i ~/.ssh/KEY user@host docker exec accounting-backend-test python manage_test_accounts.py purge --yes
# 選填：
#   E2E_REMOTE_PATH  App 在站台上的路徑（預設 /test/）
#   E2E_REMOTE_API   後端網址（預設 $E2E_REMOTE_URL 加上 E2E_REMOTE_PATH 去掉結尾斜線）
#
# 用法（其餘參數原樣交給 playwright）：
#   scripts/e2e-remote.sh e2e/v2/categories.spec.js --project=chromium --workers=1
set -u

: "${E2E_REMOTE_URL:?請設定 E2E_REMOTE_URL}"
: "${E2E_PURGE_CMD:?請設定 E2E_PURGE_CMD（清理測試帳號的指令）}"
APP_PATH="${E2E_REMOTE_PATH:-/test/}"
API_URL="${E2E_REMOTE_API:-${E2E_REMOTE_URL}${APP_PATH%/}}"

# Windows Git Bash 的 pwd 是 /d/Users/...，node 會誤當成 D:\d\Users\...；pwd -W 給 Windows 格式路徑
ROOT="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd; })"

START_EPOCH="$(date +%s)"

cleanup() {
  echo
  # 只清「這次執行期間建立的」帳號：用經過的分鐘數（進位再多留 2 分鐘緩衝）交給 --recent-minutes，
  # 以伺服器時間判斷，不會誤刪別人同時在跑的測試帳號，也不受兩邊時鐘差異影響。
  local elapsed_min=$(( ( $(date +%s) - START_EPOCH ) / 60 + 3 ))
  echo "▶ 清理這次建立的測試帳號（最近 ${elapsed_min} 分鐘內）…"
  # shellcheck disable=SC2086  # E2E_PURGE_CMD 本來就是要被拆成多個參數的指令
  if ! $E2E_PURGE_CMD --recent-minutes "$elapsed_min"; then
    echo "⚠️  清理失敗，測試帳號還留在測試資料庫，請手動執行：$E2E_PURGE_CMD --recent-minutes $elapsed_min" >&2
  fi
}
trap cleanup EXIT

# MSYS_NO_PATHCONV：Windows Git Bash 會把 /test/ 當路徑轉成 C:/Program Files/Git/test/
# NODE_TLS_REJECT_UNAUTHORIZED=0：測試站用自簽憑證；只對這次執行有效
MSYS_NO_PATHCONV=1 \
BASE_URL="$E2E_REMOTE_URL" \
E2E_APP_PATH="$APP_PATH" \
BACKEND_URL="$API_URL" \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
  node "$ROOT/frontend/tests/node_modules/playwright/cli.js" test \
    --config "$ROOT/frontend/tests/playwright.config.js" "$@"
