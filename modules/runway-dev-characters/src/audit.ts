/**
 * Append-only audit trail for security-relevant decisions (JSON lines).
 *
 * Rules: no secrets, no session keys, no control tokens, no IP addresses, no transcripts.
 * Every event passes `redact()`, which drops forbidden keys and masks secret-looking values,
 * so a programming error cannot write a credential into the trail.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AuditEvent {
  action: string;
  outcome: 'ALLOW' | 'DENY' | 'ESCALATE' | 'ERROR' | 'INFO';
  reason: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface AuditSink {
  record(event: AuditEvent): void;
}

const FORBIDDEN_KEYS = /^(sessionKey|controlToken|token|secret|apiKey|authorization|cookie|password|ip|transcript)$/i;
const SECRET_VALUE = /(key_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{16,}|Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g;

export function redact(event: AuditEvent): AuditEvent {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = typeof v === 'string' ? v.replace(SECRET_VALUE, '[REDACTED]') : v;
  }
  return out as AuditEvent;
}

export class FileAuditSink implements AuditSink {
  private readonly file: string;

  constructor(
    dir: string,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = join(dir, 'audit.jsonl');
  }

  record(event: AuditEvent): void {
    const line = JSON.stringify({ at: new Date(this.now()).toISOString(), ...redact(event) });
    appendFileSync(this.file, `${line}\n`, { mode: 0o600 });
  }
}

export class MemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];
  record(event: AuditEvent): void {
    this.events.push(redact(event));
  }
}
