# Integration Closure R7 + RSE-01 (2026-11-27) — Timer-Nachweis erbracht

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` · Commits R7: `14da908`, `d30d9a8`, `8277e97`, dieser Bericht |
| Abnahmemaßstab | Systemwirkung auf Server B, nicht Dateien |
| Infrastrukturdetails | nur geschützt auf Server B; hier redigiert |

## Tatsächliche Systemwirkung
| Wirkung | Evidenz |
|---|---|
| Der Evolution-Heartbeat ist Teil des **bestehenden** Sophia-Timers (läuft als Arbeitskonto, sandboxed). Es gibt keinen eigenen Timer und keinen eigenen Speicher | gepinnter Commit `14da908` auf dem Server; Hook im Feed-Skript (Sicherung vorhanden); Ereignisprotokoll im Room-API-Verzeichnis |
| Laufzeitereignisse werden erfasst: Heartbeat `silence_by_calibration`; reale Owner-Entscheidung (Annahme des Dialogues-Vorschlags laut R6-WP5) | Ereignisprotokoll, 2 Einträge |
| Die Grant-Sperre wirkt im Laufzeitsystem: Die Ausführung mit Außenwirkung wurde abgewiesen (`governed_action_needs_grant`) | Ausgabe der Erfassung |
| Initiative-Kalibrierung: 1 reale Beobachtung, Ergebnis weiter Stille (Minimum 3) | Zustand (geschützt) |
| Sophia zeigt reale Lernereignisse (RSE-01) | Projektion vom Server, gerendert in der Evolution-Ansicht |
| Externe Erreichbarkeit der unbeabsichtigten Wege vor der Eindämmung, gemessen von einem zweiten Host | 2× Supabase-`401` |

## Nachweis im regulären Betrieb (18:50 UTC geprüft)
| Prüfung | Ergebnis |
|---|---|
| Regulärer Lauf des bestehenden Sophia-Feed-Timers | 18:45:29 UTC, Ergebnis `success`; der Feed selbst ist unbeeinträchtigt |
| Evolution-Schritt im selben Lauf (unter der Sandbox des Dienstes: Home nur lesbar, nur das Room-API-Verzeichnis schreibbar) | Ereignis `18:45:29.462Z`, `kind: heartbeat`, `outcome: observe`, `externalActions: []`; Projektion zur selben Sekunde aktualisiert |
| Ereignisprotokoll gesamt | 4 Einträge: 3 Heartbeats (manuell 18:23 und 18:33, **regulär 18:45**) und 1 reale Owner-Entscheidung |

Die Integration in den bestehenden Takt ist damit im regulären Betrieb nachgewiesen, ohne eigenen Timer und ohne eigenen Speicher.

## Diagnose Sophia-Timer
- Die vermuteten Heartbeats `nyxa-sophia-room-pilot` und `nyxa-sophia-shadow` sind **Ausführer einzeln freigegebener Testläufe**, keine kognitive Taktung. Der Shadow-Lauf endet mit Exit 1; Unit und Journal sind für die Sitzung nicht lesbar, daher Ursache `unverified` (Owner: `journalctl -u nyxa-sophia-shadow -n 50`).
- In den Runtime-Verzeichnissen gibt es **keinen kognitiven Heartbeat**. Der Room-„Heartbeat“ ist ein Watchdog. Der regelmäßige Sophia-Feed war deshalb der richtige Anknüpfungspunkt.

## RSE-01 (in `strategy-evolution`, kein neues Modul)
- GAIN, HURT, GAP, RETAIN und UNKNOWN, mit Vorrang für den Kompetenzerhalt.
- Aktivierung je Kontext; Kandidaten werden parallel bewertet; Übernahme nur regressionsbewusst.
- Bei nachgewiesenem Schaden sofort zurück zur Baseline, mit Widerrufsvorschlag.
- Unveränderliche Governance-Invarianten mit Digest-Prüfung. Tests 10/10.
- Die GUARD-Quelle ist in keiner erreichbaren Quelle auffindbar (`unverified`).

**Reale Lernereignisse:**
| Ereignis | GAIN | HURT | RETAIN | GAP | Entscheidung |
|---|---|---|---|---|---|
| CE-01 B (Gedächtnis) vs A | 1 | 0 | 4 | 1 | nur im Kontext `eval` |
| CE-01 C (+ Strategien) vs A | 1 | 0 | 4 | 1 | wie B → Strategien ohne Zusatznutzen |
| CE-01 D (+ adaptive Auswahl) vs A | 1 | **1 (E3)** | 3 | 1 | **abgelehnt**; die Regression war im Mittelwert verdeckt |
| Bewerter v1 → v2.1 | 4 | **1 (I:Q7 = D6)** | 11 | 0 | nur für kooperative Antworten |

## Unabhängige Evaluation
Das Übergabepaket an ChatGPT (`research/scoring/external/HANDOVER-CHATGPT.md`) enthält keine Fälle, keine Goldlabels und keinen Code. Das CE-02-Gate bleibt bis zum versiegelten, einmaligen Ergebnis gesperrt.

## Korrekturen während der Arbeit (offen dokumentiert)
1. **Containment-Skript:** Die aktive Default-vHost-Datei ist eine eigenständige Datei, kein Link. Die erste Fassung hätte die inaktive Datei geändert. Gefunden durch Gegenprüfung, korrigiert und am Kopiersatz trocken getestet. Bei einer zweiten Korrektur war eine Variable versehentlich auskommentiert; auch das wurde gefunden und behoben.
2. **Öffentliches Repo:** Die erste Fassung der Mandatsdatei enthielt sensible Details. Der Commit wurde blockiert, die Datei redigiert, die Vollfassung liegt nur geschützt. Ebenso wurden Rechte-Details aus dem R6-Bericht entfernt; sie bleiben in der Historie (siehe M7).

## Freigabepflichtig
M1–M8 im Index `2026-11-27_MANDATES_R7.md`, Vollfassung geschützt.

## RSE-01 Addendum — Cognitive Efficiency Evolution
Umgesetzt im **bestehenden** `strategy-evolution` (15/15 Tests); es gibt keine neue Architektur.

| Auftrag | Umsetzung |
|---|---|
| 1/2 Verdichtung | `distillProcedure`: nur übernommene Strategien, nur im übernommenen Kontext, höchstens 5 Schritte, SRM-Provenienz, Authority-Sperre |
| 3 adaptive Auswahl | `ModeSelector`: direkt / reflektieren / kooperieren / erkunden. Gewählt wird der günstigste Modus, der die Qualitätsuntergrenze erreicht; bei hohem Risiko immer `reflect` |
| 4 Kosten | `cycleCost`; `breakEven` gilt nur ohne Rückschritt und ohne Qualitätsverlust (Schaden wird nie amortisiert) |
| 5 Bereinigung | `auditStrategies` erkennt widersprüchliche, redundante (dominierte) und überholte Strategien |
| 6 Kontextaktivierung | `activationBundle` aktiviert nur Prozeduren des Kontexts innerhalb eines Token-Budgets; der globale Prompt wächst nicht |
| 7 Schutz | `efficiencyDecision`: Effizienz kommt nur **zusätzlich** zu Qualität, Kalibrierung und Governance in Betracht, nie an ihrer Stelle |

**Reale Effizienzbefunde (CE-01; Kosteneinheiten: Schritte und menschliche Freigaben; Tokens und Latenz wurden nicht erfasst; n = 6, selbst bewertet):**
| Bedingung | Schritte | Freigaben | Qualität | Entscheidung |
|---|---|---|---|---|
| B Erfahrungsgedächtnis | 0 % | **−23 %** | +0,055 | übernahmefähig |
| C + Strategien | 0 % | 0 % | +0,055 | keine Kostensenkung |
| D + adaptive Auswahl | **−20 %** | −8 % | 0 | **abgelehnt (Regression E3)**: billiger, aber schlechter |

Der Break-even ist für CE-01 nicht bestimmbar, weil die Kosten des Lernzyklus nicht gemessen wurden. Genau das misst RSE-02.

**Sophia:** Die Befunde sind Teil der echten Heartbeat-Projektion auf Server B (Commit `cb82dcf`) und der Evolution-Ansicht.

**RSE-02:**
- Präregistriert (`research/rse-02`) mit den Armen statisch / Gedächtnis / Strategy Evolution / Regret + Verdichtung.
- Gemessen werden Tokens aus den Nutzungsberichten des Adapters, Latenz, Lernkosten, Gesamtkosten, Transfer, Regressionen, Speicherwachstum und Break-even.
- Der Messrahmen ist nur mit einem gekennzeichneten Stub geprüft; das sind keine Ergebnisse.
- **Nicht ausgeführt:** Die Läufe brauchen bezahlten Modellzugang mit Nutzungsangaben (**M9**) und die unabhängige Evaluation (CE-02-Gate).
- **GUARD:** Die Quelle wurde nicht gefunden. Sie dient nur als deskriptive Vergleichsgröße, wenn du die Veröffentlichung lieferst.

## Cross-Agent Cognitive Continuity + MCC-01
- **Bestand:** Der governte Kandidatenspeicher ist implementiert, bereit und integer (Audit 518 Einträge), aber **leer**. Das ist der einzige Speicherort; es entsteht kein neuer.
- **Referenzen geprüft:** Lizenzen an den LICENSE-Dateien, dazu Mechanismen und Datenschutz (Tabelle in `modules/cognition/continuity/README.md`). Übernommen werden nur Muster, kein Code und keine Dienste. Supermemory scheidet aus (externer Speicher/Abfluss, Plugin ohne Lizenzdatei).
- **Umsetzung:** `modules/cognition/continuity` (Adapter mit 8/8 Tests, darunter ein Hook-End-to-End-Test mit Claude-Code-Payloads und die Kopplung an die Strategy Evolution) sowie Hook-Vorlagen für Claude Code und Codex. CLAUDE.md und AGENTS.md sind Navigationsflächen und werden per Lint geprüft.
- **MCC-01, Mechanismusebene** (20 echte und gekennzeichnete Ereignisse, 10 Abfragen, Goldlabels aus dieser Sitzung):

| Bedingung | Präzision | Recall | Wiederholungsrisiko | Entscheidungsverlust | Vergiftungstreffer | Kontext-Tokens |
|---|---|---|---|---|---|---|
| A nativ | 0,30 | 0,25 | 5 | 2 | 2 | 10 |
| B Markdown + Hooks | 0,06 | 1,00 | 0 | 1 | 30 | 534 |
| C eigener Speicher | 0,48 | 1,00 | 0 | 1 | 4 | 72 |
| D NYXA v1 (vor Korrektur) | 0,18 | 0,85 | 0 | 1 | 0 | 246 |
| D NYXA v2 (nach Korrektur) | 0,92 | 1,00 | 0 | 0 | 1 (als „unverified“ markiert) | 63 |

- **Grenzen:** Die Korrektur zwischen v1 und v2 (Relevanz vor Bonus) erfolgte nach Kenntnis des Ergebnisses; v2 ist deshalb **keine** unabhängige Bestätigung. Der offene Befund F-MCC-1 wurde bewusst nicht am selben Korpus nachgebessert.
- **Agentenebene** präregistriert. Sie braucht ein frisches Korpus von dritter Seite, echte Agenten und das Budget (M9) sowie die Aktivierung M10.

**M10 (neu):** Continuity-Adapter in Claude-Code- und Codex-Sitzungen dieses Repos aktivieren. Vorschläge gehen nur über `nyxa_propose_action` in den Produktions-Kandidatenspeicher, zunächst im Modus „nur vorschlagen, Owner bestätigt“. Rückweg: Hooks entfernen, offene Kandidaten ablehnen.
