// Browser client for the Runway Characters demo. Status: V0.2 DRAFT (see ../MODULE.md).
// Holds no long-lived secret: the access token is sent once to /api/auth/login and then
// forgotten; the server answers with an HttpOnly cookie. The Runway sessionKey is passed
// straight to streamTo (single use) and the per-session control token lives only in memory.
import './styles.css';
import { streamTo, AvatarEvent, type AvatarSession, type SessionState } from '@runwayml/avatars';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const loginForm = $<HTMLFormElement>('login');
const tokenEl = $<HTMLInputElement>('token');
const appEl = $<HTMLDivElement>('app');
const avatarEl = $<HTMLVideoElement>('avatar');
const presetEl = $<HTMLSelectElement>('preset');
const startBtn = $<HTMLButtonElement>('start');
const muteBtn = $<HTMLButtonElement>('mute');
const endBtn = $<HTMLButtonElement>('end');
const statusEl = $<HTMLParagraphElement>('status');
const budgetEl = $<HTMLParagraphElement>('budget');
const transcriptEl = $<HTMLOListElement>('transcript');

const HEARTBEAT_MS = 15_000;

interface Control {
  sessionId: string;
  controlToken: string;
}

let session: AvatarSession | undefined;
let control: Control | undefined;
let heartbeat: number | undefined;

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

async function api(path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function refreshBudget() {
  const { res, data } = await api('/api/avatar/status');
  if (!res.ok) return;
  budgetEl.textContent =
    `Budget (lokale Schätzung): ${data.remainingCredits} von ${data.budgetCredits} Credits frei · ` +
    `Reservierung je Session ${data.perSessionReservation} Credits · max. ${data.maxDurationS} s`;
}

/** Tell the server to end the session. keepalive lets it outlive a closing tab. */
function endOnServer(reason: string, keepalive = false) {
  const c = control;
  if (!c) return Promise.resolve();
  control = undefined;
  return fetch(`/api/avatar/sessions/${encodeURIComponent(c.sessionId)}/end`, {
    method: 'POST',
    keepalive,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Session-Control': c.controlToken },
    body: JSON.stringify({ reason }),
  }).catch(() => undefined);
}

function stopHeartbeat() {
  if (heartbeat !== undefined) window.clearInterval(heartbeat);
  heartbeat = undefined;
}

function startHeartbeat() {
  stopHeartbeat();
  const beat = async () => {
    const c = control;
    if (!c) return stopHeartbeat();
    const res = await fetch(`/api/avatar/sessions/${encodeURIComponent(c.sessionId)}/heartbeat`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Session-Control': c.controlToken },
      body: '{}',
    }).catch(() => undefined);
    if (res && res.status === 410) {
      // Server ended the session (timeout, budget, restart): stop locally too.
      control = undefined;
      void session?.end();
    }
  };
  void beat();
  heartbeat = window.setInterval(beat, HEARTBEAT_MS);
}

function resetControls() {
  stopHeartbeat();
  session = undefined;
  startBtn.disabled = false;
  presetEl.disabled = false;
  muteBtn.disabled = true;
  endBtn.disabled = true;
  muteBtn.textContent = 'Stumm';
  void refreshBudget();
}

async function showApp() {
  const { data: cfg } = await api('/api/avatar/config');
  presetEl.replaceChildren();
  if (cfg.customAvatarConfigured) {
    presetEl.add(new Option('Eigener Character (RUNWAY_AVATAR_ID)', ''));
    presetEl.disabled = true;
  } else {
    for (const p of cfg.presets as string[]) presetEl.add(new Option(p, p));
  }
  loginForm.hidden = true;
  appEl.hidden = false;
  if (!cfg.apiKeyConfigured) {
    setStatus('Server ohne RUNWAYML_API_SECRET — siehe README.');
    startBtn.disabled = true;
  } else {
    setStatus('Bereit');
  }
  await refreshBudget();
}

async function init() {
  const { data: cfg } = await api('/api/avatar/config');
  if (!cfg.authConfigured) {
    setStatus('Server ohne NYXA_ACCESS_TOKEN — Zugriff gesperrt (siehe README).');
    return;
  }
  const { data: me } = await api('/api/auth/me');
  if (me.authenticated) return showApp();
  loginForm.hidden = false;
  setStatus('Bitte mit dem Zugangstoken aus der Server-.env anmelden.');
}

loginForm.onsubmit = async (event) => {
  event.preventDefault();
  const token = tokenEl.value;
  tokenEl.value = '';
  const { res, data } = await api('/api/auth/login', { method: 'POST', json: { token } });
  if (!res.ok) {
    setStatus(`Anmeldung fehlgeschlagen: ${data.error ?? res.status}`);
    return;
  }
  await showApp();
};

startBtn.onclick = async () => {
  startBtn.disabled = true;
  presetEl.disabled = true;
  transcriptEl.replaceChildren();
  setStatus('Session wird angelegt …');
  try {
    // One fresh key per click: a double click or a network retry cannot create two sessions.
    const { res, data } = await api('/api/avatar/connect', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      json: { presetId: presetEl.value },
    });
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    control = { sessionId: data.sessionId, controlToken: data.controlToken };

    // Credentials are single-use (Runway docs): on failure a new Session must be created.
    let s: AvatarSession;
    try {
      s = await streamTo({ credentials: { sessionId: data.sessionId, sessionKey: data.sessionKey }, target: avatarEl });
    } catch (err) {
      await endOnServer('connect_failed');
      throw err;
    }
    session = s;
    startHeartbeat();

    s.on(AvatarEvent.StateChanged, (state) => {
      setStatus(STATE_LABEL[state]);
      if (state === 'ended' || state === 'error') {
        void endOnServer(state === 'error' ? 'client_error' : 'client_ended');
        resetControls();
      }
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
      li.textContent = entry.text; // textContent: no HTML injection from transcript text
      transcriptEl.append(li);
    });
    s.on(AvatarEvent.Error, (err) => {
      console.error('Session error:', err.name);
      setStatus(`Fehler: ${err.message}`);
    });

    muteBtn.disabled = false;
    endBtn.disabled = false;
  } catch (err) {
    setStatus(`Start fehlgeschlagen: ${(err as Error).message}`);
    resetControls();
  }
};

muteBtn.onclick = () => void session?.mic.toggle();
endBtn.onclick = async () => {
  endBtn.disabled = true;
  await session?.end();
  await endOnServer('user_end');
  setStatus(STATE_LABEL.ended);
  resetControls();
};

// End the live session when the tab closes so it does not keep consuming credits.
// If this request is lost (crash, network), the server reaper ends it after the heartbeat timeout.
window.addEventListener('pagehide', () => {
  void session?.end();
  void endOnServer('pagehide', true);
});

init().catch((err) => setStatus(`Konfiguration nicht ladbar: ${(err as Error).message}`));
