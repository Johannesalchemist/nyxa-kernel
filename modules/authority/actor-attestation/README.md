# WP1 — NYXA Agent Attestation V1 (kryptografische Akteursbindung, backend-seitig)

| Feld | Wert |
|---|---|
| Work Package | WP1 (Continuation R2), Track A |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code (Cloud-Session) |
| Datum | 2026-11-27, Europe/Berlin |
| Status | `IMPLEMENTED` · `TESTED` (isoliert 12/12; reales V2-Backend R3: alle adversarialen Fälle PASS inkl. Fall 9 und positivem ALLOW-Kontrollfall im Modus `draft`) · **nicht** `CONNECTED`/`ACTIVATED` |
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

## R3: Authority Closure

- Direkt-Tools `nyxa_mandate_issue/derive/revoke`, `nyxa_human_grant_issue` im Dispatcher attestierungspflichtig (Subjekt `{tool, arguments}`), Argumente ohne `attestation` an die unveränderten Handler.
- Trennung Identität/Berechtigung: Verifikation liefert immer `authorityGranted:false`; reale Tests zeigen, dass attestierte Aufrufe weiterhin an Mandat (`patch_mandate_required`), Delegationsspeicher bzw. Human-Gate-Token scheitern.
- Schlüssel: `not_before`/`not_after` (Rotation), `revoked_key_ids`, Registry und Verzeichnis müssen dem Operator gehören (`NYXA_PASSPORTS_OWNER_UID`, Standard root) → keine Selbstregistrierung.
- Replay: 8 konkurrierende Prozesse und 2 Instanzen auf einer Nonce → genau 1 Gewinner; nach Neustart weiterhin Replay.

## R4

- Widerruf/Rotation ohne Neustart: Registry wird bei Datei-Änderung neu geladen; fehlende Registry → fail closed.
- Absturz zwischen Nonce-Verbrauch und Effekt: gleiche Attestierung wird nie erneut ausgeführt (*at-most-once*); neue Signatur nötig.
- Stufenplan zur aktiven Durchsetzung: `DEPLOYMENT-PLAN-R4.md`.

## Offene Befunde (historisch R2)

- **R8 — in R3 geschlossen:** Die Schreib-Tools außerhalb des Proposal-Pfads waren in R2 nicht attestiert; seit R3 sind sie über den kanonischen Tool-Argument-Digest attestierungspflichtig (siehe oben).
- **Agenten ohne lokalen Laufzeitprozess** (Claude-Webconnector über `mcp.future24.eu`) können nicht selbst signieren → dort OAuth 2.1 (MCP 2026-07-28) statt Attestierung.
- Direkte Effekt-Tools im `required`-Modus: `nyxa_apply_patch` zusätzlich gesperrt (R3 im Modus `draft` real bestätigt); `nyxa_run_test` direkt bleibt über die vorhandene Test-Target-Allowlist geregelt.

## R5

- Modus `observe` (Stufe 2 des Stufenplans): volle Prüfung inkl. Nonce-Ledger, Urteil `would_allow`/`would_deny` als JSONL (`NYXA_ATTESTATION_OBSERVE_LOG`, 0600), **keine** Blockade. Fehlkonfiguration in `observe` wird protokolliert; in `required` bleibt sie fail-closed. Tests 14/14.
- Offen: Digest-Bindung am Executor (`executeAllowedProposal` ist in dieser Sitzung nicht gelesen worden).
