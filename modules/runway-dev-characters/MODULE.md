# Modul: runway-dev-characters

**Version:** V0.2 (Integrationskandidat, sicherheitsgehärtet)
**Artefaktstatus:** `DRAFT`
**Quellenstatus:** `SOURCE-BOUND` (Runway-Dev-Dokumentation und SDK-Typen vom 2026-11-06; nicht live verifiziert)
**Epistemischer Status:** technischer Integrationsprototyp. Er trifft keine Forschungsaussage und ist kein Pilotmodul.
**Reviewstatus:** `PENDING INDEPENDENT REVIEW`
**Ablage:** vorläufig. ADR-0003 schlägt den Umzug des Codes nach `nyxa-kernel-runtime/apps/runway-characters/` vor.

## Herkunft

| Feld | Wert |
| --- | --- |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code (Anthropic), Cloud-Session; das Modell ist in den Sitzungsmetadaten vermerkt |
| Sitzungsdatum | 2026-11-06, Europe/Berlin |
| Arbeitsauftrag | „WORK HANDOFF: NYXA × Runway Characters V0.2“ (Chat, Auftraggeber Johannes Süß; nicht im Repository, Status `UNVERIFIED` als Quelle) |
| Branch | `agent/runway-characters-v0.2` (lokal, nicht gepusht) |
| Vorgänger | V0.1, Commit `4179d96` auf `claude/runway-dev-setup-c53ss0` |

## Verwendete Quellen

| Quelle | Status |
| --- | --- |
| `@runwayml/sdk` 4.24.0: Typdefinitionen `realtime-sessions`, `avatars`, `avatar-conversations` | gelesen 2026-11-06 |
| `@runwayml/avatars` 0.17.0: `dist/api.d.ts` | gelesen 2026-11-06 |
| https://docs.dev.runwayml.com/_llms-txt/characters.txt (SHA-256 `b1d7eb7b9ab6059034b9c85cc0a5d91bf0f5dc9df577250e6f88a8f4a269f81a`) | gelesen 2026-11-06 |
| https://docs.dev.runwayml.com/guides/pricing.md (SHA-256 `62146f887e9c3ac41bbb6963ef87fa0f1d1408ea8da2fabe37f87ef7ac582e6c`) | gelesen 2026-11-06 |
| https://docs.dev.runwayml.com/_llms-txt/core-api.txt (SHA-256 `8660974040f588d8a45a5a8471dc00bb354e6311ede8b1352fe604bf49cb7046`) | gelesen 2026-11-06 |
| `nyxa-kernel-runtime` `a50e376`, `src/core/multiAgentGovernance.ts` (Dispositionen) | gelesen 2026-11-06 |
| `thechat` `7aaa471` (Sophia-Bestandsaufnahme, ADR-0004) | gelesen 2026-11-06 |

## Sicherheitseigenschaften (technisch erzwungen, gegen Mock getestet)

- Bindung nur an Loopback; jede andere Adresse erfordert `ALLOW_REMOTE_BIND=true` **und** ein Zugangstoken.
- Ohne `NYXA_ACCESS_TOKEN` ist der Zugriff gesperrt (fail closed). Anmeldung erfolgt über ein HttpOnly- und SameSite=Strict-Cookie.
  Prüfungen: Host-Allowlist, Origin und JSON-Content-Type. Login-Versuche sind ratenbegrenzt.
- Policy-Gate vor jeder kostenpflichtigen Aktion. Nur `ALLOW` handelt. Pilot- und Minderjährigenkontexte führen zu `ESCALATE`.
- Budget (Standard 0), Parallelität (Standard 1), Ratenlimit und `maxDuration` (Standard 120 s) gelten. Der Ledger ist persistent, die Prüfung atomar.
- Idempotency-Key gegen Doppelstart und Replay; Control-Token pro Session.
- Cleanup bei FAILED, Timeout, Polling-Fehler und Client-Abbruch. Ein Reaper beendet Sessions bei Connect-Timeout, Heartbeat-Verlust oder überschrittener Maximaldauer.
  Beim Neustart beendet die Recovery offene eigene Sessions. Ein Lock verhindert Parallelprozesse.
- Audit-Trail ohne Secrets, IPs und Transkripte (Redaktion erzwungen).

Einzelnachweise: `docs/VERIFICATION_V0.2.md`. Datenschutz: `docs/PRIVACY_V0.2.md`.

## Grenzen

- Kein Live-Test gegen Runway. Kosten sind eine lokale Schätzung nach der Preisliste, keine Abrechnungsdaten.
- Einzelbetreiber-Werkzeug (ein Token, keine Rollen). Nicht für öffentlichen Betrieb gedacht.
- Keine Sophia-Integration (ADR-0004: Zielbild Variante B, nicht umgesetzt).
- **Nicht** Teil von `Schule in der Hosentasche`. Der Pilot ist nicht autorisiert und wird technisch eskaliert.

## Nächster zulässiger Schritt

1. Unabhängige Review von V0.2.
2. Entscheidung zu ADR-0003 (Ablage) und ADR-0004 (Variante).
3. Freigabe des isolierten Live-Tests nach `docs/LIVE_TEST_PROTOCOL_V0.2.md`.
