#!/usr/bin/env python3
"""Derive the vertical trailer cut list from the film timeline and cut its audio.

Writes out/trailer_segments.json ([[start, end], ...] in film time) and out/audio/trailer_mix.wav.
The same segments are rendered in portrait (1080x1920) by tools/render.mjs, so picture and sound stay in sync.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Lines chosen for the trailer (story arc: question -> many minds -> relations -> reflection -> failure -> acceptance -> becoming)
PICK = [("L01", "L02"), ("L04", "L04"), ("L10", "L10"), ("L19", "L19"), ("L26", "L26"), ("L28", "L28"), ("L33", "L34")]
PRE, POST = 0.35, 0.5
XF = 0.35  # audio crossfade


def main():
    tl = json.loads((ROOT / "out/timeline.json").read_text())
    ln = {l["id"]: l for l in tl["lines"]}
    segs = [[round(ln[a]["start"] - PRE, 3), round(ln[b]["end"] + POST, 3)] for a, b in PICK]
    # end card: last ~6.5 s of the film's title sequence
    card_start = round(ln["L34"]["end"] + 1.5 + 2.2, 3)
    segs[-1][1] = round(ln["L34"]["end"] + 1.0, 3)
    segs.append([card_start, round(card_start + 6.5, 3)])
    total = sum(e - s for s, e in segs)
    (ROOT / "out/trailer_segments.json").write_text(json.dumps(segs))
    # audio: trim each segment from the film mix, short fades, concatenate
    src = ROOT / "out/audio/film_mix.wav"
    parts, labels = [], []
    for i, (s, e) in enumerate(segs):
        d = e - s
        parts.append(f"[0:a]atrim={s}:{e},asetpts=PTS-STARTPTS,afade=t=in:d={XF},afade=t=out:st={d - XF}:d={XF}[a{i}]")
        labels.append(f"[a{i}]")
    fc = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(segs)}:v=0:a=1[out]"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-filter_complex", fc, "-map", "[out]",
                    str(ROOT / "out/audio/trailer_mix.wav")], check=True)
    print(json.dumps({"segments": segs, "duration_s": round(total, 2)}))


if __name__ == "__main__":
    main()
