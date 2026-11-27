/**
 * NYXA Generative Relational Intelligence (CE-02 research extension), 2026-11-27 Europe/Berlin.
 * Owner: Johannes Suess. Generated with Claude Code. Status: DRAFT / TESTED-IN-ISOLATION, not connected.
 * Predecessor: ./epistemicEvolution.mjs (CompetenceRelations, synthesize, actionable, toCandidateProposal).
 *
 * Stages (research framing by the owner): 1 individual, 2 networked, 3 cooperative,
 * 4 generative relational (joint new hypotheses), 5 evolutive relational (learning how to cooperate).
 * This file covers 4 and 5 on top of the stage-3 primitives. No new memory: persistence only via
 * toCandidateProposal() into the EXISTING candidate store; cooperation strategies only via
 * strategy-evolution createCandidate() (kind "cooperation") and gamma-governed adoption.
 * External contact / data disclosure is only ever returned as a governed proposal label.
 */
import { actionable, toCandidateProposal } from "./epistemicEvolution.mjs";

const key = (members) => [...new Set(members)].sort().join("+");

// ---------- Productive constellations (stage 5: relations themselves evolve) ----------------------
/**
 * Learns, per domain, how productive a SET of partners is relative to its best member alone.
 * synergy = jointQuality - bestIndividualQuality  (measured, never self-reported).
 */
export class ConstellationRelations {
  constructor() { this.c = new Map(); }
  record(members, domain, { jointQuality, bestIndividualQuality }) {
    if (![jointQuality, bestIndividualQuality].every((x) => x >= 0 && x <= 1)) throw Error("quality_range");
    const k = `${key(members)}::${domain}`; const v = this.c.get(k) ?? { a: 1, b: 1, n: 0, synergySum: 0 };
    const synergy = jointQuality - bestIndividualQuality; synergy > 0 ? v.a++ : v.b++; v.n++; v.synergySum += synergy;
    this.c.set(k, v); return { synergy: +synergy.toFixed(3), pSynergy: +(v.a / (v.a + v.b)).toFixed(3) };
  }
  stats(members, domain) {
    const v = this.c.get(`${key(members)}::${domain}`);
    return v ? { pSynergy: v.a / (v.a + v.b), meanSynergy: v.synergySum / v.n, n: v.n } : { pSynergy: 0.5, meanSynergy: 0, n: 0 };
  }
  /**
   * Propose a constellation of `size` from `pool` [{id, discipline, external?, dataEgress?}] using
   * individual competence (CompetenceRelations), learned constellation synergy and discipline diversity.
   */
  propose(domain, pool, { size = 2, competence, diversityWeight = 0.15, explorationBonus = 0.1 } = {}) {
    const combos = []; const rec = (start, acc) => { if (acc.length === size) return combos.push(acc);
      for (let i = start; i < pool.length; i++) rec(i + 1, [...acc, pool[i]]); }; rec(0, []);
    const scored = combos.map((set) => {
      const ids = set.map((p) => p.id); const s = this.stats(ids, domain);
      const comp = set.reduce((t, p) => t + (competence ? competence.expected(p.id, domain) : 0.5), 0) / set.length;
      const diversity = new Set(set.map((p) => p.discipline)).size / set.length;
      const score = comp + s.meanSynergy + diversityWeight * diversity + explorationBonus / Math.sqrt(s.n + 1);
      const requires = [...new Set(set.flatMap((p) => [p.external && "governed_action:contact_external_party", p.dataEgress && "governed_action:data_disclosure"]).filter(Boolean))];
      return { members: ids, score: +score.toFixed(3), diversity: +diversity.toFixed(2), learned: s, requires };
    });
    return scored.sort((a, b) => b.score - a.score);
  }
}

// ---------- Joint hypothesis and question development (stage 4) ------------------------------------
/**
 * contributions: [{agent, discipline, premises:[{id, statement, tag}]}]
 * hypotheses:    [{id, statement, premiseIds[], prediction, falsifier, proposedBy[]}]
 * A hypothesis is EMERGENT iff its premises come from >= 2 agents and no single agent holds all of them,
 * i.e. no participant could have formed it from its own premises alone. Testable iff prediction+falsifier.
 */
export function jointHypotheses(contributions, hypotheses) {
  const owner = new Map(); const disc = new Map();
  for (const c of contributions) for (const p of c.premises) { owner.set(p.id, c.agent); disc.set(p.id, c.discipline); }
  return hypotheses.map((h) => {
    const unknown = h.premiseIds.filter((id) => !owner.has(id));
    const agents = new Set(h.premiseIds.map((id) => owner.get(id)).filter(Boolean));
    const disciplines = new Set(h.premiseIds.map((id) => disc.get(id)).filter(Boolean));
    const singleSufficient = contributions.some((c) => h.premiseIds.every((id) => c.premises.some((p) => p.id === id)));
    return { ...h, tag: "HYPOTHESIS", unknownPremises: unknown, agents: [...agents], disciplines: [...disciplines],
      emergent: unknown.length === 0 && agents.size >= 2 && !singleSufficient,
      testable: !!(h.prediction && h.falsifier), interdisciplinary: disciplines.size >= 2 };
  });
}

/** Insight gain over individuals: verified items in the joint output that NO individual output contained. */
export function emergenceGain({ individualOutputs, jointOutput, verified }) {
  const v = new Set(verified); const indiv = new Set(individualOutputs.flat().filter((x) => v.has(x)));
  const joint = new Set(jointOutput.filter((x) => v.has(x)));
  const novel = [...joint].filter((x) => !indiv.has(x));
  return { individualUnion: indiv.size, joint: joint.size, novelVerified: novel, gain: novel.length,
    lost: [...indiv].filter((x) => !joint.has(x)) };
}

/** Interdisciplinary synthesis quality; dissent must survive (ADR-0002 counting of independent sources). */
export function synthesisQuality(hyps, { dissentPreserved }) {
  const accepted = hyps.filter((h) => h.emergent && h.testable);
  const disciplines = new Set(accepted.flatMap((h) => h.disciplines));
  const crossLinks = accepted.filter((h) => h.interdisciplinary).length;
  return { acceptedHypotheses: accepted.length, disciplinesIntegrated: disciplines.size, crossLinks,
    dissentPreserved: !!dissentPreserved, score: accepted.length ? +((crossLinks / accepted.length) * (dissentPreserved ? 1 : 0.5)).toFixed(3) : 0 };
}

// ---------- From joint insight to an executable experiment ----------------------------------------
/** Turns a testable hypothesis into an actionable record; effects outside the sandbox stay governed. */
export function toExperiment(h, { evidence = [], options = [], preconditions = [], steps = [] }) {
  if (!h.testable) throw Error("hypothesis_not_testable");
  const record = { question: `Does ${h.prediction} hold?`, evidence, answer: h.statement, options, preconditions,
    implementation: steps, verification: { plan: h.falsifier, result: "pending" }, experience: { hypothesisId: h.id } };
  return { record, check: actionable(record) };
}

// ---------- Reflection and cooperation-strategy experiences ----------------------------------------
/** Individual vs joint contribution; credit is assigned to premises that entered emergent hypotheses. */
export function reflect(hyps) {
  const credit = {};
  for (const h of hyps.filter((x) => x.emergent)) for (const a of h.agents) credit[a] = (credit[a] ?? 0) + 1 / h.agents.length;
  return { emergentCount: hyps.filter((h) => h.emergent).length,
    credit: Object.fromEntries(Object.entries(credit).map(([k, v]) => [k, +v.toFixed(3)])) };
}

/** SRM experience for strategy-evolution createCandidate({kind:"cooperation"}); measured, not narrated. */
export function cooperationExperience({ runId, members, domain, synergy, source }) {
  return { tag: "EXTERNAL_EVIDENCE", statement: `constellation ${key(members)} in ${domain}: measured synergy ${synergy}`, source: source ?? `run:${runId}` };
}

/** Persistence through the existing candidate store only. */
export function persistHypothesis(h, { actor, taskId, runId }) {
  return toCandidateProposal({ kind: "question", content: `${h.statement} | prediction: ${h.prediction} | falsifier: ${h.falsifier}`,
    actor, taskId, runId, claims: [{ tag: "HYPOTHESIS", statement: h.statement, source: `run:${runId}` }] });
}
