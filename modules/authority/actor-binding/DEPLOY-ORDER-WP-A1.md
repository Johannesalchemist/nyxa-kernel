# Deployment-Auftrag WP-A1-ACTOR-BINDING (Human Authority Gate)

Status: `PREPARED` — nicht ausgeführt. Ausführender: Johannes Süß als root auf Server B (`ubuntu-4gb-nbg1-1`). Keine Erweiterung von Agenten-Root-Rechten.

## Exakter Umfang

Ändert genau: zwei neue Dateien in `/opt/nyxa-claude-mcp-bridge/`, eine Bindungsdatei unter `/etc/nyxa-bridge/`, ein systemd-Drop-in für `nyxa-claude-mcp-bridge.service`. Ändert nicht: `bridge.cjs`, Governed Backend, Authority-Issuer, Tunnel-Client, andere Units.

## Vorbedingungen (alle müssen erfüllt sein, sonst HOLD)

1. Unabhängiges Review von `REVIEW-R1.md` + Diff liegt vor (nicht durch Claude).
2. R6: `grep -n NYXA_DEVELOPMENT_ACTOR /opt/nyxa-governed-memory-mcp-runtime/dist/server.js` — wertet das Live-Backend die Variable aus? Wenn ja: Auswirkungen auf Direktaufrufe dokumentieren; Aktivierung zusammen mit Authority V2 planen.
3. R3: Apache-Vhost `mcp.future24.eu` prüfen: `grep -n -A15 mcp.future24.eu /etc/apache2/sites-enabled/*`. Zeigt er auf `100.116.58.45:39281`, ist Server B selbst der Client → Binding würde (korrekt) alles abweisen; dann ist dieses Arbeitspaket für den Claude-Webconnector **nicht** der richtige Ort, sondern die Apache-Authentifizierung.
4. Client-Knoten bestimmen: während einer echten Claude-Verbindung `ss -tn sport = :39281` → Peer-IP → `tailscale whois <ip>`. StableID notieren. Darf nicht Server B sein und keinen Fremdverkehr proxien.
5. Hashes im Workspace prüfen: `cd /home/jo/nyxa-actor-binding-20261126 && sha256sum -c` gegen `modules/authority/actor-binding/SHA256SUMS` dieses Repos.

## Ausführung (root)

```sh
set -euo pipefail
W=/home/jo/nyxa-actor-binding-20261126; B=/opt/nyxa-claude-mcp-bridge
CLIENT=<StableID aus Vorbedingung 4>
install -o root -g nyxamcp -m 0644 "$W/tailscaleIdentity.cjs" "$W/bridge-actor-bound.cjs" "$B/"
install -d -o root -g nyxamcp -m 0750 /etc/nyxa-bridge
umask 027; printf '{"version":1,"actor":"claude","localApiSocket":"/var/run/tailscale/tailscaled.sock","allowedPeers":[{"nodeStableId":"%s"}]}\n' "$CLIENT" > /etc/nyxa-bridge/claude-actor-binding.json
chown root:nyxamcp /etc/nyxa-bridge/claude-actor-binding.json; chmod 0640 /etc/nyxa-bridge/claude-actor-binding.json
install -d /etc/systemd/system/nyxa-claude-mcp-bridge.service.d
cat > /etc/systemd/system/nyxa-claude-mcp-bridge.service.d/50-actor-binding.conf <<'EOF'
[Service]
Environment=BRIDGE_ACTOR_BINDING_FILE=/etc/nyxa-bridge/claude-actor-binding.json
ExecStart=
ExecStart=/usr/bin/node /opt/nyxa-claude-mcp-bridge/bridge-actor-bound.cjs
EOF
systemctl daemon-reload && systemctl restart nyxa-claude-mcp-bridge
```

## Verifikation (direkt danach)

1. `journalctl -u nyxa-claude-mcp-bridge -n 20` enthält `nyxa_claude_mcp_broker_ready … actor claude`.
2. Von Server B: `curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"v","version":"0"}}}' http://100.116.58.45:39281/mcp` → `403`.
3. Echter Claude-Client: Tool-Liste lädt (Session gebunden).
4. Spoof-Probe vom Client: `nyxa_propose_action` mit `actor:"chatgpt"` → `TRANSPORT_IDENTITY / authenticated_actor_mismatch`.

## Rollback (bei jedem Fehlschlag)

```sh
rm /etc/systemd/system/nyxa-claude-mcp-bridge.service.d/50-actor-binding.conf
systemctl daemon-reload && systemctl restart nyxa-claude-mcp-bridge
systemctl show nyxa-claude-mcp-bridge -p ExecStart | grep -q 'bridge.cjs' && echo ROLLED_BACK
```

`bridge.cjs` bleibt unverändert; die neuen Dateien sind ohne Drop-in inert.

## Danach: funktionale Abnahme Authority V2

Erst nach Deployment von Authority V2 (`deploy-authority-v2.sh` mit neuer Release-Version, deren `--install` die Bindung prüft statt hart abzubrechen): Passkey-Freigabe auf `auth.future24.eu` → exakt gebundenes Mandat → `nyxa_apply_patch` in `governed-dev:` (ALLOW, reale Wirkung) → Scope-Escape (realer DENY) → Replay → Widerruf → Bypass über Direktaufruf → Fail-Closed bei gestopptem Issuer → Rollback. Jeder Schritt mit Audit-/Evidenz-Referenz.
