// WP-SOPHIA-LIVE-STUDIO: status only. The voice session itself runs inside The Room
// (same origin as its broker), so Studio never sees tokens, audio or transcripts.
const state = document.getElementById('sl-state');
const frame = document.getElementById('sl-room');
let loaded = false;
frame.addEventListener('load', () => {
  loaded = true;
  state.textContent = 'The Room verbunden · Mikrofon im Fenster aktivieren';
});
setTimeout(() => {
  if (!loaded) state.textContent = 'The Room lädt nicht – „Eigener Tab“ nutzen';
}, 12000);
if (!window.isSecureContext || !navigator.mediaDevices) {
  state.textContent = 'Kein sicherer Kontext – Mikrofon nicht verfügbar';
}
