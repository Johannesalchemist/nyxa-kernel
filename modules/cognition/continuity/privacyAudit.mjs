#!/usr/bin/env node
// M10 privacy audit: scans outbox / shadow proposals for anything that looks like a secret or personal data.
// Acceptance requires 0 findings. Prints only file:line and the finding class, never the matched value.
import fs from "node:fs"; import path from "node:path";
const CLASSES = [["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/], ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["api_token", /\b(sk|pk|rk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_-]{16,}\b/], ["secret_assignment", /\b[A-Z][A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD|PASS)[A-Z0-9_]*\s*=\s*(?!\[REDACTED\])\S+/],
  ["ip_address", /\b(\d{1,3}\.){3}\d{1,3}\b/], ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/], ["high_entropy", /\b[A-Za-z0-9+/_-]{40,}\b/]];
export function audit(files) {
  const findings = [];
  for (const f of files) { if (!fs.existsSync(f)) continue; fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { for (const [c, r] of CLASSES) if (r.test(l)) findings.push({ file: path.basename(f), line: i + 1, class: c }); }); }
  return { files: files.length, findings, ok: findings.length === 0 };
}
if (process.argv[1] === new URL(import.meta.url).pathname) { const r = audit(process.argv.slice(2)); console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 3); }
