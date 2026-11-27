// Diagnostic only: re-score the closed CE-01b pilot with scorer v2.1 and compare with the manual adjudication.
// CE-01b's pre-registered and adjudicated scores are NOT changed by this file.
import fs from "node:fs"; import { scoreAnswer } from "./answerScorer.mjs";
const r = (p) => JSON.parse(fs.readFileSync(new URL("../ce-01b/" + p, import.meta.url)));
const KEYS_V2 = { Q1: { type: "terms", any: ["2026-07-28"] }, Q2: { type: "yes_no", expected: "no" }, Q3: { type: "terms", any: ["1 credit", "one credit"] },
  Q4: { type: "terms", any: ["5", "five"], all: ["cross-document"] }, Q5: { type: "terms", any: ["deny"], all: ["escalate", "serialize", "negotiate", "allow"] },
  Q6: { type: "terms", any: ["owner", "human authority", "human gate", "passkey"] }, Q7: { type: "live" }, Q8: { type: "yes_no", expected: "no" } };
const adj = r("runs/adjudication.json"); const out = {};
for (const [cond, file] of [["I", "runs/I.json"], ["K", "runs/K-step2.json"]]) {
  const rows = r(file); const per = rows.map((x) => ({ id: x.id, v2: scoreAnswer(KEYS_V2[x.id], x).score, manual: adj[cond][x.id][0] }));
  out[cond] = { accuracy_v2: per.reduce((s, p) => s + p.v2, 0) / per.length, accuracy_manual: adj.summary["accuracy_" + cond],
    agreement: per.filter((p) => p.v2 === p.manual).length + "/" + per.length, disagreements: per.filter((p) => p.v2 !== p.manual) };
}
console.log(JSON.stringify(out, null, 1));
