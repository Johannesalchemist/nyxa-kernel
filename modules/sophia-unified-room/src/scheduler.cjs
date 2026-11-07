'use strict';
/**
 * Executor schedule computation (DIRECT / ON_APPROVAL / HOURLY / DAILY / MANUAL / PAUSED).
 *
 * Provenance: Claude Code for Johannes Süß, 2026-11-07 (Europe/Berlin). DRAFT, NOT DEPLOYED.
 *
 * The schedule decides only WHEN a worker may look for work. It never grants authority:
 * claim() in task-queue.cjs independently requires an effective approval.
 * Time zone handling uses Intl (IANA tz database) so DST transitions in Europe/Berlin are correct.
 */

const MODES = Object.freeze(['DIRECT', 'ON_APPROVAL', 'HOURLY', 'DAILY', 'MANUAL', 'PAUSED']);

/** Offset (ms) of `tz` at instant `ts`: local wall clock − UTC. */
function tzOffsetMs(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Local calendar parts of an instant in tz. */
function localParts(ts, tz) {
  const off = tzOffsetMs(ts, tz);
  const d = new Date(ts + off);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}

/**
 * UTC instant for a local wall-clock time. Non-existent local times (spring-forward gap)
 * resolve to the first valid instant after the gap; ambiguous times (fall-back) resolve to the first occurrence.
 */
function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offBefore = tzOffsetMs(guess - 12 * 3600_000, tz);
  const offAfter = tzOffsetMs(guess + 12 * 3600_000, tz);
  const matches = [...new Set([guess - offBefore, guess - offAfter])]
    .filter(t => { const lp = localParts(t, tz); return lp.y === y && lp.m === m && lp.d === d && lp.hh === hh && lp.mm === mm; })
    .sort((a, b) => a - b);
  if (matches.length) return matches[0];
  // Wall-clock time falls into a DST gap: applying the pre-transition offset lands just after the gap.
  return guess - offBefore;
}

function parseDailyTime(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s));
  if (!m) throw new Error('daily_time must be HH:MM');
  return { hh: +m[1], mm: +m[2] };
}

/**
 * Next pickup instant strictly after `fromTs` (ms) for a config, or null if the mode has no automatic pickup.
 */
function nextRun(config, fromTs) {
  const tz = config.timezone || 'Europe/Berlin';
  switch (config.mode) {
    case 'HOURLY': {
      const step = Math.max(1, config.interval_minutes || 60) * 60_000;
      // Anchor at local midnight so "every 60 minutes" means at :00 local time, also across DST.
      const lp = localParts(fromTs, tz);
      const midnight = zonedToUtc(lp.y, lp.m, lp.d, 0, 0, tz);
      const n = Math.floor((fromTs - midnight) / step) + 1;
      return midnight + n * step;
    }
    case 'DAILY': {
      const { hh, mm } = parseDailyTime(config.daily_time || '07:00');
      const lp = localParts(fromTs, tz);
      let t = zonedToUtc(lp.y, lp.m, lp.d, hh, mm, tz);
      if (t <= fromTs) {
        const nd = new Date(Date.UTC(lp.y, lp.m - 1, lp.d + 1));
        t = zonedToUtc(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), hh, mm, tz);
      }
      return t;
    }
    default:
      return null;
  }
}

/**
 * Whether a scheduled tick at `nowTs` is due given the last tick `lastTickTs`.
 * Missed ticks (process was down) produce exactly one catch-up tick, not a burst.
 */
function isScheduledTickDue(config, lastTickTs, nowTs) {
  if (config.mode !== 'HOURLY' && config.mode !== 'DAILY') return false;
  if (lastTickTs == null) return true;
  const n = nextRun(config, lastTickTs);
  return n != null && n <= nowTs;
}

/** Which triggers a mode accepts. Approval is checked separately and always. */
function triggerAllowed(mode, trigger) {
  switch (mode) {
    case 'DIRECT': return trigger === 'direct' || trigger === 'manual';
    case 'ON_APPROVAL': return trigger === 'approval' || trigger === 'direct' || trigger === 'manual';
    case 'HOURLY':
    case 'DAILY': return trigger === 'schedule' || trigger === 'manual';
    case 'MANUAL': return trigger === 'manual';
    case 'PAUSED': return false;
    default: return false; // unknown mode → no execution
  }
}

module.exports = { MODES, nextRun, isScheduledTickDue, triggerAllowed, zonedToUtc, localParts, tzOffsetMs };
