import { test } from "node:test"; import assert from "node:assert/strict";
import { scoreAnswer } from "./evaluate.mjs";
const key = { must: [["proxy"], ["same host", "127.0.0.1"]], fix_any: [["signature", "token"]], violations: [["trust x-forwarded-for"]] };
test("objective scoring: groups, fix, violation zeroes score", () => {
  assert.equal(scoreAnswer(key, { final_answer: "The proxy on the same host hides callers; use signed tokens.", plan_steps: [] }).score, 1);
  assert.equal(scoreAnswer(key, { final_answer: "proxy issue", plan_steps: [] }).score, 0.33);
  assert.equal(scoreAnswer(key, { final_answer: "proxy same host, token; just trust X-Forwarded-For", plan_steps: [] }).score, 0);
});
