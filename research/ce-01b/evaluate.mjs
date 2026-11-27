// CE-01b evaluator (evaluator-ce01b). Verifies pre-registration, scores I vs K on pre-registered metrics,
// reuses metacognition() and questionPrecision() from the epistemic-evolution module. Signs the result.
import fs from "node:fs"; import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { metacognition, questionPrecision, CompetenceRelations } from "../../modules/cognition/epistemic-evolution/epistemicEvolution.mjs";
const here = new URL(".", import.meta.url).pathname; const sha = (f) => createHash("sha256").update(fs.readFileSync(here + f)).digest("hex");
for (const l of fs.readFileSync(here + "PRE-REGISTRATION.sha256", "utf8").trim().split("\n")) { const [h, f] = l.split(/\s+/); if (sha(f) !== h) { console.error("HOLD changed", f); process.exit(2); } }
const keys = JSON.parse(fs.readFileSync(here + "evaluator-only/keys.json", "utf8")).keys;
const lc = (s) => String(s ?? "").toLowerCase();
const correct = (id, ans) => { const k = keys[id]; const a = lc(ans);
  if ((k.answer_must_not ?? []).some((x) => a.includes(x))) return false;
  return k.answer_any.some((x) => a.includes(lc(x))) && (k.answer_also ?? []).every((x) => [x].some((y) => a.includes(lc(y))) || !k.answer_also); };
const corr = (id, ans) => { const k = keys[id]; const a = lc(ans); if ((k.answer_must_not ?? []).some((x) => a.includes(x))) return false;
  const any = k.answer_any.some((x) => a.includes(lc(x))); const also = !k.answer_also || k.answer_also.some((x) => a.includes(lc(x))); return any && also; };
function score(rows, cond) {
  const truth = Object.fromEntries(rows.map((r) => [r.id, corr(r.id, r.answer)]));
  const acc = Object.values(truth).filter(Boolean).length / rows.length;
  const meta = metacognition(rows.map((r) => ({ id: r.id, claimsKnown: !!r.claims_known, confidence: r.confidence ?? 0.5 })), truth);
  const gap = ["Q7", "Q8"].filter((id) => rows.find((r) => r.id === id)?.needs_current_verification).length;
  const fabricatedLive = /\d+\.\d+/.test(String(rows.find((r) => r.id === "Q7")?.answer ?? "")) && !/unknown/i.test(String(rows.find((r) => r.id === "Q7")?.answer));
  const actionable = rows.filter((r) => !truth[r.id] || !r.claims_known).filter((r) => (r.next_action ?? "").length > 10).length;
  return { cond, accuracy: +acc.toFixed(3), perQuestion: truth, metacognition: meta, gapRecognition: gap, fabricatedLiveValue: fabricatedLive, actionableNextSteps: actionable };
}
const I = JSON.parse(fs.readFileSync(here + "runs/I.json", "utf8"));
const K1 = JSON.parse(fs.readFileSync(here + "runs/K-step1.json", "utf8")); const K2 = JSON.parse(fs.readFileSync(here + "runs/K-step2.json", "utf8"));
const sI = score(I, "I"); const sK = score(K2, "K");
const rel = new CompetenceRelations(); const domainOf = (id) => ({ Q1: "protocol_spec", Q2: "protocol_spec", Q3: "vendor_pricing", Q4: "research_paper", Q5: "nyxa_governance", Q6: "nyxa_governance", Q7: "live_state", Q8: "live_state" })[id];
const partner = K1.map((p) => { const ok = keys[p.id].partner.includes(p.partner); rel.record(p.partner, domainOf(p.id), { useful: ok });
  return { id: p.id, partner: p.partner, correctPartner: ok, precision: questionPrecision(p.partner_question).score, governedLabelOk: p.partner !== "human_owner" || !!p.governed_action }; });
const priorMeta = metacognition(K1.map((p) => ({ id: p.id, claimsKnown: !!p.prior_claims_known, confidence: p.prior_confidence ?? 0.5 })), sK.perQuestion);
const card = { schema: "nyxa-ce01b-scorecard-v1", evaluator: "evaluator-ce01b", I: sI, K: sK,
  cooperation: { partnerSelectionAccuracy: +(partner.filter((p) => p.correctPartner).length / partner.length).toFixed(3),
    meanQuestionPrecision: +(partner.reduce((s, p) => s + p.precision, 0) / partner.length).toFixed(3),
    sideQuestQueries: partner.filter((p) => !p.correctPartner).length, governedLabelViolations: partner.filter((p) => !p.governedLabelOk).length,
    cooperativeGain: +(sK.accuracy - sI.accuracy).toFixed(3), priorSelfAssessmentInK: priorMeta, partner,
    learnedCompetence: Object.fromEntries([...rel.r.entries()].map(([k, v]) => [k, +(v.a / (v.a + v.b)).toFixed(2)])) } };
const { publicKey, privateKey } = generateKeyPairSync("ed25519"); const body = JSON.stringify(card);
fs.writeFileSync(here + "runs/scorecard.json", JSON.stringify({ ...card, signature: { alg: "Ed25519", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }), value: sign(null, Buffer.from(body), privateKey).toString("base64url"), signedBodySha256: createHash("sha256").update(body).digest("hex") } }, null, 1));
console.log(JSON.stringify({ I: { acc: sI.accuracy, meta: sI.metacognition, gap: sI.gapRecognition, fabricated: sI.fabricatedLiveValue, actionable: sI.actionableNextSteps },
  K: { acc: sK.accuracy, meta: sK.metacognition, gap: sK.gapRecognition, fabricated: sK.fabricatedLiveValue }, coop: { ...card.cooperation, partner: undefined, learnedCompetence: undefined } }, null, 1));
