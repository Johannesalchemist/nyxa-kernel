import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { createLifecycle } from "./lifecycle.mjs";
let T = Date.parse("2026-11-27T19:00:00Z"); const now = () => T;
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hal-")); const mandates = []; const grants = new Map(); const claimed = new Set(); let issueCalls = 0;
  const mandateStore = { issue: async (x) => { const m = { mandateId: `m${mandates.length + 1}`, expiresAt: new Date(T + 86400e3).toISOString(), revoked: false, ...x }; mandates.push(m); return m; },
    list: async () => mandates, revoke: async (id) => { mandates.find((m) => m.mandateId === id).revoked = true; } };
  const discover = async (pid) => { const g = [...grants.entries()].filter(([, v]) => v.proposalId === pid && !claimed.has(v.grantId)); return g.length === 1 ? { ok: true, grant_id: g[0][1].grantId, proposal_id: pid } : { ok: false, reason: g.length ? "DENY:ambiguous_grants" : "DENY:no_confirmed_grant" }; };
  const issueFrame = async ({ grantId, actor, mandateStore: ms, audit }) => { issueCalls++;
    const g = [...grants.values()].find((x) => x.grantId === grantId); if (!g || claimed.has(grantId)) return { ok: false, reason: "DENY:missing_revoked_or_replayed" };
    if (g.actor !== actor) return { ok: false, reason: "issuer_actor_mismatch" }; if (g.expired) return { ok: false, reason: "DENY:grant_time_invalid" };
    claimed.add(grantId); if (g.crashBeforeIssue) throw Error("process_killed");
    const m = await ms.issue({ actor, scopePrefix: g.scope }); await audit({ phase: "delegation_issued", grantId, mandateId: m.mandateId });
    if (g.crashAfterIssue) throw Error("process_killed_after_issue"); return { ok: true, mandateId: m.mandateId, expiresAt: m.expiresAt }; };
  const mk = () => createLifecycle({ dir, issueFrame, discover, mandateStore, now });
  const publish = (id, pid) => fs.writeFileSync(path.join(dir, "outbox", `${id}.json`), JSON.stringify({ ok: true, request_id: id, operation_id: JSON.parse(fs.readFileSync(path.join(dir, "requests", `${id}.json`))).operation, proposal_id: pid, expires_at_ms: T + 86400e3 }));
  return { dir, mandates, grants, mk, publish, calls: () => issueCalls };
}
const PID = () => crypto.randomUUID();
test("one confirmation -> grant taken over automatically -> ACTIVE; no browser needed after confirmation", async () => {
  const w = world(); let L = w.mk(); const r = L.request({ actor: "claude", purpose: "bounded dev patch" });
  assert.ok(fs.existsSync(path.join(w.dir, "inbox", `${r.id}.json`))); const pid = PID(); w.publish(r.id, pid);
  await L.tick(); assert.equal(L.status(r.id).state, "PENDING");
  await L.tick(); assert.equal(L.status(r.id).state, "PENDING"); // no approval -> no mutation
  assert.equal(w.mandates.length, 0);
  w.grants.set("g1", { grantId: "g1", proposalId: pid, actor: "claude", scope: "governed-dev:/" }); // human confirmed; browser may close now
  await L.tick(); const s = L.status(r.id); assert.equal(s.state, "ACTIVE"); assert.equal(w.mandates.length, 1);
});
test("restart keeps confirmed requests; duplicate delivery / repeated ticks never create a second mandate", async () => {
  const w = world(); const r = w.mk().request({ actor: "sophia", purpose: "p" }); const pid = PID(); w.publish(r.id, pid);
  await w.mk().tick(); w.grants.set("g1", { grantId: "g1", proposalId: pid, actor: "sophia", scope: "s" });
  const L2 = w.mk(); await L2.tick(); await L2.tick(); await w.mk().tick();
  assert.equal(w.mandates.length, 1); assert.equal(L2.status(r.id).state, "ACTIVE");
  assert.equal(L2.request({ actor: "sophia", purpose: "again" }).ok, true); // frame free again after ACTIVE
});
test("crash after issuance is recovered from the journal; crash after claim before issuance burns the grant (no double mandate)", async () => {
  const w = world(); const L = w.mk(); const r = L.request({ actor: "claude", purpose: "p" }); const pid = PID(); w.publish(r.id, pid); await L.tick();
  w.grants.set("g1", { grantId: "g1", proposalId: pid, actor: "claude", scope: "s", crashAfterIssue: true });
  assert.ok((await L.tick()).changed.some((c) => c.error)); delete w.grants.get("g1").crashAfterIssue;
  await w.mk().tick(); assert.equal(w.mk().status(r.id).state, "ACTIVE"); assert.equal(w.mandates.length, 1);
  const w2 = world(); const L3 = w2.mk(); const r2 = L3.request({ actor: "claude", purpose: "p" }); const p2 = PID(); w2.publish(r2.id, p2); await L3.tick();
  w2.grants.set("g2", { grantId: "g2", proposalId: p2, actor: "claude", scope: "s", crashBeforeIssue: true });
  assert.ok((await L3.tick()).changed.some((c) => c.error)); assert.equal(w2.mk().status(r2.id).state, "CLAIMING");
  fs.writeFileSync(path.join(w2.dir, "tick.lock"), ""); fs.utimesSync(path.join(w2.dir, "tick.lock"), new Date(T - 600_000), new Date(T - 600_000)); // stale lock of a killed process
  await w2.mk().tick(); const st = w2.mk().status(r2.id); assert.equal(st.state, "FAILED"); assert.match(st.history.at(-1), /grant_consumed_without_mandate/); assert.equal(w2.mandates.length, 0);
});
test("wrong actor and expired grant are denied; ambiguity denied; proposal expiry; frame/purpose validation", async () => {
  const w = world(); const L = w.mk(); const r = L.request({ actor: "chatgpt", purpose: "p" }); const pid = PID(); w.publish(r.id, pid); await L.tick();
  w.grants.set("g1", { grantId: "g1", proposalId: pid, actor: "claude", scope: "s" }); await L.tick(); assert.equal(L.status(r.id).state, "DENIED");
  const r2 = L.request({ actor: "sophia", purpose: "p" }); const p2 = PID(); w.publish(r2.id, p2); await L.tick();
  w.grants.set("g2", { grantId: "g2", proposalId: p2, actor: "sophia", scope: "s", expired: true }); await L.tick(); assert.equal(L.status(r2.id).state, "DENIED");
  const r3 = L.request({ actor: "claude", purpose: "p" }); const p3 = PID(); w.publish(r3.id, p3); await L.tick();
  w.grants.set("g3", { grantId: "g3", proposalId: p3, actor: "claude" }); w.grants.set("g4", { grantId: "g4", proposalId: p3, actor: "claude" }); await L.tick(); assert.equal(L.status(r3.id).state, "DENIED");
  const r4 = L.request({ actor: "claude", root: "silicon-dev", purpose: "p" }); w.publish(r4.id, PID()); await L.tick(); T += 86400e3 + 1; await L.tick(); assert.equal(L.status(r4.id).state, "EXPIRED");
  assert.throws(() => L.request({ actor: "mallory", purpose: "p" }), /frame_not_allowed/); assert.throws(() => L.request({ actor: "claude", root: "../etc", purpose: "p" }), /frame_not_allowed/);
  assert.throws(() => L.request({ actor: "claude" }), /purpose_required/); assert.equal(w.mandates.length, 0);
});
test("revocation stops the mandate; journal is append-only and complete", async () => {
  const w = world(); const L = w.mk(); const r = L.request({ actor: "claude", purpose: "p" }); const pid = PID(); w.publish(r.id, pid); await L.tick();
  w.grants.set("g1", { grantId: "g1", proposalId: pid, actor: "claude", scope: "s" }); await L.tick();
  await L.revoke(r.id, "owner_revoked"); assert.equal(L.status(r.id).state, "REVOKED"); assert.equal(w.mandates[0].revoked, true);
  assert.deepEqual(L.journal().filter((e) => e.request === r.id && e.to).map((e) => e.to), ["REQUESTED", "PENDING", "APPROVED", "CLAIMING", "ACTIVE", "REVOKED"]);
});
