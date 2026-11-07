'use strict';
/** Runtime records must conform to schemas/unified-room/v0.1; the negative fixture must be rejected. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, HUMAN, configureClaude, submitAnalysis } = require('./helpers.cjs');

const DIR = path.join(__dirname, '../../../schemas/unified-room/v0.1');
const load = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

/** Minimal validator for the subset used by these schemas (type, required, enum, pattern, minLength, minItems, properties). */
function validate(schema, v, at = '$') {
  const errs = [];
  const types = schema.type ? [].concat(schema.type) : null;
  const typeOf = x => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  if (types && !types.some(t => t === typeOf(v) || (t === 'number' && typeof v === 'number'))) return [`${at}: type ${typeOf(v)} not in ${types}`];
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${at}: ${JSON.stringify(v)} not in enum`);
  if (typeof v === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) errs.push(`${at}: pattern`);
    if (schema.minLength && v.length < schema.minLength) errs.push(`${at}: minLength`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems && v.length < schema.minItems) errs.push(`${at}: minItems`);
    if (schema.items) v.forEach((x, i) => errs.push(...validate(schema.items, x, `${at}[${i}]`)));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const r of schema.required || []) if (!(r in v)) errs.push(`${at}: missing ${r}`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in v && v[k] !== undefined) errs.push(...validate(s, v[k], `${at}.${k}`));
    if (schema.additionalProperties === false) for (const k of Object.keys(v)) if (!(k in (schema.properties || {}))) errs.push(`${at}: additional ${k}`);
  }
  return errs;
}

test('Runtime task, message and executor config conform to the V0.1 schemas', () => {
  const { bus, queue } = setup();
  const cfg = configureClaude(queue);
  const t = submitAnalysis(queue, bus);
  const m = bus.post(HUMAN, { conversation_id: 'c', channel: 'text', text: 'x' });
  const { updated_by, updated_at, ...cfgPublic } = cfg;
  assert.deepEqual(validate(load('task.schema.json'), t), []);
  assert.deepEqual(validate(load('message.schema.json'), m), []);
  assert.deepEqual(validate(load('executor-config.schema.json'), cfgPublic), []);
});

test('Negative fixture is rejected for the expected reasons', () => {
  const errs = validate(load('task.schema.json'), load('fixtures/task.invalid.json'));
  for (const e of ['missing scope_hash', '$.task_id: pattern', '$.status', '$.execution_mode', '$.idempotency_key: minLength', '$.scope.allowed_operations: minItems']) {
    assert.ok(errs.some(x => x.includes(e)), 'expected error ' + e + ' in ' + errs.join(' | '));
  }
});
