# Evidenz Continuation R3 — 2026-11-27 (Europe/Berlin) — REDIGIERT

Repository `nyxa-kernel` ist **öffentlich**. Diese Datei enthält keine Adressen, Ports, Knoten-IDs, Logauszüge mit Pfaden zu
Secrets oder Details offener Schwachstellen. Vollständige Rohevidenz liegt geschützt auf Server B (Workspace des Benutzers `jo`,
Verzeichnis `nyxa-attestation-20261127/protected`, Modus 0700); Zuordnung über SHA-256:

| Artefakt (geschützt) | SHA-256 |
|---|---|
| `e2e-r3d.log` (realer Backend-E2E, finaler Lauf) | `7c23d7a5725a1344b9bbd44d9baf7899787805d3b13d70680b7ff11d95f3bcfc` |
| `avatar-api-migrate.sh` (vorbereitete Migration) | `c10cd8ffe16a5e06957897237dcea9595147a4d56b42250f7acf9051f9d390ee` |

## Realer Governed-Backend-E2E (Authority V2 Kandidat, isolierte Temp-Runtime, direkter Backend-Zugang)

Patch: Eingang `9ae5d494…` → Ausgang mit Direkt-Tool-Ankern (4/4 Treffer), Syntax PASS. Ergebnisse (finaler Lauf):

| # | Fall | Ergebnis |
|---|---|---|
| 1 | Proposal ohne Attestierung | DENY ATTESTATION `attestation_required` — PASS |
| 2 | gültige Attestierung, kein Mandat | ESCALATE AUTHORITY `patch_mandate_required` — PASS (Identität ≠ Berechtigung) |
| 3 | Replay | DENY `replay` — PASS |
| 4 | **positiver ALLOW-Kontrollfall** (Modus `draft`) | **ALLOW**; Kandidat real im isolierten Store geschrieben (1 Zeile, `writtenBy: claude`, `status: pending`) — PASS |
| 4' | derselbe Fall im Standardmodus der Testlaufzeit | DENY C2 `mode_below_minimum` — erwartete Modusgrenze |
| 5 | `nyxa_mandate_derive` ohne Attestierung | DENY ATTESTATION — PASS |
| 6 | manipulierte Tool-Argumente | DENY `proposal_digest_mismatch` — PASS |
| 7 | attestierter Derive ohne Elternmandat | Fehler `delegation_store_not_configured` (kein ALLOW) — PASS |
| 8 | Derive mit Scope-Ausweitung | DENY `scope_escalation` — PASS |
| 9 | **direkter `nyxa_apply_patch`** (Modus `draft`) | DENIED `development_mandate_proposal_required` (neue Sperre erreicht) — PASS |
| 10 | attestierter Revoke mit falschem Token | Fehler `human_authority_token_not_configured` (kein Effekt) — PASS |
| 11 | `nyxa_human_grant_issue` mit Agentenschlüssel | DENY `action_not_in_passport` — PASS |
| 12 | Replay nach Backend-Neustart | DENY `replay` — PASS |
| 13 | Attestierungsmodus aus | unverändertes Verhalten — PASS |

Ausführungsvariante des Skripts auf Server B: `e2e-backend.sh` SHA-256 `4c4e669a…` (Repo-Fassung `0818ea51…` unterscheidet sich nur im Ausgabeschritt des Kandidatenspeichers); alle übrigen Dateien hashgleich mit dem Repo.

## Lokal (Claude-Code-Container)

`actorAttestation.test.mjs` 12/12 · `actorBinding.test.mjs` 11/11 · `oauthResourceServer.test.mjs` 4/4 · `strategyEvolution.test.mjs` 5/5 · `avatarSink.test.mjs` 5/5 · `test_reflection_qa.py` 7/7 · Harness `scorecard-2026-11-27-r3.json`: technisch 20 pass / 0 fail / 1 anderweitig belegt; Modellverhalten 9/9 simuliert pass (nicht unabhängig).
Chromium-E2E Avatar (WebRTC-Loopback + AudioWorklet): siehe `modules/sophia/avatar-sink/README.md`.
MeMo-Lauf: `research/memo/runs/2026-11-27/` (16 Paare, Export `d2751075…`, `training_authorized: false`).

## Korrektur

Die R3-Zwischenaussage „Avatar-API-Quelldatei fehlt“ war falsch (abgeschnittene Verzeichnisliste). Tatsächlicher Befund: Quelldatei
vorhanden, aber für einen nicht privilegierten Benutzer schreibbar, während der Dienst mit Root-Rechten läuft (Details geschützt).
