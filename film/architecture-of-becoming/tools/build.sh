#!/usr/bin/env bash
# Full local production build for "NYXA – The Architecture of Becoming" (Episode 01).
# Requirements: python3 (numpy, scipy, piper-tts), node + playwright (Chromium), ffmpeg.
# Usage: tools/build.sh /path/to/en_GB-cori-high.onnx
# No paid services, no network calls except optional model download done beforehand.
set -euo pipefail
cd "$(dirname "$0")/.."
VOICE="${1:?path to Piper voice model (en_GB-cori-high.onnx)}"

echo "== 1/5 narration, timeline, score, subtitles"
python3 tools/build_audio.py --voice "$VOICE"

echo "== 2/5 main film frames (1920x1080 @30)"
rm -rf out/frames_main
node tools/render.mjs frames out/frames_main 1920 1080 30 - "" 4

echo "== 3/5 encode main film (H.264 + AAC, soft EN/DE subtitles)"
ffmpeg -y -loglevel error -framerate 30 -i out/frames_main/%06d.jpg -i out/audio/film_mix.wav \
  -i subtitles/architecture-of-becoming.en.srt -i subtitles/architecture-of-becoming.de.srt \
  -map 0:v -map 1:a -map 2 -map 3 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -tune film -movflags +faststart \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k -ar 48000 \
  -c:s mov_text -metadata:s:s:0 language=eng -metadata:s:s:0 title=English \
  -metadata:s:s:1 language=deu -metadata:s:s:1 title=Deutsch \
  -metadata title="NYXA – The Architecture of Becoming (Episode 01)" \
  -metadata comment="DRAFT · IN_REVIEW · Claude (Anthropic) for Johannes Süß / NYXA / Digitalleria · 2026-11-25" \
  -t "$(python3 -c 'import json;print(json.load(open("out/timeline.json"))["duration"])')" \
  out/NYXA_Architecture_of_Becoming_EP01_1080p.mp4

echo "== 4/5 vertical trailer (1080x1920, burned-in EN subtitles)"
python3 tools/make_trailer.py
rm -rf out/frames_trailer
node tools/render.mjs frames out/frames_trailer 1080 1920 30 "$(cat out/trailer_segments.json)" en 4
ffmpeg -y -loglevel error -framerate 30 -i out/frames_trailer/%06d.jpg -i out/audio/trailer_mix.wav \
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -movflags +faststart \
  -af "loudnorm=I=-14:TP=-1.5:LRA=9" -c:a aac -b:a 192k -ar 48000 \
  -metadata title="NYXA – The Architecture of Becoming · Trailer" -shortest \
  out/NYXA_Architecture_of_Becoming_EP01_trailer_9x16.mp4

echo "== 5/5 poster frame"
ffmpeg -y -loglevel error -i out/frames_main/$(printf %06d $((30*33))).jpg -q:v 2 out/poster_1080p.jpg
ls -la out/*.mp4 out/poster_1080p.jpg
