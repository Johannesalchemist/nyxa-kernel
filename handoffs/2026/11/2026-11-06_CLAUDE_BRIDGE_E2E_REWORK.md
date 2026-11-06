# HANDOFF: Claude → Jo — Bridge E2E Rework (Remediation, Verification & Adversarial Review)

**Datum:** 2026-11-06, CET
**Autor / erzeugendes System:** Claude (Claude Code Session, Repository `Johannesalchemist/nyxa-kernel`,
Branch `agent/claude-bridge-e2e-script-20261106`)
**Verantwortlicher Mensch:** Johannes Süß (jo@future24.eu)
**Bekannter Vorgänger:** `handoffs/2026/11/2026-11-06_CLAUDE_BRIDGE_E2E_SCRIPT.md` (Commit `eeceb26`)
**Status:** `DRAFT` / `IN_REVIEW`
**Quelle des Arbeitsauftrags:** "WORK HANDOFF → CLAUDE: NYXA Bridge-E2E: Remediation, Verification & Adversarial
Review", 06.11.2026, auf Basis von Live-Prüfung auf Server B und Red-Team-Review (Chat, nicht im Repository
verankert — Status `UNVERIFIED` im Sinn der Policy, da nur als Text vorliegt; hiermit erstmals schriftlich
übernommen).

## 1. Git- und Arbeitsbaumstatus (Phase A/Abschlussantwort §1)

- Branch: `agent/claude-bridge-e2e-script-20261106`, Ausgangscommit `eeceb26`.
- Vor Beginn geprüft: `git status` clean, `git fetch` gegen `origin/agent/claude-bridge-e2e-script-20261106`
  zeigte keine Divergenz — keine parallele Aktivität auf diesem Branch.
- Diese Session hatte **keinen** Live-Zugriff auf Server B (`ubuntu-4gb-nbg1-1`), kein `nyxa_mcp`-Connector
  verbunden, kein SSH/Tailscale-Pfad. Die in Abschnitt 2 des Arbeitsauftrags gelieferte Live-Evidenz
  (SentinelX-Host-ID, Bridge-Service, AuditLog-Hashes) wurde daher **nicht erneut live verifiziert**, sondern
  als vom Auftraggeber bereits verifizierter Snapshot übernommen und NICHT eigenständig nachgeprüft. Das ist
  eine Lücke gegenüber Phase A ("aktuelle Git- und System-Evidenz erneut lesen") — ehrlich benannt statt verdeckt.

## 2. Korrigierte/ergänzte Dateien (Abschlussantwort §2)

| Datei | Änderung |
| --- | --- |
| `schemas/bridge-e2e/bridge_e2e_test.mjs` | Neu strukturiert: nutzt `lib/*`, T01/T04/T05/T07/T09/T10 korrigiert (siehe §3), E1-Plan-Stub ergänzt, Preflight auf `lib/preflight.mjs` ausgelagert. |
| `schemas/bridge-e2e/lib/transport.mjs` | **Neu.** `StdioTransport`, `HttpTransport` (Streamable-HTTP: Session-Header statt Body-Feld, `notifications/initialized`, HTTP DELETE zum Schließen), `MockTransport` für Selbsttests. |
| `schemas/bridge-e2e/lib/audit_chain.mjs` | **Neu.** Genesis-Anker-Prüfung, Content-Hash-Verifikation über optional geladene reale Hash-Funktion (`loadRealHashFn`), sonst explizit `unverified_unknown_serialization`. |
| `schemas/bridge-e2e/lib/preflight.mjs` | **Neu.** Strukturierte Attestation-Validierung (7 Pflichtfelder) statt Freitext-Nichtleer-Prüfung. |
| `schemas/bridge-e2e/lib/selftest.mjs` | **Neu.** Führt T01–T10 gegen `MockTransport` aus, echte Genesis-Audit-Kette, tatsächlich ausgeführt (nicht nur `node --check`). |
| `schemas/bridge-e2e/README.md`, `RUN_INSTRUCTIONS.md`, `PREFLIGHT_CHECKLIST.md`, `EXPECTED_EVIDENCE.md` | Aktualisiert auf v2-Struktur (strukturierte Attestation, `lib/`, Selbsttest-Schritt, T10-Fixtureliste). |
| `.gitignore` | Ergänzt: `schemas/bridge-e2e/bridge-e2e-evidence/` (lokale Laufausgabe, kein kanonischer Repository-Inhalt). |

## 3. Testergebnisse je Testfall

**Wichtig:** Diese Ergebnisse stammen aus `node lib/selftest.mjs` gegen `MockTransport` — eine lokale
In-Prozess-Simulation, **keine** Verbindung zu Server B oder der realen Bridge. Sie belegen, dass der
Testharness selbst korrekt funktioniert, nicht, dass die reale Bridge die Governance durchsetzt.

| Testfall | Ergebnis (Selbsttest, MockTransport) | Anmerkung |
| --- | --- | --- |
| T01 | PASS | Session-ID aus `sessionHeader`, `notifications/initialized` gesendet. |
| T02 | PASS | Tool-Katalog nicht leer, fehlerfrei. |
| T03 | PASS | Transport-/MCP-/Tool-Ebene getrennt ausgewiesen. |
| T04 | PASS | Ablehnung + kein Marker im Audit (im Mock real geprüft). |
| T05 | PASS | Echter `closeSession()`-Aufruf, Folgeaufruf abgelehnt. |
| T06 | **UNJUDGED** (`pass: null`) | Kein dokumentierter Session-Vertrag der realen Zielimplementierung verfügbar — bewusst nicht erfunden. |
| T07 | PASS | Getrennte Session-IDs, keine Marker-Kreuzkontamination im Audit. Lock-Korrektheit selbst **nicht** behauptet. |
| T08 | PASS (Verkettung + Genesis-Anker) | Content-Hash-Integrität: `unverified_unknown_serialization`, da kein `BRIDGE_E2E_AUDITLOG_MODULE_PATH` im Selbsttest gesetzt war (im Mock wird die eigene Serialisierung verwendet, das ist zirkulär und beweist nichts über die reale Implementierung). |
| T09 | PASS (nach Fix) | **Ursprünglich FAIL**, real beobachtet: T09 nutzte die in T05 bereits geschlossene äußere Session, wurde daher als `closed_session` statt `unknown_tool` abgelehnt, Marker nie auditiert. Fix: eigene frische Session für T09. Nach Fix erneut ausgeführt, PASS, Report archiviert. |
| T10 | PASS | 7 Fixtures (Positivkontrolle + 6 gezielte Manipulationen), jeweils exakter erwarteter `reason`-Code geprüft. |
| E1 | BLOCKED (Plan nur vorbereitet) | Kein Lesezugriff auf den realen `AuditLog.js`-Quelltext in dieser Session — Simulation ohne ihn wäre Erfindung, keine Verifikation. |
| E2 | NOT EXECUTED (gesperrt) | Wie vorgegeben: zwei unabhängige Schalter + fehlende Fault-Injection-Spezifikation für die reale Implementierung. |

Rohbericht des Selbsttests liegt in der Session-Scratchpad-Umgebung
(`.../scratchpad/bridge-e2e-selftest-evidence/selftest/selftest-report.json`), nicht im Repository — siehe
`.gitignore`-Ergänzung in §2. Bei Bedarf kann der Lauf jederzeit reproduziert werden: `node lib/selftest.mjs`.

## 4. Hash- und Session-Prüfungen — Belege

- `node --check` auf allen fünf `.mjs`-Dateien: erfolgreich (reiner Syntaxnachweis).
- `node lib/selftest.mjs`: tatsächlich ausgeführt, zwei Durchläufe (vor und nach dem T09-Fix), Exit-Code 1 dann
  0, Ergebnisse in §3.
- Direkter Lauf von `bridge_e2e_test.mjs` ohne Zielkonfiguration: **PREFLIGHT FAILED**, Exit-Code 2 — bestätigt
  Fail-Closed-Verhalten bei fehlender Konfiguration.
- Direkter Lauf mit unvollständiger Attestation-Datei (nur `hostIdentity` gesetzt): **PREFLIGHT FAILED**, listet
  alle sechs fehlenden Felder einzeln auf — bestätigt, dass die strukturierte Attestation-Prüfung tatsächlich
  greift, nicht nur die alte Nichtleer-Prüfung.
- Direkter Lauf mit vollständiger Attestation, aber unerreichbarem HTTP-Endpunkt: Preflight **bestanden**,
  anschließender Verbindungsfehler bricht den Prozess mit `FATAL`/Exit-Code 1 ab — kein stilles PASS bei
  Netzwerkfehlern.
- Reale `AuditLog.js`-SHA-256-Werte aus dem Arbeitsauftrag (`3f15065...` Runtime, `00aaab3...` Dev) wurden **in
  dieser Session nicht gegenprüft** — kein Dateizugriff auf Server B. Sie werden hier nur zitiert, nicht
  verifiziert.

## 5. E1/E2/E3-Bewertung mit verbleibenden Risiken

- **E1 (Cross-Process Lock):** Nicht nachgewiesen, nicht widerlegt. Der im Arbeitsauftrag beschriebene
  Lock-Mechanismus (`open(...,"wx")`, 30s Stale-, 10s Acquire-Timeout) liegt als Quellcodebefund vor, wurde aber
  in dieser Session nicht gelesen und nicht adversarial getestet. Risiko bleibt offen: Stale-Lock-Reclamation
  unter echter Konkurrenz ist unbewiesen.
- **E2 (Audit Fail-Closed):** Nicht nachgewiesen, nicht widerlegt. Der im Arbeitsauftrag benannte Unterschied
  (Runtime wirft Exception bei Audit-Fehler, Dev verschluckt `audit_append_failed`) ist ein **Quellcodebefund
  des Auftraggebers**, nicht in dieser Session verifiziert. Selbst eine propagierte Exception in der Runtime
  beweist laut Arbeitsauftrag allein kein Enforcement — das bleibt richtig und unverändert offen.
- **E3 (Ledger Integrity):** Teilweise adressiert. `lib/audit_chain.mjs` prüft jetzt Genesis-Anker und (wenn
  eine reale Hash-Funktion geladen wird) Content-Integrität getrennt von Verkettungs-Konsistenz. Der externe
  Ledger-Anker aus v1 bleibt bestehen, ist aber weiterhin **selbst erzeugt und selbst gehalten** — er ist kein
  unabhängiger Vollständigkeitsnachweis im strengen Sinn des Arbeitsauftrags (§5, E3), sondern nur ein
  Manipulationsindikator für den Bericht selbst. Ein echter externer, vom Testskript getrennter Anker (z.B.
  signiert von einer dritten Instanz) existiert nicht und wurde nicht gebaut — außerhalb des Scopes dieser
  Session ohne weitere Vorgabe, wie ein solcher Anker aussehen soll.

## 6. Status der produktiven Bridge (separat, Abschlussantwort §6)

Nicht neu erhoben. Die im Arbeitsauftrag (Abschnitt 2) gelieferten Werte (`nyxa-claude-mcp-bridge.service`,
Port `39281`, `HTTP HEAD /mcp` → `400 Bad Request`, Audit-Verzeichnis
`/opt/nyxa-governed-memory-mcp-runtime/data-claude-epoch-20261106`) werden unverändert als Snapshot des
Auftraggebers übernommen. Diese Session hat sie nicht erneut geprüft und kann daher nicht bestätigen, ob sie
weiterhin gelten.

## 7. Offene Freigabevoraussetzungen (Abschlussantwort §7)

1. E1 und E2 bleiben unverändert Freigabeblocker — durch diesen Rework nicht aufgehoben.
2. Lesezugriff auf den realen `AuditLog.js`-Quelltext (Runtime und Dev) in einer Session mit Zielsystemzugriff,
   damit T08 Content-Integrität tatsächlich prüfen kann (`BRIDGE_E2E_AUDITLOG_MODULE_PATH`) und E1 adversarial
   simuliert werden kann, ohne den Lock-Mechanismus zu erfinden.
3. Klärung, was als "unabhängiger vertrauenswürdiger Ledger-Anker" im Sinn von E3 akzeptiert wird — der
   aktuelle `externalLedger` ist nur ein Selbstkonsistenz-Indikator, kein externer Anker.
4. Bestätigung des tatsächlichen Streamable-HTTP-Vertrags der installierten Bridge (Header-Name, DELETE-
   Semantik) gegen echten Verkehr, bevor `bridge_e2e_test.mjs` gegen eine isolierte Instanz läuft — die
   aktuelle Transport-Implementierung beruht auf einer dokumentierten, nicht live verifizierten Annahme.
5. Dokumentierter Session-Vertrag der Zielimplementierung, damit T06 ein echtes Urteil statt `UNJUDGED` liefern
   kann.

## 8. Autorisierungsgrenzen — eingehalten

- Keine Verbindung zu Server B oder einer produktiven Bridge wurde versucht.
- Keine Produktionsdaten, keine Dienste, keine Konfiguration verändert.
- E2 wurde nicht ausgeführt (`executed: false`), E1 nur als Plan dokumentiert, nicht simuliert.
- Kein Merge nach `main`. Alle Änderungen bleiben auf `agent/claude-bridge-e2e-script-20261106`.
- Commit erfolgt auf diesen bestehenden Branch (laut Autorisierungsgrenzen §9 erlaubt: "Änderungen am
  bestehenden `agent/`-Branch"). **Push/externe Veröffentlichung erfolgt NICHT automatisch** — Abschnitt 9 des
  Arbeitsauftrags verlangt Abgleich mit dem Human-Authority-Protokoll vor jeder weiteren Veröffentlichung;
  dieser Abgleich liegt bei Jo, nicht bei dieser Session.

## 9. Nächster zulässiger Schritt

1. Review dieses Rework-Pakets durch Jo.
2. Push auf `origin/agent/claude-bridge-e2e-script-20261106` erst nach expliziter Freigabe (siehe §8).
3. Beschaffung von Lesezugriff auf `AuditLog.js` (Runtime + Dev) für eine Folgesession, um T08-Content-
   Integrität und E1-Simulation auf echter Grundlage statt Annahme durchzuführen.
4. Klärung E3-Ankeranforderung (§5/§7 Punkt 3).
5. Erst danach: isolierter Bridge-E2E-Lauf gegen eine echte, isolierte Instanz zur gesonderten Freigabe.

**NYXA bleibt HOLD. Keine implizite Teilfreigabe durch diesen Rework.**
