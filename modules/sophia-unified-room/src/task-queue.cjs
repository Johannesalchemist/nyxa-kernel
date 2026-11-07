'use strict';
/**
 * Governed Task Queue — state machine, approvals, atomic claims, leases, effects, audit.
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 * Normative rules implemented here (see docs/CONTRACT.md):
 *  R1 Unknown authorization ⇒ no execution (default DENY).
 *  R2 An approval is bound to the task's scope_hash; any scope change invalidates it.
 *  R3 Approvers must be authenticated humans listed in the injected approver policy; agents can never approve.
 *     No identity is hard-coded in this module.
 *  R4 Schedules decide WHEN a worker looks for work, approvals decide WHETHER; both are checked at claim time
 *     and again at every effect (authorizeEffect).
 *  R5 Claims are atomic (BEGIN IMMEDIATE + conditional UPDATE): two workers cannot hold the same task.
 *  R6 Every effect has an effect_key. A STARTED/UNKNOWN effect is never re-executed automatically;
 *     the task is ESCALATED to the human instead (no uncontrolled replay after network interruption).
 *  R7 Revocation is effective immediately: authorizeEffect denies, open leases cannot produce new effects.
 *  R8 Cost budgets are checked before execution, not after.
 *  R9 Goal ≠ Authority (ADR-0002): a task never widens its own scope or executor permissions.
 */
const { tx, canonical, sha256, uuid, audit } = require('./db.cjs');
const { triggerAllowed } = require('./scheduler.cjs');

const STATUS = Object.freeze({
  PROPOSED: 'PROPOSED', PENDING_APPROVAL: 'PENDING_APPROVAL', APPROVED: 'APPROVED', CLAIMED: 'CLAIMED',
  RUNNING: 'RUNNING', RESULT_RECORDED: 'RESULT_RECORDED', VERIFIED: 'VERIFIED', COMPLETED: 'COMPLETED',
  DENIED: 'DENIED', CANCELLED: 'CANCELLED', FAILED: 'FAILED', EXPIRED: 'EXPIRED', ESCALATED: 'ESCALATED',
});

const TRANSITIONS = Object.freeze({
  PROPOSED: ['PENDING_APPROVAL', 'APPROVED', 'CANCELLED', 'DENIED'],
  PENDING_APPROVAL: ['APPROVED', 'DENIED', 'CANCELLED', 'EXPIRED', 'ESCALATED'],
  ESCALATED: ['APPROVED', 'DENIED', 'CANCELLED', 'FAILED'],
  APPROVED: ['CLAIMED', 'CANCELLED', 'EXPIRED'],
  CLAIMED: ['RUNNING', 'APPROVED', 'CANCELLED', 'FAILED'],
  RUNNING: ['RESULT_RECORDED', 'FAILED', 'APPROVED', 'CANCELLED', 'ESCALATED'],
  RESULT_RECORDED: ['VERIFIED', 'FAILED', 'ESCALATED', 'CANCELLED'],
  VERIFIED: ['COMPLETED'],
  COMPLETED: [], DENIED: [], CANCELLED: [], FAILED: [], EXPIRED: [],
});
const TERMINAL = new Set(['COMPLETED', 'DENIED', 'CANCELLED', 'FAILED', 'EXPIRED']);

/** Operations that never change anything outside NYXA. Only these may be covered by a standing mandate. */
const READ_ONLY_OPERATIONS = new Set([
  'llm.invoke', 'context.read', 'room.post_result', 'mail.search', 'mail.read', 'mail.thread', 'repo.read',
]);
/** Operations with external consequences: never auto-retried, always per-task human approval. */
const CONSEQUENTIAL_OPERATIONS = new Set(['mail.send_approved', 'repo.push', 'phone.call', 'payment.execute']);

class GovernanceError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

function scopeHashOf(t) {
  return sha256(canonical({ executor: t.executor, task_type: t.task_type, scope: t.scope, context_refs: t.context_refs, instruction_ref: t.instruction_ref || null }));
}

/**
 * @param db           node:sqlite DatabaseSync from db.open()
 * @param opts.clock   () => Date
 * @param opts.approverPolicy (principal, task) => boolean — injected; e.g. checks a configured human id list.
 */
function createQueue(db, { clock = () => new Date(), approverPolicy } = {}) {
  if (typeof approverPolicy !== 'function') throw new Error('approverPolicy is required (no implicit approvers)');
  const now = () => clock().toISOString();
  const nowMs = () => clock().getTime();

  const parse = r => r && {
    ...r,
    scope: JSON.parse(r.scope),
    context_refs: JSON.parse(r.context_refs),
    approval_required: !!r.approval_required,
    dead_letter: !!r.dead_letter,
    result_provenance: r.result_provenance ? JSON.parse(r.result_provenance) : null,
  };
  const get = id => parse(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(id));

  function transition(task, to, actor, { decision = null, detail = null, set = {} } = {}) {
    if (!TRANSITIONS[task.status] || !TRANSITIONS[task.status].includes(to)) {
      throw new GovernanceError('INVALID_TRANSITION', `${task.status} → ${to} not allowed`);
    }
    const cols = Object.keys(set);
    const assignments = ['status = ?', 'updated_at = ?', 'version = version + 1', ...cols.map(c => `${c} = ?`)].join(', ');
    const r = db.prepare(`UPDATE tasks SET ${assignments} WHERE task_id = ? AND version = ? AND status = ?`)
      .run(to, now(), ...cols.map(c => set[c]), task.task_id, task.version, task.status);
    if (r.changes !== 1) throw new GovernanceError('CONCURRENT_MODIFICATION', 'task changed concurrently');
    audit(db, { at: now(), actor, action: 'task.transition', subject: task.task_id, decision, from: task.status, to,
      correlation_id: task.correlation_id, detail });
    return get(task.task_id);
  }

  function executorConfig(executor) {
    const c = db.prepare('SELECT * FROM executor_config WHERE executor = ?').get(executor);
    if (!c) return null;
    return { ...c, allowed_task_types: JSON.parse(c.allowed_task_types), allowed_operations: JSON.parse(c.allowed_operations) };
  }

  /** Administrative config. Only a principal accepted by approverPolicy (a human) may change it. */
  function configureExecutor(principal, cfg) {
    if (!principal || principal.kind !== 'human' || !approverPolicy(principal, null)) {
      throw new GovernanceError('NOT_AUTHORIZED', 'only an authorized human may configure executors');
    }
    const row = {
      executor: cfg.executor, mode: cfg.mode, interval_minutes: cfg.interval_minutes ?? 60, daily_time: cfg.daily_time ?? '07:00',
      timezone: cfg.timezone ?? 'Europe/Berlin', allowed_task_types: JSON.stringify(cfg.allowed_task_types || []),
      allowed_operations: JSON.stringify(cfg.allowed_operations || []), daily_budget_cents: cfg.daily_budget_cents ?? 0,
      max_parallel: cfg.max_parallel ?? 1, verification_policy: cfg.verification_policy ?? 'required',
      updated_by: principal.id, updated_at: now(),
    };
    new Intl.DateTimeFormat('en-US', { timeZone: row.timezone }); // throws on invalid tz
    db.prepare(`INSERT INTO executor_config (executor, mode, interval_minutes, daily_time, timezone, allowed_task_types,
        allowed_operations, daily_budget_cents, max_parallel, verification_policy, updated_by, updated_at)
        VALUES (@executor,@mode,@interval_minutes,@daily_time,@timezone,@allowed_task_types,@allowed_operations,
        @daily_budget_cents,@max_parallel,@verification_policy,@updated_by,@updated_at)
        ON CONFLICT(executor) DO UPDATE SET mode=excluded.mode, interval_minutes=excluded.interval_minutes,
        daily_time=excluded.daily_time, timezone=excluded.timezone, allowed_task_types=excluded.allowed_task_types,
        allowed_operations=excluded.allowed_operations, daily_budget_cents=excluded.daily_budget_cents,
        max_parallel=excluded.max_parallel, verification_policy=excluded.verification_policy,
        updated_by=excluded.updated_by, updated_at=excluded.updated_at`).run(row);
    audit(db, { at: now(), actor: principal.id, action: 'executor.configure', subject: cfg.executor, detail: cfg });
    return executorConfig(cfg.executor);
  }

  function activeMandate(task) {
    const rows = db.prepare(`SELECT * FROM mandates WHERE executor = ? AND revoked_at IS NULL AND valid_until > ?`)
      .all(task.executor, now());
    return rows.find(m => {
      const types = JSON.parse(m.task_types), ops = JSON.parse(m.operations);
      return types.includes(task.task_type)
        && task.scope.allowed_operations.every(op => ops.includes(op) && READ_ONLY_OPERATIONS.has(op))
        && task.cost_budget_cents <= m.max_cost_cents;
    }) || null;
  }

  /** Standing pre-mandate for read-only analysis. Consequential operations can never be mandated. */
  function grantMandate(principal, m) {
    if (!principal || principal.kind !== 'human' || !approverPolicy(principal, null)) {
      throw new GovernanceError('NOT_AUTHORIZED', 'only an authorized human may grant mandates');
    }
    const bad = (m.operations || []).filter(op => !READ_ONLY_OPERATIONS.has(op));
    if (bad.length) throw new GovernanceError('MANDATE_SCOPE_FORBIDDEN', 'mandates may only cover read-only operations: ' + bad.join(','));
    const mandate_id = uuid();
    db.prepare(`INSERT INTO mandates (mandate_id, granted_by, executor, task_types, operations, max_cost_cents, valid_until, created_at)
                VALUES (?,?,?,?,?,?,?,?)`).run(mandate_id, principal.id, m.executor, JSON.stringify(m.task_types),
      JSON.stringify(m.operations), m.max_cost_cents, m.valid_until, now());
    audit(db, { at: now(), actor: principal.id, action: 'mandate.grant', subject: mandate_id, detail: m });
    return mandate_id;
  }

  function revokeMandate(principal, mandate_id) {
    if (!principal || principal.kind !== 'human' || !approverPolicy(principal, null)) throw new GovernanceError('NOT_AUTHORIZED');
    db.prepare('UPDATE mandates SET revoked_at = ? WHERE mandate_id = ?').run(now(), mandate_id);
    audit(db, { at: now(), actor: principal.id, action: 'mandate.revoke', subject: mandate_id });
  }

  /**
   * Submit a task (usually created_by = sophia on behalf of an authenticated human).
   * Idempotent on idempotency_key: re-submission returns the existing task unchanged.
   */
  function submit(creator, input) {
    if (!creator || !creator.id) throw new GovernanceError('NOT_AUTHENTICATED');
    if (!input.requested_by || !input.requested_by.id || input.requested_by.kind !== 'human') {
      throw new GovernanceError('REQUESTER_REQUIRED', 'requested_by must be an authenticated human principal');
    }
    if (!input.idempotency_key) throw new GovernanceError('IDEMPOTENCY_KEY_REQUIRED');
    const scope = { resources: input.scope?.resources || [], allowed_operations: input.scope?.allowed_operations || [] };
    return tx(db, () => {
      const existing = db.prepare('SELECT * FROM tasks WHERE idempotency_key = ?').get(input.idempotency_key);
      if (existing) return { ...parse(existing), duplicate: true };
      const cfg = executorConfig(input.executor);
      const base = {
        task_id: uuid(), created_by: creator.id, requested_by: input.requested_by.id, executor: input.executor,
        task_type: input.task_type, scope, context_refs: input.context_refs || [], instruction_ref: input.instruction_ref || null,
        execution_mode: cfg ? cfg.mode : 'UNKNOWN', idempotency_key: input.idempotency_key,
        conversation_id: input.conversation_id || null, correlation_id: input.correlation_id || uuid(),
        cost_budget_cents: input.cost_budget_cents ?? 0, max_attempts: input.max_attempts ?? 3,
        expires_at: input.expires_at || null, not_before: input.not_before || null,
      };
      const scope_hash = scopeHashOf(base);
      // Capability preflight (ADR-0002 order: DENY on non-granted capability first).
      let denyReason = null;
      if (!cfg) denyReason = 'EXECUTOR_NOT_CONFIGURED';
      else if (!cfg.allowed_task_types.includes(base.task_type)) denyReason = 'TASK_TYPE_NOT_ALLOWED';
      else if (!scope.allowed_operations.length) denyReason = 'EMPTY_SCOPE';
      else if (!scope.allowed_operations.every(op => cfg.allowed_operations.includes(op))) denyReason = 'OPERATION_NOT_ALLOWED';
      const consequential = scope.allowed_operations.some(op => CONSEQUENTIAL_OPERATIONS.has(op));
      const verification = consequential ? 'required' : (cfg ? cfg.verification_policy : 'required');
      const ts = now();
      db.prepare(`INSERT INTO tasks (task_id, created_by, requested_by, executor, task_type, scope, scope_hash, context_refs,
          instruction_ref, execution_mode, approval_required, approval_status, status, idempotency_key, conversation_id,
          correlation_id, verification, max_attempts, not_before, expires_at, cost_budget_cents, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(base.task_id, base.created_by, base.requested_by, base.executor, base.task_type, JSON.stringify(scope), scope_hash,
          JSON.stringify(base.context_refs), base.instruction_ref, base.execution_mode, 1, 'pending', 'PROPOSED',
          base.idempotency_key, base.conversation_id, base.correlation_id, verification, base.max_attempts, base.not_before,
          base.expires_at, base.cost_budget_cents, ts, ts);
      audit(db, { at: ts, actor: creator.id, action: 'task.submit', subject: base.task_id, correlation_id: base.correlation_id,
        detail: { executor: base.executor, task_type: base.task_type, scope, requested_by: base.requested_by } });
      let t = get(base.task_id);
      if (denyReason) {
        return transition(t, 'DENIED', 'policy', { decision: 'DENY', detail: { reason: denyReason }, set: { approval_status: 'denied', error: denyReason } });
      }
      const mandate = consequential ? null : activeMandate(t);
      if (mandate) {
        db.prepare(`INSERT INTO approvals (approval_id, task_id, decision, decided_by, basis, scope_hash, decided_at)
                    VALUES (?,?,?,?,?,?,?)`).run(uuid(), t.task_id, 'APPROVED', mandate.granted_by, 'mandate:' + mandate.mandate_id, scope_hash, ts);
        return transition(t, 'APPROVED', 'mandate:' + mandate.mandate_id, { decision: 'ALLOW', set: { approval_status: 'approved' } });
      }
      return transition(t, 'PENDING_APPROVAL', 'policy', { detail: { consequential } });
    });
  }

  function effectiveApproval(task) {
    const a = db.prepare(`SELECT * FROM approvals WHERE task_id = ? AND decision = 'APPROVED' AND revoked_at IS NULL
                          ORDER BY decided_at DESC LIMIT 1`).get(task.task_id);
    if (!a) return null;
    if (a.scope_hash !== task.scope_hash) return null;              // R2
    if (a.basis.startsWith('mandate:')) {
      const m = db.prepare('SELECT * FROM mandates WHERE mandate_id = ?').get(a.basis.slice(8));
      if (!m || m.revoked_at || m.valid_until <= now()) return null;
    }
    return a;
  }

  function decide(principal, task_id, decision, { scope_hash, reason } = {}) {
    const pre = get(task_id);
    if (!pre) throw new GovernanceError('NOT_FOUND');
    if (!principal || principal.kind !== 'human' || !approverPolicy(principal, pre)) {
      // Audited outside the transaction so the refused attempt itself remains evidence.
      audit(db, { at: now(), actor: principal?.id || 'unknown', action: 'task.decide', subject: task_id, decision: 'DENY', detail: { reason: 'approver_not_authorized', attempted: decision }, correlation_id: pre.correlation_id });
      throw new GovernanceError('NOT_AUTHORIZED', 'approver not authorized');
    }
    return tx(db, () => {
      const t = get(task_id);
      if (decision === 'APPROVED' && scope_hash !== t.scope_hash) throw new GovernanceError('SCOPE_MISMATCH', 'approval must reference the exact scope_hash shown to the approver');
      db.prepare(`INSERT INTO approvals (approval_id, task_id, decision, decided_by, basis, scope_hash, decided_at)
                  VALUES (?,?,?,?,?,?,?)`).run(uuid(), task_id, decision, principal.id, 'human', t.scope_hash, now());
      return transition(t, decision, principal.id, {
        decision: decision === 'APPROVED' ? 'ALLOW' : 'DENY', detail: { reason: reason || null },
        set: { approval_status: decision === 'APPROVED' ? 'approved' : 'denied' },
      });
    });
  }
  const approve = (p, id, o) => decide(p, id, 'APPROVED', o);
  const deny = (p, id, o) => decide(p, id, 'DENIED', o);

  /** Revocation: effective immediately for every future effect, also for a task currently RUNNING. */
  function revoke(principal, task_id, reason) {
    return tx(db, () => {
      const t = get(task_id);
      if (!t) throw new GovernanceError('NOT_FOUND');
      if (!principal || principal.kind !== 'human' || !approverPolicy(principal, t)) throw new GovernanceError('NOT_AUTHORIZED');
      db.prepare(`UPDATE approvals SET revoked_at = ?, revoked_by = ? WHERE task_id = ? AND revoked_at IS NULL`).run(now(), principal.id, task_id);
      audit(db, { at: now(), actor: principal.id, action: 'approval.revoke', subject: task_id, decision: 'REVOKE', correlation_id: t.correlation_id, detail: { reason } });
      if (TERMINAL.has(t.status)) return t;
      return transition(t, 'CANCELLED', principal.id, { decision: 'REVOKE', detail: { reason }, set: { approval_status: 'revoked', lease_token: null } });
    });
  }

  function cancel(principal, task_id, reason) {
    return tx(db, () => {
      const t = get(task_id);
      if (!t) throw new GovernanceError('NOT_FOUND');
      const isRequester = principal && principal.kind === 'human' && principal.id === t.requested_by;
      if (!isRequester && !(principal && principal.kind === 'human' && approverPolicy(principal, t))) throw new GovernanceError('NOT_AUTHORIZED');
      return transition(t, 'CANCELLED', principal.id, { detail: { reason }, set: { lease_token: null } });
    });
  }

  function spentToday(executor, tz) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(clock());
    const rows = db.prepare(`SELECT updated_at, cost_spent_cents FROM tasks WHERE executor = ? AND cost_spent_cents > 0`).all(executor);
    return rows.filter(r => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.updated_at)) === day)
      .reduce((s, r) => s + r.cost_spent_cents, 0);
  }

  /**
   * Atomic claim. trigger ∈ direct | approval | schedule | manual.
   * For manual triggers a human principal and an explicit task_id are required.
   * Returns { task, lease_token } or { task: null, reason }.
   */
  function claim({ executor, worker_id, trigger, lease_ms = 5 * 60_000, task_id = null, principal = null }) {
    return tx(db, () => {
      const cfg = executorConfig(executor);
      if (!cfg) return { task: null, reason: 'EXECUTOR_NOT_CONFIGURED' };
      if (!triggerAllowed(cfg.mode, trigger)) return { task: null, reason: 'MODE_FORBIDS_TRIGGER:' + cfg.mode + '/' + trigger };
      if (trigger === 'manual' && (!principal || principal.kind !== 'human' || !task_id || !approverPolicy(principal, null))) {
        return { task: null, reason: 'MANUAL_REQUIRES_AUTHORIZED_HUMAN_AND_TASK' };
      }
      expireLeasesInTx();
      const running = db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE executor = ? AND status IN ('CLAIMED','RUNNING')`).get(executor).n;
      if (running >= cfg.max_parallel) return { task: null, reason: 'MAX_PARALLEL_REACHED' };
      const ts = now();
      const candidates = db.prepare(`SELECT * FROM tasks WHERE executor = ? AND status = 'APPROVED'
          AND (not_before IS NULL OR not_before <= ?) ${task_id ? 'AND task_id = ?' : ''} ORDER BY created_at, task_id LIMIT 20`)
        .all(...[executor, ts, ...(task_id ? [task_id] : [])]).map(parse);
      for (const t of candidates) {
        if (t.expires_at && t.expires_at <= ts) { transition(t, 'EXPIRED', 'scheduler'); continue; }
        if (!effectiveApproval(t)) {                                      // R1/R2: approval revoked or scope drift
          transition(t, 'CANCELLED', 'policy', { decision: 'DENY', detail: { reason: 'NO_EFFECTIVE_APPROVAL' } });
          continue;
        }
        if (!t.scope.allowed_operations.every(op => cfg.allowed_operations.includes(op))) {
          transition(t, 'CANCELLED', 'policy', { decision: 'DENY', detail: { reason: 'EXECUTOR_SCOPE_NARROWED' } });
          continue;
        }
        const lease_token = uuid();
        const claimed = transition(t, 'CLAIMED', worker_id, {
          decision: 'ALLOW', detail: { trigger },
          set: { lease_owner: worker_id, lease_token, lease_expires_at: new Date(nowMs() + lease_ms).toISOString(), heartbeat_at: ts, attempts: t.attempts + 1 },
        });
        return { task: claimed, lease_token, daily_spent_cents: spentToday(executor, cfg.timezone), daily_budget_cents: cfg.daily_budget_cents };
      }
      return { task: null, reason: 'NO_ELIGIBLE_TASK' };
    });
  }

  function requireLease(t, lease_token) {
    if (!t) throw new GovernanceError('NOT_FOUND');
    if (!lease_token || t.lease_token !== lease_token) throw new GovernanceError('LEASE_INVALID', 'lease token does not match');
    if (t.lease_expires_at && t.lease_expires_at <= now()) throw new GovernanceError('LEASE_EXPIRED');
  }

  function start(task_id, lease_token) {
    return tx(db, () => { const t = get(task_id); requireLease(t, lease_token); return transition(t, 'RUNNING', t.lease_owner); });
  }

  function heartbeat(task_id, lease_token, lease_ms = 5 * 60_000) {
    return tx(db, () => {
      const t = get(task_id); requireLease(t, lease_token);
      db.prepare('UPDATE tasks SET heartbeat_at = ?, lease_expires_at = ? WHERE task_id = ?').run(now(), new Date(nowMs() + lease_ms).toISOString(), task_id);
      return get(task_id);
    });
  }

  /**
   * Effect gate. Must be called immediately before every operation with an effect (including LLM calls, which cost money).
   * Re-checks lease, approval (incl. revocation), scope, budget and replay state.
   */
  function authorizeEffect(task_id, lease_token, { operation, resource, effect_key, cost_cents = 0 }) {
    return tx(db, () => {
      const t = get(task_id);
      const deny = (reason) => {
        audit(db, { at: now(), actor: t?.lease_owner || 'unknown', action: 'effect.authorize', subject: task_id, decision: 'DENY', correlation_id: t?.correlation_id, detail: { operation, resource, reason } });
        return { allowed: false, reason };
      };
      if (!t) return { allowed: false, reason: 'NOT_FOUND' };
      if (t.status !== 'RUNNING') return deny('TASK_NOT_RUNNING:' + t.status);
      try { requireLease(t, lease_token); } catch (e) { return deny(e.code); }
      if (!effectiveApproval(t)) return deny('NO_EFFECTIVE_APPROVAL');
      if (!t.scope.allowed_operations.includes(operation)) return deny('OPERATION_OUT_OF_SCOPE');
      if (t.scope.resources.length && resource && !t.scope.resources.includes(resource)) return deny('RESOURCE_OUT_OF_SCOPE');
      const cfg = executorConfig(t.executor);
      if (!cfg || !cfg.allowed_operations.includes(operation)) return deny('EXECUTOR_NOT_PERMITTED');
      if (cost_cents > 0) {
        if (t.cost_spent_cents + cost_cents > t.cost_budget_cents) return deny('TASK_BUDGET_EXCEEDED');
        if (cfg.daily_budget_cents && spentToday(t.executor, cfg.timezone) + cost_cents > cfg.daily_budget_cents) return deny('DAILY_BUDGET_EXCEEDED');
      }
      if (!effect_key) return deny('EFFECT_KEY_REQUIRED');
      const prior = db.prepare('SELECT * FROM effects WHERE effect_key = ?').get(effect_key);
      if (prior) {
        if (prior.status === 'CONFIRMED') return { allowed: false, reason: 'ALREADY_CONFIRMED', replay: true, evidence: prior.evidence ? JSON.parse(prior.evidence) : null };
        if (prior.status === 'FAILED' && !CONSEQUENTIAL_OPERATIONS.has(operation)) {
          db.prepare(`UPDATE effects SET status = 'STARTED', started_at = ?, finished_at = NULL WHERE effect_key = ?`).run(now(), effect_key);
        } else {
          return deny('EFFECT_OUTCOME_UNKNOWN_REQUIRES_HUMAN');   // R6
        }
      } else {
        db.prepare(`INSERT INTO effects (effect_key, task_id, operation, resource, status, started_at) VALUES (?,?,?,?, 'STARTED', ?)`)
          .run(effect_key, task_id, operation, resource || '', now());
      }
      if (cost_cents > 0) db.prepare('UPDATE tasks SET cost_spent_cents = cost_spent_cents + ? WHERE task_id = ?').run(cost_cents, task_id);
      audit(db, { at: now(), actor: t.lease_owner, action: 'effect.authorize', subject: task_id, decision: 'ALLOW', correlation_id: t.correlation_id, detail: { operation, resource, effect_key, cost_cents } });
      return { allowed: true };
    });
  }

  function recordEffect(effect_key, status, evidence) {
    if (!['CONFIRMED', 'FAILED', 'UNKNOWN'].includes(status)) throw new Error('invalid effect status');
    db.prepare('UPDATE effects SET status = ?, evidence = ?, finished_at = ? WHERE effect_key = ?')
      .run(status, evidence == null ? null : canonical(evidence), now(), effect_key);
    const e = db.prepare('SELECT * FROM effects WHERE effect_key = ?').get(effect_key);
    audit(db, { at: now(), actor: 'effect', action: 'effect.record', subject: effect_key, decision: status, detail: { task_id: e?.task_id } });
  }

  function recordResult(task_id, lease_token, { result_ref, provenance }) {
    return tx(db, () => {
      const t = get(task_id); requireLease(t, lease_token);
      if (!provenance || !provenance.executor || !provenance.model) throw new GovernanceError('PROVENANCE_REQUIRED');
      return transition(t, 'RESULT_RECORDED', t.lease_owner, { detail: { result_ref }, set: { result_ref, result_provenance: canonical(provenance) } });
    });
  }

  /** Independent verification: verifier must differ from the executor and the lease owner. */
  function verify(verifier, task_id, { verdict, evidence_ref = null, note = null }) {
    return tx(db, () => {
      const t = get(task_id);
      if (!t) throw new GovernanceError('NOT_FOUND');
      if (!verifier || !verifier.id) throw new GovernanceError('NOT_AUTHENTICATED');
      if (verifier.id === t.executor || verifier.id === t.lease_owner) throw new GovernanceError('VERIFIER_NOT_INDEPENDENT');
      if (verifier.kind !== 'human' && verifier.kind !== 'agent') throw new GovernanceError('VERIFIER_KIND');
      if (t.status !== 'RESULT_RECORDED') throw new GovernanceError('INVALID_TRANSITION', 'nothing to verify in ' + t.status);
      if (verdict === 'pass') {
        const v = transition(t, 'VERIFIED', verifier.id, { decision: 'VERIFIED', detail: { evidence_ref, note, verifier_kind: verifier.kind } });
        return transition(v, 'COMPLETED', verifier.id, { set: { lease_token: null } });
      }
      return transition(t, 'ESCALATED', verifier.id, { decision: 'VERIFICATION_FAILED', detail: { evidence_ref, note } });
    });
  }

  /** Failure handling with bounded retry + dead letter. Consequential tasks never auto-retry. */
  function fail(task_id, lease_token, { error, retryable = false, backoff_ms = 60_000 }) {
    return tx(db, () => {
      const t = get(task_id); requireLease(t, lease_token);
      const consequential = t.scope.allowed_operations.some(op => CONSEQUENTIAL_OPERATIONS.has(op));
      const unknownEffects = db.prepare(`SELECT COUNT(*) AS n FROM effects WHERE task_id = ? AND status IN ('STARTED','UNKNOWN')`).get(task_id).n;
      if (unknownEffects > 0 && t.status === 'RUNNING') {
        return transition(t, 'ESCALATED', t.lease_owner, { decision: 'ESCALATE', detail: { error, reason: 'EFFECT_OUTCOME_UNKNOWN' }, set: { error, lease_token: null } });
      }
      if (retryable && !consequential && t.attempts < t.max_attempts && t.status === 'RUNNING') {
        return transition(t, 'APPROVED', t.lease_owner, { detail: { error, retry: t.attempts }, set: { error, lease_token: null, lease_owner: null, not_before: new Date(nowMs() + backoff_ms * t.attempts).toISOString() } });
      }
      return transition(t, 'FAILED', t.lease_owner, { detail: { error }, set: { error, dead_letter: 1, lease_token: null } });
    });
  }

  function expireLeasesInTx() {
    const ts = now();
    const stale = db.prepare(`SELECT * FROM tasks WHERE status IN ('CLAIMED','RUNNING') AND lease_expires_at <= ?`).all(ts).map(parse);
    for (const t of stale) {
      const unknown = db.prepare(`SELECT COUNT(*) AS n FROM effects WHERE task_id = ? AND status IN ('STARTED','UNKNOWN')`).get(t.task_id).n;
      if (t.status === 'CLAIMED') transition(t, 'APPROVED', 'lease-reaper', { detail: { reason: 'LEASE_EXPIRED' }, set: { lease_token: null, lease_owner: null } });
      else if (unknown > 0) transition(t, 'ESCALATED', 'lease-reaper', { decision: 'ESCALATE', detail: { reason: 'LEASE_EXPIRED_EFFECT_UNKNOWN' }, set: { lease_token: null } });
      else if (t.attempts < t.max_attempts && !t.scope.allowed_operations.some(op => CONSEQUENTIAL_OPERATIONS.has(op))) {
        transition(t, 'APPROVED', 'lease-reaper', { detail: { reason: 'LEASE_EXPIRED_RETRY' }, set: { lease_token: null, lease_owner: null } });
      } else transition(t, 'FAILED', 'lease-reaper', { detail: { reason: 'LEASE_EXPIRED' }, set: { lease_token: null, dead_letter: 1 } });
    }
    return stale.length;
  }
  const expireLeases = () => tx(db, expireLeasesInTx);

  function list({ status, executor } = {}) {
    let q = 'SELECT * FROM tasks WHERE 1=1'; const a = [];
    if (status) { q += ' AND status = ?'; a.push(status); }
    if (executor) { q += ' AND executor = ?'; a.push(executor); }
    return db.prepare(q + ' ORDER BY created_at').all(...a).map(parse);
  }

  function auditTrail(correlation_id) {
    return db.prepare('SELECT * FROM audit WHERE correlation_id = ? ORDER BY seq').all(correlation_id);
  }

  return {
    STATUS, submit, approve, deny, revoke, cancel, claim, start, heartbeat, authorizeEffect, recordEffect, recordResult,
    verify, fail, expireLeases, get, list, auditTrail, configureExecutor, executorConfig, grantMandate, revokeMandate,
    scopeHashOf,
  };
}

module.exports = { createQueue, STATUS, TRANSITIONS, TERMINAL, READ_ONLY_OPERATIONS, CONSEQUENTIAL_OPERATIONS, GovernanceError };
