/**
 * Development access control.
 *
 * - The operator sets NYXA_ACCESS_TOKEN (>= 32 chars) in the server environment.
 * - The browser exchanges it ONCE via POST /api/auth/login for an HttpOnly,
 *   SameSite=Strict cookie bound to a random server-side auth session with a TTL.
 *   The token itself is never stored by the page.
 * - Without NYXA_ACCESS_TOKEN every protected route answers 503 (fail closed).
 * - Host header allowlist (DNS rebinding) and Origin check (cross-site requests)
 *   run before authentication on every /api route.
 *
 * Status: V0.2 DRAFT. Single operator; no user accounts, no roles.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from './config.ts';
import type { AuditSink } from './audit.ts';
import { SlidingWindowLimiter } from './rateLimit.ts';

export const COOKIE_NAME = 'nyxa_rw_auth';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export class AuthService {
  private readonly sessions = new Map<string, number>(); // sha256(sessionId) hex -> expiresAt
  private readonly loginLimiter: SlidingWindowLimiter;

  constructor(
    private readonly config: AppConfig,
    private readonly audit: AuditSink,
    private readonly now: () => number = Date.now,
  ) {
    this.loginLimiter = new SlidingWindowLimiter(config.loginLimit, config.loginWindowMs, now);
  }

  allowedHosts(): Set<string> {
    const port = this.config.port;
    const base = ['localhost', '127.0.0.1', '[::1]'];
    const hosts = new Set<string>(this.config.allowedHosts);
    for (const h of base) {
      hosts.add(h);
      hosts.add(`${h}:${port}`);
    }
    return hosts;
  }

  /** Host allowlist + same-origin check for state-changing requests. */
  originGuard = (req: Request, res: Response, next: NextFunction): void => {
    const host = req.headers.host ?? '';
    const allowed = this.allowedHosts();
    if (!allowed.has(host)) {
      this.audit.record({ action: 'http.guard', outcome: 'DENY', reason: 'host_not_allowed' });
      res.status(421).json({ error: 'Host not allowed', code: 'host_not_allowed' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin !== undefined) {
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch {
          originHost = '';
        }
        if (!allowed.has(originHost)) {
          this.audit.record({ action: 'http.guard', outcome: 'DENY', reason: 'origin_not_allowed' });
          res.status(403).json({ error: 'Origin not allowed', code: 'origin_not_allowed' });
          return;
        }
      }
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'Content-Type must be application/json', code: 'unsupported_media_type' });
        return;
      }
    }
    next();
  };

  login = (req: Request, res: Response): void => {
    if (!this.config.accessToken) {
      res.status(503).json({ error: 'Access control not configured (NYXA_ACCESS_TOKEN)', code: 'auth_not_configured' });
      return;
    }
    if (!this.loginLimiter.tryAcquire('global')) {
      this.audit.record({ action: 'auth.login', outcome: 'DENY', reason: 'rate_limited' });
      res.status(429).json({ error: 'Too many login attempts', code: 'rate_limited' });
      return;
    }
    const supplied = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof supplied !== 'string' || !constantTimeEquals(supplied, this.config.accessToken)) {
      this.audit.record({ action: 'auth.login', outcome: 'DENY', reason: 'invalid_token' });
      res.status(401).json({ error: 'Invalid access token', code: 'unauthenticated' });
      return;
    }
    const id = randomBytes(32).toString('base64url');
    const expiresAt = this.now() + this.config.authSessionTtlMs;
    this.sessions.set(digest(id).toString('hex'), expiresAt);
    const maxAge = Math.floor(this.config.authSessionTtlMs / 1000);
    const secure = this.config.cookieSecure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${secure}`);
    this.audit.record({ action: 'auth.login', outcome: 'ALLOW', reason: 'token_valid' });
    res.json({ ok: true, expiresInS: maxAge });
  };

  logout = (req: Request, res: Response): void => {
    const id = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (id) this.sessions.delete(digest(id).toString('hex'));
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
    res.json({ ok: true });
  };

  isAuthenticated(req: Request): boolean {
    const id = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!id) return false;
    const key = digest(id).toString('hex');
    const expiresAt = this.sessions.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt <= this.now()) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }

  requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!this.config.accessToken) {
      res.status(503).json({ error: 'Access control not configured (NYXA_ACCESS_TOKEN)', code: 'auth_not_configured' });
      return;
    }
    if (!this.isAuthenticated(req)) {
      this.audit.record({ action: 'http.auth', outcome: 'DENY', reason: 'unauthenticated', path: req.path });
      res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
      return;
    }
    next();
  };
}
