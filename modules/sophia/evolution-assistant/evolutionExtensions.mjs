/**
 * Sophia Evolution Assistant — WP3/WP4/WP7 extensions, 2026-11-27 Europe/Berlin. Owner: Johannes Suess.
 * Generated with Claude Code. Status: TESTED-IN-ISOLATION. Extends ./evolutionAssistant.mjs; no new store:
 * all state is part of the DevelopmentModel/DecisionLedger snapshot that the host persists via the
 * existing candidate store; strategies go through strategy-evolution; relations through relationalIntelligence.
 */
import { connections, possibility } from "./evolutionAssistant.mjs";
import { createCandidate } from "../../cognition/strategy-evolution/strategyEvolution.mjs";
import { ConstellationRelations, jointHypotheses } from "../../cognition/epistemic-evolution/relationalIntelligence.mjs";

const fail = (c) => { throw Object.assign(Error(c), { code: c }); };
const tokens = (s) => new Set(String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));
const jaccard = (a, b) => { const A = tokens(a), B = tokens(b); const i = [...A].filter((x) => B.has(x)).length; return i / Math.max(1, A.size + B.size - i); };
const DAY = 86400e3;

// ---------- WP7 manipulation guard (hard acceptance criterion) ----------------------------------------
// Pressure patterns (urgency, scarcity, guilt, fear, fake social proof, flattery-as-lever, commitment traps).
const PRESSURE = [/\b(jetzt sofort|nur noch heute|letzte chance|sonst verpasst|du musst|du solltest unbedingt|alle anderen|enttäusch)/iu,
  /\b(act now|last chance|only today|you must|you'll regret|everyone else|don't miss out|you owe|limited time)\b/iu,
  /\b(streak|punkte|points|level up|rank(ing)?|badge)\b/iu];
export function manipulationCheck(text) {
  const hits = PRESSURE.flatMap((r) => (String(text).match(r) ?? []).slice(0, 1));
  return { ok: hits.length === 0, hits };
}
const guarded = (text) => { const m = manipulationCheck(text); if (!m.ok) fail("manipulative_language:" + m.hits.join("|")); return text; };

// ---------- WP4 Decision ledger: decisions are effective and cannot be bypassed by re-proposal ---------------
export class DecisionLedger {
  constructor({ revisitAfterDays = 30, similarity = 0.6 } = {}) { this.items = []; this.revisitAfterDays = revisitAfterDays; this.similarity = similarity; }
  fingerprint(p) { return `${p.kind}|${[...p.basedOn].sort().join(",")}`; }
  /** Blocks re-proposals of rejected items (same fingerprint OR similar title of same kind) unless new evidence,
   *  enough time and no permanent "never"; a revisit is allowed at most once. */
  admit(p, { now }) {
    guarded(`${p.title} ${p.rationale} ${p.nextSteps.join(" ")}`);
    const prior = this.items.filter((x) => x.decision?.verdict === "reject" && x.p.kind === p.kind &&
      (this.fingerprint(x.p) === this.fingerprint(p) || jaccard(x.p.title, p.title) >= this.similarity));
    for (const x of prior) {
      if (x.decision.never) return { ok: false, reason: "rejected_permanently", ref: x.id };
      const newEvidence = p.basedOn.filter((id) => !x.p.basedOn.includes(id));
      const waited = now - x.decision.at >= this.revisitAfterDays * DAY;
      if (!newEvidence.length || !waited || x.revisited) return { ok: false, reason: "rejected_no_new_basis", ref: x.id };
      x.revisited = true;
    }
    const it = { id: `d${this.items.length + 1}`, p, status: "awaiting_decision", decision: null, history: [], proposedAt: now };
    this.items.push(it); return { ok: true, id: it.id };
  }
  get(id) { return this.items.find((x) => x.id === id) ?? fail("unknown_decision_item"); }
  decide(id, { by, verdict, never = false, reason = "", now }) {
    if (by !== "human") fail("only_human_decides");
    if (!["accept", "reject", "defer", "no_action"].includes(verdict)) fail("verdict");
    const it = this.get(id); if (it.status === "revoked") fail("already_revoked");
    it.decision = { verdict, never, reason, at: now }; it.status = { accept: "accepted", reject: "rejected", defer: "deferred", no_action: "deliberately_not_acting" }[verdict];
    it.history.push({ op: "decide", verdict, at: now }); return it;
  }
  correct(id, changes, { by, now }) {
    if (by !== "human") fail("only_human_corrects");
    const it = this.get(id); it.history.push({ op: "correct", before: { title: it.p.title, nextSteps: it.p.nextSteps }, at: now });
    it.p = { ...it.p, ...changes }; guarded(`${it.p.title} ${it.p.nextSteps.join(" ")}`); it.status = "awaiting_decision"; it.decision = null; return it;
  }
  revoke(id, { by, now, reason }) {
    if (by !== "human") fail("only_human_revokes");
    const it = this.get(id); if (it.execution && it.execution.irreversible) fail("effect_irreversible_record_only");
    it.status = "revoked"; it.history.push({ op: "revoke", reason, at: now }); return it;
  }
  /** Authorized action: accepted + (governed effects -> grant reference) + sandboxed executor. */
  async execute(id, { executor, grantRef, now }) {
    const it = this.get(id);
    if (it.status !== "accepted") fail("not_accepted:" + it.status);
    if ((it.p.requires ?? []).length && !grantRef) fail("governed_action_needs_grant");
    const result = await executor(it.p, { grantRef });
    it.execution = { at: now, grantRef: grantRef ?? null, result, irreversible: !!result?.irreversible }; it.status = "executed"; return it;
  }
}

// ---------- 1 Opportunity discovery from experiences and relations ------------------------------------
export function discoverOpportunities(model, { themeOf, successfulExperiences = [] }) {
  const links = connections(model, themeOf);
  return links.map((l) => {
    const support = successfulExperiences.filter((e) => themeOf(model.get(e.entry)).some((t) => l.shared.includes(t)));
    return { basedOn: [l.a, l.b, ...support.map((s) => s.entry)].filter((v, i, a) => a.indexOf(v) === i), theme: l.shared, supportCount: support.length };
  }).sort((a, b) => b.supportCount - a.supportCount);
}
export const draftPossibility = (model, opp, { title, rationale, nextSteps, needs, effects }) =>
  possibility(model, { title: guarded(title), kind: "discovered", basedOn: opp.basedOn, rationale: guarded(rationale), nextSteps: nextSteps.map(guarded), needs, effects });

// ---------- 2 Strategy evolution for the human's own work strategies (via strategy-evolution) -------------
export function extractStrategy({ id, title, experiences, procedure, context, limits, author = "sophia" }) {
  // Measured experiences only; the human's strategy is suggested to the human, never imposed.
  return createCandidate({ id, title, kind: "problem_solving", author, reflectionRef: "evolution-assistant", experiences, procedure, context,
    preconditions: ["human chooses to try it"], limits, successCriteria: [{ metric: "steps_to_outcome", comparator: "<=", threshold: 0.9 }], uncertainty: 0.6 });
}
export function transferProposal(strategy, newContext) {
  return { strategyId: strategy.id, from: strategy.context, to: newContext, mode: "shadow_trial", humanDecides: true,
    note: "Transfer is a suggestion to try in shadow first; adoption only via strategy-evolution + gamma." };
}

// ---------- 3 Relationship evolution: which forms of collaboration are productive -------------------------
export const COLLAB_FORMS = ["sophia_drafts_human_decides", "human_drafts_sophia_critiques", "joint_brainstorm", "sophia_asks_human_answers", "parallel_then_compare"];
export class CollaborationForms {
  constructor() { this.rel = new ConstellationRelations(); }
  record(form, situation, { jointQuality, humanAloneQuality }) { if (!COLLAB_FORMS.includes(form)) fail("form"); return this.rel.record([form], situation, { jointQuality, bestIndividualQuality: humanAloneQuality }); }
  suggest(situation) { return COLLAB_FORMS.map((f) => ({ form: f, ...this.rel.stats([f], situation) })).sort((a, b) => b.meanSynergy - a.meanSynergy || b.pSynergy - a.pSynergy); }
}

// ---------- 4 Perspective discovery without imposition ------------------------------------------------------
export class Perspectives {
  constructor() { this.declined = new Map(); }
  offer(topic, perspectives, { asked = false, max = 2 } = {}) {
    if (!asked && this.declined.get(topic) >= 1) return { offered: [], reason: "declined_before_on_topic" };
    return { offered: perspectives.slice(0, asked ? perspectives.length : max).map((p) => ({ ...p, text: guarded(p.text), optional: true, framing: "eine mögliche Sicht, keine Empfehlung" })) };
  }
  decline(topic) { this.declined.set(topic, (this.declined.get(topic) ?? 0) + 1); }
}

// ---------- 5 Collaborative research: productive interdisciplinary links ----------------------------------
export function collaborativeResearch(contributions, hypotheses) {
  return jointHypotheses(contributions, hypotheses).filter((h) => h.emergent && h.testable && h.interdisciplinary)
    .map((h) => ({ hypothesis: h.statement, disciplines: h.disciplines, prediction: h.prediction, falsifier: h.falsifier,
      nextStep: "propose a joint session to the human; any contact is governed_action:contact_external_party" }));
}

// ---------- 6 Longitudinal reflection --------------------------------------------------------------------
export const snapshot = (model, at) => ({ at, entries: model.view().entries.map((e) => ({ id: e.id, kind: e.kind, dimension: e.dimension, statement: e.statement, status: e.status })), goals: model.view().goals.map((g) => ({ ...g })) });
export function longitudinal(a, b) {
  const byId = (s) => new Map(s.entries.map((e) => [e.id, e]));
  const A = byId(a), B = byId(b);
  const added = [...B.values()].filter((e) => !A.has(e.id));
  const changed = [...B.values()].filter((e) => A.has(e.id) && A.get(e.id).statement !== e.statement).map((e) => ({ id: e.id, from: A.get(e.id).statement, to: e.statement }));
  const objected = [...B.values()].filter((e) => e.status === "objected" && A.get(e.id)?.status !== "objected").map((e) => e.id);
  const goals = b.goals.filter((g) => !a.goals.some((x) => x.id === g.id && x.status === g.status)).map((g) => ({ id: g.id, text: g.text, status: g.status }));
  const dims = {}; for (const e of added) dims[e.dimension] = (dims[e.dimension] ?? 0) + 1;
  return { from: a.at, to: b.at, added: added.map((e) => e.id), changed, objected, goals, growthByDimension: dims,
    note: "descriptive record of change; not a score of the person" };
}

// ---------- 7 Initiative calibration ------------------------------------------------------------------
export class InitiativeCalibration {
  constructor({ minObservations = 3, threshold = 0.6 } = {}) { this.s = new Map(); this.min = minObservations; this.th = threshold; }
  record(situation, { welcomed }) { const v = this.s.get(situation) ?? { a: 1, b: 1, n: 0 }; welcomed ? v.a++ : v.b++; v.n++; this.s.set(situation, v); }
  /** Silence is the default until there is evidence that initiative helps in this situation. */
  shouldInitiate(situation) {
    const v = this.s.get(situation); if (!v || v.n < this.min) return { initiate: false, reason: "insufficient_evidence_default_silence" };
    const p = v.a / (v.a + v.b); return { initiate: p >= this.th, p: +p.toFixed(3), reason: p >= this.th ? "welcomed_in_situation" : "unwelcome_in_situation" };
  }
}

// ---------- R8: development opportunities inside the existing heartbeat -----------------------------------
/**
 * From real learning/efficiency events: propose experiments (never executed here) and consolidate validated results.
 * Every item gets a stable key so the heartbeat proposes/consolidates each thing exactly once.
 */
export function developmentOpportunities({ learningEvents = [], efficiencyEvents = [] }) {
  const out = [];
  for (const e of learningEvents) {
    if (e.outcome?.HURT > 0) out.push({ key: `exp:regression:${e.id}`, type: "experiment", candidate_type: "open_question",
      content: guarded(`Experiment proposal: re-evaluate ${e.id} in shadow mode with the regressing context excluded; success = HURT 0 at equal or better GAIN on a fresh holdout.`),
      requires: "human_decision", executes: false });
    if (e.recommendation === "propose_adoption_for_contexts" && e.outcome?.HURT === 0) out.push({ key: `consolidate:${e.id}`, type: "validated_result", candidate_type: "observation",
      content: `Validated learning event ${e.id}: GAIN ${e.outcome.GAIN}, HURT 0, RETAIN ${e.outcome.RETAIN}; adoption only for contexts ${e.activateIn.join(", ")} and only via gamma + human grant.`,
      requires: "governed_adoption", executes: false });
  }
  for (const f of efficiencyEvents) {
    if (f.promote) out.push({ key: `consolidate:${f.id}`, type: "validated_result", candidate_type: "observation",
      content: `Efficiency without quality/governance loss (${f.id}): steps ${Math.round(f.relative.steps * 100)}%, approvals ${Math.round(f.relative.approvals * 100)}%, quality ${f.qualityDelta}. Small n, self-evaluated.`, requires: "governed_adoption", executes: false });
    else if (f.reasons?.includes("regression")) out.push({ key: `exp:efficiency:${f.id}`, type: "experiment", candidate_type: "open_question",
      content: guarded(`Experiment proposal: can the cost saving of ${f.id} be kept without its regression? Test the cheaper procedure only in contexts with RETAIN, in shadow mode.`), requires: "human_decision", executes: false });
  }
  return out;
}
