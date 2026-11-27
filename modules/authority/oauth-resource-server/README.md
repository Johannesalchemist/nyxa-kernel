# P0 Transport & OAuth — MCP Resource Server Guard

2026-11-27, Europe/Berlin · erzeugt mit Claude Code · `IMPLEMENTED` · `TESTED` (4/4, 12 Deny-Fälle) · **nicht** deployt.
Spezifikation erneut an der Primärquelle verifiziert: MCP `2026-07-28` (modelcontextprotocol.io: versioning, basic/authorization,
authorization-server-discovery, client-registration, security-considerations, transports/streamable-http; abgerufen 2026-11-27).

## Drei getrennte Identitätsklassen (nie gleichgesetzt)

| Klasse | Belegt | Herkunft | Gewährt Autorität? |
|---|---|---|---|
| `tailnet_direct` | Knoten (WireGuard) | Actor Binding (WP-A1) | nein |
| `agent_attested` | Agentenschlüssel pro Proposal/Tool | Agent Attestation (WP1/R3) | nein |
| `oauth_web` | Client + Nutzer-Delegation | dieses Modul | nein |

Ein OAuth-Token wird nie auf einen Agent-Passport abgebildet und erfüllt nie die Attestierungspflicht. Effekte entscheiden weiterhin Mandate, γ und Human Gate. Das empfangene Token wird nie an Backend/Upstream weitergereicht (Spec: MUST NOT pass through).

## Prüfungen

Proxy-Trust (Weiterleitungs-Header nur von konfigurierten TLS-Proxys, `x-forwarded-proto=https` Pflicht, Direktzugriff abschaltbar) · `Origin`-Allowlist (ungültig → 403, Spec MUST) · Bearer nur im Header · JWS-Algorithmen ES256/EdDSA/RS256/PS256 (kein `none`/HS*) · `kid` → JWKS (nur HTTPS, Cache) · `iss` exakt · `aud` = kanonische Ressourcen-URI (RFC 8707) · `exp`/`nbf`/`iat` mit Skew · maximale Lebensdauer · Client-Allowlist · Scopes · `jti`-Widerruf · RFC-9728-Metadaten unter `<origin>/.well-known/oauth-protected-resource<pfad>` · RFC-6750-Challenge mit `resource_metadata` und `scope`.

## Wiederverwendung vorhandener Identity-Infrastruktur (Bewertung)

- Human Gate (`auth.future24.eu`, WebAuthn/Passkey + Ed25519-Issuer): Freigabe-Instanz für Mandate/Grants, **kein** OAuth-Autorisierungsserver → bleibt für Human Authority, nicht für Client-Tokens.
- Supabase-Auth (GoTrue) auf Server A: vorhandener Kandidat für den Autorisierungsserver (Nutzerkonten, JWT, JWKS). Eignung für OAuth-2.1-Server-Rolle inkl. `resource`/Audience-Bindung und Client-ID-Metadata ist **unverified** → Prüfung vor Neuaufbau.
- Spec erlaubt separaten AS („hosted with the resource server or a separate entity“); NYXA bleibt Resource Server.

## Offen / Freigaben

1. Wahl des Autorisierungsservers (Supabase-Auth prüfen) und Client-Registrierung (Client ID Metadata Documents bzw. Pre-Registration; DCR ist deprecated).
2. Deployment vor der Bridge der Webroute (Apache bleibt TLS-Proxy; Guard im Bridge-Prozess) — benötigt Deployment-Mandat.
3. Praktische Kompatibilitätstests mit Claude-Webconnector und ChatGPT erst nach Deployment möglich (`not run`).
