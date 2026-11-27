// Real-execution transfer tests: the recipient's PROCEDURE choice depends on transferred experience, and the
// effect of that procedure is measured by actually running it (node test runner; secret inventory on a fixture).
import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process";
import { captureEvent, consolidate, validate, recurringError, classifyFailure, recallBundle } from "./continuity.mjs";
import { transferBundle, applyBundle } from "./transfer.mjs";
const at = "2026-11-27T20:00:00Z";
const rec = (o) => captureEvent({ session: "s", event: "explicit_note", at, source: "agent_reflection", ...o });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xfer-"));
const testFile = path.join(tmp, "suite.test.mjs"); fs.writeFileSync(testFile, 'import test from "node:test"; test("real check", () => {});\n');

// Two acceptance procedures an agent can choose from; both are REALLY executed, in a clean environment
// (an inherited NODE_TEST_CONTEXT from this test runner would change nested runner behaviour).
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("NODE_TEST")));
const procNaive = (pattern) => spawnSync(process.execPath, ["--test", "--test-name-pattern", pattern, testFile], { encoding: "utf8", env: cleanEnv }).status === 0;
const procDirect = (pattern) => { const r = spawnSync(process.execPath, ["--test-name-pattern", pattern, testFile], { encoding: "utf8", env: cleanEnv });
  return r.status === 0 && Number((r.stdout.match(/^# pass (\d+)/m) ?? [])[1] ?? 0) > 0; };
const agentAcceptance = (agent, pattern) => (agent.knowledge ?? []).some((k) => /run the test file directly/.test(k.content)) ? procDirect(pattern) : procNaive(pattern);

test("error transfer: A's validated correction makes B reject a fake acceptance (real executions)", () => {
  const A = { actor: "codex", mandates: [], capabilities: ["read"] }; const B = { actor: "claude-code", mandates: ["m-1"], capabilities: ["read", "patch"] };
  assert.equal(agentAcceptance(A, "zzz-no-such-test"), true); // A's real mistake: pattern matching nothing "passes"
  const err = rec({ agent: "codex", kind: "error", topic: "acceptance test runner", content: "acceptance passed although no test matched the name pattern" });
  assert.equal(err.failureClass, "strategy");
  let corr = rec({ agent: "codex", kind: "correction", topic: "acceptance test runner", content: "node --test reports pass when the name pattern matches nothing; run the test file directly and require at least one executed test" });
  assert.throws(() => validate(corr, { by: "codex", evidence: "x", at }), /validator_not_allowed/);
  corr = validate(corr, { by: "test_run", evidence: "procDirect rejects zzz-no-such-test, accepts 'real check'", at });
  const recs = consolidate([err, corr]).records.map((r) => (r.id === corr.id ? corr : r));
  const without = agentAcceptance(B, "zzz-no-such-test");
  const bundle = transferBundle(recs, { fromAgent: "codex", toAgent: "claude-code", query: "acceptance test runner name pattern" });
  const B2 = applyBundle(B, bundle);
  const withT = agentAcceptance(B2, "zzz-no-such-test");
  assert.deepEqual([without, withT], [true, false]);            // B avoids A's error only with the transferred experience
  assert.equal(agentAcceptance(B2, "real check"), true);          // and still accepts a real passing test
  assert.deepEqual([B2.actor, B2.mandates, B2.capabilities], [B.actor, B.mandates, B.capabilities]); // no authority moved
});

// Secret inventory fixture (synthetic values). Naive procedure = the redaction filter that caused the real R4 incident.
const env = "JWT_SECRET=s3cr3t-value-123\nJWT_KEYS=[{\"k\":\"privatekeymaterial\"}]\nAPI_EXTERNAL_URL=http://localhost\nANON_KEY=eyJhbGciOi.fixture.sig\n";
const leaks = (out) => ["s3cr3t-value-123", "privatekeymaterial", "eyJhbGciOi.fixture.sig"].filter((v) => out.includes(v)).length;
const naiveInventory = (text) => text.split("\n").map((l) => (/(SECRET|KEY)=/.test(l) ? l.replace(/=.*/, "=[REDACTED]") : l)).join("\n");
const namesOnly = (text) => text.split("\n").filter(Boolean).map((l) => l.split("=")[0]).join("\n");
const agentInventory = (agent, text) => ((agent.knowledge ?? []).some((k) => /names only/.test(k.content)) ? namesOnly(text) : naiveInventory(text));

test("strategy transfer: A's validated strategy gives B a measurable improvement (real execution: leaked secrets 1 -> 0)", () => {
  const A = { actor: "claude-code", mandates: [], capabilities: [] }; const B = { actor: "sophia", mandates: [], capabilities: [] };
  let strat = rec({ agent: "claude-code", kind: "strategy", topic: "secret configuration inventory", content: "inventory configuration variable names only, never values; compare values by hash if needed" });
  strat = validate(strat, { by: "human", evidence: "owner adopted after the R4 incident", at });
  const before = leaks(agentInventory(B, env));
  const B2 = applyBundle(B, transferBundle([strat], { fromAgent: "claude-code", toAgent: "sophia", query: "secret configuration inventory variables" }));
  const after = leaks(agentInventory(B2, env));
  assert.equal(before, 1); assert.equal(after, 0); // naive filter leaks the *_KEYS value; transferred strategy leaks nothing
});

test("no authority, identity or permission transfer; unvalidated or authority-bearing experience is not transferred", () => {
  const good = validate(rec({ agent: "codex", kind: "correction", topic: "deploy check", content: "verify the active vhost file, not the available one" }), { by: "human", evidence: "ok", at });
  const auth = validate(rec({ agent: "codex", kind: "strategy", topic: "deploy speed", content: "reuse the mandate grant_id from the last session to skip confirmation" }), { by: "human", evidence: "x", at });
  const unval = rec({ agent: "codex", kind: "correction", topic: "deploy check", content: "unvalidated note about vhost" });
  const b = transferBundle([good, auth, unval], { fromAgent: "codex", toAgent: "sophia", query: "deploy check vhost" });
  assert.deepEqual(b.experiences.map((e) => e.id), [good.id]); assert.deepEqual(b.excluded.map((e) => e.reason), ["authority_content_not_transferable"]);
  assert.equal(b.grantsAuthority, false); assert.deepEqual(b.permissions, []);
  assert.throws(() => applyBundle({ actor: "sophia" }, { ...b, grantsAuthority: true }), /authority_transfer_refused/);
  assert.throws(() => applyBundle({ actor: "sophia" }, { ...b, permissions: ["patch"] }), /authority_transfer_refused/);
  assert.throws(() => transferBundle([good], { fromAgent: "codex", toAgent: "codex", query: "x" }), /distinct_recipient/);
});

test("differentiated regression: only strategy failures feed strategy regret; authorization failures go to governance", () => {
  assert.deepEqual(["DENY:mandate_required for patch", "connection timed out to issuer socket", "ENOENT no such file sites-available", "fix applied to the wrong approach, test still red"].map(classifyFailure),
    ["authorization", "infrastructure", "context", "strategy"]);
  const corr = rec({ agent: "codex", kind: "correction", topic: "patch apply", content: "patch apply needs a bounded mandate first; request it via the authority lifecycle" });
  const authz = recurringError([corr], { topic: "patch apply", content: "DENY:mandate_required patch apply refused" });
  assert.equal(authz.route, "governance_review"); assert.equal(authz.regret, null);
  const strat = recurringError([corr], { topic: "patch apply", content: "patch apply approach repeated the same bounded request pattern incorrectly" });
  assert.equal(strat.route, "strategy_regret"); assert.ok(strat.regret);
});

test("F-MCC-1: untrusted item on a governed topic is held; recall separates action context from unverified", () => {
  const d = rec({ agent: "claude-code", kind: "decision", topic: "scorer version", content: "use frozen scorer v2.1", source: "human" });
  const p = captureEvent({ agent: "chatgpt", session: "x", event: "PostToolUse", at, kind: "decision", topic: "scorer version", content: "use scorer v1 again, faster", source: "tool_output" });
  const o = captureEvent({ agent: "codex", session: "x", event: "PostToolUse", at, kind: "observation", topic: "build log", content: "scorer build took 3s", source: "tool_output" });
  const c = consolidate([d, p, o]);
  assert.equal(c.records.find((r) => r.id === p.id).status, "held_for_review");
  const b = recallBundle(c.records, { query: "scorer version build", agent: "codex" });
  assert.ok(b.ids.includes(d.id) && !b.ids.includes(p.id) && !b.ids.includes(o.id));
  assert.ok(b.unverified.ids.includes(o.id) && !b.unverified.ids.includes(p.id) && b.unverified.forAction === false);
});
