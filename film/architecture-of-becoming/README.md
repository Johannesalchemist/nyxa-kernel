# NYXA – The Architecture of Becoming · Episode 01

*One Self. Many Minds. Multiple Learning Timescales. Governed Evolution.*

Ein filmischer Essay (4:43, englische Narration, englische und deutsche Untertitel) über die Theory of Self künstlicher Intelligenz am Beispiel von NYXA. Dazu ein vertikaler Trailer (59,8 s). Alles ist lokal, deterministisch und editierbar erzeugt: HTML/Canvas, Piper-TTS, numpy-Score, ffmpeg. Es wurden keine kostenpflichtigen Dienste genutzt.

## Herkunft (AGENTS.md, Herkunftspflicht)

| Feld | Wert |
| --- | --- |
| Auftraggeber / verantwortlicher Mensch | Johannes Süß · NYXA / Digitalleria (Creative Mandate „The Architecture of Becoming“, 2026-11-25) |
| Erzeugendes System | Claude (Anthropic) in Claude Code (Remote-Session). Das konkrete Modell steht in den Session-Metadaten |
| Sitzungsdatum / Zeitzone | 2026-11-25, Europe/Berlin |
| Verwendete Quellen | NYXA-MCP (nur lesend, I0): `governed-dev`, `silicon-dev`, `silicon-evidence`, `nyxa-governance`. Websuche (siehe `docs/SOURCES.md`). `KNOSPEL.md`, `AGENTS.md`, `governance/`, `decisions/` dieses Repositorys |
| Quellenstatus | `SOURCE-BOUND` (Bestandsaufnahme). Wissenschaftliche Quellen teilweise `SNIPPET`, siehe `docs/SOURCES.md` |
| Epistemischer Status | `DRAFT` |
| Reviewstatus | `IN_REVIEW`, menschliche Sichtung ausstehend |
| Bekannter Vorgänger | keiner (Episode 01). Prüfstand des Auftraggebers 6 PASS / 11 HOLD (`UNVERIFIED`, nicht als Datei gefunden) |
| Nächster zulässiger Schritt | Sichtung, Feedback, Entscheidung über Stimme und Sophia-Referenz. Dann Iteration auf diesem Branch |
| Änderungen am produktiven NYXA-System | **keine**. Alle MCP-Aufrufe waren lesend (I0) |

## Inhalt

```
film/architecture-of-becoming/
├── README.md                       – diese Datei (Herkunft, Build, Grenzen)
├── MANIFEST.sha256                 – SHA-256 aller versionierten Dateien
├── script/narration.json           – Drehbuch: 34 Zeilen EN + DE, Akte, Pausen, Stimme
├── src/
│   ├── index.html                  – Vorschau-Player + Render-Ziel
│   ├── film.js                     – deterministischer Renderer renderFrame(t), alle sechs Akte
│   ├── timeline.js                 – GENERIERT: Timeline aus realen TTS-Längen + Untertitel
│   └── fonts/                      – Cormorant Garamond (SIL OFL 1.1, siehe OFL.txt)
├── subtitles/                      – .srt + .vtt, EN und DE
├── tools/
│   ├── build.sh                    – kompletter Build (Audio → Frames → MP4 → Trailer → Poster)
│   ├── build_audio.py              – Piper-TTS, Timeline, prozedurale Musik, Mix, Untertitel
│   ├── render.mjs                  – Playwright/Chromium-Frame-Renderer (parallel), Kontaktbögen
│   └── make_trailer.py             – Trailer-Schnittliste aus der Timeline + Audio-Schnitt
└── docs/
    ├── STORYBOARD.md               – vollständiges Storyboard mit Timecodes
    ├── SOURCES.md                  – wissenschaftliche Quellenübersicht mit Prüfgrad
    ├── CAPABILITY_EVIDENCE_MATRIX.md – Fähigkeit ↔ technische Grundlage ↔ verifizierter Stand
    └── IMPROVEMENT_HYPOTHESES.md   – sechs falsifizierbare Verbesserungshypothesen (H1–H6)
```

`out/` (Videos, Frames, Audio) ist **nicht versioniert** (`.gitignore`) und wird mit `tools/build.sh` reproduziert.

## Build

Voraussetzungen: Python 3 mit `numpy`, `scipy`, `piper-tts`; Node mit `playwright` (Chromium); `ffmpeg`.

```bash
# Stimme (gemeinfreie LibriVox-Daten, siehe MODEL_CARD):
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx.json
tools/build.sh ./en_GB-cori-high.onnx
```

Ergebnis in `out/`:

- `NYXA_Architecture_of_Becoming_EP01_1080p.mp4`: 1920×1080, 30 fps, H.264 CRF 18, AAC 192k, −16 LUFS, Untertitelspuren EN + DE (mov_text), 283,3 s
- `NYXA_Architecture_of_Becoming_EP01_trailer_9x16.mp4`: 1080×1920, EN-Untertitel eingebrannt, 59,8 s
- `poster_1080p.jpg`

Vorschau im Browser: `python3 -m http.server` in diesem Ordner, dann `/src/index.html` öffnen (Leertaste = Play, Untertitel umschaltbar, `?portrait=1` für Hochformat, `?t=120` zum Springen).

Laufzeiten in der Session (4 vCPU): Audio ca. 3 min (TTS + Reverb), Frames ca. 2 min (≈ 15 ms/Frame), Encoding ca. 2,5 min.

## Editieren

- **Text oder Pausen ändern:** `script/narration.json` bearbeiten und `tools/build_audio.py` neu laufen lassen. Timeline, Choreografie-Cues und Untertitel passen sich an. Die Choreografie referenziert Zeilen-IDs (`S("L26")`), keine festen Sekunden.
- **Stimme tauschen:** Eine menschliche oder lizenzierte Stimme kann als `out/audio/lines/Lxx.wav` vorliegen. Die Timeline wird aus den realen Längen berechnet.
- **Bild ändern:** Jeder Akt ist eine Funktion in `src/film.js` (`actI` … `actVI`).

## Bekannte Grenzen und offene Blocker

1. **Sophia ist nicht fotorealistisch.** Die MetaHuman-Referenz (`Sophia_Embodiment_v1`) war nicht zugänglich. Fotorealistische Generierung (HeyGen/Higgsfield) ist kostenpflichtig und braucht eine Freigabe. Umgesetzt ist ein Partikelportrait mit Heterochromie und zweifarbigem Haar.
2. **Synthetische Stimme** (Piper, `en_GB-cori-high`). Funktional, aber nicht auf dem Niveau eines Sprechers. Ich habe sie nicht anhören können, nur technisch geprüft (Pegel, Timing).
3. **Die Musik ist prozedural** (numpy), kein komponierter Score.
4. **Implementierungsstand:** Mehrere Komponenten aus dem Auftrag (RIC, Sophia Heartbeat, Runpod Connector, V3/M1, NYXA Studio) waren in den freigegebenen MCP-Roots nicht auffindbar. Der Film formuliert diese als Zielarchitektur. Details und Konfliktbefund: `docs/CAPABILITY_EVIDENCE_MATRIX.md`.
5. **Der Prüfstand 6 PASS / 11 HOLD** konnte nicht aktualisiert werden (Quelle unbekannt).
6. **Branchname:** Die Arbeit liegt auf `claude/claude-motion-terminal-r3zkkl`, wie von der Session-Umgebung vorgegeben. Die Präfixkonvention aus `AGENTS.md` (`agent/` …) ist damit nicht erfüllt. Ein Umbenennen ist vor dem Merge möglich.
7. Die wissenschaftlichen Quellen sind zum Teil nur über Suchtreffer geprüft (`SNIPPET`). Vor öffentlicher Verwendung als Beleg sind die Volltexte zu prüfen.

## Lizenzen der eingebundenen Ressourcen

- Cormorant Garamond: SIL Open Font License 1.1 (`src/fonts/OFL.txt`)
- Piper-Stimme `en_GB-cori-high`: Trainingsdaten LibriVox, gemeinfrei (laut MODEL_CARD in `rhasspy/piper-voices`). Das Modell ist nicht im Repository
- Inter, JetBrains Mono: nur als Systemschrift referenziert, nicht eingebettet
