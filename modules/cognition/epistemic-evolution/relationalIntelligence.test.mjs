import test from "node:test"; import assert from "node:assert/strict";
import { CompetenceRelations } from "./epistemicEvolution.mjs";
import { ConstellationRelations, jointHypotheses, emergenceGain, synthesisQuality, toExperiment, reflect, persistHypothesis } from "./relationalIntelligence.mjs";
import { createCandidate } from "../strategy-evolution/strategyEvolution.mjs";
import { cooperationExperience } from "./relationalIntelligence.mjs";

const contributions = [
  { agent: "sec", discipline: "security", premises: [{ id: "p1", statement: "nonce consumed before effect", tag: "FACT" }] },
  { agent: "ops", discipline: "operations", premises: [{ id: "p2", statement: "executor restarts under load", tag: "FACT" }, { id: "p3", statement: "load peaks at 18:00", tag: "FACT" }] }];

test("emergent = premises from >=2 agents and no single agent sufficient", () => {
  const h = jointHypotheses(contributions, [
    { id: "h1", statement: "restarts at load peaks cause lost-but-consumed attestations", premiseIds: ["p1", "p2"], prediction: "lost effects cluster at 18:00", falsifier: "no clustering over 7 days" },
    { id: "h2", statement: "load drives restarts", premiseIds: ["p2", "p3"], prediction: "x", falsifier: "y" },
    { id: "h3", statement: "invented", premiseIds: ["p1", "p9"], prediction: "x", falsifier: "y" }]);
  assert.deepEqual(h.map((x) => x.emergent), [true, false, false]);
  assert.equal(h[0].interdisciplinary, true); assert.deepEqual(h[2].unknownPremises, ["p9"]);
  assert.deepEqual(reflect(h).credit, { sec: 0.5, ops: 0.5 });
  const q = synthesisQuality(h, { dissentPreserved: true }); assert.equal(q.acceptedHypotheses, 1); assert.equal(q.score, 1);
  const p = persistHypothesis(h[0], { actor: "nyxa-agent", taskId: "t", runId: "r" });
  assert.equal(p.target, "memory:/candidate"); assert.equal(p.payload.candidate_type, "open_question");
});

test("emergence gain counts only verified items no individual had", () => {
  const g = emergenceGain({ individualOutputs: [["a", "b"], ["c"]], jointOutput: ["a", "c", "d", "z"], verified: ["a", "b", "c", "d"] });
  assert.deepEqual(g.novelVerified, ["d"]); assert.deepEqual(g.lost, ["b"]); assert.equal(g.gain, 1);
});

test("constellations learn measured synergy; external members stay governed", () => {
  const cr = new ConstellationRelations(); const comp = new CompetenceRelations();
  for (let i = 0; i < 4; i++) cr.record(["phys", "arch"], "d", { jointQuality: 0.9, bestIndividualQuality: 0.6 });
  for (let i = 0; i < 4; i++) cr.record(["arch", "agent"], "d", { jointQuality: 0.5, bestIndividualQuality: 0.6 });
  const pool = [{ id: "phys", discipline: "physics", external: true }, { id: "arch", discipline: "software" }, { id: "agent", discipline: "software" }];
  const r = cr.propose("d", pool, { size: 2, competence: comp });
  assert.deepEqual([...r[0].members].sort(), ["arch", "phys"]); assert.deepEqual(r[0].requires, ["governed_action:contact_external_party"]);
  assert.throws(() => cr.record(["a"], "d", { jointQuality: 2, bestIndividualQuality: 0 }), /quality_range/);
});

test("experiment conversion and cooperation strategy via existing strategy-evolution", () => {
  const [h] = jointHypotheses(contributions, [{ id: "h1", statement: "s", premiseIds: ["p1", "p2"], prediction: "lost effects cluster at 18:00", falsifier: "no clustering" }]);
  const e = toExperiment(h, { evidence: ["log"], options: ["observe"], preconditions: ["read-only log access"], steps: [{ step: "read logs", effect: false }] });
  assert.equal(e.check.complete, true); assert.equal(e.check.learningSignal, 0);
  assert.throws(() => toExperiment({ ...h, testable: false }, {}), /not_testable/);
  const s = createCandidate({ id: "strat-coop-diverse-pair", title: "prefer diverse pairs", kind: "cooperation", author: "nyxa-agent", reflectionRef: "r",
    experiences: [cooperationExperience({ runId: "r1", members: ["phys", "arch"], domain: "d", synergy: 0.3 }), cooperationExperience({ runId: "r2", members: ["phys", "arch"], domain: "d", synergy: 0.25 })],
    procedure: ["pick partners from different disciplines"], context: "research", preconditions: [], limits: ["not for live-state questions"],
    successCriteria: [{ metric: "emergenceGain", comparator: ">=", threshold: 1 }], uncertainty: 0.6 });
  assert.equal(s.status, "candidate"); assert.equal(s.kind, "cooperation");
});
