import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { scoreAnswer, polarity, hasAffirmed } from "./answerScorer.mjs";
const here = new URL(".", import.meta.url).pathname;
const V = JSON.parse(fs.readFileSync(here + "validation/cases.json", "utf8"));
test("validation set: every case matches gold", () => {
  const bad = V.cases.map((c) => ({ c, r: scoreAnswer(V.keys[c.key], c.row) })).filter(({ c, r }) => r.score !== c.gold);
  assert.deepEqual(bad.map(({ c, r }) => `${c.id}:${r.score}!=${c.gold} ${r.reasons}`), []);
});
test("D1 word boundaries", () => { assert.equal(hasAffirmed("I know it", "no"), false); assert.equal(hasAffirmed("no.", "no"), true); });
test("D2 negation window", () => { assert.equal(hasAffirmed("it is not removed", "removed"), false); assert.equal(polarity("It is no longer used."), "no"); });
