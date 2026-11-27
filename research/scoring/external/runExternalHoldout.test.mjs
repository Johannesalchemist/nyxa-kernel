// Interface test with a SYNTHETIC submission (not a validation): seal, run-once, overlap and blinding checks.
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { seal, score, validateSubmission, verifyFrozen } from "./runExternalHoldout.mjs";
const cats = { paraphrase: 8, negation: 8, ambiguity: 6, unsupported_live_claim: 6, false_provenance: 6, control: 6 };
function sub(over = {}) {
  const cases = []; let i = 0;
  for (const [c, n] of Object.entries(cats)) for (let j = 0; j < n; j++) cases.push({ id: `S${++i}`, category: c, key: "k", row: { answer: `Synthetic answer number ${i} about topic ${c} ${j}` }, gold: 0 });
  return { schema: "nyxa-external-holdout-v1", producer: { kind: "human", family: "human", independent_of_claude_lineage: true, contact_role: "test" },
    blinding: { saw_scorer_code: false, saw_development_cases: false, saw_ce02_keys: false }, created_at: "2026-11-27", keys: { k: { type: "terms", any: ["zebra"] } }, cases, ...over };
}
test("frozen scorer verifies", () => assert.equal(verifyFrozen(), "2.1"));
test("blinding, independence, coverage, overlap enforced", () => {
  assert.deepEqual(validateSubmission(sub()), []);
  assert.ok(validateSubmission(sub({ producer: { kind: "model", family: "claude", independent_of_claude_lineage: false, contact_role: "x" } })).includes("producer_not_independent"));
  assert.ok(validateSubmission(sub({ blinding: { saw_scorer_code: true, saw_development_cases: false, saw_ce02_keys: false } })).includes("not_blinded"));
  const s = sub(); s.cases[0].row.answer = "I don't know which header the current revision uses."; assert.ok(validateSubmission(s).includes("overlap_with_internal:S1"));
  const s2 = sub(); s2.cases = s2.cases.filter((c) => c.category !== "false_provenance"); assert.ok(validateSubmission(s2).some((e) => e.startsWith("coverage:false_provenance")));
});
test("seal -> score once; modification after seal and re-run refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ext-")); const f = path.join(dir, "s.json"); fs.writeFileSync(f, JSON.stringify(sub()));
  assert.throws(() => score(f, { dir }), /not_sealed/); seal(f, { dir });
  const r = score(f, { dir }); assert.equal(r.verdict, "PASS"); assert.throws(() => score(f, { dir }), /EEXIST/);
  fs.appendFileSync(f, " "); assert.throws(() => score(f, { dir }), /not_sealed_or_modified/);
});
