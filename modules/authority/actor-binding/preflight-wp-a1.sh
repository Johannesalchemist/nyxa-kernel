#!/usr/bin/env bash
# WP2 mandatory preflight for WP-A1 (actor binding) + WP1 (agent attestation). Run as root on
# Server B BEFORE any install step. Read-only: changes nothing. Exit 0 only with PREFLIGHT=PASS.
# Any HOLD blocks the deployment; the operator decides, the script never overrides.
set -uo pipefail
HOLD=0; hold() { echo "HOLD: $*"; HOLD=1; }; pass() { echo "PASS: $*"; }
RT=/opt/nyxa-governed-memory-mcp-runtime
WS=${WS:-/home/jo/nyxa-actor-binding-20261126}; AT=${AT:-/home/jo/nyxa-attestation-20261127}
BRIDGE_PORT=39281; TS_IP=100.116.58.45

[[ $EUID == 0 ]] || { echo "HOLD: run as root (Human Authority Gate)"; exit 2; }
[[ $(hostname) == ubuntu-4gb-nbg1-1 ]] && pass "host identity" || hold "wrong host"

# 1. Apache routing (R3): anything proxied to the bridge arrives with Server B's own tailnet identity.
proxied=$(grep -l -E "ProxyPass[^#]*${TS_IP}:${BRIDGE_PORT}|ProxyPass[^#]*127\.0\.0\.1:${BRIDGE_PORT}" /etc/apache2/sites-enabled/* 2>/dev/null)
if [[ -n $proxied ]]; then
  hold "Apache proxies to the bridge ($proxied). Tailnet actor binding cannot identify these clients;" \
       "binding would deny them all (self node). Decide: separate authenticated route (OAuth 2.1 per MCP 2026-07-28) or keep this route unbound."
else pass "no Apache proxy to the bridge"; fi
for f in $proxied; do grep -n -E "Require|Auth" "$f" | sed 's/^/      /'; done

# 2. Backend-side enforcement present in the LIVE backend (WP1)?
if grep -q "actorAttestationGate" "$RT/dist/server.js" 2>/dev/null; then pass "backend attestation gate wired"
else hold "live backend has no attestation gate; bridge-only enforcement is insufficient (direct backend access)"; fi
grep -n "NYXA_DEVELOPMENT_ACTOR" "$RT/dist/server.js" >/dev/null 2>&1 \
  && echo "INFO: live backend evaluates NYXA_DEVELOPMENT_ACTOR (R6: setting it changes direct-tool behaviour)" \
  || echo "INFO: live backend does not reference NYXA_DEVELOPMENT_ACTOR (V1)"

# 3. Who can start the backend with a chosen actor (R5)?
for d in "$RT" "$RT/dist" "$RT/data-authority-v1" "$RT/data-claude-bridge"; do
  [[ -e $d ]] || continue
  perm=$(stat -c '%U:%G %a' "$d"); case "$perm" in *[2367]) hold "$d writable by others ($perm)";; *) pass "$d $perm";; esac
done

# 4. Bridge clients actually observed (tailnet peers vs. local proxy).
ss -tnH state established "( sport = :${BRIDGE_PORT} )" | awk '{print $4}' | sed 's/:[0-9]*$//' | sort | uniq -c | sed 's/^/INFO: bridge peer /'

# 5. Artifact integrity.
(cd "$WS" && sha256sum --strict -c SHA256SUMS >/dev/null 2>&1) && pass "actor-binding workspace hashes" || hold "actor-binding workspace hash mismatch"
(cd "$AT" && sha256sum --strict -c SHA256SUMS >/dev/null 2>&1) && pass "attestation workspace hashes" || hold "attestation workspace hash mismatch"

# 6. Passport registry + nonce ledger (only if WP1 is to be activated).
P=/etc/nyxa-authority/agent-passports.json; N=/var/lib/nyxa-attestation/nonces
[[ -f $P ]] && { [[ $(stat -c '%U:%G %a' "$P") == "root:nyxamcp 640" ]] && pass "passport registry perms" || hold "passport registry perms $(stat -c '%U:%G %a' "$P")"; } || echo "INFO: no passport registry yet ($P)"
[[ -d $N ]] && { [[ $(stat -c '%U %a' "$N") == "nyxamcp 700" ]] && pass "nonce ledger perms" || hold "nonce ledger perms $(stat -c '%U %a' "$N")"; } || echo "INFO: no nonce ledger yet ($N)"

[[ $HOLD == 0 ]] && { echo "PREFLIGHT=PASS"; exit 0; } || { echo "PREFLIGHT=HOLD"; exit 1; }
