/**
 * Bootstrap for the Runway Characters demo server (V0.2 DRAFT, see MODULE.md).
 * Fail-closed: invalid configuration or a locked state directory stops the process.
 */
import RunwayML from '@runwayml/sdk';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.ts';
import { FileAuditSink } from './src/audit.ts';
import { AuthService } from './src/auth.ts';
import { loadConfig, type AppConfig } from './src/config.ts';
import { SessionController } from './src/controller.ts';
import { StaticPolicyGate } from './src/policy.ts';
import { SessionError, type RunwayClient } from './src/session.ts';
import { Ledger } from './src/store.ts';

const baseDir = fileURLToPath(new URL('.', import.meta.url));

let config: AppConfig;
try {
  config = loadConfig(process.env, baseDir);
} catch (error) {
  console.error(`Configuration error: ${(error as Error).message}`);
  process.exit(1);
}

const ledger = new Ledger(config.stateDir);
ledger.acquireLock();
const audit = new FileAuditSink(config.stateDir);

// Created lazily so the page can be served without a key; the SDK reads RUNWAYML_API_SECRET.
let runway: RunwayML | undefined;
function client(): RunwayClient {
  if (!config.apiKeyConfigured) throw new SessionError('RUNWAYML_API_SECRET is not set', 503, 'runway_not_configured');
  return (runway ??= new RunwayML({ maxRetries: 1, timeout: 20_000 })) as unknown as RunwayClient;
}

const controller = new SessionController({
  client,
  config,
  ledger,
  audit,
  gate: new StaticPolicyGate(config.grantedCapabilities, config.escalationContexts),
});
const auth = new AuthService(config, audit);
const app = createApp({
  config,
  controller,
  auth,
  audit,
  staticDir: fileURLToPath(new URL('./dist', import.meta.url)),
});

if (config.apiKeyConfigured) {
  const { cancelled, unmanaged } = await controller.recover();
  if (cancelled.length) console.error(`Recovery: ended ${cancelled.length} session(s) left open by a previous run.`);
  if (unmanaged.length) console.error(`Recovery: ${unmanaged.length} in-progress session(s) not managed by this server (reported, not touched).`);
} else if (ledger.open().length) {
  console.error('Recovery pending: open sessions in the ledger, but no RUNWAYML_API_SECRET to cancel them.');
}

const reaper = setInterval(() => {
  controller.reap().catch(() => console.error('reaper pass failed'));
}, config.reaperIntervalMs);
reaper.unref();

const server = app.listen(config.port, config.host, () => {
  const s = controller.status();
  console.error(
    `Runway Characters demo on http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${config.port} ` +
      `(auth ${config.accessToken ? 'on' : 'NOT CONFIGURED'}, budget ${s.remainingCredits}/${s.budgetCredits} credits, ` +
      `max ${config.maxConcurrentSessions} parallel, ${config.maxDurationS}s per session)`,
  );
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`${signal}: ending open sessions before exit`);
  clearInterval(reaper);
  server.close();
  try {
    if (config.apiKeyConfigured) await controller.recover();
  } finally {
    ledger.releaseLock();
    process.exit(0);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
