/**
 * NYXA Expansive Epistemic Evolution (R4 Addendum), 2026-11-27 Europe/Berlin. Owner: Johannes Suess.
 * Generated with Claude Code. Status: DRAFT / TESTED-IN-ISOLATION.
 *
 * Extends Cognitive Strategy Evolution; no parallel memory: every persisted item is an ordinary
 * proposal for the EXISTING candidate store (memory:/candidate) with SRM claims; adoption via gamma.
 *  1 Epistemic self-model   classify(claims) -> verified | contextual | inference | hypothesis |
 *                           known_unknown | contradictory | suspected_blind_spot | cooperative
 *                           + metacognitive calibration of "I know / I don't know" (learnable, scored)
 *  2 Question evolution     questions from experiences, contradictions, gaps, surprises, analogies;
 *                           scored (insight, relevance, answerability, utility, cost); portfolio with
 *                           side-quest filter — not every interesting question is pursued
 *  3 Cooperative intelligence  competence relations (entity x domain, Beta posterior from outcomes),
 *                           partner selection, question precision, perspective synthesis that keeps
 *                           dissent and counts independent sources (ADR-0002); external contact is
 *                           returned as a GOVERNED PROPOSAL, never executed here
 *  4 Actionable knowledge   Question->Evidence->Answer->Options->Preconditions->Implementation->
 *                           Verification->Experience; learning signal = verified effect, not prose
 *  5 Experience expansion   opportunities inside authorization; curiosity never authorizes effects
 */

// ---------- 1 Epistemic self-model -------------------------------------------------------------
export const CATEGORIES = ["verified", "contextual", "inference", "hypothesis", "known_unknown", "contradictory", "suspected_blind_spot", "cooperative"];
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** claims: [{topic, tag (SRM), statement, source, context?, asOf?, verifiedBy?}] -> per-topic state */
export function classify(claims, { knownUnknowns = [], blindSpotSignals = [], cooperativeSources = {} } = {}) {
  const byTopic = new Map();
  for (const c of claims) { const t = norm(c.topic); if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(c); }
  const out = {};
  for (const [topic, cs] of byTopic) {
    const statements = new Set(cs.filter((c) => !["HYPOTHESIS"].includes(c.tag)).map((c) => norm(c.statement)));
    let category;
    if (statements.size > 1) category = "contradictory";
    else if (cs.some((c) => (c.tag === "FACT" || c.tag === "EXTERNAL_EVIDENCE") && c.verifiedBy)) category = cs.some((c) => c.context) ? "contextual" : "verified";
    else if (cs.some((c) => c.tag === "INFERENCE")) category = "inference";
    else category = "hypothesis";
    out[topic] = { category, claims: cs, sources: [...new Set(cs.map((c) => c.source))] };
  }
  for (const k of knownUnknowns) { const t = norm(k.topic); out[t] ??= { category: cooperativeSources[t] ? "cooperative" : "known_unknown", claims: [], sources: [], resolvableVia: cooperativeSources[t] ?? null }; }
  for (const b of blindSpotSignals) { const t = norm(b.topic); if (!out[t] || out[t].category === "verified") out[t] = { ...(out[t] ?? { claims: [], sources: [] }), category: "suspected_blind_spot", signal: b.signal }; }
  return out;
}

/** Metacognitive calibration: predictions [{id, claimsKnown:boolean, confidence}] vs truth {id: correct:boolean}. */
export function metacognition(predictions, truth) {
  let tp = 0, fp = 0, tn = 0, fn = 0, brier = 0;
  for (const p of predictions) {
    const ok = !!truth[p.id];
    if (p.claimsKnown && ok) tp++; else if (p.claimsKnown && !ok) fp++; else if (!p.claimsKnown && !ok) tn++; else fn++;
    brier += ((p.claimsKnown ? p.confidence : 1 - p.confidence) - (ok ? 1 : 0)) ** 2;
  }
  const n = predictions.length || 1;
  return { overclaim: fp, appropriateAbstention: tn, needlessAbstention: fn, correctClaims: tp,
    unknownRecall: tn + fp ? +(tn / (tn + fp)).toFixed(3) : null, brier: +(brier / n).toFixed(3) };
}

// ---------- 2 Question evolution -----------------------------------------------------------------
const ORIGINS = ["experience", "contradiction", "gap", "surprise", "analogy", "relation"];
export function proposeQuestion({ text, origin, about, goalLinks = [], evidenceAvailable = 0, cost = 1, expectedUse = "" }) {
  if (!ORIGINS.includes(origin)) throw Error("question_origin");
  if (!/\?$/.test(text.trim())) throw Error("question_form");
  return { id: "q-" + Buffer.from(norm(text)).toString("base64url").slice(0, 16), text: text.trim(), origin, about, goalLinks, evidenceAvailable, cost, expectedUse };
}
/** Scores in [0,1]; weights fixed and documented. Insight favours contradictions/surprises. */
export function scoreQuestion(q, { activeGoals }) {
  const relevance = q.goalLinks.filter((g) => activeGoals.includes(g)).length / Math.max(1, Math.min(2, activeGoals.length));
  const insight = { contradiction: 1, surprise: 0.9, gap: 0.8, analogy: 0.6, relation: 0.6, experience: 0.5 }[q.origin];
  const answerability = Math.min(1, 0.3 + 0.35 * q.evidenceAvailable);
  const utility = q.expectedUse ? 1 : 0.3;
  const total = +(0.35 * Math.min(1, relevance) + 0.25 * insight + 0.2 * answerability + 0.2 * utility - 0.05 * Math.max(0, q.cost - 1)).toFixed(3);
  return { ...q, scores: { relevance: Math.min(1, relevance), insight, answerability, utility }, total };
}
/** Portfolio: pursue within budget; park interesting-but-irrelevant questions (side quests). */
export function portfolio(questions, { activeGoals, budget, minRelevance = 0.5 }) {
  const scored = questions.map((q) => scoreQuestion(q, { activeGoals })).sort((a, b) => b.total - a.total);
  const pursue = [], parked = []; let spent = 0;
  for (const q of scored) {
    if (q.scores.relevance < minRelevance) { parked.push({ ...q, reason: "side_quest_low_relevance" }); continue; }
    if (spent + q.cost > budget) { parked.push({ ...q, reason: "budget" }); continue; }
    pursue.push(q); spent += q.cost;
  }
  return { pursue, parked, spent };
}

// ---------- 3 Cooperative intelligence -------------------------------------------------------------
/** Competence relation (entity x domain) as Beta(successes+1, failures+1); context-dependent. */
export class CompetenceRelations {
  constructor() { this.r = new Map(); }
  key(entity, domain) { return `${entity}::${domain}`; }
  record(entity, domain, { useful, independentOf = null }) {
    const k = this.key(entity, domain); const v = this.r.get(k) ?? { a: 1, b: 1, n: 0, independentOf: new Set() };
    useful ? v.a++ : v.b++; v.n++; if (independentOf) v.independentOf.add(independentOf); this.r.set(k, v); return v;
  }
  expected(entity, domain) { const v = this.r.get(this.key(entity, domain)); return v ? v.a / (v.a + v.b) : 0.5; }
  /** Select partners; entities requiring external contact are returned as governed proposals. */
  select(domain, entities, { k = 1, explorationBonus = 0.1 } = {}) {
    return entities.map((e) => { const v = this.r.get(this.key(e.id, domain)); const n = v?.n ?? 0;
      return { ...e, score: +(this.expected(e.id, domain) + explorationBonus / Math.sqrt(n + 1)).toFixed(3),
        requires: e.external ? "governed_action:contact_external_party" : e.dataEgress ? "governed_action:data_disclosure" : "none" }; })
      .sort((a, b) => b.score - a.score).slice(0, k);
  }
}
/** A precise question: names the object, the decision it informs, the evidence wanted, and a scope. */
export function questionPrecision(text) {
  const t = norm(text); const checks = {
    specificObject: /\b(which|what|how many|is|does|when|who)\b/.test(t) && t.split(" ").length >= 6,
    decisionContext: /\b(so that|to decide|for|because|in order to)\b/.test(t),
    evidenceAsked: /\b(source|cite|evidence|verified|according to|link)\b/.test(t),
    bounded: /\b(current|as of|version|revision|exact|only|in)\b/.test(t) };
  return { ...checks, score: Object.values(checks).filter(Boolean).length / 4 };
}
/** Merge perspectives; keep dissent; count independent sources (raw != independent, ADR-0002). */
export function synthesize(perspectives) {
  const groups = new Map();
  for (const p of perspectives) { const k = norm(p.answer); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const ranked = [...groups.entries()].map(([answer, ps]) => ({ answer, raw: ps.length, independent: new Set(ps.map((p) => p.independenceGroup ?? p.source)).size, sources: ps.map((p) => p.source) }))
    .sort((a, b) => b.independent - a.independent || b.raw - a.raw);
  const dissent = ranked.length > 1 ? (ranked[1].independent >= 1 && ranked.slice(1).some((r) => perspectives.some((p) => norm(p.answer) === r.answer && p.privateEvidence)) ? "DECISIVE_PRIVATE_EVIDENCE" : "PRESENT") : "NONE";
  return { leading: ranked[0] ?? null, alternatives: ranked.slice(1), dissent, escalate: dissent === "DECISIVE_PRIVATE_EVIDENCE" };
}
export function cooperationQuality({ before, after, costUnits, dissentPreserved }) {
  return { gain: +(after - before).toFixed(3), gainPerCost: costUnits ? +((after - before) / costUnits).toFixed(3) : null, dissentPreserved: !!dissentPreserved };
}

// ---------- 4 Actionable knowledge -----------------------------------------------------------------
const PIPE = ["question", "evidence", "answer", "options", "preconditions", "implementation", "verification", "experience"];
export function actionable(record) {
  const missing = PIPE.filter((k) => record[k] === undefined || (Array.isArray(record[k]) && !record[k].length));
  const verified = record.verification?.result === "pass";
  const governed = (record.implementation ?? []).filter((s) => s.effect && !s.governedBy);
  return { complete: missing.length === 0, missing, verified, ungovernedEffects: governed.map((s) => s.step),
    // Learning signal comes from the verified effect, not from the wording of the answer.
    learningSignal: missing.length ? null : verified ? 1 : record.verification?.result === "fail" ? -1 : 0 };
}

// ---------- 5 Experience space expansion -----------------------------------------------------------
const INTERNAL = new Set(["simulation", "retrospective", "perspective_shift", "analogy", "self_test"]);
export function opportunities(signals) {
  return signals.map((s) => ({ ...s, executableInternally: INTERNAL.has(s.kind) && !s.touchesExternal,
    requires: INTERNAL.has(s.kind) && !s.touchesExternal ? "none" : "governed_action:" + (s.touchesExternal ? "external" : s.kind) }));
}

// ---------- Persistence through the EXISTING candidate store -----------------------------------------
export function toCandidateProposal({ kind, content, actor, taskId, runId, claims }) {
  const type = { question: "open_question", relation: "process_pattern", epistemic_state: "observation", actionable: "decision" }[kind];
  if (!type) throw Error("kind");
  return { actor, action: "nyxa_memory_store_candidate", target: "memory:/candidate", scope: "memory:/", claims,
    uncertainty: 0.5, requestedCapabilityClass: "I1", estimatedIrreversibility: "I1", provenance: { taskId, runId, requestingIdentity: actor },
    payload: { content: String(content).slice(0, 4000), candidate_type: type, source: "agent", scope: "project",
      purpose: `epistemic-evolution:${kind}`, confidence: 0.6, importance: 0.5 } };
}
