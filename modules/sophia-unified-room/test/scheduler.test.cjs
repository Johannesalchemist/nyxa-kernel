'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextRun, isScheduledTickDue, triggerAllowed, zonedToUtc } = require('../src/scheduler.cjs');

const iso = t => new Date(t).toISOString();

test('DAILY 07:00 Europe/Berlin in winter (CET, UTC+1)', () => {
  const n = nextRun({ mode: 'DAILY', daily_time: '07:00', timezone: 'Europe/Berlin' }, Date.parse('2026-11-07T10:00:00Z'));
  assert.equal(iso(n), '2026-11-08T06:00:00.000Z');
});

test('DAILY 07:00 Europe/Berlin in summer (CEST, UTC+2)', () => {
  const n = nextRun({ mode: 'DAILY', daily_time: '07:00', timezone: 'Europe/Berlin' }, Date.parse('2026-07-01T03:00:00Z'));
  assert.equal(iso(n), '2026-07-01T05:00:00.000Z');
});

test('DAILY across spring-forward (2027-03-28) and fall-back (2026-10-25)', () => {
  const cfg = { mode: 'DAILY', daily_time: '07:00', timezone: 'Europe/Berlin' };
  assert.equal(iso(nextRun(cfg, Date.parse('2027-03-27T07:00:00Z'))), '2027-03-28T05:00:00.000Z');
  assert.equal(iso(nextRun(cfg, Date.parse('2026-10-24T06:00:00Z'))), '2026-10-25T06:00:00.000Z');
});

test('Non-existent local time in DST gap resolves after the gap; ambiguous time resolves to first occurrence', () => {
  assert.equal(iso(zonedToUtc(2027, 3, 28, 2, 30, 'Europe/Berlin')), '2027-03-28T01:30:00.000Z'); // = 03:30 CEST
  assert.equal(iso(zonedToUtc(2026, 10, 25, 2, 30, 'Europe/Berlin')), '2026-10-25T00:30:00.000Z'); // first 02:30 (CEST)
});

test('HOURLY aligns to local full hours, configurable interval', () => {
  assert.equal(iso(nextRun({ mode: 'HOURLY', interval_minutes: 60, timezone: 'Europe/Berlin' }, Date.parse('2026-11-07T10:17:00Z'))), '2026-11-07T11:00:00.000Z');
  assert.equal(iso(nextRun({ mode: 'HOURLY', interval_minutes: 180, timezone: 'Europe/Berlin' }, Date.parse('2026-11-07T10:17:00Z'))), '2026-11-07T11:00:00.000Z'); // 12:00 local
});

test('Missed ticks produce one catch-up, not a burst', () => {
  const cfg = { mode: 'HOURLY', interval_minutes: 60, timezone: 'Europe/Berlin' };
  const last = Date.parse('2026-11-07T05:00:00Z');
  assert.equal(isScheduledTickDue(cfg, last, Date.parse('2026-11-07T10:30:00Z')), true);
  assert.equal(isScheduledTickDue(cfg, Date.parse('2026-11-07T10:30:00Z'), Date.parse('2026-11-07T10:45:00Z')), false);
});

test('Mode/trigger matrix; unknown mode never executes', () => {
  assert.equal(triggerAllowed('DIRECT', 'direct'), true);
  assert.equal(triggerAllowed('HOURLY', 'direct'), false);
  assert.equal(triggerAllowed('DAILY', 'schedule'), true);
  assert.equal(triggerAllowed('MANUAL', 'schedule'), false);
  assert.equal(triggerAllowed('PAUSED', 'manual'), false);
  assert.equal(triggerAllowed('WHATEVER', 'direct'), false);
});
