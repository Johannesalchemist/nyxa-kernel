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
export const STATUS = ["candidate", "simulated", "evaluated", "adoption_proposed", "adopted", "revised", "revoked", "rejected"];
const TRANSITIONS = {
  candidate: ["simulated", "rejected", "revoked"], simulated: ["evaluated", "rejected", "revoked"],
  evaluated: ["adoption_proposed", "rejected", "revoked"], adoption_proposed: ["adopted", "rejected", "revoked"],
  adopted: ["revised", "revoked"], revised: [], revoked: [], rejected: [],
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
