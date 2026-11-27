// WP4 full vertical cycle on SYNTHETIC data: experience -> reflection -> hypothesis -> possibility ->
// human decision -> authorized action -> result -> evaluation -> strategic learning, plus reject/never/
// correct/revoke/no-action and re-proposal bypass attempts.
import test from "node:test"; import assert from "node:assert/strict";
import { DevelopmentModel, verifyEffect, createCoEvolution, advance } from "./evolutionAssistant.mjs";
import { DecisionLedger, manipulationCheck, discoverOpportunities, draftPossibility, extractStrategy, transferProposal, CollaborationForms,
  Perspectives, collaborativeResearch, snapshot, longitudinal, InitiativeCalibration } from "./evolutionExtensions.mjs";
const D = 86400e3; const t0 = Date.parse("2026-11-27T10:00:00Z");
const theme = (e) => [/(diagram|explain|workshop|visual)/i.test(e.statement) && "explaining"].filter(Boolean);
function synth() {
  const m = new DevelopmentModel("synthetic-1"); let n = 0; const H = (dimension, statement) => m.add({ kind: "SELF_STATEMENT", dimension, statement, source: `synthetic:conv-${++n}`, asOf: "2026-11-27", author: "human" });
  H("interest", "I enjoy sketching system diagrams"); H("capability", "I explain complex topics well in workshops");
  H("resource", "two free evenings per week and a small meetup group"); H("goal", "become better at teaching technical topics");
  m.add({ kind: "OBSERVED_FACT", dimension: "experience", statement: "a workshop with hand-drawn visual diagrams was rated 4.6/5", source: "synthetic:feedback", asOf: "2026-11-20", author: "sophia" });
  return m;
}
test("positive path: full cycle with authorized action, result, evaluation, strategic learning", async () => {
  const m = synth(); const before = snapshot(m, "t0"); const L = new DecisionLedger(); const s = createCoEvolution("synthetic-1");
  advance(s, "reflect"); const [opp] = discoverOpportunities(m, { themeOf: theme, successfulExperiences: [{ entry: "e5" }] });
  assert.ok(opp.basedOn.includes("e1") && opp.basedOn.includes("e2"));
  advance(s, "discover"); advance(s, "question"); advance(s, "connect"); advance(s, "explore");
  const p = draftPossibility(m, opp, { title: "Visual explainer mini-workshop at the meetup", rationale: "Joins sketching and workshop teaching; supported by the 4.6/5 workshop.",
    nextSteps: ["sketch 3 diagrams for one topic", "offer a 20-minute slot at the meetup"], needs: ["meetup"], effects: ["contact_external"] });
  const a = L.admit(p, { now: t0 }); assert.equal(a.ok, true);
  await assert.rejects(L.execute(a.id, { executor: async () => ({}), now: t0 }), /not_accepted/);
  L.decide(a.id, { by: "human", verdict: "accept", now: t0 + 1 });
  await assert.rejects(L.execute(a.id, { executor: async () => ({}), now: t0 }), /needs_grant/);
  advance(s, "act", { proposal: p, decision: { by: "human", accept: true, governedApprovalRef: "grant:synthetic-contact-1" } });
  const it = await L.execute(a.id, { grantRef: "grant:synthetic-contact-1", now: t0 + 2, executor: async (prop) => ({ sandboxed: true, sent: `draft message for: ${prop.title}`, irreversible: false }) });
  assert.equal(it.status, "executed");
  advance(s, "verify"); const ev = verifyEffect(p, { decision: "accepted", observedEffect: "slot held, 12 attendees, 4.4/5", verification: { result: "pass" } });
  assert.equal(ev.learningSignal, 1);
  const strat = extractStrategy({ id: "strat-visual-first-teaching", title: "draw before explaining", procedure: ["sketch the system first", "explain along the sketch"], context: "technical teaching",
    limits: ["not for purely numeric topics"], experiences: [{ tag: "EXTERNAL_EVIDENCE", statement: "workshop 4.6/5 with diagrams", source: "synthetic:feedback" }, { tag: "EXTERNAL_EVIDENCE", statement: "meetup 4.4/5 with diagrams", source: "synthetic:result" }] });
  assert.equal(strat.status, "candidate"); assert.equal(transferProposal(strat, "writing documentation").humanDecides, true);
  advance(s, "learn", { human: "taught with visuals twice", ai: strat.id, relational: "sophia_drafts_human_decides worked" }); advance(s, "evolve");
  m.add({ kind: "OBSERVED_FACT", dimension: "experience", statement: "meetup talk with visual diagrams rated 4.4/5", source: "synthetic:result", asOf: "2026-12-04", author: "sophia" });
  const lg = longitudinal(before, snapshot(m, "t1")); assert.deepEqual(lg.added, ["e6"]); assert.match(lg.note, /not a score/);
});
test("rejection is effective; re-proposal bypass blocked; never is permanent", () => {
  const m = synth(); const L = new DecisionLedger(); const [opp] = discoverOpportunities(m, { themeOf: theme });
  const mk = (title, basedOn = opp.basedOn) => ({ ...draftPossibility(m, { basedOn }, { title, rationale: "r", nextSteps: ["s"] }) });
  const a = L.admit(mk("Visual explainer mini-workshop at the meetup"), { now: t0 }); L.decide(a.id, { by: "human", verdict: "reject", now: t0 });
  assert.equal(L.admit(mk("Visual explainer mini-workshop at the meetup"), { now: t0 + D }).reason, "rejected_no_new_basis");
  assert.equal(L.admit(mk("Mini-workshop: visual explainer at the meetup"), { now: t0 + D }).reason, "rejected_no_new_basis"); // reworded
  assert.equal(L.admit(mk("Visual explainer mini-workshop at the meetup", [...opp.basedOn, "e5"]), { now: t0 + 2 * D }).reason, "rejected_no_new_basis"); // too early
  assert.equal(L.admit(mk("Visual explainer mini-workshop at the meetup", [...opp.basedOn, "e5"]), { now: t0 + 31 * D }).ok, true); // new evidence + time: one revisit
  assert.equal(L.admit(mk("Visual explainer mini-workshop at the meetup", [...opp.basedOn, "e5", "e3"]), { now: t0 + 70 * D }).reason, "rejected_no_new_basis"); // only once
  const L2 = new DecisionLedger(); const b = L2.admit(mk("Visual explainer mini-workshop at the meetup"), { now: t0 });
  L2.decide(b.id, { by: "human", verdict: "reject", never: true, now: t0 });
  assert.equal(L2.admit(mk("Visual explainer mini-workshop at the meetup", [...opp.basedOn, "e5"]), { now: t0 + 400 * D }).reason, "rejected_permanently");
  assert.throws(() => L2.decide(b.id, { by: "sophia", verdict: "accept", now: t0 }), /only_human_decides/);
});
test("correction, revocation and deliberate non-action", async () => {
  const m = synth(); const L = new DecisionLedger(); const [opp] = discoverOpportunities(m, { themeOf: theme });
  const a = L.admit(draftPossibility(m, opp, { title: "Weekly sketch practice", rationale: "r", nextSteps: ["30 min sketching"] }), { now: t0 });
  L.correct(a.id, { nextSteps: ["15 min sketching on Sundays"] }, { by: "human", now: t0 }); assert.equal(L.get(a.id).status, "awaiting_decision");
  L.decide(a.id, { by: "human", verdict: "accept", now: t0 }); L.revoke(a.id, { by: "human", now: t0 + 1, reason: "changed my mind" });
  await assert.rejects(L.execute(a.id, { executor: async () => ({}), now: t0 }), /not_accepted:revoked/);
  const b = L.admit(draftPossibility(m, opp, { title: "Record a short video course", rationale: "r", nextSteps: ["outline"] }), { now: t0 });
  assert.equal(L.decide(b.id, { by: "human", verdict: "no_action", reason: "not now", now: t0 }).status, "deliberately_not_acting");
  await assert.rejects(L.execute(b.id, { executor: async () => ({}), now: t0 }), /not_accepted/);
});
test("WP7 manipulation guard rejects pressure, scarcity, guilt and gamification", () => {
  for (const t of ["Act now, last chance!", "Du musst das jetzt sofort machen", "Everyone else already did it", "Keep your streak and earn points"]) assert.equal(manipulationCheck(t).ok, false, t);
  assert.equal(manipulationCheck("One option could be a short workshop; you decide.").ok, true);
  const m = synth(); const [opp] = discoverOpportunities(m, { themeOf: theme });
  assert.throws(() => draftPossibility(m, opp, { title: "Last chance workshop", rationale: "act now", nextSteps: ["s"] }), /manipulative_language/);
});
test("WP3 relationship evolution, perspectives, collaborative research, initiative calibration", () => {
  const cf = new CollaborationForms();
  for (let i = 0; i < 3; i++) cf.record("sophia_drafts_human_decides", "planning", { jointQuality: 0.8, humanAloneQuality: 0.6 });
  for (let i = 0; i < 3; i++) cf.record("joint_brainstorm", "planning", { jointQuality: 0.5, humanAloneQuality: 0.6 });
  assert.equal(cf.suggest("planning")[0].form, "sophia_drafts_human_decides");
  const pv = new Perspectives(); const off = pv.offer("career", [{ text: "From a teacher's view, ..." }, { text: "From a founder's view, ..." }, { text: "c" }]);
  assert.equal(off.offered.length, 2); assert.ok(off.offered.every((o) => o.optional));
  pv.decline("career"); assert.equal(pv.offer("career", [{ text: "x" }]).reason, "declined_before_on_topic"); assert.equal(pv.offer("career", [{ text: "x" }], { asked: true }).offered.length, 1);
  const cr = collaborativeResearch([{ agent: "a", discipline: "education", premises: [{ id: "p1", statement: "s" }] }, { agent: "b", discipline: "design", premises: [{ id: "p2", statement: "s" }] }],
    [{ id: "h", statement: "visual scaffolds reduce load", premiseIds: ["p1", "p2"], prediction: "fewer clarification questions", falsifier: "no difference over 4 sessions" }]);
  assert.equal(cr.length, 1); assert.match(cr[0].nextStep, /governed_action/);
  const ic = new InitiativeCalibration(); assert.equal(ic.shouldInitiate("evening").initiate, false);
  for (let i = 0; i < 4; i++) ic.record("evening", { welcomed: false }); for (let i = 0; i < 4; i++) ic.record("weekend_morning", { welcomed: true });
  assert.equal(ic.shouldInitiate("evening").initiate, false); assert.equal(ic.shouldInitiate("weekend_morning").initiate, true);
});
