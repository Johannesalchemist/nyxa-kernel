'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, HUMAN, configureClaude } = require('./helpers.cjs');
const { createAuth } = require('../src/auth.cjs');
const { createApi } = require('../src/http-api.cjs');

const auth = createAuth({
  verifyHuman: t => (t === 'h' ? { id: HUMAN.id } : t === 'g' ? { id: 'human:guest' } : null),
  verifyService: t => (t === 'svc' ? { id: 'sophia', kind: 'agent' } : null),
});

/** Minimal express-compatible fake app that runs the middleware chain. */
function fakeApp() {
  const table = [];
  const app = {};
  for (const m of ['get', 'post', 'put']) app[m] = (path, ...hs) => table.push({ m, path, hs });
  app.request = (m, url, { headers = {}, body = {} } = {}) => {
    const [pathname, qs] = url.split('?');
    for (const r of table) {
      if (r.m !== m) continue;
      const keys = []; const rx = new RegExp('^' + r.path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
      const mt = rx.exec(pathname); if (!mt) continue;
      const req = { headers, body, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(mt[i + 1])])), query: Object.fromEntries(new URLSearchParams(qs || '')) };
      let out = null; const res = { status(s) { out = { status: s }; return this; }, json(b) { out.body = b; return this; } };
      let i = 0; const next = () => { const h = r.hs[i++]; if (h) h(req, res, next); };
      next(); return out;
    }
    return { status: 404 };
  };
  return app;
}

function boot() {
  const s = setup(); configureClaude(s.queue);
  const api = createApi({ bus: s.bus, queue: s.queue, auth, clock: s.clock });
  const app = fakeApp(); api.mount(app);
  return { ...s, app };
}

test('All v2 routes reject unauthenticated calls (no anonymous history read or clear)', () => {
  const { app } = boot();
  for (const [m, u] of [['get', '/api/v2/room/messages?conversation_id=c'], ['post', '/api/v2/room/messages'], ['post', '/api/v2/tasks'], ['get', '/api/v2/tasks'], ['get', '/api/v2/status/summary']]) {
    assert.equal(app.request(m, u).status, 401, m + ' ' + u);
  }
});

test('Sophia submits on behalf of a verified human; approval only by human; agent cannot approve via API', () => {
  const { app } = boot();
  const noHuman = app.request('post', '/api/v2/tasks', { headers: { authorization: 'Bearer svc' }, body: { executor: 'claude', task_type: 'analysis', scope: { allowed_operations: ['llm.invoke'] }, idempotency_key: 'x' } });
  assert.equal(noHuman.status, 403);
  const created = app.request('post', '/api/v2/tasks', { headers: { authorization: 'Bearer svc', 'x-nyxa-on-behalf-of': 'h' }, body: { executor: 'claude', task_type: 'analysis', instruction: 'Prüfe X', scope: { allowed_operations: ['llm.invoke'] }, idempotency_key: 'x', conversation_id: 'c' } });
  assert.equal(created.status, 201);
  const t = created.body.task;
  assert.equal(t.requested_by, HUMAN.id);
  assert.equal(app.request('post', `/api/v2/tasks/${t.task_id}/approve`, { headers: { authorization: 'Bearer svc', 'x-nyxa-on-behalf-of': 'h' }, body: { scope_hash: t.scope_hash } }).status, 403);
  assert.equal(app.request('post', `/api/v2/tasks/${t.task_id}/approve`, { headers: { authorization: 'Bearer g' }, body: { scope_hash: t.scope_hash } }).status, 403);
  const ok = app.request('post', `/api/v2/tasks/${t.task_id}/approve`, { headers: { authorization: 'Bearer h' }, body: { scope_hash: t.scope_hash } });
  assert.equal(ok.body.task.status, 'APPROVED');
  const sum = app.request('get', '/api/v2/status/summary', { headers: { authorization: 'Bearer h' } });
  assert.equal(sum.body.summary.pending_approval, 0);
});

test('Content fetch returns complete original; private mail messages are hidden from other principals', () => {
  const { app, bus } = boot();
  const m = app.request('post', '/api/v2/room/messages', { headers: { authorization: 'Bearer h' }, body: { conversation_id: 'c', text: 'A'.repeat(10000), message_id: 'big' } });
  const ref = m.body.message.content_ref;
  const c = app.request('get', '/api/v2/room/content/' + encodeURIComponent(ref), { headers: { authorization: 'Bearer svc' } });
  assert.equal(c.body.text.length, 10000);
  bus.post({ id: 'mail:box', kind: 'external' }, { conversation_id: 'c', channel: 'mail', text: 'privat', visibility: 'private', provenance: { requested_by: HUMAN.id } });
  const mine = app.request('get', '/api/v2/room/messages?conversation_id=c', { headers: { authorization: 'Bearer h' } });
  const guest = app.request('get', '/api/v2/room/messages?conversation_id=c', { headers: { authorization: 'Bearer g' } });
  assert.equal(mine.body.items.length, 2);
  assert.equal(guest.body.items.length, 1);
});

test('Executor config: next run visible; only humans may change it', () => {
  const { app } = boot();
  assert.equal(app.request('put', '/api/v2/executors/claude', { headers: { authorization: 'Bearer svc' }, body: { mode: 'PAUSED' } }).status, 403);
  const r = app.request('put', '/api/v2/executors/claude', { headers: { authorization: 'Bearer h' }, body: { mode: 'DAILY', daily_time: '07:30', allowed_task_types: ['analysis'], allowed_operations: ['llm.invoke'] } });
  assert.equal(r.status, 200);
  const g = app.request('get', '/api/v2/executors/claude', { headers: { authorization: 'Bearer h' } });
  assert.equal(g.body.next_run, '2026-11-08T06:30:00.000Z');
});
