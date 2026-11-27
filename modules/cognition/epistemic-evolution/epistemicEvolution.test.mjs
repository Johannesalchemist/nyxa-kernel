import { test } from "node:test"; import assert from "node:assert/strict";
import * as E from "./epistemicEvolution.mjs";
test("epistemic self-model categories + metacognition", () => {
  const s = E.classify([
    { topic: "mcp revision", tag: "EXTERNAL_EVIDENCE", statement: "2026-07-28", source: "modelcontextprotocol.io", verifiedBy: "fetch" },
    { topic: "bridge auth", tag: "FACT", statement: "ip filter only", source: "apache conf", verifiedBy: "read", context: "server-b" },
    { topic: "reviewers", tag: "CLAIM", statement: "3", source: "chat" }, { topic: "reviewers", tag: "CLAIM", statement: "1", source: "handoff" },
    { topic: "strategy gain", tag: "INFERENCE", statement: "none beyond memory", source: "ce-01" },
    { topic: "transfer", tag: "HYPOTHESIS", statement: "ceiling effect", source: "ce-01" }],
    { knownUnknowns: [{ topic: "supabase oauth server" }, { topic: "server b load" }], cooperativeSources: { "server b load": "live_server_tool" },
      blindSpotSignals: [{ topic: "mcp revision", signal: "single source" }] });
  assert.equal(s["bridge auth"].category, "contextual"); assert.equal(s["reviewers"].category, "contradictory");
  assert.equal(s["strategy gain"].category, "inference"); assert.equal(s["transfer"].category, "hypothesis");
  assert.equal(s["supabase oauth server"].category, "known_unknown"); assert.equal(s["server b load"].category, "cooperative");
  assert.equal(s["mcp revision"].category, "suspected_blind_spot");
  const m = E.metacognition([{ id: 1, claimsKnown: true, confidence: 0.9 }, { id: 2, claimsKnown: true, confidence: 0.8 }, { id: 3, claimsKnown: false, confidence: 0.7 }], { 1: true, 2: false, 3: false });
  assert.deepEqual([m.correctClaims, m.overclaim, m.appropriateAbstention, m.unknownRecall], [1, 1, 1, 0.5]);
});
test("question evolution: scoring, portfolio, side quests parked", () => {
  const goals = ["authority-v2", "ce-02"];
  const qs = [E.proposeQuestion({ text: "Which transfer tasks avoid the ceiling effect seen in CE-01?", origin: "surprise", goalLinks: ["ce-02"], evidenceAvailable: 1, expectedUse: "design CE-02" }),
    E.proposeQuestion({ text: "Does executeAllowedProposal re-check the attested digest?", origin: "gap", goalLinks: ["authority-v2"], evidenceAvailable: 2, expectedUse: "executor binding" }),
    E.proposeQuestion({ text: "How did ancient libraries handle provenance?", origin: "analogy", goalLinks: [], evidenceAvailable: 1 })];
  const p = E.portfolio(qs, { activeGoals: goals, budget: 2 });
  assert.equal(p.pursue.length, 2); assert.equal(p.parked[0].reason, "side_quest_low_relevance");
  assert.throws(() => E.proposeQuestion({ text: "no question mark", origin: "gap" }), /question_form/);
});
test("cooperative intelligence: learned competence, governed external contact, dissent kept", () => {
  const c = new E.CompetenceRelations();
  for (let i = 0; i < 4; i++) c.record("web_official_docs", "protocol_spec", { useful: true });
  c.record("general_model_knowledge", "protocol_spec", { useful: false });
  const sel = c.select("protocol_spec", [{ id: "general_model_knowledge" }, { id: "web_official_docs", external: false }, { id: "human_owner", external: true }], { k: 3 });
  assert.equal(sel[0].id, "web_official_docs"); assert.equal(sel.find((x) => x.id === "human_owner").requires, "governed_action:contact_external_party");
  const s = E.synthesize([{ answer: "A", source: "m1", independenceGroup: "llm" }, { answer: "A", source: "m2", independenceGroup: "llm" }, { answer: "B", source: "live", privateEvidence: true }]);
  assert.equal(s.leading.independent, 1, "two LLM votes are one independence group"); assert.equal(s.dissent, "DECISIVE_PRIVATE_EVIDENCE"); assert.equal(s.escalate, true);
  assert.ok(E.questionPrecision("Which MCP revision is current as of today, so that we pick the auth flow? Please cite the source.").score >= 0.75);
});
test("actionable knowledge learns from verified effect; ungoverned effects flagged; opportunities governed", () => {
  const r = { question: "q", evidence: ["e"], answer: "a", options: ["o"], preconditions: ["p"], implementation: [{ step: "deploy", effect: true }], verification: { result: "pass" }, experience: "x" };
  const a = E.actionable(r); assert.equal(a.learningSignal, 1); assert.deepEqual(a.ungovernedEffects, ["deploy"]);
  assert.equal(E.actionable({ question: "q" }).learningSignal, null);
  const o = E.opportunities([{ kind: "simulation" }, { kind: "experiment", touchesExternal: true }]);
  assert.equal(o[0].requires, "none"); assert.equal(o[1].requires, "governed_action:external");
  assert.equal(E.toCandidateProposal({ kind: "question", content: "x", actor: "claude", taskId: "t", runId: "r", claims: [] }).payload.candidate_type, "open_question");
});
