/**
 * Sophia - Personal Evolution Assistant V1 (vertical prototype), 2026-11-27 Europe/Berlin.
 * Owner: Johannes Suess. Generated with Claude Code. Status: DRAFT / TESTED-IN-ISOLATION, not deployed.
 * Predecessors: CE-01b (1de3797), epistemic-evolution, relationalIntelligence, strategy-evolution.
 *
 * Not a new persona, not a second memory, not a parallel agent: an application dimension of the
 * existing Sophia. Every persisted item is a proposal for the EXISTING candidate store (scope
 * "personal"), every learned strategy goes through strategy-evolution + gamma, every external effect
 * is returned as a governed proposal. Identities stay separate: the human model, Sophia's own
 * strategies and the relational record are three distinct spaces and are never merged.
 */
import { proposeQuestion, scoreQuestion, CompetenceRelations, actionable, toCandidateProposal } from "../../cognition/epistemic-evolution/epistemicEvolution.mjs";

// ---------- 3 Human Development Model ------------------------------------------------------------
export const KINDS = ["SELF_STATEMENT", "OBSERVED_FACT", "INTERPRETATION", "HYPOTHESIS"];
export const DIMENSIONS = ["capability", "experience", "interest", "value", "goal", "resource", "knowledge_gap",
  "possibility", "complementarity", "learning_strategy", "life_change"];
// No rigid psychological classification (typologies, diagnoses, fixed traits).
const TYPOLOGY = /\b(mbti|[ie][ns][tf][jp]\b|enneagram|big ?five|introvert|extrovert|narciss|borderline|adhs|adhd|autis|depress|neurotic|personality type|persönlichkeitstyp)/i;
const fail = (c) => { throw Object.assign(Error(c), { code: c }); };

export class DevelopmentModel {
  constructor(personId) { this.personId = personId; this.entries = []; this.goals = []; this.log = []; }
  add({ kind, dimension, statement, source, asOf, confidence = 0.5, author }) {
    if (!KINDS.includes(kind)) fail("kind");
    if (!DIMENSIONS.includes(dimension)) fail("dimension");
    if (!statement || !source || !asOf) fail("provenance_required");
    if (TYPOLOGY.test(statement)) fail("no_psychological_classification");
    // Only the human can make SELF_STATEMENTs; Sophia's contributions are interpretations/hypotheses.
    if (kind === "SELF_STATEMENT" && author !== "human") fail("self_statement_only_by_human");
    if (author !== "human" && dimension === "goal") fail("goals_set_only_by_human");
    const e = { id: `e${this.entries.length + 1}`, kind, dimension, statement, source, asOf, confidence, author, status: "active", history: [] };
    this.entries.push(e); this.log.push({ op: "add", id: e.id, by: author }); return e;
  }
  /** The human can always view everything that is stored about them. */
  view() { return { personId: this.personId, entries: this.entries.map((e) => ({ ...e })), goals: [...this.goals], log: [...this.log] }; }
  correct(id, statement, { by }) {
    if (by !== "human") fail("only_human_corrects");
    const e = this.get(id); e.history.push({ statement: e.statement, at: new Date().toISOString() });
    e.statement = statement; e.kind = "SELF_STATEMENT"; e.author = "human"; this.log.push({ op: "correct", id, by }); return e;
  }
  object(id, { by }) { if (by !== "human") fail("only_human_objects"); this.get(id).status = "objected"; this.log.push({ op: "object", id, by }); }
  get(id) { return this.entries.find((e) => e.id === id) ?? fail("unknown_entry"); }
  /** What Sophia may use: active entries only (objections are honoured immediately). */
  usable() { return this.entries.filter((e) => e.status === "active"); }
  /** Goals: Sophia may only suggest; only a human decision makes a goal active. */
  suggestGoal(text, { rationale }) { const g = { id: `g${this.goals.length + 1}`, text, rationale, status: "suggested", by: "sophia" }; this.goals.push(g); return g; }
  decideGoal(id, accept, { by }) { if (by !== "human") fail("only_human_sets_goals"); const g = this.goals.find((x) => x.id === id) ?? fail("unknown_goal"); g.status = accept ? "active" : "declined"; return g; }
  activeGoals() { return this.goals.filter((g) => g.status === "active").map((g) => g.text); }
}

// ---------- 4 Possibility Navigator ----------------------------------------------------------------
/**
 * A possibility must be grounded (>= 2 usable entries, at least one SELF_STATEMENT or OBSERVED_FACT),
 * have concrete next steps, a feasibility check against stated resources, and governance labels.
 * Connections between previously separate interests are found as pairs of interests/capabilities
 * that share a theme but were never stated together.
 */
export function possibility(model, { title, kind, basedOn, rationale, nextSteps, needs = [], effects = [] }) {
  const used = basedOn.map((id) => model.get(id));
  if (used.some((e) => e.status !== "active")) fail("uses_objected_entry");
  if (used.length < 2 || !used.some((e) => ["SELF_STATEMENT", "OBSERVED_FACT"].includes(e.kind))) fail("insufficient_grounding");
  if (!rationale || !Array.isArray(nextSteps) || nextSteps.length === 0) fail("rationale_and_next_steps_required");
  const resources = model.usable().filter((e) => e.dimension === "resource").map((e) => e.statement.toLowerCase());
  const missing = needs.filter((n) => !resources.some((r) => r.includes(n.toLowerCase())));
  const governed = effects.map((x) => ({ contact_external: "governed_action:contact_external_party", disclose_personal_data: "governed_action:data_disclosure",
    payment: "governed_action:paid_resource", publish: "governed_action:publish" })[x] ?? fail("unknown_effect"));
  return { title, kind, basedOn, rationale, nextSteps, feasibility: missing.length ? { ok: false, missing } : { ok: true },
    requires: governed, status: "proposed", decidedBy: null };
}
export function connections(model, themeOf) {
  const items = model.usable().filter((e) => ["interest", "capability", "experience"].includes(e.dimension));
  const out = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const shared = themeOf(items[i]).filter((t) => themeOf(items[j]).includes(t));
    if (shared.length && items[i].source !== items[j].source) out.push({ a: items[i].id, b: items[j].id, shared });
  }
  return out;
}

// ---------- 5 Personal Question Evolution ----------------------------------------------------------
/** Learns which question origins help which person in which situation; enforces an interruption budget. */
export class PersonalQuestions {
  constructor({ maxPerInteraction = 1, cooldownTurns = 4 } = {}) { this.rel = new CompetenceRelations(); this.max = maxPerInteraction; this.cool = cooldownTurns; this.lastAskedTurn = -Infinity; }
  record(personId, situation, origin, { helpful }) { this.rel.record(`${personId}:${origin}`, situation, { useful: helpful }); }
  select(personId, situation, candidates, { turn, activeGoals, userBusy = false }) {
    if (userBusy || turn - this.lastAskedTurn < this.cool) return { ask: [], reason: userBusy ? "user_busy" : "cooldown" };
    const ranked = candidates.map((c) => proposeQuestion(c)).map((q) => scoreQuestion(q, { activeGoals }))
      .map((q) => ({ ...q, personalFit: +this.rel.expected(`${personId}:${q.origin}`, situation).toFixed(3) }))
      .map((q) => ({ ...q, final: +(0.6 * q.total + 0.4 * q.personalFit).toFixed(3) }))
      .filter((q) => q.scores.relevance > 0).sort((a, b) => b.final - a.final);
    const ask = ranked.slice(0, this.max); if (ask.length) this.lastAskedTurn = turn;
    return { ask, parked: ranked.slice(this.max), reason: ask.length ? "selected" : "no_relevant_question" };
  }
}

// ---------- 6 Human-AI Co-Evolution cycle ------------------------------------------------------------
export const CYCLE = ["observe", "reflect", "discover", "question", "connect", "explore", "act", "verify", "learn", "evolve"];
/** Three separate learning spaces; nothing is merged between them. */
export function createCoEvolution(personId) {
  return { personId, phase: "observe", spaces: { human: [], ai: [], relational: [] }, pending: [] };
}
export function advance(state, phase, payload) {
  const want = CYCLE[(CYCLE.indexOf(state.phase) + 1) % CYCLE.length];
  if (phase !== state.phase && phase !== want) fail(`cycle_order:${state.phase}->${phase}`);
  if (phase === "act") {
    // Acting requires a recorded human decision on a concrete proposal; Sophia never self-authorizes.
    if (!payload?.decision || payload.decision.by !== "human") fail("act_requires_human_decision");
    if (payload.decision.accept && (payload.proposal.requires ?? []).length && !payload.decision.governedApprovalRef) fail("governed_action_needs_authorization");
  }
  if (phase === "learn") {
    for (const [space, item] of Object.entries(payload ?? {})) { if (!state.spaces[space]) fail("unknown_space"); state.spaces[space].push(item); }
  }
  state.phase = phase; return state;
}
/** Verification of effect: learning signal from what actually happened, via the actionable pipeline. */
export function verifyEffect(proposal, { decision, observedEffect, verification }) {
  const rec = { question: proposal.title, evidence: proposal.basedOn, answer: proposal.rationale, options: [proposal.title, "do nothing"],
    preconditions: proposal.feasibility.ok ? ["resources available"] : proposal.feasibility.missing,
    implementation: proposal.nextSteps.map((s) => ({ step: s, effect: false })), verification, experience: { decision, observedEffect } };
  return actionable(rec);
}

// ---------- 7 Intelligent Heartbeat --------------------------------------------------------------------
/**
 * One heartbeat tick. Silence, observation and deliberate non-action are valid outcomes.
 * Communicates only if a prepared proposal is ready AND the person is reachable AND the interruption
 * budget allows it. Never executes external actions.
 */
export function heartbeatTick({ now, quietHours = [22, 7], lastContactAt, minHoursBetweenContacts = 24, openQuestions = [], proposals = [],
  pastRecommendations = [], assumptions = [] }) {
  const hour = new Date(now).getUTCHours(); const quiet = quietHours[0] > quietHours[1] ? hour >= quietHours[0] || hour < quietHours[1] : hour >= quietHours[0] && hour < quietHours[1];
  const sinceContactH = lastContactAt ? (now - lastContactAt) / 3.6e6 : Infinity;
  const reviewed = pastRecommendations.map((r) => ({ id: r.id, effect: r.observedEffect ?? "unobserved" }));
  const revise = assumptions.filter((a) => a.contradictedBy?.length).map((a) => ({ id: a.id, action: "revise_assumption", evidence: a.contradictedBy }));
  const ready = proposals.filter((p) => p.status === "proposed" && p.feasibility?.ok);
  const mayContact = !quiet && sinceContactH >= minHoursBetweenContacts;
  const outcome = revise.length ? "revise_assumptions" : ready.length && mayContact ? "prepare_message" : ready.length ? "hold_until_appropriate" : openQuestions.length ? "silent_reflection" : "observe";
  return { outcome, communicate: outcome === "prepare_message", message: outcome === "prepare_message" ? { proposalId: ready[0].title, requiresHumanDecision: true } : null,
    reviewedRecommendations: reviewed, revisions: revise, externalActions: [] };
}

// ---------- 9 Profiles: one cognitive core, different task focus and permissions ------------------------
export const PROFILES = Object.freeze({
  personal: { focus: ["capability", "interest", "goal", "learning_strategy"], dataScope: "personal" },
  research: { focus: ["knowledge_gap", "complementarity", "possibility"], dataScope: "project" },
  entrepreneurial: { focus: ["resource", "possibility", "capability"], dataScope: "project" },
  organizational: { focus: ["complementarity", "learning_strategy"], dataScope: "organization", requiresConsent: "per_member" },
  creative: { focus: ["interest", "experience", "possibility"], dataScope: "personal" },
  interdisciplinary_research_navigator: { focus: ["knowledge_gap", "complementarity"], dataScope: "project" },
  digitalleria_dialogues_moderator: { focus: ["complementarity", "possibility"], dataScope: "team", requiresConsent: "per_participant" },
  lightnet_cooperation_navigator: { focus: ["complementarity", "resource"], dataScope: "team", requiresConsent: "per_participant" }
});
/** No profile grants permissions; effects stay governed regardless of profile or learned strategy. */
export function profilePermissions(name) {
  const p = PROFILES[name] ?? fail("unknown_profile");
  return { ...p, externalContact: "governed", dataDisclosure: "governed", payment: "governed", crossUserLearning: "consent_only", grantsAuthority: false };
}

// ---------- Persistence via the EXISTING candidate store (scope personal) ---------------------------------
export function persist(kind, content, { actor, taskId, runId, personId, claimTag = "HYPOTHESIS" }) {
  const p = toCandidateProposal({ kind, content, actor, taskId, runId, claims: [{ tag: claimTag, statement: String(content).slice(0, 300), source: `sophia-evolution:${personId}` }] });
  p.payload.scope = "personal"; p.payload.purpose = `sophia-evolution:${kind}`; return p;
}
