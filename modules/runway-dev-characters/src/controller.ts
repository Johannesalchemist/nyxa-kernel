/**
 * Session controller: the single place where paid Runway sessions are created and ended.
 *
 * Gate order for `connect` (deterministic, every step before any Runway call):
 *   1. request id valid           -> 400 invalid_request_id
 *   2. request id unused (replay) -> 409 duplicate_request
 *   3. avatar allowed             -> 400 invalid_avatar
 *   4. policy gate ALLOW          -> 403 capability_denied | 403 escalation_required | 409 policy_blocked
 *   5. Runway key configured      -> 503 runway_not_configured
 *   6. concurrency limit          -> 429 concurrency_limit
 *   7. credit budget              -> 402 budget_exhausted
 *   8. creation rate limit        -> 429 rate_limited (counted only for requests that pass 6 and 7)
 * Steps 6-8 and the reservation run synchronously (no await in between), so two
 * parallel requests cannot both pass a limit that only one of them fits into.
 *
 * Status: V0.2 DRAFT, see ../MODULE.md.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config.ts';
import { CAPABILITY_CREATE } from './config.ts';
import type { AuditSink } from './audit.ts';
import { estimateCredits } from './cost.ts';
import type { PolicyGate } from './policy.ts';
import { SlidingWindowLimiter } from './rateLimit.ts';
import {
  cancelRemote,
  provisionSession,
  resolveAvatar,
  SessionError,
  TERMINAL_STATUSES,
  type RunwayClient,
} from './session.ts';
import type { Ledger, SessionRecord } from './store.ts';

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Slack beyond maxDuration before the reaper force-ends a record. */
const MAX_DURATION_SLACK_MS = 60_000;

export interface ConnectInput {
  requestId: unknown;
  presetId: unknown;
  signal?: AbortSignal;
}

export interface ConnectResult {
  sessionId: string;
  sessionKey: string;
  expiresAt?: string;
  controlToken: string;
  maxDurationS: number;
  reservedCredits: number;
}

export type EndOutcome = 'ended' | 'already_ended' | 'ending';

export interface ControllerDeps {
  /** Lazily returns the Runway client; throws if no key is configured. */
  client: () => RunwayClient;
  config: AppConfig;
  ledger: Ledger;
  audit: AuditSink;
  gate: PolicyGate;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function tokenMatches(record: SessionRecord, token: unknown): boolean {
  if (typeof token !== 'string' || !CONTROL_TOKEN_RE.test(token) || !record.controlTokenHash) return false;
  const a = Buffer.from(sha256(token), 'hex');
  const b = Buffer.from(record.controlTokenHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function upstreamStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

export class SessionController {
  private readonly now: () => number;
  private readonly createLimiter: SlidingWindowLimiter;
  private readonly inFlight = new Set<string>();
  private readonly ending = new Map<string, Promise<EndOutcome>>();

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? Date.now;
    this.createLimiter = new SlidingWindowLimiter(deps.config.createLimit, deps.config.createWindowMs, this.now);
  }

  /** Snapshot for the authenticated status endpoint (no secrets). */
  status() {
    const { config, ledger } = this.deps;
    const committed = ledger.committedCredits();
    return {
      budgetCredits: config.budgetCredits,
      committedCredits: committed,
      remainingCredits: Math.max(0, config.budgetCredits - committed),
      perSessionReservation: estimateCredits(config.maxDurationS),
      openSessions: ledger.open().length,
      maxConcurrentSessions: config.maxConcurrentSessions,
      maxDurationS: config.maxDurationS,
      estimateNote: 'Local upper-bound estimate from the published price list; not Runway billing data.',
    };
  }

  private deny(code: string, httpStatus: number, message: string, extra: Record<string, unknown> = {}): never {
    this.deps.audit.record({ action: 'session.create', outcome: 'DENY', reason: code, ...extra });
    throw new SessionError(message, httpStatus, code);
  }

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { config, ledger, audit, gate } = this.deps;

    // 1. + 2. request id and replay protection
    if (typeof input.requestId !== 'string' || !REQUEST_ID_RE.test(input.requestId)) {
      this.deny('invalid_request_id', 400, 'A uuid request id (Idempotency-Key) is required');
    }
    const requestId = input.requestId as string;
    if (this.inFlight.has(requestId) || ledger.find((r) => r.requestId === requestId)) {
      this.deny('duplicate_request', 409, 'This request id was already used', { requestId });
    }
    this.inFlight.add(requestId);

    try {
      // 3. avatar
      let avatar;
      try {
        avatar = resolveAvatar(input.presetId, config.customAvatarId, config.allowedPresets);
      } catch (error) {
        const e = error as SessionError;
        this.deny(e.code, e.httpStatus, e.message, { requestId });
      }
      const avatarLabel = avatar.type === 'custom' ? `custom:${avatar.avatarId}` : `preset:${avatar.presetId}`;

      // 4. policy gate (may be async: the canonical runtime gate could be remote)
      const decision = await gate.evaluate({
        capability: CAPABILITY_CREATE,
        context: config.operatingContext,
        avatar: avatarLabel,
      });
      if (decision.disposition !== 'ALLOW') {
        const code =
          decision.disposition === 'DENY'
            ? 'capability_denied'
            : decision.disposition === 'ESCALATE'
              ? 'escalation_required'
              : 'policy_blocked';
        const status = decision.disposition === 'DENY' || decision.disposition === 'ESCALATE' ? 403 : 409;
        audit.record({
          action: 'session.create',
          outcome: decision.disposition === 'ESCALATE' ? 'ESCALATE' : 'DENY',
          reason: code,
          requestId,
          policy: decision.reasons.join(','),
        });
        throw new SessionError(`Policy decision ${decision.disposition}: no action taken`, status, code);
      }
      if (input.signal?.aborted) this.deny('client_aborted', 499, 'Client aborted', { requestId });

      // 5. key
      if (!config.apiKeyConfigured) {
        this.deny('runway_not_configured', 503, 'RUNWAYML_API_SECRET is not set on the server', { requestId });
      }

      // 6.-8. synchronous section: limits + reservation
      const reserve = estimateCredits(config.maxDurationS);
      const open = ledger.open().length;
      if (open >= config.maxConcurrentSessions) {
        this.deny('concurrency_limit', 429, 'Maximum number of parallel sessions reached', { requestId, open });
      }
      const committed = ledger.committedCredits();
      if (committed + reserve > config.budgetCredits) {
        this.deny('budget_exhausted', 402, 'Credit budget exhausted or not configured', {
          requestId,
          committed,
          reserve,
          budget: config.budgetCredits,
        });
      }
      if (!this.createLimiter.tryAcquire('global')) {
        this.deny('rate_limited', 429, 'Too many session creations, try again later', { requestId });
      }
      const record: SessionRecord = {
        requestId,
        avatar: avatarLabel,
        state: 'provisioning',
        createdAt: this.now(),
        maxDurationS: config.maxDurationS,
        reservedCredits: reserve,
      };
      ledger.add(record);
      audit.record({ action: 'session.create', outcome: 'ALLOW', reason: 'all_gates_passed', requestId, reserve });

      // 9. provisioning (Runway calls happen only from here on)
      let credentials;
      try {
        credentials = await provisionSession(this.deps.client(), avatar, {
          maxDuration: config.maxDurationS,
          timeoutMs: config.provisionTimeoutMs,
          intervalMs: config.pollIntervalMs,
          signal: input.signal,
          sleep: this.deps.sleep,
          now: this.now,
          onCreated: (sessionId) => ledger.update(record, { sessionId }),
        });
      } catch (error) {
        const code = error instanceof SessionError ? error.code : 'upstream_error';
        const patch: Partial<SessionRecord> = { state: 'ended', endedAt: this.now(), endReason: code };
        const status = upstreamStatus(error);
        if (!record.sessionId && status !== undefined && status >= 400 && status < 500) {
          // Runway rejected the create request definitively: nothing was created.
          patch.settledCredits = 0;
        } else if (record.sessionId) {
          // provisionSession already attempted a cancel.
          patch.cancelAcknowledged = await this.confirmTerminal(record.sessionId);
        }
        ledger.update(record, patch);
        audit.record({
          action: 'session.provision',
          outcome: 'ERROR',
          reason: code,
          requestId,
          sessionId: record.sessionId,
          upstreamStatus: status,
        });
        if (error instanceof SessionError) throw error;
        throw new SessionError('Runway API request failed', 502, 'upstream_error');
      }

      const controlToken = randomBytes(32).toString('base64url');
      ledger.update(record, { state: 'ready', readyAt: this.now(), controlTokenHash: sha256(controlToken) });
      audit.record({ action: 'session.ready', outcome: 'INFO', reason: 'credentials_issued', requestId, sessionId: credentials.sessionId });
      return {
        sessionId: credentials.sessionId,
        sessionKey: credentials.sessionKey,
        expiresAt: credentials.expiresAt,
        controlToken,
        maxDurationS: config.maxDurationS,
        reservedCredits: reserve,
      };
    } finally {
      this.inFlight.delete(requestId);
    }
  }

  /** Returns true when Runway reports the session terminal (best effort, never throws). */
  private async confirmTerminal(sessionId: string): Promise<boolean> {
    try {
      const remote = await this.deps.client().realtimeSessions.retrieve(sessionId);
      return TERMINAL_STATUSES.has(remote.status);
    } catch {
      return false;
    }
  }

  private authorize(sessionId: unknown, controlToken: unknown): SessionRecord {
    const record = typeof sessionId === 'string' ? this.deps.ledger.bySessionId(sessionId) : undefined;
    if (!record || !tokenMatches(record, controlToken)) {
      // Same answer for unknown id and wrong token: no session enumeration.
      throw new SessionError('Unknown session', 404, 'unknown_session');
    }
    return record;
  }

  heartbeat(sessionId: unknown, controlToken: unknown): { state: string } {
    const record = this.authorize(sessionId, controlToken);
    if (record.state === 'ended' || record.state === 'ending') {
      throw new SessionError('Session already ended', 410, 'session_ended');
    }
    this.deps.ledger.update(record, { state: 'active', lastHeartbeatAt: this.now() });
    return { state: 'active' };
  }

  async end(sessionId: unknown, controlToken: unknown, reason = 'client_end'): Promise<EndOutcome> {
    const record = this.authorize(sessionId, controlToken);
    return this.endRecord(record, reason);
  }

  /** Idempotent: concurrent and repeated calls share one cancel attempt. */
  private endRecord(record: SessionRecord, reason: string): Promise<EndOutcome> {
    if (record.state === 'ended') return Promise.resolve('already_ended');
    const key = record.sessionId ?? record.requestId;
    const pending = this.ending.get(key);
    if (pending) return pending;
    const run = this.doEnd(record, reason).finally(() => this.ending.delete(key));
    this.ending.set(key, run);
    return run;
  }

  private async doEnd(record: SessionRecord, reason: string): Promise<EndOutcome> {
    const { ledger, audit, config } = this.deps;
    if (record.state !== 'ending') ledger.update(record, { state: 'ending', endReason: reason });
    if (!record.sessionId) {
      ledger.update(record, { state: 'ended', endedAt: this.now() });
      audit.record({ action: 'session.end', outcome: 'INFO', reason: `${reason}:no_remote_id`, requestId: record.requestId });
      return 'ended';
    }
    let client: RunwayClient;
    try {
      client = this.deps.client();
    } catch {
      audit.record({ action: 'session.end', outcome: 'ERROR', reason: 'runway_not_configured', sessionId: record.sessionId });
      return 'ending';
    }
    const acknowledged = await cancelRemote(client, record.sessionId);
    let remoteStatus: string | undefined;
    let duration: number | undefined;
    try {
      const remote = await client.realtimeSessions.retrieve(record.sessionId);
      remoteStatus = remote.status;
      duration = typeof remote.duration === 'number' ? remote.duration : undefined;
    } catch {
      remoteStatus = undefined;
    }
    const terminal = remoteStatus !== undefined && TERMINAL_STATUSES.has(remoteStatus);
    if (!acknowledged && !terminal) {
      audit.record({ action: 'session.end', outcome: 'ERROR', reason: `${reason}:cancel_unconfirmed`, sessionId: record.sessionId });
      return 'ending'; // the reaper retries; the record keeps counting against concurrency and budget
    }
    const endedAt = this.now();
    const settled =
      duration !== undefined
        ? estimateCredits(Math.min(duration, record.maxDurationS))
        : estimateCredits(Math.min(record.maxDurationS, (endedAt - record.createdAt) / 1000));
    ledger.update(record, {
      state: 'ended',
      endedAt,
      endReason: reason,
      cancelAcknowledged: acknowledged,
      remoteStatus,
      settledCredits: Math.min(settled, record.reservedCredits),
    });
    audit.record({ action: 'session.end', outcome: 'INFO', reason, sessionId: record.sessionId, remoteStatus, settled });
    if (config.deleteConversationAfterEnd && client.avatarConversations) {
      try {
        await client.avatarConversations.delete(record.sessionId);
        audit.record({ action: 'conversation.delete', outcome: 'INFO', reason: 'retention_policy', sessionId: record.sessionId });
      } catch (error) {
        audit.record({
          action: 'conversation.delete',
          outcome: 'ERROR',
          reason: 'delete_failed',
          sessionId: record.sessionId,
          upstreamStatus: upstreamStatus(error),
        });
      }
    }
    return 'ended';
  }

  /** One reaper pass. Returns the session ids it tried to end. */
  async reap(): Promise<string[]> {
    const { config, ledger } = this.deps;
    const t = this.now();
    const ended: string[] = [];
    for (const record of [...ledger.open()]) {
      let reason: string | undefined;
      if (record.state === 'ending') reason = record.endReason ?? 'retry_cancel';
      else if (t - record.createdAt > record.maxDurationS * 1000 + MAX_DURATION_SLACK_MS) reason = 'max_duration_exceeded';
      else if (record.state === 'ready' && t - (record.readyAt ?? record.createdAt) > config.connectGraceMs) reason = 'connect_timeout';
      else if (record.state === 'active' && t - (record.lastHeartbeatAt ?? 0) > config.heartbeatTimeoutMs) reason = 'heartbeat_lost';
      else if (record.state === 'provisioning' && !this.inFlight.has(record.requestId) && t - record.createdAt > config.provisionTimeoutMs * 2) {
        reason = 'stale_provisioning';
      }
      if (reason) {
        await this.endRecord(record, reason);
        ended.push(record.sessionId ?? record.requestId);
      }
    }
    return ended;
  }

  /**
   * Startup recovery after a crash or restart: every session the ledger still considers
   * open is cancelled. Whether its browser is still connected cannot be known after a
   * restart, so the controller fails safe and ends it. Unmanaged in-progress
   * conversations on the account are reported, never cancelled (Goal != Authority).
   */
  async recover(): Promise<{ cancelled: string[]; unmanaged: string[] }> {
    const { ledger, audit } = this.deps;
    const cancelled: string[] = [];
    for (const record of [...ledger.open()]) {
      await this.endRecord(record, 'server_restart');
      cancelled.push(record.sessionId ?? record.requestId);
    }
    const unmanaged: string[] = [];
    try {
      const conversations = this.deps.client().avatarConversations;
      if (conversations) {
        const page = conversations.list({ limit: 50 }) as AsyncIterable<{ id: string; status: string }>;
        let seen = 0;
        for await (const c of page) {
          if (++seen > 200) break;
          if (c.status === 'in_progress' && !ledger.bySessionId(c.id)) unmanaged.push(c.id);
        }
      }
    } catch {
      audit.record({ action: 'recovery.orphan_scan', outcome: 'INFO', reason: 'scan_unavailable' });
    }
    for (const id of unmanaged) {
      audit.record({ action: 'recovery.orphan_scan', outcome: 'INFO', reason: 'unmanaged_in_progress_session', sessionId: id });
    }
    return { cancelled, unmanaged };
  }
}
