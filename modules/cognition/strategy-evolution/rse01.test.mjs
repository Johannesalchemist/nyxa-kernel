import test from "node:test"; import assert from "node:assert/strict";
import { regretOutcome, regretProfile, promotionDecision, parallelEvaluate, selectStrategy, regressionWatch, GOVERNANCE_INVARIANTS, assertGovernanceUnchanged, createCandidate } from "./strategyEvolution.mjs";
const row = (task, context, baseline, candidate) => ({ task, context, baseline, candidate });
test("GAIN/HURT/GAP/RETAIN/UNKNOWN", () => {
  assert.deepEqual([[false, true], [true, false], [false, false], [true, true], [null, true]].map(([b, c]) => regretOutcome(b, c)), ["GAIN", "HURT", "GAP", "RETAIN", "UNKNOWN"]);
});
test("competence preservation + context-dependent promotion", () => {
  const p = regretProfile([row("a", "diag", false, true), row("b", "diag", true, true), row("c", "diag", false, true), row("d", "arch", true, false), row("e", "arch", false, true), row("f", "arch", false, true)]);
  assert.equal(p.overall.net, 3); const d = promotionDecision(p);
  assert.deepEqual(d.activateIn, ["diag"]); assert.ok(d.contexts.arch.reasons.includes("hurts_retained_competence"));
  assert.equal(p.byContext.arch.retention, 0);
});
test("parallel evaluation ranks candidates; no self-evaluation", async () => {
  const mk = (id) => ({ id, digest: id, author: "sophia" }); const tasks = ["t1", "t2", "t3"].map((id) => ({ id, context: "x" }));
  const truth = { null: [true, false, false], s1: [true, true, true], s2: [false, true, true] };
  const run = async (t, cfg) => truth[cfg?.strategy ?? "null"][tasks.findIndex((x) => x.id === t.id)];
  const r = await parallelEvaluate([mk("s2"), mk("s1")], tasks, run, { evaluator: "independent" });
  assert.equal(r[0].id, "s1"); assert.equal(r[0].decision.recommendation, "propose_adoption_for_contexts"); assert.equal(r[1].decision.recommendation, "reject");
  await assert.rejects(parallelEvaluate([mk("s1")], tasks, run, { evaluator: "sophia" }), /self_evaluation/);
});
test("activation only in adopted contexts; regression suspends toward baseline", () => {
  const s = { id: "strat-x", digest: "d", status: "adopted", activeContexts: ["diag"], history: [] };
  assert.equal(selectStrategy([s], "diag").id, "strat-x"); assert.equal(selectStrategy([s], "arch"), null);
  assert.equal(selectStrategy([s, { ...s, id: "y" }], "diag"), null);
  const w = regressionWatch(s, [row("live1", "diag", true, false), row("live2", "diag", false, true)]);
  assert.equal(w.action, "suspended_to_baseline"); assert.equal(w.strategy.status, "suspended"); assert.deepEqual(w.strategy.activeContexts, []);
  assert.equal(selectStrategy([w.strategy], "diag"), null); assert.equal(w.revocationProposal.evidence.length, 1);
});
test("governance invariants are immutable and not learnable", () => {
  assert.throws(() => { GOVERNANCE_INVARIANTS.maxHurtOnRetained = 5; }, TypeError);
  assert.equal(assertGovernanceUnchanged(), true);
  assert.throws(() => assertGovernanceUnchanged({ ...GOVERNANCE_INVARIANTS, maxHurtOnRetained: 3 }), /governance_invariants_changed/);
  assert.throws(() => promotionDecision(regretProfile([]), { ...GOVERNANCE_INVARIANTS, minNetGain: 0 }), /governance_invariants_changed/);
  assert.throws(() => createCandidate({ id: "strat-loosen", title: "raise budget for speed", kind: "decision", author: "a", reflectionRef: "r",
    experiences: [{ tag: "FACT", statement: "s", source: "x" }, { tag: "FACT", statement: "s", source: "y" }], procedure: "increase budget", context: "c",
    preconditions: [], limits: ["l"], successCriteria: [{ metric: "m", comparator: ">=", threshold: 1 }], uncertainty: 0.5 }), /touches_authority/);
});
