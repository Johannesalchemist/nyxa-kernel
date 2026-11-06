/**
 * Server-side Runway Characters session creation.
 *
 * Provenance: see ../MODULE.md. Request shape follows
 * https://docs.dev.runwayml.com/api.md (POST /v1/realtime_sessions, model `gwm1_avatars`)
 * and the integration guide https://docs.dev.runwayml.com/characters/integration.md,
 * read on 2026-11-06. Status: DRAFT, not reviewed.
 */

/** Documented preset avatar IDs (api.md, read 2026-11-06). Re-check before relying on them. */
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

/** Minimal slice of the `@runwayml/sdk` client that this module needs (eases mocking). */
export interface RealtimeSessionsClient {
  realtimeSessions: {
    create(body: {
      model: 'gwm1_avatars';
      avatar: AvatarChoice;
      maxDuration?: number;
    }): PromiseLike<{ id: string }>;
    retrieve(id: string): PromiseLike<{
      status: string;
      sessionKey?: string;
      failure?: string;
      failureCode?: string;
    }>;
    delete(id: string): PromiseLike<void>;
  };
}

/** Browser-safe, one-time connection credentials accepted by `@runwayml/avatars` `streamTo`. */
export interface SessionCredentials {
  sessionId: string;
  sessionKey: string;
}

export class SessionError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly failureCode?: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/**
 * Decide which avatar to use. A configured custom avatar ID (server env) wins;
 * otherwise the requested preset must be one of the documented presets.
 */
export function resolveAvatar(
  requestedPreset: unknown,
  configuredAvatarId: string | undefined,
): AvatarChoice {
  const custom = configuredAvatarId?.trim();
  if (custom) {
    if (!UUID_RE.test(custom)) {
      throw new SessionError('RUNWAY_AVATAR_ID is not a valid uuid', 500);
    }
    return { type: 'custom', avatarId: custom };
  }
  if (typeof requestedPreset === 'string' && (PRESET_AVATARS as readonly string[]).includes(requestedPreset)) {
    return { type: 'runway-preset', presetId: requestedPreset as PresetAvatarId };
  }
  throw new SessionError('Unknown or missing preset avatar', 400);
}

export interface CreateSessionOptions {
  /** Max session length in seconds (API range 10-1800, default 300). */
  maxDuration?: number;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Create a realtime Session, wait until it is READY and return the one-time credentials.
 * The API secret never leaves the server; only sessionId/sessionKey go to the browser.
 */
export async function createSession(
  client: RealtimeSessionsClient,
  avatar: AvatarChoice,
  options: CreateSessionOptions = {},
): Promise<SessionCredentials> {
  const {
    maxDuration = 300,
    timeoutMs = 60_000,
    intervalMs = 1_000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
  } = options;

  const { id: sessionId } = await client.realtimeSessions.create({
    model: 'gwm1_avatars',
    avatar,
    maxDuration,
  });

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const session = await client.realtimeSessions.retrieve(sessionId);
    if (session.status === 'READY') {
      if (!session.sessionKey) throw new SessionError('Session READY without sessionKey', 502);
      return { sessionId, sessionKey: session.sessionKey };
    }
    if (TERMINAL.has(session.status)) {
      throw new SessionError(
        `Session ${session.status.toLowerCase()} before becoming ready${session.failure ? `: ${session.failure}` : ''}`,
        502,
        session.failureCode,
      );
    }
    await sleep(intervalMs);
  }

  // Do not leave an unused session queued on the account.
  await Promise.resolve(client.realtimeSessions.delete(sessionId)).catch(() => undefined);
  throw new SessionError('Session did not become ready in time', 504);
}
