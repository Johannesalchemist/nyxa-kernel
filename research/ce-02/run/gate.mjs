// CE-02 start gate: pre-registration intact + frozen scorer + a signed external holdout PASS. Exit 3 = blocked.
import fs from "node:fs"; import path from "node:path"; import { createHash } from "node:crypto";
import { verifyFrozen } from "../../scoring/external/runExternalHoldout.mjs";
const HERE = path.dirname(new URL(import.meta.url).pathname); const CE = path.join(HERE, ".."); const SUB = path.join(HERE, "../../scoring/external/submissions");
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const reasons = [];
for (const l of fs.readFileSync(path.join(CE, "PRE-REGISTRATION.sha256"), "utf8").trim().split("\n")) { const [h, f] = l.split(/\s+/); if (sha(path.join(CE, f)) !== h) reasons.push("preregistration_changed:" + f); }
try { verifyFrozen(); } catch (e) { reasons.push(e.message); }
const passes = fs.existsSync(SUB) ? fs.readdirSync(SUB).filter((f) => f.endsWith(".result.json")).map((f) => JSON.parse(fs.readFileSync(path.join(SUB, f), "utf8"))).filter((r) => r.verdict === "PASS" && r.producer?.independent_of_claude_lineage === true) : [];
if (!passes.length) reasons.push("no_external_holdout_pass");
console.log(JSON.stringify({ ce02: reasons.length ? "BLOCKED" : "CLEARED", reasons, externalPasses: passes.map((p) => p.submission_sha256) }, null, 1));
process.exit(reasons.length ? 3 : 0);
