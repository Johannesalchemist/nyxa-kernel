/**
 * File-backed session ledger and budget accounting.
 *
 * The ledger survives server restarts, so a restart neither resets the budget nor
 * forgets sessions that may still be billing. Writes are atomic (temp file + rename).
 * A lock file prevents two server processes from sharing one ledger.
 *
 * Status: V0.2 DRAFT. Single-process design; see ../MODULE.md.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type LocalState =
  | 'provisioning' // create called, waiting for READY
  | 'ready' // credentials handed to the browser, not yet confirmed connected
  | 'active' // browser heartbeat seen
  | 'ending' // cancel requested, not yet confirmed
  | 'ended'; // terminal (cancelled, completed, failed or provisioning aborted)

export interface SessionRecord {
  /** Local request id (idempotency key). Unique per creation attempt. */
  requestId: string;
  /** Runway session id, once known. */
  sessionId?: string;
  avatar: string;
  state: LocalState;
  createdAt: number;
  readyAt?: number;
  lastHeartbeatAt?: number;
  endedAt?: number;
  endReason?: string;
  maxDurationS: number;
  /** Worst-case credits reserved at creation. */
  reservedCredits: number;
  /** Estimated credits after reconciliation, if the remote duration became known. */
  settledCredits?: number;
  /** sha256 of the per-session control token (raw token only ever goes to the browser once). */
  controlTokenHash?: string;
  /** Whether a cancel DELETE call was acknowledged by Runway. */
  cancelAcknowledged?: boolean;
  remoteStatus?: string;
}

interface LedgerFile {
  version: 1;
  sessions: SessionRecord[];
}

export class LedgerLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerLockError';
  }
}

export class Ledger {
  private sessions: SessionRecord[] = [];
  private readonly file: string;
  private readonly lockFile: string;
  private locked = false;

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = join(dir, 'ledger.json');
    this.lockFile = join(dir, 'server.lock');
    if (existsSync(this.file)) {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as LedgerFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) throw new Error('Unsupported ledger format');
      this.sessions = parsed.sessions;
    }
  }

  /** Exclusive lock. Stale locks (dead pid) are taken over. */
  acquireLock(pid = process.pid): void {
    if (existsSync(this.lockFile)) {
      const other = Number(readFileSync(this.lockFile, 'utf8').trim());
      if (Number.isInteger(other) && other > 0 && other !== pid && isAlive(other)) {
        throw new LedgerLockError(`State directory is locked by running process ${other}`);
      }
      unlinkSync(this.lockFile);
    }
    const fd = openSync(this.lockFile, 'wx', 0o600);
    writeFileSync(fd, String(pid));
    closeSync(fd);
    this.locked = true;
  }

  releaseLock(): void {
    if (this.locked && existsSync(this.lockFile)) unlinkSync(this.lockFile);
    this.locked = false;
  }

  all(): readonly SessionRecord[] {
    return this.sessions;
  }

  find(pred: (r: SessionRecord) => boolean): SessionRecord | undefined {
    return this.sessions.find(pred);
  }

  bySessionId(sessionId: string): SessionRecord | undefined {
    return this.sessions.find((r) => r.sessionId === sessionId);
  }

  open(): SessionRecord[] {
    return this.sessions.filter((r) => r.state !== 'ended');
  }

  /** Credits counted against the budget: settled estimate if known, else the reservation. */
  committedCredits(): number {
    return this.sessions.reduce((sum, r) => sum + (r.settledCredits ?? r.reservedCredits), 0);
  }

  add(record: SessionRecord): void {
    this.sessions.push(record);
    this.persist();
  }

  update(record: SessionRecord, patch: Partial<SessionRecord>): void {
    Object.assign(record, patch);
    this.persist();
  }

  private persist(): void {
    const body: LedgerFile = { version: 1, sessions: this.sessions };
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(body, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
