/**
 * Adversarial verification pack RW-01 ... RW-12 (V0.2).
 *
 * Test type: INTEGRATION (real Express app over real HTTP on 127.0.0.1, real file ledger in a
 * temp dir) against a stateful MOCK of the Runway API. Proves local enforcement logic only;
 * says nothing about Runway's real behaviour. See docs/VERIFICATION_V0.2.md.
 */
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { estimateCredits } from '../src/cost.ts';
import type { PolicyGate } from '../src/policy.ts';
import { Ledger } from '../src/store.ts';
import {
  ACCESS_TOKEN,
  FAKE_API_SECRET,
  connect,
  makeHarness,
  startHttp,
  type HttpHarness,
} from './helpers.ts';

const open: HttpHarness[] = [];
async function http(...args: Parameters<typeof makeHarness>) {
  const hh = await startHttp(makeHarness(...args));
  open.push(hh);
  return hh;
}
after(async () => {
  await Promise.all(open.map((h) => h.close()));
});

describe('RW-01 unauthenticated connect', () => {
  test('connect without login is denied and Runway is never called', async () => {
    const h = await http();
    const res = await connect(h);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'unauthenticated');
    assert.equal(h.mock.creates.length, 0);
  });

  test('wrong access token is rejected; forged cookie is rejected', async () => {
    const h = await http();
    assert.equal(await h.login('x'.repeat(40)), 401);
    h.cookie = 'nyxa_rw_auth=forged-value';
    assert.equal((await connect(h)).status, 401);
    assert.equal(h.mock.creates.length, 0);
  });

  test('login brute force is rate limited', async () => {
    const h = await http({ LOGIN_LIMIT: '3' });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push(await h.login(`wrong-${i}`.padEnd(40, 'x')));
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
    assert.equal(await h.login(ACCESS_TOKEN), 429, 'even the right token waits out the window');
  });

  test('no NYXA_ACCESS_TOKEN configured -> fail closed (503), no session', async () => {
    const h = await http({ NYXA_ACCESS_TOKEN: undefined });
    assert.equal(await h.login(ACCESS_TOKEN), 503);
    const res = await connect(h);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'auth_not_configured');
    assert.equal(h.mock.creates.length, 0);
  });

  test('auth session expires after TTL', async () => {
    const h = await http({ AUTH_SESSION_TTL_S: '60' });
    assert.equal(await h.login(), 200);
    h.clock.advance(61_000);
    assert.equal((await connect(h)).status, 401);
  });

  test('foreign Host header (DNS rebinding) and foreign Origin are rejected before auth', async () => {
    const h = await http();
    await h.login();
    // fetch() cannot override Host, so use node:http directly.
    const rebindingStatus = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${h.base}/api/avatar/config`, { headers: { host: 'evil.example:3000' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(rebindingStatus, 421);
    const crossSite = await h.request('/api/avatar/connect', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'Idempotency-Key': crypto.randomUUID() },
      json: { presetId: 'influencer' },
    });
    assert.equal(crossSite.status, 403);
    const formPost = await h.request('/api/avatar/connect', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'Idempotency-Key': crypto.randomUUID() },
      body: '{"presetId":"influencer"}',
    });
    assert.equal(formPost.status, 415);
    assert.equal(h.mock.creates.length, 0);
  });

  test('cookie is HttpOnly + SameSite=Strict and scoped to /api', async () => {
    const h = await http();
    const res = await h.request('/api/auth/login', { method: 'POST', json: { token: ACCESS_TOKEN } });
    const c = res.headers.get('set-cookie') ?? '';
    assert.match(c, /HttpOnly/);
    assert.match(c, /SameSite=Strict/);
    assert.match(c, /Path=\/api/);
  });
});

describe('RW-02 invalid character id', () => {
  test('unknown preset, non-string, and non-allowlisted preset are denied without Runway call', async () => {
    const h = await http({ ALLOWED_PRESETS: 'influencer' });
    await h.login();
    for (const presetId of ['mina', '../../etc', 'cooking-teacher']) {
      const res = await connect(h, crypto.randomUUID(), presetId);
      assert.equal(res.status, 400, presetId);
      assert.equal(res.body.code, 'invalid_avatar');
    }
    const res = await h.request('/api/avatar/connect', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      json: { presetId: { $ne: null } },
    });
    assert.equal(res.status, 400);
    assert.equal(h.mock.creates.length, 0);
  });

  test('client cannot override a server-configured custom avatar', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const h = await http({ RUNWAY_AVATAR_ID: id });
    await h.login();
    assert.equal((await connect(h, crypto.randomUUID(), 'influencer')).status, 200);
    assert.deepEqual(h.mock.creates[0].avatar, { type: 'custom', avatarId: id });
  });
});

describe('RW-03 double start / replay', () => {
  test('same Idempotency-Key twice creates one session; second answer is 409', async () => {
    const h = await http();
    await h.login();
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([connect(h, key), connect(h, key)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(h.mock.creates.length, 1);
    assert.equal((await connect(h, key)).status, 409, 'late replay also rejected');
    assert.equal(h.mock.creates.length, 1);
  });

  test('missing or malformed Idempotency-Key is rejected', async () => {
    const h = await http();
    await h.login();
    const res = await h.request('/api/avatar/connect', { method: 'POST', json: { presetId: 'influencer' } });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'invalid_request_id');
    assert.equal((await connect(h, 'not-a-uuid')).status, 400);
    assert.equal(h.mock.creates.length, 0);
  });

  test('a burst of fresh keys is bounded by the creation rate limit', async () => {
    const h = await http({ SESSION_CREATE_LIMIT: '2', MAX_CONCURRENT_SESSIONS: '20' });
    await h.login();
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await connect(h)).status);
    assert.deepEqual(results, [200, 200, 429, 429, 429, 429]);
    assert.equal(h.mock.creates.length, 2);
  });
});

describe('RW-04 concurrency limit', () => {
  test('parallel starts beyond MAX_CONCURRENT_SESSIONS are denied', async () => {
    const h = await http({ MAX_CONCURRENT_SESSIONS: '2' });
    await h.login();
    const statuses = (await Promise.all([connect(h), connect(h), connect(h), connect(h)])).map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 200).length, 2);
    assert.equal(statuses.filter((s) => s === 429).length, 2);
    assert.equal(h.mock.creates.length, 2);
  });

  test('ending a session frees the slot', async () => {
    const h = await http({ MAX_CONCURRENT_SESSIONS: '1' });
    await h.login();
    const first = await connect(h);
    assert.equal((await connect(h)).status, 429);
    const end = await h.request(`/api/avatar/sessions/${first.body.sessionId}/end`, {
      method: 'POST',
      headers: { 'X-Session-Control': first.body.controlToken },
      json: {},
    });
    assert.equal(end.status, 200);
    assert.equal((await connect(h)).status, 200);
  });
});

describe('RW-05 budget', () => {
  test('default budget 0 denies every paid session', async () => {
    const h = await http({ RUNWAY_BUDGET_CREDITS: undefined });
    await h.login();
    const res = await connect(h);
    assert.equal(res.status, 402);
    assert.equal(res.body.code, 'budget_exhausted');
    assert.equal(h.mock.creates.length, 0);
  });

  test('budget for exactly one worst-case session allows one, then denies', async () => {
    const per = estimateCredits(60);
    const h = await http({ RUNWAY_BUDGET_CREDITS: String(per), MAX_CONCURRENT_SESSIONS: '5' });
    await h.login();
    assert.equal((await connect(h)).status, 200);
    const second = await connect(h);
    assert.equal(second.status, 402);
    assert.equal(h.mock.creates.length, 1);
  });

  test('budget survives a restart (ledger persisted)', async () => {
    const per = estimateCredits(60);
    const h1 = await http({ RUNWAY_BUDGET_CREDITS: String(per) });
    await h1.login();
    assert.equal((await connect(h1)).status, 200);
    const h2 = await http({ RUNWAY_BUDGET_CREDITS: String(per) }, {}, { stateDir: h1.stateDir });
    await h2.controller.recover();
    await h2.login();
    assert.equal((await connect(h2)).status, 402);
    assert.equal(h2.mock.creates.length, 0);
  });
});

describe('RW-06 Runway returns FAILED', () => {
  test('controlled 502 with stable code, session cancelled, record closed', async () => {
    const h = await http({}, { script: ['NOT_READY', 'FAILED'] });
    await h.login();
    const res = await connect(h);
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'provisioning_failed');
    assert.equal(res.body.failureCode, 'MOCK_FAILED');
    assert.equal(h.ledger.open().length, 0);
    assert.equal(h.mock.deletes.length, 1);
  });

  test('upstream 4xx on create releases the reservation; 5xx keeps it (unknown billing)', async () => {
    const h4 = await http({}, { createError: { status: 400 } });
    await h4.login();
    assert.equal((await connect(h4)).status, 502);
    assert.equal(h4.ledger.committedCredits(), 0);
    const h5 = await http({}, { createError: { status: 503 } });
    await h5.login();
    assert.equal((await connect(h5)).status, 502);
    assert.equal(h5.ledger.committedCredits(), estimateCredits(60));
  });
});

describe('RW-07 provisioning timeout', () => {
  test('timeout cancels the remote session and closes the record (cleanup evidence)', async () => {
    const h = await http({ PROVISION_TIMEOUT_S: '5' }, { script: ['NOT_READY'] });
    await h.login();
    const res = await connect(h);
    assert.equal(res.status, 504);
    assert.equal(res.body.code, 'provisioning_timeout');
    assert.deepEqual(h.mock.deletes, [h.mock.cancelled.values().next().value]);
    const rec = h.ledger.all()[0];
    assert.equal(rec.state, 'ended');
    assert.equal(rec.endReason, 'provisioning_timeout');
    assert.equal(rec.cancelAcknowledged, true);
  });

  test('client abort during provisioning cancels and never returns credentials', async () => {
    const h = await http({}, { script: ['NOT_READY'] });
    await h.login();
    const ac = new AbortController();
    // The fake clock never blocks, so slow the mock down to give the abort time to land.
    const original = h.mock.realtimeSessions.retrieve;
    h.mock.realtimeSessions.retrieve = async (id: string) => {
      await new Promise((r) => setTimeout(r, 20));
      return original(id);
    };
    const pending = fetch(`${h.base}/api/avatar/connect`, {
      method: 'POST',
      signal: ac.signal,
      headers: { cookie: h.cookie!, 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ presetId: 'influencer' }),
    }).catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 80));
    ac.abort();
    await pending;
    for (let i = 0; i < 50 && h.ledger.open().length; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(h.ledger.open().length, 0);
    assert.equal(h.mock.deletes.length, 1);
    assert.equal(h.ledger.all()[0].endReason, 'client_aborted');
  });
});

describe('RW-08 browser loses connection', () => {
  test('credentials never used -> reaper ends the session after CONNECT_GRACE', async () => {
    const h = await http({ CONNECT_GRACE_S: '30' });
    await h.login();
    const s = await connect(h);
    h.clock.advance(29_000);
    assert.deepEqual(await h.controller.reap(), []);
    h.clock.advance(2_000);
    assert.deepEqual(await h.controller.reap(), [s.body.sessionId]);
    assert.ok(h.mock.deletes.includes(s.body.sessionId));
    assert.equal(h.ledger.bySessionId(s.body.sessionId)?.endReason, 'connect_timeout');
  });

  test('heartbeats keep it alive; missing heartbeats end it', async () => {
    const h = await http({ HEARTBEAT_TIMEOUT_S: '45' });
    await h.login();
    const s = await connect(h);
    const hb = () =>
      h.request(`/api/avatar/sessions/${s.body.sessionId}/heartbeat`, {
        method: 'POST',
        headers: { 'X-Session-Control': s.body.controlToken },
        json: {},
      });
    assert.equal((await hb()).status, 200);
    h.clock.advance(40_000);
    assert.equal((await hb()).status, 200);
    h.clock.advance(40_000);
    assert.deepEqual(await h.controller.reap(), []);
    h.clock.advance(10_000);
    assert.deepEqual(await h.controller.reap(), [s.body.sessionId]);
    assert.equal((await hb()).status, 410, 'heartbeat after end is refused');
  });

  test('hard cap: a record older than maxDuration + slack is force-ended', async () => {
    const h = await http({ RUNWAY_MAX_DURATION_S: '60', HEARTBEAT_TIMEOUT_S: '600' });
    await h.login();
    const s = await connect(h);
    for (let i = 0; i < 4; i++) {
      h.clock.advance(30_000);
      await h.request(`/api/avatar/sessions/${s.body.sessionId}/heartbeat`, {
        method: 'POST',
        headers: { 'X-Session-Control': s.body.controlToken },
        json: {},
      });
    }
    await h.controller.reap();
    assert.equal(h.ledger.bySessionId(s.body.sessionId)?.endReason, 'max_duration_exceeded');
  });

  test('another tab without the control token cannot heartbeat or end the session', async () => {
    const h = await http();
    await h.login();
    const s = await connect(h);
    const wrong = await h.request(`/api/avatar/sessions/${s.body.sessionId}/end`, {
      method: 'POST',
      headers: { 'X-Session-Control': 'A'.repeat(43) },
      json: {},
    });
    assert.equal(wrong.status, 404);
    assert.equal(h.mock.deletes.length, 0);
  });
});

describe('RW-09 repeated session end', () => {
  test('end is idempotent, including concurrent calls; one cancel only', async () => {
    const h = await http();
    await h.login();
    const s = await connect(h);
    const end = () =>
      h.request(`/api/avatar/sessions/${s.body.sessionId}/end`, {
        method: 'POST',
        headers: { 'X-Session-Control': s.body.controlToken },
        json: {},
      });
    const [a, b] = await Promise.all([end(), end()]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    for (const r of [a, b]) assert.ok(['ended', 'already_ended'].includes(r.body.status));
    const c = await end();
    assert.equal(c.status, 200);
    assert.equal(c.body.status, 'already_ended');
    assert.equal(h.mock.deletes.length, 1);
  });

  test('cancel that Runway does not confirm stays "ending", counts against limits, reaper retries', async () => {
    const h = await http({ MAX_CONCURRENT_SESSIONS: '1' }, { retrieveError: false });
    await h.login();
    const s = await connect(h);
    h.mock.opts.deleteFails = true;
    h.mock.opts.retrieveError = true;
    const end = await h.request(`/api/avatar/sessions/${s.body.sessionId}/end`, {
      method: 'POST',
      headers: { 'X-Session-Control': s.body.controlToken },
      json: {},
    });
    assert.equal(end.status, 202);
    assert.equal(end.body.status, 'ending');
    assert.equal((await connect(h)).status, 429, 'unconfirmed session still blocks the slot');
    h.mock.opts.deleteFails = false;
    h.mock.opts.retrieveError = false;
    await h.controller.reap();
    assert.equal(h.ledger.bySessionId(s.body.sessionId)?.state, 'ended');
    assert.equal((await connect(h)).status, 200);
  });
});

describe('RW-10 no secret leak', () => {
  test('API key never appears in responses, logs, audit, ledger or the browser bundle', async () => {
    const h = await http({}, { script: ['NOT_READY', 'FAILED'] });
    await h.login();
    const bodies: string[] = [];
    bodies.push((await h.request('/api/avatar/config')).text);
    bodies.push((await connect(h)).text);
    h.mock.opts.script = ['READY'];
    const ok = await connect(h);
    bodies.push(ok.text);
    bodies.push((await h.request('/api/avatar/status')).text);
    h.mock.opts.createError = { status: 500 };
    bodies.push((await connect(h)).text);

    const haystacks = [
      ...bodies,
      ...h.logs,
      JSON.stringify(h.audit.events),
      ...readdirSync(h.stateDir).map((f) => readFileSync(join(h.stateDir, f), 'utf8')),
    ];
    for (const text of haystacks) {
      assert.ok(!text.includes(FAKE_API_SECRET), 'API secret leaked');
      assert.ok(!text.includes(ACCESS_TOKEN), 'access token leaked');
    }
    // sessionKey/controlToken go to the browser exactly once, never into audit or ledger.
    const persisted = [JSON.stringify(h.audit.events), readFileSync(join(h.stateDir, 'ledger.json'), 'utf8')].join();
    assert.ok(!persisted.includes(ok.body.sessionKey));
    assert.ok(!persisted.includes(ok.body.controlToken));
    assert.equal(h.logs.some((l) => /Bearer|key_/.test(l)), false);
  });

  test('built browser bundle (dist/) contains no secret-shaped values', { skip: !existsSync('dist') }, () => {
    const files = readdirSync('dist', { recursive: true }) as string[];
    for (const f of files) {
      const p = join('dist', f);
      if (!/\.(js|html|css)$/.test(p)) continue;
      const text = readFileSync(p, 'utf8');
      // Variable NAMES in help texts are fine; secret-shaped VALUES are not.
      assert.ok(
        !/key_[A-Za-z0-9]{32,}|(RUNWAYML_API_SECRET|NYXA_ACCESS_TOKEN)\s*[=:]\s*["']?[A-Za-z0-9_-]{16,}/.test(text),
        `secret pattern in ${p}`,
      );
    }
  });
});

describe('RW-11 policy requires escalation', () => {
  test('ESCALATE from the gate blocks before any Runway call or budget reservation', async () => {
    let asked = 0;
    const gate: PolicyGate = {
      evaluate: () => {
        asked++;
        return { disposition: 'ESCALATE', reasons: ['incompatible_goal_state:avatar.session'] };
      },
    };
    const h = await http({}, {}, { gate });
    await h.login();
    const res = await connect(h);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'escalation_required');
    assert.equal(asked, 1);
    assert.equal(h.mock.creates.length, 0);
    assert.equal(h.ledger.all().length, 0);
    assert.ok(h.audit.events.some((e) => e.outcome === 'ESCALATE'));
  });

  test('default gate: pilot context "Schule in der Hosentasche" escalates; missing capability denies', async () => {
    const pilot = await http({ NYXA_OPERATING_CONTEXT: 'pilot:schule-in-der-hosentasche' });
    await pilot.login();
    assert.equal((await connect(pilot)).body.code, 'escalation_required');
    const noCap = await http({ NYXA_GRANTED_CAPABILITIES: '' });
    await noCap.login();
    assert.equal((await connect(noCap)).body.code, 'capability_denied');
    assert.equal(pilot.mock.creates.length + noCap.mock.creates.length, 0);
  });

  test('SERIALIZE / NEGOTIATE also block (only ALLOW acts)', async () => {
    for (const disposition of ['SERIALIZE', 'NEGOTIATE'] as const) {
      const h = await http({}, {}, { gate: { evaluate: () => ({ disposition, reasons: [] }) } });
      await h.login();
      const res = await connect(h);
      assert.equal(res.status, 409);
      assert.equal(h.mock.creates.length, 0);
    }
  });
});

describe('RW-12 server restart with active session', () => {
  test('recovery cancels sessions left open by the previous process', async () => {
    const h1 = await http();
    await h1.login();
    const s = await connect(h1);
    assert.equal(h1.ledger.open().length, 1);
    // Simulated crash: process state is lost, ledger file and remote session remain.
    const mock = h1.mock;
    const h2 = await http({}, {}, { stateDir: h1.stateDir, mock });
    const result = await h2.controller.recover();
    assert.deepEqual(result.cancelled, [s.body.sessionId]);
    assert.equal(new Ledger(h1.stateDir).bySessionId(s.body.sessionId)?.state, 'ended');
    assert.equal(new Ledger(h1.stateDir).bySessionId(s.body.sessionId)?.endReason, 'server_restart');
  });

  test('unmanaged in-progress sessions on the account are reported, never cancelled', async () => {
    const foreign = '11111111-1111-4111-8111-111111111111';
    const h = await http({}, { unmanagedInProgress: [foreign] });
    const result = await h.controller.recover();
    assert.deepEqual(result.unmanaged, [foreign]);
    assert.ok(!h.mock.deletes.includes(foreign));
  });

  test('a second server process on the same state dir is refused (lock); stale lock is taken over', () => {
    const h = makeHarness();
    const lock = join(h.stateDir, 'server.lock');
    writeFileSync(lock, String(process.ppid)); // a different, live process
    assert.throws(() => h.ledger.acquireLock(process.pid), /locked by running process/);
    writeFileSync(lock, '2147483646'); // dead pid
    h.ledger.acquireLock(process.pid);
    assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
    h.ledger.releaseLock();
  });
});

describe('cost reconciliation', () => {
  test('ended session settles to the estimate of its real duration, never above the reservation', async () => {
    const h = await http({}, { duration: 13 });
    await h.login();
    const s = await connect(h);
    await h.request(`/api/avatar/sessions/${s.body.sessionId}/end`, {
      method: 'POST',
      headers: { 'X-Session-Control': s.body.controlToken },
      json: {},
    });
    const rec = h.ledger.bySessionId(s.body.sessionId)!;
    assert.equal(rec.settledCredits, estimateCredits(13));
    assert.ok(rec.settledCredits! <= rec.reservedCredits);
  });
});

