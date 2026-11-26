# Handoff 2026-11-26 — Welle 0 / Track A: Transportgebundene Akteursbindung

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session (Modellkennung nur in der Session) |
| Datum / Zeitzone | 2026-11-26, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` |
| Quellen | Live-Code Server B (`SOURCE-VERIFIED`); `release-v2/STATUS.md`, `HANDOFF-CHATGPT.md` vom 2026-11-25 (`SOURCE-BOUND`) |
| Epistemischer Status | `DRAFT` |
| Reviewstatus | ausstehend |
| Vorgänger | `/home/jo/nyxa-authority-requests-20261125/HANDOFF-CHATGPT.md`, `/home/jo/nyxa-authority-v2-candidate.mwydcf/release-v2/STATUS.md` |

## Ausgangslage (live rekonstruiert)

- Authority-V2-Kandidat (Frames 86 400 s / 604 800 s, 12 Richtlinien) liegt geprüft vor: `deploy-authority-v2.sh --check` PASS, 21 Python- + 4 JS-Tests PASS (Evidenz vom 2026-11-25 auf Server B).
- Einziger dokumentierter Code-Blocker vor dem root-Install: Claude-/Sophia-Ausführungsrouten ohne transportseitig authentifizierte Akteursidentität. Live bestätigt: Produktions-Bridge auf `100.116.58.45:39281` ohne Client-Authentifizierung.

## Erledigt

`WP-A1-ACTOR-BINDING` → Status `IMPLEMENTED` + `TESTED` (nicht `CONNECTED`/`ACTIVATED`). Details, Vertrag, Deploy- und Rollback-Schritte: `modules/authority/actor-binding/README.md`. Evidenz: `research/evidence/2026-11-26/WP-A1-ACTOR-BINDING_EVIDENCE.md`.

## Dateiliste

- `modules/authority/actor-binding/tailscaleIdentity.cjs`
- `modules/authority/actor-binding/bridge-actor-bound.cjs`
- `modules/authority/actor-binding/actorBinding.test.mjs`
- `modules/authority/actor-binding/e2e-real-tailscale.sh`
- `modules/authority/actor-binding/stub/dist/index.js`
- `modules/authority/actor-binding/stub/package.json`
- `modules/authority/actor-binding/package.json`
- `modules/authority/actor-binding/README.md`
- `modules/authority/actor-binding/SHA256SUMS`
- `research/evidence/2026-11-26/WP-A1-ACTOR-BINDING_EVIDENCE.md`
- `handoffs/2026/11/2026-11-26_CLAUDE_WAVE0_ACTOR_BINDING.md`

Spiegel auf Server B: `/home/jo/nyxa-actor-binding-20261126/` (inkl. `SHA256SUMS`, `test.log`, `e2e.log`).

## Offene Blocker

| Blocker | Betrifft | Benötigt |
|---|---|---|
| Kein root für Agenten (RDC NoNewPrivs, sudo blockiert) | Deployment, Unit-Drop-in, `/opt`-Zugriff, `/var/lib/sentinelx/nyxa-hardening-work/...` und `/opt/nyxa-governed-memory-mcp-runtime/data-tunnel-v2` (Permission denied) | Johannes (Termius) |
| StableID des Claude-Client-Knotens `unknown` | Bindungsdatei für Produktion | echte Verbindung + `tailscale whois` |
| `release_preflight.py` / `nyxa-release-preflight-v1.json` unter `/home/jo` (Tiefe 4) nicht gefunden | Welle-0-Preflight-Korrektur | Pfad vom Owner oder Suche als root |
| Remote Desktop Commander: 80 % Monatskontingent verbraucht | alle weiteren Server-B-Arbeiten über RDC | Kontingent / Alternative Route (Tailscale SSH, SentinelX) |
| Automation `6ad8501f…` (Integration & Freigabe) | Welle 17 | Ist keine Ressource dieser Claude-Session (vermutlich ChatGPT-Automation); keine unterstützte Schnittstelle von hier erreichbar |
| GitHub-Zugriff dieser Session auf `nyxa-kernel` beschränkt | PR #2/#3 in `nyxa-governed-memory-mcp`, `nyxa-kernel-runtime` | Repository-Freigabe für die Session |

## Nächster ausführbarer Schritt

1. Unabhängige Review des Diffs `bridge-baseline.cjs` → `bridge-actor-bound.cjs`.
2. Johannes: Claude-Client-StableID bestimmen, Bindungsdatei + Drop-in als root einspielen, Rollback einmal real durchspielen.
3. Danach `deploy-authority-v2.sh` (neue Release-Version, neue SHA256SUMS) so erweitern, dass `--install` statt des harten `die` die Bindung prüft; dann Passkey-Zyklus mit realer Wirkung, realem Scope-DENY, Replay und Widerruf protokollieren.
