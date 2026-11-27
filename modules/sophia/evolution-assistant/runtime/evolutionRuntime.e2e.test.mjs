// Real HTTP end-to-end: node:http server + Room identity binding + evolution handlers; client signs with a
// P-256 device key bound by a (test-issued) passkey grant. Same isolated-tree pattern as the identity tests.
import test from "node:test"; import assert from "node:assert/strict";
import http from "node:http"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { generateKeyPairSync, sign, randomBytes, createHash } from "node:crypto";
const HERE = path.dirname(new URL(import.meta.url).pathname); const AA = path.join(HERE, "../../../authority/actor-attestation");
const tree = fs.mkdtempSync(path.join(os.tmpdir(), "nyxa-evo-e2e-")); fs.mkdirSync(path.join(tree, "actor-attestation")); fs.mkdirSync(path.join(tree, "room-identity"));
for (const f of ["actorAttestation.mjs", "passkeyAuthorityV1.excerpt.js"]) fs.copyFileSync(path.join(AA, f), path.join(tree, "actor-attestation", f));
fs.copyFileSync(path.join(AA, "passkeyAuthorityV1.excerpt.js"), path.join(tree, "actor-attestation", "passkeyAuthorityV1.js"));
fs.copyFileSync(path.join(HERE, "../../../authority/room-identity/roomIdentity.mjs"), path.join(tree, "room-identity", "roomIdentity.mjs"));
const { createRoomIdentity, bindTransaction, bindingArtifact, keyThumbprint } = await import(path.join(tree, "room-identity", "roomIdentity.mjs"));
const { canonicalHumanGate: canonical } = await import(path.join(tree, "actor-attestation", "passkeyAuthorityV1.excerpt.js"));
const { createHandlers, heartbeatJob, persistable, restore } = await import("./evolutionRuntime.mjs");
const { possibility } = await import("../evolutionAssistant.mjs");

const sha = (s) => createHash("sha256").update(s).digest("hex"); const pem = (k) => k.export({ type: "spki", format: "pem" });
const gate = generateKeyPairSync("ed25519"); const nonceDir = fs.mkdtempSync(path.join(os.tmpdir(), "evo-n-")); fs.chmodSync(nonceDir, 0o700);
const identity = createRoomIdentity({ humanGatePublicPem: pem(gate.publicKey), nonceDir, allowedPrincipals: ["nyxa-owner", "participant-b"] });
const db = new Map(); const outbox = [];
const store = { load: async (p) => db.get(p), save: async (p, s) => db.set(p, JSON.parse(JSON.stringify(s))), submitCandidate: async (c) => outbox.push(c) };
// seed: synthetic model for owner with one awaiting proposal
{ const st = restore("nyxa-owner"); const H = (d, s, i) => st.model.add({ kind: "SELF_STATEMENT", dimension: d, statement: s, source: "synthetic:" + i, asOf: "2026-11-27", author: "human" });
  H("interest", "sketching diagrams", 1); H("capability", "explaining in workshops", 2);
  st.ledger.admit(possibility(st.model, { title: "Visual mini-workshop", kind: "discovered", basedOn: ["e1", "e2"], rationale: "r", nextSteps: ["sketch"] }), { now: Date.now() });
  db.set("nyxa-owner", persistable(st)); }
const H = createHandlers({ identity, store });
const server = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const auth = identity.authenticate({ sid: req.headers["x-nyxa-room-sid"], method: req.method, path: req.url, body, ts: Number(req.headers["x-nyxa-room-ts"]), nonce: req.headers["x-nyxa-room-nonce"], signature: req.headers["x-nyxa-room-signature"] });
  if (!auth.ok) { res.writeHead(401).end(JSON.stringify({ error: "identity_insufficient", reason: auth.reason })); return; }
  const u = new URL(req.url, "http://x"); const owner = u.searchParams.get("owner");
  const r = u.pathname === "/api/room/evolution/view" ? await H.view(auth, { owner }) : u.pathname === "/api/room/evolution/decide" ? await H.decide(auth, { owner, ...JSON.parse(body) }) : { status: 404, body: {} };
  res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify(r.body));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r)); const base = `http://127.0.0.1:${server.address().port}`;
function bindFor(principal) {
  const d = generateKeyPairSync("ec", { namedCurve: "prime256v1" }); const tx = bindTransaction(principal); const now = Math.floor(Date.now() / 1000);
  const art = bindingArtifact({ principal, sessionKeyThumbprint: keyThumbprint(pem(d.publicKey)) });
  const c = { schema: "nyxa-human-authority-grant-v2", grant_id: "g", issuer: "webauthn://auth.future24.eu", principal, credential_fingerprint: sha(principal), action: tx.action, target: tx.target,
    artifact_sha256: art, artifact_path: tx.artifact_path, nonce: randomBytes(24).toString("base64url"), issued_at: now, expires_at: now + 60, max_executions: 1, audit_correlation: "e2e",
    transaction_digest: sha(canonical({ ...tx, artifact_sha256: art })), user_verification: true, origin: "https://auth.future24.eu", rp_id: "auth.future24.eu" };
  const b = identity.bind({ envelope: { algorithm: "Ed25519", claims: c, signature: sign(null, Buffer.from(canonical(c)), gate.privateKey).toString("base64url") }, sessionPublicPem: pem(d.publicKey) });
  return { ...b, key: d.privateKey };
}
async function call(s, method, p, body = "") {
  const ts = Math.floor(Date.now() / 1000), nonce = randomBytes(24).toString("base64url");
  const sig = s ? sign("sha256", Buffer.from(canonical({ sid: s.sid, method, path: p, body_sha256: sha(body), ts, nonce })), { key: s.key, dsaEncoding: "ieee-p1363" }).toString("base64url") : "";
  const r = await fetch(base + p, { method, body: method === "GET" ? undefined : body, headers: s ? { "x-nyxa-room-sid": s.sid, "x-nyxa-room-ts": String(ts), "x-nyxa-room-nonce": nonce, "x-nyxa-room-signature": sig } : { "x-room-user": "Johannes" } });
  return { status: r.status, body: await r.json() };
}
test("HTTP e2e: bound owner reads and decides; name-only and cross-user denied; heartbeat stays silent", async (t) => {
  t.after(() => server.close());
  const owner = bindFor("nyxa-owner"), other = bindFor("participant-b"); assert.equal(owner.ok && other.ok, true);
  const anon = await call(null, "GET", "/api/room/evolution/view?owner=nyxa-owner"); assert.deepEqual([anon.status, anon.body.error], [401, "identity_insufficient"]);
  const cross = await call(other, "GET", "/api/room/evolution/view?owner=nyxa-owner"); assert.deepEqual([cross.status, cross.body.error], [403, "cross_user_access"]);
  const v = await call(owner, "GET", "/api/room/evolution/view?owner=nyxa-owner"); assert.equal(v.status, 200); assert.equal(v.body.decisions[0].status, "awaiting_decision");
  const crossDecide = await call(other, "POST", "/api/room/evolution/decide?owner=nyxa-owner", JSON.stringify({ id: "d1", verdict: "accept" })); assert.equal(crossDecide.status, 403);
  const hb1 = await heartbeatJob({ store, participants: ["nyxa-owner"], now: Date.parse("2026-11-27T14:00:00Z") });
  assert.equal(hb1[0].outcome, "silence_by_calibration"); assert.equal(outbox.length, 0); // no evidence yet that initiative is welcome
  const d = await call(owner, "POST", "/api/room/evolution/decide?owner=nyxa-owner", JSON.stringify({ id: "d1", verdict: "reject", never: true, reason: "not interested" }));
  assert.deepEqual([d.status, d.body.status], [200, "rejected"]);
  const again = await call(owner, "POST", "/api/room/evolution/decide?owner=nyxa-owner", JSON.stringify({ id: "d1", verdict: "maybe" })); assert.equal(again.status, 409);
  const hb2 = await heartbeatJob({ store, participants: ["nyxa-owner"], now: Date.parse("2026-11-27T14:00:00Z") });
  assert.equal(hb2[0].outcome, "observe"); assert.deepEqual(hb2[0].externalActions, []);
});
