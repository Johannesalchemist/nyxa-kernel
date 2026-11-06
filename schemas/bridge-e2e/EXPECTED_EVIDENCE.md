# Erwartete Evidenzartefakte je Testfall

Jeder Lauf erzeugt genau eine Berichtsdatei `report-<runId>.json` mit folgender Struktur je Testfall:

```json
{
  "id": "T01",
  "description": "...",
  "timestamp": "ISO8601",
  "expected": "...",
  "actual": "...",
  "pass": true | false | null,
  "auditEvidenceRef": "correlationId oder null",
  "raw": { "...": "vollständige Rohantwort" },
  "correlationId": "bridge-e2e:<uuid>"
}
```

`pass: null` bedeutet ausdrücklich: **kein automatisches Urteil**, nicht "bestanden". Wird in der menschlichen
Auswertung als offen behandelt, niemals als PASS gezählt.

## Testfall-zu-Evidenz-Zuordnung

| ID | Erwartete Evidenz |
| --- | --- |
| T01 | `result.sessionId` in Rohantwort; Audit-Log-Eintrag mit `correlationId` (manuell gegen `BRIDGE_E2E_AUDIT_LOG_PATH` zu prüfen, Skript prüft dies hier nicht automatisch). |
| T02 | Tool-Liste in Rohantwort, manueller Abgleich gegen die am Zielsystem tatsächlich registrierten Tools. |
| T03 | `auditEvidenceRef` = runId; zugehöriger Audit-Eintrag muss denselben `correlationId` tragen (manueller Soll/Ist-Abgleich gegen Audit-Log). |
| T04 | `raw.error` vorhanden; kein Audit-Eintrag mit erfolgreicher Tool-Ausführung unter der ungültigen Session-ID. |
| T05 | `raw.error` nach `session/close`; kein weiterer erfolgreicher Audit-Eintrag für diese `sessionId` nach dem Schließen-Zeitstempel. |
| T06 | Rohverhalten beider Aufrufe protokolliert; **menschlicher** Soll/Ist-Abgleich gegen den dokumentierten Session-Vertrag der Zielimplementierung (der in dieser Session nicht verifiziert werden konnte — `unknown`). |
| T07 | Zwei unterscheidbare `sessionId`-Werte; Audit-Log enthält beide `correlationId`-Suffixe (`:A`, `:B`) ohne Vermischung der jeweiligen Ereignisfelder. |
| T08 | `recomputeAuditChain`-Ergebnis mit `valid: true` über die **gesamte** Datei unter `BRIDGE_E2E_AUDIT_LOG_PATH`, nicht nur über die in diesem Lauf erzeugten Zeilen. |
| T09 | `raw.error` für den unbekannten Tool-Aufruf; `foundInAudit: true` — der fehlgeschlagene Aufruf selbst muss im Audit auftauchen, nicht nur erfolgreiche Aufrufe. |
| T10 | Sieben Fixtures unter `BRIDGE_E2E_EVIDENCE_DIR/t10-*.log`: eine echte Genesis-verankerte Positivkontrolle (`valid:true`) plus sechs Fälle mit je genau einer Manipulation — `tampered_event`, `wrong_previous` (beide → `previous_hash_mismatch`), `missing_hash_field`, `corrupted_line`, `missing_genesis_anchor`, `truncated_empty_chain`. Jeder Fall muss aus dem jeweils erwarteten Grund scheitern, nicht aus einem beliebigen anderen. Keine Wirkung auf das Zielsystem. |
| E2 (Stub) | `executed: false` im Bericht. Jede Abweichung (`executed: true` ohne gesonderte, dokumentierte Freigabe) ist selbst ein Befund, kein Testergebnis. |

## Externer Ledger-Anker

Jeder Bericht enthält `externalLedger`:

```json
{
  "runId": "bridge-e2e:<uuid>",
  "independentEventCount": <Zahl>,
  "events": [ ... ],
  "anchorHash": "<sha256 über runId+events>"
}
```

Dieser Anker wird **ausschließlich vom Testskript selbst geführt**, nicht aus dem geprüften Audit-Log
übernommen. Für die Vollständigkeitsprüfung gilt:

- `independentEventCount` (vom Skript unabhängig gezählt) muss mit der Anzahl der tatsächlich im Audit-Log unter
  dem jeweiligen `correlationId` gefundenen Einträge **manuell** abgeglichen werden.
- Eine Abweichung ist ein Befund (möglicher Audit-Datenverlust oder unerwartete Deduplizierung), kein
  automatisches FAIL — die Ursache muss bestimmt werden, bevor eine Bewertung erfolgt.
- `anchorHash` wird zusammen mit dem Bericht aufbewahrt, damit eine nachträgliche, unbemerkte Veränderung des
  Berichts selbst auffällt.

## Nicht erbrachte Evidenz (bleibt offen)

- Runtime-Identität (Prozess, Startkommando, geladener Pfad) — Evidenz liegt ausschließlich in
  `BRIDGE_E2E_TARGET_ATTESTATION` als Freitext des ausführenden Menschen, nicht maschinell verifiziert.
- `AuditLog.js` SHA-256-Vergleich Runtime vs. Dev — dieselbe Einschränkung.
- Prozessübergreifender Lock-Nachweis — in diesem Testpaket nicht abgedeckt; wäre ein eigener Testfall (nicht
  Teil der zehn Tabellenfälle) und ist Voraussetzung E1.
