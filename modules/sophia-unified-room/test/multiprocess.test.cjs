'use strict';
/** Zwei Worker als getrennte OS-Prozesse auf derselben SQLite-Datei: kein doppelter Claim. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { open } = require('../src/db.cjs');
const { createBus } = require('../src/conversation-bus.cjs');
const { createQueue } = require('../src/task-queue.cjs');
const { approverPolicyFrom } = require('../src/auth.cjs');
const { HUMAN, tmpDbFile, configureClaude, submitAnalysis } = require('./helpers.cjs');

const CHILD = `
const { open } = require(${JSON.stringify(path.join(__dirname, '../src/db.cjs'))});
const { createQueue } = require(${JSON.stringify(path.join(__dirname, '../src/task-queue.cjs'))});
const db = open(process.argv[1]);
const q = createQueue(db, { approverPolicy: () => false });
const got = [];
for (let i = 0; i < 40; i++) {
  const c = q.claim({ executor: 'claude', worker_id: 'proc-' + process.pid, trigger: 'direct' });
  if (c.task) got.push(c.task.task_id);
}
process.stdout.write(JSON.stringify(got));
`;

function runChild(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--no-warnings', '-e', CHILD, file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
    p.on('close', code => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err))));
  });
}

test('Four worker processes claim 30 tasks: every task exactly once', async () => {
  const file = tmpDbFile();
  const db = open(file);
  const queue = createQueue(db, { approverPolicy: approverPolicyFrom([HUMAN.id]) });
  const bus = createBus(db);
  configureClaude(queue, { max_parallel: 1000 });
  const ids = [];
  for (let i = 0; i < 30; i++) {
    const t = submitAnalysis(queue, bus, { key: 'mp' + i });
    queue.approve(HUMAN, t.task_id, { scope_hash: t.scope_hash });
    ids.push(t.task_id);
  }
  db.close();
  const results = await Promise.all([runChild(file), runChild(file), runChild(file), runChild(file)]);
  const all = results.flat();
  assert.equal(all.length, 30);
  assert.equal(new Set(all).size, 30);
  assert.deepEqual([...all].sort(), [...ids].sort());
});
