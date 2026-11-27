// Applies Question Evolution to REAL signals from CE-01/R4 (not pre-registered; a demonstration of use).
import fs from "node:fs";
import { proposeQuestion, portfolio, classify, toCandidateProposal } from "../../modules/cognition/epistemic-evolution/epistemicEvolution.mjs";
const goals = ["authority-v2-enforcement", "ce-02", "sophia-learning-loop", "security-closure"];
const qs = [
  proposeQuestion({ text: "Which transfer tasks discriminate between memory-only and strategy-augmented agents without hitting the CE-01 ceiling?", origin: "surprise", about: "CE-01 transfer ceiling", goalLinks: ["ce-02"], evidenceAvailable: 1, expectedUse: "design CE-02 transfer set" }),
  proposeQuestion({ text: "Does executeAllowedProposal re-verify the attested proposal digest before the effect?", origin: "gap", about: "executor binding", goalLinks: ["authority-v2-enforcement"], evidenceAvailable: 2, expectedUse: "close executor gap before observe stage" }),
  proposeQuestion({ text: "Why did keyword scoring and the blinded judge disagree on E4 for all conditions?", origin: "contradiction", about: "evaluator validity", goalLinks: ["ce-02"], evidenceAvailable: 2, expectedUse: "fix scoring keys before CE-02" }),
  proposeQuestion({ text: "Which consented, minimal Sophia interaction export would allow a real learning cycle?", origin: "gap", about: "F7", goalLinks: ["sophia-learning-loop"], evidenceAvailable: 0, cost: 2, expectedUse: "unblock Sophia loop" }),
  proposeQuestion({ text: "Can a redaction filter that matches only names ending in KEY or SECRET leak plural key variables like *_KEYS?", origin: "experience", about: "R4 key exposure", goalLinks: ["security-closure"], evidenceAvailable: 2, expectedUse: "fix redaction patterns in all scripts" }),
  proposeQuestion({ text: "How do biological immune systems distinguish self from non-self, by analogy to agent attestation?", origin: "analogy", about: "identity", goalLinks: [], evidenceAvailable: 1 }),
  proposeQuestion({ text: "Which LiteAvatar rendering latency is achievable on CPU-only Server B?", origin: "relation", about: "avatar", goalLinks: ["sophia-learning-loop"], evidenceAvailable: 0, cost: 3, expectedUse: "decide self-hosted avatar" }),
];
const p = portfolio(qs, { activeGoals: goals, budget: 5 });
const state = classify([
  { topic: "strategy gain beyond memory", tag: "INFERENCE", statement: "none measured", source: "research/ce-01/REPORT.md" },
  { topic: "memory effect", tag: "FACT", statement: "+0.055 quality vs A", source: "research/ce-01/runs/scorecard.json", verifiedBy: "evaluator-ce01" },
  { topic: "e4 quality", tag: "CLAIM", statement: "0.67", source: "objective keys" }, { topic: "e4 quality", tag: "CLAIM", statement: "2/2", source: "blinded judge" }],
  { knownUnknowns: [{ topic: "supabase oauth server capability" }, { topic: "liteavatar cpu latency" }, { topic: "sophia interaction learning effect" }],
    blindSpotSignals: [{ topic: "memory effect", signal: "single run, one model family" }] });
const out = { note: "not pre-registered; real CE-01/R4 signals", pursue: p.pursue.map((q) => ({ text: q.text, total: q.total, scores: q.scores })),
  parked: p.parked.map((q) => ({ text: q.text, total: q.total, reason: q.reason })), epistemicState: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.category])),
  candidateProposals: p.pursue.map((q) => toCandidateProposal({ kind: "question", content: q.text, actor: "claude", taskId: "r4-addendum", runId: "1",
    claims: [{ tag: "INFERENCE", statement: `question from ${q.origin}: ${q.about}`, source: "research/ce-01b/question-portfolio.mjs" }] })) };
fs.writeFileSync(new URL("runs/question-portfolio.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ pursue: out.pursue.map((q) => [q.total, q.text.slice(0, 70)]), parked: out.parked.map((q) => [q.reason, q.text.slice(0, 50)]), state: out.epistemicState }, null, 1));
