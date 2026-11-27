import test from "node:test"; import assert from "node:assert/strict";
import { DevelopmentModel, possibility, connections, PersonalQuestions, createCoEvolution, advance, verifyEffect, heartbeatTick, profilePermissions, PROFILES, persist } from "./evolutionAssistant.mjs";
const T = "2026-11-27";
function model() {
  const m = new DevelopmentModel("p1");
  m.add({ kind: "SELF_STATEMENT", dimension: "interest", statement: "interdisciplinary dialogue formats", source: "conv:1", asOf: T, author: "human" });
  m.add({ kind: "OBSERVED_FACT", dimension: "capability", statement: "built a governed multi-agent research setup", source: "repo:ce-01b", asOf: T, author: "sophia" });
  m.add({ kind: "SELF_STATEMENT", dimension: "resource", statement: "a public editorial section and a dialogue series", source: "conv:2", asOf: T, author: "human" });
  return m;
}
test("development model: provenance, kinds, no typologies, human control", () => {
  const m = model();
  assert.throws(() => m.add({ kind: "SELF_STATEMENT", dimension: "value", statement: "x", source: "s", asOf: T, author: "sophia" }), /self_statement_only_by_human/);
  assert.throws(() => m.add({ kind: "INTERPRETATION", dimension: "value", statement: "is an INTJ", source: "s", asOf: T, author: "sophia" }), /no_psychological_classification/);
  assert.throws(() => m.add({ kind: "HYPOTHESIS", dimension: "goal", statement: "should found a startup", source: "s", asOf: T, author: "sophia" }), /goals_set_only_by_human/);
  assert.throws(() => m.add({ kind: "HYPOTHESIS", dimension: "value", statement: "x", author: "sophia" }), /provenance_required/);
  m.correct("e2", "built and evaluated a governed research setup", { by: "human" }); assert.equal(m.get("e2").history.length, 1);
  assert.throws(() => m.correct("e2", "y", { by: "sophia" }), /only_human_corrects/);
  m.object("e3", { by: "human" }); assert.equal(m.usable().length, 2); assert.equal(m.view().entries.length, 3);
  const g = m.suggestGoal("run one Dialogues session on relational intelligence", { rationale: "e1+e2" }); assert.equal(m.activeGoals().length, 0);
  m.decideGoal(g.id, true, { by: "human" }); assert.deepEqual(m.activeGoals(), [g.text]);
});
test("possibility navigator: grounded, concrete, feasibility, governed effects", () => {
  const m = model();
  const p = possibility(m, { title: "pilot", kind: "interdisciplinary", basedOn: ["e1", "e2"], rationale: "combine", nextSteps: ["draft 1-page format"], needs: ["dialogue series"], effects: ["contact_external"] });
  assert.equal(p.feasibility.ok, true); assert.deepEqual(p.requires, ["governed_action:contact_external_party"]);
  assert.throws(() => possibility(m, { title: "x", basedOn: ["e2"], rationale: "r", nextSteps: ["s"] }), /insufficient_grounding/);
  assert.throws(() => possibility(m, { title: "x", basedOn: ["e1", "e2"], rationale: "r", nextSteps: [] }), /rationale_and_next_steps/);
  m.object("e1", { by: "human" }); assert.throws(() => possibility(m, { title: "x", basedOn: ["e1", "e2"], rationale: "r", nextSteps: ["s"] }), /objected/);
  const c = connections(model(), (e) => (/dialog|research/.test(e.statement) ? ["dialogue-research"] : []));
  assert.equal(c.length, 1);
});
test("question evolution: interruption budget and personal fit", () => {
  const q = new PersonalQuestions({ maxPerInteraction: 1, cooldownTurns: 3 });
  for (let i = 0; i < 5; i++) q.record("p1", "planning", "contradiction", { helpful: true });
  for (let i = 0; i < 5; i++) q.record("p1", "planning", "analogy", { helpful: false });
  const cands = [{ text: "Which assumption in the plan could be wrong?", origin: "contradiction", goalLinks: ["g"], evidenceAvailable: 1, expectedUse: "decide" },
    { text: "What is this like in biology?", origin: "analogy", goalLinks: ["g"], evidenceAvailable: 1, expectedUse: "decide" }];
  const r = q.select("p1", "planning", cands, { turn: 10, activeGoals: ["g"] });
  assert.equal(r.ask.length, 1); assert.equal(r.ask[0].origin, "contradiction");
  assert.equal(q.select("p1", "planning", cands, { turn: 11, activeGoals: ["g"] }).reason, "cooldown");
  assert.equal(q.select("p1", "planning", cands, { turn: 20, activeGoals: ["g"], userBusy: true }).reason, "user_busy");
});
test("co-evolution: order, human decision, governed authorization, separate spaces", () => {
  const m = model(); const p = possibility(m, { title: "pilot", kind: "x", basedOn: ["e1", "e2"], rationale: "r", nextSteps: ["s"], effects: ["contact_external"] });
  const s = createCoEvolution("p1");
  for (const ph of ["reflect", "discover", "question", "connect", "explore"]) advance(s, ph);
  assert.throws(() => advance(s, "act", { proposal: p, decision: { by: "sophia", accept: true } }), /human_decision/);
  assert.throws(() => advance(s, "act", { proposal: p, decision: { by: "human", accept: true } }), /needs_authorization/);
  advance(s, "act", { proposal: p, decision: { by: "human", accept: true, governedApprovalRef: "grant-1" } });
  advance(s, "verify"); advance(s, "learn", { human: "skill", ai: "strategy-signal", relational: "pairing works" });
  assert.deepEqual(Object.values(s.spaces).map((x) => x.length), [1, 1, 1]);
  assert.throws(() => advance(s, "observe"), /cycle_order/);
  const v = verifyEffect(p, { decision: "accepted", observedEffect: "session held", verification: { result: "pass" } });
  assert.equal(v.learningSignal, 1);
});
test("heartbeat: silence is valid, no external actions, interruption budget", () => {
  const now = Date.parse("2026-11-27T23:30:00Z"); const prop = { title: "pilot", status: "proposed", feasibility: { ok: true } };
  assert.equal(heartbeatTick({ now, openQuestions: ["q"] }).outcome, "silent_reflection");
  assert.equal(heartbeatTick({ now, proposals: [prop] }).outcome, "hold_until_appropriate");
  const day = Date.parse("2026-11-27T14:00:00Z");
  assert.equal(heartbeatTick({ now: day, proposals: [prop], lastContactAt: day - 3.6e6 }).communicate, false);
  const t = heartbeatTick({ now: day, proposals: [prop], assumptions: [{ id: "a1", contradictedBy: ["obs-3"] }] });
  assert.equal(t.outcome, "revise_assumptions"); assert.deepEqual(t.externalActions, []);
  assert.equal(heartbeatTick({ now: day, proposals: [prop] }).message.requiresHumanDecision, true);
});
test("profiles share one core and never grant authority; persistence is personal-scoped", () => {
  assert.equal(Object.keys(PROFILES).length, 8);
  for (const n of Object.keys(PROFILES)) assert.equal(profilePermissions(n).grantsAuthority, false);
  const c = persist("question", "Which assumption could be wrong?", { actor: "sophia", taskId: "t", runId: "r", personId: "p1" });
  assert.equal(c.target, "memory:/candidate"); assert.equal(c.payload.scope, "personal");
});
