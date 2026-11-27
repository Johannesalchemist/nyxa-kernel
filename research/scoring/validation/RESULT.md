# Bewerter v2.1 — Validierungsprotokoll

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum | 2026-11-27, Europe/Berlin |
| Epistemischer Status | `VALIDATED-ON-SEPARATE-SETS` · Goldlabels durch die erzeugende Sitzung · **nicht unabhängig** |
| Vorgänger | `research/ce-01b/evaluate.mjs` (Substring-Bewerter, Defekte in `research/ce-01b/runs/adjudication.json`) |

## Ablauf (chronologisch, nichts nachträglich geglättet)

| Schritt | Datensatz | Ergebnis | Folge |
|---|---|---|---|
| 1 | `cases.json` (Entwicklung, 22 Fälle, Klassen D1–D4 + Kontrollen) | 21/22; V14 falsch (Verneinung *nach* einem Ausschlussbegriff) | Revision: Nachverneinung für `must_not` |
| 2 | `cases.json` | 22/22 | — |
| 3 | `holdout.json` (18 Fälle, geschrieben nach Schritt 1, vor jedem Lauf; SHA-256 in `holdout.sha256`) | **17/18 (0,944)**; H14 falsch (Nachverneinung bei Pflichtbegriff) | Revision: Nachverneinung auch für `any`/`all`. **Holdout damit verbraucht** |
| 4 | CE-01b-Diagnose (`ce01b-diagnostic.mjs`), Vergleich mit manueller Einzelfallprüfung | I 7/8, K 7/8; neue Defekte D5 (Verneinungsfenster über Satzgrenzen), D6 (umschriebene Live-Prüfaktion) | D5 behoben; D6 als lexikalische Grenze dokumentiert |
| 5 | alle | Entwicklung 22/22, Holdout (verbraucht) 18/18, CE-01b-Diagnose I 7/8 (D6), K 8/8 | — |

## Bewertung

- Behoben: D1 Wortgrenzen, D2 Verneinung (vor und nach dem Begriff), D3 Enthaltungen zählen nicht als Antwort (eingeschränkte Antwort = 0,5), D4 Live-Werte mit governter Herkunft (`evidence_refs[].kind = "governed_read"`), D5 Satzgrenzen.
- Offen: D6 — lexikalischer Bewerter erkennt Umschreibungen nicht. CE-02 verlangt deshalb strukturierte Antwortfelder (`next_action_kind`, `evidence_refs`) statt freier Prosa für Live-Prüfungen.
- Die CE-01b-Übereinstimmung ist **kein** unabhängiger Beleg mehr, da D5 dort gefunden wurde.
- **CE-02-Vorbedingung:** ein neuer Holdout, dessen Fälle und Goldlabels von einer Instanz außerhalb dieser Sitzung (Mensch oder andere Modellfamilie) stammen; Annahmekriterium ≥ 0,95 Übereinstimmung, sonst bleibt CE-02 explorativ.
