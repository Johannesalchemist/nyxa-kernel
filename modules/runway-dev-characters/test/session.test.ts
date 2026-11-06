/**
 * Unit tests for avatar resolution, provisioning and cost estimate (MOCK level:
 * proves local logic only).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCredits } from '../src/cost.ts';
import { provisionSession, resolveAvatar, SessionError } from '../src/session.ts';
import { FakeClock, MockRunway } from './helpers.ts';

const preset = { type: 'runway-preset', presetId: 'influencer' } as const;

test('resolveAvatar accepts documented, allowlisted presets only', () => {
  assert.deepEqual(resolveAvatar('cooking-teacher', undefined), { type: 'runway-preset', presetId: 'cooking-teacher' });
  assert.throws(() => resolveAvatar('mina', undefined), SessionError);
  assert.throws(() => resolveAvatar(undefined, ''), SessionError);
  assert.throws(() => resolveAvatar('cooking-teacher', undefined, ['influencer']), SessionError);
});

test('resolveAvatar prefers a configured custom avatar uuid', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.deepEqual(resolveAvatar('influencer', id), { type: 'custom', avatarId: id });
  assert.throws(() => resolveAvatar('influencer', 'not-a-uuid'), SessionError);
});

test('provisionSession polls until READY and returns only id, key and expiry', async () => {
  const mock = new MockRunway({ script: ['NOT_READY', 'NOT_READY', 'READY'] });
  const clock = new FakeClock();
  const creds = await provisionSession(mock, preset, { maxDuration: 120, sleep: clock.sleep, now: clock.now });
  assert.deepEqual(Object.keys(creds).sort(), ['expiresAt', 'sessionId', 'sessionKey']);
  assert.equal(mock.retrieves, 3);
  assert.deepEqual(mock.creates[0], { model: 'gwm1_avatars', avatar: preset, maxDuration: 120 });
  assert.equal(mock.deletes.length, 0);
});

test('provisionSession: FAILED -> 502 with failureCode and cancel', async () => {
  const mock = new MockRunway({ script: ['FAILED'] });
  const clock = new FakeClock();
  await assert.rejects(
    provisionSession(mock, preset, { maxDuration: 60, sleep: clock.sleep, now: clock.now }),
    (e: SessionError) => e.httpStatus === 502 && e.failureCode === 'MOCK_FAILED' && e.code === 'provisioning_failed',
  );
  assert.equal(mock.deletes.length, 1);
});

test('provisionSession: timeout -> 504 and cancel', async () => {
  const mock = new MockRunway({ script: ['NOT_READY'] });
  const clock = new FakeClock();
  await assert.rejects(
    provisionSession(mock, preset, { maxDuration: 60, timeoutMs: 3000, sleep: clock.sleep, now: clock.now }),
    (e: SessionError) => e.httpStatus === 504,
  );
  assert.equal(mock.deletes.length, 1);
});

test('provisionSession: polling error -> 502 upstream_error and cancel', async () => {
  const mock = new MockRunway({ retrieveError: true });
  const clock = new FakeClock();
  await assert.rejects(
    provisionSession(mock, preset, { maxDuration: 60, sleep: clock.sleep, now: clock.now }),
    (e: SessionError) => e.code === 'upstream_error',
  );
  assert.equal(mock.deletes.length, 1);
});

test('provisionSession: READY without sessionKey is an error and is cancelled', async () => {
  const mock = new MockRunway();
  mock.realtimeSessions.retrieve = async () => ({ status: 'READY' });
  const clock = new FakeClock();
  await assert.rejects(
    provisionSession(mock, preset, { maxDuration: 60, sleep: clock.sleep, now: clock.now }),
    (e: SessionError) => e.code === 'missing_session_key',
  );
  assert.equal(mock.deletes.length, 1);
});

test('provisionSession: aborted signal before create -> no remote call', async () => {
  const mock = new MockRunway();
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(provisionSession(mock, preset, { maxDuration: 60, signal: ac.signal }), (e: SessionError) => e.code === 'client_aborted');
  assert.equal(mock.creates.length, 0);
});

test('estimateCredits follows "2 upfront + 2 per started 6 s"', () => {
  assert.equal(estimateCredits(0), 2);
  assert.equal(estimateCredits(1), 4);
  assert.equal(estimateCredits(6), 4);
  assert.equal(estimateCredits(7), 6);
  assert.equal(estimateCredits(120), 42);
  assert.equal(estimateCredits(300), 102);
});

test('audit redaction drops credential fields and masks secret-shaped values', async () => {
  const { MemoryAuditSink } = await import('../src/audit.ts');
  const sink = new MemoryAuditSink();
  sink.record({
    action: 'x',
    outcome: 'INFO',
    reason: 'leak attempt Bearer abc.def key_ABCDEFGHIJKLMNOPQRSTUV0123',
    sessionKey: 'sk-should-vanish',
    controlToken: 'ct-should-vanish',
    ip: '203.0.113.7',
    transcript: 'private words',
  });
  const text = JSON.stringify(sink.events);
  for (const s of ['sk-should-vanish', 'ct-should-vanish', '203.0.113.7', 'private words', 'abc.def', 'key_ABCDEF']) {
    assert.ok(!text.includes(s), s);
  }
  assert.match(text, /\[REDACTED\]/);
});
