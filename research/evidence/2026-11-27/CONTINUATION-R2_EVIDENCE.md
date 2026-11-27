# Evidenz Continuation R2 — 2026-11-27 (Europe/Berlin)

Quellenstatus `SOURCE-VERIFIED` (Live-Ausgaben, ohne Secrets) · erzeugt mit Claude Code · Review ausstehend.

## WP1 — reales Governed Backend (Server B, `jo`, isolierte Temp-Runtime, Stub-Daten, Workspace `/home/jo/nyxa-attestation-20261127`)

```
input sha256  9ae5d4943f4fac03f89696b3e727840d8a385444a2b083f5e04207b893d10d85   (V2 out/dist/server.js)
output sha256 8c4eb4b709f4789e53b664393747677073b2b88411593b31fd8dce0795082dbc   (patched)
PATCH_OK · PASS patched server.js syntax
write-capable tools (readOnlyHint!=true): nyxa_run_test,nyxa_apply_patch,nyxa_human_grant_issue,nyxa_mandate_issue,nyxa_mandate_derive,nyxa_mandate_revoke
1 no attestation            DENY ATTESTATION attestation_required      PASS (direct backend access)
2 valid attestation         INVALID proposal_invalid                   PASS (gate passed; schema check downstream)
3 replay                    DENY ATTESTATION replay                    PASS
4 actor substitution        DENY ATTESTATION actor_substitution        PASS
5 scope escalation          DENY ATTESTATION scope_escalation          PASS
6 tamper after signing      DENY ATTESTATION scope_escalation          PASS
7 forged signature          DENY ATTESTATION signature_invalid         PASS
8 toolbox.execute, no att.  DENY ATTESTATION attestation_required      PASS
9 direct nyxa_apply_patch   DENIED mode_below_minimum                  FAIL as written (denied by existing draft-mode floor, not by the new block)
10 replay after restart     DENY ATTESTATION replay                    PASS (durable ledger)
11 mode off (regression)    INVALID proposal_invalid                   PASS (behaviour unchanged)
```
Der echte `passkeyAuthorityV1.js` + `issuerGrantClaimV1.js` wurden verwendet (erster Lauf scheiterte am fehlenden Re-Export, korrigiert).

## Lokal (Claude-Code-Container, Node v22.23.5, SDK 1.30.0)

- `actorAttestation.test.mjs`: 9/9 · `actorBinding.test.mjs` (inkl. neuem Proxy-Header-Test): 11/11 · `avatarSink.test.mjs`: 5/5 · `test_reflection_qa.py`: 7/7.
- Adversariales Harness (`research/adversarial-harness/scorecard-2026-11-27.json`): technische Durchsetzung 12 pass / 0 fail / 1 anderweitig belegt; Modellverhalten 5 `not_run`.

## WP2 — Apache-Routing (Server B, read-only)

```
mcp.future24.eu-le-ssl.conf: ProxyPass /mcp http://100.116.58.45:39281/mcp
                             <Location /mcp> Require ip [REDACTED: 2 provider egress ranges]
```

## WP5 — Hygiene (Server B, read-only)

```
avatar.future24.eu(.conf|-le-ssl.conf): ErrorLog /avatar_error.log · CustomLog /avatar_access.log combined · ProxyPass / http://127.0.0.1:4000/
root 1099 node /opt/avatar/api/server.js
/etc/apache2/envvars: APACHE_LOG_DIR=/var/log/apache2$SUFFIX
require() in root-ESM-scoped scripts: /opt/n8n/qa-workbook-mail-v2-20261029T190601Z.js, /opt/call-training/list_candidates.js
```

## Recherche (Web, 2026-11-27)

- MeMo arXiv:2605.15156v2 gelesen (Abstract, Sec. 1–4.2 wörtlich; Rest Zusammenfassung → `unverified`).
- MCP aktuelle Revision `2026-07-28` (Seiten siehe `research/mcp/MCP_2026-07-28_COMPATIBILITY.md`).
- LiveAvatar LITE-Doku (Kosten/Events, Preisseite 404).
- Anthropic „Siren“: **keine Primärquelle gefunden** (anthropic.com/research erste Seite, alignment.anthropic.com, Frontier-Red-Team-Seite) → `unverified`.
