# Generative Relational Intelligence (`relationalIntelligence.mjs`)

Status `DRAFT` · isoliert getestet (Tests 4/4, Modul gesamt 8/8) · nicht an die Runtime angebunden · Owner Johannes Süß · Claude Code, 2026-11-27 Europe/Berlin.

Die Datei baut auf den Stufe-3-Primitiven aus `epistemicEvolution.mjs` auf und deckt die Stufen 4 (generativ relational) und 5 (evolutiv relational) ab:

- `ConstellationRelations`: lernt aus Messwerten pro Bereich, ob eine Partnerkonstellation mehr leistet als ihr bestes Einzelmitglied (Synergie). `propose()` kombiniert Einzelkompetenz, gelernte Synergie und Vielfalt der Disziplinen. Externe Partner erscheinen nur als `governed_action`.
- `jointHypotheses`: eine Hypothese ist *emergent*, wenn sie Prämissen von mindestens zwei Agenten nutzt und kein einzelner Agent alle Prämissen besaß. Erfundene Prämissen-IDs werden markiert.
- `emergenceGain`: zählt geprüfte Erkenntnisse, die kein Einzelbeitrag enthielt. Ebenso werden Erkenntnisse ausgewiesen, die beim Zusammenführen verloren gingen.
- `synthesisQuality`: misst, wie gut die interdisziplinäre Synthese ist, und ob abweichende Positionen erhalten bleiben.
- `toExperiment`: überführt eine Hypothese über die bestehende `actionable()`-Pipeline in ein prüfbares Experiment.
- `reflect`: ordnet den Beitrag jedes Agenten den emergenten Hypothesen zu.
- `cooperationExperience`: liefert gemessene SRM-Erfahrungen für `strategy-evolution` mit `kind: "cooperation"`. So entstehen Kooperationsstrategien, die nur über γ übernommen werden.
- Persistenz ausschließlich über den bestehenden Kandidatenspeicher (`persistHypothesis` nutzt `toCandidateProposal`).
