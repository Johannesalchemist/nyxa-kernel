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
const reg = { version: 1, audience: AUD, passports: [
  { key_id: "claude-dev-2026-11", actor: "claude", public_key_pem: pem(claude), actions: ["nyxa_apply_patch", "nyxa_run_test"], scope_prefixes: ["governed-dev:/"] },
  { key_id: "chatgpt-dev-2026-11", actor: "chatgpt", public_key_pem: pem(chatgpt), actions: ["nyxa_apply_patch"], scope_prefixes: ["silicon-dev:/"] },
] };
const regFile = path.join(tmp, "passports.json");
fs.writeFileSync(regFile, JSON.stringify(reg)); fs.chmodSync(regFile, 0o600);
const nonceDir = path.join(tmp, "nonces"); fs.mkdirSync(nonceDir, { mode: 0o700 });
const registry = A.loadPassports(regFile);
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
  assert.throws(() => A.loadPassports(bad("ww.json", reg, 0o666)), /group_or_world_writable/);
  assert.throws(() => A.loadPassports(bad("x.json", { ...reg, extra: 1 })), /shape/);
  assert.throws(() => A.loadPassports(bad("rsa.json", { ...reg, passports: [{ ...reg.passports[0],
    public_key_pem: generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }) }] })), /key_type/);
  assert.throws(() => A.loadPassports(bad("dup.json", { ...reg, passports: [reg.passports[0], reg.passports[0]] })), /duplicate/);
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
    process.env.NYXA_DEVELOPMENT_ACTOR = "claude"; G._resetForTesting();
    const p = proposal(); const now = Date.now(); const att = sign(p, { nowSeconds: Math.floor(now / 1000) });
    assert.equal((await G.gateProposal(p, undefined, now)).reason, "attestation_required");
    assert.equal((await G.gateProposal(p, att, now)).ok, true);
    assert.equal((await G.gateProposal(p, att, now)).reason, "replay");
  } finally { process.env = env; G._resetForTesting(); }
});
