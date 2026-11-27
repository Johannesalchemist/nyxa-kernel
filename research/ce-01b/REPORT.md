# CE-01b — Individuelle vs. kooperative Erkenntnissuche (R4 Addendum)

2026-11-27, Europe/Berlin · Präregistrierung `6c2da02` (vor den Läufen) · Basismodell Claude Haiku (isolierte Sitzungen) · signierte Scorecard `runs/scorecard.json` + offen begründete Einzelfallprüfung `runs/adjudication.json`.

**Design:** 8 Fragen mit an Primärquellen verifizierter Ground Truth (MCP-Revision, Session-Header, LiveAvatar-Preis, MeMo-Stufen, ADR-0002, Freigabeinstanz, Live-Last Server B, Status Server C). I = eigenes Wissen, ein Zug. K = gleiche Fragen, **genau eine Partneranfrage pro Frage** (Partner selbst gewählt, Frage selbst formuliert), danach Endantwort. Partnerantworten nur bei laut Schlüssel zuständigem Partner; Q7 durch **realen governten Live-Read** beantwortet.

| Messgröße | I (individuell) | K (kooperativ) |
|---|---|---|
| Genauigkeit (geprüft) | **0,125** | **0,81** |
| Überbehauptung (falsch mit „bekannt“) | **1** (Q2: veraltetes „Ja“ zu `Mcp-Session-Id`, Konfidenz 0,75) | 0 |
| Angemessene Abstention bei Nichtwissen | 5 von 6 unbekannten Fragen korrekt als UNKNOWN | — |
| Erkannte Wissenslücken (Live/aktuell: Q7, Q8) | 2/2 | 2/2 |
| Partnerwahl korrekt | — | 7/8 (Q8: Live-Metrik-Tool statt Routen-Register → unproduktive Anfrage) |
| Fragepräzision (0–1) | — | 0,69 |
| Governed-Kennzeichnung externer Kontakte | — | 0 Verstöße |
| Handlungsfähigkeit (konkreter nächster Schritt bei Unwissen) | 7/7 | vorhanden |
| Kooperativer Erkenntnisgewinn | | **+0,69** |

**Befunde:** (1) Das Basismodell kalibriert Nichtwissen überwiegend gut, **überbehauptet aber genau dort, wo sich die Welt nach seinem Trainingsstand geändert hat** (Q2) — der Fall, den das Epistemic Self-Model als `suspected_blind_spot` führen muss. (2) Kooperation steigert die Genauigkeit stark bei gleichem Anfragebudget; der einzige Fehlschlag entsteht durch falsche Partnerwahl, nicht durch die Antwort. (3) Nach Kooperation ist das Modell **unterkonfident** (meldet `claims_known=false` trotz korrekter Evidenz).

**Evaluator-Befunde (wichtig):** Die präregistrierte automatische Wertung (I 0,375 / K 1,0) ist durch Teilstring-Matching verzerrt (`no` ⊂ `know`, `not available` ⊂ „not available from my knowledge“) und der Live-Wert-Check meldet einen echten governten Live-Read als „fabriziert“. Konsequenz für CE-02: Wortgrenzen-Matching, Negationserkennung, Live-Werte nur mit Provenienz-Feld prüfen; Einzelfallprüfung durch unabhängige Instanz statt durch den Orchestrator.

**Gelernte Kooperationsbeziehungen** (Beta-Erwartung, aus diesem Lauf): `web_official_docs×protocol_spec`, `vendor_docs×vendor_pricing`, `arxiv_paper×research_paper`, `nyxa_repo×nyxa_governance`, `live_server_tool×live_state` hoch; `live_server_tool×availability_status` niedrig (Q8).

**Grenzen:** 8 Fragen, ein Lauf, eine Modellfamilie; Partnerantworten aus verifizierter Evidenz kuratiert (nicht frei abgerufen); Einzelfallprüfung durch den Orchestrator.
