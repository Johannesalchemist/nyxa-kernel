'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth, approverPolicyFrom } = require('../src/auth.cjs');

const auth = createAuth({
  verifyHuman: t => (t === 'human-token' ? { id: 'human:test-owner' } : t === 'guest-token' ? { id: 'human:guest' } : null),
  verifyService: t => (t === 'svc-sophia' ? { id: 'sophia', kind: 'agent' } : null),
});

function call(mw, headers) {
  let status = 200, body = null, nextCalled = false; const req = { headers };
  mw(req, { status(s) { status = s; return this; }, json(b) { body = b; return this; } }, () => { nextCalled = true; });
  return { status, body, nextCalled, req };
}

test('No token ⇒ 401; invalid token ⇒ 401; valid human ⇒ principal', () => {
  const mw = auth.require();
  assert.equal(call(mw, {}).status, 401);
  assert.equal(call(mw, { authorization: 'Bearer nope' }).status, 401);
  const ok = call(mw, { authorization: 'Bearer human-token' });
  assert.equal(ok.nextCalled, true);
  assert.deepEqual(ok.req.principal, { id: 'human:test-owner', kind: 'human', roles: [] });
});

test('Service token acts as agent; on-behalf-of must be a verified human token, never a body name', () => {
  const mw = auth.require();
  const r1 = call(mw, { authorization: 'Bearer svc-sophia', 'x-nyxa-on-behalf-of': 'Johannes' });
  assert.equal(r1.req.principal.kind, 'agent');
  assert.equal(r1.req.principal.on_behalf_of, null);
  const r2 = call(mw, { authorization: 'Bearer svc-sophia', 'x-nyxa-on-behalf-of': 'human-token' });
  assert.equal(auth.humanOf(r2.req.principal).id, 'human:test-owner');
});

test('Endpoint restricted to humans rejects agents (no implicit inheritance)', () => {
  const mw = auth.require({ kinds: ['human'] });
  assert.equal(call(mw, { authorization: 'Bearer svc-sophia', 'x-nyxa-on-behalf-of': 'human-token' }).status, 403);
});

test('Approver policy comes from configuration only', () => {
  const p = approverPolicyFrom(['human:test-owner']);
  assert.equal(p({ id: 'human:test-owner', kind: 'human' }), true);
  assert.equal(p({ id: 'human:test-owner', kind: 'agent' }), false);
  assert.equal(p({ id: 'human:guest', kind: 'human' }), false);
  assert.equal(approverPolicyFrom([])({ id: 'x', kind: 'human' }), false);
});
