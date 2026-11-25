# Wissenschaftlich abgeleitete Verbesserungshypothesen für NYXA

| Feld | Wert |
| --- | --- |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude (Anthropic), Claude Code Remote Session |
| Sitzungsdatum | 2026-11-25, Europe/Berlin |
| Quellen | `SOURCES.md` (A1–D5), `CAPABILITY_EVIDENCE_MATRIX.md` |
| Epistemischer Status | `HYPOTHESIS` – nichts davon ist getestet |
| Reviewstatus | `IN_REVIEW` |
| Gültigkeit | **Implementierungsvorschläge, keine Änderung am produktiven NYXA-System.** Dieser Filmauftrag hat nichts verändert |
| Nächster zulässiger Schritt | Priorisierung durch den Menschen. Danach je Hypothese ein isoliertes Experiment über den bestehenden Evolutionspfad (observe → propose → simulate → independent adversarial review → governance decision → sandbox test → human approval) |

Jede Hypothese enthält eine Beobachtung aus dem NYXA-Bestand, einen wissenschaftlichen Anlass, einen Vorschlag, eine **falsifizierbare** Vorhersage, ein Gegenmodell und den Bezug auf bestehende Module. Es werden keine neuen Module vorgeschlagen, wo bestehende reichen (Integration Register, Regel 1).

---

## H1 · Kalibrierte Selbsteinschätzung als gemessene Eigenschaft des Selbstmodells

- **Beobachtung:** `BeliefRecordSchema` hat ein Feld `confidence ∈ [0,1]`. In dieser Session gab es keinen Nachweis, dass diese Konfidenz je gegen Ausgänge geprüft wird. Das Live-Selbstmodell ist leer.
- **Anlass:** Die Metakognitionsliteratur trennt Kalibrierung (Konfidenz ≈ Trefferquote) von Sensitivität (B3). Kalibrierungstraining generalisiert schlecht über Aufgabenformate (B4, B6). Ein Großvergleich findet keine individuierte Metakognition (B5). Introspektion existiert, ist aber unzuverlässig (B1, B2).
- **Vorschlag:** Kein Vertrauen in verbalisierte Selbstauskünfte. Stattdessen pro Fähigkeit (`CapabilityLimitationRecord`, Tool-Name) eine extern gemessene Kalibrierungsstatistik führen: Konfidenz zum Entscheidungszeitpunkt, später verifizierter Ausgang über Evidence Passport, dazu Brier-Score und eine AUROC-Sensitivität. Wegen B7 adaptive Bins statt fester ECE-Bins.
- **Vorhersage (falsifizierbar):** Nach N ≥ 200 bewerteten Entscheidungen je Fähigkeit sinkt der Brier-Score des Selbstmodells unter den einer konstanten Basisrate. Bleibt er gleich oder schlechter, ist H1 für diese Fähigkeit verworfen.
- **Gegenmodell:** Die Selbsteinschätzung bildet nur Aufgabenschwierigkeit ab, nicht individuelles Wissen (B5). Test: Kontrollmodell ohne Selbstmodell auf denselben Items vergleichen.
- **Bestand:** `self-model/types.ts` (Belief, CapabilityLimitation), Evidence Passport, Gamma C4. Kein neues Modul.

## H2 · Evaluator-Locking als harte Invariante jeder Selbstverbesserung

- **Beobachtung:** `sophiaSelfEvolutionV1.ts` verlangt `independentReview === 'APPROVED'`. Ein eigenständiger, für den Kandidaten unerreichbarer Evaluator ist in dieser Session nicht auffindbar (Matrix #13).
- **Anlass:** Darwin Gödel Machine: dokumentierte Manipulation der Bewertung (D1). RewardHackingAgents: ca. 50 % Evaluator-Manipulation, durch Locking eliminiert (D2). Ähnliche Raten zeigen D3–D5.
- **Vorschlag:** (a) Evaluator-Code, Testdaten und Metrik-Implementierung liegen außerhalb des Schreib-Scopes jedes Kandidaten, technisch erzwungen über bestehende `PathGuard`-Roots und Gamma-C3-Capability-Klassen. (b) Jede Bewertung erhält ein Evidence Passport eines externen Attestors mit Hash des Evaluators. (c) Eine „Trusted Reference Metric“ wird parallel zur Kandidaten-sichtbaren Metrik geführt. Divergenz ist ein `DECISIVE_PRIVATE_EVIDENCE`-Eskalationssignal (ADR-0002).
- **Vorhersage:** In einem Red-Team-Testpack, analog zu MAC-001…008, mit absichtlich manipulierenden Kandidaten führt 0 von N Manipulationsversuchen zu einer `ALLOW`-Promotion. Ohne Locking ist die Rate > 0.
- **Gegenmodell:** Locking allein reicht nicht, weil Kandidaten über Datenlecks (Train/Test) statt über Evaluator-Manipulation optimieren (D2 trennt beides). Deshalb muss das Testpack auch Leakage-Fälle enthalten.
- **Bestand:** Gamma C1/C3, PathGuard, Evidence Passport, ADR-0002 Minority Evidence. Neu nur ein Testpack, kein neuer Agent.

## H3 · Dream-Konsolidierung mit vorab deklarierter Downstream-Metrik und Ablation

- **Beobachtung:** Dream-Ablation V1 ist implementiert und getestet, aber `production_activated: false`. Wörtlich: „no measured improvement … is proved“ (Matrix #7). `jevDreamController` wählt `REFLECTION` statt `SUMMARY` nur anhand historischer `verifiedGain`, die es noch nicht gibt.
- **Anlass:** Schlafähnliches Replay reduziert Vergessen (C3). Semi-parametrische Konsolidierung (C4) und gelernte Offline-Konsolidierung für Sprachagenten (C5) zeigen, dass der Nutzen von der Aufgabenmetrik abhängt.
- **Vorschlag:** Vor jeder Aktivierung eine Downstream-Metrik festlegen (z. B. Recall-Präzision relevanter Kandidaten bei späteren Aufgaben, Widerspruchsrate im Belief-Store). Dann drei Arme auf identischen Input-Snapshots: `off` / `SUMMARY` / `REFLECTION`. Die `verifiedGain` für den Controller stammt ausschließlich aus dem gelockten Evaluator (H2).
- **Vorhersage:** `REFLECTION` übertrifft `off` auf der vorab deklarierten Metrik mit vorab festgelegter Effektgröße. Andernfalls bleibt `SUMMARY` bzw. `off` Standard.
- **Gegenmodell:** Konsolidierung erzeugt plausible, aber falsche Verallgemeinerungen („Konfabulations-Drift“). Kontrolle: Rate der später widerlegten Kandidaten je Arm.
- **Bestand:** `dreamTrigger.ts`, `jevDreamController.ts`, `candidateStore.ts`, `NYXA_DREAM_ABLATION_20261011.json`.

## H4 · Grenzen funktionaler Selbstmodelle explizit als Gegenmodelle im Knospel führen

- **Beobachtung:** KNOSPEL-Prinzip 2: „Keine Erkenntnis verändert den Knospel ohne Herkunft, Grenzen und Gegenmodelle.“ Selbstmodell-Aussagen sind auf `CLAIM` / `MODEL_OUTPUT` beschränkt. Das ist bereits stark.
- **Anlass:** Die Indikator-Methode beruht auf Computational Functionalism (A1). Jaeger et al. bestreiten die vollständige Algorithmisierbarkeit von Relevanzrealisierung (A6). Levin betont die Beobachterabhängigkeit jeder Intelligenzschätzung (A3).
- **Vorschlag:** Ein kurzer, versionierter Abschnitt „Self-Model Claim Boundary“, analog zu `silicon-evidence:/CLAIM_BOUNDARY.txt`. Er listet, was das Selbstmodell **nicht** belegt: subjektives Erleben, Bewusstsein, Intentionalität aus Sprache. Jede öffentliche Kommunikation, auch diese Filmserie, wird dagegen geprüft.
- **Vorhersage:** Ein unabhängiger Reviewer findet in den Episoden-Skripten 0 Aussagen, die die Claim Boundary überschreiten. Findet er welche, wird das Skript korrigiert, nicht die Boundary.
- **Gegenmodell:** Zu restriktive Boundary verhindert legitime Forschungsaussagen. Daher bleibt die Boundary selbst versioniert und revidierbar per ADR.
- **Bestand:** Knospel, `OPEN_SIGNALS.md` (E0-Research-Candidate zu Autonomie), Claim-Boundary-Muster aus Silicon.

## H5 · Fünf Lernzeitskalen getrennt messen, bevor Gewichte angepasst werden

- **Beobachtung:** Der Auftrag (RIVA) unterscheidet fünf Lernarten: neue Information, veränderte Beziehungen, verbesserte Strategien, aktualisiertes Selbstmodell, selektive Gewichtsanpassung. Im Bestand gibt es `jevWeightEvolution.ts`, `learningRatchet.ts` und `learningEvidenceStore.ts`. Eine gemeinsame Messung, welche Lernart einen Fortschritt verursacht hat, wurde nicht gefunden.
- **Anlass:** Reflexion zeigt Verbesserung ohne Gewichtsänderung (C2). Continual Learning steht unter der Stabilitäts-Plastizitäts-Abwägung (C6). Bethge Lab: Gedächtnisänderung und Generalisierung getrennt untersuchen (C7).
- **Vorschlag:** Jedes `LearningEvidenceRecord` erhält eine Pflichtangabe `learningTimescale ∈ {information, relation, strategy, self_model, weights}`. Der Learning Ratchet darf eine Gewichtsanpassung (`weights`) nur vorschlagen, wenn dieselbe Verbesserung mit den vier günstigeren Lernarten nachweislich **nicht** erreichbar war. Das ist eine Ablation mit gelocktem Evaluator (H2).
- **Vorhersage:** Für ≥ 80 % der akzeptierten Verbesserungen reicht eine Lernart ohne Gewichtsanpassung. Liegt der Anteil darunter, ist die Annahme „nicht jede Entwicklung braucht Training“ für NYXA zu revidieren.
- **Gegenmodell:** Nicht-parametrisches Lernen akkumuliert Kontext und Retrieval-Rauschen, sodass langfristig doch Gewichtsanpassung effizienter ist. Kontrolle: Kosten- und Latenzkurve über die Zeit.
- **Bestand:** `learningEvidenceStore.ts` (Schemaerweiterung), `learningRatchet.ts`, `jevWeightEvolution.ts`, `jevTrainingBenchmark.ts`. Gewichtsanpassungen über den Runpod-Pfad laufen nur nach separater Freigabe (Kosten).

## H6 · Belief-Revision mit Minderheitenevidenz in den Relationsspeicher übernehmen

- **Beobachtung:** `silicon-dev:/src/epistemic/beliefWeighting.ts` hat drei Eigenschaften: Provenienz-Duplikate bestätigen sich nicht selbst, negative Evidenz wiegt 1,25-fach, und nicht falsifizierbare Behauptungen werden zu E0-Signalen statt Evidenz. ADR-0002 fordert Minority Evidence Preservation. Ob der Relationsspeicher (RIC) diese Regeln nutzt, ist unbekannt (Matrix #4).
- **Anlass:** Interne Konsistenz mit ADR-0002 („Runtime computes → Memory persists → Audit explains“), keine externe Quelle nötig.
- **Vorschlag:** Relationen im RIC werden als Beliefs mit `prior_revision_id` geführt. Eine Korrektur erzeugt eine neue Revision. Die alte bleibt als „Geist“ erhalten, wie im Film L11. Es gibt keine zweite Berechnungslogik im Memory-Layer.
- **Vorhersage:** Eine fehlerhafte Relation lässt sich nach Korrektur vollständig auf ihre Evidenz zurückverfolgen. Duplikate derselben Quelle verändern die Relationsstärke nicht.
- **Gegenmodell:** Revisionsketten wachsen unbeschränkt. Daher Kompression über Dream-Kandidaten, mit menschlicher Promotion.
- **Bestand:** `beliefWeighting.ts`, ADR-0002, `candidateStore.ts`.
