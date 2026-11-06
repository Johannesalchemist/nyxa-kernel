# Verifikationsbericht V0.2 (Arbeitspakete C und E)

**Status:** `DRAFT — PENDING INDEPENDENT REVIEW`
**Verfasst:** Claude Code, 2026-11-06, Europe/Berlin. Verantwortlich: Johannes Süß.
**Basis:** Branch `agent/runway-characters-v0.2`, abgezweigt von `4179d96` (`claude/runway-dev-setup-c53ss0`).

## 1. Nachweisklassen

| Klasse | Bedeutung | Vorhanden |
| --- | --- | --- |
| M — Mock | reine Funktion oder Mock-Client, beweist lokale Logik | ja |
| I — Integration | echte Express-App über echtes HTTP auf 127.0.0.1, echter Datei-Ledger, **Mock-Runway** | ja |
| S — Smoke | echter Server-Bootstrap (`server.ts`), echter Prozess, kein echter Runway-Key | ja (`evidence/v0.2/smoke-server.txt`) |
| L — Live | echtes Runway-Verhalten | **nein** (nicht freigegeben; siehe `LIVE_TEST_PROTOCOL_V0.2.md`) |
| X — Mutation | Schutzmechanismus in einer Kopie entfernt; Tests müssen fehlschlagen | ja (`evidence/v0.2/mutation-check.txt`) |

Ein Enforcement-PASS setzt voraus, dass die Aktion technisch möglich war und tatsächlich verhindert wurde. Der
Mock kann Sessions anlegen; geprüft wird `mock.creates.length === 0` bzw. ein unveränderter Ledger. Zusätzlich
belegt die Mutation, dass der Test ohne den jeweiligen Mechanismus fehlschlägt.

## 2. Adversariale Testfälle

| ID | Szenario | Erwartung | Ergebnis | Klasse | Mutation (getötet) | Nicht bewiesen |
| --- | --- | --- | --- | --- | --- | --- |
| RW-01 | Connect ohne Authentifizierung; falsches Token; gefälschtes Cookie; Brute Force; kein Token konfiguriert; abgelaufenes Login; fremder Host-/Origin-Header; Formular-POST | DENY | PASS (7 Tests) | I | M06, M07, M08 | Schutz bei öffentlichem Betrieb hinter Proxy/TLS |
| RW-02 | Unbekanntes, nicht erlaubtes oder nicht-String-Preset; Client überschreibt Custom-Avatar | DENY / Server-Avatar gewinnt | PASS (2) | I | M20 | ob Runway die Preset-IDs heute noch akzeptiert |
| RW-03 | Gleicher Idempotency-Key parallel und später; fehlender Key; Burst neuer Keys | genau 1 Session; 409/400; Ratenlimit | PASS (3) | I | M03, M04 | Replay über Neustart: ID bleibt im persistenten Ledger → abgelehnt; In-Flight-Set ist prozesslokal |
| RW-04 | Parallele Starts über dem Limit; Slot wird nach Ende frei | DENY über Limit | PASS (2) | I | M02 | Mehrprozessbetrieb (per Lock ausgeschlossen, siehe RW-12) |
| RW-05 | Budget 0 (Standard); Budget für genau eine Session; Budget über Neustart | DENY | PASS (3) | I | M01, M15 | Übereinstimmung mit der echten Abrechnung (Schätzung!) |
| RW-06 | Runway liefert FAILED; Upstream 4xx/5xx beim Anlegen | kontrollierter 502, Cancel, Reservierung korrekt | PASS (2) | I | M09 | echte Failure-Codes |
| RW-07 | Provisionierungs-Timeout; Client bricht während der Provisionierung ab | 504 + Cancel + Ledger `ended`; keine Credentials | PASS (2) | I | M09, M17 | ob Runway NOT_READY-Sessions abrechnet |
| RW-08 | Credentials nie genutzt; Heartbeat-Verlust; Hard-Cap; fremder Tab ohne Control-Token | Reaper beendet; fremder Tab 404 | PASS (4) | I | M10, M11, M13 | echte WebRTC-Trennungserkennung im Browser |
| RW-09 | Ende doppelt und parallel; Cancel unbestätigt | idempotent, 1 Cancel; `ending` blockiert Slot, Reaper wiederholt | PASS (2) | I | M14 | — |
| RW-10 | API-Key/Token in Antworten, Logs, Audit, Ledger, Bundle; Audit-Redaktion | kein Leak | PASS (3) + Secret-Scan 0 Treffer | I + S | M16 | Browser-DevTools-Logs von Drittbibliotheken |
| RW-11 | Gate liefert ESCALATE / SERIALIZE / NEGOTIATE; Pilotkontext; fehlende Capability | keine Aktion, keine Reservierung | PASS (3) | I | M05 | Anbindung an kanonisches Runtime-Gate (Adapter, nicht verdrahtet) |
| RW-12 | Neustart mit offener Session; fremde laufende Sessions; zweiter Prozess / verwaister Lock | Recovery beendet eigene, meldet fremde, Lock verhindert Parallelbetrieb | PASS (3) + Smoke | I + S | M12, M18, M19 | Absturz zwischen `create` und Ledger-Eintrag (siehe Red Team R3) |

Insgesamt 50 Tests (36 adversarial/Integration, 10 Unit, 4 Konfiguration): 50 PASS, 0 FAIL.
Mutationen: 20/20 getötet.

## 3. Reproduktion

```bash
cd modules/runway-dev-characters
npm ci
npm run verify                    # tsc, vite build, 50 Tests, Secret-Scan
node scripts/mutation-check.mjs   # 20 Mutationen in Temp-Kopien, Arbeitsbaum bleibt unberührt
npm audit
```

Die Ausgaben einer sauberen Reproduktion (frische Kopie, `npm ci`) liegen in `evidence/v0.2/`.

## 4. Unabhängigkeit der Prüfung

Alle Nachweise stammen aus **einer** Agenten-Session (gleiches Modell, gleicher Kontext). Nach ADR-0002 gilt:
`independentCount = 1`. Die saubere Reproduktion ist eine Wiederholung, keine unabhängige Prüfung. Die
**unabhängige Prüfung steht aus** (offener Blocker B2 im Handoff).
