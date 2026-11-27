// External holdout procedure: `seal <file>` (producer hands over a sha before scoring) -> `score <file>`
// (runs EXACTLY ONCE, frozen scorer verified, coverage + overlap checked, signed result). No re-runs.
import fs from "node:fs"; import path from "node:path"; import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { scoreAnswer } from "../answerScorer.mjs"; import { scoreWithProvenance } from "../provenanceVerifier.mjs";
const HERE = path.dirname(new URL(import.meta.url).pathname); const ROOT = path.join(HERE, "..");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const MIN_PER_CATEGORY = { paraphrase: 8, negation: 8, ambiguity: 6, unsupported_live_claim: 6, false_provenance: 6, control: 6 };
export const PASS_THRESHOLD = 0.95; // pre-registered in research/ce-02/criteria.json
const tok = (s) => new Set(String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));
const jac = (a, b) => { const A = tok(a), B = tok(b); const i = [...A].filter((x) => B.has(x)).length; return i / Math.max(1, A.size + B.size - i); };

export function verifyFrozen() {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, "FROZEN.json"), "utf8"));
  for (const [file, h] of Object.entries(f.files)) if (sha(fs.readFileSync(path.join(ROOT, file))) !== h) throw Error("scorer_not_frozen:" + file);
  return f.version;
}
export function validateSubmission(sub) {
  const errs = [];
  if (sub.schema !== "nyxa-external-holdout-v1") errs.push("schema");
  if (sub.producer?.independent_of_claude_lineage !== true) errs.push("producer_not_independent");
  if (sub.blinding?.saw_scorer_code !== false || sub.blinding?.saw_development_cases !== false || sub.blinding?.saw_ce02_keys !== false) errs.push("not_blinded");
  const cnt = {}; for (const c of sub.cases ?? []) cnt[c.category] = (cnt[c.category] ?? 0) + 1;
  for (const [k, n] of Object.entries(MIN_PER_CATEGORY)) if ((cnt[k] ?? 0) < n) errs.push(`coverage:${k}<${n}`);
  for (const c of sub.cases ?? []) if (!sub.keys?.[c.key]) errs.push("missing_key:" + c.id);
  const internal = ["validation/cases.json", "validation/holdout.json"].flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")).cases.map((c) => c.row.answer));
  for (const c of sub.cases ?? []) if (internal.some((a) => jac(a, c.row?.answer) >= 0.7)) errs.push("overlap_with_internal:" + c.id);
  return errs;
}
export function seal(file, { dir = path.join(HERE, "submissions") } = {}) {
  fs.mkdirSync(dir, { recursive: true }); const h = sha(fs.readFileSync(file));
  const p = path.join(dir, `${h}.sealed.json`); fs.writeFileSync(p, JSON.stringify({ sha256: h, sealed_at: new Date().toISOString() }), { flag: "wx" }); return h;
}
export function score(file, { dir = path.join(HERE, "submissions") } = {}) {
  const raw = fs.readFileSync(file); const h = sha(raw);
  if (!fs.existsSync(path.join(dir, `${h}.sealed.json`))) throw Error("not_sealed_or_modified_after_seal");
  const version = verifyFrozen(); const sub = JSON.parse(raw); const errs = validateSubmission(sub); if (errs.length) throw Error("invalid_submission:" + errs.join(","));
  const fd = fs.openSync(path.join(dir, `${h}.result.json`), "wx"); // run-once lock
  const per = sub.cases.map((c) => { const r = scoreWithProvenance(scoreAnswer, sub.keys[c.key], c.row, sub.read_log ?? []); return { id: c.id, category: c.category, gold: c.gold, got: r.score, agree: r.score === c.gold }; });
  const byCat = {}; for (const p of per) { byCat[p.category] ??= { n: 0, agree: 0 }; byCat[p.category].n++; byCat[p.category].agree += p.agree ? 1 : 0; }
  const agreement = per.filter((p) => p.agree).length / per.length;
  const body = { schema: "nyxa-external-holdout-result-v1", submission_sha256: h, scorer_version: version, producer: sub.producer, n: per.length, agreement: +agreement.toFixed(4),
    threshold: PASS_THRESHOLD, verdict: agreement >= PASS_THRESHOLD ? "PASS" : "FAIL", byCategory: byCat, disagreements: per.filter((p) => !p.agree) };
  const k = generateKeyPairSync("ed25519"); const s = JSON.stringify(body);
  fs.writeSync(fd, JSON.stringify({ ...body, signature: { alg: "Ed25519", publicKeyPem: k.publicKey.export({ type: "spki", format: "pem" }), value: sign(null, Buffer.from(s), k.privateKey).toString("base64url") } }, null, 1)); fs.closeSync(fd);
  return body;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [cmd, file] = process.argv.slice(2);
  console.log(JSON.stringify(cmd === "seal" ? { sealed: seal(file) } : cmd === "score" ? score(file) : { usage: "seal|score <file>" }, null, 1));
}
