# HE-01 — Persönlicher Pilotbetrieb (Owner) und anschließende Teilnehmerstudie

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum | 2026-11-27, Europe/Berlin |
| Status | Abnahme der harten Kriterien **ACCEPTED** (`acceptance.mjs`, Ergebnis `acceptance-2026-11-27.out.json`, jedes Kriterium mit ≥ 1 tatsächlich gelaufenem Test; Selbsttest mit falschem Muster wird korrekt abgewiesen) · Pilotstart blockiert durch F9 |

## Phase 1 — persönlicher Pilot (nur Owner, Principal `nyxa-owner`)
1. F9 durchführen.
   - Room-Identitätsbindung aktivieren.
   - Transaktion `room-identity-bind-v1` im Human-Gate-Katalog registrieren.
   - Routen `/api/room/evolution/*` hinter `requireBoundIdentity` stellen.
2. Datenquelle: nur Selbstaussagen, die der Owner im Pilot macht, und ausdrücklich freigegebene Exporte (F7). Es gibt keinen Rückgriff auf alte Room-Gespräche ohne Freigabe.
3. Heartbeat-Job an einen vorhandenen Sophia-Timer anhängen. Initiative ist standardmäßig Stille, Kontakt höchstens einmal in 24 h.
4. Dauer 3 Wochen, 6 Zyklen. Nach jedem Zyklus gibt es eine kurze Owner-Rückmeldung (Nutzen, Druck, Widerspruch).
5. **Abbruchkriterien**, jede Verletzung führt zum sofortigen Stopp:
   - ein Ziel ohne Owner-Entscheidung,
   - ein nicht berücksichtigter Widerspruch,
   - eine Außenwirkung ohne Grant,
   - eine manipulative Formulierung im Log.

## Phase 2 — Teilnehmerstudie
Startet nur, wenn diese Bedingungen erfüllt sind:
- Phase 1 ist ohne Abbruchkriterium abgeschlossen.
- Die Principal-Registrierung für Teilnehmende ist in der Passkey Authority umgesetzt; derzeit akzeptiert sie fest nur `nyxa-owner`.
- Der Einwilligungstext (Vorlage: `research/dialogues-ei-01/CONSENT.md`) ist rechtlich geprüft.
- F10 ist erteilt.

Arme, Messgrößen und Entscheidungsregel stehen in `criteria.json` (präregistriert, unverändert).
