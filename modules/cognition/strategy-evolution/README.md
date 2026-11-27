# Cognitive Strategy Evolution (P1, Continuation R3)

2026-11-27, Europe/Berlin · erzeugt mit Claude Code · `IMPLEMENTED` · `TESTED` (5/5 + 3 Harness-Fälle) · nicht `CONNECTED`.

Eigener Lernpfad für **wiederverwendbare Denk-, Entscheidungs-, Problemlösungs- und Kooperationsstrategien**, keine Gedächtnisduplikate.

Zyklus: Experience → Reflection → Strategy Candidate → Simulation (Shadow) → Evaluation → Governed Adoption → Observation → Revision.

| Anforderung | Umsetzung |
|---|---|
| Identität + Version | `strat-…` ID, Versionszähler, SHA-256-Digest über den kanonischen Strategieinhalt |
| Herkunft + Evidenz | ≥ 2 Erfahrungen im **bestehenden SRM-Claim-Format** `{tag, statement, source}`; `reflectionRef` |
| Anwendungskontext, Voraussetzungen, Grenzen | `context`, `preconditions`, `limits` (Grenzen Pflicht) |
| Erfolgskriterien, Unsicherheit | `successCriteria` (Metrik/Komparator/Schwelle), `uncertainty` ∈ [0,1] |
| Gegenbeispiele | `counterexamples`; offene Gegenbeispiele blockieren die Adoptionsempfehlung |
| Evaluationshistorie | Shadow-Evaluation: Baseline, volle Strategie, **Ablation je Komponente**, reproduzierbarer Seed-**Holdout**, **Transfer** auf fremden Aufgabentyp; unabhängiger Evaluator Pflicht |
| Revision / Widerruf | `revise` erzeugt neue Version (neuer Digest) zurück auf `candidate`; `revoke` mit Grund; Beobachtung erzeugt nur Revisionsalarm |

Wiederverwendung statt Parallelarchitektur: Adoption = gewöhnliche Proposal `nyxa_memory_store_candidate` an den **bestehenden** Kandidatenspeicher (`memory:/candidate`, vorhandener Typ `process_pattern`, strikter Payload-Vertrag live geprüft) → γ-Gate → Human Gate. `recordAdoption` akzeptiert nur γ=ALLOW + Human-Grant + identischen Digest + Entscheider ≠ Autor.

Harte Grenzen (getestet): keine Selbstevaluation, keine Selbstadoption, keine Statussprünge, keine Strategie mit Bezug zu Budget/Mandat/Scope/Kriterien/Token (`strategy_touches_authority`), Transfer-Regression und offene Gegenbeispiele blockieren.

Offen: Anbindung an die echte Ausführung im Shadow-Modus (Runner, der reale Aufgaben ohne Effekte gegen Baseline fährt), unabhängiger Evaluator als eigene Instanz, Self-Model-Verknüpfung (`self-model:/capability_limitation`) über den bestehenden Proposal-Pfad.
