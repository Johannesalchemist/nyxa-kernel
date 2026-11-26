# WP-A1-ACTOR-BINDING — Transportgebundene Akteursidentität für die Claude-MCP-Bridge

| Feld | Wert |
|---|---|
| Work Package | `WP-A1-ACTOR-BINDING` (Welle 0, Track A: Authority und Core) |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code (Cloud-Session), Modellkennung nur in der Session dokumentiert |
| Sitzungsdatum | 2026-11-26, Europe/Berlin |
| Host / Workspace | Server B `ubuntu-4gb-nbg1-1`, `/home/jo/nyxa-actor-binding-20261126` (Benutzer `jo`, NoNewPrivs, kein root) |
| Ausgangsversion | `/opt/nyxa-claude-mcp-bridge/bridge.cjs` sha256 `0492f1e12f79ea1010388ff3ffd6d351f096fec70831f18a2964614f2cd57804` (live, byte-identisch mit `nyxa-authority-consolidation-20261124/bridge-claude.cjs`) |
| Quellenstatus | `SOURCE-VERIFIED` (Live-Code von Server B gelesen) |
| Epistemischer Status | `DRAFT` |
| Implementierungsstatus | `IMPLEMENTED` · `TESTED` (isoliert + realer Tailnet-Transport mit Stub-Backend) — **nicht** `CONNECTED`, **nicht** `ACTIVATED` |
| Reviewstatus | Unabhängige Review ausstehend |
| Vorgänger | `/home/jo/nyxa-authority-v2-candidate.mwydcf/release-v2/STATUS.md` (Blocker „Claude-Bridge ohne verifizierte Client-Identität“) |

## Problem (live verifiziert)

1. `nyxa-claude-mcp-bridge.service` lauscht auf `100.116.58.45:39281` (Tailnet) und reicht `tools/call` ohne jede Client-Authentifizierung an das Governed Backend durch. Jeder Tailnet-Knoten kann die Bridge ansprechen.
2. Der Authority-V2-Kandidat (`dist/server.js`) prüft Frame-Mandate gegen `process.env.NYXA_DEVELOPMENT_ACTOR` (`authenticated_actor_mismatch`). Die Bridge setzt diese Variable nie; ein Wert aus einem Proposal wäre nicht authentifiziert.
3. `deploy-authority-v2.sh --install` stoppt deshalb bewusst mit `Claude and Sophia execution identities are not bound to authenticated transports`.

## Lösung

- `tailscaleIdentity.cjs`: lädt eine gepinnte Bindungsdatei (exakte Keys, reguläre Datei, kein Symlink, nicht group/world-writable) und fragt für jede TCP-Verbindung `tailscaled` LocalAPI `/localapi/v0/whois` nach der WireGuard-authentifizierten Knotenidentität (`Node.StableID`, optional `UserProfile.LoginName`).
- `bridge-actor-bound.cjs` (V3-Kandidat, Diff ggü. V2 nur in Authentifizierung/Bindung):
  - Jeder HTTP-Request (POST/GET/DELETE) wird per whois authentifiziert; unbekannte oder nicht auflösbare Peers → `403` (fail closed, auch bei LocalAPI-Ausfall).
  - Session wird an den initialisierenden Knoten gebunden; andere Knoten können sie weder nutzen noch löschen.
  - Backend-Kindprozess erhält `NYXA_DEVELOPMENT_ACTOR` ausschließlich aus der Bindung.
  - `nyxa_propose_action` mit abweichendem `proposal.actor` wird vor Weiterleitung abgewiesen (`TRANSPORT_IDENTITY / authenticated_actor_mismatch`); das Backend prüft weiterhin unabhängig.
  - Ist Authority-Umgebung konfiguriert (`NYXA_MANDATE_DATA_DIR` / `NYXA_AUTHORITY_ADAPTER_CONFIG`), verweigert die Bridge ohne gültige Bindung den Start.
  - Ohne Authority-Umgebung und ohne Bindung: Verhalten wie V2 (Regressionstest), Frame-Mandate bleiben dann unbenutzbar.
- Keine neue Capability, kein zweiter Executor, keine zweite Authority- oder Memory-Instanz. Gamma, Capability Gate, E0 und Mandate Ledger bleiben unverändert maßgeblich.

## Bindungsdatei (Vertrag)

```json
{
  "version": 1,
  "actor": "claude",
  "localApiSocket": "/var/run/tailscale/tailscaled.sock",
  "allowedPeers": [{ "nodeStableId": "<StableID des Claude-Client-Knotens>", "loginName": "<optional>" }]
}
```

Eigentümer root, Modus `0600`/`0640` (Gruppe `nyxamcp` lesend). Ein Bridge-Prozess bindet genau einen Akteur; Sophia/ChatGPT benötigen je eigene Bridge-Instanz (eigener Port), weil das Backend den Akteur prozessweit bindet.

## Tests

| Test | Umgebung | Ergebnis |
|---|---|---|
| `node --test actorBinding.test.mjs` (9 Tests: 7× Fail-Closed-Start, Identität/Aktorpropagation/Proposal-Spoofing/Session-Übernahme/LocalAPI-Ausfall, Legacy-Regression) | Server B, Node v22.23.3, SDK 1.30.0 | 9/9 PASS |
| dieselbe Suite | Claude-Code-Container, Node v22.23.5, SDK 1.30.0 frisch installiert | 9/9 PASS |
| `e2e-real-tailscale.sh` (realer `tailscaled`, reale Tailnet-IP, Stub-Backend) | Server B | `E2E_RESULT=PASS` (5 Prüfungen inkl. realer 403 für nicht gebundenen Knoten) |

Nicht getestet: produktives Governed Backend, reale Claude-Client-Verbindung, produktive Wirkung, Deployment und Rollback unter systemd.

## Deployment (root-Schritt, nur nach Freigabe durch Johannes)

1. StableID des tatsächlichen Claude-Client-Knotens bestimmen (`tailscale whois <client-ip>` während einer echten Verbindung). **Derzeit `unknown`** — auf Port 39281 bestand bei der Prüfung keine aktive Verbindung.
2. Bindungsdatei als root anlegen, z. B. `/etc/nyxa-bridge/claude-actor-binding.json`.
3. `bridge-actor-bound.cjs` und `tailscaleIdentity.cjs` nach `/opt/nyxa-claude-mcp-bridge/` kopieren (V2 als `bridge.cjs.pre-actor-binding-20261126` sichern), Drop-in:
   ```ini
   [Service]
   Environment=BRIDGE_ACTOR_BINDING_FILE=/etc/nyxa-bridge/claude-actor-binding.json
   ExecStart=
   ExecStart=/usr/bin/node /opt/nyxa-claude-mcp-bridge/bridge-actor-bound.cjs
   ```
4. `systemctl daemon-reload && systemctl restart nyxa-claude-mcp-bridge` → Log `actor claude` prüfen; Fremdknoten → 403 prüfen.
5. Rollback: Drop-in entfernen, `daemon-reload`, `restart` (V2-Datei bleibt unverändert liegen). Rollback ist noch nicht praktisch geprüft.

## Offene Punkte

- `nyxa_mandate_issue` / `nyxa_mandate_derive` werden an der Bridge nicht auf den gebundenen Akteur eingeschränkt; das Backend erzwingt Passkey-Grant bzw. `parent.actor == NYXA_DEVELOPMENT_ACTOR`. Entscheidung nötig, ob Ableitungen für fremde Kind-Akteure über diese Route zulässig bleiben.
- JSON-Body wird vor der Authentifizierung geparst (Express-Middleware des SDK); Größenlimit des SDK gilt. Niedriges Risiko, dokumentiert.
- Sophia-Route: keine Bridge mit Ausführungspfad gefunden (laut V2-STATUS read-only); gleiche Bindung wäre wiederverwendbar.

## Nächster zulässiger Schritt

Unabhängige Review dieses Diffs → Bestimmung der Claude-Client-StableID → root-Deployment mit Rollback-Probe durch Johannes → danach `deploy-authority-v2.sh` um die Bindungsprüfung erweitern und den Passkey-Zyklus (ALLOW, realer Scope-DENY, Replay, Widerruf) produktiv protokollieren.
