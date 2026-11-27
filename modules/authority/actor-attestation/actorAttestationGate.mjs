/**
 * Backend-side enforcement point for NYXA Agent Attestation V1 (WP1, Continuation R2).
 * Imported by the governed backend (dist/server.js handleProposeAction) — independent of
 * any bridge. Configuration comes only from the backend's own process environment:
 *   NYXA_ACTOR_ATTESTATION_MODE = off | required        (anything else -> fail closed)
 *   NYXA_AGENT_PASSPORTS        = absolute path to the pinned passport registry
 *   NYXA_ATTESTATION_NONCE_DIR  = absolute path to the durable nonce ledger directory
 *   NYXA_DEVELOPMENT_ACTOR      = optional process-bound actor (must equal passport actor)
 * In "required" mode every proposal on every path (nyxa_propose_action, toolbox.execute
 * effect capabilities, direct backend start) needs a valid attestation.
 */
import { loadPassports, createNonceLedger, verifyActorAttestation } from "./actorAttestation.mjs";

let cached;
function context() {
  if (cached) return cached;
  const mode = process.env.NYXA_ACTOR_ATTESTATION_MODE ?? "off";
  if (mode === "off") return (cached = { mode });
  if (mode !== "required") return (cached = { mode: "invalid" });
  try {
    cached = { mode, registry: loadPassports(process.env.NYXA_AGENT_PASSPORTS),
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

/** Test hook only. */
export function _resetForTesting() { cached = undefined; }
