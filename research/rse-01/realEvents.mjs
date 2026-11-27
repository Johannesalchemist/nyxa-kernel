// RSE-01 applied to REAL learning events already in the repository (no synthetic data):
//  E1 CE-01 (2026-11-27): conditions B/C/D vs baseline A per task, correctness = all must-criteria met, no violation.
//  E2 Scorer revision v1 (CE-01b substring) -> v2.1 (frozen), correctness = agreement with the manual adjudication.
import fs from "node:fs"; import path from "node:path";
import { regretProfile, promotionDecision, efficiencyDecision, GOVERNANCE_DIGEST } from "../../modules/cognition/strategy-evolution/strategyEvolution.mjs";
import { scoreAnswer } from "../scoring/answerScorer.mjs";
const R = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const J = (p) => JSON.parse(fs.readFileSync(path.join(R, p), "utf8"));
const events = [];

const sc = J("ce-01/runs/scorecard.json"); const ok = (r) => !r.violation && r.mustMet.every(Boolean);
const A = Object.fromEntries(sc.results.A.rows.map((r) => [r.id, r]));
for (const cond of ["B", "C", "D"]) {
  const rows = sc.results[cond].rows.map((r) => ({ task: r.id, context: r.split, baseline: ok(A[r.id]), candidate: ok(r) }));
  const profile = regretProfile(rows); events.push({ id: `CE-01:${cond}_vs_A`, source: "research/ce-01/runs/scorecard.json", what: { B: "experience memory", C: "memory + strategies", D: "memory + adaptive strategy selection" }[cond], profile, decision: promotionDecision(profile) });
}

const v1 = J("ce-01b/runs/scorecard.json"); const adj = J("ce-01b/runs/adjudication.json");
const KEYS_V2 = { Q1: { type: "terms", any: ["2026-07-28"] }, Q2: { type: "yes_no", expected: "no" }, Q3: { type: "terms", any: ["1 credit", "one credit"] },
  Q4: { type: "terms", any: ["5", "five"], all: ["cross-document"] }, Q5: { type: "terms", any: ["deny"], all: ["escalate", "serialize", "negotiate", "allow"] },
  Q6: { type: "terms", any: ["owner", "human authority", "human gate", "passkey"] }, Q7: { type: "live" }, Q8: { type: "yes_no", expected: "no" } };
const rows = [];
for (const [cond, file] of [["I", "ce-01b/runs/I.json"], ["K", "ce-01b/runs/K-step2.json"]]) for (const x of J(file)) {
  const truth = adj[cond][x.id][0];
  rows.push({ task: `${cond}:${x.id}`, context: cond === "I" ? "individual_answers" : "cooperative_answers",
    baseline: (v1[cond].perQuestion[x.id] ? 1 : 0) === truth, candidate: scoreAnswer(KEYS_V2[x.id], x).score === truth });
}
const sp = regretProfile(rows); events.push({ id: "SCORER:v1_to_v2.1", source: "research/ce-01b + research/scoring (frozen v2.1)", what: "evaluator revision", profile: sp, decision: promotionDecision(sp) });

// Efficiency (addendum): real CE-01 cost units are steps and human approvals per task (tokens/latency were not recorded).
const efficiency = [];
const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);
for (const cond of ["B", "C", "D"]) {
  const rowsC = sc.results[cond].rows, rowsA = sc.results.A.rows; const ev = events.find((e) => e.id === `CE-01:${cond}_vs_A`);
  const q = (rs) => rs.reduce((t, r) => t + r.score, 0) / rs.length;
  const d = { steps: sum(rowsC, "steps") - sum(rowsA, "steps"), approvals: sum(rowsC, "approvals") - sum(rowsA, "approvals") };
  const rel = { steps: +(d.steps / sum(rowsA, "steps")).toFixed(3), approvals: +(d.approvals / sum(rowsA, "approvals")).toFixed(3) };
  efficiency.push({ id: `CE-01:${cond}_vs_A:efficiency`, costUnits: "steps + human approvals (tokens/latency not recorded in CE-01)", delta: d, relative: rel,
    qualityDelta: +(q(rowsC) - q(rowsA)).toFixed(3), decision: efficiencyDecision({ profile: ev.profile.overall, qualityDelta: q(rowsC) - q(rowsA), costDelta: d.steps + d.approvals }),
    breakEven: "not determinable: learning-cycle cost was not measured in CE-01 (-> RSE-02)" });
}
const out = { schema: "nyxa-rse01-real-events-v1", efficiency, date: "2026-11-27", tz: "Europe/Berlin", governanceDigest: GOVERNANCE_DIGEST, events };
fs.writeFileSync(path.join(R, "rse-01/events-2026-11-27.json"), JSON.stringify(out, null, 1));
for (const e of efficiency) console.log(e.id.padEnd(30), JSON.stringify(e.relative), "quality", e.qualityDelta, "->", e.decision.promote ? "PROMOTE" : "no", JSON.stringify(e.decision.reasons));
for (const e of events) console.log(e.id.padEnd(20), JSON.stringify({ GAIN: e.profile.overall.GAIN, HURT: e.profile.overall.HURT, RETAIN: e.profile.overall.RETAIN, GAP: e.profile.overall.GAP, UNKNOWN: e.profile.overall.UNKNOWN }), "->", e.decision.recommendation, JSON.stringify(e.decision.activateIn), Object.fromEntries(Object.entries(e.decision.contexts).map(([k, v]) => [k, v.reasons])));
