# HANDOFF: Claude → Johannes · Sophia Unified Room V0.1

**Datum:** 2026-11-07, Sitzung ca. 15:25 bis 17:00 UTC (16:25 bis 18:00 Europe/Berlin)
**Erzeugendes System:** Claude Code (Anthropic), Cloud-Sitzung; Server-B-Zugriff über Desktop Commander, Gerät `ubuntu-4gb-nbg1-1` (ID `07f357b1-…`), Benutzer `jo`, **nur lesend**
**Auftraggeber / Verantwortung:** Johannes Süß
**Quelle:** Implementation Handoff „NYXA Unified Room · Sophia CEO · Ari/GPT · Claude · Mail · Scheduled Tasks“, 07.11.2026 (`SOURCE-BOUND`, im Chat übergeben, nicht als Datei im Repository)
**Branch:** `ccr-434fe282-8tq4ah` (von der Sitzungsumgebung vorgegeben; weicht von den Präfixen in AGENTS.md ab, siehe Blocker B8)
**Status:** `DRAFT · PENDING INDEPENDENT REVIEW` · kein Freeze, keine Produktivfreischaltung
**Vorgänger:** ADR-0002; Laufzeitstand `/opt/thechat` @ `81d5248`
**Nächster zulässiger Schritt:** Review dieses Handoffs und von ADR-0003, danach Johannes' Entscheidung über die P0-Patches auf Server B

## 1. Ergebnis in einem Satz

Vertrag und getestete Referenzimplementierung für Conversation Bus, Governed Task Queue, Scheduler, Claude- und GPT-Executor sowie Mail-Gate liegen vor, mit 55 von 55 Tests grün und realem DENY-, Replay-, Widerrufs- und Mehrprozess-Nachweis auf Modulebene. **Auf Server B wurde nichts verändert.** Die Leitfrage ist damit nur auf Modulebene beantwortet. Die Wirkung im Produktivsystem ist **nicht** nachgewiesen.

## 2. Live-Verifikation Server B (2026-11-07, ca. 15:28 UTC)

| Prüfpunkt | Befund | Status |
|---|---|---|
| Host / Benutzer | `ubuntu-4gb-nbg1-1` / `jo` | verifiziert |
| Repository / Branch / HEAD | `/opt/thechat`, `main`, `81d5248` „fix: openrouter model + no anthropic-only guard“ | verifiziert |
| Git-Arbeitsbaum | 40 × `M`, 10 × `D`, 423 × `??`; 9 Verzeichnisse für `jo` nicht lesbar (`deploy/`, `data/conferences/`, `data/telegram_runtime/`, `data/tts-cache/`, `data/newsroom/`, `data/topic-twins/`, `private/qa-workbooks/files|orders/`, `codex/agent-factory/storage/research-circle-v1/`) | verifiziert; nicht lesbare Bereiche `unknown` |
| Room-Server | `node apps/console/api/server.js` **zweimal**: PID 499021 (`nyxa`, seit 8 Tagen), PID 3482037 (`root`, seit 19 Tagen); `127.0.0.1:3000` lauscht einmal | Doppelprozess verifiziert, Rolle des zweiten `unverified` |
| n8n | Docker `n8n` 2.37.11 plus Host-Prozess `node /usr/local/bin/n8n` (User `jo`); `127.0.0.1:5678`; 106 Workflows über MCP sichtbar | verifiziert; Doppelbetrieb Docker/Host `unverified` |
| Temporal | Director-Workflow-Code vorhanden; Port 7233/8233 lauscht nicht | Director derzeit nicht ausführbar (`unverified`, ein entfernter Temporal-Server ist möglich) |
| NYXA-MCP | Connector `nyxa_mcp` in dieser Sitzung nicht verbindbar (ProtocolError) | Arbeitsbahnhof-Freigaben **nicht** live verifiziert |
| Gmail | Connector verlangt eine neue Anmeldung | Sophia-Alias, Postfach und Leserecht **nicht** verifiziert |
| Mailer | `apps/console/api/mailer.js`: nur SMTP-Versand (Standard `smtp.ionos.de`, Absender-Standard `info@future24.eu`), kein Lesepfad | verifiziert |
| Node | v22.23.3 (`node:sqlite` verfügbar) | verifiziert |
| Parallelarbeit | `git worktree list`: nur Hauptbaum; `/opt/nyxa-worktrees/hostile-quorum-20260928` (Benutzer `nyxamcp`); `server.js` gehört `sentinelx`, `room.html` gehört `jo`, beide zuletzt am 2026-10-16 16:15 UTC geändert | keine aktive Parallelarbeit in den letzten Wochen erkennbar; `unverified` für nicht lesbare Bereiche |

## 3. Reconciliation-Matrix (P0)

Es wurde nichts gelöscht, restauriert oder committet. Die Erhaltungsentscheidung ist ein **Vorschlag**.

| Pfad / Gruppe | Git-Status | Funktion | Abhängigkeiten | Vorschlag | Evidenz |
|---|---|---|---|---|---|
| `apps/api/{Dockerfile,index.js,package*.json,llm/claude.js,llm/openai.js,prompts/rooms.js,video/router.js,video/runway.js}` (9) | `D` | alter API-Stand aus dem Initialcommit | keine Referenz in `ecosystem.config.cjs` oder `package.json` | Löschung committen (Archiv ist byte-identisch) | SHA-256-Präfixe HEAD = Archiv, z. B. `index.js` `eab8b94cbbea` |
| `apps/api/llm/router.js` | `D` | wie oben | wie oben | Löschung committen; die Archivversion ist **neuer** als HEAD (`1a6935ed…` ≠ `b96f95e0…`) und bleibt im Archiv erhalten | Hashvergleich |
| `apps/api.archived.20260401_191859/` | `??` | Archiv, `ARCHIVED.txt`: „Orphan code, superseded by apps/console/api“ | keine | behalten bis zur Entscheidung; optional außerhalb des Repos sichern und dann entfernen | `ARCHIVED.txt` |
| `apps/api/media/` | `??` | Medienmanifeste | referenziert von `apps/console/api/bbs-v2/services/phone-agent-service.js`, `data/bbs/task-queue.json` | **behalten**; aktiv | grep |
| `apps/console/api/server.js`, `apps/dashboard/room.html` und 38 weitere `M`-Dateien | `M` | produktiver Laufzeitcode | live ausgeliefert | **behalten**; nach Review als eigener Commit „reconcile runtime state“ sichern; **nicht** durch `81d5248` oder den März-Commit ersetzen | mtime 2026-10-16; Room-Oberfläche laut Ausgangshandoff per SHA-256 gegen die Auslieferung abgeglichen |
| `data/*.json`, `data/nyxa.sqlite`, `data/books/*/events.jsonl`, `apps/memory/memoryStore.json`, `codex/agent-factory/storage/*` | `M`/`??` | Laufzeitdaten | Dienste | **unangetastet**; aus Git herausnehmen (`git rm --cached` plus `.gitignore`) erst nach Backup und Entscheidung | Klassifikation nach Pfad |
| `*.bak`, `*.before-*.bak`, `ecosystem.config.cjs.bak*`, `music-proxy.cjs.bak*`, `scripts/test-dispatch.mjs.before-*.bak` (≥ 20) | `??` | manuelle Sicherungen | keine | nach Hash-Inventar außerhalb des Repos archivieren, dann entfernen | Dateinamen |
| `tmp_regex_*.mjs`, `tmp_guard_check.mjs`, `v2_delayed_bleed_check.mjs` | `??` | Einmalprüfungen | keine bekannt | Entfernung vorschlagen | Dateinamen |
| `*_REPORT_V1.md`, `KNOWN_ISSUES.md`, `PM2_RUNTIME_RULES_V1.md`, `SERVER_MAP.json`, `handoffs/` | `??` | Betriebs- und Reparaturberichte | Dokumentation | als Evidenz ins Kernel-Repository übernehmen (Manifest), danach im Laufzeit-Repo committen | Dateinamen |
| `private/qa-workbooks/{signing.key,download.key,signing.pub}` | `??` (Verzeichnis) | Schlüsselmaterial | QA-Workbook-Fulfillment (n8n `QAWorkbookPaidFulfillmentV1` aktiv) | **nicht** committen; nach `/opt/nyxa-secrets` oder in den Vault verschieben, nur nach Klärung | Dateinamen; Inhalt nicht gelesen |
| `agents/`, `apps/agent-runtime/`, `modules/`, `lib/`, `schemas/`, `integrations/`, `capabilities/`, `apps/console/api/*.cjs` (74 Einträge) | `??` | vermutlich aktiver, nie committeter Code | teils von `server.js` per `require` geladen (z. B. `companion-router.cjs`, `capabilities/customer-care/routes.cjs`) | **behalten**; Abhängigkeitsgraph per `node --trace-deps` oder `require.cache`-Dump ermitteln, dann committen | `server.js:66–72`, `server.js:470` |
| nicht lesbare Verzeichnisse (9) | unbekannt | unbekannt | unbekannt | `unknown`, unangetastet | Permission denied |

Die vollständige Pfadliste (473 Einträge) ist reproduzierbar mit `git -C /opt/thechat status --porcelain`. Sie wurde nicht ins Repository übernommen, weil Pfadnamen unter `data/` personenbezogene Bezüge enthalten können.

## 4. Abnahmematrix

„Modul“ bedeutet: nachgewiesen durch automatisierten Test der Referenzimplementierung. „Produktiv“ bedeutet: Wirkung auf Server B nachgewiesen. Ein Unit-Test ist **kein** Wirkungsnachweis.

| Test | Modul | Produktiv | Test |
|---|---|---|---|
| Text → Sophia Live (exakter Text abrufbar, zweiter Kritikpunkt) | ✅ Bus und Tool-Ebene | ❌ Realtime-Kopplung fehlt | `conversation-bus.test.cjs` |
| Voice → Room | ✅ | ❌ | dto. |
| Reconnect ohne Kontextverlust | ✅ | ❌ | dto. |
| Claude DIRECT, genau ein Auftrag | ✅ (Fake-Adapter) | ❌ kein Key und kein Modell konfiguriert | `task-queue.test.cjs` |
| Claude HOURLY, nur fällige und freigegebene Jobs | ✅ | ❌ | `task-queue`, `scheduler` |
| Claude DAILY, Zeitzone und Sommerzeit | ✅ | ❌ | `scheduler.test.cjs` |
| Zwei Worker, kein Doppelclaim | ✅ 4 OS-Prozesse, 30 Aufträge | ❌ | `multiprocess.test.cjs` |
| Approval verweigert | ✅ | ❌ | `task-queue` |
| Approval widerrufen (auch während der Ausführung) | ✅ | ❌ | `task-queue` |
| E-Mail lesen, korrekter Thread | ✅ Fake-Provider | ❌ kein Provider-Adapter; Alias unverifiziert | `mail-gate.test.cjs` |
| Versand ohne Freigabe: DENY | ✅ | ❌ | dto. |
| Prompt Injection in Mail | ✅ | ❌ | dto. |
| GPT-Delegation mit Provenienz | ✅ | ❌ | `task-queue` |
| Neustart: Aufträge konsistent | ✅ | ❌ | `task-queue` |
| Kostenlimit (Auftrag und Tag) | ✅ | ❌ Preise `unknown` | `task-queue` |
| Audit korrelierbar | ✅ | ❌ | `task-queue` |
| Endpunkte authentifiziert | ✅ `/api/v2/*` | ❌ **S1–S5 offen** | `http-api.test.cjs`, `docs/P0_SERVER_B_PATCH_PROPOSAL.md` |

Lauf: `cd modules/sophia-unified-room && npm test` ergibt `tests 55, pass 55, fail 0` (Node v22.23.4, 2026-11-07).

## 5. Offene Blocker

- **B1 (P0, Sicherheit):** S1–S5 sind ungeschützte Room-Endpunkte auf Server B. Ein Patchvorschlag liegt vor; die Anwendung braucht Johannes' Freigabe und eine Prüfung der Aufrufer (Hilarion-Café-Bridge).
- **B2:** Doppelter `server.js`-Prozess (S8): Vor jedem Deploy klären, welcher Prozess maßgeblich ist.
- **B3:** Die NYXA-MCP-Policy und die Arbeitsbahnhof-Freigabe sind nicht live verifiziert (Connector-Fehler). Die vorhandene Sperre bleibt unverändert.
- **B4:** Mail: Alias-Adresse, Domain, Provider, Weiterleitung und Leserecht sind `unverified` (Gmail-Neuanmeldung nötig). Ein Provider-Adapter fehlt.
- **B5:** Modell-IDs und Preise für Claude und Ari sind nicht festgelegt. Ohne Preise verweigert der Worker die Ausführung (gewollt).
- **B6:** Realtime-Kopplung in `room.html` ist nicht implementiert (Schritte im Patchvorschlag, Abschnitt 3).
- **B7:** Die Anbindung an α/β/γ, D1–D7, I0–I3, E0 und Capability Gate ist offen. Die Schnittstellen sind nicht verifiziert.
- **B8:** Branchname `ccr-434fe282-8tq4ah` entspricht nicht den Präfixen in AGENTS.md (`agent/` usw.). Er wurde von der Sitzungsumgebung vorgegeben. Nach Johannes' Vorgabe auf `agent/…` umbenennen.
- **B9:** Für dieses Repository gibt es keine CI. Gemäß ADR-0002 wird keine zweite CI-Pipeline eingeführt. Die Tests müssen in die bestehende Runtime-CI aufgenommen werden, sobald das Ziel-Repository entschieden ist.
- **B10:** Konfliktpunkt nach AGENTS.md: Der Handoff verlangt „keine ungefragten Commits oder Pushes“, die Sitzungsvorgabe verlangt Commit und Push auf den Arbeitsbranch. Aufgelöst wurde das so: Commit und Push nur in `nyxa-kernel` auf den Feature-Branch, kein Commit auf Server B und kein Merge.

## 6. Vollständige Dateiliste dieses Handoffs

Hashes stehen in `handoffs/2026/11/2026-11-07_CLAUDE_SOPHIA_UNIFIED_ROOM_MANIFEST.yaml`.

- `decisions/ADR-0003_SOPHIA_UNIFIED_ROOM_AND_GOVERNED_TASK_QUEUE.md`
- `handoffs/2026/11/2026-11-07_CLAUDE_SOPHIA_UNIFIED_ROOM_HANDOFF.md`
- `handoffs/2026/11/2026-11-07_CLAUDE_SOPHIA_UNIFIED_ROOM_MANIFEST.yaml`
- `schemas/unified-room/v0.1/{message,task,executor-config}.schema.json`, `fixtures/task.invalid.json`
- `modules/sophia-unified-room/{README.md,package.json}`
- `modules/sophia-unified-room/src/{db,conversation-bus,task-queue,scheduler,executors,mail-gate,auth,http-api,index}.cjs`
- `modules/sophia-unified-room/bin/worker.cjs`
- `modules/sophia-unified-room/ui/task-panel.html`
- `modules/sophia-unified-room/docs/{CONTRACT,BETRIEBSHANDBUCH,P0_SERVER_B_PATCH_PROPOSAL}.md`
- `modules/sophia-unified-room/test/{helpers,conversation-bus,task-queue,scheduler,mail-gate,auth,http-api,multiprocess,schema-conformance}*.cjs`

## 7. Reviewziel

Unabhängige Review (Ari/GPT oder ein Mensch) von ADR-0003, `docs/CONTRACT.md` und `src/task-queue.cjs`, insbesondere der Übergangstabelle, `authorizeEffect` und `expireLeasesInTx`. Danach entscheidet Johannes über B1, B2 und B5.
