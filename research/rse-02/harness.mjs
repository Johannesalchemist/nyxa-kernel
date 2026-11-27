// RSE-02 measurement harness. The ADAPTER is injected: run(task, {arm, context}) -> {answer, usage:{input_tokens, output_tokens}, latencyMs}.
// Learning steps report their own usage. Nothing here estimates tokens for results; the stub is only for harness verification.
import { regretProfile, breakEven, efficiencyDecision, ModeSelector } from "../../modules/cognition/strategy-evolution/strategyEvolution.mjs";
export async function runArm({ arm, instances, adapter, score, learn, price }) {
  const rows = []; let memoryTokens = 0; let learning = { tokens: 0, ms: 0, humanMinutes: 0 }; const sel = new ModeSelector();
  for (const [i, t] of instances.entries()) {
    const mode = arm === "R" ? sel.select(t.family, { risk: t.risk, competence: t.competence ?? 0.5 }).mode : "direct";
    const r = await adapter.run(t, { arm, mode, memoryTokens });
    const tok = r.usage.input_tokens + r.usage.output_tokens; const q = score(t, r.answer);
    if (arm === "R") sel.record(t.family, mode, { quality: q, cost: tok });
    rows.push({ i, task: t.id, family: t.family, quality: q, correct: q >= 1, tokens: tok, latencyMs: r.latencyMs, memoryTokens });
    if (learn && arm !== "S") { const l = await learn(arm, t, r); learning.tokens += l.tokens; learning.ms += l.ms; learning.humanMinutes += l.humanMinutes ?? 0; memoryTokens += l.memoryDeltaTokens ?? 0; }
  }
  const money = (x) => x / 1e6 * price.pricePerMTok;
  const learningMoney = money(learning.tokens) + learning.humanMinutes / 60 * price.humanRatePerHour;
  return { arm, rows, learning, learningMoney: +learningMoney.toFixed(4), taskMoney: +money(rows.reduce((s, r) => s + r.tokens, 0)).toFixed(4) };
}
export function compare(base, arm, { window = [6, 11] } = {}) {
  const pick = (a) => a.rows.filter((r) => r.i >= window[0] && r.i <= window[1]);
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const prof = regretProfile(arm.rows.map((r, k) => ({ task: r.task, context: r.family, baseline: base.rows[k].correct, candidate: r.correct }))).overall;
  const qd = arm.rows.reduce((s, r) => s + r.quality, 0) / arm.rows.length - base.rows.reduce((s, r) => s + r.quality, 0) / base.rows.length;
  const costPer = (a) => med(pick(a).map((r) => r.tokens));
  const be = breakEven({ learningCost: arm.learningMoney, baselineTaskCost: costPer(base) / 1e6, improvedTaskCost: costPer(arm) / 1e6, qualityDelta: qd, hurt: prof.HURT });
  return { arm: arm.arm, qualityDelta: +qd.toFixed(3), medianTokensLate: costPer(arm), baselineMedianTokensLate: costPer(base), regret: prof,
    memoryGrowthTokens: arm.rows.at(-1).memoryTokens, breakEvenUnits: be, efficiency: efficiencyDecision({ profile: prof, qualityDelta: qd, costDelta: costPer(arm) - costPer(base) }) };
}
