// WP1 (Continuation R2) adversarial tests for NYXA Agent Attestation V1.
// Runs in an isolated temp copy where passkeyAuthorityV1.excerpt.js stands in for the
// runtime's real passkeyAuthorityV1.js (same canonicalHumanGate, verbatim).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nyxa-att-"));
const lib = path.join(tmp, "lib"); fs.mkdirSync(lib);
for (const f of ["actorAttestation.mjs", "actorAttestationGate.mjs"]) fs.copyFileSync(path.join(HERE, f), path.join(lib, f));
fs.copyFileSync(path.join(HERE, "passkeyAuthorityV1.excerpt.js"), path.join(lib, "passkeyAuthorityV1.js"));
fs.writeFileSync(path.join(lib, "package.json"), '{"type":"module"}');
const A = await import(pathToFileURL(path.join(lib, "actorAttestation.mjs")));
const G = await import(pathToFileURL(path.join(lib, "actorAttestationGate.mjs")));

const kp = () => generateKeyPairSync("ed25519");
const claude = kp(), chatgpt = kp(), rogue = kp();
const AUD = "nyxa-governed-backend:server-b";
const pem = (k) => k.publicKey.export({ type: "spki", format: "pem" });
const NB = 1790000000, NA = 1800000000;
const reg = { version: 1, audience: AUD, revoked_key_ids: [], passports: [
  { key_id: "claude-dev-2026-11", actor: "claude", public_key_pem: pem(claude), actions: ["nyxa_apply_patch", "nyxa_run_test", "nyxa_mandate_derive", "nyxa_mandate_revoke"], scope_prefixes: ["governed-dev:/"], not_before: NB, not_after: NA },
  { key_id: "chatgpt-dev-2026-11", actor: "chatgpt", public_key_pem: pem(chatgpt), actions: ["nyxa_apply_patch"], scope_prefixes: ["silicon-dev:/"], not_before: NB, not_after: NA },
] };
const UID = process.getuid();
const regFile = path.join(tmp, "passports.json");
fs.writeFileSync(regFile, JSON.stringify(reg)); fs.chmodSync(regFile, 0o600);
const nonceDir = path.join(tmp, "nonces"); fs.mkdirSync(nonceDir, { mode: 0o700 });
const registry = A.loadPassports(regFile, { requiredOwnerUid: UID });
let ledger = A.createNonceLedger(nonceDir);
const NOW = 1795000000;
const proposal = (o = {}) => ({ actor: "claude", action: "nyxa_apply_patch", target: "governed-dev:/authority-v1/x.mjs",
  scope: "governed-dev:/authority-v1/", claims: [{ claim: "c", source: "s" }], uncertainty: 0.1,
  requestedCapabilityClass: "I2", estimatedIrreversibility: "I2",
  provenance: { taskId: "t", runId: "r", requestingIdentity: "claude" }, payload: { patch: "--- a\n+++ b\n" }, ...o });
const sign = (p, o = {}) => A.signActorAttestation({ proposal: p, keyId: "claude-dev-2026-11", actor: "claude",
  privateKey: claude.privateKey, audience: AUD, nowSeconds: NOW, ...o });
const verify = (p, att, extra = {}) => A.verifyActorAttestation({ proposal: p, attestation: att, registry, ledger, nowSeconds: NOW, ...extra });

test("ALLOW: valid passport signature over the exact proposal", () => {
  const p = proposal(); const r = verify(p, sign(p));
  assert.equal(r.ok, true); assert.equal(r.actor, "claude");
});

test("REPLAY: same attestation twice, and again after ledger reopen (restart)", () => {
  const p = proposal(); const att = sign(p);
  assert.equal(verify(p, att).ok, true);
  assert.equal(verify(p, att).reason, "replay");
  ledger = A.createNonceLedger(nonceDir);
  assert.equal(verify(p, att).reason, "replay");
});

test("ACTOR SUBSTITUTION: proposal actor or attestation actor differs from passport", () => {
  const p = proposal({ actor: "chatgpt" });
  assert.equal(verify(p, sign(p)).reason, "actor_substitution");
  const q = proposal(); const att = { ...sign(q), actor: "chatgpt" };
  assert.equal(verify(q, att).reason, "actor_substitution");
  const c = proposal({ actor: "chatgpt", scope: "silicon-dev:/x/", target: "silicon-dev:/x/y" });
  const viaClaudeKey = A.signActorAttestation({ proposal: c, keyId: "chatgpt-dev-2026-11", actor: "chatgpt",
    privateKey: claude.privateKey, audience: AUD, nowSeconds: NOW });
  assert.equal(verify(c, viaClaudeKey).reason, "signature_invalid", "other agent's key cannot speak for chatgpt");
});

test("SCOPE ESCALATION: scope/target outside passport, traversal, unlisted action", () => {
  for (const o of [{ scope: "silicon-dev:/x/" }, { target: "silicon-dev:/x/y" }, { target: "governed-dev:/authority-v1/../../etc/passwd" },
    { scope: "governed-dev:" }]) {
    const p = proposal(o); assert.equal(verify(p, sign(p)).reason, "scope_escalation", JSON.stringify(o));
  }
  const p = proposal({ action: "nyxa_mandate_issue" });
  assert.equal(verify(p, sign(p)).reason, "action_not_in_passport");
});

test("TAMPER AFTER SIGNING: widened scope, changed patch, changed target", () => {
  const p = proposal(); const att = sign(p);
  for (const q of [proposal({ scope: "governed-dev:/" }), proposal({ payload: { patch: "evil" } }), proposal({ target: "governed-dev:/authority-v1/y.mjs" })])
    assert.equal(verify(q, att).reason, "proposal_digest_mismatch");
});

test("FORGERY does not burn the nonce; valid attestation with that nonce still works once", () => {
  const p = proposal(); const good = sign(p);
  const forged = { ...good, signature: A.signActorAttestation({ proposal: p, keyId: "claude-dev-2026-11", actor: "claude",
    privateKey: rogue.privateKey, audience: AUD, nowSeconds: NOW, nonce: good.nonce }).signature };
  assert.equal(verify(p, forged).reason, "signature_invalid");
  assert.equal(verify(p, good).ok, true);
});

test("TIME, AUDIENCE, SHAPE, UNKNOWN PASSPORT, PROCESS ACTOR", () => {
  const p = proposal();
  assert.equal(verify(p, sign(p, { nowSeconds: NOW - 200 })).reason, "attestation_expired");
  assert.equal(verify(p, sign(p, { nowSeconds: NOW + 120 })).reason, "issued_in_future");
  assert.equal(verify(p, sign(p, { ttlSeconds: 600 })).reason, "ttl_invalid");
  assert.equal(verify(p, sign(p, { audience: "nyxa-governed-backend:server-a" })).reason, "audience_mismatch");
  assert.equal(verify(p, { ...sign(p), extra: 1 }).reason, "attestation_shape");
  assert.equal(verify(p, undefined).reason, "attestation_required");
  assert.equal(verify(p, { ...sign(p), key_id: "claude-prod-x" }).reason, "unknown_passport");
  assert.equal(verify(p, sign(p), { boundActor: "sophia" }).reason, "process_actor_mismatch");
});

test("registry loader fails closed", () => {
  const bad = (name, obj, mode = 0o600) => { const f = path.join(tmp, name); fs.writeFileSync(f, typeof obj === "string" ? obj : JSON.stringify(obj)); fs.chmodSync(f, mode); return f; };
  const L = (f) => A.loadPassports(f, { requiredOwnerUid: UID });
  assert.throws(() => L(bad("ww.json", reg, 0o666)), /group_or_world_writable/);
  assert.throws(() => L(bad("x.json", { ...reg, extra: 1 })), /shape/);
  assert.throws(() => A.loadPassports(regFile, { requiredOwnerUid: UID + 1 }), /owner/, "registry not owned by the operator is rejected (no self-registration)");
  assert.throws(() => L(bad("rsa.json", { ...reg, passports: [{ ...reg.passports[0],
    public_key_pem: generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }) }] })), /key_type/);
  assert.throws(() => L(bad("dup.json", { ...reg, passports: [reg.passports[0], reg.passports[0]] })), /duplicate/);
});

test("BACKEND GATE: off passes, required enforces, misconfiguration fails closed", async () => {
  const env = { ...process.env };
  try {
    delete process.env.NYXA_ACTOR_ATTESTATION_MODE; G._resetForTesting();
    assert.equal((await G.gateProposal(proposal(), undefined)).ok, true);
    process.env.NYXA_ACTOR_ATTESTATION_MODE = "permissive"; G._resetForTesting();
    assert.equal((await G.gateProposal(proposal(), undefined)).reason, "attestation_config_invalid");
    process.env.NYXA_ACTOR_ATTESTATION_MODE = "required"; process.env.NYXA_AGENT_PASSPORTS = "/nonexistent.json"; G._resetForTesting();
    assert.equal((await G.gateProposal(proposal(), undefined)).reason, "attestation_config_invalid");
    process.env.NYXA_AGENT_PASSPORTS = regFile; process.env.NYXA_ATTESTATION_NONCE_DIR = nonceDir;
    process.env.NYXA_DEVELOPMENT_ACTOR = "claude"; process.env.NYXA_PASSPORTS_OWNER_UID = String(UID); G._resetForTesting();
    const now = NOW * 1000; const p = proposal(); const att = sign(p);
    assert.equal((await G.gateProposal(p, undefined, now)).reason, "attestation_required");
    assert.equal((await G.gateProposal(p, att, now)).ok, true);
    assert.equal((await G.gateProposal(p, att, now)).reason, "replay");
  } finally { process.env = env; G._resetForTesting(); }
});

test("R3 KEY LIFECYCLE: rotation window, revocation list, self-registration by a non-owner", () => {
  const next = kp();
  const rot = { ...reg, revoked_key_ids: ["claude-dev-2026-11"], passports: [...reg.passports,
    { key_id: "claude-dev-2026-12", actor: "claude", public_key_pem: pem(next), actions: ["nyxa_apply_patch"], scope_prefixes: ["governed-dev:/"], not_before: NOW + 10, not_after: NA }] };
  const f = path.join(tmp, "rot.json"); fs.writeFileSync(f, JSON.stringify(rot)); fs.chmodSync(f, 0o600);
  const r2 = A.loadPassports(f, { requiredOwnerUid: UID });
  const p = proposal();
  assert.equal(A.verifyActorAttestation({ proposal: p, attestation: sign(p), registry: r2, ledger, nowSeconds: NOW }).reason, "passport_revoked");
  const early = A.signActorAttestation({ proposal: p, keyId: "claude-dev-2026-12", actor: "claude", privateKey: next.privateKey, audience: AUD, nowSeconds: NOW });
  assert.equal(A.verifyActorAttestation({ proposal: p, attestation: early, registry: r2, ledger, nowSeconds: NOW }).reason, "passport_not_valid_now");
  const ok = A.signActorAttestation({ proposal: p, keyId: "claude-dev-2026-12", actor: "claude", privateKey: next.privateKey, audience: AUD, nowSeconds: NOW + 20 });
  assert.equal(A.verifyActorAttestation({ proposal: p, attestation: ok, registry: r2, ledger, nowSeconds: NOW + 20 }).ok, true, "rotated key valid inside its window");
  if (UID === 0) { const g = path.join(tmp, "foreign.json"); fs.copyFileSync(f, g); fs.chownSync(g, 4242, 4242);
    assert.throws(() => A.loadPassports(g, { requiredOwnerUid: 0 }), /owner/, "registry owned by an agent account is rejected"); }
});

test("R3 REPLAY UNDER CONCURRENCY: 8 processes and 2 backend instances race on one nonce", async () => {
  const { spawn } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(tmp, "race-")); fs.chmodSync(dir, 0o700);
  const code = `import(${JSON.stringify(pathToFileURL(path.join(lib, "actorAttestation.mjs")).href)}).then(A=>{const l=A.createNonceLedger(${JSON.stringify(dir)});process.stdout.write(String(l.claim("8d3c1b7a-1f2e-4d5c-9b8a-7e6f5d4c3b2a",{p:process.pid})))})`;
  const runs = await Promise.all(Array.from({ length: 8 }, () => new Promise((res) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", code]); let o = ""; c.stdout.on("data", (d) => (o += d)); c.on("exit", () => res(o)); })));
  assert.equal(runs.filter((o) => o === "true").length, 1, "exactly one process wins: " + runs.join(","));
  const i1 = A.createNonceLedger(dir), i2 = A.createNonceLedger(dir);
  assert.equal([i1.claim("1d3c1b7a-1f2e-4d5c-9b8a-7e6f5d4c3b2a", {}), i2.claim("1d3c1b7a-1f2e-4d5c-9b8a-7e6f5d4c3b2a", {})].filter(Boolean).length, 1);
});

test("R3 DIRECT WRITE TOOLS: mandate_derive attested; tamper, scope, actor, unlisted tool; identity != authority", () => {
  const args = { parent_mandate_id: "m-1", actor: "sophia", action: "nyxa_apply_patch", scope_prefix: "governed-dev:/authority-v1/",
    target_prefix: "governed-dev:/authority-v1/", ttl_seconds: 3600, max_executions_per_window: 5, max_effect_units_per_window: 5 };
  const s = (a, o = {}) => A.signActorAttestation({ subject: A.toolSubject("nyxa_mandate_derive", a), keyId: "claude-dev-2026-11", actor: "claude", privateKey: claude.privateKey, audience: AUD, nowSeconds: NOW, ...o });
  const V = (tool, a, att, extra = {}) => A.verifyToolAttestation({ tool, args: a, attestation: att, registry, ledger, nowSeconds: NOW, ...extra });
  const good = V("nyxa_mandate_derive", args, s(args));
  assert.equal(good.ok, true); assert.equal(good.authorityGranted, false, "attestation never grants authority");
  assert.equal(V("nyxa_mandate_derive", { ...args, ttl_seconds: 604800 }, s(args)).reason, "proposal_digest_mismatch");
  const wide = { ...args, scope_prefix: "silicon-dev:/" };
  assert.equal(V("nyxa_mandate_derive", wide, s(wide)).reason, "scope_escalation");
  assert.equal(V("nyxa_mandate_issue", args, s(args)).reason, "action_not_in_passport");
  assert.equal(V("nyxa_mandate_derive", args, s(args), { boundActor: "chatgpt" }).reason, "process_actor_mismatch");
  assert.equal(V("nyxa_apply_patch", args, s(args)).reason, "tool_not_attestable");
  assert.equal(V("nyxa_mandate_derive", args, undefined).reason, "attestation_required");
});

test("R4 REVOCATION WITHOUT RESTART + CRASH BETWEEN NONCE AND EFFECT (at-most-once)", async () => {
  const env = { ...process.env };
  try {
    const regDir = fs.mkdtempSync(path.join(tmp, "live-")); fs.chmodSync(regDir, 0o700);
    const f = path.join(regDir, "passports.json"); fs.writeFileSync(f, JSON.stringify(reg)); fs.chmodSync(f, 0o600);
    const nd = fs.mkdtempSync(path.join(tmp, "nonce-live-")); fs.chmodSync(nd, 0o700);
    Object.assign(process.env, { NYXA_ACTOR_ATTESTATION_MODE: "required", NYXA_AGENT_PASSPORTS: f, NYXA_ATTESTATION_NONCE_DIR: nd,
      NYXA_DEVELOPMENT_ACTOR: "claude", NYXA_PASSPORTS_OWNER_UID: String(UID) }); G._resetForTesting();
    const now = NOW * 1000;
    // Crash after the gate consumed the nonce but before the effect: the same attestation can never
    // execute later (no double effect); the agent must re-sign -> at-most-once per attestation.
    const p = proposal(); const a = sign(p);
    assert.equal((await G.gateProposal(p, a, now)).ok, true);
    /* simulated crash: effect never ran */
    assert.equal((await G.gateProposal(p, a, now)).reason, "replay", "retry with same attestation after crash is not executed twice");
    assert.equal((await G.gateProposal(p, sign(p), now)).ok, true, "fresh signature after crash proceeds (effect-level idempotency stays with the executor)");
    // In-flight revocation: an attestation signed BEFORE revocation is rejected once the registry changes.
    const pending = sign(proposal());
    await new Promise((r) => setTimeout(r, 20));
    fs.writeFileSync(f, JSON.stringify({ ...reg, revoked_key_ids: ["claude-dev-2026-11"] }));
    assert.equal((await G.gateProposal(proposal(), pending, now)).reason, "passport_revoked", "revocation effective without restart");
    // Registry removed -> fail closed.
    fs.unlinkSync(f);
    assert.equal((await G.gateProposal(proposal(), sign(proposal()), now)).reason, "attestation_config_invalid");
  } finally { process.env = env; G._resetForTesting(); }
});
