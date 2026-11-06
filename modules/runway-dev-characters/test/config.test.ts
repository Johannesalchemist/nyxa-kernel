/** Configuration defaults are fail-closed (MOCK level: pure function). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig } from '../src/config.ts';

test('defaults: loopback bind, budget 0, no capability, 1 parallel session, 120 s', () => {
  const c = loadConfig({}, '/tmp');
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.budgetCredits, 0);
  assert.deepEqual(c.grantedCapabilities, []);
  assert.equal(c.maxConcurrentSessions, 1);
  assert.equal(c.maxDurationS, 120);
  assert.equal(c.accessToken, undefined);
  assert.equal(c.deleteConversationAfterEnd, false);
  assert.ok(c.escalationContexts.includes('pilot:schule-in-der-hosentasche'));
});

test('non-loopback bind requires explicit opt-in AND an access token', () => {
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), ConfigError);
  assert.throws(() => loadConfig({ HOST: '0.0.0.0', ALLOW_REMOTE_BIND: 'true' }), ConfigError);
  const c = loadConfig({ HOST: '0.0.0.0', ALLOW_REMOTE_BIND: 'true', NYXA_ACCESS_TOKEN: 'x'.repeat(32) });
  assert.equal(c.host, '0.0.0.0');
});

test('weak token, malformed numbers and out-of-range durations are rejected', () => {
  assert.throws(() => loadConfig({ NYXA_ACCESS_TOKEN: 'short' }), ConfigError);
  assert.throws(() => loadConfig({ RUNWAY_BUDGET_CREDITS: '-5' }), ConfigError);
  assert.throws(() => loadConfig({ RUNWAY_BUDGET_CREDITS: '1e9' }), ConfigError);
  assert.throws(() => loadConfig({ RUNWAY_MAX_DURATION_S: '1801' }), ConfigError);
  assert.throws(() => loadConfig({ RUNWAY_MAX_DURATION_S: '5' }), ConfigError);
  assert.throws(() => loadConfig({ ALLOW_REMOTE_BIND: 'yes' }), ConfigError);
});

test('ALLOWED_PRESETS cannot add undocumented presets', () => {
  const c = loadConfig({ ALLOWED_PRESETS: 'influencer,evil-preset' });
  assert.deepEqual(c.allowedPresets, ['influencer']);
});
