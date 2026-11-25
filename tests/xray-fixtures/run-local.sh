#!/bin/bash
# Starts the offline X-Ray world: fixture sites (port 9300) + the site on the local Cloudflare Pages runtime (port 8788, D1 + KV).
# Usage: WRANGLER=/path/to/wrangler STATE=/tmp/dir tests/xray-fixtures/run-local.sh [perHour]   (prints READY)
# Optional: EXTRA="--binding K=V ..." more bindings (v13 accounts test), MAPX = a different XRAY_TEST_MAP
cd "$(dirname "$0")/../.."
. tests/xray-fixtures/env.sh
curl -s --noproxy '*' -m 2 127.0.0.1:9300/_calls >/dev/null || (node tests/xray-fixtures/server.js > "$STATE.fixtures.log" 2>&1 &)
rm -rf "$STATE"
"$WRANGLER" pages dev . --port 8788 --persist-to "$STATE" --d1 XRAY_DB=xraytest --kv CHAT_KV --binding XRAY_TEST_MODE=1 --binding "XRAY_TEST_MAP=${MAPX:-$MAP}" \
  --binding SERPER_API_KEY=sk-test-SECRET-123 --binding XRAY_PER_HOUR=${1:-100} --binding SEARCH_DAILY_CAP=2000 $EXTRA > "$STATE.wrangler.log" 2>&1 &
for i in $(seq 1 60); do sleep 1; curl -s --noproxy '*' -m 2 localhost:8788/api/xray/health >/dev/null && { echo READY; exit 0; }; done; echo FAILED; exit 1
