// Vertical prototype run: real conversation -> experience -> reflection -> question -> possibility ->
// concrete proposal -> (human decision pending). Inputs are the owner's own project-level statements from
// the 2026-11-27 work orders in this session, plus published repository findings. No private data.
import fs from "node:fs";
import { DevelopmentModel, possibility, connections, PersonalQuestions, createCoEvolution, advance, heartbeatTick, persist } from "../evolutionAssistant.mjs";
const T = "2026-11-27"; const m = new DevelopmentModel("owner");
const H = (dimension, statement, source) => m.add({ kind: "SELF_STATEMENT", dimension, statement, source, asOf: T, author: "human" });
const S = (kind, dimension, statement, source, confidence) => m.add({ kind, dimension, statement, source, asOf: T, author: "sophia", confidence });
H("interest", "intelligence may emerge from the quality, diversity and evolution of relationships", "work-order:CE-02");
H("interest", "Digitalleria Dialogues: Sophia could connect people, moderate discussions and develop new research questions", "work-order:CE-02");
H("interest", "LightNet as a learning knowledge network whose participants learn to become smarter together", "work-order:CE-02");
H("resource", "Digitalleria Dialogues series and Sophia's public editorial section", "work-order:CE-02 + room instructions");
S("OBSERVED_FACT", "experience", "CE-01b: cooperative inquiry 0.81 vs individual 0.125; partner choice 7/8 (exploratory, not independent)", "repo:research/ce-01b/runs/adjudication.json", 0.6);
S("OBSERVED_FACT", "knowledge_gap", "CE-02 needs independent judges and a non-Claude holdout before its results count as confirmatory", "repo:research/scoring/validation/RESULT.md", 0.9);
S("HYPOTHESIS", "complementarity", "human discussants supply premises from disciplines no agent shard covers; agents supply structure and verification", "reflection:this-run", 0.4);
const run = { schema: "nyxa-evolution-vertical-v1", date: T, tz: "Europe/Berlin", steps: [] }; const log = (step, data) => run.steps.push({ step, ...data });
const s = createCoEvolution("owner"); log("observe", { entries: m.usable().length });
advance(s, "reflect"); log("reflect", { reflection: "Three self-stated interests (relational intelligence, Dialogues, LightNet) are stated separately; the CE-02 design has no human arm and lacks independent judges." });
advance(s, "discover"); const links = connections(m, (e) => [/relation|together|connect|dialog/i.test(e.statement) && "relational-cooperation", /research|question|inquiry|cooperative/i.test(e.statement) && "research"].filter(Boolean));
log("discover", { connections: links });
advance(s, "question"); const pq = new PersonalQuestions();
const q = pq.select("owner", "research_planning", [
  { text: "Could a Digitalleria Dialogues session serve as the human arm and the independent judging panel of CE-02?", origin: "relation", goalLinks: ["CE-02", "Dialogues"], evidenceAvailable: 2, expectedUse: "decide CE-02 design" },
  { text: "Which discipline is missing from the three CE-02 shards?", origin: "gap", goalLinks: ["CE-02"], evidenceAvailable: 1, expectedUse: "extend shards" },
  { text: "How did ancient academies organise dialogue?", origin: "analogy", goalLinks: [], evidenceAvailable: 1, expectedUse: "" }], { turn: 1, activeGoals: ["CE-02", "Dialogues"] });
log("question", { asked: q.ask.map((x) => x.text), parked: q.parked.map((x) => ({ text: x.text, reason: "budget_or_relevance" })) });
advance(s, "connect"); advance(s, "explore");
const p = possibility(m, { title: "Dialogues x CE-02 pilot: one session as human arm and independent judging panel", kind: "interdisciplinary_research",
  basedOn: ["e1", "e2", "e4", "e6"], rationale: "Joins three separately stated interests and closes CE-02's documented gap (independent judges) with an existing resource (Dialogues series).",
  nextSteps: ["Owner decides whether to pursue (no action before that)", "Draft a 1-page session format: 3-4 discussants from different disciplines, the T3/T4 CE-02 tasks, structured hypothesis cards (premises, prediction, falsifier)",
    "Discussants independently score anonymised agent hypotheses with the CE-02 rubric (blinded)", "Compare emergent-hypothesis rate of humans, agents and mixed groups with jointHypotheses()"],
  needs: ["Dialogues series"], effects: ["contact_external", "publish"] });
log("explore", { possibility: p });
const hb = heartbeatTick({ now: Date.parse("2026-11-27T15:00:00Z"), proposals: [p] });
log("heartbeat", { outcome: hb.outcome, communicate: hb.communicate, externalActions: hb.externalActions });
log("act", { status: "AWAITING_HUMAN_DECISION", note: "advance(s,'act') is refused without a human decision; external contact and publication additionally need governed authorization" });
run.candidateProposals = [persist("question", q.ask[0].text, { actor: "sophia", taskId: "evolution-vertical", runId: T, personId: "owner" })];
run.model = m.view();
fs.writeFileSync(new URL("./run-2026-11-27.json", import.meta.url), JSON.stringify(run, null, 1));
console.log(JSON.stringify({ question: q.ask[0]?.text, possibility: p.title, feasibility: p.feasibility, requires: p.requires, heartbeat: hb.outcome, phase: s.phase }, null, 1));
