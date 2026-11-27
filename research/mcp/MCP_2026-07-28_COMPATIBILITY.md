# Welle 6 — MCP-Spezifikation 2026-07-28: Kompatibilität der NYXA-Komponenten

Stand 2026-11-27, Europe/Berlin · erzeugt mit Claude Code · `DRAFT` · Quellenstatus `SOURCE-BOUND` (modelcontextprotocol.io, Seiten unten; `schema.ts` nur teilweise, als `unverified` markiert).

## Kernänderungen der aktuellen Revision (gegenüber 2025-11-25, Breaking)

| Thema | 2026-07-28 | Quelle |
|---|---|---|
| Handshake | `initialize`/`notifications/initialized` entfernt; jede Anfrage trägt `_meta["io.modelcontextprotocol/protocolVersion"]` und `…/clientCapabilities`; `server/discover` (MUST) | basic/index, changelog |
| Sessions | `Mcp-Session-Id` entfernt; Server SHOULD NOT Session-IDs ausgeben; GET/DELETE → 405; Zustand nur über explizite IDs pro Request | streamable-http |
| Resumability | `Last-Event-ID` nicht unterstützt; abgebrochener Stream → neue Anfrage-ID | streamable-http |
| Header | `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` (für `tools/call`) Pflicht; `Origin` MUST validiert werden | streamable-http |
| Tasks | offizielle Extension `io.modelcontextprotocol/tasks`: `CreateTaskResult` (`taskId`, `ttlMs`, `pollIntervalMs`), `tasks/get`, `tasks/update` (`input_required`), `tasks/cancel`; `tasks/result`/`tasks/list` entfernt | extensions/tasks |
| Elicitation | über MRTR (`resultType:"input_required"`, `inputRequests` mit `elicitation/create`); Form-/URL-Modus; Form-Modus nie für Geheimnisse | client/elicitation |
| Idempotenz | keine eigene Sektion; `idempotentHint` (Annotation, untrusted); `requestState` nicht automatisch single-use → Server MUSS Einmal-Nutzung selbst erzwingen | basic/patterns/mrtr |
| Auth | OAuth 2.1, RFC 8707 `resource` Pflicht, RFC 9728 Protected Resource Metadata Pflicht für Server, Audience-Validierung; DCR deprecated, Client ID Metadata Documents empfohlen | basic/authorization |
| Deprecated | Roots, Sampling, Logging, HTTP+SSE | changelog |
| MCP Apps | Extension: `_meta.ui.resourceUri` → `ui://`-Ressource, sandboxed iframe, postMessage | extensions/apps |

## Bewertung der NYXA-Komponenten

| Komponente | Stand | Lücke zu 2026-07-28 | Priorität |
|---|---|---|---|
| Claude-Bridge (`bridge.cjs`, V3-Kandidat) | SDK 1.30.0, Streamable HTTP mit `Mcp-Session-Id`, `initialize`-Pflicht | zustandsbehaftet; Session-Bindung (R4) ist künftig kein Sicherheitsanker mehr → Akteursnachweis pro Anfrage (Attestierung WP1) ist das spec-konforme Muster | P0 |
| Governed Backend (stdio) | stdio, Proposal-Pfad | stdio SHOULD NOT OAuth → Umgebungs-/Prozessbindung + Attestierung passt | ok |
| `mcp.future24.eu` (Apache → Bridge) | IP-Filter, keine Auth | Spec: Authentifizierung SHOULD, OAuth 2.1 + PRM für HTTP-Server; Origin-Validierung MUST | P0 (Sicherheit) |
| Langlaufende Aktionen (Patch, Tests, Builds) | synchron | Tasks-Extension mit persistenter `taskId`, `tasks/get`/`cancel`; Task muss vor Antwort dauerhaft angelegt sein | P0 |
| Freigaben (Human Gate) | eigener Passkey-Pfad | URL-Modus-Elicitation (Link auf `auth.future24.eu`) passt; Proposal-Digest-Bindung = vorhandener `transaction_digest` | P0 |
| Idempotenz/Replay | Nonce-Ledger (WP1), Issuer one-use | entspricht „server MUST enforce single use“ | erfüllt (technisch) |
| Skills Registry, Dynamic Discovery, MCP Apps, File Transfer | nicht vorhanden | P1 laut Masterauftrag | P1 |

Tatsächliche Client-Unterstützung (Claude, ChatGPT Work, Sophia, NYXA PA) für 2026-07-28 ist **nicht verifiziert** (`unknown`); ermittelbar nur durch Live-Probe je Client (`server/discover` + `_meta`-Versionsfeld im Zugriffslog).

## Nächste Implementierungsschritte

1. Bridge: Dual-Stack — 2025-11-25 (Session) und 2026-07-28 (zustandslos, `_meta`, `Mcp-Method`/`Mcp-Name`, `Origin`-Prüfung) parallel; Fallback-Probe wie in der Spec beschrieben.
2. Tasks-Extension für `nyxa_apply_patch`/`nyxa_run_test` mit dauerhaftem Task-Store (dieselbe Audit-Kette, kein zweiter Store).
3. OAuth 2.1 Resource Server für `mcp.future24.eu` (PRM unter `/.well-known/oauth-protected-resource`), Audience = kanonische Server-URI; Token-Subjekt → Akteur-Mapping; zusammen mit Attestierung für Effekte.

Quellen: modelcontextprotocol.io/specification/latest, …/versioning, …/2026-07-28/changelog, …/basic/index, …/basic/transports/streamable-http, …/basic/authorization, …/basic/patterns/mrtr, …/server/tools, …/server/discover, …/client/elicitation, modelcontextprotocol.io/extensions/tasks/overview, …/extensions/apps/overview (abgerufen 2026-11-27).
