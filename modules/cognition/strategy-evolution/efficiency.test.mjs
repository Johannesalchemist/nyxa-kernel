import test from "node:test"; import assert from "node:assert/strict";
import { distillProcedure, ModeSelector, cycleCost, breakEven, auditStrategies, activationBundle, efficiencyDecision } from "./strategyEvolution.mjs";
const adopted = (id, ctx, extra = {}) => ({ id, version: 1, digest: "d-" + id, status: "adopted", activeContexts: ctx, ...extra });
test("distillation: only adopted + adopted context, bounded, no authority", () => {
  const p = distillProcedure(adopted("strat-a", ["diag"]), { context: "diag", steps: ["read the error", "check last change", "verify fix"] });
  assert.ok(p.promptTokens > 0 && p.digest);
  assert.throws(() => distillProcedure(adopted("strat-a", ["diag"]), { context: "arch", steps: ["x"] }), /context_not_adopted/);
  assert.throws(() => distillProcedure({ status: "candidate" }, { context: "diag", steps: ["x"] }), /distil_only_adopted/);
  assert.throws(() => distillProcedure(adopted("strat-a", ["diag"]), { context: "diag", steps: ["raise the budget"] }), /touches_authority/);
});
test("adaptive mode selection: risk forces reflection; cheapest mode meeting quality floor", () => {
  const m = new ModeSelector();
  assert.equal(m.select("ops", { competence: 0.9 }).mode, "direct"); assert.equal(m.select("ops", { competence: 0.2, partnersAvailable: true }).mode, "cooperate");
  assert.equal(m.select("ops", { novelty: 0.9 }).mode, "explore");
  for (let i = 0; i < 3; i++) { m.record("ops", "direct", { quality: 0.85, cost: 1 }); m.record("ops", "reflect", { quality: 0.95, cost: 3 }); m.record("ops", "cooperate", { quality: 0.96, cost: 5 }); }
  assert.equal(m.select("ops").mode, "reflect"); // direct is cheaper but below the quality floor
  assert.equal(m.select("ops", { risk: "high" }).reason, "high_risk_requires_reflection");
});
test("cost and break-even; harm is never amortised", () => {
  const L = cycleCost({ tokens: 200000, humanMinutes: 30, pricePerMTok: 3, humanRatePerHour: 60 }); assert.equal(L.money, 30.6);
  assert.equal(breakEven({ learningCost: 30.6, baselineTaskCost: 1.2, improvedTaskCost: 0.9, qualityDelta: 0, hurt: 0 }).n, 102);
  assert.equal(breakEven({ learningCost: 1, baselineTaskCost: 5, improvedTaskCost: 1, qualityDelta: 0, hurt: 1 }).reason, "regression_not_amortisable");
  assert.equal(breakEven({ learningCost: 1, baselineTaskCost: 1, improvedTaskCost: 1, qualityDelta: 0.1, hurt: 0 }).n, Infinity);
});
test("audit: contradictory, redundant, outdated", () => {
  const now = Date.parse("2026-11-27");
  const f = auditStrategies([adopted("a", ["diag"], { directives: { verify_before_fix: true }, lastValidatedAt: now }), adopted("b", ["diag"], { directives: { verify_before_fix: false }, lastValidatedAt: now }),
    adopted("c", ["arch"], { lastValidatedAt: now - 200 * 86400e3 }), adopted("d", ["arch"], { lastValidatedAt: now })], { now, profiles: { c: { HURT: 0, net: 1, cost: 5 }, d: { HURT: 0, net: 2, cost: 3 } } });
  assert.deepEqual(f.map((x) => x.kind).sort(), ["contradictory", "outdated", "redundant"]);
  assert.equal(f.find((x) => x.kind === "redundant").id, "c");
});
test("context activation keeps prompts bounded; efficiency never beats quality/governance", () => {
  const procs = [{ context: "diag", promptTokens: 120, digest: "p1" }, { context: "arch", promptTokens: 300, digest: "p2" }, { context: "diag", promptTokens: 350, digest: "p3" }];
  const b = activationBundle(procs, "diag", { tokenBudget: 400 }); assert.deepEqual(b.procedures, ["p1"]); assert.equal(b.globalPromptTokens, 770);
  assert.equal(efficiencyDecision({ profile: { HURT: 0 }, qualityDelta: 0, costDelta: -0.2 }).promote, true);
  assert.deepEqual(efficiencyDecision({ profile: { HURT: 1 }, qualityDelta: 0, costDelta: -0.2 }).reasons, ["regression"]);
  assert.ok(efficiencyDecision({ profile: { HURT: 0 }, qualityDelta: 0, costDelta: -0.5, calibrationDelta: -0.1 }).reasons.includes("epistemic_quality_drop"));
  assert.ok(efficiencyDecision({ profile: { HURT: 0 }, qualityDelta: 0, costDelta: -0.5, governanceViolations: 1 }).reasons.includes("governance_violation"));
});
