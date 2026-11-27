#!/usr/bin/env bash
# WP1 real governed-backend E2E on Server B (user jo, isolated temp runtime, no production data).
# Builds: V2 candidate dist + build-output server.js -> patch_attestation.py -> temp runtime.
set -Euo pipefail
HERE=$(dirname "$(readlink -f "$0")")
V=/home/jo/nyxa-authority-v2-candidate.mwydcf; OUT=$V/v2-verify.kpzs4emV/out
NM=/home/jo/nyxa-authority-consolidation-20261124/node_modules
RT=$(mktemp -d /tmp/nyxa-wp1-rt.XXXXXX); trap 'rm -rf "$RT"' EXIT
cp -a "$V/dist" "$RT/dist"; cp "$V/package.json" "$RT/"; ln -s "$NM" "$RT/node_modules"
cp "$OUT/dist/governance/mandateStore.js" "$RT/dist/governance/mandateStore.js"
python3 -I -B "$HERE/patch_attestation.py" "$OUT/dist/server.js" "$RT/dist/server.js" || exit 2
node --check "$RT/dist/server.js" && echo "PASS patched server.js syntax"
mkdir -p "$RT/authority" "$RT/data" && chmod 700 "$RT/data"
cp "$OUT/passkeyAuthorityV1.js" "$RT/authority/passkeyAuthorityV1.js"   # REAL human-gate module (canonicalHumanGate)
cp "$V/authority/issuerGrantClaimV1.js" "$RT/authority/"              # its re-exported dependency
cp "$V/release-v2/delegationPolicy.mjs" "$HERE/actorAttestation.mjs" "$HERE/actorAttestationGate.mjs" "$RT/authority/"
mkdir -m 700 "$RT/nonces" "$RT/reg"
openssl genpkey -algorithm ed25519 -out "$RT/claude.pem" 2>/dev/null; openssl genpkey -algorithm ed25519 -out "$RT/rogue.pem" 2>/dev/null
pub=$(openssl pkey -in "$RT/claude.pem" -pubout | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
nb=$(( $(date +%s) - 60 )); na=$(( $(date +%s) + 3600 ))
printf '{"version":1,"audience":"nyxa-governed-backend:server-b-e2e","revoked_key_ids":[],"passports":[{"key_id":"claude-e2e","actor":"claude","public_key_pem":%s,"actions":["nyxa_apply_patch","nyxa_run_test","nyxa_memory_store_candidate","nyxa_mandate_derive","nyxa_mandate_revoke"],"scope_prefixes":["governed-dev:/authority-v1/","memory:/","memory-candidates:/"],"not_before":%s,"not_after":%s}]}' "$pub" "$nb" "$na" > "$RT/reg/passports.json"
chmod 600 "$RT/reg/passports.json"
cp "$HERE/e2e-backend-client.mjs" "$RT/"
cd "$RT"
C='node e2e-backend-client.mjs "$RT" "$RT/claude.pem" "$RT/rogue.pem"'
eval "$C required"
eval "$C restart"
eval "$C off"
# Positive ALLOW control in the documented production policy mode (draft), isolated runtime.
eval "$C required draft"; echo "--- isolated candidate store after ALLOW:"; find "$RT/data" -name "candidates.jsonl" -exec sh -c 'echo "$1: $(wc -l < "$1") lines"; tail -c 400 "$1"; echo' _ {} \;
# Case 9 under controlled conditions: find a mode whose floor lets the direct tool reach its own
# handler (isolated temp runtime only, nonexistent path, no production guardrail disabled).
modes=$(grep -h -o -E '"(draft|review|dev|development|trusted|operator|autonomous|production|maintenance|full)"' dist/policy/*.js dist/config*.js dist/*/config*.js 2>/dev/null | tr -d '"' | sort -u)
echo "candidate modes: $modes"
for m in $modes; do
  out=$(eval "$C probe $m" 2>&1 | grep '^PROBE'); echo "$out"
  if [[ -n $out && $out != *mode_below_minimum* && $out != *thrown* ]]; then eval "$C case9 $m"; break; fi
done
echo "nonce files: $(ls "$RT/nonces" | wc -l)"
grep -h -o '"reason":"ATTESTATION:[a-z_]*"' -r "$RT/data" 2>/dev/null | sort | uniq -c || true
echo E2E_BACKEND_DONE
