# Handoff · Film „NYXA – The Architecture of Becoming“, Episode 01

| Feld | Wert |
| --- | --- |
| Datum / Zeitzone | 2026-11-25, Europe/Berlin |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude (Anthropic), Claude Code Remote-Session |
| Branch | `claude/claude-motion-terminal-r3zkkl` (von der Session-Umgebung vorgegeben; Präfixkonvention `agent/` aus AGENTS.md nicht erfüllt → vor Merge umbenennbar) |
| Auftrag | Creative Mandate „The Architecture of Becoming – Theory of Self, Self-Reflection and Co-Evolution“ (im Chat übergeben, 2026-11-25) |
| Epistemischer Status | `DRAFT` |
| Reviewstatus | `IN_REVIEW` |
| Änderungen an produktiven NYXA-Systemen | keine; alle NYXA-MCP-Aufrufe waren I0 (lesend) |

## Ergebnis

Ein lokal renderbarer, editierbarer Animationsfilm (4:43, 1080p, EN-Narration per lokaler TTS, Untertitel EN/DE), ein vertikaler Trailer (59,8 s, 9:16), ein Storyboard, eine wissenschaftliche Quellenübersicht, eine Capability-to-Evidence-Matrix und sechs falsifizierbare Verbesserungshypothesen. Es wurden keine kostenpflichtigen Dienste genutzt.

Die Videos sind Build-Artefakte (`film/architecture-of-becoming/out/`, nicht versioniert) und werden mit `tools/build.sh` reproduziert. In der Session wurden sie dem Auftraggeber direkt übergeben.

| Artefakt | Größe | Prüfung |
| --- | --- | --- |
| `NYXA_Architecture_of_Becoming_EP01_1080p.mp4` | 57,4 MB | ffprobe: h264 1920×1080, aac, 2× mov_text (eng, deu), 283,3 s; EBU R128: −16,1 LUFS integriert |
| `NYXA_Architecture_of_Becoming_EP01_trailer_9x16.mp4` | 8,1 MB | ffprobe: h264 1080×1920, aac, 59,8 s |
| `poster_1080p.jpg` | 0,1 MB | Frame bei t = 33 s |

## Vollständige Dateiliste (versioniert)

```
film/architecture-of-becoming/.gitignore
film/architecture-of-becoming/MANIFEST.sha256
film/architecture-of-becoming/README.md
film/architecture-of-becoming/docs/CAPABILITY_EVIDENCE_MATRIX.md
film/architecture-of-becoming/docs/IMPROVEMENT_HYPOTHESES.md
film/architecture-of-becoming/docs/SOURCES.md
film/architecture-of-becoming/docs/STORYBOARD.md
film/architecture-of-becoming/script/narration.json
film/architecture-of-becoming/src/film.js
film/architecture-of-becoming/src/fonts/CormorantGaramond-italic.woff2
film/architecture-of-becoming/src/fonts/CormorantGaramond-normal.woff2
film/architecture-of-becoming/src/fonts/OFL.txt
film/architecture-of-becoming/src/index.html
film/architecture-of-becoming/src/timeline.js
film/architecture-of-becoming/subtitles/architecture-of-becoming.de.srt
film/architecture-of-becoming/subtitles/architecture-of-becoming.de.vtt
film/architecture-of-becoming/subtitles/architecture-of-becoming.en.srt
film/architecture-of-becoming/subtitles/architecture-of-becoming.en.vtt
film/architecture-of-becoming/tools/build.sh
film/architecture-of-becoming/tools/build_audio.py
film/architecture-of-becoming/tools/make_trailer.py
film/architecture-of-becoming/tools/render.mjs
handoffs/2026/11/2026-11-25_CLAUDE_FILM_ARCHITECTURE_OF_BECOMING_EP01.md
```

Die Hashes stehen in `film/architecture-of-becoming/MANIFEST.sha256`.

## Ausgeführte Prüfungen

- Vollständiger Build: Audio, Timeline und Untertitel, 8.499 Frames (Hauptfilm), 1.794 Frames (Trailer), Encoding
- Sichtprüfung aller sechs Akte über Kontaktbögen (16:9 und 9:16) und über Frames, die aus den fertigen MP4-Dateien extrahiert wurden
- ffprobe der Container und Streams, EBU-R128-Lautheit
- Gefundener und behobener Fehler: `-shortest` hatte den Hauptfilm auf die Länge der Untertitelspur gekürzt (270,5 s statt 283,3 s). Jetzt mit fester Dauer aus der Timeline
- Nicht geprüft: das Anhören der Narration und Musik (keine Audiowiedergabe in der Session). Ein menschliches Abhören ist erforderlich
- Das Repository hat keine Validatoren oder Tests unter `schemas/`, die auf diese Dateien anwendbar wären

## Offene Blocker

1. **Konfliktbefund Sophia Heartbeat:** laut Auftraggeber implementiert, im MCP-Scope nicht gefunden. Beide Quellen bleiben referenziert, die Filmformulierung ist konditional („designed to“). Siehe Matrix.
2. **RIC, Runpod Connector, V3/M1, NYXA Studio, Pocket Kernel, RIVA:** nicht im MCP-Scope. Bitte Pfade oder Repositories nennen.
3. **Prüfstand 6 PASS / 11 HOLD:** Quelle nicht gefunden, Aktualisierung nicht möglich.
4. **Live-Selbstmodell leer:** `nyxa_self_model_read(all)` liefert nur `session_start`-Ereignisse. Das ist eine Information für die Serienidee „echter Graph im Spiegel“.
5. **Freigabeentscheidungen beim Menschen:** fotorealistische Sophia (MetaHuman-Render auf dem Film-Factory-Host oder kostenpflichtiger Dienst), professionelle Stimme, komponierter Score.
6. **Branch-Präfix:** siehe oben.

## Nächster zulässiger Schritt

Sichtung durch Johannes Süß, dann Feedback zu Dramaturgie, Stimme und Bildsprache und Klärung der Konfliktbefunde. Danach Iteration auf diesem Branch. Kein Merge vor dem Review. Ein Merge ersetzt keinen epistemischen Freeze.
