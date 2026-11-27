/**
 * NYXA Room Identity Binding V1 (F9 preparation), 2026-11-27 Europe/Berlin. Owner: Johannes Suess.
 * Generated with Claude Code. Status: IMPLEMENTED / ADVERSARIALLY TESTED IN ISOLATION, not deployed.
 *
 * Reuses the EXISTING passkey Human Gate contract unchanged: grants "nyxa-human-authority-grant-v2"
 * issued by webauthn://auth.future24.eu, Ed25519 over the Human Gate canonical JSON, the same claim set
 * and the same scope/time checks as /opt/nyxa-authority-v1/issuer_claim_service.py. Nonces are consumed
 * in the existing O_EXCL ledger of the agent attestation module.
 *
 *  1 bind   : a passkey grant for operation "room-identity-bind-v1" (action room.session.bind, target
 *             room:participant:<principal>) whose artifact_sha256 commits to a client-generated,
 *             non-exportable session key (P-256) -> server-side session {sid, principal, key}.
 *  2 request: every personal request is signed by that session key over {sid, method, path,
 *             body_sha256, ts, nonce}; per-request nonce + 60 s window.
 *  3 access : personal resources are released only if session.principal === resource owner.
 * The Room login name is NEVER used for authorization (it is impersonable by design).
 */
import { createHash, createPublicKey, verify as cverify, randomBytes } from "node:crypto";
import { canonicalHumanGate as canonical } from "../actor-attestation/passkeyAuthorityV1.excerpt.js";
import { createNonceLedger } from "../actor-attestation/actorAttestation.mjs";

export const OPERATION = "room-identity-bind-v1";
const CLAIMS = ["schema", "grant_id", "issuer", "principal", "credential_fingerprint", "action", "target", "artifact_sha256",
  "artifact_path", "nonce", "issued_at", "expires_at", "max_executions", "audit_correlation", "transaction_digest",
  "user_verification", "origin", "rp_id"].sort();
const HEX = /^[0-9a-f]{64}$/; const B64 = /^[A-Za-z0-9_-]+$/; const NONCE = /^[A-Za-z0-9_-]{32,128}$/;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const deny = (reason) => ({ ok: false, reason });

/** Thumbprint of the session public key (SPKI DER). */
export const keyThumbprint = (spkiPem) => sha(createPublicKey(spkiPem).export({ type: "spki", format: "der" }));
/** What the passkey grant must commit to (artifact_sha256): the session key and the participant. */
export const bindingArtifact = ({ principal, sessionKeyThumbprint }) => sha(canonical({ schema: "nyxa-room-binding-v1", principal, session_key: sessionKeyThumbprint }));
/** The registered transaction for a participant (mirrors TX_FIELDS of the issuer catalog). */
export const bindTransaction = (principal) => ({ operation_id: OPERATION, action: "room.session.bind", target: `room:participant:${principal}`,
  artifact_sha256: "*", artifact_path: "room://session", display: `Room-Sitzung als ${principal} binden`, ttl_seconds: 120 });

export function createRoomIdentity({ humanGatePublicPem, nonceDir, allowedPrincipals, sessionTtlSeconds = 8 * 3600, now = () => Math.floor(Date.now() / 1000) }) {
  if (!Array.isArray(allowedPrincipals) || !allowedPrincipals.length) throw Error("principals_required");
  const gateKey = createPublicKey(humanGatePublicPem); const ledger = createNonceLedger(nonceDir);
  const sessions = new Map();

  function bind({ envelope, sessionPublicPem }) {
    if (!envelope || typeof envelope !== "object" || Object.keys(envelope).sort().join() !== "algorithm,claims,signature" || envelope.algorithm !== "Ed25519") return deny("envelope_invalid");
    const c = envelope.claims;
    if (!c || typeof c !== "object" || Object.keys(c).sort().join() !== CLAIMS.join()) return deny("claims_invalid");
    if (!allowedPrincipals.includes(c.principal)) return deny("principal_not_registered");
    let thumb; try { thumb = keyThumbprint(sessionPublicPem); if (createPublicKey(sessionPublicPem).asymmetricKeyDetails?.namedCurve !== "prime256v1") return deny("session_key_type"); } catch { return deny("session_key_invalid"); }
    const tx = bindTransaction(c.principal); const t = now();
    const txDigest = sha(canonical({ ...tx, artifact_sha256: c.artifact_sha256 }));
    if (c.schema !== "nyxa-human-authority-grant-v2" || c.issuer !== "webauthn://auth.future24.eu" || c.origin !== "https://auth.future24.eu" ||
        c.rp_id !== "auth.future24.eu" || c.user_verification !== true || c.max_executions !== 1 ||
        c.action !== tx.action || c.target !== tx.target || c.artifact_path !== tx.artifact_path ||
        c.artifact_sha256 !== bindingArtifact({ principal: c.principal, sessionKeyThumbprint: thumb }) ||
        c.transaction_digest !== txDigest || typeof c.nonce !== "string" || !NONCE.test(c.nonce) || !HEX.test(String(c.credential_fingerprint)) ||
        !Number.isInteger(c.issued_at) || !Number.isInteger(c.expires_at) || c.issued_at > t + 30 || c.issued_at < t - 300 ||
        c.expires_at <= t || c.expires_at <= c.issued_at || c.expires_at - c.issued_at > tx.ttl_seconds) return deny("grant_scope_or_time_invalid");
    if (typeof envelope.signature !== "string" || !B64.test(envelope.signature)) return deny("signature_encoding");
    const sig = Buffer.from(envelope.signature, "base64url");
    if (sig.length !== 64 || sig.toString("base64url") !== envelope.signature) return deny("noncanonical_signature");
    if (!cverify(null, Buffer.from(canonical(c)), gateKey, sig)) return deny("signature_invalid");
    if (!ledger.claim("bind-" + c.nonce, { grant_id: c.grant_id, principal: c.principal, at: t })) return deny("grant_replayed");
    const sid = randomBytes(24).toString("base64url");
    sessions.set(sid, { sid, principal: c.principal, keyPem: sessionPublicPem, thumb, credential: c.credential_fingerprint, expires: t + sessionTtlSeconds, revoked: false });
    return { ok: true, sid, principal: c.principal, expires: t + sessionTtlSeconds };
  }

  /** req: {sid, method, path, body, ts, nonce, signature(b64url, P-256 ieee-p1363)} */
  function authenticate(req) {
    const s = sessions.get(req?.sid); if (!s) return deny("no_bound_session");
    const t = now(); if (s.revoked) return deny("session_revoked"); if (t >= s.expires) return deny("session_expired");
    if (!Number.isInteger(req.ts) || Math.abs(t - req.ts) > 60) return deny("request_time_invalid");
    if (typeof req.nonce !== "string" || !NONCE.test(req.nonce)) return deny("request_nonce_invalid");
    const msg = canonical({ sid: s.sid, method: req.method, path: req.path, body_sha256: sha(req.body ?? ""), ts: req.ts, nonce: req.nonce });
    let ok = false; try { ok = cverify("sha256", Buffer.from(msg), { key: createPublicKey(s.keyPem), dsaEncoding: "ieee-p1363" }, Buffer.from(String(req.signature), "base64url")); } catch { ok = false; }
    if (!ok) return deny("request_signature_invalid");
    if (!ledger.claim(`req-${s.thumb.slice(0, 16)}-${req.nonce}`, { sid: s.sid, at: t })) return deny("request_replayed");
    return { ok: true, principal: s.principal, sid: s.sid };
  }

  /** Personal resources: owner must be the authenticated principal. Name-based Room identity is ignored. */
  function authorizePersonal(auth, resourceOwner) {
    if (!auth?.ok) return deny(auth?.reason ?? "unauthenticated");
    return auth.principal === resourceOwner ? { ok: true } : deny("cross_user_access");
  }
  const revoke = (sid) => { const s = sessions.get(sid); if (s) s.revoked = true; return !!s; };
  const revokePrincipal = (p) => { for (const s of sessions.values()) if (s.principal === p) s.revoked = true; };
  return { bind, authenticate, authorizePersonal, revoke, revokePrincipal, _sessions: sessions };
}

/** Express middleware: personal routes accept only bound, signed requests; Room JWT name is not consulted. */
export function requireBoundIdentity(identity) {
  return (req, res, next) => {
    const h = (k) => req.get?.(`x-nyxa-room-${k}`);
    const auth = identity.authenticate({ sid: h("sid"), method: req.method, path: req.originalUrl ?? req.url,
      body: typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body ?? ""), ts: Number(h("ts")), nonce: h("nonce"), signature: h("signature") });
    if (!auth.ok) return res.status(401).json({ error: "identity_insufficient", reason: auth.reason });
    req.nyxaPrincipal = auth.principal; next();
  };
}
