#!/usr/bin/env bash
# WP-A1-ACTOR-BINDING review E2E on the REAL tailnet with REAL tailscaled (stub backend, no effects).
# Phase "bridge" runs on Server B; phase "client" runs on Server A (allowed peer).
#   B: ./e2e-cross-node.sh bridge <allowed-peer-stableid>   (serves 120 s, then self-checks)
#   A: ./e2e-cross-node.sh client
set -Euo pipefail
TS_IP=100.116.58.45; PORT=39381
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream')
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"e2e","version":"0"}}}'
work=$(mktemp -d); trap '[[ -n ${pid:-} ]] && kill "$pid" 2>/dev/null; rm -rf "$work"' EXIT
post() { curl -s -o "$work/out" -D "$work/hdr" -w '%{http_code}' "${H[@]}" ${2:+-H "mcp-session-id: $2"} -d "$1" "http://$TS_IP:$PORT/mcp"; }
call() { printf '{"jsonrpc":"2.0","id":%s,"method":"tools/call","params":{"name":"%s","arguments":%s}}' "$1" "$2" "$3"; }

if [[ ${1:-} == client ]]; then
  code=$(post "$INIT"); sid=$(grep -i '^mcp-session-id:' "$work/hdr" | tr -d '\r' | awk '{print $2}')
  [[ $code == 200 && -n $sid ]] && echo "PASS A: cross-node peer authenticated, session bound" || { echo "FAIL A init $code"; exit 1; }
  post '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$sid" >/dev/null
  post "$(call 2 stub_whoami '{}')" "$sid" >/dev/null
  grep -q '\\"backend_actor\\":\\"claude\\"' "$work/out" && echo "PASS A: backend actor = claude (from binding)" || { cat "$work/out"; exit 1; }
  post "$(call 3 nyxa_propose_action '{"proposal":{"actor":"chatgpt"}}')" "$sid" >/dev/null
  grep -q TRANSPORT_IDENTITY "$work/out" && ! grep -q forwarded "$work/out" && echo "PASS A: direct actor spoof denied" || exit 1
  post "$(call 4 toolbox_execute '{"name":"nyxa.dev.run_test","input":{"proposal":{"actor":"sophia"}}}')" "$sid" >/dev/null
  grep -q TRANSPORT_IDENTITY "$work/out" && ! grep -q forwarded "$work/out" && echo "PASS A: toolbox-wrapped actor spoof denied" || exit 1
  echo "$sid" > /tmp/nyxa-e2e-sid; echo "CLIENT_RESULT=PASS"; exit 0
fi

cd "$(dirname "$(readlink -f "$0")")"
SOCK=/var/run/tailscale/tailscaled.sock
SELF=$(tailscale whois --json "$TS_IP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["Node"]["StableID"])')
mk() { printf '{"version":1,"actor":"claude","localApiSocket":"%s","allowedPeers":[{"nodeStableId":"%s"}]}' "$SOCK" "$1" > "$work/b.json"; chmod 600 "$work/b.json"; }
start() { BRIDGE_ACTOR_BINDING_FILE="$work/b.json" BRIDGE_BIND_HOST=$TS_IP BRIDGE_PORT=$PORT \
  BRIDGE_MCP_RUNTIME_CWD="$PWD/stub" BRIDGE_MCP_DATA_DIR="$work" node bridge-actor-bound.cjs > "$work/log" 2>&1 & pid=$!; }

mk "$SELF"; start; sleep 2
grep -q self_node_not_allowed "$work/log" && ! kill -0 $pid 2>/dev/null && echo "PASS B: real host node in binding refused at startup" || { cat "$work/log"; exit 1; }

mk "$2"; start
for _ in $(seq 50); do grep -q broker_ready "$work/log" && break; sleep 0.1; done
grep -q broker_ready "$work/log" && echo "PASS B: bridge serving, allowed peer $2" || { cat "$work/log"; exit 1; }
code=$(post "$INIT"); [[ $code == 403 ]] && echo "PASS B: local process on bridge host denied (403)" || { echo "FAIL B self $code"; exit 1; }
for _ in $(seq 120); do [[ -f "$work/stop" ]] && break; sleep 1; done
grep -o '"event":"[a-z_]*"' "$work/log" | sort | uniq -c
echo "BRIDGE_PHASE_DONE"
