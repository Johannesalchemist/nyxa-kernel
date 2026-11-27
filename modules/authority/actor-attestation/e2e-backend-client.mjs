// WP1/R3 real-backend E2E client: talks to the patched governed backend DIRECTLY over stdio
// (no bridge = "direct backend access"). Isolated temp runtime, temp data dir, no production data.
// Args: <runtimeDir> <passportPrivPem> <otherPrivPem> <phase> [agentMode]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createPrivateKey } from "node:crypto";
import fs from "node:fs";
import { signActorAttestation, toolSubject } from "./authority/actorAttestation.mjs";

const [rt, privFile, otherFile, phase, agentMode] = process.argv.slice(2);
const AUD = "nyxa-governed-backend:server-b-e2e";
const priv = createPrivateKey(fs.readFileSync(privFile)), other = createPrivateKey(fs.readFileSync(otherFile));
const env = { NYXA_DATA_DIR: rt + "/data", PATH: process.env.PATH, HOME: process.env.HOME };
if (agentMode) env.NYXA_AGENT_MODE = agentMode;
if (phase !== "off" && phase !== "probe") Object.assign(env, { NYXA_ACTOR_ATTESTATION_MODE: "required",
  NYXA_AGENT_PASSPORTS: rt + "/reg/passports.json", NYXA_ATTESTATION_NONCE_DIR: rt + "/nonces",
  NYXA_DEVELOPMENT_ACTOR: "claude", NYXA_PASSPORTS_OWNER_UID: String(process.getuid()) });
const client = new Client({ name: "wp1-e2e", version: "0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], cwd: rt, env }));
const now = () => Math.floor(Date.now() / 1000);
const claim = { tag: "FACT", statement: "WP1 R3 E2E in an isolated temp runtime", source: "nyxa-kernel modules/authority/actor-attestation" };
const P = (o = {}) => ({ actor: "claude", action: "nyxa_apply_patch", target: "governed-dev:/authority-v1/e2e.txt",
  scope: "governed-dev:/authority-v1/", claims: [claim], uncertainty: 0.1,
  requestedCapabilityClass: "I2", estimatedIrreversibility: "I2",
  provenance: { taskId: "wp1-e2e", runId: "r3", requestingIdentity: "claude" }, payload: { patch: "noop" }, ...o });
const att = (subject, key = priv, o = {}) => signActorAttestation({ subject, keyId: "claude-e2e", actor: "claude", privateKey: key, audience: AUD, nowSeconds: now(), ...o });
const call = async (name, args) => {
  try { const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text ?? "";
    try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200), isError: r.isError }; } }
  catch (e) { return { thrown: String(e.message).slice(0, 200) }; }
};
const brief = (r) => JSON.stringify({ d: r.policy_decision ?? r.error?.code ?? r.thrown ?? r.raw, domain: r.domain, reason: r.reason ?? r.error?.code ?? r.error?.message ?? (typeof r.error === "string" ? r.error : undefined), keys: Object.keys(r).slice(0, 6).join("|") });
const show = (label, r) => console.log(label.padEnd(46), brief(r));
const ok = (cond, label) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) process.exitCode = 1; };

if (phase === "probe") {
  // Which agent mode lets the direct tool reach its own handler? (no attestation configured)
  const r = await call("nyxa_apply_patch", { path: "/nonexistent/wp1-e2e.txt", patch: "noop" });
  console.log("PROBE", agentMode, brief(r));
} else if (phase === "case9") {
  const r = await call("nyxa_apply_patch", { path: "/nonexistent/wp1-e2e.txt", patch: "noop" }); show("9 direct nyxa_apply_patch (mode " + agentMode + ")", r);
  ok(JSON.stringify(r).includes("development_mandate_proposal_required"), "case 9: new attestation-mode block reached and denies the direct effect tool");
} else if (phase === "required") {
  const p = P(); const a = att(p);
  let r = await call("nyxa_propose_action", { proposal: p }); show("1 proposal without attestation", r);
  ok(r.domain === "ATTESTATION" && r.reason === "attestation_required", "direct backend: no attestation -> deny");
  r = await call("nyxa_propose_action", { proposal: p, attestation: a }); show("2 valid attestation, no mandate", r);
  ok(r.domain !== "ATTESTATION" && r.policy_decision !== "ALLOW", "identity != authority: valid attestation still needs a mandate");
  r = await call("nyxa_propose_action", { proposal: p, attestation: a }); show("3 replay", r); ok(r.reason === "replay", "replay denied");
  // Positive ALLOW control: an action the existing layers permit, with a real effect in the isolated store.
  for (const cand of [
    { action: "nyxa_memory_store_candidate", target: "memory:/candidate", scope: "memory:/", requestedCapabilityClass: "I1", estimatedIrreversibility: "I1",
      payload: { content: "WP1 R3 positive control: attested candidate in isolated store", candidate_type: "observation", source: "agent", scope: "project", purpose: "positive ALLOW control for agent attestation", confidence: 0.9, importance: 0.2 } },
    { action: "nyxa_memory_store_candidate", target: "memory:/candidates", scope: "memory:/", requestedCapabilityClass: "I1", estimatedIrreversibility: "I1",
      payload: { candidate_type: "experience", content: "WP1 R3 positive control", summary: "positive control" } },
    { action: "nyxa_memory_store_candidate", target: "memory-candidates:/", scope: "memory-candidates:/", requestedCapabilityClass: "I1", estimatedIrreversibility: "I1",
      payload: { candidate_type: "experience", content: "WP1 R3 positive control" } },
  ]) {
    const q = P(cand); r = await call("nyxa_propose_action", { proposal: q, attestation: att(q) }); show("4 ALLOW control " + cand.target, r);
    if (r.policy_decision === "ALLOW" || r.policy_decision === "ALLOWED") break;
  }
  ok(r.policy_decision === "ALLOW" || r.policy_decision === "ALLOWED", "positive control: attested, permitted action is ALLOWED end to end");
  const derive = { parent_mandate_id: "nonexistent-parent", actor: "claude", action: "nyxa_apply_patch", scope_prefix: "governed-dev:/authority-v1/",
    target_prefix: "governed-dev:/authority-v1/", ttl_seconds: 3600, max_executions_per_window: 5, max_effect_units_per_window: 5 };
  r = await call("nyxa_mandate_derive", derive); show("5 mandate_derive without attestation", r);
  ok(r.domain === "ATTESTATION" && r.reason === "attestation_required", "direct write tool without attestation denied");
  r = await call("nyxa_mandate_derive", { ...derive, attestation: att(toolSubject("nyxa_mandate_derive", { ...derive, ttl_seconds: 600 })) }); show("6 mandate_derive tampered args", r);
  ok(r.reason === "proposal_digest_mismatch", "tampered tool arguments denied");
  r = await call("nyxa_mandate_derive", { ...derive, attestation: att(toolSubject("nyxa_mandate_derive", derive)) }); show("7 mandate_derive valid att., no parent", r);
  ok(r.domain !== "ATTESTATION" && !String(r.policy_decision ?? "").startsWith("ALLOW"), "identity != authority: attested derive still needs a valid parent mandate");
  const wide = { ...derive, scope_prefix: "governed-dev:/" };
  r = await call("nyxa_mandate_derive", { ...wide, attestation: att(toolSubject("nyxa_mandate_derive", wide)) }); show("8 mandate_derive scope escalation", r);
  ok(r.reason === "scope_escalation", "derive outside passport scope denied");
  const rev = { token: "not-a-human-token", mandate_id: "m-x", reason: "e2e" };
  r = await call("nyxa_mandate_revoke", { ...rev, attestation: att(toolSubject("nyxa_mandate_revoke", rev)) }); show("10 mandate_revoke valid att., bad token", r);
  ok(r.domain !== "ATTESTATION", "identity != authority: revoke still requires the Human Gate token");
  const gi = { token: "x", capability: "nyxa_memory_promote_candidate", target_id: "c1", ttl_seconds: 60 };
  r = await call("nyxa_human_grant_issue", { ...gi, attestation: att(toolSubject("nyxa_human_grant_issue", gi)) }); show("11 human_grant_issue, tool not in passport", r);
  ok(r.reason === "action_not_in_passport", "agent key cannot speak for human grant issuance");
  fs.writeFileSync(rt + "/replay.json", JSON.stringify({ p, a }));
} else if (phase === "restart") {
  const { p, a } = JSON.parse(fs.readFileSync(rt + "/replay.json", "utf8"));
  const r = await call("nyxa_propose_action", { proposal: p, attestation: a }); show("12 replay after backend restart", r);
  ok(r.reason === "replay", "replay denied after restart (durable ledger)");
} else if (phase === "off") {
  const r = await call("nyxa_propose_action", { proposal: P() }); show("13 mode off (regression)", r);
  ok(r.domain !== "ATTESTATION", "attestation mode off leaves existing behaviour unchanged");
}
await client.close();
