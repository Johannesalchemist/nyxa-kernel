/**
 * Express application factory. All dependencies are injected so the HTTP layer can be
 * tested end to end against a mock Runway client (no network, no credits).
 * Status: V0.2 DRAFT, see ../MODULE.md.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from './config.ts';
import type { AuditSink } from './audit.ts';
import type { AuthService } from './auth.ts';
import type { SessionController } from './controller.ts';
import { SessionError } from './session.ts';

export interface AppDeps {
  config: AppConfig;
  controller: SessionController;
  auth: AuthService;
  audit: AuditSink;
  staticDir?: string;
  /** Diagnostic logger; receives only codes and names, never request bodies or error objects. */
  log?: (message: string) => void;
}

export function createApp(deps: AppDeps) {
  const { config, controller, auth } = deps;
  const log = deps.log ?? ((m: string) => console.error(m));
  const app = express();
  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
    next();
  });

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(auth.originGuard);
  api.use(express.json({ limit: '4kb' }));

  api.get('/avatar/config', (_req, res) => {
    res.json({
      customAvatarConfigured: Boolean(config.customAvatarId),
      presets: config.allowedPresets,
      apiKeyConfigured: config.apiKeyConfigured,
      authConfigured: Boolean(config.accessToken),
      maxDurationS: config.maxDurationS,
    });
  });

  api.post('/auth/login', auth.login);
  api.post('/auth/logout', auth.logout);
  api.get('/auth/me', (req, res) => {
    res.json({ authenticated: auth.isAuthenticated(req) });
  });

  api.get('/avatar/status', auth.requireAuth, (_req, res) => {
    res.json(controller.status());
  });

  api.post('/avatar/connect', auth.requireAuth, async (req, res, next) => {
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      const result = await controller.connect({
        requestId: req.get('Idempotency-Key'),
        presetId: (req.body as { presetId?: unknown } | undefined)?.presetId,
        signal: abort.signal,
      });
      if (abort.signal.aborted) {
        // Client went away after READY: do not leave the session billing.
        await controller.end(result.sessionId, result.controlToken, 'client_aborted_after_ready');
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  api.post('/avatar/sessions/:id/heartbeat', auth.requireAuth, (req, res, next) => {
    try {
      res.json(controller.heartbeat(req.params.id, req.get('X-Session-Control')));
    } catch (error) {
      next(error);
    }
  });

  api.post('/avatar/sessions/:id/end', auth.requireAuth, async (req, res, next) => {
    try {
      const reason = (req.body as { reason?: unknown } | undefined)?.reason;
      const safeReason = typeof reason === 'string' && /^[a-z_]{1,40}$/.test(reason) ? `client:${reason}` : 'client_end';
      const status = await controller.end(req.params.id, req.get('X-Session-Control'), safeReason);
      res.status(status === 'ending' ? 202 : 200).json({ status });
    } catch (error) {
      next(error);
    }
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'not_found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof SessionError) {
      log(`session error: ${error.code}${error.failureCode ? ` (${error.failureCode})` : ''}`);
      if (!res.headersSent && !res.writableEnded) {
        res.status(error.httpStatus).json({ error: error.message, code: error.code, failureCode: error.failureCode });
      }
      return;
    }
    const status = (error as { status?: unknown; type?: unknown })?.status;
    const type = (error as { type?: unknown })?.type;
    if (type === 'entity.parse.failed' || type === 'entity.too.large') {
      res.status(typeof status === 'number' ? status : 400).json({ error: 'Invalid request body', code: 'invalid_body' });
      return;
    }
    log(`unexpected error: ${(error as Error)?.name ?? 'unknown'}`);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error', code: 'internal_error' });
  });

  app.use('/api', api);
  if (deps.staticDir) app.use(express.static(deps.staticDir, { index: 'index.html' }));
  return app;
}
