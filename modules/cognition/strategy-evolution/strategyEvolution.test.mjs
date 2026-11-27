import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "./strategyEvolution.mjs";

const exp = [
  { tag: "MEMORY", statement: "Task 41: verifying assumptions against live code before planning avoided a wrong fix", source: "room_memory:41" },
  { tag: "MEMORY", statement: "Task 57: skipping the live check led to a stale-handoff error", source: "room_memory:57" },
];
const base = () => S.createCandidate({ id: "strat-verify-before-plan", title: "Verify live state before planning", kind: "problem_solving",
  author: "claude", reflectionRef: "reflection:2026-11-27:1", experiences: exp,
  procedure: "Before planning, re-read the live artifact the plan depends on and diff it against the handoff.",
  context: { domains: ["ops"], task_types: ["fix"] }, preconditions: ["read access"], limits: ["not for time-critical incidents"],
  successCriteria: [{ metric: "holdout_gain", comparator: ">=", threshold: 0.05 }], uncertainty: 0.4,
  components: ["reread", "diff"] });
// Shadow runner: strategy helps on 'fix' tasks only if both components are present; neutral on 'design'.
const run = (helpOnTransfer = 0) => async (t, cfg) => {
  let s = t.base; if (!cfg) return s;
  const comps = ["reread", "diff"].filter((c) => c !== cfg.without);
  if (t.type === "fix") s += 0.05 * comps.length; else s += helpOnTransfer;
  return Math.min(1, s);
};
const tasks = [...Array.from({ length: 20 }, (_, i) => ({ id: "f" + i, type: "fix", base: 0.5 + (i % 5) * 0.05 })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: "d" + i, type: "design", base: 0.6 }))];

test("full cycle: candidate -> shadow -> independent evaluation -> proposal -> governed adoption -> observation -> revision", async () => {
  let s = S.transition(base(), "simulated");
  const r = await S.shadowEvaluate(s, { tasks, run: run(0), evaluator: "independent-evaluator", seed: 7, transferType: "design" });
  assert.equal(r.evaluation.recommendation, "propose_adoption", JSON.stringify(r.evaluation.reasons));
  assert.equal(r.evaluation.sizes.transfer, 6); assert.ok(r.evaluation.gain >= 0.05);
  assert.deepEqual(r.evaluation.necessary, { reread: true, diff: true }, "ablations show both components matter");
  const p = S.adoptionProposal(r.strategy, { actor: "claude", taskId: "t", runId: "r", asOf: "2026-11-27T00:00:00Z" });
  assert.equal(p.action, "nyxa_memory_store_candidate"); assert.equal(p.target, "memory:/candidate");
  assert.equal(p.payload.candidate_type, "process_pattern"); assert.ok(p.payload.content.includes(s.digest)); assert.deepEqual(Object.keys(p.payload).sort(), ["candidate_type", "confidence", "content", "importance", "purpose", "scope", "source"]); assert.equal(p.payload.source, "agent");
  assert.ok(p.claims.every((c) => S.SRM_TAGS.includes(c.tag) && c.statement && c.source), "SRM-shaped claims");
  s = S.transition(r.strategy, "adoption_proposed");
  s = S.recordAdoption(s, { gamma: "ALLOW", humanGrantId: "hg-1", strategyDigest: s.digest, decidedBy: "johannes" });
  assert.equal(s.status, "adopted");
  const o = S.observe(s, { observedScores: [0.4, 0.45], baselineHoldout: 0.6 });
  assert.equal(o.alert.kind, "revision_required"); assert.equal(o.strategy.status, "adopted", "observation never self-revokes");
  const { old, next } = S.revise(s, { procedure: "Re-read live artifact; skip diff for single-file changes." }, { counterexample: { ref: "obs:1", open: false } });
  assert.equal(old.status, "revised"); assert.equal(next.version, 2); assert.equal(next.status, "candidate"); assert.notEqual(next.digest, s.digest);
});

test("adversarial: self-evaluation, self-adoption, adoption without gamma/grant, digest swap", async () => {
  const s = S.transition(base(), "simulated");
  await assert.rejects(S.shadowEvaluate(s, { tasks, run: run(), evaluator: "claude", seed: 1, transferType: "design" }), /self_evaluation/);
  const r = await S.shadowEvaluate(s, { tasks, run: run(), evaluator: "independent-evaluator", seed: 1, transferType: "design" });
  const ap = S.transition(r.strategy, "adoption_proposed");
  assert.throws(() => S.recordAdoption(ap, { gamma: "ESCALATE", humanGrantId: "x", strategyDigest: ap.digest, decidedBy: "johannes" }), /gamma_not_allow/);
  assert.throws(() => S.recordAdoption(ap, { gamma: "ALLOW", strategyDigest: ap.digest, decidedBy: "johannes" }), /human_grant_required/);
  assert.throws(() => S.recordAdoption(ap, { gamma: "ALLOW", humanGrantId: "x", strategyDigest: "0".repeat(64), decidedBy: "johannes" }), /digest_mismatch/);
  assert.throws(() => S.recordAdoption(ap, { gamma: "ALLOW", humanGrantId: "x", strategyDigest: ap.digest, decidedBy: "claude" }), /self_adoption/);
  assert.throws(() => S.transition(base(), "adopted"), /transition_candidate_to_adopted/, "no skipping evaluation");
});

test("adversarial: strategies may not touch authority (budget, mandate, scope, criteria)", () => {
  for (const procedure of ["Raise max_executions to 100 when tests pass", "Derive a mandate with wider scope_prefix", "Lower the success_criteria_override to 0"]) {
    assert.throws(() => S.createCandidate({ ...baseArgs(), procedure }), /strategy_touches_authority/, procedure);
  }
});
function baseArgs() { return { id: "strat-x-y-z", title: "t", kind: "decision", author: "claude", reflectionRef: "r", experiences: exp,
  procedure: "p", context: {}, preconditions: [], limits: ["l"], successCriteria: [{ metric: "m", comparator: ">=", threshold: 0.1 }], uncertainty: 0.5 }; }

test("evaluation rejects: transfer regression, open counterexample, insufficient provenance", async () => {
  const s = S.transition(base(), "simulated");
  const r = await S.shadowEvaluate(s, { tasks, run: run(-0.1), evaluator: "independent-evaluator", seed: 3, transferType: "design" });
  assert.ok(r.evaluation.reasons.includes("transfer_regression"));
  assert.throws(() => S.adoptionProposal(r.strategy, { actor: "claude", taskId: "t", runId: "r" }), /does_not_support_adoption/);
  const c = S.transition({ ...base(), counterexamples: [{ ref: "task:99", open: true }] }, "simulated");
  const r2 = await S.shadowEvaluate(c, { tasks, run: run(0), evaluator: "independent-evaluator", seed: 3, transferType: "design" });
  assert.ok(r2.evaluation.reasons.includes("open_counterexample"));
  assert.throws(() => S.createCandidate({ ...baseArgs(), experiences: [exp[0]] }), /needs_at_least_two_experiences/);
  assert.throws(() => S.createCandidate({ ...baseArgs(), experiences: [exp[0], { tag: "RUMOR", statement: "x", source: "y" }] }), /experience_srm_claim/);
});

test("holdout split is deterministic per seed and disjoint from dev", () => {
  const a = S.split(tasks, { seed: 11, transferType: "design" }), b = S.split(tasks, { seed: 11, transferType: "design" });
  assert.deepEqual(a.holdout.map((t) => t.id), b.holdout.map((t) => t.id));
  assert.equal(new Set([...a.dev, ...a.holdout].map((t) => t.id)).size, 20);
  assert.ok(a.holdout.every((t) => !a.dev.includes(t)));
});
