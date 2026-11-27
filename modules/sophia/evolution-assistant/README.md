# Sophia — Personal Evolution Assistant V1 (vertikaler Prototyp)

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum | 2026-11-27, Europe/Berlin |
| Status | `IMPLEMENTED` · `TESTED-IN-ISOLATION` (6/6) · vertikaler Lauf bis zur menschlichen Entscheidung · **nicht** an die Runtime angebunden (siehe `ROOM-INTEGRATION.md`) |
| Wiederverwendung | `epistemic-evolution` (Fragen, Kompetenzrelationen, `actionable`, Kandidatenspeicher), `relationalIntelligence`, `strategy-evolution` |

Keine neue Persönlichkeit, kein zweiter Speicher, kein paralleler Agent.

| Auftrag | Umsetzung |
|---|---|
| 3 Entwicklungsmodell | `DevelopmentModel`: <ul><li>trennt Selbstaussage, beobachtete Tatsache, Interpretation und Hypothese</li><li>Selbstaussagen nur vom Menschen; Ziele setzt nur der Mensch, Sophia schlägt vor</li><li>keine Typologien oder Diagnosen (wird abgewiesen)</li><li>`view` zeigt alles, `correct` und `object` wirken sofort</li></ul> |
| 4 Möglichkeitsnavigator | `possibility` verlangt ≥ 2 Belege (darunter Selbstaussage oder Tatsache), eine Begründung, konkrete nächste Schritte, eine Machbarkeitsprüfung gegen Ressourcen und Governance-Kennzeichnung. `connections` findet getrennt geäußerte Interessen mit gemeinsamem Thema. |
| 5 Fragen | `PersonalQuestions`: <ul><li>lernt, welche Fragearten für wen in welcher Situation helfen</li><li>höchstens eine Frage pro Interaktion, mit Abklingzeit</li><li>keine Frage, wenn die Person beschäftigt ist</li><li>themenfremde Fragen werden zurückgestellt</li></ul> |
| 6 Ko-Evolution | Zyklus Observe → … → Evolve mit erzwungener Reihenfolge. `act` nur mit menschlicher Entscheidung; bei Außenwirkung zusätzlich eine Freigabereferenz. Drei getrennte Lernräume (`human`, `ai`, `relational`). `verifyEffect` lernt aus tatsächlicher Wirkung. |
| 7 Heartbeat | `heartbeatTick`: Stille, Beobachtung, Halten und Revision eigener Annahmen sind gültige Ergebnisse. Kontakt nur außerhalb der Ruhezeiten und höchstens einmal pro 24 h. Keine Außenaktionen. |
| 8 UI | `ui/evolution-view.html` mit sieben Bereichen und Korrigieren/Widersprechen an jedem Eintrag; keine Punkte oder Rankings; in Chromium bei 390 px geprüft |
| 9 Profile | 8 Profile über einen Kern; keines verleiht Berechtigungen. Gruppenprofile verlangen Einwilligung pro Person. |
| 10 HE-01 | `research/he-01` (präregistriert) |
| 11 Governance | Persistenz nur als `scope: personal`-Kandidat. Kontakt, Offenlegung, Zahlung und Veröffentlichung nur als governte Aktion. Strategien können keine Rechte erweitern (`strategy-evolution` FORBIDDEN). |

**Vertikaler Lauf** (`demo/run-2026-11-27.json`): Eingaben sind projektbezogene Selbstaussagen des Owners aus den heutigen Arbeitsaufträgen sowie Repo-Befunde. Der Lauf ging Erfahrung → Reflexion → Frage → Möglichkeit → konkreter Vorschlag → Heartbeat `prepare_message`. Er steht bei **wartet auf menschliche Entscheidung**.

**Grenzen:**
- Die Machbarkeitsprüfung und `connections` arbeiten lexikalisch. Im Lauf war ein Ressourcenname falsch geschrieben, die Daten wurden korrigiert.
- Die Lernkurven der Fragen sind nur in Tests belegt, noch nicht an echten Personen.
