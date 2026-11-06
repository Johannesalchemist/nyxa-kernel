/**
 * Test harness: a stateful mock of the Runway realtime API, a fake clock and an HTTP
 * client with a cookie jar. The mock CAN create sessions, so a test that asserts
 * `creates === 0` proves an action that was technically possible was prevented.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { MemoryAuditSink } from '../src/audit.ts';
import { AuthService } from '../src/auth.ts';
import { CAPABILITY_CREATE, loadConfig, type AppConfig } from '../src/config.ts';
import { SessionController } from '../src/controller.ts';
import { StaticPolicyGate, type PolicyGate } from '../src/policy.ts';
import type { AvatarChoice, RemoteSession, RunwayClient } from '../src/session.ts';
import { Ledger } from '../src/store.ts';

export const ACCESS_TOKEN = 'test-access-token-0123456789abcdefghijklmnop';
export const FAKE_API_SECRET = 'key_FAKESECRETFORTESTS0123456789abcdefghijklmnopqrstuvwxyz';

export interface MockOptions {
  /** Statuses returned by successive retrieve calls before the session is cancelled. */
  script?: RemoteSession['status'][];
  createError?: { status: number };
  retrieveError?: boolean;
  deleteFails?: boolean;
  /** Duration reported once COMPLETED/CANCELLED. */
  duration?: number;
  unmanagedInProgress?: string[];
}

export class MockRunway implements RunwayClient {
  creates: Array<{ model: string; avatar: AvatarChoice; maxDuration?: number }> = [];
  deletes: string[] = [];
  conversationDeletes: string[] = [];
  retrieves = 0;
  private counter = 0;
  private readonly polls = new Map<string, number>();
  readonly cancelled = new Set<string>();

  constructor(public opts: MockOptions = {}) {}

  realtimeSessions = {
    create: async (body: { model: 'gwm1_avatars'; avatar: AvatarChoice; maxDuration?: number }) => {
      if (this.opts.createError) throw Object.assign(new Error('create failed'), this.opts.createError);
      this.creates.push(body);
      const id = `00000000-0000-4000-8000-${String(++this.counter).padStart(12, '0')}`;
      this.polls.set(id, 0);
      return { id };
    },
    retrieve: async (id: string): Promise<RemoteSession> => {
      this.retrieves++;
      if (this.opts.retrieveError) throw Object.assign(new Error('retrieve failed'), { status: 500 });
      if (this.cancelled.has(id)) return { status: 'CANCELLED', duration: this.opts.duration };
      const script = this.opts.script ?? ['NOT_READY', 'READY'];
      const n = this.polls.get(id) ?? 0;
      this.polls.set(id, n + 1);
      const status = script[Math.min(n, script.length - 1)];
      if (status === 'READY') return { status, sessionKey: `sessionkey-${id}`, expiresAt: '2026-11-06T12:00:00Z' };
      if (status === 'FAILED') return { status, failure: 'mock failure', failureCode: 'MOCK_FAILED' };
      if (status === 'COMPLETED') return { status, duration: this.opts.duration ?? 30 };
      return { status };
    },
    delete: async (id: string) => {
      this.deletes.push(id);
      if (this.opts.deleteFails) throw Object.assign(new Error('delete failed'), { status: 500 });
      this.cancelled.add(id);
    },
  };

  avatarConversations = {
    list: (_query: { limit?: number }) => {
      const ids = this.opts.unmanagedInProgress ?? [];
      return (async function* () {
        for (const id of ids) yield { id, status: 'in_progress' };
      })();
    },
    delete: async (id: string) => {
      this.conversationDeletes.push(id);
    },
  };
}

export class FakeClock {
  t = 1_800_000_000_000;
  now = () => this.t;
  advance(ms: number) {
    this.t += ms;
  }
  sleep = async (ms: number) => {
    this.t += ms;
  };
}

export const BASE_ENV: NodeJS.ProcessEnv = {
  RUNWAYML_API_SECRET: FAKE_API_SECRET,
  NYXA_ACCESS_TOKEN: ACCESS_TOKEN,
  RUNWAY_BUDGET_CREDITS: '1000',
  NYXA_GRANTED_CAPABILITIES: CAPABILITY_CREATE,
  MAX_CONCURRENT_SESSIONS: '2',
  SESSION_CREATE_LIMIT: '50',
  RUNWAY_MAX_DURATION_S: '60',
  PORT: '3000',
};

export interface Harness {
  config: AppConfig;
  mock: MockRunway;
  clock: FakeClock;
  ledger: Ledger;
  audit: MemoryAuditSink;
  controller: SessionController;
  stateDir: string;
  logs: string[];
}

export function makeHarness(
  env: NodeJS.ProcessEnv = {},
  mockOpts: MockOptions = {},
  options: { stateDir?: string; gate?: PolicyGate; mock?: MockRunway; clock?: FakeClock } = {},
): Harness {
  const stateDir = options.stateDir ?? mkdtempSync(join(tmpdir(), 'nyxa-rw-'));
  const fullEnv: NodeJS.ProcessEnv = { ...BASE_ENV, ...env, NYXA_STATE_DIR: stateDir };
  for (const [k, v] of Object.entries(fullEnv)) if (v === undefined) delete fullEnv[k];
  const config = loadConfig(fullEnv, stateDir);
  const mock = options.mock ?? new MockRunway(mockOpts);
  const clock = options.clock ?? new FakeClock();
  const ledger = new Ledger(stateDir);
  const audit = new MemoryAuditSink();
  const controller = new SessionController({
    client: () => mock,
    config,
    ledger,
    audit,
    gate: options.gate ?? new StaticPolicyGate(config.grantedCapabilities, config.escalationContexts),
    now: clock.now,
    sleep: clock.sleep,
  });
  return { config, mock, clock, ledger, audit, controller, stateDir, logs: [] };
}

export interface HttpHarness extends Harness {
  base: string;
  server: Server;
  cookie?: string;
  request(path: string, init?: RequestInit & { json?: unknown }): Promise<{ status: number; body: any; text: string; headers: Headers }>;
  login(token?: string): Promise<number>;
  close(): Promise<void>;
}

export async function startHttp(h: Harness): Promise<HttpHarness> {
  const auth = new AuthService(h.config, h.audit, h.clock.now);
  const app = createApp({ config: h.config, controller: h.controller, auth, audit: h.audit, log: (m) => h.logs.push(m) });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  h.config.allowedHosts.push(`127.0.0.1:${port}`);
  const hh = h as HttpHarness;
  hh.server = server;
  hh.base = `http://127.0.0.1:${port}`;
  hh.request = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (hh.cookie && !headers.has('cookie')) headers.set('cookie', hh.cookie);
    let body = init.body;
    if (init.json !== undefined) {
      body = JSON.stringify(init.json);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    const res = await fetch(hh.base + path, { ...init, headers, body });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) hh.cookie = setCookie.split(';')[0];
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    return { status: res.status, body: parsed, text, headers: res.headers };
  };
  hh.login = async (token = ACCESS_TOKEN) => (await hh.request('/api/auth/login', { method: 'POST', json: { token } })).status;
  hh.close = () => new Promise((resolve) => server.close(() => resolve()));
  return hh;
}

export function connect(hh: HttpHarness, requestId: string = crypto.randomUUID(), presetId = 'influencer') {
  return hh.request('/api/avatar/connect', {
    method: 'POST',
    headers: { 'Idempotency-Key': requestId },
    json: { presetId },
  });
}
