# Welle 4 — MeMo / Reflection-QA (NYXA-Governance-Erweiterung)

Stand 2026-11-27, Europe/Berlin · erzeugt mit Claude Code · `DRAFT` · `IMPLEMENTED` + `TESTED` (7/7, Fixtures) · keine Trainingsfreigabe.

## Quelle

„MeMo: Memory as a Model“, Quek et al., arXiv:2605.15156 v2 (20.05.2026), CC BY 4.0. Quellenstatus: `SOURCE-BOUND` — Abstract und Abschnitte 1–4.2 im Wortlaut gelesen. Inferenzdetails, Zahlen und Anhang O (LoRA vs. Full-SFT) stammen aus einer Zusammenfassung → vor Zitat gegen PDF prüfen (`unverified`).

Kern: eingefrorenes Executive-Modell + separates, kleines Memory-Modell (Wissen in Parametern, trainiert nur auf Q→A). Die 1,5-B-Ablation (Qwen2.5-1.5B) liegt auf BrowseComp-Plus bei 44,11 vs. 54,22 (14 B), Executive Qwen2.5-32B (`unverified`, Zusammenfassung).

## Was `reflection_qa.py` umsetzt

| Paper-Stufe (Sec. 4.1) | Implementierung | NYXA-Zusatz |
|---|---|---|
| 1 Faktenextraktion (direkt/indirekt) | `extract` mit austauschbarem `generator` | direkt → `fact`, indirekt → `inference`; Chunk-SHA-256 als Quelle; Betroffene (`subjects`) |
| 2 Konsolidierung (Q_con = Q_raw ∪ Q_mrg) | `consolidate` gruppiert nach Entität | höchstens `inference`; Gültigkeits-**Schnittmenge**, disjunkte Zeiträume werden nicht verschmolzen |
| 3 Verifikation + Rewriting (Self-Containment) | `verify`: deiktische/pronominale Fragen → Rewrite oder Verwerfen | Rewrite behält Elternbezug |
| 4 Entity Surfacing (Reversal Curse) | `surface_entities` | `fact` nur wenn alle Eltern Fakten sind |
| 5 Cross-Document Synthesis (Converging Clues) | `cross_document` je Dokumentgruppe, ≥ 2 Dokumente | immer `inference`, alle Quellen erhalten |
| — (im Paper nicht behandelt) | `govern` | ohne Provenienz, Widerruf, abgelaufen/noch nicht gültig, Hypothese, ungelöster Widerspruch → ausgeschlossen und gezählt |
| — | `export` | versionierte JSONL + Manifest (SHA-256, Ausschlussgründe), `training_authorized: false` |

## Vergleich A–D (geplant, Voraussetzungen)

A bestehendes Gedächtnis · B MeMo · C RIC + MeMo · D RIC + MeMo + Reflection/Self-Feedback. Messgrößen: Genauigkeit (zeitliche Holdouts per `as_of`), Widerspruchsrate, veraltete Fakten, Provenienz-Abdeckung, Datenschutz (Widerrufstest), Latenz, Kosten. Blockiert durch: autorisierte Korpusauswahl (RIC/episodischer Store, Einwilligung), GPU-Mandat (Runpod) für SFT eines ~1–1,5-B-Modells, Zugriff auf RIC-Bestände (`/home/jo/nyxa-ric-m1`) über RDC-Kontingent. Model Merging nur experimentell gegen Neutraining/Replay (Paper: TIES 15,81 vs. Neutraining 26,85 auf NarrativeQA, `unverified`).

## Lernbereich „Evolution kognitiver Strategien“ (eigenständig)

Strategien (z. B. Zerlegungsheuristik, Entity-Pivot, Abstentionsschwelle, Interaktionsbudget pro Stufe) werden wie Gedächtnis-Kandidaten behandelt, aber getrennt geführt: `strategy_id`, Beschreibung, Auslöser, Herkunft (Reflexion/Experiment), Evaluationsergebnisse gegen Holdouts, Status `candidate → evaluated → promoted|rejected`. Promotion nur über Governed Promotion mit unabhängiger Evaluation; keine Änderung von Executive-Gewichten. Erste Kandidaten aus dem Paper: Interaktionsbudgets der drei Inferenzstufen (laut Paper nicht systematisch getunt) und die „uncertain answer streak“ für Abstention.
