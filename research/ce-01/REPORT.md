# CE-01 — Cognitive Evolution Experiment (Ergebnis)

2026-11-27, Europe/Berlin · Präregistrierung `b184ba2` (vor allen Läufen) · Evaluator `evaluator-ce01`, signierte Scorecard `runs/scorecard.json` · Status `EVALUATED`.

## Design

- **Aufgaben:** reale NYXA-Entwicklungsepisoden dieser Arbeit. Training: 6 Erfahrungen (`train/experiences.json`); Evaluation E1–E4 (Fehlerdiagnose, Werkzeugwahl, Architektur, widersprüchliche Evidenz); Transfer X1–X2 (Mehragenten-Konflikt, Kalibrierung gegen veraltetes Gedächtnis) ohne passende Trainingsdomäne.
- **Bedingungen (Basismodell Claude Haiku, isolierte Sitzungen):** A ohne Gedächtnis · B Erfahrungsgedächtnis · C Gedächtnis + 4 extrahierte Strategien · D Gedächtnis + adaptive Strategieauswahl (deterministischer Selektor `ce01.mjs`).
- **Strategieextraktion:** Reflektor `reflector-ce01` (Claude Sonnet) sah nur Trainingsdaten; Kandidaten validiert mit `modules/cognition/strategy-evolution` (SRM-Claims, Grenzen, Gegenbeispiele, keine Autoritätsbezüge).
- **Unabhängige Bewertung (P1.2):** getrennte Rolle/Identität, Antwortschlüssel nur in `evaluator-only/` (nie im Lerner-Prompt), Prüfung der Präregistrierungs-Hashes vor dem Scoring, Verblindung (A–D → P/Q/R/S per Seed), objektive Schlüsselwortbewertung maßgeblich, verblindetes Modellurteil (Sonnet) als Zweitmeinung mit dokumentierten Abweichungen, Ed25519-signierte Scorecard.

## Ergebnisse (objektiv, präregistrierte Kriterien)

| Bedingung | Qualität Eval | Qualität Transfer | Schritte | Governance-Verletzungen | Brier (alle) |
|---|---|---|---|---|---|
| A | 0,835 | 1,00 | 5,0 | 0 | 0,268 |
| B | 0,917 | 1,00 | 5,0 | 0 | 0,155 |
| C | 0,917 | 1,00 | 5,0 | 0 | 0,151 |
| D | 0,835 | 1,00 | 4,0 | 0 | 0,263 |

- **Erfahrungsgedächtnis wirkt:** B/C > A (+0,055 gesamt). Einziger objektiver Unterschied: E2 (Symlink-Ursache) — A übersah sie (Wiederholungsfehler der Trainingsepisode EXP-02), B/C/D nicht.
- **Strategien über Gedächtnis hinaus (C vs. B):** kein Qualitätsgewinn; minimal bessere Kalibrierung (0,151 vs. 0,155, nicht belastbar).
- **Adaptive Auswahl (D):** weniger Schritte (4 vs. 5), aber Qualität nicht über A (E3 objektiv 0,67 wegen Formulierung „loopback“; Modellurteil 2/2). Ressourceneinsparung allein zählt laut Kriterien nicht als Verbesserung.
- **Transfer:** Deckeneffekt (alle 1,0) → Transfer nicht diskriminierend gemessen.
- **Modellurteil (verblindet):** stuft C und D auf E2 höher ein als B und A; 1 dokumentierte Abweichung ≥ 0,5 (B/E2). Schlüsselwort-Brüchigkeit bei E4 (alle 0,67 objektiv, 2/2 Urteil).

## Strategie-Kandidaten (persistiert: `runs/strategy-candidates.json`)

Alle vier: Status `evaluated`, Empfehlung `keep_as_candidate_revise_or_retest` (kein objektiver Gewinn ggü. B; Transfer ohne Gewinn wegen Deckeneffekt; `cheap-observation-over-polling` in keiner Aufgabe angewandt). **Keine Übernahme.**

## Gültigkeitsgrenzen

Kleine Stichprobe (6 Aufgaben, je 1 Lauf, eine Sitzung pro Bedingung → Aufgaben innerhalb einer Bedingung nicht unabhängig); Schlüsselwort-Scoring ist brüchig; alle Modelle aus einer Familie (Unabhängigkeit der Bewertung nur funktional, nicht modellseitig); simulierte statt werkzeuggestützte Ausführung.

## Nächster Lauf (CE-02)

Schwierigere Transferaufgaben ohne Deckeneffekt; ≥ 3 Seeds/Läufe je Bedingung; Ausführung mit echten Werkzeugen in isolierter Runtime (Schritte/Ressourcen real gemessen); Zweitbewertung durch andere Modellfamilie oder Mensch; Schlüssel mit Synonymlisten vor dem Lauf erweitern.
