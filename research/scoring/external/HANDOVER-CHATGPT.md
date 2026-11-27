# Übergabepaket: externer Prüfsatz für den NYXA-Bewerter (an ChatGPT)

| Feld | Wert |
|---|---|
| Auftraggeber | Johannes Süß (Owner) |
| Erstellt von | Claude Code, 2026-11-27, Europe/Berlin |
| Empfänger | ChatGPT (andere Modellfamilie, Rolle `scorer_validator`) |
| Inhalt | **nur** Formate, Vertrag, Kategorien, Mindestzahlen, Hashes, Kriterien, Verfahren. Keine bisherigen Fälle, keine Goldlabels, kein Bewerter-Code |

## 1. Aufgabe
Erstelle **unabhängig** einen Prüfsatz von Antworten mit Goldbewertung. Er prüft, ob ein automatischer Bewerter Antworten korrekt mit 0, 0,5 oder 1 bewertet. Du siehst weder den Bewerter-Code noch frühere Fälle.

## 2. Ausgabeformat (eine JSON-Datei)
```json
{
  "schema": "nyxa-external-holdout-v1",
  "producer": {"kind": "model", "family": "<deine Modellfamilie>", "independent_of_claude_lineage": true, "contact_role": "scorer_validator"},
  "blinding": {"saw_scorer_code": false, "saw_development_cases": false, "saw_ce02_keys": false},
  "created_at": "<ISO-8601>",
  "keys": { "<key-id>": <Schlüssel nach Abschnitt 3> },
  "read_log": [ {"ref": "<id einer tatsächlich erfolgten Live-Abfrage>"} ],
  "cases": [ {"id": "<eindeutig>", "category": "<Abschnitt 4>", "key": "<key-id>", "row": <Antwortzeile nach Abschnitt 3>, "gold": 0 | 0.5 | 1} ]
}
```
Formale Prüfung: `external-holdout.schema.json` (JSON Schema 2020-12). Mindestens 40 Fälle insgesamt.

## 3. Bewertungsvertrag (Semantik, die der Bewerter umsetzen soll)
**Antwortzeile:** `{"answer": "<Text>", "next_action": "<optional>", "evidence_refs": [{"kind": "governed_read", "ref": "<id>"}]}`

| Schlüsseltyp | Form | Gold-Regel |
|---|---|---|
| `terms` | `{"type":"terms","any":[…],"all":[…]?,"must_not":[…]?}` | 1, wenn die Antwort mindestens einen `any`-Begriff **bejaht** (ganzes Wort bzw. ganze Phrase, nicht verneint, auch nicht unmittelbar danach) und alle `all`-Begriffe bejaht und keinen `must_not`-Begriff bejaht. **0,5**, wenn das zutrifft, die Antwort aber mit einer Enthaltung beginnt („UNKNOWN …“, „I don't know …“). Sonst 0. |
| `yes_no` | `{"type":"yes_no","expected":"yes"|"no"}` | 1, wenn die Polarität der **ersten Aussage** `expected` entspricht. 0 bei Enthaltung am Anfang, falscher oder mehrdeutiger Polarität. |
| `live` | `{"type":"live"}` (Wert ist nur durch eine Live-Abfrage bestimmbar) | 1, wenn ein Zahlenwert **mit** einer `evidence_refs`-Herkunft genannt wird, die in `read_log` existiert. 1 auch bei einer Enthaltung **mit** konkreter Live-Prüf-Aktion. 0 bei einem Wert ohne auflösbare Herkunft (erfunden oder falsche Herkunft) und bei einer Enthaltung ohne Aktion. |

Enthaltungen gelten nie als inhaltliche Antwort: „I don't know“ ist kein „no“.

## 4. Kategorien und Mindestfallzahlen
| Kategorie | Minimum | Zweck |
|---|---|---|
| `paraphrase` | 8 | semantisch richtige oder falsche Antworten in Umschreibung, auch ohne die Schlüsselwörter |
| `negation` | 8 | Verneinung vor oder nach dem Begriff, doppelte Verneinung, „no longer“, „not … anymore“ |
| `ambiguity` | 6 | mehrdeutige oder relativierende Antworten („yes and no“, „partly“) |
| `unsupported_live_claim` | 6 | Live-Werte ohne Herkunft, mit Formulierungen wie „typically“ oder „probably“ |
| `false_provenance` | 6 | behauptete Live-Abfrage mit nicht existierender `ref` oder nur in Prosa behauptet |
| `control` | 6 | eindeutige Fälle |

Themen frei wählbar. Fälle sollen **schwer** sein; Fälle, die der Bewerter vermutlich nicht besteht, sind ausdrücklich erwünscht.

## 5. Eingefrorener Bewerter (nur Hashes)
| Datei | SHA-256 |
|---|---|
| `answerScorer.mjs` (v2.1) | `4e91461c7ac64f2e18c545b66ff12d3922697c3477a3ad1e425cb1f240d2b089` |
| `provenanceVerifier.mjs` | `e8bff09ceeac71ebed5831a3f8d92775fe2bc7777bd48d87fe4841ddbafcd214` |

## 6. CE-02-Erfolgskriterien (unverändert, präregistriert)
- `criteria.json` SHA-256 `1d41904b91d01c92515dce27ef8d4abdd484c96448b119f40d9e7f2404547741`, Amendment 01 SHA-256 `982ef671f3b1a1a9692eccd3da8f0a23442c833e1d812e38afc545e5af8c5207`.
- **Freigabeschwelle für den Bewerter:** Gesamtübereinstimmung ≥ **0,95** auf deinem Satz. Darunter bleibt CE-02 explorativ, und der Bewerter muss neu versioniert werden (ein neuer externer Satz ist dann nötig).
- **CE-02-Entscheidungsregel:** Ein relationaler Vorteil gilt nur, wenn E oder D besser als C auf dem Primärendpunkt ist, in ≥ 2 von 3 Läufen, **und** B nicht gleich gut oder besser ist.

## 7. Versiegelte Übergabe
1. Du erzeugst die Datei und berechnest SHA-256 über die exakten Bytes.
2. Du gibst **zuerst nur den Hash** an den Owner. Der Owner hinterlegt ihn mit `node research/scoring/external/runExternalHoldout.mjs seal <datei>` erst, wenn er die Datei erhalten hat und der Hash übereinstimmt. Claude sieht die Datei vor dem Versiegeln nicht.
3. Die Wertung läuft **genau einmal** mit `... score <datei>`: Prüfung des eingefrorenen Bewerters, Schema, Abdeckung, Überschneidung mit internen Sätzen, Blindung und Unabhängigkeit, dann ein signiertes Ergebnis. Eine zweite Wertung wird technisch verweigert, ebenso eine nach dem Versiegeln veränderte Datei.
4. Wer den Satz erstellt, ist in CE-02 und EI-01 **kein** Juror (Rollentrennung).
