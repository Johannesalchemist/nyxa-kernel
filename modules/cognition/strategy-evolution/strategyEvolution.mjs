/**
 * NYXA Cognitive Strategy Evolution (P1, Continuation R3), 2026-11-27 Europe/Berlin.
 * Owner: Johannes Suess. Generated with Claude Code. Status: DRAFT / TESTED-IN-ISOLATION.
 *
 * A separate learning path for reusable reasoning, decision, problem-solving and cooperation
 * strategies (not more memories). Cycle:
 *   Experience -> Reflection -> Strategy Candidate -> Simulation (shadow) -> Evaluation
 *   -> Governed Adoption -> Observation -> Revision
 * Reuse, no parallel memory architecture: evidence uses the existing SRM claim shape
 * {tag, statement, source, asOf?}; candidates enter the EXISTING candidate store through the
 * EXISTING governed proposal path (nyxa_propose_action -> gamma -> candidate store); adoption is
 * recorded only from a gamma ALLOW + Human Gate grant bound to the exact strategy digest.
 * Agents can never adopt, evaluate or widen their own strategies; strategies may not touch
 * authority (budgets, mandates, scopes, evaluation criteria).
 */
import { createHash } from "node:crypto";

export const SRM_TAGS = ["FACT", "CLAIM", "INFERENCE", "HYPOTHESIS", "MEMORY", "SIMULATION", "MODEL_OUTPUT", "EXTERNAL_EVIDENCE"];
export const KINDS = ["reasoning", "decision", "problem_solving", "cooperation"];
export const STATUS = ["candidate", "simulated", "evaluated", "adoption_proposed", "adopted", "suspended", "revised", "revoked", "rejected"];
const TRANSITIONS = {
  candidate: ["simulated", "rejected", "revoked"], simulated: ["evaluated", "rejected", "revoked"],
  evaluated: ["adoption_proposed", "rejected", "revoked"], adoption_proposed: ["adopted", "rejected", "revoked"],
  adopted: ["revised", "revoked", "suspended"], suspended: ["revoked", "adopted"], revised: [], revoked: [], rejected: [],
};
// Authority is never learnable: a strategy that mentions these keys is rejected outright.
const FORBIDDEN = /\b(budget|max_executions|mandate|scope_prefix|target_prefix|ttl_seconds|capability_class|evaluation_criteria|success_criteria_override|human_grant|issuer|passport|token)\b/i;

const canon = (v) => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
  : JSON.stringify(v);
export const digest = (v) => createHash("sha256").update(canon(v)).digest("hex");

function fail(code) { const e = Error("strategy_invalid:" + code); e.code = code; throw e; }

/** Strategy Candidate from a reflection over concrete experiences (all provenance required). */
export function createCandidate({ id, title, kind, author, reflectionRef, experiences, procedure, context, preconditions, limits,
  successCriteria, uncertainty, counterexamples = [], components = [] }) {
  if (!/^strat-[a-z0-9-]{3,60}$/.test(id ?? "")) fail("id");
  if (!KINDS.includes(kind)) fail("kind");
  if (typeof author !== "string" || !author) fail("author");
  if (!Array.isArray(experiences) || experiences.length < 2) fail("needs_at_least_two_experiences");
  for (const e of experiences) if (!SRM_TAGS.includes(e.tag) || !e.statement || !e.source) fail("experience_srm_claim");
  if (!Array.isArray(successCriteria) || !successCriteria.length ||
      !successCriteria.every((c) => c.metric && [">=", "<="].includes(c.comparator) && Number.isFinite(c.threshold))) fail("success_criteria");
  if (!(uncertainty >= 0 && uncertainty <= 1)) fail("uncertainty");
  if (!Array.isArray(preconditions) || !Array.isArray(limits) || !limits.length) fail("limits_required");
  if (FORBIDDEN.test(canon({ title, procedure, preconditions, limits, components }))) fail("strategy_touches_authority");
  const body = { id, version: 1, title, kind, procedure, components, context, preconditions, limits, successCriteria, uncertainty };
  return { ...body, digest: digest(body), status: "candidate", author,
    provenance: { reflectionRef, experiences: experiences.map((e) => ({ ...e })) },
    counterexamples: [...counterexamples], evaluations: [], history: [{ status: "candidate", at: null }] };
}

export function transition(s, to, note = {}) {
  if (!TRANSITIONS[s.status]?.includes(to)) fail(`transition_${s.status}_to_${to}`);
  return { ...s, status: to, history: [...s.history, { status: to, ...note }] };
}

/** Deterministic seeded split (mulberry32) so holdouts are reproducible and not cherry-picked. */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function split(tasks, { seed, holdoutFraction = 0.3, transferType }) {
  const inDomain = tasks.filter((t) => t.type !== transferType), transfer = tasks.filter((t) => t.type === transferType);
  const r = rng(seed); const shuffled = inDomain.map((t) => [r(), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const n = Math.max(1, Math.round(shuffled.length * holdoutFraction));
  return { dev: shuffled.slice(n), holdout: shuffled.slice(0, n), transfer };
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/**
 * Shadow simulation + evaluation. `run(task, config)` executes a task in SHADOW (no effects)
 * and returns a score in [0,1]. Configs: baseline (no strategy), full strategy, and one ablation
 * per component. The evaluator must be independent of the author (no self-evaluation).
 */
export async function shadowEvaluate(s, { tasks, run, evaluator, seed, transferType, minGain = 0.02 }) {
  if (s.status !== "simulated") fail("must_be_simulated_first");
  if (!evaluator || evaluator === s.author) fail("self_evaluation");
  const { dev, holdout, transfer } = split(tasks, { seed, transferType });
  const score = async (set, cfg) => mean(await Promise.all(set.map((t) => run(t, cfg))));
  const full = { strategy: s.id, digest: s.digest };
  const res = {
    baseline: { holdout: await score(holdout, null), transfer: await score(transfer, null) },
    strategy: { dev: await score(dev, full), holdout: await score(holdout, full), transfer: await score(transfer, full) },
    ablations: {},
  };
  for (const c of s.components) res.ablations[c] = await score(holdout, { ...full, without: c });
  const gain = res.strategy.holdout - res.baseline.holdout;
  const transferDelta = res.strategy.transfer - res.baseline.transfer;
  const criteriaMet = s.successCriteria.every((c) => c.comparator === ">=" ? gain >= c.threshold : gain <= c.threshold);
  const necessary = Object.fromEntries(Object.entries(res.ablations).map(([c, v]) => [c, res.strategy.holdout - v > 0]));
  const reasons = [];
  if (!(gain >= minGain)) reasons.push("no_holdout_gain");
  if (!criteriaMet) reasons.push("success_criteria_not_met");
  if (transfer.length && transferDelta < 0) reasons.push("transfer_regression");
  if (s.counterexamples.some((c) => c.open)) reasons.push("open_counterexample");
  const evaluation = { evaluator, seed, sizes: { dev: dev.length, holdout: holdout.length, transfer: transfer.length },
    ...res, gain, transferDelta, necessary, recommendation: reasons.length ? "reject_or_revise" : "propose_adoption", reasons };
  return { strategy: transition({ ...s, evaluations: [...s.evaluations, evaluation] }, "evaluated", { evaluator }), evaluation };
}

/** Governed adoption request = an ordinary proposal for the existing candidate store path. */
export function adoptionProposal(s, { actor, taskId, runId, asOf }) {
  if (s.status !== "evaluated") fail("must_be_evaluated");
  const last = s.evaluations.at(-1);
  if (last?.recommendation !== "propose_adoption") fail("evaluation_does_not_support_adoption");
  // Existing candidate-store contract (schema/candidates.js): target memory:/candidate, strict payload
  // {content, candidate_type, source, scope, purpose, confidence, importance}; strategies reuse the existing type "process_pattern".
  return { actor, action: "nyxa_memory_store_candidate", target: "memory:/candidate", scope: "memory:/",
    claims: [
      { tag: "SIMULATION", statement: `Shadow evaluation of ${s.id} v${s.version}: holdout gain ${last.gain.toFixed(3)}, transfer delta ${last.transferDelta.toFixed(3)}`, source: `evaluator:${last.evaluator}`, asOf },
      ...s.provenance.experiences.slice(0, 5),
    ],
    uncertainty: s.uncertainty, requestedCapabilityClass: "I1", estimatedIrreversibility: "I1",
    provenance: { taskId, runId, requestingIdentity: actor },
    rationale: `Adopt strategy ${s.id} (${s.kind}) after independent shadow evaluation.`,
    opposition: s.counterexamples.length ? `Known counterexamples: ${s.counterexamples.map((c) => c.ref).join(", ")}` : "none recorded",
    payload: { content: `strategy ${s.id} v${s.version} sha256:${s.digest} :: ${s.title} :: ${s.procedure}`.slice(0, 4000),
      candidate_type: "process_pattern", source: "agent", scope: "project",
      purpose: `strategy-evolution:${s.id}@${s.version} governed adoption after independent shadow evaluation`.slice(0, 500),
      confidence: Math.round((1 - s.uncertainty) * 100) / 100, importance: 0.5 } };
}

/** Adoption is recorded ONLY from a gamma ALLOW + human grant bound to this exact strategy digest. */
export function recordAdoption(s, decision) {
  if (s.status !== "adoption_proposed") fail("must_be_adoption_proposed");
  if (decision?.gamma !== "ALLOW") fail("gamma_not_allow");
  if (!decision.humanGrantId) fail("human_grant_required");
  if (decision.strategyDigest !== s.digest) fail("digest_mismatch");
  if (decision.decidedBy === s.author) fail("self_adoption");
  return transition(s, "adopted", { humanGrantId: decision.humanGrantId, decidedBy: decision.decidedBy });
}

/** Observation after adoption: drift below baseline raises a revision request, never self-revokes. */
export function observe(s, { observedScores, baselineHoldout }) {
  if (s.status !== "adopted") fail("must_be_adopted");
  const m = mean(observedScores);
  return { strategy: s, alert: m < baselineHoldout ? { kind: "revision_required", observedMean: m, baselineHoldout } : null };
}

/** Revision creates a NEW version (new digest) back at `candidate`; the old one is marked revised. */
export function revise(s, changes, { counterexample } = {}) {
  if (!["adopted", "evaluated"].includes(s.status)) fail("not_revisable");
  const old = transition(s, s.status === "adopted" ? "revised" : "rejected", { reason: "superseded" });
  const next = createCandidate({ ...s, ...changes, id: s.id, author: changes.author ?? s.author, reflectionRef: changes.reflectionRef ?? s.provenance.reflectionRef,
    experiences: changes.experiences ?? s.provenance.experiences, counterexamples: [...s.counterexamples, ...(counterexample ? [counterexample] : [])] });
  const body = { ...next, version: s.version + 1 }; delete body.digest; delete body.status; delete body.author; delete body.provenance;
  delete body.counterexamples; delete body.evaluations; delete body.history;
  return { old, next: { ...next, version: s.version + 1, digest: digest(body) } };
}

export function revoke(s, reason) { if (!reason) fail("reason_required"); return transition(s, "revoked", { reason }); }

// =====================================================================================================
// RSE-01 Regret-Guided Strategy Evolution (2026-11-27, R7). Extends the cycle above; no new store.
// Source note: the referenced "GUARD" research order was not found in any reachable source (unverified);
// this implements the categories named in the R7 order.
// =====================================================================================================
/** Immutable governance limits. Strategies can neither carry nor change them; digest is checked. */
export const GOVERNANCE_INVARIANTS = Object.freeze({ maxHurtOnRetained: 0, minNetGain: 1, maxUnknownShare: 0.2, adoptionRequires: Object.freeze(["independent_evaluator", "gamma_ALLOW", "human_grant"]), rollbackDirection: "toward_baseline_only" });
export const GOVERNANCE_DIGEST = digest(GOVERNANCE_INVARIANTS);
export function assertGovernanceUnchanged(inv = GOVERNANCE_INVARIANTS) { if (digest(inv) !== GOVERNANCE_DIGEST) fail("governance_invariants_changed"); return true; }

/** Per-task regret outcome of a candidate vs. the current baseline. Correctness: true | false | null(unknown). */
export function regretOutcome(baselineCorrect, candidateCorrect) {
  if (baselineCorrect == null || candidateCorrect == null) return "UNKNOWN";
  if (!baselineCorrect && candidateCorrect) return "GAIN";
  if (baselineCorrect && !candidateCorrect) return "HURT";
  return baselineCorrect ? "RETAIN" : "GAP";
}
/** rows: [{task, context, baseline, candidate}] -> profile overall and per context. */
export function regretProfile(rows) {
  const tally = (rs) => { const c = { GAIN: 0, HURT: 0, RETAIN: 0, GAP: 0, UNKNOWN: 0 }; for (const r of rs) c[regretOutcome(r.baseline, r.candidate)]++;
    const competence = c.RETAIN + c.HURT; return { ...c, n: rs.length, net: c.GAIN - c.HURT, retention: competence ? +(c.RETAIN / competence).toFixed(3) : null, unknownShare: rs.length ? +(c.UNKNOWN / rs.length).toFixed(3) : 0 }; };
  const byContext = {}; for (const r of rows) (byContext[r.context ?? "default"] ??= []).push(r);
  return { overall: tally(rows), byContext: Object.fromEntries(Object.entries(byContext).map(([k, v]) => [k, tally(v)])),
    tasks: rows.map((r) => ({ task: r.task, context: r.context ?? "default", outcome: regretOutcome(r.baseline, r.candidate) })) };
}
/** Regression-aware promotion per context, against the immutable invariants. Competence preservation first. */
export function promotionDecision(profile, inv = GOVERNANCE_INVARIANTS) {
  assertGovernanceUnchanged(inv);
  const contexts = {};
  for (const [ctx, t] of Object.entries(profile.byContext)) {
    const reasons = [];
    if (t.HURT > inv.maxHurtOnRetained) reasons.push("hurts_retained_competence");
    if (t.net < inv.minNetGain) reasons.push("no_net_gain");
    if (t.unknownShare > inv.maxUnknownShare) reasons.push("too_much_unknown");
    contexts[ctx] = { activate: reasons.length === 0, reasons, ...t };
  }
  const active = Object.entries(contexts).filter(([, v]) => v.activate).map(([k]) => k);
  return { recommendation: active.length ? "propose_adoption_for_contexts" : "reject", activateIn: active, contexts, requires: inv.adoptionRequires };
}
/** Parallel evaluation of several candidates on identical tasks against one baseline (no self-evaluation). */
export async function parallelEvaluate(candidates, tasks, run, { evaluator }) {
  for (const c of candidates) if (!evaluator || evaluator === c.author) fail("self_evaluation");
  const base = await Promise.all(tasks.map((t) => run(t, null)));
  const out = [];
  for (const c of candidates) {
    const res = await Promise.all(tasks.map((t) => run(t, { strategy: c.id, digest: c.digest })));
    const profile = regretProfile(tasks.map((t, i) => ({ task: t.id, context: t.context, baseline: base[i], candidate: res[i] })));
    out.push({ id: c.id, digest: c.digest, profile, decision: promotionDecision(profile) });
  }
  return out.sort((a, b) => b.profile.overall.net - a.profile.overall.net || a.profile.overall.HURT - b.profile.overall.HURT);
}
/** Context-dependent activation: only adopted strategies whose adopted contexts include the task context. */
export function selectStrategy(strategies, context) {
  const s = strategies.filter((x) => x.status === "adopted" && (x.activeContexts ?? []).includes(context));
  return s.length === 1 ? s[0] : null; // ambiguity or none -> baseline
}
/** Post-adoption regression watch: demonstrated harm suspends immediately (toward baseline) and proposes revocation. */
export function regressionWatch(s, liveRows, { tolerance = GOVERNANCE_INVARIANTS.maxHurtOnRetained } = {}) {
  if (s.status !== "adopted") fail("must_be_adopted");
  const p = regretProfile(liveRows);
  if (p.overall.HURT > tolerance) {
    const suspended = transition({ ...s, activeContexts: [] }, "suspended", { reason: "demonstrated_regression", hurt: p.overall.HURT });
    return { strategy: suspended, action: "suspended_to_baseline", revocationProposal: { strategyId: s.id, digest: s.digest, evidence: p.tasks.filter((t) => t.outcome === "HURT"), requires: "gamma_ALLOW + human_grant" } };
  }
  return { strategy: s, action: "none", profile: p.overall };
}

// =====================================================================================================
// RSE-01 Addendum — Cognitive Efficiency Evolution (2026-11-27). Same module, same store, same gates.
// Principle: efficiency can only be gained AFTER quality and governance hold; cost savings never offset
// a HURT, an open governance issue or a drop in epistemic quality.
// =====================================================================================================
export const MODES = Object.freeze(["direct", "reflect", "cooperate", "explore"]);
const tokensOf = (s) => Math.ceil(String(s ?? "").length / 4); // coarse proxy, labelled as such

/** 1/2 Distil an adopted strategy into a context-bound, reusable procedure (SRM provenance kept). */
export function distillProcedure(s, { context, steps, maxSteps = 5 }) {
  if (s.status !== "adopted") fail("distil_only_adopted");
  if (!(s.activeContexts ?? []).includes(context)) fail("context_not_adopted");
  if (!Array.isArray(steps) || !steps.length || steps.length > maxSteps) fail("procedure_steps");
  if (FORBIDDEN.test(canon(steps))) fail("strategy_touches_authority");
  const body = { strategyId: s.id, strategyDigest: s.digest, context, steps };
  return { ...body, digest: digest(body), promptTokens: tokensOf(steps.join("\n")),
    provenance: [{ tag: "INFERENCE", statement: `distilled from ${s.id}@${s.version} for ${context}`, source: `strategy:${s.digest}` }] };
}

/** 3 Adaptive mode selection; learnable per (context, mode) from measured quality AND cost. */
export class ModeSelector {
  constructor() { this.m = new Map(); }
  record(context, mode, { quality, cost }) { if (!MODES.includes(mode)) fail("mode"); const k = `${context}|${mode}`;
    const v = this.m.get(k) ?? { n: 0, q: 0, c: 0 }; v.n++; v.q += quality; v.c += cost; this.m.set(k, v); }
  stats(context, mode) { const v = this.m.get(`${context}|${mode}`); return v ? { n: v.n, quality: v.q / v.n, cost: v.c / v.n } : null; }
  /** Prior rules first (risk/novelty/competence), then measured: cheapest mode within the quality floor. */
  select(context, { competence = 0.5, novelty = 0.5, risk = "low", partnersAvailable = false, qualityFloor = 0.9 } = {}) {
    const measured = MODES.map((mode) => ({ mode, ...this.stats(context, mode) })).filter((x) => x.n >= 3 && x.quality >= qualityFloor);
    if (risk === "high") return { mode: "reflect", reason: "high_risk_requires_reflection" }; // never optimise away care on risky tasks
    if (measured.length) { const best = measured.sort((a, b) => a.cost - b.cost)[0]; return { mode: best.mode, reason: "cheapest_mode_meeting_quality_floor", evidence: best }; }
    if (competence < 0.4 && partnersAvailable) return { mode: "cooperate", reason: "low_competence_partner_available" };
    if (novelty > 0.7) return { mode: "explore", reason: "novel_context" };
    return { mode: competence >= 0.8 ? "direct" : "reflect", reason: "prior" };
  }
}

/** 4 Real cost of a learning cycle and of task execution (tokens, latency, human minutes, money). */
export function cycleCost({ tokens = 0, latencyMs = 0, humanMinutes = 0, pricePerMTok = 0, humanRatePerHour = 0 }) {
  return { tokens, latencyMs, humanMinutes, money: +(tokens / 1e6 * pricePerMTok + humanMinutes / 60 * humanRatePerHour).toFixed(4) };
}
/** Break-even: number of recurring tasks after which the learning investment is amortised.
 *  Only defined when quality does not drop and HURT == 0; otherwise Infinity (no amortisation of harm). */
export function breakEven({ learningCost, baselineTaskCost, improvedTaskCost, qualityDelta, hurt }) {
  const saving = Math.round((baselineTaskCost - improvedTaskCost) * 1e9) / 1e9; // avoid float artefacts (1.2-0.9)
  if (hurt > 0 || qualityDelta < 0) return { n: Infinity, reason: hurt > 0 ? "regression_not_amortisable" : "quality_drop" };
  if (saving <= 0) return { n: Infinity, reason: "no_per_task_saving" };
  return { n: Math.ceil(Math.round((learningCost / saving) * 1e6) / 1e6), savingPerTask: saving, reason: "amortised" };
}

/** 5 Detect redundant, contradictory and outdated strategies. */
export function auditStrategies(strategies, { now, maxAgeDays = 90, profiles = {} }) {
  const findings = [];
  const active = strategies.filter((s) => s.status === "adopted");
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j]; const shared = (a.activeContexts ?? []).filter((c) => (b.activeContexts ?? []).includes(c));
    if (!shared.length) continue;
    const da = a.directives ?? {}, db = b.directives ?? {};
    const conflict = Object.keys(da).filter((k) => k in db && da[k] !== db[k]);
    if (conflict.length) findings.push({ kind: "contradictory", ids: [a.id, b.id], contexts: shared, keys: conflict, action: "suspend_both_until_human_decision" });
    const pa = profiles[a.id], pb = profiles[b.id];
    if (pa && pb) { const dominated = (x, y) => x.HURT >= y.HURT && x.net <= y.net && (x.cost ?? 0) >= (y.cost ?? 0);
      if (dominated(pa, pb)) findings.push({ kind: "redundant", id: a.id, dominatedBy: b.id, contexts: shared, action: "propose_revocation" });
      else if (dominated(pb, pa)) findings.push({ kind: "redundant", id: b.id, dominatedBy: a.id, contexts: shared, action: "propose_revocation" }); }
  }
  for (const s of active) { const last = s.lastValidatedAt ?? 0; if (now - last > maxAgeDays * 86400e3) findings.push({ kind: "outdated", id: s.id, action: "revalidate_in_shadow" }); }
  return findings;
}

/** 6 Context-sensitive activation: only procedures for this context, within a token budget (no global prompt growth). */
export function activationBundle(procedures, context, { tokenBudget = 400 } = {}) {
  const fitting = procedures.filter((p) => p.context === context);
  const out = []; let used = 0;
  for (const p of fitting) { if (used + p.promptTokens > tokenBudget) continue; out.push(p); used += p.promptTokens; }
  const globalTokens = procedures.reduce((s, p) => s + p.promptTokens, 0);
  return { context, procedures: out.map((p) => p.digest), promptTokens: used, globalPromptTokens: globalTokens, saved: globalTokens - used };
}

/** 7 Efficiency may be promoted only on top of quality + governance; never instead of them. */
export function efficiencyDecision({ profile, qualityDelta, costDelta, governanceViolations = 0, calibrationDelta = 0 }, inv = GOVERNANCE_INVARIANTS) {
  assertGovernanceUnchanged(inv);
  const reasons = [];
  if (governanceViolations > 0) reasons.push("governance_violation");
  if (profile.HURT > inv.maxHurtOnRetained) reasons.push("regression");
  if (qualityDelta < 0) reasons.push("quality_drop");
  if (calibrationDelta < -0.02) reasons.push("epistemic_quality_drop");
  if (!(costDelta < 0)) reasons.push("no_cost_reduction");
  return { promote: reasons.length === 0, reasons };
}
