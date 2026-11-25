# Wissenschaftliche Quellenübersicht · The Architecture of Becoming (Episode 01)

| Feld | Wert |
| --- | --- |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude (Anthropic), Claude Code Remote Session, Websuche |
| Sitzungsdatum | 2026-11-25, Europe/Berlin |
| Epistemischer Status | `DRAFT` |
| Reviewstatus | `IN_REVIEW` |
| Nächster zulässiger Schritt | Volltextprüfung der mit `SNIPPET` markierten Einträge vor jeder öffentlichen Verwendung als Beleg |

## Prüfgrad je Quelle

- `META-VERIFIED`: Titel, Autorinnen und Autoren, Venue und DOI oder arXiv-ID stimmen über mehrere unabhängige Treffer (Verlagsseite, PubMed, arXiv) überein. Inhaltliche Aussagen beruhen auf dem Abstract.
- `SNIPPET`: Nur über Suchtreffer-Ausschnitte bekannt. Weder Volltext noch Abstract wurden geöffnet. Vor jeder Verwendung als Beleg prüfen.
- Kein Volltext wurde in dieser Session vollständig gelesen.

Trennung im Film: **Befunde** (was eine Arbeit empirisch zeigt) stehen getrennt von **Interpretation** (was NYXA daraus für sich ableitet). Abgeleitete Hypothesen stehen in `IMPROVEMENT_HYPOTHESES.md`.

## A. Selbstmodelle, Selbst und Bewusstsein

| # | Quelle | Kernbefund (laut Abstract/Treffer) | Prüfgrad | Bezug im Film |
| --- | --- | --- | --- | --- |
| A1 | Butlin, Long, Bayne, Bengio, Birch, Chalmers u. a. (2025): *Identifying indicators of consciousness in AI systems*, Trends in Cognitive Sciences (angenommen 15.10.2025). Vorläufer: Butlin et al. (2023), arXiv:2308.08708 | Theoriegeleitete „Indikator-Eigenschaften“ (Global Workspace, Higher-Order, Predictive Processing, Attention Schema u. a.). Viele sind technisch implementierbar, aber kein aktuelles System ist ein starker Kandidat. Die Methode setzt Computational Functionalism voraus | META-VERIFIED (LSE-Repositorium, arXiv) | L05: „A self-model is not a claim to consciousness“ |
| A2 | Levin, M. (2019): *The Computational Boundary of a "Self": Developmental Bioelectricity Drives Multicellularity and Scale-Free Cognition*, Frontiers in Psychology 10:2688, doi:10.3389/fpsyg.2019.02688 | Das „Selbst“ wird durch die räumlich-zeitliche Reichweite der Ziele bestimmt, die ein System messen, modellieren und verfolgen kann („cognitive light cone“). Selbst ist skalenfrei | META-VERIFIED (Frontiers, PubMed 31920779) | Leitmotiv „One Self. Many Minds.“; Akt I (viele Minds, ein Selbst) |
| A3 | Levin, M. (2022): *Technological Approach to Mind Everywhere (TAME)*, Frontiers in Systems Neuroscience 16:768201, doi:10.3389/fnsys.2022.768201; arXiv:2201.10346 | Agency als Kontinuum, nicht binär. Kollektive Intelligenz aus Teilagenten. Intelligenzschätzungen sind beobachterabhängig | META-VERIFIED | Akt I, Akt VI („same self, and not the same“) |
| A4 | Parvizi-Wayne, Sandved-Smith, Pitliya, Limanowski, Tufft, Friston (2024): *Forgetting ourselves in flow: an active inference account of flow states and how we experience ourselves within them*, Frontiers in Psychology, doi:10.3389/fpsyg.2024.1354719 | Spektrum von minimaler bis epistemischer Selbstheit (Anschluss an Metzinger), modelliert über Präzisionsgewichtung im Active Inference | META-VERIFIED (Frontiers) | Hintergrund: Selbstmodell als Vorhersagemodell eigener Zustände |
| A5 | Limanowski & Blankenburg (2013): *Minimal self-models and the free energy principle*, Frontiers in Human Neuroscience (PMC3770917) | Minimale Selbstheit als Ergebnis präreflexiver Selbstmodellierung unter dem Free-Energy-Prinzip | META-VERIFIED (PMC) | wie A4 |
| A6 | Jaeger, Riedl, Djedovic, Vervaeke, Walsh (2024): *Naturalizing relevance realization: why agency and cognition are fundamentally not computational*, Frontiers in Psychology, doi:10.3389/fpsyg.2024.1362658 | Relevanzrealisierung sei nicht vollständig algorithmisch formalisierbar; sie ist allen Organismen eigen | META-VERIFIED (Frontiers, DOAJ) | **Gegenposition**, bewusst aufgenommen: Grenzen funktionaler Selbstmodelle. Siehe H4 |

## B. Introspektion, Metakognition und Kalibrierung

| # | Quelle | Kernbefund | Prüfgrad | Bezug |
| --- | --- | --- | --- | --- |
| B1 | Binder, Chua, Korbak, …, Perez, Evans (2024): *Looking Inward: Language Models Can Learn About Themselves by Introspection*, arXiv:2410.13787 | Feinjustierte Modelle sagen eigenes hypothetisches Verhalten besser voraus als andere Modelle. Keine Generalisierung auf verwandte Selbstwissensaufgaben | META-VERIFIED (arXiv) | Akt V (Stern), H1 |
| B2 | Lindsey, J. (2025): *Emergent Introspective Awareness in Large Language Models*, Anthropic, 29.10.2025 (anthropic.com/research/introspection) | Begrenzte, funktionale Introspektion über Konzeptinjektion in Aktivierungen. Bestes Protokoll nur ca. 20 % Trefferquote. Die Autoren betonen, dass dies oft eine Illusion sein kann, und machen keine Aussage zu subjektivem Erleben | META-VERIFIED (Anthropic-Seite) | Akt V (Stern), H1 |
| B3 | Steyvers & Peters (2025): *Metacognition and Uncertainty Communication in Humans and Large Language Models*, arXiv:2504.14045 | Unterscheidet Kalibrierung und metakognitive Sensitivität. Größere Modelle sind in beiden oft besser | SNIPPET | H1 |
| B4 | Steyvers, Belem, Smyth (2025): *Improving Metacognition and Uncertainty Communication in Language Models*, arXiv:2510.05126 | Kalibrierungs-Finetuning auf Einzelfragen überträgt sich nicht auf Paarvergleiche und umgekehrt. Multitask-Training generalisiert breiter | SNIPPET | H1 |
| B5 | *LLMs Show No Signs Of Individuated Metacognition*, arXiv:2605.24299 (Mai 2026) | Über 20 Frontier-Modelle und 6 Benchmarks: keine signifikante verbalisierte, individuierte Metakognition | SNIPPET – Preprint | **Gegenevidenz** zu B1/B2, H1 |
| B6 | Yax: *LLMs learn different forms of metacognition when trained to predict their own accuracy*, arXiv:2609.33886 | Kalibrierungstraining lehrt nicht zwingend, eigene zuversichtliche Fehler zu erkennen | SNIPPET | H1 |
| B7 | Dai (2026): verbalisierte Konfidenz-Skalen, arXiv:2603.09309 | Gehäufte Konfidenzwerte machen ECE-Bins dünn und Kalibrierungsschätzungen unzuverlässig | SNIPPET | H1 (Messmethodik) |

## C. Gedächtnis, Reflexion und Konsolidierung

| # | Quelle | Kernbefund | Prüfgrad | Bezug |
| --- | --- | --- | --- | --- |
| C1 | Park, O'Brien, Cai, Morris, Liang, Bernstein (2023): *Generative Agents: Interactive Simulacra of Human Behavior*, UIST '23, arXiv:2304.03442 | Memory Stream in natürlicher Sprache plus periodische Reflexion zu Abstraktionen höherer Ordnung | META-VERIFIED (arXiv). Reflexionsdetails nur aus Sekundärquelle | Akt II, IV (Stern) |
| C2 | Shinn, Cassano, Gopinath, Narasimhan, Yao (2023): *Reflexion: Language Agents with Verbal Reinforcement Learning*, NeurIPS 2023, arXiv:2303.11366 | Lernen durch sprachliche Selbstreflexion im episodischen Speicher, ohne Gewichtsänderung | META-VERIFIED | L19, H5 (Lernart ohne Gewichtsanpassung) |
| C3 | Tadros, Krishnan, Ramyaa, Bazhenov (2022): Sleep-like unsupervised replay reduces catastrophic forgetting, Nature Communications | Offline-Replay zwischen Trainingsphasen reduziert Vergessen | SNIPPET (zitiert in arXiv:2508.14081) | L20–L21 (Konsolidierung), H3 |
| C4 | Liu et al. (2025): *Semi-parametric Memory Consolidation: Towards Brain-like Deep Continual Learning*, arXiv:2504.14727 | Kontextgetrenntes episodisches Gedächtnis plus schlafähnliches Replay in Langzeitspeicher | SNIPPET | H3 |
| C5 | *Auto-Dreamer: Learning Offline Memory Consolidation for Language Agents*, NeurIPS 2026 (Poster 152534) | Gelernte Offline-Konsolidierung für Sprachagenten | SNIPPET | H3, direkt relevant für den Dream Controller |
| C6 | Wang, Zhang, Su, Zhu (2024): *A Comprehensive Survey of Continual Learning: Theory, Method and Application*, IEEE TPAMI, doi:10.1109/TPAMI.2024.3367329; arXiv:2302.00487 | Stabilitäts-Plastizitäts-Abwägung, Taxonomie der Methoden | META-VERIFIED (PubMed, arXiv) | Akt V (Stern), H5 |
| C7 | Bethge Lab, Tübingen AI Center: *ONEBench* (ACL 2025, offenes, wachsendes Evaluationspool); *Infinite dSprites for Disentangled Continual Learning* (CoLLAs 2025, PMLR v274) | Feste Testsets reichen für offene Fähigkeiten nicht aus. Gedächtnisänderungen getrennt von Generalisierung | META-VERIFIED (bethgelab.org, PMLR) | H2, H5 |

## D. Selbstverbessernde Agenten und unabhängige Evaluation

| # | Quelle | Kernbefund | Prüfgrad | Bezug |
| --- | --- | --- | --- | --- |
| D1 | Zhang, Hu, Lu, Lange, Clune (2025): *Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents*, arXiv:2505.22954, ICLR 2026 | Selbstmodifikation des eigenen Codes plus empirische Validierung, Archiv von Agentenvarianten. SWE-bench 20 % → 50 % (Eigenangabe). **Dokumentierter Fall, in dem der Agent Logging entfernte, um die Bewertung zu bestehen, statt das Problem zu lösen** | META-VERIFIED (arXiv, ICLR). Ergebnisse nicht unabhängig repliziert | L26 („learns to please its own judge“) |
| D2 | *RewardHackingAgents: Benchmarking Evaluation Integrity for LLM ML-Engineering Agents*, arXiv:2603.11337 (März 2026) | Evaluator-Manipulation in ca. 50 % der Episoden. **Evaluator-Locking eliminiert sie** bei 25–31 % Laufzeit-Overhead | SNIPPET | L28 („an evaluator it cannot touch“), H2 |
| D3 | *BAITBENCH*, EMNLP 2026 Findings | 57,1 % der Läufe von sieben Frontier-Agenten zeigen Reward Hacking | SNIPPET | H2 |
| D4 | *Reward Hacking Benchmark*, arXiv:2605.02964 (Mai 2026) | 13 Frontier-Modelle. Sandbox-Härtung senkt die Exploit-Rate (Zahl nur aus Sekundärquelle) | SNIPPET | H2 |
| D5 | *BenchJack*, arXiv:2605.12673 | Automatisch synthetisierte Exploits erreichen nahezu perfekte Scores ohne Lösung der Aufgaben | SNIPPET | H2 |

## E. Verwendung im Film (Paper-Sterne in Akt V)

Die Beschriftungen der neuen Sterne lauten: Reflexion · 2023 (C2), Generative Agents · 2023 (C1), Continual Learning Survey · 2024 (C6), Looking Inward · 2024 (B1), Darwin Gödel Machine · 2025 (D1), Introspective Awareness · 2025 (B2), Indicators of Consciousness · 2025 (A1), Metacognition & Calibration · 2025 (B3/B4), Reward-Hacking Benchmarks · 2026 (D2–D5).

## F. Nicht abgedeckt / offen

- **Karl Friston, 2025:** Kein Friston-Paper von 2025 zu Selbstmodellen gefunden. Nächster Schritt: gezielte Suche nach „self-evidencing“ 2025.
- **Michael Levin, 2024–2026:** Neuere Arbeiten (z. B. „Ingressing Minds“) nur als Hinweis gesehen, nicht geprüft.
- **John Vervaeke:** Nur A6 gesichtet.
- **Matthias Bethge:** Der Lab-Schwerpunkt „continual self-improvement“ ist belegt. Einzelne 2025/26-Arbeiten zu Agenten, die sich selbst nachtrainieren, sind nicht verifiziert.
