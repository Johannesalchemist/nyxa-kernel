# P0 Human Authority R10: bounded admin execution + consolidated install order (2026-11-27)

Status: **prepared, production installation LOCKED until owner approval.** Infrastructure details (hosts, IDs, addresses) are kept only in the protected order on Server B.

## 1. Technical acceptance of the bound transport (lean MCP client, Server A)
| Test | Result |
|---|---|
| Actor derived from binding (not header) | `claude` ✔ |
| Self-node / spoofed actor header | 403 ✔ |
| Unbound route, lifecycle tools | unknown tool ✔ |
| T2 invalid arguments / T3 frame outside policy | arguments_invalid / frame_not_allowed ✔ |
| T4 path traversal in request_id / T5 release of an inactive request | unknown_request / not_active ✔ |
| T6 forged grant / T7 write without mandate | DENY missing_revoked_or_replayed / policy DENY mode_below_minimum ✔ |
| T1 publication of a real request | FAILED publish_failed (Permission denied) – cause is the live findings fixed in FIX2 (part [1] of R10) |
Evidence: protected, on Server A. Claude-specific acceptance follows separately.

## 2. Claude on Server A
The check ran as the same user and the same profile (only Claude profile on A, same HOME). Credentials have been unchanged since 2026-10-21, both installed binaries report "OAuth session expired", and no running Claude process is visible. The running instance is therefore either under another user or in another session, or it is not signed in. This does not block the technical acceptance (lean client).

## 3. Do the four additional write paths bypass the authority or attestation boundary?
No. All four belong to the **same** service identity that already writes the Authority data. They add no new principal or capability:
- lifecycle dir and attestation dir: owner is that identity; contents are requests, journal and observation logs, never grants.
- grant and frame data: the identity can read and forward grants but cannot **create** them. Only the Human Gate signs them (Ed25519 key in the portal container). The issuer verifies signature, transaction pin and one-time use.
- Everything else in the sandbox (`ProtectSystem=strict`) stays unchanged. A compromised process can at most block or discard its own requests (DoS), never issue a mandate.

## 4. Bounded-ops broker hash deviation
Cause: the root-owned helper (not writable, 0755) was changed on 2026-10-21 and gained a `tunnel-restart` op. The broker pin (from 2026-10-11) was not updated, so the broker fails closed as designed. Integrity: owner and mode are correct, and nothing points to tampering. The author cannot be proven from local evidence. Recommendation (part of R10, reversible): **decommission** the broker rather than re-pin it, because its target (Server C) is retired. R10 `--check` refuses to run if the helper changes again.

## 5. Durable bounded admin execution (`modules/authority/admin-executor`)
Root runs **only** a bundle whose exact SHA-256 Johannes has approved by passkey: once, and with a receipt. There is no root shell, no sudo and no parallel authority. It is the existing Human Gate plus the publisher plus path units (no timer). Details and the threat model are in the module README. The live review of the gate showed that the signed digest covers the full offer (including the proposal). The executor therefore verifies against the subject that the gate persists for each grant. 12 tests (including JS/Python canonical parity). The gate patch applies exactly to the live gate (3 changes, syntax OK).

## 6. Consolidated install order R10 (protected, Server B)
`NYXA-R10-ADMIN-BOOTSTRAP.sh` (sha256 prefix `cc739045`, pins kernel `0c3539a` and all module and gate hashes; supersedes R9-FIX2):
[1] FIX2 (lifecycle and publisher fixes, claude frame directory, lifecycle ticker, journal read for jo) · [2] gate op `nyxa-admin-bundle-v1` · [3] admin executor · [4] broker decommission · [5] restart + verify.
Modes `--check` (run as jo: **PASS**), `--apply` (root **and** `NYXA_R10_APPROVED=yes`, otherwise HOLD), `--verify` (including live check: forged grant DENIED against the production key), `--rollback` (restores gate, lifecycle and worker; removes units; keeps receipts; re-enables the broker).

## 7. Acceptance criteria after apply
A1 `R10_VERIFY_OK` · A2 claude frame request → PENDING < 60 s · A3 passkey → ACTIVE, write ALLOW in scope, real DENY outside, release/REVOKE, replay DENY, restart resilience · A4 probe admin bundle: portal shows the full SHA → passkey → receipt APPLIED; a new trigger does not run it again; a forged grant produces a DENIED receipt.

## Required human action
Once, as root on Server B: `NYXA_R10_APPROVED=yes bash …/protected/NYXA-R10-ADMIN-BOOTSTRAP.sh --apply`, then the passkey confirmations for A3/A4. From then on, future admin changes run as passkey-confirmed bundles without a root session.
