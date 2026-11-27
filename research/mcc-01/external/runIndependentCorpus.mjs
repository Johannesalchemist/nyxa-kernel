// MCC-01 independent corpus: seal -> score ONCE with the frozen benchmark and frozen system under test.
// Usage: node runIndependentCorpus.mjs seal <corpus.json> | score <corpus.json>
import fs from "node:fs"; import path from "node:path"; import { createHash } from "node:crypto"; import { execFileSync } from "node:child_process";
const HERE = path.dirname(new URL(import.meta.url).pathname); const ROOT = path.resolve(HERE, "../../..");
const sha = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const SUB = path.join(HERE, "submissions");
export const MIN = { events: 60, probes: 30, scenario: { session_switch: 5, compaction: 5, agent_switch: 5, contradiction: 5, recurring_error: 5, poisoning: 5 } };
export function verifyFrozen() {
  const f = JSON.parse(fs.readFileSync(path.join(HERE, "../FROZEN.json"), "utf8"));
  for (const [file, h] of Object.entries(f.files)) if (sha(path.join(ROOT, file)) !== h) throw Error("not_frozen:" + file);
  return f.version;
}
export function validateCorpus(c) {
  const e = [];
  if (c.schema !== "nyxa-mcc01-corpus-v1") e.push("schema");
  if (c.producer?.independent_of_claude_lineage !== true || c.blinding?.saw_internal_corpus !== false || c.blinding?.saw_system_code !== false) e.push("not_independent_or_not_blinded");
  if ((c.events ?? []).length < MIN.events) e.push("events<" + MIN.events); if ((c.probes ?? []).length < MIN.probes) e.push("probes<" + MIN.probes);
  const cnt = {}; for (const p of c.probes ?? []) for (const s of p.scenarios ?? []) cnt[s] = (cnt[s] ?? 0) + 1;
  for (const [k, n] of Object.entries(MIN.scenario)) if ((cnt[k] ?? 0) < n) e.push(`scenario:${k}<${n}`);
  const ids = new Set((c.events ?? []).map((x) => x.id)); for (const p of c.probes ?? []) for (const r of [...(p.relevant ?? []), ...(p.corrected ?? [])]) if (!ids.has(r)) e.push("unknown_ref:" + r);
  const internal = JSON.parse(fs.readFileSync(path.join(HERE, "../corpus.json"), "utf8")).events.map((x) => x.content);
  for (const x of c.events ?? []) if (internal.includes(x.content)) e.push("overlap_with_internal:" + x.id);
  return e;
}
const [cmd, file] = process.argv[1] === new URL(import.meta.url).pathname ? process.argv.slice(2) : [];
if (!cmd) { /* imported */ }
else if (cmd === "seal") { fs.mkdirSync(SUB, { recursive: true }); const h = sha(file); fs.writeFileSync(path.join(SUB, `${h}.sealed`), new Date().toISOString(), { flag: "wx" }); console.log(JSON.stringify({ sealed: h })); }
else if (cmd === "score") {
  const h = sha(file); if (!fs.existsSync(path.join(SUB, `${h}.sealed`))) throw Error("not_sealed_or_modified");
  const v = verifyFrozen(); const errs = validateCorpus(JSON.parse(fs.readFileSync(file, "utf8"))); if (errs.length) throw Error("invalid_corpus:" + errs.join(","));
  const out = path.join(SUB, `${h}.result.json`); fs.closeSync(fs.openSync(out, "wx")); // run-once lock
  execFileSync(process.execPath, [path.join(HERE, "../mechanismBench.mjs"), file, out], { stdio: "inherit" });
  console.log(JSON.stringify({ frozenVersion: v, result: out }));
} else console.log("usage: seal|score <corpus.json>");
