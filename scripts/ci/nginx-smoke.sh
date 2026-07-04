#!/usr/bin/env bash
#
# nginx-smoke.sh — 透過 nginx proxy 這一層驗證雙環境路由的冒煙測試。
#
# 與現有 E2E（直連 backend）不同，本測試打的是 proxy 的對外入口，驗證：
#   /              → 正式前端
#   /api/...       → 正式後端（$request_uri 保留完整路徑）
#   /test/         → 測試前端（rewrite 剝掉 /test 前綴）
#   /test/api/...  → 測試後端，且 /test 前綴被正確剝除
#                    （歷史地雷：rewrite 要用 $uri 而非 $request_uri，
#                     否則後端收到 /test/api/... 而 404）
#
# 用法：scripts/ci/nginx-smoke.sh [BASE_URL]     （預設 https://localhost）
# 前置：proxy + 正式/測試 前後端容器都已啟動。自簽憑證用 curl -k 略過驗證。
#
set -euo pipefail

BASE="${1:-https://localhost}"
fail=0

# 取 HTTP 狀態碼（連線失敗回 000，不讓 set -e 中斷）
http_code() {
  curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "$1" || true
}

# 取 Content-Type 標頭（小寫比對）
content_type() {
  curl -sk -I --max-time 15 "$1" 2>/dev/null \
    | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="content-type"{print $2}' \
    || true
}

# 斷言：狀態碼相符
check_code() {
  local desc="$1" url="$2" want="$3" got
  got="$(http_code "$url")"
  if [ "$got" = "$want" ]; then
    echo "  ✓ $desc — $url → $got"
  else
    echo "  ✗ $desc — $url → 期望 $want，實得 $got"
    fail=1
  fi
}

# 斷言：Content-Type 含指定字串
# （用於證明前綴剝除成功，而非 SPA try_files fallback 回傳的 text/html）
check_ctype() {
  local desc="$1" url="$2" want="$3" ct
  ct="$(content_type "$url")"
  if printf '%s' "$ct" | grep -qi "$want"; then
    echo "  ✓ $desc — $url → Content-Type: $ct"
  else
    echo "  ✗ $desc — $url → Content-Type 期望含 '$want'，實得 '${ct:-<空>}'"
    fail=1
  fi
}

echo "=== nginx 整合冒煙測試（BASE=$BASE）==="

echo "▶ 正式環境（/）"
check_code  "正式前端首頁"           "$BASE/"                     200
check_code  "正式後端健康檢查"       "$BASE/health"               200
check_code  "正式 /api 轉發後端"     "$BASE/api/auth/verify"      401

echo "▶ 測試環境（/test/）"
check_code  "測試前端首頁"           "$BASE/test/"                200
check_ctype "測試前端前綴剝除"       "$BASE/test/manifest.json"   application/json
# 關鍵回歸：後端須收到剝掉 /test 的 /api/auth/verify（401），而非未剝除的 /test/api/...（404）
check_code  "測試 /test/api 前綴剝除轉發後端" "$BASE/test/api/auth/verify" 401

echo "==============================================="
if [ "$fail" -ne 0 ]; then
  echo "✗ 冒煙測試失敗"
  exit 1
fi
echo "✓ 全部通過"
