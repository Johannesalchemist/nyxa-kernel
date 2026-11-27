/**
 * Room-client integration of the provider-neutral avatar sink (WP Sophia, Continuation R3).
 * Wire this into the EXISTING Room voice client after its RTCPeerConnection and the
 * "oai-events" data channel exist. The voice path is not touched: audio still plays through
 * the existing <audio> element; we only tap a copy of the remote track for lip-sync.
 *   attachAvatar({ pc, dc, sink, workletUrl })  -> { detach(), bridge }
 * Without a provider pass `new NoopAvatarSink()`: the full voice dialog keeps working.
 */
import { createRealtimeAvatarBridge } from "./avatarSink.mjs";

export async function attachAvatar({ pc, dc, sink, workletUrl = "./avatarCaptureWorklet.js", audioContext }) {
  const bridge = createRealtimeAvatarBridge(sink);
  const ctx = audioContext ?? new AudioContext();
  await ctx.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(ctx, "nyxa-avatar-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (e) => bridge.onAudioFrame(e.data.frame, e.data.sampleRate);
  let source = null;
  const tap = (stream) => { source?.disconnect(); source = ctx.createMediaStreamSource(stream); source.connect(node); };
  const onTrack = (ev) => { if (ev.track.kind === "audio") tap(ev.streams[0] ?? new MediaStream([ev.track])); };
  pc.addEventListener("track", onTrack);
  for (const r of pc.getReceivers()) if (r.track?.kind === "audio" && r.track.readyState === "live") tap(new MediaStream([r.track]));
  const onMsg = (m) => { try { bridge.onRealtimeEvent(JSON.parse(m.data)); } catch { /* non-JSON frames ignored */ } };
  dc.addEventListener("message", onMsg);
  return { bridge, detach() { pc.removeEventListener("track", onTrack); dc.removeEventListener("message", onMsg); source?.disconnect(); node.disconnect(); } };
}
