# WP1 — NYXA Agent Attestation V1 (kryptografische Akteursbindung, backend-seitig)

| Feld | Wert |
|---|---|
| Work Package | WP1 (Continuation R2), Track A |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code (Cloud-Session) |
| Datum | 2026-11-27, Europe/Berlin |
| Status | `IMPLEMENTED` · `TESTED` (isoliert 9/9; reales V2-Backend auf Server B 10/11, Fall 9 durch vorhandene Modus-Untergrenze abgewiesen) · **nicht** `CONNECTED`/`ACTIVATED` |
| Quellen | Live-Code Server B: `passkeyAuthorityV1.js` (`canonicalHumanGate`, Ed25519), `dist/server.js` (`handleProposeAction`, Toolbox-Effektpfad), `governance/proposal.js` (`ProposalSchema`) |
| Reviewstatus | ausstehend (nicht durch Claude) |

## Wiederverwendung

- Kanonisierung und Signaturprüfung identisch zum Human Gate (`canonicalHumanGate`, Node `ed25519`). In Produktion importiert `actorAttestation.mjs` den **echten** `./passkeyAuthorityV1.js`; `passkeyAuthorityV1.excerpt.js` ist ein wörtlicher Auszug nur für isolierte Tests.
- Einmal-Nutzung wie beim Issuer: eine `O_EXCL`-Datei pro Nonce, dauerhaft über Neustarts.
- Durchsetzung am vorhandenen Engpass `handleProposeAction`, vor dem Parsing → deckt `nyxa_propose_action`, Toolbox-Effekt-Capabilities, Bridge und direkten Backend-Start ab.

## Vertrag `nyxa-agent-attestation-v1`

`{schema, key_id, actor, audience, proposal_sha256, nonce, issued_at, expires_at, signature}`; Signatur Ed25519 über `canonicalHumanGate` aller Felder außer `signature`. Passport-Registry: `{version:1, audience, passports:[{key_id, actor, public_key_pem, actions[], scope_prefixes[]}]}`, root-eigen, nicht group/world-writable. Prüfreihenfolge: Form → Schema → Audience → Passport → Actor Substitution → Prozess-Akteur → Aktion → Scope/Target-Präfix (inkl. `..`) → Digest → Zeitfenster (≤ 120 s, Skew 30 s) → Signatur → Nonce (erst nach gültiger Signatur, damit Fälschungen keine Nonces verbrauchen).

## Dateien

`actorAttestation.mjs`, `actorAttestationGate.mjs` (Env: `NYXA_ACTOR_ATTESTATION_MODE=off|required`, `NYXA_AGENT_PASSPORTS`, `NYXA_ATTESTATION_NONCE_DIR`), `patch_attestation.py` (exakte Anker, Trefferzahl-Prüfung), `actorAttestation.test.mjs`, `e2e-backend.sh` + `e2e-backend-client.mjs`.

## Offene Befunde

- **R8:** `nyxa_mandate_issue/derive/revoke` und `nyxa_human_grant_issue` sind Schreib-Tools außerhalb des Proposal-Pfads und noch nicht attestiert. Nächster Schritt: Attestierung über die kanonischen Tool-Argumente (gleicher Vertrag, `proposal_sha256` → `arguments_sha256`).
- **Agenten ohne lokalen Laufzeitprozess** (Claude-Webconnector über `mcp.future24.eu`) können nicht selbst signieren → dort OAuth 2.1 (MCP 2026-07-28) statt Attestierung.
- Direkte Effekt-Tools im `required`-Modus: nur `nyxa_apply_patch` zusätzlich gesperrt; im Draft-Modus greift bereits die Modus-Untergrenze.
