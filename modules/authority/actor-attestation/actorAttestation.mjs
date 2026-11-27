/**
 * NYXA Agent Attestation V1 (WP1, Continuation R2), 2026-11-27 Europe/Berlin.
 * Owner: Johannes Suess. Generated with Claude Code (cloud session). Status: DRAFT / NOT DEPLOYED.
 *
 * Cryptographic actor binding per proposal. An agent signs the canonical proposal digest with
 * the Ed25519 key of its Agent Passport. The backend verifies it independently of any bridge
 * or transport. Reuses the existing Human Gate canonicalization (canonicalHumanGate) and
 * Node's Ed25519 verification exactly as passkeyAuthorityV1.js does for passkey grants.
 *
 * Binds: actor (passport-pinned, no substitution), proposal digest (no scope/target/action
 * tampering), passport scope/action allowlist (no scope escalation), audience (no cross-server
 * reuse), validity window <= 120 s, one-use nonce in a durable ledger (no replay, also after
 * restart). Tailnet identity or forwarded traffic never substitutes for this signature.
 *
 * SEPARATION OF CONCERNS (R3): an attestation proves WHO asks and WHAT exactly is asked. It never
 * grants authority. Authorization stays with the existing layers: mandate store, capability gate
 * (ToolPolicy), gamma, Human Gate tokens/grants and the issuer. Passport `actions` only NARROW what
 * a key may speak for; they cannot widen anything those layers decide.
 */
import { createHash, createPublicKey, sign as signEd25519, verify as verifyEd25519, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalHumanGate } from "./passkeyAuthorityV1.js";

export const ATTESTATION_SCHEMA = "nyxa-agent-attestation-v1";
const ATT_KEYS = ["schema", "key_id", "actor", "audience", "proposal_sha256", "nonce", "issued_at", "expires_at", "signature"];
const PASSPORT_FILE_KEYS = ["version", "audience", "passports", "revoked_key_ids"];
const PASSPORT_KEYS = ["key_id", "actor", "public_key_pem", "actions", "scope_prefixes", "not_before", "not_after"];
const MAX_TTL_SECONDS = 120;
const CLOCK_SKEW_SECONDS = 30;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const B64URL = /^[A-Za-z0-9_-]{80,100}$/;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const ACTOR = /^[a-z0-9][a-z0-9._-]{1,79}$/;

const deny = (reason) => ({ ok: false, reason });
const exact = (o, keys) => !!o && typeof o === "object" && !Array.isArray(o) &&
  Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));

export function proposalDigest(proposal) {
  return createHash("sha256").update(canonicalHumanGate(proposal)).digest("hex");
}

function signedPayload(att) {
  const { signature, ...unsigned } = att;
  return Buffer.from(canonicalHumanGate(unsigned), "utf8");
}

/** Load the pinned Agent Passport registry (operator-owned). Throws on any deviation. */
export function loadPassports(file, { requiredOwnerUid = 0 } = {}) {
  if (typeof file !== "string" || !file.startsWith("/")) throw Error("passports_invalid:path");
  const st = fs.lstatSync(file);
  if (st.isSymbolicLink() || !st.isFile()) throw Error("passports_invalid:not_regular_file");
  if (st.mode & 0o022) throw Error("passports_invalid:group_or_world_writable");
  // No self-registration: only the operator (root by default) may own the registry. An agent that
  // can write its own passport file could mint keys for any actor.
  if (st.uid !== requiredOwnerUid) throw Error("passports_invalid:owner");
  const dirSt = fs.statSync(path.dirname(file));
  if ((dirSt.mode & 0o022) || dirSt.uid !== requiredOwnerUid) throw Error("passports_invalid:directory");
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw Error("passports_invalid:json"); }
  if (!exact(cfg, PASSPORT_FILE_KEYS) || cfg.version !== 1 || typeof cfg.audience !== "string" ||
      !/^[a-z0-9][a-z0-9:._-]{2,120}$/.test(cfg.audience) || !Array.isArray(cfg.passports) ||
      cfg.passports.length < 1 || cfg.passports.length > 32 || !Array.isArray(cfg.revoked_key_ids) ||
      !cfg.revoked_key_ids.every((k) => typeof k === "string" && KEY_ID.test(k))) throw Error("passports_invalid:shape");
  const revoked = new Set(cfg.revoked_key_ids);
  const byKey = new Map();
  for (const p of cfg.passports) {
    if (!exact(p, PASSPORT_KEYS) || !KEY_ID.test(p.key_id) || !ACTOR.test(p.actor) ||
        !Array.isArray(p.actions) || p.actions.length < 1 || !p.actions.every((a) => typeof a === "string" && a.length > 0) ||
        !Array.isArray(p.scope_prefixes) || p.scope_prefixes.length < 1 ||
        !p.scope_prefixes.every((s) => typeof s === "string" && /^[a-z0-9-]+:\/[^\s]*\/$|^[a-z0-9-]+:\/$/.test(s)) ||
        !Number.isSafeInteger(p.not_before) || !Number.isSafeInteger(p.not_after) || p.not_after <= p.not_before)
      throw Error("passports_invalid:passport");
    let key;
    try { key = createPublicKey(p.public_key_pem); } catch { throw Error("passports_invalid:key"); }
    if (key.asymmetricKeyType !== "ed25519") throw Error("passports_invalid:key_type");
    if (byKey.has(p.key_id)) throw Error("passports_invalid:duplicate_key_id");
    byKey.set(p.key_id, Object.freeze({ keyId: p.key_id, actor: p.actor, key, notBefore: p.not_before, notAfter: p.not_after,
      revoked: revoked.has(p.key_id), actions: Object.freeze([...p.actions]), scopePrefixes: Object.freeze([...p.scope_prefixes]) }));
  }
  return Object.freeze({ audience: cfg.audience, byKey });
}

/** Durable one-use nonce ledger: one O_EXCL file per nonce; survives restarts. */
export function createNonceLedger(dir) {
  const st = fs.lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o022)) throw Error("nonce_ledger_invalid");
  return {
    claim(nonce, record) {
      try {
        const fd = fs.openSync(path.join(dir, nonce), "wx", 0o600);
        try { fs.writeSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        return true;
      } catch (e) { if (e && e.code === "EEXIST") return false; throw e; }
    },
  };
}

const within = (value, prefixes) => typeof value === "string" && !value.includes("..") &&
  !value.includes("\0") && prefixes.some((p) => value.startsWith(p));

/**
 * Verify an attestation for a raw proposal. Order is deliberate: every cheap structural and
 * policy check precedes the signature check, and the nonce is consumed only after the
 * signature is valid (an attacker cannot burn nonces with forged attestations).
 */
function verifyCore({ subject, action, scopes, claimedActor, attestation, registry, ledger, nowSeconds, boundActor }) {
  if (attestation === undefined || attestation === null) return deny("attestation_required");
  if (!exact(attestation, ATT_KEYS)) return deny("attestation_shape");
  const a = attestation;
  if (a.schema !== ATTESTATION_SCHEMA) return deny("attestation_schema");
  if (a.audience !== registry.audience) return deny("audience_mismatch");
  const passport = registry.byKey.get(a.key_id);
  if (!passport) return deny("unknown_passport");
  if (passport.revoked) return deny("passport_revoked");
  if (nowSeconds < passport.notBefore || nowSeconds >= passport.notAfter) return deny("passport_not_valid_now");
  if (a.actor !== passport.actor || (claimedActor !== undefined && claimedActor !== passport.actor)) return deny("actor_substitution");
  if (boundActor !== undefined && boundActor !== null && boundActor !== passport.actor) return deny("process_actor_mismatch");
  if (!passport.actions.includes(action)) return deny("action_not_in_passport");
  if (!scopes.every((v) => within(v, passport.scopePrefixes))) return deny("scope_escalation");
  if (typeof a.proposal_sha256 !== "string" || !SHA.test(a.proposal_sha256)) return deny("attestation_shape");
  let digest;
  try { digest = proposalDigest(subject); } catch { return deny("proposal_not_canonical"); }
  if (a.proposal_sha256 !== digest) return deny("proposal_digest_mismatch");
  if (!Number.isSafeInteger(a.issued_at) || !Number.isSafeInteger(a.expires_at)) return deny("attestation_shape");
  if (a.expires_at <= a.issued_at || a.expires_at - a.issued_at > MAX_TTL_SECONDS) return deny("ttl_invalid");
  if (a.issued_at > nowSeconds + CLOCK_SKEW_SECONDS) return deny("issued_in_future");
  if (a.expires_at <= nowSeconds) return deny("attestation_expired");
  if (typeof a.nonce !== "string" || !UUID.test(a.nonce)) return deny("nonce_invalid");
  if (typeof a.signature !== "string" || !B64URL.test(a.signature)) return deny("signature_shape");
  let valid = false;
  try { valid = verifyEd25519(null, signedPayload(a), passport.key, Buffer.from(a.signature, "base64url")); } catch { valid = false; }
  if (!valid) return deny("signature_invalid");
  let fresh;
  try { fresh = ledger.claim(a.nonce, { key_id: a.key_id, actor: a.actor, action, subject_sha256: digest, at: nowSeconds }); }
  catch { return deny("nonce_ledger_unavailable"); }
  if (!fresh) return deny("replay");
  // authorityGranted:false is deliberate and checked by callers/tests: identity is not permission.
  return { ok: true, actor: passport.actor, keyId: passport.keyId, proposalSha256: digest, nonce: a.nonce, authorityGranted: false };
}

/**
 * Verify an attestation for a raw proposal. Order is deliberate: every cheap structural and
 * policy check precedes the signature check, and the nonce is consumed only after the
 * signature is valid (an attacker cannot burn nonces with forged attestations).
 */
export function verifyActorAttestation({ proposal, attestation, registry, ledger, nowSeconds, boundActor }) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return deny("proposal_shape");
  return verifyCore({ subject: proposal, action: proposal.action, scopes: [proposal.scope, proposal.target],
    claimedActor: proposal.actor, attestation, registry, ledger, nowSeconds, boundActor });
}

/** Direct (non-proposal) write tools: the signed subject is {tool, arguments}. */
export const DIRECT_WRITE_TOOLS = Object.freeze(["nyxa_mandate_issue", "nyxa_mandate_derive", "nyxa_mandate_revoke", "nyxa_human_grant_issue"]);
export function toolSubject(tool, args) { return { tool, arguments: args }; }
export function toolScopes(tool, args) {
  if (tool === "nyxa_mandate_issue" || tool === "nyxa_mandate_derive") return [args.scope_prefix, args.target_prefix].filter((v) => v !== undefined);
  return [];
}
export function verifyToolAttestation({ tool, args, attestation, registry, ledger, nowSeconds, boundActor }) {
  if (!DIRECT_WRITE_TOOLS.includes(tool)) return deny("tool_not_attestable");
  if (!args || typeof args !== "object" || Array.isArray(args)) return deny("arguments_shape");
  return verifyCore({ subject: toolSubject(tool, args), action: tool, scopes: toolScopes(tool, args),
    claimedActor: undefined, attestation, registry, ledger, nowSeconds, boundActor });
}

/** Agent-side helper: produce an attestation with the passport's private key. */
export function signActorAttestation({ proposal, subject = proposal, keyId, actor, privateKey, audience, nowSeconds, ttlSeconds = 60, nonce = randomUUID() }) {
  const att = { schema: ATTESTATION_SCHEMA, key_id: keyId, actor, audience,
    proposal_sha256: proposalDigest(subject), nonce, issued_at: nowSeconds, expires_at: nowSeconds + ttlSeconds };
  return { ...att, signature: signEd25519(null, Buffer.from(canonicalHumanGate(att), "utf8"), privateKey).toString("base64url") };
}
