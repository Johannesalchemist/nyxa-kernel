# EI-01 — Emergent Intelligence Through Human–AI Collaboration (Digitalleria Dialogues Research Pilot)

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Herkunft | Vorschlag des Evolution Assistant (`modules/sophia/evolution-assistant/demo/run-2026-11-27.json`), vom Owner im Auftrag vom 2026-11-27 zur Ausarbeitung bestimmt |
| Status | `PREPARED` · keine Einladungen, keine Veröffentlichung (Freigabe F11 nötig) |

## Frage
Entstehen in gemischten Mensch-KI-Gruppen überprüfbare Erkenntnisse, die weder Einzelne noch rein menschliche oder rein maschinelle Gruppen hervorbringen? Was kostet das an Aufwand, und bleibt dabei die Selbstbestimmung der Menschen gewahrt?

## Bedingungen
Es gibt fünf Bedingungen: H1, H3, A1, A3 und M (gemischt). Material, Zeit, Reihenfolge, Messgrößen und Entscheidungsregel sind in `conditions.json` festgelegt. Die Einzelnotizen vor der Gruppenphase sind die Basis, an der Neuartigkeit und Erkenntnisgewinn gemessen werden.

## Rollen und Unabhängigkeit
`roles.mjs` (getestet) erzwingt drei Regeln:
- Wer den externen Bewerter-Prüfsatz erstellt hat, ist weder Juror noch Teilnehmender.
- Teilnehmende sind keine Juroren.
- Jede Identität ist über einen Passport gebunden: Menschen über einen Passkey-Principal (`modules/authority/room-identity`), Agenten über ihre Attestierungs-`key_id` (`modules/authority/actor-attestation`). Für Menschen ist zusätzlich eine Einwilligungsreferenz Pflicht.

## Identitäts- und Provenienzschicht
| Schicht | Vorhandene Komponente | Stand |
|---|---|---|
| Human Passport | Passkey Human Gate (`nyxa-authority-v1`, Grant v2) + Room-Identitätsbindung | Authority kennt derzeit **nur** den Principal `nyxa-owner`; für Teilnehmende ist eine Principal-Registrierung nötig (Teil von F9/F11) |
| Agent Passport | Agent Attestation V1 (Passport-Registry, Ed25519) | implementiert, nicht aktiviert (F3) |
| Provenienz der Beiträge | SRM-Claims + Kandidatenspeicher; `jointHypotheses()` verlangt Prämissen-IDs | implementiert |
| LightNet | im Repository nur als Konzept in Auftragstexten vorhanden; **keine Implementierung gefunden** | `unverified` — wird nicht neu erfunden; EI-01 nutzt die beiden Passports als Identitätsschicht |

## Unterlagen
`PARTICIPANT-INFO.md`, `CONSENT.md`, `MODERATION.md`.
