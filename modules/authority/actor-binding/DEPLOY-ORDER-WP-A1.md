# Deployment-Auftrag WP-A1 (Actor Binding) + WP1 (Agent Attestation) — Human Authority Gate

Revision: R2 (2026-11-27, Europe/Berlin). Ersetzt R1 vom 2026-11-26.
Status: `PREPARED` — nicht ausgeführt. Ausführender: Johannes Süß als root auf Server B (`ubuntu-4gb-nbg1-1`).
Keine Erweiterung von Agenten-Root-Rechten. Jeder Schritt ist umkehrbar und einzeln abnehmbar.

## Entscheidungsgrundlage (live verifiziert, R2)

| Befund | Konsequenz |
|---|---|
| `mcp.future24.eu/mcp` → Apache `ProxyPass` → `http://100.116.58.45:39281/mcp`, nur IP-Allowlist (zwei Provider-Bereiche, [REDACTED]) | Der Claude-Webconnector erreicht die Bridge **immer über Server B selbst**. Tailnet-Bindung kann diesen Weg nicht identifizieren; mit R1 würde sie ihn vollständig abweisen. |
| Bridge-Route ohne Authentifizierung, nur IP-Bereichs-Filter | Jeder Client aus diesen IP-Bereichen erreicht die Bridge. Bestehende Exposition, unabhängig von diesem Auftrag. |
| Governed Backend V2: alle governten Effekte laufen durch `handleProposeAction` (auch Toolbox-Effekte) | Backend-seitige Attestierung deckt alle Proposal-Pfade ab, unabhängig von Bridge und Transport. |
| Direkte Schreib-Tools außerhalb Proposals: `nyxa_apply_patch`, `nyxa_run_test`, `nyxa_human_grant_issue`, `nyxa_mandate_issue`, `nyxa_mandate_derive`, `nyxa_mandate_revoke` | `nyxa_apply_patch` im Attestierungsmodus gesperrt; Mandats-Tools noch nicht attestiert (R8, offen). |

## Erforderliche menschliche Entscheidungen (vor Stufe 1)

1. **Claude-Webconnector-Route:** (a) unverändert ohne Akteursbindung weiterbetreiben (nur Read-/Draft-Werkzeuge, keine Frame-Mandate für `claude` über diese Route), oder (b) OAuth 2.1 gemäß MCP `2026-07-28` (Protected Resource Metadata, Audience-Bindung) auf `mcp.future24.eu` einführen. Empfehlung: (a) sofort, (b) als eigenes Arbeitspaket.
2. **Freigabe Stufe 2 (Backend-Attestierung)** inklusive Passport-Schlüsselerzeugung für die Agenten mit lokalem Laufzeitprozess (Claude-Code-Sitzungen auf Tailnet-Knoten, Sophia-Server, ChatGPT-Tunnel-Client).

## Stufe 0 — Preflight (zwingend, read-only)

```sh
sudo WS=/home/jo/nyxa-actor-binding-20261126 AT=/home/jo/nyxa-attestation-20261127 \
  bash /home/jo/nyxa-actor-binding-20261126/preflight-wp-a1.sh
```

Prüft: Host-Identität; Apache-Routing auf die Bridge (HOLD bei Proxy); Backend-Durchsetzung im **live** `dist/server.js` (HOLD ohne Attestierungs-Gate); Rechte der Runtime-/Datenverzeichnisse (R5); beobachtete Bridge-Peers; Hashes beider Workspaces; Rechte von Passport-Registry und Nonce-Ledger. Weiter nur bei `PREFLIGHT=PASS` oder bei einem HOLD, das durch eine dokumentierte Entscheidung oben ausdrücklich angenommen wurde.

## Stufe 1 — Actor Binding nur für direkte Tailnet-Clients (zweite Bridge-Instanz)

Die bestehende Unit `nyxa-claude-mcp-bridge.service` (Port 39281, Apache-Route) bleibt **unverändert**. Für direkte Tailnet-Clients wird eine **zweite** Instanz auf eigenem Port gestartet, die die Apache-Route nicht bedient.

```sh
set -euo pipefail
W=/home/jo/nyxa-actor-binding-20261126; B=/opt/nyxa-claude-mcp-bridge
CLIENT=<StableID des direkten Claude-Tailnet-Clients; nicht Server B; kein Proxy-Knoten>
install -o root -g nyxamcp -m 0644 "$W/tailscaleIdentity.cjs" "$W/bridge-actor-bound.cjs" "$B/"
install -d -o root -g nyxamcp -m 0750 /etc/nyxa-bridge
umask 027; printf '{"version":1,"actor":"claude","localApiSocket":"/var/run/tailscale/tailscaled.sock","allowedPeers":[{"nodeStableId":"%s"}]}\n' "$CLIENT" > /etc/nyxa-bridge/claude-actor-binding.json
chown root:nyxamcp /etc/nyxa-bridge/claude-actor-binding.json; chmod 0640 /etc/nyxa-bridge/claude-actor-binding.json
sed -e 's/^Description=.*/Description=NYXA Claude MCP Bridge, tailnet actor-bound (WP-A1)/' \
    -e 's/^Environment=BRIDGE_PORT=39281/Environment=BRIDGE_PORT=39282/' \
    -e 's#^ExecStart=.*#ExecStart=/usr/bin/node /opt/nyxa-claude-mcp-bridge/bridge-actor-bound.cjs#' \
    /etc/systemd/system/nyxa-claude-mcp-bridge.service > /etc/systemd/system/nyxa-claude-mcp-bridge-bound.service
printf '[Service]\nEnvironment=BRIDGE_ACTOR_BINDING_FILE=/etc/nyxa-bridge/claude-actor-binding.json\nEnvironment=BRIDGE_MCP_DATA_DIR=/opt/nyxa-governed-memory-mcp-runtime/data-claude-bridge-bound\n' \
  | install -D -m 0644 /dev/stdin /etc/systemd/system/nyxa-claude-mcp-bridge-bound.service.d/50-binding.conf
systemctl daemon-reload && systemctl start nyxa-claude-mcp-bridge-bound
```

Verifikation: Journal `actor claude`; von Server B `curl … http://100.116.58.45:39282/mcp` → `403`; Request mit `X-Forwarded-For` vom erlaubten Client → `403`; erlaubter Client → Tool-Liste; `nyxa_propose_action` mit `actor:"chatgpt"` → `TRANSPORT_IDENTITY`.
Rollback: `systemctl stop nyxa-claude-mcp-bridge-bound && rm -r /etc/systemd/system/nyxa-claude-mcp-bridge-bound.service* && systemctl daemon-reload`. Die bestehende Bridge war nie betroffen.

## Stufe 2 — Backend-Attestierung (Release-Pfad, nicht Hand-Patch)

1. Neue Authority-V2-Release-Version erzeugen: `patch_attestation.py` als zusätzlicher Build-Schritt nach `release-v2/build.py` (exakte Anker mit Trefferzahl; Abbruch bei Abweichung), neue `SHA256SUMS`, `deploy-authority-v2.sh --check` muss PASS ergeben.
2. Dateien: `authority/actorAttestation.mjs`, `authority/actorAttestationGate.mjs` (neben dem echten `authority/passkeyAuthorityV1.js`).
3. Passport-Registry `/etc/nyxa-authority/agent-passports.json` (`root:nyxamcp 0640`), Nonce-Ledger `/var/lib/nyxa-attestation/nonces` (`nyxamcp 0700`). Öffentliche Schlüssel werden vom jeweiligen Agenten-Host erzeugt; private Schlüssel verlassen den Agenten-Host nie und gehören nicht ins Repository.
4. Aktivierung zuerst `NYXA_ACTOR_ATTESTATION_MODE=off` (Regression), dann `required` nur für die Frame-Mandats-Route.
5. Rollback: Modus auf `off` (sofort wirksam nach Neustart), danach vorherige Release-Version über `deploy-authority-v2.sh`-Rollback.

## Stufe 3 — Funktionale Abnahme Authority V2

Passkey-Freigabe auf `auth.future24.eu` → exakt gebundenes Frame-Mandat → attestierter `nyxa_apply_patch` in `governed-dev:` (ALLOW, reale Wirkung, Audit + Evidenz) → realer Scope-DENY → Replay → Widerruf (`nyxa_mandate_revoke`) → Bypass-Versuche (direktes Tool, Toolbox, Proxy-Header, fremder Knoten) → Fail-Closed (Issuer gestoppt, Passport-Registry unlesbar) → Rollback. Jeder Schritt mit Audit-Referenz.
