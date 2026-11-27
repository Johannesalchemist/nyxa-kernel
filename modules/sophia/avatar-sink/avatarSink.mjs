/**
 * WP4 provider-neutral avatar sink for Sophia (2026-11-27, Europe/Berlin). Owner: Johannes Suess.
 * Generated with Claude Code. Status: DRAFT / TESTED-IN-ISOLATION / NOT CONNECTED.
 *
 * The voice stays the EXISTING GPT Realtime path (thechat /api/room/live/session). An avatar only
 * renders lips/face for audio that Realtime already produced. No second TTS, no second persona.
 * Provider-specific code is limited to one adapter (LiveAvatar LITE); NoopAvatarSink keeps the
 * voice-only experience when no provider is mandated.
 */
export const TARGET_RATE = 24000;               // LiveAvatar LITE: PCM 16-bit 24 kHz mono
export const CHUNK_SAMPLES = TARGET_RATE;       // ~1 s per chunk (docs recommendation)
export const MAX_PACKET_BYTES = 1024 * 1024;    // docs: max 1 MB per WebSocket packet

/** Linear resampler for mono Float32 audio (e.g. AudioWorklet frames at 48 kHz). */
export function resampleLinear(input, fromRate, toRate = TARGET_RATE) {
  if (!(input instanceof Float32Array) || !(fromRate > 0) || !(toRate > 0)) throw TypeError("resample_args");
  if (fromRate === toRate) return input.slice();
  const outLen = Math.floor(input.length * toRate / fromRate);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * fromRate / toRate, i0 = Math.floor(pos), f = pos - i0;
    const a = input[i0] ?? 0, b = input[Math.min(i0 + 1, input.length - 1)] ?? a;
    out[i] = a + (b - a) * f;
  }
  return out;
}

/** Float32 [-1,1] -> little-endian signed 16-bit PCM bytes (clipped). */
export function float32ToPcm16(input) {
  const buf = new Uint8Array(input.length * 2), view = new DataView(buf.buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return buf;
}

const toBase64 = (bytes) => (typeof Buffer !== "undefined"
  ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")
  : btoa(String.fromCharCode(...bytes)));

/** Accumulates PCM16 bytes and emits base64 chunks of ~1 s. */
export class PcmChunker {
  constructor(chunkSamples = CHUNK_SAMPLES) { this.chunkBytes = chunkSamples * 2; this.parts = []; this.len = 0; }
  push(pcm16) {
    this.parts.push(pcm16); this.len += pcm16.length;
    const out = [];
    while (this.len >= this.chunkBytes) out.push(toBase64(this.take(this.chunkBytes)));
    return out;
  }
  flush() { return this.len ? [toBase64(this.take(this.len))] : []; }
  clear() { this.parts = []; this.len = 0; }
  take(n) {
    const out = new Uint8Array(n); let off = 0;
    while (off < n) {
      const p = this.parts[0], need = n - off;
      if (p.length <= need) { out.set(p, off); off += p.length; this.parts.shift(); }
      else { out.set(p.subarray(0, need), off); this.parts[0] = p.subarray(need); off += need; }
    }
    this.len -= n; return out;
  }
}

/** Voice-only fallback: same interface, no provider, no cost. */
export class NoopAvatarSink {
  constructor() { this.kind = "none"; this.state = "idle"; }
  speak() {} speakEnd() {} interrupt() {} keepAlive() {}
}

/**
 * LiveAvatar LITE adapter. `send` delivers one JSON text frame on the session WebSocket.
 * Events per docs.liveavatar.com lite-mode/events: agent.speak{audio}, agent.speak_end,
 * agent.interrupt, session.keep_alive. Commands only after session.state_updated=connected.
 */
export class LiveAvatarLiteSink {
  constructor({ send, maxPacketBytes = MAX_PACKET_BYTES }) {
    if (typeof send !== "function") throw TypeError("send_required");
    this.kind = "liveavatar-lite"; this.send = send; this.max = maxPacketBytes;
    this.connected = false; this.open = false; this.state = "idle";
  }
  onProviderEvent(evt) {
    if (evt?.type === "session.state_updated") this.connected = evt.state === "connected";
    if (evt?.type === "agent.state_updated") this.state = evt.new_state;
  }
  frame(obj) {
    const s = JSON.stringify(obj);
    if (s.length > this.max) throw RangeError("packet_too_large");
    if (!this.connected) return false;
    this.send(s); return true;
  }
  speak(base64Chunk) { if (this.frame({ type: "agent.speak", audio: base64Chunk })) this.open = true; }
  speakEnd() { if (this.open && this.frame({ type: "agent.speak_end" })) this.open = false; }
  interrupt() { if (this.frame({ type: "agent.interrupt" })) this.open = false; }
  keepAlive() { this.frame({ type: "session.keep_alive" }); }
}

/**
 * Glue between the existing GPT Realtime session and any sink. Feed it:
 *  - onRealtimeEvent(evt): data-channel events of the Realtime session
 *  - onAudioFrame(float32, sampleRate): remote Realtime audio captured by an AudioWorklet
 * Barge-in: user speech start or a cleared output buffer interrupts the avatar immediately.
 */
export function createRealtimeAvatarBridge(sink, { chunker = new PcmChunker() } = {}) {
  let speaking = false;
  return {
    onAudioFrame(float32, sampleRate) {
      if (!speaking) return;
      for (const c of chunker.push(float32ToPcm16(resampleLinear(float32, sampleRate)))) sink.speak(c);
    },
    onRealtimeEvent(evt) {
      switch (evt?.type) {
        case "output_audio_buffer.started": speaking = true; break;
        case "output_audio_buffer.stopped":
        case "response.done":
          if (speaking) { for (const c of chunker.flush()) sink.speak(c); sink.speakEnd(); speaking = false; }
          break;
        case "input_audio_buffer.speech_started":
        case "output_audio_buffer.cleared":
          chunker.clear(); if (speaking) sink.interrupt(); speaking = false; break;
        default: break;
      }
    },
    get speaking() { return speaking; },
  };
}
