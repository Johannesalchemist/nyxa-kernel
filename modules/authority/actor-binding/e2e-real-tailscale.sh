#!/usr/bin/env bash
# WP-A1-ACTOR-BINDING real-transport E2E. Uses the REAL tailscaled LocalAPI and the
# REAL tailnet interface; backend is the test stub (no production data, no effects).
set -Eeuo pipefail
cd "$(dirname "$(readlink -f "$0")")"
TS_IP=100.116.58.45; PORT=39381
SELF=$(tailscale whois --json "$TS_IP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["Node"]["StableID"])')
work=$(mktemp -d); trap 'kill ${pid:-0} 2>/dev/null || true; rm -rf "$work"' EXIT
mk() { printf '{"version":1,"actor":"claude","localApiSocket":"/var/run/tailscale/tailscaled.sock","allowedPeers":[{"nodeStableId":"%s"}]}' "$1" > "$work/b.json"; chmod 600 "$work/b.json"; }
run() {
  BRIDGE_ACTOR_BINDING_FILE="$work/b.json" BRIDGE_BIND_HOST=$TS_IP BRIDGE_PORT=$PORT \
  BRIDGE_MCP_RUNTIME_CWD="$PWD/stub" BRIDGE_MCP_DATA_DIR="$work" node bridge-actor-bound.cjs > "$work/log" 2>&1 & pid=$!
  for _ in $(seq 50); do grep -q broker_ready "$work/log" && return 0; sleep 0.1; done; cat "$work/log"; return 1
}
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"e2e","version":"0"}}}'
post() { curl -s -o "$work/out" -D "$work/hdr" -w '%{http_code}' "${H[@]}" ${2:+-H "mcp-session-id: $2"} -d "$1" "http://$TS_IP:$PORT/mcp"; }

echo "self node: $SELF"
mk "$SELF"; run
code=$(post "$INIT"); sid=$(grep -i '^mcp-session-id:' "$work/hdr" | tr -d '\r' | awk '{print $2}')
[[ $code == 200 && -n $sid ]] && echo "PASS real tailnet peer authenticated -> session bound" || { echo "FAIL init $code"; exit 1; }
post '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$sid" >/dev/null
post '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"stub_whoami","arguments":{}}}' "$sid" >/dev/null
grep -q '\\"backend_actor\\":\\"claude\\"' "$work/out" && echo "PASS backend received NYXA_DEVELOPMENT_ACTOR=claude from binding" || { cat "$work/out"; exit 1; }
post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nyxa_propose_action","arguments":{"proposal":{"actor":"chatgpt"}}}}' "$sid" >/dev/null
grep -q 'TRANSPORT_IDENTITY' "$work/out" && ! grep -q forwarded "$work/out" && echo "PASS spoofed proposal actor denied at bridge, not forwarded" || { cat "$work/out"; exit 1; }
kill $pid; wait $pid 2>/dev/null || true

mk "NOTTHISNODE0001"; run
code=$(post "$INIT"); [[ $code == 403 ]] && echo "PASS real tailnet peer not in binding -> 403" || { echo "FAIL expected 403 got $code"; exit 1; }
grep -q transport_identity_denied "$work/log" && echo "PASS denial audited"
echo "E2E_RESULT=PASS"
