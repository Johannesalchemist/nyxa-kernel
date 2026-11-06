# Bridge E2E Governance Test Pack (Entwicklungsstand)

## Metadaten (Herkunftspflicht gemäß AGENTS.md)

- Autor / verantwortlicher Mensch: Johannes Süß (Freigabe Skriptentwicklung)
- erzeugendes System und Modell: Claude (Claude Code Session, nyxa-kernel Repository)
- Sitzungsdatum: 2026-11-06, Zeitzone CET
- verwendete Quellen: `AGENTS.md`, `KNOSPEL.md`, `governance/REPOSITORY_POLICY_V0.1.md`,
  `decisions/ADR-0001_CANONICAL_NYXA_REPOSITORY.md`, `decisions/ADR-0002_MULTI_AGENT_CONFLICT_GOVERNANCE.md`,
  Arbeitsauftrag des Nutzers vom 2026-11-06 (Chat, nicht im Repository verankert — siehe Offene Punkte).
- Status der Quellen: Repository-Dateien `SOURCE-VERIFIED` (im Repo vorhanden, gelesen). Der Arbeitsauftrag selbst ist
  `UNVERIFIED` im Sinn der Policy, da nur als Chat-Text vorliegt und hier erstmals schriftlich verankert wird.
- epistemischer Status: `DRAFT`
- Reviewstatus: `IN_REVIEW` — noch keine unabhängige Prüfung erfolgt.
- bekannter Vorgänger: keiner im Repository (erster Bridge-E2E-Testartefakt). Vorherige Sessions zu
  „arbeitsbahnhof.crm.test_upsert"-Canary und „Step 8 / e2e-enforcement-canary" sind **nicht** im Repository
  dokumentiert und werden hier nicht referenziert, da sie außerhalb dieses kanonischen Repositorys liefen und keine
  verifizierbare Herkunft hierher haben.
- nächster zulässiger Schritt: siehe `handoffs/2026/11/2026-11-06_CLAUDE_BRIDGE_E2E_SCRIPT.md`.

## Zweck

Dieses Paket enthält ein entwicklungsfertiges, **noch nicht produktiv ausgeführtes** Testskript, das die
tatsächliche Durchsetzung der NYXA-Governance an einer laufenden MCP-Bridge nachweisen soll — nicht nur die
Erreichbarkeit der Verbindung.

## Geltender Freigabestatus

- Skriptentwicklung: **JA** (dieses Paket).
- Produktive Ausführung: **NEIN**.
- Empfehlung an der Schnittstelle zu produktiven Systemen: **HOLD**, keine Teilfreigabe.
- E1 (Lock-/Nebenläufigkeitsnachweis) und E2 (erzwungener Audit-Schreibfehler) sind explizite Freigabeblocker.
  Ein grüner Bridge-Testlauf hebt HOLD **nicht** auf, solange E1 und E2 nicht wirksam nachgewiesen sind.

## Bestandteile

| Datei | Zweck |
| --- | --- |
| `bridge_e2e_test.mjs` | Das eigentliche Testskript (Node.js, keine Fremdabhängigkeiten). |
| `RUN_INSTRUCTIONS.md` | Ausführungsanweisung für `sentinelx` bzw. `nyxamcp` auf dem Zielsystem. |
| `EXPECTED_EVIDENCE.md` | Schema der erwarteten Evidenzartefakte je Testfall. |
| `PREFLIGHT_CHECKLIST.md` | Prüfpunkte, die vor jeder Ausführung bestätigt werden müssen. |

## Nicht in diesem Paket enthalten (bewusst offen)

- Kein Nachweis der Runtime-Identität (aktiver MCP-Prozess, Startkommando, geladener Runtime-Pfad) — das erfordert
  Live-Zugriff auf das Zielsystem, der in der Session, die dieses Paket erzeugt hat, nicht bestand.
- Kein SHA-256-Vergleich von `AuditLog.js` zwischen Runtime und Dev — aus demselben Grund `unknown`.
- Kein Nachweis eines prozessübergreifenden Locks — `unknown`, muss am Zielsystem geprüft werden, siehe
  `PREFLIGHT_CHECKLIST.md` Punkt 1.
- Keine tatsächliche Ausführung von E2 (absichtlicher Audit-Schreibfehler) — als Testfall vorbereitet, aber per
  Default deaktiviert und durch einen zweiten expliziten Schalter plus Host-Allowlist geschützt.
