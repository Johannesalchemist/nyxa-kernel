// CE-01 glue: validate reflector strategies with the existing strategy-evolution module, and the
// deterministic adaptive selector for condition D (keyword overlap of task prompt with triggers/domains).
import fs from "node:fs";
import * as S from "../../modules/cognition/strategy-evolution/strategyEvolution.mjs";
const here = new URL(".", import.meta.url).pathname;
export const experiences = JSON.parse(fs.readFileSync(here + "train/experiences.json", "utf8")).experiences;
export const raw = JSON.parse(fs.readFileSync(here + "runs/strategies-reflector.json", "utf8"));
export function candidates() {
  return raw.map((r) => S.createCandidate({ id: r.id, title: r.title, kind: r.kind, author: "reflector-ce01", reflectionRef: "ce01:reflector:2026-11-27",
    experiences: r.experience_ids.map((id) => { const e = experiences.find((x) => x.id === id); return { tag: "MEMORY", statement: `${e.id}: ${e.lesson}`, source: e.source }; })
      .concat(r.experience_ids.length < 2 ? [{ tag: "INFERENCE", statement: `Generalized by reflector from ${r.experience_ids.join(",")}`, source: "ce01:reflector" }] : []),
    procedure: r.procedure, context: r.context, preconditions: r.preconditions, limits: r.limits,
    successCriteria: [{ metric: "objective_gain_vs_B", comparator: ">=", threshold: 0.0 }], uncertainty: r.uncertainty,
    counterexamples: r.counterexamples.map((c, i) => ({ ref: `${r.id}#cx${i + 1}`, description: c, open: false })), components: r.components }));
}
const words = (s) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
export function select(taskPrompt, strategies, k = 2) {
  const tw = words(taskPrompt);
  return strategies.map((s) => { const sw = words([...(s.context.triggers ?? []), ...(s.context.domains ?? []), s.title].join(" "));
    let n = 0; for (const w of sw) if (tw.has(w)) n++; return [n, s]; })
    .filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, s]) => s);
}
if (process.argv[2] === "plan") {
  const strats = candidates(); const tasks = JSON.parse(fs.readFileSync(here + "learner-visible/tasks.json", "utf8")).tasks;
  console.log(JSON.stringify({ valid: strats.map((s) => [s.id, s.digest.slice(0, 12)]),
    selection: Object.fromEntries(tasks.map((t) => [t.id, select(t.prompt, strats).map((s) => s.id)])) }, null, 1));
}
if (process.argv[2] === "persist") {
  // Strategy candidates with provenance, version, context, counterexamples and evaluation history.
  const card = JSON.parse(fs.readFileSync(here + "runs/scorecard.json", "utf8"));
  const C = card.results.C, B = card.results.B, D = card.results.D;
  const used = Object.fromEntries(JSON.parse(fs.readFileSync(here + "runs/C.json", "utf8")).map((a) => [a.id, a.strategies_used ?? []]));
  const map = { S1: "strat-verify-tool-before-absence", S2: "strat-reconcile-contradicting-observations", S3: "strat-trace-context-across-boundaries", S4: "strat-cheap-observation-over-polling" };
  const out = candidates().map((s) => {
    const tasksUsed = Object.entries(used).filter(([, u]) => u.some((k) => map[k] === s.id)).map(([id]) => id);
    const rowsC = C.rows.filter((r) => tasksUsed.includes(r.id)), rowsB = B.rows.filter((r) => tasksUsed.includes(r.id));
    const avg = (rs) => rs.length ? rs.reduce((x, r) => x + r.score, 0) / rs.length : null;
    const transferTasks = tasksUsed.filter((id) => id.startsWith("X"));
    const gain = rowsC.length ? +(avg(rowsC) - avg(rowsB)).toFixed(3) : null;
    const tC = avg(C.rows.filter((r) => transferTasks.includes(r.id))), tB = avg(B.rows.filter((r) => transferTasks.includes(r.id)));
    const reasons = [];
    if (!(gain > 0)) reasons.push("no_objective_gain_over_memory_baseline_B");
    if (transferTasks.length && !(tC - tB > 0)) reasons.push("no_transfer_gain (ceiling: transfer quality 1.0 in all conditions)");
    if (!tasksUsed.length) reasons.push("not_applied_in_any_task");
    const evaluation = { evaluator: "evaluator-ce01", scorecardSha256: card.signature?.signedBodySha256 ?? null, design: "A/B/C/D, pre-registered keys, blinded judge",
      baseline: "B (memory only)", tasksApplied: tasksUsed, transferTasks, objectiveGainVsB: gain, transferDeltaVsB: transferTasks.length ? +(tC - tB).toFixed(3) : null,
      calibrationBrierC_vs_B: [C.all.brier, B.all.brier], adaptiveSelectionD: { quality: D.all.quality, steps: D.all.steps },
      judgeDisagreements: card.judgeDisagreements.length, recommendation: reasons.length ? "keep_as_candidate_revise_or_retest" : "propose_adoption", reasons };
    let x = S.transition(s, "simulated", { note: "CE-01 shadow run (no effects)" });
    x = { ...x, evaluations: [evaluation] }; x = S.transition(x, "evaluated", { evaluator: "evaluator-ce01" });
    return x;
  });
  fs.writeFileSync(here + "runs/strategy-candidates.json", JSON.stringify(out, null, 1));
  for (const s of out) console.log(s.id, s.version, s.status, JSON.stringify(s.evaluations[0].tasksApplied), s.evaluations[0].objectiveGainVsB, s.evaluations[0].transferDeltaVsB, s.evaluations[0].recommendation);
}
