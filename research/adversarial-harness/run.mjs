// NYXA adversarial evaluation harness (Welle 7). Runs registered EXISTING tests per case and
// writes a scorecard that keeps technical enforcement and model behaviour strictly separate.
// Usage (repo root): node research/adversarial-harness/run.mjs [out.json]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "research/adversarial-harness/cases.json"), "utf8"));
const results = [];
for (const c of reg.cases) {
  if (c.status) { results.push({ id: c.id, category: c.category, layer: c.layer, result: c.verdict ? `${c.status}:${c.verdict}` : c.status, detail: c.observed ?? c.requires ?? c.evidence }); continue; }
  const file = path.join(ROOT, c.file), cwd = path.dirname(file);
  // Bridge tests spawn child processes that resolve the MCP SDK from ./node_modules only.
  const nmDir = process.env.NODE_PATH, link = path.join(cwd, "node_modules");
  const linked = nmDir && c.runner !== "python" && !fs.existsSync(link) && (fs.symlinkSync(nmDir, link), true);
  const r = c.runner === "python"
    ? spawnSync("python3", ["-m", "unittest", "-k", c.pattern, path.basename(file, ".py")], { cwd, encoding: "utf8", timeout: 120000 })
    : spawnSync(process.execPath, ["--test", "--test-timeout=20000", "--test-name-pattern", c.pattern, path.basename(file)], { cwd, encoding: "utf8", timeout: 180000, env: { ...process.env, NODE_PATH: process.env.NODE_PATH ?? "" } });
  if (linked) fs.unlinkSync(link);
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const ran = c.runner === "python" ? /Ran [1-9]/.test(out) : /# pass [1-9]/.test(out);
  results.push({ id: c.id, category: c.category, layer: c.layer, result: r.status === 0 && ran ? "pass" : "fail", detail: r.status === 0 && ran ? undefined : out.slice(-400) });
}
const tech = results.filter((r) => r.layer === "technical_enforcement");
const card = { schema: "nyxa-adversarial-scorecard-v1", at: new Date().toISOString(),
  technical_enforcement: { pass: tech.filter((r) => r.result === "pass").length, fail: tech.filter((r) => r.result === "fail").length,
    other: tech.filter((r) => !["pass", "fail"].includes(r.result)).length },
  model_behavior: { simulated_pass: results.filter((r) => r.result === "run_simulated:pass").length,
    simulated_fail: results.filter((r) => r.result === "run_simulated:fail").length,
    not_run: results.filter((r) => r.layer === "model_behavior" && !r.result.startsWith("run_simulated")).length,
    note: "Model behaviour is NOT inferred from technical enforcement results." }, results };
const outFile = process.argv[2];
if (outFile) fs.writeFileSync(outFile, JSON.stringify(card, null, 1));
for (const r of results) console.log(r.result.padEnd(18), r.id.padEnd(18), r.category);
console.log(JSON.stringify({ technical_enforcement: card.technical_enforcement, model_behavior: card.model_behavior }));
process.exitCode = card.technical_enforcement.fail ? 1 : 0;
