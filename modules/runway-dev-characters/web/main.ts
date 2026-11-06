// Browser client for the Runway Characters demo. Status: DRAFT (see ../MODULE.md).
import './styles.css';
import { streamTo, AvatarEvent, type AvatarSession, type SessionState } from '@runwayml/avatars';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const avatarEl = $<HTMLVideoElement>('avatar');
const presetEl = $<HTMLSelectElement>('preset');
const startBtn = $<HTMLButtonElement>('start');
const muteBtn = $<HTMLButtonElement>('mute');
const endBtn = $<HTMLButtonElement>('end');
const statusEl = $<HTMLParagraphElement>('status');
const transcriptEl = $<HTMLOListElement>('transcript');

let session: AvatarSession | undefined;

const STATE_LABEL: Record<SessionState, string> = {
  idle: 'Bereit',
  connecting: 'Verbinde …',
  reconnecting: 'Verbindung wird wiederhergestellt …',
  active: 'Verbunden — einfach sprechen',
  ending: 'Beende …',
  ended: 'Beendet',
  error: 'Fehler',
};

function setStatus(text: string) {
  statusEl.textContent = text;
}

function resetControls() {
  session = undefined;
  startBtn.disabled = false;
  presetEl.disabled = false;
  muteBtn.disabled = true;
  endBtn.disabled = true;
  muteBtn.textContent = 'Stumm';
}

async function loadConfig() {
  const res = await fetch('/api/avatar/config');
  const cfg = (await res.json()) as {
    presets: string[];
    customAvatarConfigured: boolean;
    apiKeyConfigured: boolean;
  };
  if (cfg.customAvatarConfigured) {
    presetEl.add(new Option('Eigener Character (RUNWAY_AVATAR_ID)', ''));
    presetEl.disabled = true;
  } else {
    for (const p of cfg.presets) presetEl.add(new Option(p, p));
  }
  if (!cfg.apiKeyConfigured) {
    setStatus('Server ohne RUNWAYML_API_SECRET — siehe README.');
    startBtn.disabled = true;
  }
}

startBtn.onclick = async () => {
  startBtn.disabled = true;
  presetEl.disabled = true;
  transcriptEl.replaceChildren();
  setStatus('Session wird angelegt …');
  try {
    const res = await fetch('/api/avatar/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: presetEl.value }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

    // Credentials are single-use: on failure a new Session must be created.
    const s = await streamTo({ credentials: body, target: avatarEl });
    session = s;

    s.on(AvatarEvent.StateChanged, (state) => {
      setStatus(STATE_LABEL[state]);
      if (state === 'ended' || state === 'error') resetControls();
    });
    s.on(AvatarEvent.AvatarVideoReady, () => setStatus(STATE_LABEL.active));
    s.on(AvatarEvent.MediaChanged, () => {
      muteBtn.textContent = s.mic.isEnabled ? 'Stumm' : 'Mikro an';
    });
    s.on(AvatarEvent.MicPermissionChanged, (state) => {
      if (state === 'denied') setStatus('Mikrofon verweigert — bitte im Browser freigeben.');
    });
    s.on(AvatarEvent.Transcript, (entry) => {
      if (!entry.final) return;
      const li = document.createElement('li');
      li.textContent = entry.text;
      transcriptEl.append(li);
    });
    s.on(AvatarEvent.Error, (err) => {
      console.error('Session error:', err);
      setStatus(`Fehler: ${err.message}`);
    });

    muteBtn.disabled = false;
    endBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setStatus(`Start fehlgeschlagen: ${(err as Error).message}`);
    resetControls();
  }
};

muteBtn.onclick = () => void session?.mic.toggle();
endBtn.onclick = async () => {
  endBtn.disabled = true;
  await session?.end();
  setStatus(STATE_LABEL.ended);
  resetControls();
};
// End the live session when the tab closes so it does not keep consuming credits.
window.addEventListener('pagehide', () => void session?.end());

loadConfig().catch((err) => setStatus(`Konfiguration nicht ladbar: ${(err as Error).message}`));
