import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  resolveAvatar,
  SessionError,
  type RealtimeSessionsClient,
} from '../src/session.ts';

function mockClient(statuses: Array<{ status: string; sessionKey?: string; failure?: string; failureCode?: string }>) {
  const calls = { create: [] as unknown[], retrieve: 0, deleted: [] as string[] };
  const client: RealtimeSessionsClient = {
    realtimeSessions: {
      async create(body) {
        calls.create.push(body);
        return { id: 'sess-1' };
      },
      async retrieve() {
        const s = statuses[Math.min(calls.retrieve, statuses.length - 1)];
        calls.retrieve++;
        return s;
      },
      async delete(id) {
        calls.deleted.push(id);
      },
    },
  };
  return { client, calls };
}

const noSleep = async () => {};

test('resolveAvatar accepts documented presets only', () => {
  assert.deepEqual(resolveAvatar('cooking-teacher', undefined), {
    type: 'runway-preset',
    presetId: 'cooking-teacher',
  });
  assert.throws(() => resolveAvatar('mina', undefined), SessionError);
  assert.throws(() => resolveAvatar(undefined, ''), SessionError);
});

test('resolveAvatar prefers a configured custom avatar uuid', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.deepEqual(resolveAvatar('influencer', id), { type: 'custom', avatarId: id });
  assert.throws(() => resolveAvatar('influencer', 'not-a-uuid'), SessionError);
});

test('createSession polls until READY and returns only sessionId/sessionKey', async () => {
  const { client, calls } = mockClient([
    { status: 'NOT_READY' },
    { status: 'NOT_READY' },
    { status: 'READY', sessionKey: 'sk' },
  ]);
  const creds = await createSession(client, { type: 'runway-preset', presetId: 'influencer' }, { sleep: noSleep });
  assert.deepEqual(creds, { sessionId: 'sess-1', sessionKey: 'sk' });
  assert.equal(calls.retrieve, 3);
  assert.deepEqual(calls.create[0], {
    model: 'gwm1_avatars',
    avatar: { type: 'runway-preset', presetId: 'influencer' },
    maxDuration: 300,
  });
});

test('createSession surfaces FAILED with failureCode', async () => {
  const { client } = mockClient([{ status: 'FAILED', failure: 'no credits', failureCode: 'X' }]);
  await assert.rejects(
    createSession(client, { type: 'runway-preset', presetId: 'influencer' }, { sleep: noSleep }),
    (e: SessionError) => e.httpStatus === 502 && e.failureCode === 'X',
  );
});

test('createSession times out and cancels the pending session', async () => {
  const { client, calls } = mockClient([{ status: 'NOT_READY' }]);
  let t = 0;
  await assert.rejects(
    createSession(client, { type: 'runway-preset', presetId: 'influencer' }, {
      sleep: noSleep,
      now: () => (t += 1000),
      timeoutMs: 3000,
    }),
    (e: SessionError) => e.httpStatus === 504,
  );
  assert.deepEqual(calls.deleted, ['sess-1']);
});
