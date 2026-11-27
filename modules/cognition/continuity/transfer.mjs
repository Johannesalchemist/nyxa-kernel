/**
 * Cross-agent experience transfer (R8). Experience moves between agents; permissions, identity and authority NEVER do.
 * Reuses continuity records (validated, trusted) and the existing governed store; no own storage.
 */
import { recallBundle } from "./continuity.mjs";
const AUTHORITY = /\b(mandate|grant[_ ]?id|issuer|passkey|passport|key_id|token|NYXA_DEVELOPMENT_ACTOR|actor binding|sudo|root (password|access)|capability class|scope_prefix|max_executions)\b/i;
/** Only validated, trusted experience is transferable; anything that carries authority content is excluded. */
export function transferBundle(records, { fromAgent, toAgent, query, tokenBudget = 400 }) {
  if (!toAgent || toAgent === fromAgent) throw Error("distinct_recipient_required");
  const pool = records.filter((r) => r.status === "active" && r.trust === "trusted" && r.validated && (!fromAgent || r.provenance.agent === fromAgent));
  const excluded = pool.filter((r) => AUTHORITY.test(`${r.topic} ${r.content}`)).map((r) => ({ id: r.id, reason: "authority_content_not_transferable" }));
  const allowed = pool.filter((r) => !AUTHORITY.test(`${r.topic} ${r.content}`));
  const b = recallBundle(allowed, { query, agent: toAgent, tokenBudget, requireValidated: true });
  const byId = new Map(allowed.map((r) => [r.id, r]));
  return { toAgent, experiences: b.ids.map((id) => { const r = byId.get(id); return { id, kind: r.kind, topic: r.topic, content: r.content, from: r.provenance.agent, validation: r.validation }; }),
    excluded, grantsAuthority: false, identityChanges: null, permissions: [] };
}
/** Guard used by recipients: applying a bundle may change behaviour, never actor, mandates or capabilities. */
export function applyBundle(recipient, bundle) {
  if (bundle.grantsAuthority !== false || bundle.permissions?.length || bundle.identityChanges) throw Error("authority_transfer_refused");
  const before = JSON.stringify({ actor: recipient.actor, mandates: recipient.mandates, capabilities: recipient.capabilities });
  const next = { ...recipient, knowledge: [...(recipient.knowledge ?? []), ...bundle.experiences] };
  if (JSON.stringify({ actor: next.actor, mandates: next.mandates, capabilities: next.capabilities }) !== before) throw Error("authority_changed");
  return next;
}
