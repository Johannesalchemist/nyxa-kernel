# HANDOFF: Claude → Jo — Bridge E2E Governance Test Pack (Skriptentwicklung)

**Datum:** 2026-11-06, CET
**Autor / erzeugendes System:** Claude (Claude Code Session, Repository `Johannesalchemist/nyxa-kernel`,
Branch `agent/claude-bridge-e2e-script-20261106`)
**Verantwortlicher Mensch:** Johannes Süß (jo@future24.eu)
**Empfänger:** Jo
**Status:** `DRAFT`

## 1. Zweck

Auftrag: ein Bridge-E2E-Testskript erstellen, das nicht nur die Verbindung zu einer NYXA-MCP-Bridge prüft,
sondern die tatsächliche Durchsetzung der Governance (Audit-Hashkette, Session-Vertrag, Scope-Isolation,
Fail-Closed-Verhalten) nachweist. Freigabe lautete ausdrücklich: Skriptentwicklung JA, produktive Ausführung
NEIN.

## 2. Was geliefert wurde

Unter `schemas/bridge-e2e/`:

- `README.md` — Zweck, Freigabestatus, Herkunft.
- `PREFLIGHT_CHECKLIST.md` — manuell zu bestätigende Prüfpunkte vor jeder Ausführung.
- `bridge_e2e_test.mjs` — das Testskript selbst (Node, keine Fremdabhängigkeiten, Syntax geprüft mit
  `node --check`, nicht gegen eine echte Bridge ausgeführt).
- `RUN_INSTRUCTIONS.md` — Ausführungsanweisung für `sentinelx`/`nyxamcp`.
- `EXPECTED_EVIDENCE.md` — Schema der erwarteten Evidenzartefakte je Testfall, inklusive Definition des
  externen Ledger-Ankers.

Das Skript deckt alle zehn angeforderten Testfälle (T01–T10 in `bridge_e2e_test.mjs`) sowie einen vorbereiteten,
nicht ausgeführten E2-Stub ab. T06 (wiederholte Session-Nutzung) liefert bewusst `pass: null` statt eines
erfundenen Urteils, da der Session-Vertrag der Zielimplementierung in dieser Session nicht verifiziert werden
konnte.

## 3. Was NICHT geliefert wurde (Punkt 1 des Arbeitsauftrags)

Der Arbeitsauftrag verlangte vorab:

- aktiven MCP-Prozess, Startkommando und geladenen Runtime-Pfad feststellen,
- SHA-256 von `AuditLog.js` in Runtime und Dev vergleichen,
- prüfen, ob die aktive Implementierung einen prozessübergreifenden Lock verwendet.

Status: **`unknown` / `unverified`**. Diese Session hatte keinen Live-Zugriff auf das Zielsystem (kein
`nyxa_mcp`-Connector verbunden, kein SSH/Tailscale-Pfad zum produktiven Host). Es wurde bewusst **keine**
Rekonstruktion aus früheren Chat-Angaben vorgenommen — frühere Session-Berichte zu Hashes/Hosts sind laut
AGENTS.md keine ausreichende Evidenz für den aktuellen Zustand.

Diese drei Punkte sind Voraussetzung für `PREFLIGHT_CHECKLIST.md` Punkt 1 und müssen von einem Menschen oder
einer Session mit tatsächlichem Zielsystemzugriff nachgeholt werden, bevor das Skript ausgeführt wird.

## 4. Sicherheitsgrenzen — eingehalten

- Keine Verbindung zu einem produktiven System wurde versucht oder simuliert.
- Keine Pfade zu `data/`, `data-claude-bridge/`, `data-tunnel/`, `data-tunnel-v2/` sind im Skript enthalten; der
  Preflight-Guard bricht zusätzlich ab, falls eine Zielkonfiguration diese Fragmente referenziert.
- E2 ist als Testfall vorbereitet, aber durch zwei unabhängige Umgebungsvariablen gesperrt
  (`BRIDGE_E2E_ENABLE_E2`, `BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF`) und durch den Preflight-Guard zusätzlich
  geprüft.
- Test-Audit-Schreibwirkungen sind über `correlationId = bridge-e2e:<uuid>` scope-isoliert und sollen laut
  `PREFLIGHT_CHECKLIST.md` nur gegen eine isolierte Zielinstanz laufen, nie gegen den produktiven Prozess.

## 5. Offene Blocker

1. Runtime-Identität/Lock-Nachweis (Abschnitt 3) — `unknown`, blockiert jede Ausführung bis geklärt.
2. E1 (prozessübergreifender Lock) und E2 (erzwungener Audit-Schreibfehler) sind weiterhin nicht nachgewiesen —
   dies ist laut Architekturentscheidung ein Freigabeblocker, unabhängig vom Ausgang eines Bridge-Testlaufs.
3. T06-Verhalten (Session-Vertrag) ist am Zielsystem noch nicht gegen eine dokumentierte Spezifikation geprüft.
4. Transportdetails (`BRIDGE_E2E_CMD` vs. `BRIDGE_E2E_ENDPOINT`, tatsächlicher I0-Tool-Name) sind Platzhalter und
   müssen am Zielsystem durch den ausführenden Menschen konkretisiert werden.

## 6. Nächster zulässiger Schritt

1. Review dieses Pakets (Code-Review des Skripts, Abgleich gegen `PREFLIGHT_CHECKLIST.md`).
2. Durchführung von Abschnitt 1 des Arbeitsauftrags an einer Session mit echtem Zielsystemzugriff; Ergebnis als
   `BRIDGE_E2E_TARGET_ATTESTATION` dokumentieren.
3. Erst danach: Ausführung ausschließlich gegen eine isolierte Testinstanz, mit Preflight-Checkliste vollständig
   bestätigt.
4. Ergebnis als neuen Handoff unter `handoffs/2026/<MM>/` ablegen; HOLD-Status bleibt bis zu einer expliziten,
   unter `decisions/` dokumentierten Entscheidung in Kraft.

## 7. Commit- und Reviewziel

- Branch: `agent/claude-bridge-e2e-script-20261106`
- Reviewziel: Jo (Entscheider laut ADR-0001/ADR-0002-Muster)
- Validatoren ausgeführt: `node --check schemas/bridge-e2e/bridge_e2e_test.mjs` (Syntax). Kein funktionaler Lauf,
  da kein Zielsystem erreichbar und keine Freigabe für produktive Ausführung vorliegt.
