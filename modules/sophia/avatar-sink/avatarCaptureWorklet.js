// AudioWorkletProcessor: forwards mono Float32 frames of the REMOTE Realtime audio to the main
// thread (128-sample render quanta batched to ~20 ms). No audio is modified or played here.
class NyxaAvatarCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.len = 0; this.target = Math.round(sampleRate / 50); }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) { this.buf.push(ch.slice()); this.len += ch.length; }
    if (this.len >= this.target) {
      const out = new Float32Array(this.len); let o = 0;
      for (const b of this.buf) { out.set(b, o); o += b.length; }
      this.port.postMessage({ frame: out, sampleRate }, [out.buffer]); this.buf = []; this.len = 0;
    }
    return true;
  }
}
registerProcessor("nyxa-avatar-capture", NyxaAvatarCapture);
