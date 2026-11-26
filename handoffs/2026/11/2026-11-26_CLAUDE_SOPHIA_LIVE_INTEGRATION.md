# Handoff 2026-11-26 — Addendum Unified Sophia Live Integration

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-26, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` |
| Epistemischer Status | `DRAFT` |
| Reviewstatus | ausstehend |
| Vorgänger | `handoffs/2026/11/2026-11-26_CLAUDE_WAVE0_ACTOR_BINDING.md`; `/home/deploy/nyxa-studio-20261124/INTEGRATION_STATUS.md` |

## Ergebnis

`WP-SOPHIA-LIVE-STUDIO` ist live auf `https://studio.digitalleria.com/sophia-live.html` (Status `ACTIVATED` + `TESTED`, nicht `E2E_VERIFIED`). Studio nutzt den bestehenden GPT-Realtime-Broker von The Room – eine Sophia, ein Broker, gemeinsame Tools und Erinnerung. Details: `modules/studio/sophia-live/README.md`. Evidenz: `research/evidence/2026-11-26/WP-SOPHIA-LIVE-STUDIO_EVIDENCE.md`.

## Live-Befunde

| Komponente | Befund |
|---|---|
| Realtime-Broker | `thechat.future24.eu/api/room/live/session`, `gpt-realtime`, JWT; Studio-Integration nutzt ihn unverändert |
| Studio | statische PWA (Server A, `deploy`, nohup), vorher Mikrofon und Framing global gesperrt |
| Unreal (Server C `xv19616`) | offline (Tailscale offline, RDC zuletzt vor ~1136 h); `unreal.pixelstream.status` → `probe_failed`; `unreal.scene.status` → `cafe_broker_denied` |
| LiveAvatar / HeyGen-Lite | `/home/jo/nyxa-pa-heygen-lite-20261120` (Server B), `/home/deploy/nyxa-sophia-liveavatar-stage-20261113` (Server A) – nicht angefasst |
| Nuance | im Code der geprüften Oberflächen kein Bezug gefunden – `unknown` |
| News | zweiter Broker `/api/research/live/session` – mögliche zweite Sophia-Konfiguration, Konsolidierung offen |
| Parallelaktivität | Studio `public/` (sol-3d) 17:52–17:56 CET durch anderen Writer geändert; nur nicht überlappende Dateien berührt, Drift-Check vor Promotion bestanden |

## Offene Blocker

| Blocker | Benötigt |
|---|---|
| Realer Sprachdialog (Abnahme) braucht einen angemeldeten Menschen; Agent meldet sich nicht unter fremdem Namen an | Johannes: `studio.digitalleria.com/sophia-live.html` → anmelden → Mikrofon → Gespräch inkl. Unterbrechung, `memory_recall`, `Tool Call …` |
| Unreal-Avatar: Server C offline | Server C einschalten, Pixel Streaming und CafePilot-Broker starten |
| Kontinuität Studio ↔ Unreal ↔ PA | erst prüfbar mit laufendem Unreal und PA-Client |
| RDC-Kontingent > 80 % | weitere Server-Arbeit nur begrenzt |

## Nächster ausführbarer Schritt

1. Menschliche Abnahme in Studio (mobil): Dialog, Barge-in, `memory_recall` über Sitzungswechsel Room ↔ Studio, ein autorisierter `Tool Call`.
2. Nach Start von Server C: Unreal-Pixel-Streaming als zweite Embodiment-Oberfläche an denselben Broker binden (gleiches Muster: Room-Session + Avatar-Rendering), ohne neuen Broker.
3. `/api/research/live/session` (News) gegen `/api/room/live/session` vergleichen und auf eine Sophia-Konfiguration zusammenführen.
