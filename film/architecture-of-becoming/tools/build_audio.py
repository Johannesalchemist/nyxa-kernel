#!/usr/bin/env python3
"""NYXA – The Architecture of Becoming: audio + timeline + subtitle builder.

Pipeline (deterministic, offline, no paid services):
  1. Synthesize every narration line with Piper (local TTS).
  2. Derive the film timeline from the real clip durations -> src/timeline.js + out/timeline.json
  3. Generate a procedural score (numpy) that follows the timeline cues.
  4. Mix narration over score with sidechain-style ducking -> out/audio/film_mix.wav
  5. Write EN/DE subtitles (SRT + WebVTT) -> subtitles/

Usage: python3 tools/build_audio.py --voice /path/en_GB-cori-high.onnx
"""
import argparse
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
RNG = np.random.default_rng(20261125)


# ----------------------------------------------------------------------------- io
def read_wav(path):
    with wave.open(str(path), "rb") as w:
        sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
        data = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    if sr != SR:  # linear resample is adequate for speech at these ratios
        t_old = np.arange(len(data)) / sr
        t_new = np.arange(int(len(data) * SR / sr)) / SR
        data = np.interp(t_new, t_old, data).astype(np.float32)
    return data


def write_wav(path, stereo):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.reshape(-1).tobytes())


# ----------------------------------------------------------------------------- tts
def synthesize(lines, voice, length_scale, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    clips = {}
    for ln in lines:
        p = outdir / f"{ln['id']}.wav"
        cache = outdir / f"{ln['id']}.txt"
        key = f"{voice}|{length_scale}|{ln['en']}"
        if not (p.exists() and cache.exists() and cache.read_text() == key):
            subprocess.run(
                [sys.executable, "-m", "piper", "-m", str(voice), "-f", str(p),
                 "--length-scale", str(length_scale), "--sentence-silence", "0.45"],
                input=ln["en"].encode(), check=True, capture_output=True)
            cache.write_text(key)
        a = read_wav(p)
        # trim leading/trailing silence for tight timing
        idx = np.where(np.abs(a) > 0.01)[0]
        a = a[max(0, idx[0] - 480): idx[-1] + 2400] if len(idx) else a
        clips[ln["id"]] = a
    return clips


# ------------------------------------------------------------------------ timeline
def build_timeline(script, clips):
    t = 0.0
    acts, lines = [], []
    for act in script["acts"]:
        a_start = t
        t += act["lead_in"]
        for ln in act["lines"]:
            t += ln["gap"]
            dur = len(clips[ln["id"]]) / SR
            lines.append({"id": ln["id"], "act": act["id"], "start": round(t, 3),
                          "end": round(t + dur, 3), "en": ln["en"], "de": ln["de"]})
            t += dur
        t += act["tail"]
        acts.append({"id": act["id"], "title": act["title"], "start": round(a_start, 3), "end": round(t, 3)})
    return {"duration": round(t, 3), "acts": acts, "lines": lines, "end_card": script["end_card"],
            "title": script["title"]}


# --------------------------------------------------------------------------- score
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_ar(n, a, r):
    e = np.ones(n, np.float32)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def pad_voice(freq, dur, bright=0.25, detune=0.12):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    for k, amp in ((1, 1.0), (2, bright), (3, bright * 0.45), (4, bright * 0.2)):
        for d in (-detune, 0.0, detune):
            f = freq * k * (1 + d / 100)
            ph = RNG.uniform(0, 2 * np.pi)
            out += amp * np.sin(2 * np.pi * f * t + ph).astype(np.float32)
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * RNG.uniform(0.03, 0.08) * t + RNG.uniform(0, 6))
    return out * lfo / 9.0


def add(buf, sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= buf.shape[0]:
        return
    sig = sig[: buf.shape[0] - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r


def chord(buf, notes, start, dur, gain, bright=0.25, a=3.0, r=3.5):
    for j, nn in enumerate(notes):
        v = pad_voice(midi(nn), dur, bright) * env_ar(int(dur * SR), a, r)
        add(buf, v, start, pan=(j / max(1, len(notes) - 1) - 0.5) * 0.7, gain=gain)


def heartbeat(buf, start, end, bpm, gain):
    period = 60.0 / bpm
    t = start
    while t < end:
        for off, g in ((0.0, 1.0), (0.24, 0.6)):  # lub-dub
            n = int(0.35 * SR)
            tt = np.arange(n) / SR
            f = 52 * np.exp(-tt * 5) + 38
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 11)
            add(buf, s.astype(np.float32), t + off, 0.0, gain * g)
        t += period


def pluck(buf, freq, start, gain, pan):
    n = int(3.2 * SR)
    tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * tt) + 0.3 * np.sin(2 * np.pi * freq * 2.005 * tt)) * np.exp(-tt * 1.6)
    s *= np.minimum(1, tt / 0.004)
    add(buf, s.astype(np.float32), start, pan, gain)


def cue(tl, lid):
    return next(l for l in tl["lines"] if l["id"] == lid)


def act(tl, aid):
    return next(a for a in tl["acts"] if a["id"] == aid)


def build_score(tl):
    n = int((tl["duration"] + 2) * SR)
    buf = np.zeros((n, 2), np.float32)
    A = {a["id"]: a for a in tl["acts"]}
    # harmonic plan (MIDI). D minor world -> F/Bb warmth -> D major arrival.
    plan = {
        "I": [[38, 45, 50, 52, 53], [38, 45, 50, 57, 52]],
        "II": [[34, 46, 50, 53, 57], [41, 48, 53, 57, 60]],
        "III": [[41, 48, 55, 57, 60], [36, 48, 52, 55, 62]],
        "IV": [[38, 45, 50, 53, 57], [34, 46, 50, 53, 58]],
        "V": [[43, 50, 55, 58, 62], [38, 45, 52, 57, 60]],
        "VI": [[38, 45, 50, 54, 57], [43, 50, 55, 59, 62], [38, 45, 50, 54, 57, 62, 66]],
    }
    gains = {"I": 0.10, "II": 0.11, "III": 0.12, "IV": 0.085, "V": 0.11, "VI": 0.12}
    for aid, chords in plan.items():
        a = A[aid]
        s, e = a["start"], a["end"]
        seg = (e - s) / len(chords)
        for k, ch in enumerate(chords):
            cs = s + k * seg - (1.5 if k or aid != "I" else 0)
            chord(buf, ch, max(0, cs), seg + 4.0, gains[aid], bright=0.18 if aid in "IIV" else 0.28)

    # Act I + IV: Sophia Heartbeat motif
    heartbeat(buf, A["I"]["start"] + 1.0, A["I"]["start"] + 14.0, 50, 0.22)
    heartbeat(buf, A["IV"]["start"] + 0.5, A["IV"]["end"] - 1.0, 54, 0.12)
    heartbeat(buf, A["VI"]["start"] + 0.5, A["VI"]["start"] + 9.0, 50, 0.14)

    # Act II: memory fragments arrive as soft plucks
    pent = [62, 65, 67, 69, 72, 74, 77]
    t = A["II"]["start"] + 3.0
    while t < A["II"]["end"] - 3:
        pluck(buf, midi(RNG.choice(pent)), t, 0.05, RNG.uniform(-0.8, 0.8))
        t += RNG.uniform(0.9, 2.2)

    # Act V: new papers = new stars (high shimmer plucks), failure cluster, acceptance
    v = A["V"]
    t = v["start"] + 2.0
    while t < cue(tl, "L25")["start"]:
        pluck(buf, midi(RNG.choice([74, 76, 79, 81, 86])), t, 0.04, RNG.uniform(-0.9, 0.9))
        t += RNG.uniform(0.45, 1.3)
    l26 = cue(tl, "L26")
    clus = [62, 63, 68, 69]
    chord(buf, clus, l26["start"] + 0.8, l26["end"] - l26["start"] + 1.2, 0.05, bright=0.5, a=2.0, r=0.6)
    l28 = cue(tl, "L28")
    for k, nn in enumerate([62, 66, 69, 74]):
        pluck(buf, midi(nn), l28["start"] + 2.2 + k * 0.18, 0.06, -0.4 + k * 0.25)

    # Act VI: final swell under end card
    fin = tl["duration"] - 12.0
    chord(buf, [26, 38, 45, 50, 54, 57, 62], fin, 12.0, 0.07, bright=0.22, a=4.0, r=6.0)

    # gentle low-pass + reverb
    sos = butter(2, 5200, "low", fs=SR, output="sos")
    buf = sosfilt(sos, buf, axis=0).astype(np.float32)
    ir_n = int(3.2 * SR)
    ir_t = np.arange(ir_n) / SR
    rev = np.zeros_like(buf)
    for c in range(2):
        ir = (RNG.standard_normal(ir_n) * np.exp(-ir_t * 2.1)).astype(np.float32)
        ir /= np.sqrt(np.sum(ir ** 2))
        rev[:, c] = fftconvolve(buf[:, c], ir)[: len(buf)]
    out = 0.72 * buf + 0.55 * rev
    # global fade in/out
    out[: int(2 * SR)] *= np.linspace(0, 1, int(2 * SR))[:, None]
    fo = int(6 * SR)
    out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return out


# ----------------------------------------------------------------------------- mix
def build_voice(tl, clips, n):
    vo = np.zeros(n, np.float32)
    for ln in tl["lines"]:
        c = clips[ln["id"]]
        i = int(ln["start"] * SR)
        vo[i:i + len(c)] += c[: n - i]
    return vo


def duck(music, voice):
    e = np.abs(voice)
    k = int(0.25 * SR)
    e = np.convolve(e, np.ones(k) / k, mode="same")
    g = 1.0 - 0.55 * np.clip(e / 0.05, 0, 1)
    g = np.convolve(g, np.ones(k) / k, mode="same")
    return music * g[:, None]


# ------------------------------------------------------------------------ subtitles
def chunk(text, maxlen=84):
    """Split a line into subtitle cues at sentence/comma boundaries (<= ~2 lines each)."""
    import re
    parts = re.split(r"(?<=[.?!:])\s+", text)
    cues, cur = [], ""
    for p in parts:
        if len(cur) + len(p) + 1 <= maxlen:
            cur = (cur + " " + p).strip()
        else:
            if cur:
                cues.append(cur)
            while len(p) > maxlen:
                cut = p.rfind(",", 0, maxlen)
                cut = cut if cut > 20 else p.rfind(" ", 0, maxlen)
                cues.append(p[: cut + 1].strip())
                p = p[cut + 1:].strip()
            cur = p
    if cur:
        cues.append(cur)
    return cues


def wrap2(s, width=46):
    if len(s) <= width:
        return s
    mid = len(s) // 2
    left, right = s.rfind(" ", 0, mid + 6), s.find(" ", mid - 6)
    cut = left if (mid - left) <= (right - mid if right != -1 else 999) else right
    return s[:cut].strip() + "\n" + s[cut:].strip()


def ts(t, vtt=False):
    h, m = int(t // 3600), int(t % 3600 // 60)
    s = t % 60
    sep = "." if vtt else ","
    return f"{h:02d}:{m:02d}:{int(s):02d}{sep}{int(round((s - int(s)) * 1000)):03d}"


def write_subs(tl, lang, outdir):
    cues = []
    for ln in tl["lines"]:
        parts = chunk(ln[lang])
        total = sum(len(p) for p in parts)
        t = ln["start"]
        span = ln["end"] - ln["start"]
        for p in parts:
            d = span * len(p) / total
            cues.append((t, t + d, wrap2(p)))
            t += d
    # hold each cue 0.25 s past speech, but never into the next cue
    cues = [(a, min(b + 0.25, cues[i + 1][0] - 0.04) if i + 1 < len(cues) else b + 0.25, txt)
            for i, (a, b, txt) in enumerate(cues)]
    outdir.mkdir(parents=True, exist_ok=True)
    srt = "\n".join(f"{i+1}\n{ts(a)} --> {ts(b)}\n{txt}\n" for i, (a, b, txt) in enumerate(cues))
    (outdir / f"architecture-of-becoming.{lang}.srt").write_text(srt, encoding="utf-8")
    vtt = "WEBVTT\n\n" + "\n".join(f"{ts(a, True)} --> {ts(b, True)}\n{txt}\n" for a, b, txt in cues)
    (outdir / f"architecture-of-becoming.{lang}.vtt").write_text(vtt, encoding="utf-8")
    return cues


# ---------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    args = ap.parse_args()
    script = json.loads((ROOT / "script/narration.json").read_text())
    lines = [l for a in script["acts"] for l in a["lines"]]
    out = ROOT / "out"
    clips = synthesize(lines, Path(args.voice), script["voice"]["length_scale"], out / "audio/lines")
    tl = build_timeline(script, clips)
    tl["subtitles"] = {lang: [{"start": round(a, 3), "end": round(b, 3), "text": t}
                              for a, b, t in write_subs(tl, lang, ROOT / "subtitles")] for lang in ("en", "de")}
    (out / "timeline.json").write_text(json.dumps(tl, indent=1, ensure_ascii=False))
    (ROOT / "src/timeline.js").write_text(
        "/* GENERATED by tools/build_audio.py from script/narration.json + real TTS clip durations. Do not edit. */\n"
        "window.TIMELINE = " + json.dumps(tl, ensure_ascii=False) + ";\n", encoding="utf-8")
    music = build_score(tl)
    voice = build_voice(tl, clips, music.shape[0])
    mix = duck(music, voice) + np.stack([voice, voice], axis=1) * 0.92
    peak = np.max(np.abs(mix))
    mix = mix / peak * 0.89
    write_wav(out / "audio/film_mix.wav", mix)
    write_wav(out / "audio/score_only.wav", music / np.max(np.abs(music)) * 0.89)
    print(json.dumps({"duration_s": tl["duration"], "acts": [(a["id"], a["start"], a["end"]) for a in tl["acts"]]}))


if __name__ == "__main__":
    main()
