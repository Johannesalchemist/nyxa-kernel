# WP4 — Sophia Avatar: providerneutrale Senke + LiveAvatar-LITE-Voraussetzungen

Stand 2026-11-27, Europe/Berlin · erzeugt mit Claude Code · `DRAFT` · `IMPLEMENTED` + `TESTED` (isoliert, 5/5) · **nicht** `CONNECTED`.

## Architektur (keine zweite Stimme, keine zweite Persona)

`thechat /api/room/live/session` (gpt-realtime, Sophia-Instruktionen, Tools, Memory) → Remote-Audiospur im Browser → AudioWorklet → `createRealtimeAvatarBridge` → `LiveAvatarLiteSink` (oder `NoopAvatarSink`).

- Resampling auf 24 kHz, PCM s16le mono, Base64, ~1-s-Chunks (48 000 Byte), Paketgrenze 1 MB.
- `output_audio_buffer.started/stopped`, `response.done` → `agent.speak`/`agent.speak_end`.
- Barge-in: `input_audio_buffer.speech_started` oder `output_audio_buffer.cleared` → gepufferte Audiodaten verworfen + `agent.interrupt`.
- Fail-closed: Ohne `session.state_updated=connected` wird nichts an den Provider gesendet.
- Vorhandener Broker `/home/jo/nyxa-pa-heygen-lite-20261120` (Server B) bleibt der einzige Ort für den Provider-Schlüssel; der Schlüssel erreicht nie den Browser.
- Sophia-Identität: HeyGen-Konto enthält privaten Avatar „Sophia“ (`6d39b54917f248f586c6bb38410ef638`, 4 Looks). LiveAvatar bietet laut Doku **keinen** Import bestehender HeyGen-Avatare (`not found`); ein LiveAvatar-Custom-Avatar muss neu erstellt werden. Der Sandbox-Avatar „Wayne“ darf nie als Sophia erscheinen.

## Kosten und Voraussetzungen (Quelle: docs.liveavatar.com, abgerufen 2026-11-27, kein Seitendatum)

| Punkt | Wert |
|---|---|
| LITE | 1 Credit/Minute (FULL: 2); STT/LLM/TTS nicht enthalten → hier ohnehin GPT Realtime (bestehende OpenAI-Kosten) |
| Pläne | Free $0 / 10 Credits; Essential $99 / 1 100 (+10) Credits, Overage $0,095/Credit; Business $475 / 6 000 (+10), Overage $0,09 |
| Beispiele (Doku) | 500 LITE-Min. ⊂ Essential; 3 000 Min. ≈ $280 (Essential); 10 000 Min. ≈ $835 (Business) |
| Sandbox | gratis, nur „Wayne“, ~1 min Sitzungen |
| Custom-Avatar | kostenpflichtiges Add-on, benötigt Avatar-Slot (2 Erstellungen pro Slot und Abrechnungszyklus); **Slot-Preis nicht veröffentlicht** |
| Video-Avatar | ~2 min Footage + **Consent-Aufnahme** der abgebildeten Person; erzeugt Voice-Clone (für Sophia nicht genutzt) |
| Bild-Avatar | 1 Bild (16:9/9:16, kurze Seite ≥ 1080 px, eine Person, frontal); kein Consent-Video nötig; Stimme separat (passt: Stimme = GPT Realtime) |
| API | `X-API-KEY` aus app.liveavatar.com/developers; `POST /v1/sessions/token` (`mode:"LITE"`, `avatar_id`) → `/v1/sessions/start`; LiveKit-Raum + WebSocket |
| Timeouts | 5 min Idle (`session.keep_alive` als Heartbeat); `max_session_duration` tarifabhängig (Werte `not found`) |

## Menschliche Entscheidung (kostenpflichtig, nicht ausgeführt)

1. Tarif (Free reicht für ~10 Testminuten/Monat; Essential $99 für Pilotbetrieb).
2. Avatar-Slot (Preis beim Anbieter erfragen) und Wahl **Bild-Avatar aus dem bestehenden Sophia-Bildmaterial** (Rechte am Bild klären; kein Consent-Video, keine Voice-Clone).
3. API-Key auf Server B in den bestehenden Broker (`setup-liveavatar-secret.sh`), nicht in Repository oder Chat.

## Nächste Implementierungsschritte nach Mandat

1. AudioWorklet im Room-Client (`room.html`) auf die Remote-Realtime-Spur, Feed in `createRealtimeAvatarBridge`.
2. Broker-Endpunkt für Sitzungs-Token (bestehend) + WebSocket-Relay, Avatar-Video in Studio `/sophia-live.html` über dem Room-Client.
3. E2E: Sandbox (Wayne, als „Test-Avatar“ gekennzeichnet) → Lipsync-Latenz, Barge-in, 5-min-Keepalive → danach Sophia-Custom-ID.
