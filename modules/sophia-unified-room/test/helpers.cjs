'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('../src/db.cjs');
const { createBus } = require('../src/conversation-bus.cjs');
const { createQueue } = require('../src/task-queue.cjs');
const { approverPolicyFrom } = require('../src/auth.cjs');

// Test identities are fixtures, not production identities.
const HUMAN = { id: 'human:test-owner', kind: 'human' };
const OTHER_HUMAN = { id: 'human:test-guest', kind: 'human' };
const SOPHIA = { id: 'sophia', kind: 'agent' };
const APPROVERS = [HUMAN.id];

function fakeClock(iso = '2026-11-07T10:00:00.000Z') {
  let t = Date.parse(iso);
  const clock = () => new Date(t);
  clock.advance = ms => { t += ms; };
  clock.set = s => { t = Date.parse(s); };
  return clock;
}

function tmpDbFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyxa-room-'));
  return path.join(dir, 'room.sqlite');
}

function setup({ file = ':memory:', clock = fakeClock() } = {}) {
  const db = open(file);
  const bus = createBus(db, { clock });
  const queue = createQueue(db, { clock, approverPolicy: approverPolicyFrom(APPROVERS) });
  return { db, bus, queue, clock };
}

function configureClaude(queue, overrides = {}) {
  return queue.configureExecutor(HUMAN, {
    executor: 'claude', mode: 'DIRECT', allowed_task_types: ['analysis', 'review', 'documentation'],
    allowed_operations: ['llm.invoke', 'room.post_result', 'context.read'], daily_budget_cents: 500, max_parallel: 2,
    ...overrides,
  });
}

function fakeAdapter(executor = 'claude', { text = 'Ergebnis.', fail = null, onCall = null } = {}) {
  const calls = [];
  return {
    executor, provider: 'fake', model: 'fake-model-1', calls,
    estimateCostCents: () => 5,
    async execute(args) {
      calls.push(args);
      if (onCall) await onCall(args);
      if (fail) throw fail;
      return { text: typeof text === 'function' ? text(args) : text, provider_response_id: 'resp_' + calls.length, model: 'fake-model-1', usage: { input_tokens: 10, output_tokens: 5 } };
    },
  };
}

function submitAnalysis(queue, bus, extra = {}) {
  const instruction_ref = bus.putContent(extra.instruction || 'Analysiere den Text.');
  return queue.submit(SOPHIA, {
    requested_by: HUMAN, executor: 'claude', task_type: 'analysis',
    scope: { resources: [], allowed_operations: ['llm.invoke', 'room.post_result'] },
    context_refs: extra.context_refs || [], instruction_ref, idempotency_key: extra.key || 'k-' + Math.random(),
    conversation_id: extra.conversation_id || 'conv-1', cost_budget_cents: extra.budget ?? 100, ...extra.input,
  });
}

module.exports = { HUMAN, OTHER_HUMAN, SOPHIA, setup, fakeClock, tmpDbFile, configureClaude, fakeAdapter, submitAnalysis };
