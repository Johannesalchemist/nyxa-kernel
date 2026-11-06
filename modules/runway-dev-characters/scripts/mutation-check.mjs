#!/usr/bin/env node
// Enforcement evidence: each mutation removes ONE safety mechanism in a scratch copy of the
// module. The test suite must FAIL for every mutation ("killed"). A surviving mutation means
// the corresponding control is not actually proven by the tests. Never touches the working tree.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const MUTATIONS = [
  ['M01 budget check removed', 'src/controller.ts', 'if (committed + reserve > config.budgetCredits) {', 'if (false) {'],
  ['M02 concurrency check removed', 'src/controller.ts', 'if (open >= config.maxConcurrentSessions) {', 'if (false) {'],
  ['M03 rate limit removed', 'src/controller.ts', "if (!this.createLimiter.tryAcquire('global')) {", 'if (false) {'],
  ['M04 replay check removed', 'src/controller.ts', 'if (this.inFlight.has(requestId) || ledger.find((r) => r.requestId === requestId)) {', 'if (false) {'],
  ['M05 ESCALATE treated as allow', 'src/controller.ts', "if (decision.disposition !== 'ALLOW') {", "if (decision.disposition === 'DENY') {"],
  ['M06 auth middleware bypassed', 'src/auth.ts', 'if (!this.isAuthenticated(req)) {', 'if (false) {'],
  ['M07 origin guard bypassed', 'src/auth.ts', 'if (!allowed.has(originHost)) {', 'if (false) {'],
  ['M08 host guard bypassed', 'src/auth.ts', 'if (!allowed.has(host)) {', 'if (false) {'],
  ['M09 cancel on provisioning failure removed', 'src/session.ts', '    await cancelRemote(client, sessionId);\n    if (error instanceof SessionError) throw error;', '    if (error instanceof SessionError) throw error;'],
  ['M10 heartbeat timeout removed', 'src/controller.ts', "else if (record.state === 'active' && t - (record.lastHeartbeatAt ?? 0) > config.heartbeatTimeoutMs) reason = 'heartbeat_lost';", ''],
  ['M11 connect grace removed', 'src/controller.ts', "else if (record.state === 'ready' && t - (record.readyAt ?? record.createdAt) > config.connectGraceMs) reason = 'connect_timeout';", ''],
  ['M12 restart recovery disabled', 'src/controller.ts', "await this.endRecord(record, 'server_restart');", ''],
  ['M13 control token not checked', 'src/controller.ts', 'if (!record || !tokenMatches(record, controlToken)) {', 'if (!record) {'],
  ['M14 end not idempotent (no dedupe)', 'src/controller.ts', "if (record.state === 'ended') return Promise.resolve('already_ended');", ''],
  ['M15 ledger not persisted', 'src/store.ts', 'renameSync(tmp, this.file);', 'unlinkSync(tmp);'],
  ['M16 audit redaction disabled', 'src/audit.ts', 'if (FORBIDDEN_KEYS.test(k)) continue;', ''],
  ['M17 abort signal ignored during polling', 'src/session.ts', "      if (signal?.aborted) throw new SessionError('Client aborted during provisioning', 499, 'client_aborted');\n      const session", '      const session'],
  ['M18 unmanaged sessions cancelled (authority overreach)', 'src/controller.ts', 'for (const id of unmanaged) {', "for (const id of unmanaged) { await this.deps.client().realtimeSessions.delete(id);"],
  ['M19 lock ignores live process', 'src/store.ts', 'if (Number.isInteger(other) && other > 0 && other !== pid && isAlive(other)) {', 'if (false) {'],
  ['M20 allowlist not enforced', 'src/session.ts', '    allowedPresets.includes(requestedPreset)\n', '    true\n'],
];

let survived = 0;
for (const [name, file, from, to] of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'nyxa-mut-'));
  try {
    for (const p of ['src', 'test', 'tsconfig.json', 'package.json']) cpSync(join(root, p), join(dir, p), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    const target = join(dir, file);
    const before = readFileSync(target, 'utf8');
    if (!before.includes(from)) {
      console.log(`ERROR ${name}: anchor not found in ${file}`);
      survived++;
      continue;
    }
    writeFileSync(target, before.replace(from, to));
    const glob = spawnSync('sh', ['-c', 'node --import tsx --test test/*.test.ts'], { cwd: dir, encoding: 'utf8' });
    const failed = (glob.stdout.match(/^# fail (\d+)/m) ?? [])[1];
    const killed = glob.status !== 0;
    if (!killed) survived++;
    console.log(`${killed ? 'KILLED  ' : 'SURVIVED'} ${name} (failing tests: ${failed ?? '?'})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`mutation-check: ${MUTATIONS.length} mutations, ${MUTATIONS.length - survived} killed, ${survived} survived`);
process.exit(survived ? 1 : 0);
