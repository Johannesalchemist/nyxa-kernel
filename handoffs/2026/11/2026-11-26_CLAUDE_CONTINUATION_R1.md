# Handoff 2026-11-26 (Fortsetzung) — Authority V2 Review R1 · Sophia Live Avatar · Arbeitskontinuität

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-26, Europe/Berlin |
| Branch / Commits | `ccr-05bf3d01-8z9z1d`: `1550bad` (Review-Härtung) + dieser Handoff |
| Epistemischer Status | `DRAFT` · Reviewstatus: ausstehend |
| Vorgänger | `2026-11-26_CLAUDE_WAVE0_ACTOR_BINDING.md`, `2026-11-26_CLAUDE_SOPHIA_LIVE_INTEGRATION.md` |

## Status der Arbeitspakete

| WP | Stufe (Master-Handoff §15) | Evidenz |
|---|---|---|
| WP-A1-ACTOR-BINDING | IMPLEMENTED · TESTED (inkl. realer Cross-Node-Test) · Deployment `PREPARED` | `modules/authority/actor-binding/{REVIEW-R1.md,DEPLOY-ORDER-WP-A1.md}`, `research/evidence/2026-11-26/WP-A1-ACTOR-BINDING_REVIEW-R1_EVIDENCE.md` |
| WP-SOPHIA-LIVE-STUDIO | IMPLEMENTED · CONNECTED · ACTIVATED · TESTED · **nicht** E2E_VERIFIED | `modules/studio/sophia-live/` |
| WP-SOPHIA-AVATAR (neu) | PLANNED, blockiert (Provider-Mandat) | dieser Handoff |
| `/package.json` Server B | untersucht, nicht verändert | Review-R1-Evidenz |

## WP-SOPHIA-AVATAR — Zielarchitektur ohne zweiten Sprachpfad (live rekonstruiert)

- Stimme und Persona: ausschließlich `thechat.future24.eu/api/room/live/session` (`gpt-realtime`).
- Avatar: vorhandener LiveAvatar-LITE-Broker `/home/jo/nyxa-pa-heygen-lite-20261120` (Server B, Loopback 8573). Er nimmt PCM s16le 24 kHz mono über `agent.speak` / `agent.speak_end` an und unterstützt Interrupt — identisch zum Audioformat von GPT Realtime. Damit treibt *dieselbe* Realtime-Ausgabe die Lippen, keine eigene Avatar-Stimme.
- HeyGen-Konto (read-only geprüft): privater Avatar „Sophia“, Gruppe `6d39b54917f248f586c6bb38410ef638`, 4 Looks, Standardstimme gesetzt. Das ist eine HeyGen-Studio-Identität, **keine** LiveAvatar-ID.
- Blocker (Mensch/Provider): (1) LiveAvatar-API-Key sicher hinterlegen; (2) Sophia als LiveAvatar-Custom-Avatar bereitstellen (kostenpflichtig, Einwilligung/Consent der Vorlage); (3) Pilot-Bearer + `ENABLE_LIVEAVATAR_SANDBOX`. Sandbox-Avatar „Wayne“ darf nicht als Sophia erscheinen.
- Danach umsetzbar: Room-Client leitet Realtime-Audio (Ausgabespur) zusätzlich als PCM-Chunks an den Broker; Barge-in → `agent.interrupt`; Studio `/sophia-live.html` zeigt Avatar-Video neben dem Room-Client.

## Unreal

Server C (`xv19616`) im Operator-Register `HOLD: target_retired`, Tailscale offline, Pixel-Streaming-Probe fehlgeschlagen. Eine Unreal-Avatar-Engine ist auf erreichbaren Hosts nicht auffindbar (`unknown`). Neuer Host oder Reaktivierung durch den Owner nötig.

## Fehlende Berechtigungen (einzeln)

| Ressource | Fehlend |
|---|---|
| Server B root (Deployment WP-A1, Apache-Vhost `mcp.future24.eu`, `/opt/nyxa-governed-memory-mcp-runtime`, `/var/lib/sentinelx/...`) | Human Authority Gate (Johannes) |
| GitHub `Johannesalchemist/nyxa-governed-memory-mcp` (PR #2/#3) | Repository-Zugriff dieser Session (nur `nyxa-kernel` freigegeben) |
| GitHub `Johannesalchemist/nyxa-kernel-runtime` | dto. |
| SentinelX / Ops Broker | kein Werkzeug in dieser Session |
| Tailscale SSH | Cloud-Container ist kein Tailnet-Mitglied |
| LiveAvatar-Provider | API-Key + Sophia-Custom-Avatar (Mandat für Kosten) |
| Remote Desktop Commander | Monatskontingent > 80 % |

## Wellen 1–8 — nächste nicht blockierte Pakete

1. Welle 4 (MeMo): Originalpaper arXiv 2605.15156v2 lesen und den 5-stufigen Reflection-QA-Vertrag als Schema + Tests unter `schemas/` anlegen (repo-lokal, ohne Server).
2. Welle 6 (MCP): aktuelle MCP-Spezifikation prüfen; Task-/Idempotenz-/Resume-Vertrag gegen die vorhandene Bridge (V3-Kandidat) als Testpaket formulieren.
3. Welle 7 (Siren): Primärquelle verifizieren; R1/R2-Angriffe dieses Reviews als erste synthetische adversariale Fixtures übernehmen.
4. Welle 1: Self-Model/RIC-Bestände (`/home/jo/nyxa-v3-cognitive-20261124`, `/home/jo/nyxa-ric-m1`) read-only inventarisieren, sobald RDC-Kontingent verfügbar.

## Menschliche Abnahmen, die nur Johannes ausführen kann

1. Sprachdialog auf `https://studio.digitalleria.com/sophia-live.html` (Anmeldung, Barge-in, `memory_recall` Room ↔ Studio, ein `Tool Call`).
2. Deployment WP-A1 gemäß `DEPLOY-ORDER-WP-A1.md` inkl. Rollback-Probe.
3. Unabhängiges Review von WP-A1 (nicht durch Claude).
