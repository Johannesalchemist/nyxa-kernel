#!/bin/bash
# F6 acceptance (run as the operator on Server B AFTER rotation). Never prints secret values.
# Usage: acceptance-tests.sh <compose-dir> <old-env-backup>
set -u; D=${1:?compose dir}; OLD=${2:?old .env backup}; E="$D/.env"; GW=http://127.0.0.1:8000
v(){ grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | tr -d "\"'"; }
mint(){ node -e 'const c=require("crypto");const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",iss:"supabase",iat:Math.floor(Date.now()/1e3),exp:Math.floor(Date.now()/1e3)+300});process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.argv[1]).update(h+"."+p).digest("base64url"))' "$1"; }
pass=0; fail=0; chk(){ if [ "$2" = "$3" ]; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 (got $2, want $3)"; fail=$((fail+1)); fi; }
ANON=$(v "$E" ANON_KEY); OLDT=$(mint "$(v "$OLD" JWT_SECRET)")
chk "A1 old-secret token rejected by REST" "$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $OLDT" $GW/rest/v1/)" 401
chk "A2 old-secret token rejected by Storage" "$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" -H "Authorization: Bearer $OLDT" $GW/storage/v1/bucket)" 400
chk "A3 new anon key healthy" "$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $ANON" $GW/auth/v1/health)" 200
NEWH=$(v "$E" JWT_SECRET | sha256sum | cut -c1-16)
for c in supabase-auth:GOTRUE_JWT_SECRET supabase-rest:PGRST_JWT_SECRET supabase-storage:AUTH_JWT_SECRET realtime-dev.supabase-realtime:API_JWT_SECRET supabase-pooler:API_JWT_SECRET supabase-edge-functions:JWT_SECRET supabase-studio:AUTH_JWT_SECRET supabase-db:JWT_SECRET; do
  n=${c%%:*}; k=${c##*:}; h=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$n" | grep "^$k=" | cut -d= -f2- | sha256sum | cut -c1-16)
  chk "A4 $n uses new secret" "$h" "$NEWH"
done
code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://stream.future24.eu/auth/v1/health); [ "$code" = 401 ] && chk "A5 gateway not public" exposed closed || chk "A5 gateway not public" closed closed
echo "RESULT pass=$pass fail=$fail (A6 re-login is manual)"; [ $fail -eq 0 ]
