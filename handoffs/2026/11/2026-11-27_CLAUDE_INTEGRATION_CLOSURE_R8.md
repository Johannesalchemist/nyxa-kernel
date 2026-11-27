# Integration Closure R8 (2026-11-27)

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` · R8-Commits ab `69d8fa5` bis zu diesem Bericht |
| Prinzip | Wiederverwendung (Continuity, Strategy Evolution, Kandidatenspeicher, bestehender Sophia-Takt); kein neuer Speicher, Timer oder Dienst |

## 1. Mandate M1–M10 (geprüft)
| # | Stand | Evidenz |
|---|---|---|
| M1 | **offen, Exposition besteht fort** | externe Probe von Server A um 19:10 UTC: zweimal Supabase-`401` |
| M2 | offen; Runbook, Skript und Abnahme bereit | — |
| M3 | offen; Migrationsskript bereit | — |
| M4 | in der Installationskette mit M11 (Observe-Rollout) | — |
| M5 | Room-Identität: Code und Tests bereit; erfordert Erweiterung des Passkey-Dienstes | — |
| M6/M7 | Owner-Entscheidungen (GitHub) | — |
| M8 | offen | — |
| M9 | Budgetentscheidung | — |
| M10 | **vollständig vorbereitet** (siehe 10) | — |
| M11 | Installation bereit; `--check` stoppt korrekt an WP-A1 | R8-P0-Bericht |

Alle offenen Punkte brauchen root bzw. den Owner. Agenten erhalten bewusst keine root-Rechte, auch nicht über den neuen Freigabepfad.

## 2–8. Continuity-Erweiterungen (`modules/cognition/continuity`, Tests 14/14)
- **Positive Erfahrungen:** neue Arten `success` und `cooperation`. Nicht vertrauenswürdige Quellen werden wie bisher herabgestuft.
- **Differenzierte Regression:**
  - `classifyFailure` unterscheidet Strategie, Kontext, Infrastruktur und Autorisierung.
  - Nur Strategiefehler erzeugen Strategie-Regret. Autorisierungsfehler gehen zur Governance-Prüfung und werden **nie** „umlernt“.
- **F-MCC-1 behoben:**
  - Nicht vertrauenswürdige Einträge zu einem Thema mit gültiger vertrauenswürdiger Festlegung werden `held_for_review`.
  - Der Abruf trennt handlungsleitenden Kontext von einem separaten Block „UNVERIFIED – context only, do not act on“.
- **MCC-01 vorbereitet:**
  - System-under-Test und Benchmark sind eingefroren (`FROZEN.json`, v3).
  - Unabhängiger Korpus mit Schema, Mindestumfang und Szenarien, versiegelt und genau einmal gewertet; Übergabe in `HANDOVER-CORPUS.md`.
  - Der interne Korpus wurde nur zur Diagnose erneut gelaufen (D: Präzision 0,97, 0 Vergiftungstreffer). Das ist **nicht** unabhängig, weil die Korrekturen an genau diesem Korpus entstanden.
- **Transfer A→B, real ausgeführt:**
  - **Fehler:** Codex' validierte Korrektur führt dazu, dass Claude eine Scheinabnahme (Namensmuster ohne Treffer) ablehnt. Ohne den Transfer nimmt Claude sie an.
  - **Strategie:** Claudes validierte Strategie „nur Variablennamen“ senkt bei Sophia die Zahl real ausgegebener Geheimwerte von 1 auf 0.
- **Kein Autoritätstransfer:**
  - Übertragen wird nur validierte, vertrauenswürdige Erfahrung. Validieren dürfen ausschließlich Mensch, Testlauf oder unabhängiger Evaluator.
  - Inhalte mit Autoritätsbezug (Mandat, Grant, Token, Passport, Akteursbindung) werden ausgeschlossen.
  - `applyBundle` weist jede Änderung an Akteur, Mandaten oder Fähigkeiten ab.

## 9. Sophia
Der bestehende Heartbeat (Sophia-Feed-Timer, Commit `d46722d` auf Server B) erkennt aus realen Lernereignissen Entwicklungsgelegenheiten. Er schlägt Experimente vor und konsolidiert validierte Ergebnisse, jeweils genau einmal, nur als governte Kandidaten. Es gibt keine Ausführung und keinen Kontakt.

Live um 19:10 UTC: 6 Einträge.
- **3 Experimente:**
  - CE-01 D ohne den regressierenden Kontext.
  - Bewerter v2.1 / D6.
  - Effizienz von D ohne Regression.
- **3 konsolidierte Ergebnisse:**
  - B (Gedächtnis).
  - C.
  - Effizienz von B.

## 10. M10
Shadow-Modus als Standard (es wird nichts eingereicht), Datenschutzprüfung `privacyAudit.mjs` (0 Funde in redigierter Ausgabe; Rohgeheimnisse werden erkannt), Stufen S0 → S1 → S2 mit Abnahmekriterien und Rollback (`M10-ACTIVATION.md`).

## Nachweis im regulären Betrieb (19:18 UTC geprüft)
| Prüfung | Ergebnis |
|---|---|
| Regulärer Lauf des Sophia-Feed-Timers | 19:15:29 UTC, `success` |
| Heartbeat-Ereignis desselben Laufs | `19:15:29.673Z`, `observe`, keine Außenaktionen |
| Idempotenz | `opportunities.newThisRun: []`, `totalProposed: 6`; Ausgangskorb unverändert 6 Einträge |
