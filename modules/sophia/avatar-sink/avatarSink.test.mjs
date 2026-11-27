import { test } from "node:test";
import assert from "node:assert/strict";
import { resampleLinear, float32ToPcm16, PcmChunker, LiveAvatarLiteSink, NoopAvatarSink, createRealtimeAvatarBridge, TARGET_RATE } from "./avatarSink.mjs";

test("48 kHz -> 24 kHz, PCM16 little-endian with clipping", () => {
  const r = resampleLinear(new Float32Array(480).fill(0.5), 48000);
  assert.equal(r.length, 240);
  const pcm = float32ToPcm16(new Float32Array([1, -1, 2, 0]));
  const v = new DataView(pcm.buffer);
  assert.deepEqual([v.getInt16(0, true), v.getInt16(2, true), v.getInt16(4, true), v.getInt16(6, true)], [32767, -32768, 32767, 0]);
});

test("chunker emits exact 1 s chunks (48000 bytes) and flushes remainder", () => {
  const c = new PcmChunker();
  assert.equal(c.push(new Uint8Array(30000)).length, 0);
  const out = c.push(new Uint8Array(30000));
  assert.equal(out.length, 1); assert.equal(Buffer.from(out[0], "base64").length, 48000);
  assert.equal(Buffer.from(c.flush()[0], "base64").length, 12000);
  assert.equal(c.flush().length, 0);
});

test("LiveAvatar LITE: nothing sent before connected; speak/speak_end/interrupt frames", () => {
  const sent = []; const s = new LiveAvatarLiteSink({ send: (f) => sent.push(JSON.parse(f)) });
  s.speak("AAAA"); assert.equal(sent.length, 0, "fail closed until session connected");
  s.onProviderEvent({ type: "session.state_updated", state: "connected" });
  s.speak("AAAA"); s.speakEnd(); s.speakEnd(); s.speak("BBBB"); s.interrupt(); s.keepAlive();
  assert.deepEqual(sent.map((f) => f.type), ["agent.speak", "agent.speak_end", "agent.speak", "agent.interrupt", "session.keep_alive"]);
  assert.throws(() => new LiveAvatarLiteSink({ send() {}, maxPacketBytes: 10 }).frame({ type: "agent.speak", audio: "x".repeat(20) }), /packet_too_large/);
});

test("Realtime bridge: speech -> chunks -> end; user barge-in -> interrupt; idle audio ignored", () => {
  const calls = []; const sink = { speak: (c) => calls.push(["speak", Buffer.from(c, "base64").length]), speakEnd: () => calls.push(["end"]), interrupt: () => calls.push(["interrupt"]) };
  const b = createRealtimeAvatarBridge(sink);
  b.onAudioFrame(new Float32Array(48000), 48000); assert.equal(calls.length, 0, "no audio forwarded while Sophia is silent");
  b.onRealtimeEvent({ type: "output_audio_buffer.started" });
  b.onAudioFrame(new Float32Array(72000), 48000);           // 1.5 s at 48 kHz -> 36000 samples @24 kHz
  b.onRealtimeEvent({ type: "output_audio_buffer.stopped" });
  assert.deepEqual(calls, [["speak", 48000], ["speak", 24000], ["end"]]);
  calls.length = 0;
  b.onRealtimeEvent({ type: "output_audio_buffer.started" });
  b.onAudioFrame(new Float32Array(9600), 48000);
  b.onRealtimeEvent({ type: "input_audio_buffer.speech_started" });
  assert.deepEqual(calls, [["interrupt"]], "barge-in interrupts avatar and drops buffered audio");
  assert.equal(b.speaking, false);
});

test("voice-only fallback has the same interface and no side effects", () => {
  const b = createRealtimeAvatarBridge(new NoopAvatarSink());
  b.onRealtimeEvent({ type: "output_audio_buffer.started" }); b.onAudioFrame(new Float32Array(TARGET_RATE), TARGET_RATE);
  b.onRealtimeEvent({ type: "response.done" }); assert.equal(b.speaking, false);
});
