#!/usr/bin/env node
// Minimal secret scanner for this module (V0.2). Scans git-tracked + untracked, non-ignored
// files of the module and the built dist/ bundle for secret-shaped VALUES. Exit 1 on a hit.
// It is a guard rail, not a replacement for a dedicated scanner (gitleaks/trufflehog: not installed).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  ['runway_key', /\bkey_[A-Za-z0-9]{32,}\b/],
  ['openai_key', /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['anthropic_key', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ['elevenlabs_key', /\bsk_[a-f0-9]{40,}\b/],
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['github_token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['env_assignment', /^(RUNWAYML_API_SECRET|NYXA_ACCESS_TOKEN|ELEVENLABS_API_KEY|OPENAI_API_KEY)=\S{8,}/m],
  ['ipv4_host', /\b(?:\d{1,3}\.){3}\d{1,3}\b(?<!127\.0\.0\.1|0\.0\.0\.0)/],
];
// Test fixtures intentionally contain fake secrets to prove they never leak.
const ALLOW = [/^test\//, /^package-lock\.json$/];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '.'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
if (existsSync('dist')) {
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  files.push(...walk('dist'));
}
if (existsSync('.env')) console.log('note: .env exists locally (git-ignored, not scanned, never commit it)');

let hits = 0;
for (const f of files) {
  if (ALLOW.some((a) => a.test(f)) || !existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [name, re] of PATTERNS) {
    if (re.test(text)) {
      hits++;
      console.log(`HIT ${name}: ${f}`);
    }
  }
}
console.log(`secret-scan: ${files.length} files, ${hits} hit(s)`);
process.exit(hits ? 1 : 0);
