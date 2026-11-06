/**
 * Server configuration with fail-closed defaults.
 * Provenance and status: see ../MODULE.md (V0.2, DRAFT, not independently reviewed).
 *
 * Secure defaults:
 * - binds to loopback only; a non-loopback host needs ALLOW_REMOTE_BIND=true,
 * - no session can be created without NYXA_ACCESS_TOKEN (>= 32 chars),
 * - credit budget defaults to 0, so no paid session is possible until a human sets a budget,
 * - capability `runway.realtime_session.create` must be granted explicitly.
 */
import { isAbsolute, resolve } from 'node:path';
import { PRESET_AVATARS } from './session.ts';

export const CAPABILITY_CREATE = 'runway.realtime_session.create';

export interface AppConfig {
  host: string;
  port: number;
  allowRemoteBind: boolean;
  /** Extra Host header values accepted besides loopback (DNS-rebinding defence). */
  allowedHosts: string[];
  accessToken: string | undefined;
  cookieSecure: boolean;
  authSessionTtlMs: number;
  /** Total local credit budget. 0 denies every paid session. */
  budgetCredits: number;
  maxConcurrentSessions: number;
  /** Session creations allowed per window (global). */
  createLimit: number;
  createWindowMs: number;
  loginLimit: number;
  loginWindowMs: number;
  /** Seconds, passed to Runway as maxDuration (hard server-side cap at Runway). */
  maxDurationS: number;
  provisionTimeoutMs: number;
  pollIntervalMs: number;
  /** A READY session whose credentials are not used within this time is cancelled. */
  connectGraceMs: number;
  heartbeatTimeoutMs: number;
  reaperIntervalMs: number;
  stateDir: string;
  customAvatarId: string | undefined;
  allowedPresets: readonly string[];
  grantedCapabilities: string[];
  /** Contexts that always require human escalation (e.g. unauthorised pilots). */
  escalationContexts: string[];
  /** Context this server instance is operating in (empty = development demo). */
  operatingContext: string;
  deleteConversationAfterEnd: boolean;
  apiKeyConfigured: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host);
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${name} must be a non-negative integer`);
  const value = Number(raw);
  if (value < min || value > max) throw new ConfigError(`${name} must be between ${min} and ${max}`);
  return value;
}

function bool(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new ConfigError(`${name} must be true or false`);
}

function list(env: NodeJS.ProcessEnv, name: string, fallback: string[] = []): string[] {
  const raw = env[name];
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, baseDir = process.cwd()): AppConfig {
  const host = env.HOST?.trim() || '127.0.0.1';
  const allowRemoteBind = bool(env, 'ALLOW_REMOTE_BIND', false);
  if (!isLoopbackHost(host) && !allowRemoteBind) {
    throw new ConfigError(`HOST=${host} is not loopback; set ALLOW_REMOTE_BIND=true to accept the risk explicitly`);
  }

  const accessToken = env.NYXA_ACCESS_TOKEN?.trim() || undefined;
  if (accessToken !== undefined && accessToken.length < 32) {
    throw new ConfigError('NYXA_ACCESS_TOKEN must be at least 32 characters');
  }
  if (!isLoopbackHost(host) && !accessToken) {
    throw new ConfigError('A non-loopback bind requires NYXA_ACCESS_TOKEN');
  }

  const stateDirRaw = env.NYXA_STATE_DIR?.trim() || '.state';
  const stateDir = isAbsolute(stateDirRaw) ? stateDirRaw : resolve(baseDir, stateDirRaw);

  const config: AppConfig = {
    host,
    port: int(env, 'PORT', 3000, 0, 65535),
    allowRemoteBind,
    allowedHosts: list(env, 'ALLOWED_HOSTS'),
    accessToken,
    cookieSecure: bool(env, 'COOKIE_SECURE', false),
    authSessionTtlMs: int(env, 'AUTH_SESSION_TTL_S', 3600, 60, 86_400) * 1000,
    budgetCredits: int(env, 'RUNWAY_BUDGET_CREDITS', 0, 0, 1_000_000),
    maxConcurrentSessions: int(env, 'MAX_CONCURRENT_SESSIONS', 1, 1, 20),
    createLimit: int(env, 'SESSION_CREATE_LIMIT', 3, 1, 1000),
    createWindowMs: int(env, 'SESSION_CREATE_WINDOW_S', 600, 1, 86_400) * 1000,
    loginLimit: int(env, 'LOGIN_LIMIT', 5, 1, 1000),
    loginWindowMs: int(env, 'LOGIN_WINDOW_S', 60, 1, 86_400) * 1000,
    maxDurationS: int(env, 'RUNWAY_MAX_DURATION_S', 120, 10, 600),
    provisionTimeoutMs: int(env, 'PROVISION_TIMEOUT_S', 60, 5, 600) * 1000,
    pollIntervalMs: int(env, 'POLL_INTERVAL_MS', 1000, 10, 60_000),
    connectGraceMs: int(env, 'CONNECT_GRACE_S', 30, 5, 600) * 1000,
    heartbeatTimeoutMs: int(env, 'HEARTBEAT_TIMEOUT_S', 45, 10, 600) * 1000,
    reaperIntervalMs: int(env, 'REAPER_INTERVAL_S', 10, 1, 600) * 1000,
    stateDir,
    customAvatarId: env.RUNWAY_AVATAR_ID?.trim() || undefined,
    allowedPresets: list(env, 'ALLOWED_PRESETS', [...PRESET_AVATARS]).filter((p) =>
      (PRESET_AVATARS as readonly string[]).includes(p),
    ),
    grantedCapabilities: list(env, 'NYXA_GRANTED_CAPABILITIES'),
    escalationContexts: list(env, 'NYXA_ESCALATION_CONTEXTS', ['pilot:schule-in-der-hosentasche', 'audience:minors']),
    operatingContext: env.NYXA_OPERATING_CONTEXT?.trim() ?? '',
    deleteConversationAfterEnd: bool(env, 'RUNWAY_DELETE_CONVERSATION_AFTER_END', false),
    apiKeyConfigured: Boolean(env.RUNWAYML_API_SECRET?.trim()),
  };
  return config;
}
