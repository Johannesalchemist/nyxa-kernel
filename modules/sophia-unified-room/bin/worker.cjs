#!/usr/bin/env node
'use strict';
/**
 * Governed worker entry point — invoked by n8n (Schedule Trigger → Execute Command), a systemd timer or an API trigger.
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 *   node bin/worker.cjs --executor claude --trigger schedule [--max 3]
 *
 * The external scheduler may call this every few minutes; whether the executor's HOURLY/DAILY slot is due is decided
 * here from executor_config (Europe/Berlin, DST-correct). Approvals are enforced by the queue, not by this script.
 *
 * Environment (values are never printed):
 *   NYXA_ROOM_DB            path to the SQLite file (required)
 *   NYXA_APPROVER_IDS       comma-separated human principal ids allowed to approve (required for manual trigger)
 *   ANTHROPIC_API_KEY, NYXA_CLAUDE_MODEL, NYXA_CLAUDE_PRICE_IN_CENTS_PER_MTOK, NYXA_CLAUDE_PRICE_OUT_CENTS_PER_MTOK
 *   OPENAI_API_KEY,    NYXA_ARI_MODEL,    NYXA_ARI_PRICE_IN_CENTS_PER_MTOK,    NYXA_ARI_PRICE_OUT_CENTS_PER_MTOK
 */
const { open, tx } = require('../src/db.cjs');
const { createBus } = require('../src/conversation-bus.cjs');
const { createQueue } = require('../src/task-queue.cjs');
const { approverPolicyFrom } = require('../src/auth.cjs');
const { isScheduledTickDue, nextRun } = require('../src/scheduler.cjs');
const { claudeAdapter, gptAdapter, runWorkerOnce } = require('../src/executors.cjs');

function arg(name, dflt) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; }
function pricing(prefix) {
  const i = process.env[prefix + '_PRICE_IN_CENTS_PER_MTOK'], o = process.env[prefix + '_PRICE_OUT_CENTS_PER_MTOK'];
  return i && o ? { input_per_mtok_cents: Number(i), output_per_mtok_cents: Number(o) } : null;
}

function adapterFor(executor) {
  if (executor === 'claude') return claudeAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.NYXA_CLAUDE_MODEL, pricing: pricing('NYXA_CLAUDE') });
  if (executor === 'ari') return gptAdapter({ apiKey: process.env.OPENAI_API_KEY, model: process.env.NYXA_ARI_MODEL, pricing: pricing('NYXA_ARI') });
  throw new Error('no adapter for executor ' + executor);
}

async function main() {
  const executor = arg('executor'); const trigger = arg('trigger', 'schedule'); const max = Number(arg('max', '1'));
  const worker_id = arg('worker', `${executor}-${process.pid}`);
  if (!process.env.NYXA_ROOM_DB) throw new Error('NYXA_ROOM_DB required');
  const db = open(process.env.NYXA_ROOM_DB);
  const bus = createBus(db);
  const queue = createQueue(db, { approverPolicy: approverPolicyFrom((process.env.NYXA_APPROVER_IDS || '').split(',')) });
  const cfg = queue.executorConfig(executor);
  if (!cfg) { console.log(JSON.stringify({ outcome: 'NO_CONFIG', executor })); return; }
  if (trigger === 'schedule') {
    // Atomically take the tick so two schedulers do not both run the same slot.
    const due = tx(db, () => {
      const row = db.prepare('SELECT last_tick FROM scheduler_ticks WHERE executor = ?').get(executor);
      const ok = isScheduledTickDue(cfg, row ? Date.parse(row.last_tick) : null, Date.now());
      if (ok) db.prepare(`INSERT INTO scheduler_ticks (executor, last_tick, worker_id) VALUES (?,?,?)
        ON CONFLICT(executor) DO UPDATE SET last_tick = excluded.last_tick, worker_id = excluded.worker_id`).run(executor, new Date().toISOString(), worker_id);
      return ok;
    });
    if (!due) { console.log(JSON.stringify({ outcome: 'NOT_DUE', executor, mode: cfg.mode, next_run: nextRun(cfg, Date.now()) && new Date(nextRun(cfg, Date.now())).toISOString() })); return; }
  }
  const adapter = adapterFor(executor);
  const results = [];
  for (let i = 0; i < max; i++) {
    const r = await runWorkerOnce({ queue, bus, adapter, worker_id, trigger });
    results.push(r);
    if (r.outcome === 'NO_WORK') break;
  }
  console.log(JSON.stringify({ executor, trigger, worker_id, results: results.map(r => ({ outcome: r.outcome, task_id: r.task_id, reason: r.reason })) }));
}

main().catch(e => { console.error(JSON.stringify({ outcome: 'WORKER_ERROR', error: String(e.message).slice(0, 300) })); process.exit(1); });
