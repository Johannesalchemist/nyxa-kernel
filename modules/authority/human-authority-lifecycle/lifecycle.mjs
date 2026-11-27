/**
 * NYXA One-Click Human Authority — persistent lifecycle (R8, 2026-11-27 Europe/Berlin). Owner: Johannes Suess.
 * Generated with Claude Code. Extends Authority V2 (issueFrame / framePublisher / issuer IPC); no parallel authority.
 *
 * REQUESTED -> PENDING -> APPROVED -> CLAIMING -> ACTIVE -> COMPLETED
 *            \-> EXPIRED | REVOKED | DENIED | FAILED
 * - One human confirmation per request (passkey in the portal). Everything else is server-side:
 *   publish (publisher worker), discover (issuer, read-only), claim+issue (V2 issueFrame), status.
 * - Durable: one state file per request (atomic tmp+rename+fsync) + append-only journal. Crash-safe:
 *   the issuer claim is one-use; a crash in CLAIMING can never produce a second mandate (see recover()).
 * - No self-authorization: the lifecycle cannot create a grant; it only reacts to issuer-verified grants.
 */
import fs from "node:fs"; import path from "node:path"; import { randomUUID } from "node:crypto";

export const STATES = ["REQUESTED", "PENDING", "APPROVED", "CLAIMING", "ACTIVE", "COMPLETED", "EXPIRED", "REVOKED", "DENIED", "FAILED"];
const NEXT = { REQUESTED: ["PENDING", "FAILED", "EXPIRED"], PENDING: ["APPROVED", "EXPIRED", "DENIED", "FAILED"], APPROVED: ["CLAIMING", "EXPIRED", "FAILED"],
  CLAIMING: ["ACTIVE", "DENIED", "FAILED"], ACTIVE: ["COMPLETED", "REVOKED"], COMPLETED: [], EXPIRED: [], REVOKED: [], DENIED: [], FAILED: [] };
const FRAME = /^nyxa-dev-frame-v2-(governed-dev|silicon-dev)-(regular|extended)-(chatgpt|claude|sophia)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROPOSAL_WINDOW_MS = 86_400_000;
// Issuer reasons that are final for a request (no retry); everything else is transient and retried.
const FINAL_DENY = /^(DENY:)?(frame_transaction_pin_mismatch|frame_proposal_time_invalid|grant_time_invalid|signed_claims_mismatch|invalid_signature|issuer_actor_mismatch|issuer_request_differs_from_signed_policy|ambiguous_grants|missing_revoked_or_replayed|already_claimed|grant_revoked_or_consumed|claimed_transaction_mismatch|grant_expired_after_claim)$/;

export function createLifecycle({ dir, issueFrame, discover, mandateStore, now = Date.now, log = () => {} }) {
  for (const d of ["requests", "inbox", "outbox"]) fs.mkdirSync(path.join(dir, d), { recursive: true, mode: 0o700 });
  const file = (id) => path.join(dir, "requests", `${id}.json`);
  const journal = (e) => { const fd = fs.openSync(path.join(dir, "journal.jsonl"), "a", 0o600); try { fs.writeSync(fd, JSON.stringify({ at: new Date(now()).toISOString(), ...e }) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
  const read = (id) => JSON.parse(fs.readFileSync(file(id), "utf8"));
  const write = (r) => { const tmp = `${file(r.id)}.${process.pid}.tmp`; const fd = fs.openSync(tmp, "w", 0o600);
    try { fs.writeSync(fd, JSON.stringify(r)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(tmp, file(r.id));
    const dfd = fs.openSync(path.join(dir, "requests"), "r"); try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); } };
  function move(r, to, extra = {}) {
    if (!NEXT[r.state]?.includes(to)) throw Error(`illegal_transition_${r.state}_to_${to}`);
    const n = { ...r, ...extra, state: to, updatedAt: now(), history: [...r.history, { state: to, at: now(), ...(extra.reason ? { reason: extra.reason } : {}) }] };
    journal({ request: r.id, from: r.state, to, ...extra }); write(n); log(r.id, r.state, "->", to); return n;
  }

  /** WP1: exactly bounded request; the frame (policy) decides scope/budgets, the request only selects it. */
  function request({ actor, root = "governed-dev", window = "regular", purpose }) {
    const operation = `nyxa-dev-frame-v2-${root}-${window}-${actor}`;
    if (!FRAME.test(operation)) throw Error("frame_not_allowed");
    if (!purpose || String(purpose).length > 300) throw Error("purpose_required");
    // At most one open request per frame (the publisher allows one pending proposal per frame binding).
    const open = list().find((x) => x.operation === operation && ["REQUESTED", "PENDING", "APPROVED", "CLAIMING"].includes(x.state));
    if (open) return { ok: false, reason: "request_already_open", id: open.id };
    const r = { id: randomUUID(), operation, actor, purpose: String(purpose), state: "REQUESTED", createdAt: now(), updatedAt: now(), history: [{ state: "REQUESTED", at: now() }] };
    write(r); journal({ request: r.id, to: "REQUESTED", operation, actor });
    // Hand-off to the publisher worker (runs as the portal's service identity): inbox file, O_EXCL.
    const fd = fs.openSync(path.join(dir, "inbox", `${r.id}.json`), "wx", 0o640); try { fs.writeSync(fd, JSON.stringify({ request_id: r.id, operation })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return { ok: true, id: r.id, state: r.state };
  }
  const list = () => fs.readdirSync(path.join(dir, "requests")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, "requests", f), "utf8")));

  /** One idempotent processing step for every open request. Safe to run concurrently-serialised and after crashes. */
  async function tick() {
    const lockPath = path.join(dir, "tick.lock"); let lock;
    // A crashed tick must not block forever: a lock older than 5 minutes is stale (ticks take seconds).
    try { if (now() - fs.statSync(lockPath).mtimeMs > 300_000) { fs.unlinkSync(lockPath); journal({ lock: "stale_removed" }); } } catch {}
    try { lock = fs.openSync(lockPath, "wx", 0o600); } catch { return { skipped: "tick_in_progress" }; }
    const changed = [];
    try {
      for (let r0 of list()) { let r = r0; try {
        const t = now();
        if (r.state === "REQUESTED") {
          const ack = path.join(dir, "outbox", `${r.id}.json`);
          if (fs.existsSync(ack)) { const a = JSON.parse(fs.readFileSync(ack, "utf8"));
            if (a.ok && UUID.test(a.proposal_id) && a.operation_id === r.operation) r = move(r, "PENDING", { proposalId: a.proposal_id, proposalExpiresAt: a.expires_at_ms });
            else r = move(r, "FAILED", { reason: `publish_failed:${a.reason ?? "invalid_ack"}` }); }
          else if (t - r.createdAt > 15 * 60_000) r = move(r, "FAILED", { reason: "publisher_unavailable" });
        }
        if (r.state === "PENDING") {
          if (t >= r.proposalExpiresAt) r = move(r, "EXPIRED", { reason: "proposal_window_elapsed" });
          else { const d = await discover(r.proposalId);
            if (d.ok) r = move(r, "APPROVED", { grantId: d.grant_id });
            else if (d.reason === "DENY:ambiguous_grants") r = move(r, "DENIED", { reason: d.reason }); }
        }
        if (r.state === "APPROVED") r = move(r, "CLAIMING", { claimStartedAt: t });
        if (r.state === "CLAIMING") r = await claimStep(r);
        if (r.state === "ACTIVE") {
          const m = (await mandateStore.list()).find((x) => x.mandateId === r.mandateId);
          if (!m) r = move(r, "REVOKED", { reason: "mandate_missing" });
          else if (m.revoked) r = move(r, "REVOKED", { reason: "mandate_revoked" });
          else if (Date.parse(m.expiresAt) <= t) r = move(r, "COMPLETED", { reason: "mandate_window_elapsed" });
        }
        changed.push({ id: r.id, state: r.state });
      } catch (e) { // one failing request never blocks the others; state on disk is the last durable transition
        journal({ request: r0.id, error: String(e.message).slice(0, 160) }); changed.push({ id: r0.id, error: String(e.message).slice(0, 80) }); } }
    } finally { fs.closeSync(lock); fs.unlinkSync(lockPath); }
    return { changed };
  }

  async function claimStep(r) {
    // Recovery: if a previous run already issued the mandate (journalled by the audit hook), never issue again.
    const issued = journalEntries().find((e) => e.request === r.id && e.phase === "delegation_issued" && e.mandateId);
    if (issued) return move(r, "ACTIVE", { mandateId: issued.mandateId, reason: "recovered_from_journal" });
    const res = await issueFrame({ grantId: r.grantId, actor: r.actor, mandateStore,
      audit: async (e) => journal({ request: r.id, ...e }) });
    if (res.ok) return move(r, "ACTIVE", { mandateId: res.mandateId, mandateExpiresAt: res.expiresAt });
    // A consumed grant without a journalled mandate means the claim happened but issuance did not complete:
    // the one-use grant is burned. Never re-issue; require a fresh human confirmation.
    if (/missing_revoked_or_replayed|already_claimed|grant_revoked_or_consumed/.test(res.reason)) return move(r, "FAILED", { reason: `grant_consumed_without_mandate:${res.reason}` });
    if (FINAL_DENY.test(res.reason)) return move(r, "DENIED", { reason: res.reason });
    const attempts = (r.claimAttempts ?? 0) + 1;
    if (attempts >= 5) return move(r, "FAILED", { reason: `claim_retries_exhausted:${res.reason}` });
    const n = { ...r, claimAttempts: attempts, lastError: res.reason, updatedAt: now() }; write(n); journal({ request: r.id, retry: attempts, reason: res.reason }); return n;
  }
  const journalEntries = () => { const f = path.join(dir, "journal.jsonl"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []; };

  /** WP5: what Johannes (and the requesting agent) sees — the concrete request and its real processing state. */
  function status(id) { const r = read(id); return { id: r.id, operation: r.operation, actor: r.actor, purpose: r.purpose, state: r.state,
    proposalId: r.proposalId ?? null, mandateId: r.mandateId ?? null, history: r.history.map((h) => `${new Date(h.at).toISOString()} ${h.state}${h.reason ? " (" + h.reason + ")" : ""}`) }; }
  async function revoke(id, reason) { const r = read(id); if (r.state !== "ACTIVE") throw Error("not_active");
    await mandateStore.revoke(r.mandateId, reason); return move(r, "REVOKED", { reason }); }
  return { request, tick, status, list, revoke, journal: journalEntries };
}
