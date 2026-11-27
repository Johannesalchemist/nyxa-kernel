# CE-02 — Generative Relational Intelligence (Präregistrierung)

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Vorgänger | CE-01 (`research/ce-01`), CE-01b Pilot (abgeschlossen, `research/ce-01b`) |
| Quellen | ausschließlich im Repository veröffentlichte Befunde (Shards), Bewerter `research/scoring` |
| Epistemischer Status | `PRE-REGISTERED` · nicht durchgeführt · Review ausstehend |
| Nächster zulässiger Schritt | unabhängiger Holdout für den Bewerter → Läufe A–E |

**Hypothese (Owner):** Intelligenz ist nicht nur Eigenschaft einzelner Systeme, sondern kann aus Qualität, Vielfalt und Entwicklung ihrer Beziehungen entstehen.

**Operationalisierung:** Eine Erkenntnis gilt als *emergent*, wenn sie Prämissen aus mindestens zwei Wissensbereichen benötigt und kein einzelner Teilnehmer alle Prämissen besaß (`jointHypotheses().emergent`), prüfbar formuliert ist (Vorhersage + Falsifikator) und inhaltlich zum Schlüssel passt.

**Kontrolle des Informationszugangs:** Arm B erhält dieselbe Vereinigung aller Shards wie C–E. Ein Vorteil von C–E gegenüber B wäre relational; ein Vorteil von B gegenüber A ist nur Informationszugang. Die Entscheidungsregel steht in `criteria.json`.

Dateien: `criteria.json` (Arme, Kontrollen, Endpunkte, Entscheidungsregel), `learner-visible/` (Shards, Aufgaben, Antwortvertrag), `evaluator-only/keys.json`, `PRE-REGISTRATION.sha256`.

**Bekannte Grenzen vor Beginn:** kleine Aufgabenzahl (8); Shards aus NYXA-eigenem Material; Goldschlüssel durch dieselbe Sitzung verfasst (daher unabhängiger Holdout und unabhängige Juroren als Vorbedingung); Schlüssel liegen in einem öffentlichen Repository (Lerner-Läufe ohne Repo-Zugang).
