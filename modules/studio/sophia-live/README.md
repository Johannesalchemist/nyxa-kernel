# WP-SOPHIA-LIVE-STUDIO — Sophia-Echtzeitstimme in NYXA Studio

| Feld | Wert |
|---|---|
| Work Package | `WP-SOPHIA-LIVE-STUDIO` (Addendum „Unified Sophia Live Integration“, P0; Track C/D) |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code (Cloud-Session) |
| Datum / Zeitzone | 2026-11-26, Europe/Berlin |
| Host / Workspace | Server A `ubuntu-4gb-nbg1-2` (Benutzer `deploy`); Live: `/home/deploy/nyxa-studio-20261124` → `studio.digitalleria.com` (Caddy → 127.0.0.1:8785); Arbeitskopie `/home/deploy/nyxa-studio-sophia-live-20261126` |
| Status | `IMPLEMENTED` · `CONNECTED` · `ACTIVATED` · `TESTED` (Policy-Tests + Mobile-Browser-E2E). **Nicht** `E2E_VERIFIED`: der reale Sprachdialog mit angemeldetem Menschen steht aus. |
| Quellenstatus | `SOURCE-VERIFIED` (Live-Code Server A und B) |
| Reviewstatus | ausstehend |

## Live rekonstruierter Bestand (wiederverwendet, nicht dupliziert)

- **Session Broker:** `thechat.future24.eu` → `/opt/thechat/apps/console/api/server.js` (Server B, Port 3000), `POST /api/room/live/session`, `requireAuth` (JWT), WebRTC-SDP über `https://api.openai.com/v1/realtime/calls`, Modell `gpt-realtime`, Transkription `gpt-4o-mini-transcribe`.
- **Sophia-Identität:** ein Instruktionssatz (Deutsch, Bridge-Protokoll, Evidence-bound Self Model, Memory-Accuracy, Tool-Call-Execution-Gate) und 11 Tools: `memory_recall`, `self_inspect`, `ceo_context`, `capability_preflight`, `sophias_corner_owner_*`, `research_editorial_suggestions`, `room_agents`, `room_delegate`, `tool_catalog`, `conference_record`.
- **Client:** `/opt/thechat/apps/dashboard/room.html` (RTCPeerConnection, Datenkanal `oai-events`, Function-Call-Rückgabe, Mobile-Voice-Schalter).
- Zweiter Broker-Endpunkt `/api/research/live/session` wird von `news.digitalleria.com` (`nyxa-live-clean.js`) genutzt — Befund, nicht angefasst.

## Umsetzung

- `public/sophia-live.html|.css|.mjs`: mobile-first Studio-Seite, bettet den echten Room-Client ein. Audio, Token und Transkripte bleiben im Room-Origin; Studio sieht nichts davon.
- `server.mjs`: **exakt pfadgebundene** Ausnahme nur für `/sophia-live.html`: `frame-src https://thechat.future24.eu` und `microphone/autoplay=(self "https://thechat.future24.eu")`. Alle anderen Pfade behalten `microphone=()` und kein `frame-src`.
- `public/index.html`: Link „Live mit Sophia sprechen“ im Sophia-Panel.
- Kein neuer Broker, keine neue Identität, keine Secrets, keine Änderung an The Room oder der Governance.

## Tests

| Test | Ergebnis |
|---|---|
| Studio `npm test` (10 bestehende + `tests/sophia-live.test.mjs`) in Arbeitskopie und nach Promotion im Live-Ordner | 11/11 PASS |
| Öffentliche Header (`curl -I`): `/sophia-live.html` mit Ausnahme; `/` und `/health` strikt | PASS |
| `tests/e2e-mobile-playwright.cjs` (Pixel 7, Fake-Mikrofon) gegen Produktion | Link vorhanden; Room lädt im Rahmen; `getUserMedia` im Room-Frame → 1 Audiospur; Studio-Root `microphone` = false; Broker ohne Auth → 401; Broker meldet `live_model: gpt-realtime` |

Nicht getestet: Anmeldung, realer Sprachdialog, Unterbrechung (Barge-in), Tool-Call mit Wirkung, Kontinuität über Oberflächen mit realem Nutzer.

## Promotion und Rollback

`promote.sh` (Server A): Drift-Check gegen die Hashes der Live-Dateien (Parallel-Writer), Abbruch bei Schreibaktivität der letzten 3 Minuten, Backup nach `/home/deploy/nyxa-studio-backup-pre-sophia-live-20261126`, Kopie, Neustart, Header-/Health-Verifikation, automatischer Rollback bei Fehler. Ergebnis: `PROMOTE=OK`. Manueller Rollback: Backup-Dateien zurückkopieren, vier neue Dateien entfernen, Prozess neu starten. Der Rollback-Pfad wurde nicht real ausgelöst.

## Offene Punkte

- Studio-Prozess läuft per `nohup` (PPID 1), nicht als systemd-Unit; bei Reboot nicht persistent (Vorbefund).
- Room-Login ist namensbasiert und impersonierbar (Room-eigener Befund); Studio erbt diese Schwäche, erweitert sie nicht.
- Parallel-Writer auf Studio (sol-3d, 17:52–17:56 CET) – Dateien nicht berührt; Koordination nötig.
