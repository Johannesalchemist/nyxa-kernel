# Modul: sophia-unified-room

**Status:** `DRAFT — REFERENCE IMPLEMENTATION — NOT DEPLOYED` · Quellenstatus `SOURCE-BOUND` · Epistemischer Status: Verhalten durch lokale Tests belegt, Wirkung im Produktivsystem `unverified`
**Erzeugt:** Claude Code (Anthropic), 2026-11-07, Europe/Berlin · **Verantwortlich:** Johannes Süß
**Entscheidung:** `decisions/ADR-0003_SOPHIA_UNIFIED_ROOM_AND_GOVERNED_TASK_QUEUE.md` (PROPOSED)
**Nächster zulässiger Schritt:** unabhängige Review, danach Freigabe der P0-Patches auf Server B

| Pfad | Inhalt |
|---|---|
| `src/db.cjs` | SQLite-Schema (node:sqlite), Transaktionen, Audit |
| `src/conversation-bus.cjs` | Unified Conversation Bus |
| `src/task-queue.cjs` | Governed Task Queue, Approval, Mandate, Effect-Gate |
| `src/scheduler.cjs` | Modi und Europe/Berlin-Zeitplan mit Sommerzeit |
| `src/executors.cjs` | Executor-Vertrag, Claude- und GPT-Adapter, Worker, Cross-Check |
| `src/mail-gate.cjs` | providerneutrale Mail-Funktionen mit Versandfreigabe |
| `src/auth.cjs` | Principals, on-behalf-of, Approver-Policy |
| `src/http-api.cjs` | `/api/v2/*`-Routen für The Room |
| `bin/worker.cjs` | Worker-Einstieg für n8n oder systemd |
| `ui/task-panel.html` | kompakte Auftragsverwaltung für The Room |
| `docs/CONTRACT.md` | normativer Vertrag |
| `docs/BETRIEBSHANDBUCH.md` | Betrieb und dokumentierte Grenzen |
| `docs/P0_SERVER_B_PATCH_PROPOSAL.md` | Sicherheitsbefunde und Patchvorschlag für `/opt/thechat` |

Tests: `npm test` (Node ≥ 22.13, keine Abhängigkeiten).
