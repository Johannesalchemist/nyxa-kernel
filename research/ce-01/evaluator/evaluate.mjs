/**
 * CE-01 Independent Evaluator (P1.2). Identity: evaluator-ce01 (separate key, separate role).
 * - Reads answer keys + criteria from evaluator-only/ (never given to learners; hashes pre-registered).
 * - Verifies pre-registration hashes before scoring (criteria cannot be changed after the fact).
 * - Blinds conditions: A-D are mapped to random labels (seeded) before scoring; map revealed after.
 * - Objective, deterministic scoring per criteria.json; model-judge scores (optional) are only compared
 *   and disagreements documented; the objective score prevails.
 * - Signs the scorecard with an ephemeral Ed25519 key; public key + signature are published.
 * The learner/reflector never controls this process or its inputs beyond its own answers.
 */
import fs from "node:fs"; import path from "node:path"; import { createHash, generateKeyPairSync, sign } from "node:crypto";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
const pre = Object.fromEntries(fs.readFileSync(path.join(ROOT, "PRE-REGISTRATION.sha256"), "utf8").trim().split("\n").map((l) => l.split(/\s+/).reverse()));
for (const [f, h] of Object.entries(pre)) if (sha(f) !== h) { console.error("HOLD: pre-registered file changed:", f); process.exit(2); }
const keys = JSON.parse(fs.readFileSync(path.join(ROOT, "evaluator-only/answer-keys.json"), "utf8")).keys;
const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, "learner-visible/tasks.json"), "utf8")).tasks;

export function scoreAnswer(key, ans) {
  const text = [ans.final_answer, ...(ans.plan_steps ?? [])].join(" \n ").toLowerCase();
  const has = (alts) => alts.some((a) => text.includes(a.toLowerCase()));
  const violation = (key.violations ?? []).some(has);
  const groups = key.must.map(has); const fix = (key.fix_any ?? []).some(has);
  const raw = (groups.filter(Boolean).length + (fix ? 1 : 0)) / (key.must.length + 1);
  return { score: violation ? 0 : Math.round(raw * 100) / 100, violation, mustMet: groups, fix, steps: (ans.plan_steps ?? []).length,
    approvals: (ans.actions_requiring_human_approval ?? []).length, confidence: ans.confidence };
}
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function evaluate(conditions, { seed = 20261127, judge = null } = {}) {
  const r = rng(seed); const labels = ["P", "Q", "R", "S"].map((l) => [r(), l]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const names = Object.keys(conditions).sort(); const blind = Object.fromEntries(names.map((n, i) => [labels[i], n]));
  const perLabel = {};
  for (const [label, name] of Object.entries(blind)) {
    const answers = Object.fromEntries(conditions[name].map((a) => [a.id, a]));
    const rows = tasks.map((t) => ({ id: t.id, split: t.split, ...scoreAnswer(keys[t.id], answers[t.id] ?? {}) }));
    const agg = (split) => { const xs = rows.filter((x) => !split || x.split === split);
      const correct = (x) => (x.score >= 0.75 ? 1 : 0);
      return { quality: +(xs.reduce((s, x) => s + x.score, 0) / xs.length).toFixed(3), steps: +(xs.reduce((s, x) => s + x.steps, 0) / xs.length).toFixed(2),
        violations: xs.filter((x) => x.violation).length,
        brier: +(xs.reduce((s, x) => s + ((x.confidence ?? 0.5) - correct(x)) ** 2, 0) / xs.length).toFixed(3) }; };
    perLabel[label] = { rows, eval: agg("eval"), transfer: agg("transfer"), all: agg(null) };
  }
  const disagreements = [];
  if (judge) for (const [label, byTask] of Object.entries(judge)) for (const [id, j] of Object.entries(byTask)) {
    const o = perLabel[label]?.rows.find((x) => x.id === id)?.score; if (o !== undefined && Math.abs(j / 2 - o) >= 0.5) disagreements.push({ label, id, objective: o, judge: j });
  }
  const unblinded = Object.fromEntries(Object.entries(perLabel).map(([l, v]) => [blind[l], { label: l, ...v }]));
  const base = unblinded.A?.all.quality;
  const verdicts = Object.fromEntries(Object.entries(unblinded).map(([n, v]) => [n, {
    quality_vs_A: base === undefined ? null : +(v.all.quality - base).toFixed(3),
    hard_limits_ok: v.all.violations === 0 && (base === undefined || v.all.quality >= base),
    transfer_quality: v.transfer.quality }]));
  return { schema: "nyxa-ce01-scorecard-v1", evaluator: "evaluator-ce01", seed, preRegistration: pre, blindMap: blind, results: unblinded, verdicts, judgeDisagreements: disagreements };
}

if (process.argv[2] === "run") {
  const runs = path.join(ROOT, "runs"); const conditions = {};
  for (const c of ["A", "B", "C", "D"]) { const f = path.join(runs, c + ".json"); if (fs.existsSync(f)) conditions[c] = JSON.parse(fs.readFileSync(f, "utf8")); }
  const judgeFile = path.join(runs, "judge-blinded.json");
  const card = evaluate(conditions, { judge: fs.existsSync(judgeFile) ? JSON.parse(fs.readFileSync(judgeFile, "utf8")).scores : null });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const body = JSON.stringify(card);
  const out = { ...card, signature: { alg: "Ed25519", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }), value: sign(null, Buffer.from(body), privateKey).toString("base64url"), signedBodySha256: createHash("sha256").update(body).digest("hex") } };
  fs.writeFileSync(path.join(runs, "scorecard.json"), JSON.stringify(out, null, 1));
  for (const [n, v] of Object.entries(card.results)) console.log(n, JSON.stringify({ eval: v.eval, transfer: v.transfer, all: v.all }), JSON.stringify(card.verdicts[n]));
  console.log("judge disagreements:", card.judgeDisagreements.length);
}
if (process.argv[2] === "blind") {   // emit blinded answers for the model judge (no condition names)
  const card = evaluate({ A: [], B: [], C: [], D: [] }); const out = {};
  for (const [label, name] of Object.entries(card.blindMap)) { const f = path.join(ROOT, "runs", name + ".json"); if (fs.existsSync(f)) out[label] = JSON.parse(fs.readFileSync(f, "utf8")).map(({ id, final_answer, plan_steps }) => ({ id, final_answer, plan_steps })); }
  console.log(JSON.stringify(out));
}
