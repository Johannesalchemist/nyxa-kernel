/**
 * Server-side Runway Characters session provisioning.
 *
 * Provenance: see ../MODULE.md. Request shape follows the installed `@runwayml/sdk` 4.24.0
 * type definitions (`resources/realtime-sessions.d.ts`) and
 * https://docs.dev.runwayml.com/_llms-txt/characters.txt (read 2026-11-06).
 * Status: V0.2 DRAFT, not independently reviewed, never run against the live API.
 */

/** Documented preset avatar IDs (SDK 4.24.0 union type, read 2026-11-06). */
export const PRESET_AVATARS = [
  'game-character',
  'music-superstar',
  'game-character-man',
  'cat-character',
  'influencer',
  'tennis-coach',
  'human-resource',
  'fashion-designer',
  'cooking-teacher',
] as const;

export type PresetAvatarId = (typeof PRESET_AVATARS)[number];

export type AvatarChoice =
  | { type: 'runway-preset'; presetId: PresetAvatarId }
  | { type: 'custom'; avatarId: string };

export type RemoteStatus = 'NOT_READY' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;

export interface RemoteSession {
  status: RemoteStatus;
  sessionKey?: string;
  expiresAt?: string;
  duration?: number;
  failure?: string;
  failureCode?: string;
}

/** Minimal slice of the `@runwayml/sdk` client this module needs (eases mocking). */
export interface RunwayClient {
  realtimeSessions: {
    create(body: { model: 'gwm1_avatars'; avatar: AvatarChoice; maxDuration?: number }): PromiseLike<{ id: string }>;
    retrieve(id: string): PromiseLike<RemoteSession>;
    delete(id: string): PromiseLike<unknown>;
  };
  /** Optional: only used for orphan reporting and data deletion. */
  avatarConversations?: {
    list(query: { limit?: number }): AsyncIterable<{ id: string; status: string }> | PromiseLike<unknown>;
    delete(id: string): PromiseLike<unknown>;
  };
}

/** Browser-safe, one-time connection credentials accepted by `@runwayml/avatars` `streamTo`. */
export interface SessionCredentials {
  sessionId: string;
  sessionKey: string;
  expiresAt?: string;
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code: string,
    readonly failureCode?: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide which avatar to use. A configured custom avatar ID (server env) wins;
 * otherwise the requested preset must be documented AND on the server allowlist.
 */
export function resolveAvatar(
  requestedPreset: unknown,
  configuredAvatarId: string | undefined,
  allowedPresets: readonly string[] = PRESET_AVATARS,
): AvatarChoice {
  const custom = configuredAvatarId?.trim();
  if (custom) {
    if (!UUID_RE.test(custom)) {
      throw new SessionError('RUNWAY_AVATAR_ID is not a valid uuid', 500, 'invalid_server_avatar');
    }
    return { type: 'custom', avatarId: custom };
  }
  if (
    typeof requestedPreset === 'string' &&
    (PRESET_AVATARS as readonly string[]).includes(requestedPreset) &&
    allowedPresets.includes(requestedPreset)
  ) {
    return { type: 'runway-preset', presetId: requestedPreset as PresetAvatarId };
  }
  throw new SessionError('Unknown or disallowed avatar', 400, 'invalid_avatar');
}

export interface ProvisionOptions {
  maxDuration: number;
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Called as soon as Runway returned an ID, before polling (so the ledger knows the session). */
  onCreated?: (sessionId: string) => void;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/** Best-effort cancel. Never throws. Returns true if the DELETE call itself succeeded. */
export async function cancelRemote(client: RunwayClient, sessionId: string): Promise<boolean> {
  try {
    await client.realtimeSessions.delete(sessionId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a realtime Session, wait until READY and return the one-time credentials.
 * Any failure after the remote session exists (FAILED, timeout, polling error,
 * client abort) triggers a best-effort cancel, so no paid session is left behind
 * by this function. The API secret never leaves the server.
 */
export async function provisionSession(
  client: RunwayClient,
  avatar: AvatarChoice,
  options: ProvisionOptions,
): Promise<SessionCredentials> {
  const {
    maxDuration,
    timeoutMs = 60_000,
    intervalMs = 1_000,
    signal,
    sleep = defaultSleep,
    now = Date.now,
    onCreated,
  } = options;

  if (signal?.aborted) throw new SessionError('Request aborted before creation', 499, 'client_aborted');

  const { id: sessionId } = await client.realtimeSessions.create({ model: 'gwm1_avatars', avatar, maxDuration });
  onCreated?.(sessionId);

  try {
    const deadline = now() + timeoutMs;
    while (now() < deadline) {
      if (signal?.aborted) throw new SessionError('Client aborted during provisioning', 499, 'client_aborted');
      const session = await client.realtimeSessions.retrieve(sessionId);
      if (session.status === 'READY') {
        if (!session.sessionKey) {
          throw new SessionError('Session READY without sessionKey', 502, 'missing_session_key');
        }
        if (signal?.aborted) throw new SessionError('Client aborted during provisioning', 499, 'client_aborted');
        return { sessionId, sessionKey: session.sessionKey, expiresAt: session.expiresAt };
      }
      if (TERMINAL_STATUSES.has(session.status)) {
        throw new SessionError(
          `Session ${session.status.toLowerCase()} before becoming ready`,
          502,
          'provisioning_failed',
          session.failureCode,
        );
      }
      await sleep(intervalMs, signal);
    }
    throw new SessionError('Session did not become ready in time', 504, 'provisioning_timeout');
  } catch (error) {
    await cancelRemote(client, sessionId);
    if (error instanceof SessionError) throw error;
    throw new SessionError('Runway API request failed during provisioning', 502, 'upstream_error');
  }
}
