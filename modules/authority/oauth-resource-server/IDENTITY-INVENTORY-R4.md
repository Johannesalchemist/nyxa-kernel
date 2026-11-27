# Identity-Infrastruktur: Eignung für MCP-Autorisierung (R4) — REDIGIERT

2026-11-27 · live geprüft (Server A, read-only) · Bewertung nach tatsächlich benötigten MCP-`2026-07-28`-Funktionen, nicht nach JWT-Unterstützung.

| Benötigte Funktion (MCP 2026-07-28) | Human Gate (WebAuthn + Ed25519-Issuer) | Supabase Auth (GoTrue v2.189.0) |
|---|---|---|
| OAuth 2.1 Authorization Code + PKCE als AS für fremde Clients | nein (Freigabe-Instanz, kein AS) | `unverified` (Discovery-Endpunkte lokal nur mit API-Key erreichbar → nicht geprüft) |
| RFC 8414 / OIDC Discovery | nein | `unverified` (s. o.) |
| Audience je Ressource (RFC 8707 `resource`) | n/a | **nicht gegeben** im aktuellen Betrieb: feste Audience `authenticated` für alle Tokens |
| Client-Registrierung (Client ID Metadata Documents / Pre-Registration) | nein | `unverified` |
| Asymmetrische Signatur, JWKS | Ed25519 (intern) | ES256 vorhanden; **zusätzlich** symmetrischer HS256-Schlüssel konfiguriert |
| Widerruf | eigene Grant-Ledger | Session-Revocation vorhanden, Access-Token bis Ablauf (3600 s) gültig |

**Ergebnis:** Supabase Auth ist in der aktuellen Konfiguration **nicht** als MCP-Autorisierungsserver geeignet: keine ressourcenspezifische Audience, Discovery und Client-Registrierung unbestätigt. Eignung erst nach Prüfung des OAuth-Server-Funktionsumfangs der eingesetzten GoTrue-Version (mit Operator-Zugang) und mit ressourcengebundener Audience. Das Human Gate bleibt Freigabe-Instanz für Mandate/Grants; OAuth ersetzt weder Agent Passport/Attestierung noch Capability Gate oder Human Authority.

**Sicherheitsereignis (R4):** Bei der Inventur wurde Signaturschlüsselmaterial des Auth-Dienstes versehentlich in eine Sitzungsausgabe geschrieben (nicht in dieses Repository). Rotation ist als Freigabe F6 angefordert (Handoff R4).

Praktische Clienttests (Claude-Webconnector, ChatGPT) setzen einen geeigneten AS + Deployment des Guards voraus → vorbereitet, nicht durchgeführt.
