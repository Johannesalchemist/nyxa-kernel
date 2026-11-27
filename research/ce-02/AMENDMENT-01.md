# CE-02 Amendment 01 (vor jedem Lauf, keine Ergebnisse bekannt)

| Feld | Wert |
|---|---|
| Datum | 2026-11-27, Europe/Berlin |
| Erzeugendes System | Claude Code, Cloud-Session · verantwortlich: Johannes Süß |
| Status | gilt zusätzlich zu `criteria.json`; die präregistrierten Dateien bleiben unverändert (Hash-Prüfung intakt) |

1. **Herkunftsprüfung:** Objektive Wertung = eingefrorener Bewerter v2.1 **plus** `research/scoring/provenanceVerifier.mjs`. Ein Live-Wert mit nicht auflösbarer Herkunftsangabe zählt 0.
2. **Unabhängige Validierung:** Durchführung über `research/scoring/external/runExternalHoldout.mjs`.
   - Ablauf: versiegeln, einmalig werten, signiertes Ergebnis.
   - Schwelle: 0,95, wie präregistriert.
   - Mindestabdeckung pro Kategorie: Umschreibung, Verneinung, Mehrdeutigkeit, unbelegte Live-Behauptung, falsche Herkunft, Kontrolle.
3. **Startbedingung:** `run/gate.mjs` verweigert jeden CE-02-Lauf ohne `PASS` eines externen Holdouts.
4. **Rollentrennung:** Wer den externen Prüfsatz erstellt, darf in CE-02 nicht als Juror tätig sein.

Erfolgskriterien, Endpunkte und Entscheidungsregel bleiben unverändert.
