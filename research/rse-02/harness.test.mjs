// HARNESS VERIFICATION ONLY with a deterministic stub adapter. These numbers are NOT RSE-02 results.
import test from "node:test"; import assert from "node:assert/strict"; import { runArm, compare } from "./harness.mjs";
const inst = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, family: i % 2 ? "diag" : "arch", risk: "low" }));
const adapter = { run: async (t, { arm, memoryTokens }) => ({ answer: "x", latencyMs: 10,
  usage: { input_tokens: 500 + memoryTokens + (arm === "R" ? -200 : 0), output_tokens: arm === "S" ? 300 : 200 } }) };
const learn = async (arm) => ({ tokens: arm === "M" ? 100 : 1000, ms: 5, memoryDeltaTokens: arm === "M" ? 50 : 0 });
const score = () => 1; const price = { pricePerMTok: 3, humanRatePerHour: 60 };
test("harness measures cost, memory growth, regret and break-even (stub)", async () => {
  const S = await runArm({ arm: "S", instances: inst, adapter, score, learn, price });
  const M = await runArm({ arm: "M", instances: inst, adapter, score, learn, price });
  const R = await runArm({ arm: "R", instances: inst, adapter, score, learn, price });
  const cm = compare(S, M), cr = compare(S, R);
  assert.ok(cm.memoryGrowthTokens > 0 && cm.medianTokensLate > cm.baselineMedianTokensLate); // memory makes prompts grow
  assert.equal(cm.breakEvenUnits.reason, "no_per_task_saving");
  assert.equal(cr.memoryGrowthTokens, 0); assert.ok(cr.breakEvenUnits.n > 0 && Number.isFinite(cr.breakEvenUnits.n)); assert.equal(cr.efficiency.promote, true);
  const bad = await runArm({ arm: "R", instances: inst, adapter, score: (t) => (t.id === "t3" ? 0 : 1), learn, price });
  assert.equal(compare(S, bad).efficiency.promote, false); // regression blocks efficiency promotion
});
