# Testprotokoll: isolierter kostenpflichtiger Live-Test V0.2 (vorbereitet, NICHT ausgeführt)

**Status:** `PREPARED — REQUIRES EXPLICIT APPROVAL`
**Erforderliche Freigabe:** schriftlich von Johannes Süß (Chat oder Kommentar), mit Datum, maximalem Budget und
Zustimmung zu Schritt T6 (irreversible Löschung bei Runway).
**Verfasst:** Claude Code, 2026-11-06, Europe/Berlin.

## 1. Zweck

Beobachtung des realen Verhaltens, das bisher nur gegen einen Mock getestet ist:

- Lebenszyklus der Session,
- Einmal-Credentials,
- tatsächlicher Credit-Verbrauch im Vergleich zur lokalen Schätzung,
- serverseitiges Abbrechen,
- Löschung der Gesprächsdaten.

## 2. Rahmen

| Parameter | Wert |
| --- | --- |
| Ausführende Person | Johannes Süß (volljährig), allein im Raum, keine Dritten in Mikrofonreichweite |
| Rechner | lokaler Rechner der ausführenden Person, `HOST=127.0.0.1` |
| Avatar | Preset `cooking-teacher` (kein eigenes Bild, keine fremden Persönlichkeitsrechte) |
| `RUNWAY_MAX_DURATION_S` | `60` |
| `MAX_CONCURRENT_SESSIONS` | `1` |
| `SESSION_CREATE_LIMIT` | `3` je 600 s |
| `RUNWAY_BUDGET_CREDITS` | `66` (reicht für höchstens 3 Sessions mit je 22 Credits Reservierung) |
| Erwarteter Maximalverbrauch | ≤ 66 Credits ≈ 0,66 USD (Preisliste vom 2026-11-06: 2 Credits sofort + 2 je 6 s; 60 s ⇒ 22 Credits je Session) |
| Gesprächsinhalt | nur Testsätze, keine personenbezogenen Angaben |

## 3. Ablauf

| Schritt | Aktion | Erwartung | Evidence |
| --- | --- | --- | --- |
| T0 | Kontostand und Credits im Developer Portal notieren; `avatars.getUsage` für heute | Ausgangswert | Screenshot (Mensch) + JSON |
| T1 | `npm ci && npm run verify` | grün | Konsolenausgabe |
| T2 | Server starten, anmelden, Session starten, ca. 20 s sprechen, „Beenden“ | Video erscheint; Status `ended`; Ledger `ended` mit `cancelAcknowledged` | `.state/audit.jsonl`, `.state/ledger.json` |
| T3 | Zweite Session starten, Tab hart schließen (ohne „Beenden“) | Server beendet die Session über `pagehide` oder spätestens nach `HEARTBEAT_TIMEOUT_S` | Audit: `client:pagehide` oder `heartbeat_lost` |
| T4 | Dritte Session: Credentials über `/consume` **zweimal** abrufen (Skript, nicht im Browser) | zweiter Abruf schlägt fehl (Einmal-Credential) | HTTP-Status beider Abrufe, ohne Token |
| T5 | Vierter Startversuch | `402 budget_exhausted` oder `429`, keine weitere Runway-Session | Antwort + Audit |
| T6 (optional, gesondert freizugeben) | `RUNWAY_DELETE_CONVERSATION_AFTER_END=true` für T2 bis T4 oder manuelles `DELETE` | Conversation danach nicht mehr abrufbar | HTTP-Status des Retrieve |
| T7 | `avatars.getUsage` und Portal-Credits erneut | Differenz ≤ Summe der lokalen `settledCredits` (sonst ist der Befund: Schätzung zu niedrig) | JSON + Screenshot |

## 4. Abbruchbedingungen (sofort beenden, Session per `DELETE` abbrechen)

- Ein Credit-Verbrauch über 66 Credits oder eine Abweichung der Schätzung um mehr als 20 %.
- Eine Session bleibt nach dem Ende im Portal `RUNNING`.
- Der API-Key erscheint in Konsole, Browser oder Logs.
- Mikrofon oder Video verhalten sich unerwartet, oder Dritte werden aufgenommen.

## 5. Gesammelte Evidence (redigiert)

`audit.jsonl`, `ledger.json`, die Konsolenausgabe ohne Token, Usage-JSON vorher und nachher sowie Screenshots
ohne Kontodaten. Ablage unter `modules/runway-dev-characters/evidence/live-YYYYMMDD/`. **Nicht** abgelegt werden:
Aufnahmen, Transkripte, Session-Keys und der API-Key.

## 6. Was dieser Test nicht beweist

- Kein Lasttest und keine Skalierbarkeit.
- Keine Datenschutzkonformität.
- Keine Eignung für Variante B (Sophia).
- Keine Eignung für Minderjährige.
