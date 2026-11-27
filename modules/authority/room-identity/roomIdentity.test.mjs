import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { generateKeyPairSync, sign, randomBytes, createHash } from "node:crypto";
import { canonicalHumanGate as canonical } from "../actor-attestation/passkeyAuthorityV1.excerpt.js";
// Isolated temp tree (same pattern as actorAttestation.test.mjs): the verbatim excerpt stands in for the
// runtime's real passkeyAuthorityV1.js that actorAttestation.mjs imports in deployment.
const HERE = path.dirname(new URL(import.meta.url).pathname); const AA = path.join(HERE, "../actor-attestation");
const tree = fs.mkdtempSync(path.join(os.tmpdir(), "nyxa-rid-tree-"));
for (const d of ["actor-attestation", "room-identity"]) fs.mkdirSync(path.join(tree, d));
for (const f of ["actorAttestation.mjs", "passkeyAuthorityV1.excerpt.js"]) fs.copyFileSync(path.join(AA, f), path.join(tree, "actor-attestation", f));
fs.copyFileSync(path.join(AA, "passkeyAuthorityV1.excerpt.js"), path.join(tree, "actor-attestation", "passkeyAuthorityV1.js"));
fs.copyFileSync(path.join(HERE, "roomIdentity.mjs"), path.join(tree, "room-identity", "roomIdentity.mjs"));
const { createRoomIdentity, bindTransaction, bindingArtifact, keyThumbprint, requireBoundIdentity } = await import(path.join(tree, "room-identity", "roomIdentity.mjs"));

const gate = generateKeyPairSync("ed25519"); // TEST key only; production uses /opt/nyxa-authority-v1/human-gate-public.pem
const pem = (k) => k.export({ type: "spki", format: "pem" });
const sha = (s) => createHash("sha256").update(s).digest("hex");
let T = 1_800_000_000; const now = () => T;
function setup(principals = ["nyxa-owner", "participant-b"]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rid-")); fs.chmodSync(dir, 0o700);
  return createRoomIdentity({ humanGatePublicPem: pem(gate.publicKey), nonceDir: dir, allowedPrincipals: principals, now });
}
const device = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" });
function grant(principal, sessionPub, over = {}, signer = gate.privateKey) {
  const tx = bindTransaction(principal); const art = bindingArtifact({ principal, sessionKeyThumbprint: keyThumbprint(pem(sessionPub)) });
  const c = { schema: "nyxa-human-authority-grant-v2", grant_id: "g-" + randomBytes(4).toString("hex"), issuer: "webauthn://auth.future24.eu", principal,
    credential_fingerprint: sha("cred-" + principal), action: tx.action, target: tx.target, artifact_sha256: art, artifact_path: tx.artifact_path,
    nonce: randomBytes(24).toString("base64url"), issued_at: T, expires_at: T + 60, max_executions: 1, audit_correlation: "test",
    transaction_digest: sha(canonical({ ...tx, artifact_sha256: art })), user_verification: true, origin: "https://auth.future24.eu", rp_id: "auth.future24.eu", ...over };
  if (over.transaction_digest === undefined) c.transaction_digest = sha(canonical({ ...bindTransaction(c.principal), artifact_sha256: c.artifact_sha256 }));
  return { algorithm: "Ed25519", claims: c, signature: sign(null, Buffer.from(canonical(c)), signer).toString("base64url") };
}
function req(sid, key, { method = "GET", p = "/api/room/evolution/view", body = "", ts = T, nonce = randomBytes(24).toString("base64url") } = {}) {
  const msg = canonical({ sid, method, path: p, body_sha256: sha(body), ts, nonce });
  return { sid, method, path: p, body, ts, nonce, signature: sign("sha256", Buffer.from(msg), { key, dsaEncoding: "ieee-p1363" }).toString("base64url") };
}

test("positive: passkey grant binds a device key; signed request reaches own resource", () => {
  const id = setup(); const d = device(); const b = id.bind({ envelope: grant("nyxa-owner", d.publicKey), sessionPublicPem: pem(d.publicKey) });
  assert.equal(b.ok, true); const a = id.authenticate(req(b.sid, d.privateKey));
  assert.deepEqual([a.ok, a.principal], [true, "nyxa-owner"]); assert.equal(id.authorizePersonal(a, "nyxa-owner").ok, true);
});
test("impersonation: Room name alone, forged grant, unregistered principal, wrong action", () => {
  const id = setup(); const d = device();
  assert.equal(id.authenticate({ sid: undefined, roomUser: "Johannes" }).reason, "no_bound_session");
  const evil = generateKeyPairSync("ed25519");
  assert.equal(id.bind({ envelope: grant("nyxa-owner", d.publicKey, {}, evil.privateKey), sessionPublicPem: pem(d.publicKey) }).reason, "signature_invalid");
  assert.equal(id.bind({ envelope: grant("mallory", d.publicKey), sessionPublicPem: pem(d.publicKey) }).reason, "principal_not_registered");
  assert.equal(id.bind({ envelope: grant("nyxa-owner", d.publicKey, { action: "deploy.release" }), sessionPublicPem: pem(d.publicKey) }).reason, "grant_scope_or_time_invalid");
  const tampered = grant("nyxa-owner", d.publicKey); tampered.claims.target = "room:participant:participant-b";
  assert.equal(id.bind({ envelope: tampered, sessionPublicPem: pem(d.publicKey) }).reason, "grant_scope_or_time_invalid");
});
test("grant replay and session-key substitution", () => {
  const id = setup(); const d = device(); const g = grant("nyxa-owner", d.publicKey);
  assert.equal(id.bind({ envelope: g, sessionPublicPem: pem(d.publicKey) }).ok, true);
  assert.equal(id.bind({ envelope: g, sessionPublicPem: pem(d.publicKey) }).reason, "grant_replayed");
  const attacker = device(); // stolen grant presented with the attacker's own key
  assert.equal(id.bind({ envelope: grant("nyxa-owner", d.publicKey), sessionPublicPem: pem(attacker.publicKey) }).reason, "grant_scope_or_time_invalid");
  T += 400; assert.equal(id.bind({ envelope: { ...g }, sessionPublicPem: pem(d.publicKey) }).ok, false); T -= 400;
});
test("request replay, stale timestamp, tampered path/body", () => {
  const id = setup(); const d = device(); const b = id.bind({ envelope: grant("nyxa-owner", d.publicKey), sessionPublicPem: pem(d.publicKey) });
  const r = req(b.sid, d.privateKey); assert.equal(id.authenticate(r).ok, true);
  assert.equal(id.authenticate(r).reason, "request_replayed");
  assert.equal(id.authenticate(req(b.sid, d.privateKey, { ts: T - 120 })).reason, "request_time_invalid");
  const r2 = req(b.sid, d.privateKey, { p: "/api/room/evolution/view?u=nyxa-owner" }); r2.path = "/api/room/evolution/view?u=participant-b";
  assert.equal(id.authenticate(r2).reason, "request_signature_invalid");
  const r3 = req(b.sid, d.privateKey, { method: "POST", body: "{\"a\":1}" }); r3.body = "{\"a\":2}";
  assert.equal(id.authenticate(r3).reason, "request_signature_invalid");
});
test("session switching and cross-user access", () => {
  const id = setup(); const dA = device(), dB = device();
  const a = id.bind({ envelope: grant("nyxa-owner", dA.publicKey), sessionPublicPem: pem(dA.publicKey) });
  const b = id.bind({ envelope: grant("participant-b", dB.publicKey), sessionPublicPem: pem(dB.publicKey) });
  assert.equal(id.authenticate(req(a.sid, dB.privateKey)).reason, "request_signature_invalid"); // B uses A's sid
  const authB = id.authenticate(req(b.sid, dB.privateKey));
  assert.equal(id.authorizePersonal(authB, "nyxa-owner").reason, "cross_user_access");
  id.revoke(a.sid); assert.equal(id.authenticate(req(a.sid, dA.privateKey)).reason, "session_revoked");
  id.revokePrincipal("participant-b"); assert.equal(id.authenticate(req(b.sid, dB.privateKey)).reason, "session_revoked");
  T += 9 * 3600; const c = id.bind({ envelope: grant("nyxa-owner", dA.publicKey), sessionPublicPem: pem(dA.publicKey) });
  T += 9 * 3600; assert.equal(id.authenticate(req(c.sid, dA.privateKey)).reason, "session_expired");
});
test("middleware ignores the Room name and answers 401 identity_insufficient", () => {
  const id = setup(); let code, body; const res = { status(c) { code = c; return this; }, json(b) { body = b; } };
  requireBoundIdentity(id)({ method: "GET", url: "/x", user: { name: "Johannes" }, get: () => undefined }, res, () => { throw Error("must not pass"); });
  assert.equal(code, 401); assert.equal(body.error, "identity_insufficient");
});
