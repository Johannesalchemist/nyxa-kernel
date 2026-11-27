/**
 * Backend-side enforcement point for NYXA Agent Attestation V1 (WP1, Continuation R2).
 * Imported by the governed backend (dist/server.js handleProposeAction) — independent of
 * any bridge. Configuration comes only from the backend's own process environment:
 *   NYXA_ACTOR_ATTESTATION_MODE = off | required        (anything else -> fail closed)
 *   NYXA_AGENT_PASSPORTS        = absolute path to the pinned passport registry
 *   NYXA_ATTESTATION_NONCE_DIR  = absolute path to the durable nonce ledger directory
 *   NYXA_DEVELOPMENT_ACTOR      = optional process-bound actor (must equal passport actor)
 *   NYXA_PASSPORTS_OWNER_UID    = required owner uid of registry + its directory (default 0 = root)
 * In "required" mode every proposal on every path (nyxa_propose_action, toolbox.execute
 * effect capabilities, direct backend start) needs a valid attestation.
 */
import { loadPassports, createNonceLedger, verifyActorAttestation, verifyToolAttestation } from "./actorAttestation.mjs";

import fs from "node:fs";
let cached;
// R4: revocation/rotation must take effect without restart. The registry is re-read whenever its
// mtime/size/inode changes (cheap stat per request); a vanished or invalid registry fails closed.
function registryStamp() {
  try { const st = fs.statSync(process.env.NYXA_AGENT_PASSPORTS); return `${st.ino}:${st.size}:${st.mtimeMs}`; } catch { return "missing"; }
}
function context() {
  if (cached && cached.mode === "required" && cached.stamp !== registryStamp()) cached = undefined;
  if (cached) return cached;
  const mode = process.env.NYXA_ACTOR_ATTESTATION_MODE ?? "off";
  if (mode === "off") return (cached = { mode });
  if (mode !== "required") return (cached = { mode: "invalid" });
  try {
    const owner = Number(process.env.NYXA_PASSPORTS_OWNER_UID ?? 0);
    if (!Number.isSafeInteger(owner) || owner < 0) throw Error("owner_uid_invalid");
    const stamp = registryStamp();
    cached = { mode, stamp, registry: loadPassports(process.env.NYXA_AGENT_PASSPORTS, { requiredOwnerUid: owner }),
      ledger: createNonceLedger(process.env.NYXA_ATTESTATION_NONCE_DIR) };
  } catch (e) { cached = { mode: "invalid", error: String(e && e.message) }; }
  return cached;
}

export function attestationRequired() {
  return context().mode !== "off";
}

export async function gateProposal(rawProposal, attestation, nowMs = Date.now()) {
  const ctx = context();
  if (ctx.mode === "off") return { ok: true, mode: "off" };
  if (ctx.mode !== "required") return { ok: false, reason: "attestation_config_invalid" };
  return verifyActorAttestation({ proposal: rawProposal, attestation, registry: ctx.registry, ledger: ctx.ledger,
    nowSeconds: Math.floor(nowMs / 1000), boundActor: process.env.NYXA_DEVELOPMENT_ACTOR });
}

/**
 * Direct write tools outside the proposal path (mandate issue/derive/revoke, human grant issue).
 * Returns the arguments WITHOUT the attestation so the existing handlers (and their exact-key
 * checks) run unchanged. Authorization (token, issuer grant, parent mandate) remains theirs.
 */
export async function gateDirectTool(tool, input, nowMs = Date.now()) {
  const { attestation, ...args } = input ?? {};
  const ctx = context();
  if (ctx.mode === "off") return { ok: true, mode: "off", args };
  if (ctx.mode !== "required") return { ok: false, reason: "attestation_config_invalid" };
  const r = verifyToolAttestation({ tool, args, attestation, registry: ctx.registry, ledger: ctx.ledger,
    nowSeconds: Math.floor(nowMs / 1000), boundActor: process.env.NYXA_DEVELOPMENT_ACTOR });
  return r.ok ? { ...r, args } : r;
}

/** Test hook only. */
export function _resetForTesting() { cached = undefined; }
