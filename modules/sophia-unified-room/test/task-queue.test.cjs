'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, HUMAN, OTHER_HUMAN, SOPHIA, tmpDbFile, configureClaude, fakeAdapter, submitAnalysis, fakeClock } = require('./helpers.cjs');
const { open } = require('../src/db.cjs');
const { createQueue, GovernanceError } = require('../src/task-queue.cjs');
const { createBus } = require('../src/conversation-bus.cjs');
const { approverPolicyFrom } = require('../src/auth.cjs');
const { runWorkerOnce, requestCrossCheck, parseVerdict } = require('../src/executors.cjs');

test('Claude DIRECT: exactly one authorized task is executed and reported back', async () => {
  const { bus, queue } = setup();
  configureClaude(queue);
  const t = submitAnalysis(queue, bus, { key: 'once' });
  assert.equal(t.status, 'PENDING_APPROVAL');
  queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const adapter = fakeAdapter();
  const r1 = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  const r2 = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  assert.equal(r1.outcome, 'RESULT_RECORDED');
  assert.equal(r2.outcome, 'NO_WORK');
  assert.equal(adapter.calls.length, 1);
  const room = bus.since('conv-1');
  assert.equal(room.length, 1);
  assert.equal(room[0].channel, 'agent');
  assert.equal(room[0].provenance.task_id, t.task_id);
  const done = queue.verify({ id: 'ari', kind: 'agent' }, t.task_id, { verdict: 'pass' });
  assert.equal(done.status, 'COMPLETED');
});

test('Idempotent submission: same idempotency_key yields the same task', () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const a = submitAnalysis(queue, bus, { key: 'same' });
  const b = submitAnalysis(queue, bus, { key: 'same' });
  assert.equal(a.task_id, b.task_id);
  assert.equal(b.duplicate, true);
  assert.equal(queue.list().length, 1);
});

test('Unknown executor / not granted operation ⇒ DENIED at submission (default deny)', () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t1 = queue.submit(SOPHIA, { requested_by: HUMAN, executor: 'unknown-bot', task_type: 'analysis', scope: { allowed_operations: ['llm.invoke'] }, idempotency_key: 'u1' });
  assert.equal(t1.status, 'DENIED');
  const t2 = queue.submit(SOPHIA, { requested_by: HUMAN, executor: 'claude', task_type: 'analysis', scope: { allowed_operations: ['shell.exec'] }, idempotency_key: 'u2' });
  assert.equal(t2.status, 'DENIED');
  assert.equal(t2.error, 'OPERATION_NOT_ALLOWED');
  assert.throws(() => queue.submit(SOPHIA, { requested_by: SOPHIA, executor: 'claude', task_type: 'analysis', scope: { allowed_operations: ['llm.invoke'] }, idempotency_key: 'u3' }), e => e.code === 'REQUESTER_REQUIRED');
});

test('Approval verweigert: real execution technically prevented', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus);
  queue.deny(HUMAN, t.task_id, { reason: 'nicht jetzt' });
  const adapter = fakeAdapter();
  const r = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  assert.equal(r.outcome, 'NO_WORK');
  assert.equal(adapter.calls.length, 0);
  assert.equal(queue.get(t.task_id).status, 'DENIED');
});

test('Agents and non-listed humans cannot approve; scope_hash must match', () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus);
  assert.throws(() => queue.approve(SOPHIA, t.task_id, { scope_hash: t.scope_hash }), e => e.code === 'NOT_AUTHORIZED');
  assert.throws(() => queue.approve({ id: 'sophia', kind: 'human' }, t.task_id, { scope_hash: t.scope_hash }), e => e.code === 'NOT_AUTHORIZED');
  assert.throws(() => queue.approve(OTHER_HUMAN, t.task_id, { scope_hash: t.scope_hash }), e => e.code === 'NOT_AUTHORIZED');
  assert.throws(() => queue.approve(HUMAN, t.task_id, { scope_hash: 'wrong' }), e => e.code === 'SCOPE_MISMATCH');
  // Refused attempts remain in the audit trail.
  const trail = queue.auditTrail(t.correlation_id).filter(a => a.action === 'task.decide' && a.decision === 'DENY');
  assert.equal(trail.length, 3);
});

test('Approval widerrufen during execution: no new effect, result not promoted', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus);
  queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const adapter = fakeAdapter('claude', { onCall: async () => { queue.revoke(HUMAN, t.task_id, 'Stopp'); } });
  const r = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  assert.equal(r.outcome, 'DISCARDED_AFTER_CANCELLED');
  const after = queue.get(t.task_id);
  assert.equal(after.status, 'CANCELLED');
  assert.equal(after.result_ref, null);
  // Any further effect attempt with the old lease is denied.
  const g = queue.authorizeEffect(t.task_id, 'stale', { operation: 'llm.invoke', effect_key: 'x' });
  assert.equal(g.allowed, false);
});

test('Approval revoked before claim ⇒ worker cannot claim', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus);
  queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  queue.revoke(HUMAN, t.task_id, 'doch nicht');
  const adapter = fakeAdapter();
  const r = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  assert.equal(r.outcome, 'NO_WORK');
  assert.equal(adapter.calls.length, 0);
});

test('Zwei Worker (separate DB connections, same file): no double claim', () => {
  const file = tmpDbFile();
  const clock = fakeClock();
  const policy = approverPolicyFrom([HUMAN.id]);
  const db1 = open(file), db2 = open(file);
  const q1 = createQueue(db1, { clock, approverPolicy: policy });
  const q2 = createQueue(db2, { clock, approverPolicy: policy });
  const bus = createBus(db1, { clock });
  configureClaude(q1, { max_parallel: 10 });
  const ids = [];
  for (let i = 0; i < 5; i++) { const t = submitAnalysis(q1, bus, { key: 'p' + i }); q1.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash }); ids.push(t.task_id); }
  const claimed = [];
  for (let i = 0; i < 10; i++) {
    const q = i % 2 ? q2 : q1;
    const c = q.claim({ executor: 'claude', worker_id: 'w' + (i % 2), trigger: 'direct' });
    if (c.task) claimed.push(c.task.task_id);
  }
  assert.equal(claimed.length, 5);
  assert.equal(new Set(claimed).size, 5, 'each task claimed exactly once');
});

test('Lease expiry: CLAIMED task returns to APPROVED; RUNNING with unknown effect escalates instead of replaying', () => {
  const { bus, queue, clock } = setup(); configureClaude(queue);
  const a = submitAnalysis(queue, bus, { key: 'a' }); queue.approve(HUMAN, a.task_id, { scope_hash: a.scope_hash });
  const c = queue.claim({ executor: 'claude', worker_id: 'w1', trigger: 'direct', lease_ms: 1000 });
  clock.advance(2000); queue.expireLeases();
  assert.equal(queue.get(a.task_id).status, 'APPROVED');

  const c2 = queue.claim({ executor: 'claude', worker_id: 'w2', trigger: 'direct', lease_ms: 1000 });
  queue.start(a.task_id, c2.lease_token);
  const g = queue.authorizeEffect(a.task_id, c2.lease_token, { operation: 'llm.invoke', effect_key: 'eff-1', cost_cents: 1 });
  assert.equal(g.allowed, true);
  // worker crashes / network cut: no recordEffect
  clock.advance(2000); queue.expireLeases();
  assert.equal(queue.get(a.task_id).status, 'ESCALATED');
  assert.ok(c.lease_token !== c2.lease_token);
});

test('Replay protection: confirmed effect is never executed twice', () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus); queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const c = queue.claim({ executor: 'claude', worker_id: 'w1', trigger: 'direct' });
  queue.start(t.task_id, c.lease_token);
  assert.equal(queue.authorizeEffect(t.task_id, c.lease_token, { operation: 'llm.invoke', effect_key: 'e' }).allowed, true);
  queue.recordEffect('e', 'CONFIRMED', { id: 1 });
  const again = queue.authorizeEffect(t.task_id, c.lease_token, { operation: 'llm.invoke', effect_key: 'e' });
  assert.equal(again.allowed, false);
  assert.equal(again.replay, true);
});

test('Bypass: effect gate denies out-of-scope operation and wrong lease', () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus); queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const c = queue.claim({ executor: 'claude', worker_id: 'w1', trigger: 'direct' });
  queue.start(t.task_id, c.lease_token);
  assert.equal(queue.authorizeEffect(t.task_id, c.lease_token, { operation: 'mail.send_approved', effect_key: 'm' }).reason, 'OPERATION_OUT_OF_SCOPE');
  assert.equal(queue.authorizeEffect(t.task_id, 'forged', { operation: 'llm.invoke', effect_key: 'm' }).reason, 'LEASE_INVALID');
  assert.throws(() => queue.recordResult(t.task_id, 'forged', { result_ref: 'x', provenance: { executor: 'claude', model: 'm' } }), e => e.code === 'LEASE_INVALID');
});

test('Kostenlimit: execution is stopped before the budget is exceeded', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus, { budget: 3 }); // adapter estimates 5
  queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const adapter = fakeAdapter();
  const r = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  assert.equal(r.outcome, 'DENIED');
  assert.equal(r.reason, 'TASK_BUDGET_EXCEEDED');
  assert.equal(adapter.calls.length, 0);
  assert.equal(queue.get(t.task_id).status, 'FAILED');
});

test('Daily executor budget is enforced across tasks', async () => {
  const { bus, queue } = setup(); configureClaude(queue, { daily_budget_cents: 8 });
  for (const k of ['d1', 'd2']) { const t = submitAnalysis(queue, bus, { key: k }); queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash }); }
  const adapter = fakeAdapter();
  const r1 = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  const r2 = await runWorkerOnce({ queue, bus, adapter, worker_id: 'w1', trigger: 'direct' });
  assert.equal(r1.outcome, 'RESULT_RECORDED');
  assert.equal(r2.reason, 'DAILY_BUDGET_EXCEEDED');
  assert.equal(adapter.calls.length, 1);
});

test('Modes: HOURLY worker ignores direct trigger; PAUSED takes nothing; MANUAL requires a human + task id', () => {
  const { bus, queue } = setup(); configureClaude(queue, { mode: 'HOURLY' });
  const t = submitAnalysis(queue, bus); queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  assert.match(queue.claim({ executor: 'claude', worker_id: 'w', trigger: 'direct' }).reason, /MODE_FORBIDS_TRIGGER/);
  configureClaude(queue, { mode: 'PAUSED' });
  assert.match(queue.claim({ executor: 'claude', worker_id: 'w', trigger: 'schedule' }).reason, /MODE_FORBIDS_TRIGGER/);
  configureClaude(queue, { mode: 'MANUAL' });
  assert.match(queue.claim({ executor: 'claude', worker_id: 'w', trigger: 'manual', task_id: t.task_id, principal: SOPHIA }).reason, /MANUAL_REQUIRES/);
  assert.ok(queue.claim({ executor: 'claude', worker_id: 'w', trigger: 'manual', task_id: t.task_id, principal: HUMAN }).task);
});

test('Claude HOURLY: schedule tick only takes approved tasks, never pending ones', () => {
  const { bus, queue } = setup(); configureClaude(queue, { mode: 'HOURLY', max_parallel: 5 });
  const approved = submitAnalysis(queue, bus, { key: 'h1' }); queue.approve(HUMAN, approved.task_id, { scope_hash: approved.scope_hash });
  const pending = submitAnalysis(queue, bus, { key: 'h2' });
  const c1 = queue.claim({ executor: 'claude', worker_id: 'cron', trigger: 'schedule' });
  const c2 = queue.claim({ executor: 'claude', worker_id: 'cron', trigger: 'schedule' });
  assert.equal(c1.task.task_id, approved.task_id);
  assert.equal(c2.task, null);
  assert.equal(queue.get(pending.task_id).status, 'PENDING_APPROVAL');
});

test('Not-yet-due tasks (not_before) are not taken', () => {
  const { bus, queue, clock } = setup(); configureClaude(queue, { mode: 'HOURLY' });
  const t = submitAnalysis(queue, bus, { input: { not_before: '2026-11-07T12:00:00.000Z' } });
  queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  assert.equal(queue.claim({ executor: 'claude', worker_id: 'cron', trigger: 'schedule' }).task, null);
  clock.set('2026-11-07T12:00:00.000Z');
  assert.ok(queue.claim({ executor: 'claude', worker_id: 'cron', trigger: 'schedule' }).task);
});

test('Mandate: read-only analysis can be pre-approved; mandates cannot cover consequential operations; revocation stops it', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  assert.throws(() => queue.grantMandate(HUMAN, { executor: 'claude', task_types: ['analysis'], operations: ['mail.send_approved'], max_cost_cents: 10, valid_until: '2027-01-01T00:00:00Z' }), e => e.code === 'MANDATE_SCOPE_FORBIDDEN');
  assert.throws(() => queue.grantMandate(SOPHIA, { executor: 'claude', task_types: ['analysis'], operations: ['llm.invoke'], max_cost_cents: 10, valid_until: '2027-01-01T00:00:00Z' }), e => e.code === 'NOT_AUTHORIZED');
  const mid = queue.grantMandate(HUMAN, { executor: 'claude', task_types: ['analysis'], operations: ['llm.invoke', 'room.post_result'], max_cost_cents: 200, valid_until: '2027-01-01T00:00:00Z' });
  const t = submitAnalysis(queue, bus, { key: 'm1' });
  assert.equal(t.status, 'APPROVED');
  queue.revokeMandate(HUMAN, mid);
  const r = await runWorkerOnce({ queue, bus, adapter: fakeAdapter(), worker_id: 'w', trigger: 'direct' });
  assert.equal(r.outcome, 'NO_WORK');
  assert.equal(queue.get(t.task_id).status, 'CANCELLED');
});

test('Neustart: persistent tasks stay consistent after reopening the database', () => {
  const file = tmpDbFile(); const clock = fakeClock(); const policy = approverPolicyFrom([HUMAN.id]);
  let db = open(file); let q = createQueue(db, { clock, approverPolicy: policy }); const bus = createBus(db, { clock });
  configureClaude(q);
  const t = submitAnalysis(q, bus, { key: 'r1' }); q.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const c = q.claim({ executor: 'claude', worker_id: 'w', trigger: 'direct', lease_ms: 1000 });
  db.close();
  db = open(file); q = createQueue(db, { clock, approverPolicy: policy });
  assert.equal(q.get(t.task_id).status, 'CLAIMED');
  assert.equal(q.get(t.task_id).lease_token, c.lease_token);
  clock.advance(5000); q.expireLeases();
  assert.equal(q.get(t.task_id).status, 'APPROVED');
});

test('Retry with backoff for retryable errors, dead letter after max attempts', async () => {
  const { bus, queue, clock } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus, { input: { max_attempts: 2 } }); queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const err = Object.assign(new Error('overloaded'), { retryable: true });
  const adapter = fakeAdapter('claude', { fail: err });
  await runWorkerOnce({ queue, bus, adapter, worker_id: 'w', trigger: 'direct' });
  assert.equal(queue.get(t.task_id).status, 'APPROVED');
  clock.advance(10 * 60_000);
  await runWorkerOnce({ queue, bus, adapter, worker_id: 'w', trigger: 'direct' });
  const f = queue.get(t.task_id);
  assert.equal(f.status, 'FAILED');
  assert.equal(f.dead_letter, true);
});

test('GPT delegation + cross-check: result carries executor and source provenance; verdict only feeds verify()', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  queue.configureExecutor(HUMAN, { executor: 'ari', mode: 'DIRECT', allowed_task_types: ['analysis', 'review'], allowed_operations: ['llm.invoke', 'room.post_result'], daily_budget_cents: 500 });
  const src = bus.putContent('Quelltext für die Analyse');
  const t = queue.submit(SOPHIA, { requested_by: HUMAN, executor: 'ari', task_type: 'analysis', scope: { allowed_operations: ['llm.invoke', 'room.post_result'] }, context_refs: [src], instruction_ref: bus.putContent('Analysiere.'), idempotency_key: 'g1', conversation_id: 'conv-1', cost_budget_cents: 50 });
  queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  const r = await runWorkerOnce({ queue, bus, adapter: fakeAdapter('ari', { text: 'GPT-Analyse' }), worker_id: 'w-ari', trigger: 'direct' });
  assert.equal(r.provenance.executor, 'ari');
  assert.ok(r.provenance.input_refs.includes(src));
  assert.equal(r.provenance.epistemic_status, 'UNVERIFIED');
  const original = queue.get(t.task_id);
  const review = requestCrossCheck(queue, bus, { original, reviewer_executor: 'claude', creator: SOPHIA, requested_by: HUMAN, cost_budget_cents: 50 });
  assert.equal(review.status, 'PENDING_APPROVAL', 'cross-check needs its own approval');
  queue.approve(HUMAN, review.task_id, { scope_hash: review.scope_hash });
  const rr = await runWorkerOnce({ queue, bus, adapter: fakeAdapter('claude', { text: 'Befund ok.\nVERDICT: pass' }), worker_id: 'w-claude', trigger: 'direct' });
  const verdict = parseVerdict(bus.getContent(rr.result_ref).text);
  assert.equal(verdict, 'pass');
  assert.throws(() => queue.verify({ id: 'ari', kind: 'agent' }, t.task_id, { verdict }), e => e.code === 'VERIFIER_NOT_INDEPENDENT');
  assert.equal(queue.verify({ id: 'claude', kind: 'agent' }, t.task_id, { verdict, evidence_ref: rr.result_ref }).status, 'COMPLETED');
  assert.equal(parseVerdict('VERDICT: maybe'), 'fail');
});

test('Audit: decision and effect records are correlatable by correlation_id', async () => {
  const { bus, queue } = setup(); configureClaude(queue);
  const t = submitAnalysis(queue, bus); queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
  await runWorkerOnce({ queue, bus, adapter: fakeAdapter(), worker_id: 'w', trigger: 'direct' });
  const trail = queue.auditTrail(t.correlation_id).map(a => a.action + ':' + (a.to_status || a.decision || ''));
  for (const expected of ['task.submit:', 'task.transition:PENDING_APPROVAL', 'task.transition:APPROVED', 'task.transition:CLAIMED', 'task.transition:RUNNING', 'effect.authorize:ALLOW', 'task.transition:RESULT_RECORDED']) {
    assert.ok(trail.includes(expected), 'missing ' + expected + ' in ' + trail.join(','));
  }
});

test('Only authorized humans can change executor configuration', () => {
  const { queue } = setup();
  assert.throws(() => queue.configureExecutor(SOPHIA, { executor: 'claude', mode: 'DIRECT' }), e => e instanceof GovernanceError);
  assert.throws(() => queue.configureExecutor(HUMAN, { executor: 'claude', mode: 'DIRECT', timezone: 'Mars/Olympus' }));
});
