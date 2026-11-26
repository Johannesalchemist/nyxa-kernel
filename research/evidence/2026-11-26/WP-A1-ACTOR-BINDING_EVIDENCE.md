# Evidenz WP-A1-ACTOR-BINDING — 2026-11-26 (Europe/Berlin)

Quellenstatus: `SOURCE-VERIFIED` (Live-Ausgaben, unverändert übernommen, ohne Secrets)
Erzeugt: Claude Code (Cloud-Session) über Remote Desktop Commander, Gerät `07f357b1-920e-4f65-b324-5dc9a7a45a1b` (`ubuntu-4gb-nbg1-1`, Benutzer `jo`)
Reviewstatus: ausstehend

## Identität und Route (vor jeder Mutation)

- NYXA MCP `nyxa_operational_route_resolve(server-b, read)`: `PREFLIGHT_OK`, StableID `ncoa4as1dm11CNTRL`, `100.116.58.45`, `authorityEffect: NONE`.
- NYXA MCP `nyxa_system_status`: Host `ubuntu-4gb-nbg1-1`, Ollama `inactive`, Docker `active`, Policy-Modus `draft`.
- RDC `whoami`/`hostname`: `jo` / `ubuntu-4gb-nbg1-1`. `sudo` durch RDC-Policy blockiert (NoNewPrivs bestätigt).
- Mutationen ausschließlich in neuem Workspace `/home/jo/nyxa-actor-binding-20261126` (Modus 0700). Keine Änderung unter `/opt`, `/etc`, an Diensten oder Produktionsdaten.

## Baseline

```
0492f1e12f79ea1010388ff3ffd6d351f096fec70831f18a2964614f2cd57804  /opt/nyxa-claude-mcp-bridge/bridge.cjs
0492f1e12f79ea1010388ff3ffd6d351f096fec70831f18a2964614f2cd57804  /home/jo/nyxa-authority-consolidation-20261124/bridge-claude.cjs
```
Unit `nyxa-claude-mcp-bridge.service`: `BRIDGE_BIND_HOST=100.116.58.45`, `BRIDGE_PORT=39281`, User `nyxamcp`, `active`. Kein Authentifizierungsmechanismus im Code.

## Isolierte Testsuite (Server B, Node v22.23.3)

```
✔ startup fails closed: authority env without binding
✔ startup fails closed: invalid binding extra-key
✔ startup fails closed: invalid binding bad-actor
✔ startup fails closed: invalid binding world-writable
✔ startup fails closed: invalid binding no-peers
✔ startup fails closed: invalid binding bad-json
✔ startup fails closed: symlinked binding
✔ bound bridge: identity, actor propagation, proposal mismatch, session takeover, LocalAPI outage
✔ unbound legacy mode unchanged without authority env (regression)
ℹ tests 9 · pass 9 · fail 0
EXIT=0
```

Erster Lauf scheiterte (2/9) an `ReferenceError: require is not defined in ES module scope`: Auf Server B existiert `/package.json` mit `"type":"module"` am Dateisystemroot. Behoben durch lokale `package.json` (`"type":"commonjs"`) im Workspace. Befund: Ein root-level `/package.json` beeinflusst jede `.js`-Datei ohne nähere `package.json` auf Server B — Herkunft `unknown`.

## Reproduktion in zweiter Umgebung (Claude-Code-Container, Node v22.23.5, @modelcontextprotocol/sdk 1.30.0)

`# tests 9 · # pass 9 · # fail 0`

## Realer Transport-E2E (Server B, realer tailscaled, Stub-Backend)

```
self node: ncoa4as1dm11CNTRL
PASS real tailnet peer authenticated -> session bound
PASS backend received NYXA_DEVELOPMENT_ACTOR=claude from binding
PASS spoofed proposal actor denied at bridge, not forwarded
PASS real tailnet peer not in binding -> 403
PASS denial audited
E2E_RESULT=PASS
EXIT=0
```

## Hash-Identität Repository ↔ Server B

Alle acht Dateien in `modules/authority/actor-binding/` (außer README/SHA256SUMS) sind byte-identisch mit `/home/jo/nyxa-actor-binding-20261126/SHA256SUMS`.

## Was diese Evidenz NICHT belegt

- keine produktive Aktivierung, kein Deployment, kein geprüfter Rollback;
- keine Verbindung eines realen Claude-Clients; dessen Tailnet-StableID ist `unknown`;
- keine Ausführung über das produktive Governed Backend, keine produktive Wirkung;
- keine unabhängige menschliche oder Fremdmodell-Review.
