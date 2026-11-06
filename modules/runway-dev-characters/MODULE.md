# Modul: runway-dev-characters

**Artefaktstatus:** `DRAFT`
**Quellenstatus:** `SOURCE-BOUND` (an die öffentliche Runway-Dev-Dokumentation vom 2026-11-06 gebunden; nicht unabhängig geprüft)
**Epistemischer Status:** technischer Integrationsprototyp. Er trifft keine Forschungsaussage und ist kein Pilotmodul.
**Reviewstatus:** ungeprüft (`PENDING REVIEW`)

## Herkunft

| Feld | Wert |
| --- | --- |
| Verantwortlicher Mensch | Johannes Süß (Auftraggeber der Session) |
| Erzeugendes System | Claude Code (Anthropic), Cloud-Session; das genaue Modell ist in den Sitzungsmetadaten vermerkt |
| Sitzungsdatum | 2026-11-06, UTC |
| Branch | `claude/runway-dev-setup-c53ss0` (von der Session vorgegeben, kein Präfix nach AGENTS.md: `unverified`) |
| Vorgänger | keiner (neues Modul) |

## Verwendete Quellen

| Quelle | Status |
| --- | --- |
| https://dev.runway.com/quickstart.txt | gelesen 2026-11-06 |
| https://docs.dev.runwayml.com/llms.txt, `/ai-context.md` | gelesen 2026-11-06 |
| https://docs.dev.runwayml.com/api.md (`POST /v1/realtime_sessions`, Modell `gwm1_avatars`, Preset-IDs) | gelesen 2026-11-06 |
| https://docs.dev.runwayml.com/_llms-txt/characters.txt (Integration, Session-Lebenszyklus) | gelesen 2026-11-06 |
| `runwayml/avatars-sdk-react`, `examples/vanilla-js` und `packages/core` (Lesekopie, nicht übernommen) | gelesen 2026-11-06 |
| Runway-Dev-Plugin-Skills `runway-dev`, `runway-dev-characters` (`runway-api@claude-plugins-official`) | gelesen 2026-11-06 |

Die Preise wurden bewusst nicht übernommen. Maßgeblich ist allein https://docs.dev.runwayml.com/guides/pricing.md.

## Abgrenzung (Repository Policy §2)

Das Modul ist ein eigenständiger Prototyp unter `modules/`. Es enthält keine Secrets, keine produktive Konfiguration und keine Freigabe. Ob es dauerhaft hier oder in `Johannesalchemist/nyxa-kernel-runtime` liegen soll, ist **nicht entschieden** (offener Blocker, siehe Handoff). Personendaten: Gesprächsinhalte und Transkripte laufen über Runway. Für einen Einsatz mit realen Personen ist vorher eine Datenschutz- und Ethikprüfung nötig.

## Nächster zulässiger Schritt

1. Review des Moduls.
2. Ein Mensch führt mit eigenem Key einen lokalen Live-Test durch (verbraucht Credits).
3. ADR zum Ablageort (Kernel oder Runtime) und zu einer möglichen Verwendung von Characters im Pilot `Schule in der Hosentasche`. Der Pilot bleibt bis zum Freeze nicht autorisiert.
