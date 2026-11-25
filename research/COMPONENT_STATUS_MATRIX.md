# NYXA Component Status Matrix

| Feld | Wert |
| --- | --- |
| Stand | 2026-11-25, ca. 20:15 UTC (Europe/Berlin 21:15) |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude (Anthropic), Claude Code Remote-Session |
| Methode | Nur lesend: NYXA-MCP (I0-Tools), direkte Inspektion der NYXA-Server (Dateien, Git-Branches, Worktrees, Benutzer-Timer), GitHub-Code-Suche. Ausgeführte Tests: nur seiteneffektfreie Modultests (Embodiment). Andere Testzahlen sind aus den jeweiligen Evidenzdokumenten zitiert |
| Quellenstatus | `SOURCE-BOUND` |
| Epistemischer Status | `DRAFT`. Eine einzelne Agenten-Inventur ohne unabhängige Attestierung |
| Reviewstatus | `IN_REVIEW` |
| Vorgänger | `film/architecture-of-becoming/docs/CAPABILITY_EVIDENCE_MATRIX.md` (1. und 2. Durchgang, gleicher Tag). Diese Datei ist ab jetzt die **kanonische** öffentliche Statusübersicht |
| Nächster zulässiger Schritt | Unabhängige Bestätigung durch einen zweiten Agenten oder den Betreiber. Danach Übernahme in den Komponentenindex (Vertrag C4) |

Öffentlich: Hier stehen keine Hostnamen, IP-Adressen oder Serverpfade. Exakte Fundorte stehen in einem nicht öffentlichen Betriebs-Handoff.

## Zustandsvokabular

Zwei orthogonale Achsen. Ein „nicht gefunden“ ist **kein** „existiert nicht“.

| Zustand | Bedeutung |
| --- | --- |
| `NOT_FOUND` | An allen erreichbaren Orten gesucht, nicht gefunden. Der Suchweg ist dokumentiert |
| `UNREACHABLE` | Der vermutete Ort war nicht erreichbar (offline, fehlende Rechte) |
| `SPECIFIED_ONLY` | Nur Spezifikation, Auftrag oder Design, kein Code |
| `IMPLEMENTED` | Code vorhanden. Tests fehlen oder wurden nicht geprüft |
| `FUNCTIONALLY_VERIFIED` | Funktion durch Tests oder Live-Probe belegt. Die Quelle der Belege ist angegeben |

| Deployment | Bedeutung |
| --- | --- |
| `none` | nicht ausgeführt |
| `shadow` | läuft isoliert, ohne Wirkung auf produktive Daten |
| `production` | in der produktiven Runtime wirksam |

## Matrix

| Komponente | Zustand | Deployment | Beleg | Offene Punkte |
| --- | --- | --- | --- | --- |
| Gamma-Governance (C1–C5) + E0 | `FUNCTIONALLY_VERIFIED` | production (MCP) | Live-Proben 25.11.: Ein falsch adressierter Schreibvorschlag wurde über C5 eskaliert. Ein korrekt adressierter passierte Gamma und wurde von E0 wegen zu hoher Konfidenz gehalten. Beide schrieben nichts | – |
| Discovery: Operator-Routing-Preflight | `FUNCTIONALLY_VERIFIED` | production | Live 25.11.: Hauptserver `PREFLIGHT_OK` (nur Identität, keine Ports oder Rechte) | Ein dritter Server ist im Routing als `retired` geführt, in der Toolbox aber als `degraded`. **Konflikt** |
| Discovery: Toolbox-Registry | `FUNCTIONALLY_VERIFIED` | production | Live 25.11.: 45 Fähigkeiten. Orchestrierungs-Connector `degraded`, mehrere `configured_unverified` | – |
| Discovery: System Registry V1 / V2 | `IMPLEMENTED` | none / HOLD | V1-Snapshot vom 21.10. (veraltet). V2: keine freigegebene Registry-Datenbank | V2-Release-Gates offen |
| Persistentes Selbstmodell V1 | `FUNCTIONALLY_VERIFIED` | production | Live lesbar. Inhalt bis auf hash-verkettete `session_start`-Ereignisse leer | Inhalte |
| Selbstmodell V2 (Provenienz experienced/told/inferred, E0_OPEN, append-only, Retraction) | `IMPLEMENTED` | none | Branch `feature/selfmodel-v2` (28511be) | Release |
| Memory Candidate Store | `FUNCTIONALLY_VERIFIED` | production | Recall live. Schreibpfad bis E0 live geprüft. Kandidatenspeicher der aktuellen Epoche leer | Ein paralleler Codex-Branch erweitert das Schema |
| Evidence Passport V1 | `FUNCTIONALLY_VERIFIED` (Dev) | none | Regressionen in der Dev-Doku. Nicht ausgerollt | Externer Attestor und Trust Anchor |
| Dream-Konsolidierung (Ablation) | `FUNCTIONALLY_VERIFIED` (Dev) | none | 15 Tests (Doku 11.10.), `production_activated: false` | Downstream-Metrik |
| **Sophia Heartbeat V0.1** (7 Prüf- + 3 Reflexionseinheiten = 30 %) | `FUNCTIONALLY_VERIFIED` | **shadow** | 15/15 Tests (Doku 12.11.). Benutzer-Timer aktiv (~5 min), letzter Lauf 25.11. `IDLE_NO_NEW_CYCLE`, 12 Zyklen | Kein synchroner Hook. Kein Self-Model-Binding. Keine LLM-Reflexion |
| **NYXA V3 Cognitive Integration** (Lernklassen, Prognose-Ledger, Eval-Harness, Draft vs. Effective) | `FUNCTIONALLY_VERIFIED` (Branch) | **shadow** | Branch `v3/cognitive-integration-20261124`, stündlicher Shadow-Timer, laut Doku 152 Tests grün | Release in die Runtime braucht root und Freigabe |
| **Governed Runpod Connector** | `FUNCTIONALLY_VERIFIED` (Branch, gegen Doppelgänger) | none | Commit 645c6fd: Positivliste (Status, Abrechnung, Start, Stopp eines Pods), Kostenwächter, 7 Tests. Lesende Live-Probe gegen Runpod laut Doku erfolgt | Nicht in der Runtime. Watchdog nicht aktiviert |
| **Embodiment** (`nyxa.embodiment.v1`, Gesichts-Landmarken → Avatar-Frame) | `FUNCTIONALLY_VERIFIED` (Modul) | none | 3/3 Tests, am 25.11. von Claude ausgeführt. Reine Funktionen | Liegt in einem Staging-Bereich. Ein anderer Agent arbeitet daran. Keine Integration |
| Embodiment Core V0.1 (als benannte Einheit) | `NOT_FOUND` | – | Unter diesem Namen weder auf den Servern noch in GitHub | Eventuell identisch mit dem Modul oben. Zu klären |
| RIC-01 Relational Intelligence Conformance Suite | `FUNCTIONALLY_VERIFIED` (Forschung) | none | 200 Fälle, zwei unabhängige Orakel (200/200 Übereinstimmung). Production NO-GO | – |
| RIC-01 M1 (relationaler vs. flacher Abruf) | `FUNCTIONALLY_VERIFIED`, Ergebnis **negativ** | none | Präregistriert, versiegelter Holdout, 28/28 Tests. **NO-GO-GRAPH** (+0,096 < 0,10) | Neue Studie nötig |
| NYXA Studio 0.1.0 | `FUNCTIONALLY_VERIFIED` (Pilot) | none (lokal) | Getesteter lokaler Pilot, 81 Routen | Keine Backend-Integration |
| Multi-Agent Conflict Governance (ADR-0002) | `IMPLEMENTED` | unbekannt | ADR `PROPOSED`, Runtime-PR | Merge-Status prüfen |
| Pocket Kernel · RIVA Training Factory | `NOT_FOUND` | – | Nicht auf den Servern und nicht in GitHub. Ein Pod mit RIVA-Namen ist in der V3-Doku erwähnt | Offline-Geräte des Betreibers: `UNREACHABLE` |
| Release-Prüfstand „6 PASS / 11 HOLD“ | `UNREACHABLE` | – | Herkunft gefunden (Handoff vom 10.11., Preflight-Skript). Für den Agenten-Account nicht lesbar | Reverifikation durch root |

## Was sich gegenüber dem Film (Episode 01) geändert hat

- Der Film formuliert den Heartbeat konditional („designed to keep thinking“). Tatsächlich läuft er im **Shadow-Betrieb** mit genau der 30-%-Reflexionsquote. Die Formulierung ist vorsichtiger als nötig, aber nicht falsch.
- RIC: „Meaning lives in the relations“ (L10) ist eine philosophische Setzung. Die eigene Studie M1 stützt einen relationalen Vorteil nur bei zwei Schritten und unter der vorab gesetzten Schwelle. Das ist ein starkes Motiv für Episode 02.
- Der Runpod Connector und V3 existieren. Der Film erwähnt sie nicht und behauptet nichts Falsches über sie.

## Methodische Lektion

Die erste Suche verließ sich auf Dateinamen und bestimmte Schreibweisen. Heartbeat, V3 und Runpod lagen in **Verzeichnisnamen, nicht ausgecheckten Branches und Worktrees**. Künftige Inventuren prüfen deshalb zusätzlich `git branch -a`, `git worktree list`, Benutzer-Timer sowie die Handoffs und Mappings anderer Agenten, bevor ein `NOT_FOUND` vergeben wird.
