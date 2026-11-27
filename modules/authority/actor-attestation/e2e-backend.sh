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
mkdir -m 700 "$RT/nonces"
openssl genpkey -algorithm ed25519 -out "$RT/claude.pem" 2>/dev/null; openssl genpkey -algorithm ed25519 -out "$RT/rogue.pem" 2>/dev/null
pub=$(openssl pkey -in "$RT/claude.pem" -pubout | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')
printf '{"version":1,"audience":"nyxa-governed-backend:server-b-e2e","passports":[{"key_id":"claude-e2e","actor":"claude","public_key_pem":%s,"actions":["nyxa_apply_patch","nyxa_run_test"],"scope_prefixes":["governed-dev:/authority-v1/"]}]}' "$pub" > "$RT/passports.json"
chmod 600 "$RT/passports.json"
cp "$HERE/e2e-backend-client.mjs" "$RT/"
cd "$RT"
node e2e-backend-client.mjs "$RT" "$RT/claude.pem" "$RT/rogue.pem" required
node e2e-backend-client.mjs "$RT" "$RT/claude.pem" "$RT/rogue.pem" restart
node e2e-backend-client.mjs "$RT" "$RT/claude.pem" "$RT/rogue.pem" off
echo "nonce files: $(ls "$RT/nonces" | wc -l)"
grep -h -o '"reason":"ATTESTATION:[a-z_]*"' -r "$RT/data" 2>/dev/null | sort | uniq -c || true
echo E2E_BACKEND_DONE
