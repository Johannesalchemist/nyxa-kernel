// WP1 real-backend E2E client: talks to the patched governed backend DIRECTLY over stdio
// (no bridge = "direct backend access"). Args: <runtimeDir> <passportPrivPem> <otherPrivPem> <phase>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createPrivateKey } from "node:crypto";
import fs from "node:fs";
import { signActorAttestation } from "./authority/actorAttestation.mjs";

const [rt, privFile, otherFile, phase] = process.argv.slice(2);
const AUD = "nyxa-governed-backend:server-b-e2e";
const priv = createPrivateKey(fs.readFileSync(privFile)), other = createPrivateKey(fs.readFileSync(otherFile));
const env = { NYXA_DATA_DIR: rt + "/data", PATH: process.env.PATH, HOME: process.env.HOME };
if (phase !== "off") Object.assign(env, { NYXA_ACTOR_ATTESTATION_MODE: "required", NYXA_AGENT_PASSPORTS: rt + "/passports.json",
  NYXA_ATTESTATION_NONCE_DIR: rt + "/nonces", NYXA_DEVELOPMENT_ACTOR: "claude" });
const client = new Client({ name: "wp1-e2e", version: "0" }, { capabilities: {} });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], cwd: rt, env }));
const now = () => Math.floor(Date.now() / 1000);
const P = (o = {}) => ({ actor: "claude", action: "nyxa_apply_patch", target: "governed-dev:/authority-v1/e2e.txt",
  scope: "governed-dev:/authority-v1/", claims: [{ claim: "e2e", source: "wp1" }], uncertainty: 0.1,
  requestedCapabilityClass: "I2", estimatedIrreversibility: "I2",
  provenance: { taskId: "wp1-e2e", runId: "r", requestingIdentity: "claude" }, payload: { patch: "noop" }, ...o });
const att = (p, key = priv, o = {}) => signActorAttestation({ proposal: p, keyId: "claude-e2e", actor: "claude", privateKey: key, audience: AUD, nowSeconds: now(), ...o });
const call = async (name, args) => {
  try { const r = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text ?? "";
    try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200), isError: r.isError }; } }
  catch (e) { return { thrown: String(e.message).slice(0, 200) }; }
};
const show = (label, r) => console.log(label.padEnd(44), JSON.stringify({ d: r.policy_decision ?? r.error?.code ?? r.thrown ?? r.raw, domain: r.domain, reason: r.reason ?? r.error?.code }));
const ok = (cond, label) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) process.exitCode = 1; };

if (phase === "required") {
  const tools = (await client.listTools()).tools;
  console.log("write-capable tools (readOnlyHint!=true):", tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name).join(","));
  const p = P(); const a = att(p);
  let r = await call("nyxa_propose_action", { proposal: p }); show("1 no attestation", r);
  ok(r.domain === "ATTESTATION" && r.reason === "attestation_required", "direct backend: proposal without attestation denied");
  r = await call("nyxa_propose_action", { proposal: p, attestation: a }); show("2 valid attestation", r);
  ok(r.domain !== "ATTESTATION", "valid attestation passes the gate (downstream gamma/mandate decide)");
  fs.writeFileSync(rt + "/replay.json", JSON.stringify({ p, a }));
  r = await call("nyxa_propose_action", { proposal: p, attestation: a }); show("3 replay", r);
  ok(r.reason === "replay", "replay denied");
  const sub = P({ actor: "chatgpt" }); r = await call("nyxa_propose_action", { proposal: sub, attestation: att(sub) }); show("4 actor substitution", r);
  ok(r.reason === "actor_substitution", "actor substitution denied");
  const esc = P({ scope: "silicon-dev:/", target: "silicon-dev:/x" }); r = await call("nyxa_propose_action", { proposal: esc, attestation: att(esc) }); show("5 scope escalation", r);
  ok(r.reason === "scope_escalation", "scope escalation denied");
  const tam = P(); const ta = att(tam); r = await call("nyxa_propose_action", { proposal: { ...tam, scope: "governed-dev:/" }, attestation: ta }); show("6 tamper after signing", r);
  ok(r.reason === "proposal_digest_mismatch" || r.reason === "scope_escalation", "tampered proposal denied");
  const fg = P(); r = await call("nyxa_propose_action", { proposal: fg, attestation: att(fg, other) }); show("7 forged signature", r);
  ok(r.reason === "signature_invalid", "forged signature denied");
  const rt1 = P({ action: "nyxa_run_test", target: "governed-dev:/authority-v1/", payload: undefined });
  delete rt1.payload;
  for (const tn of ["toolbox.execute", "toolbox_execute"]) {
    r = await call(tn, { name: "nyxa.dev.run_test", input: { proposal: rt1 } }); show("8 toolbox no attestation (" + tn + ")", r);
    if (!String(r.thrown ?? "").includes("not found") && !String(r.thrown ?? "").includes("Unknown")) {
      ok(r.domain === "ATTESTATION" && r.reason === "attestation_required", "toolbox effect path without attestation denied"); break; }
  }
  r = await call("nyxa_apply_patch", { path: "/tmp/x", patch: "noop" }); show("9 direct nyxa_apply_patch", r);
  // Either the existing mode floor (draft: mode_below_minimum) or the attestation-mode block denies;
  // the label states which layer actually denied so evidence is not over-claimed.
  const layer = JSON.stringify(r).includes("development_mandate_proposal_required") ? "attestation-mode block" : (r.reason ?? "unknown");
  ok(r.policy_decision === "DENIED" || r.policy_decision === "DENY", "direct effect tool bypass denied (layer: " + layer + ")");
} else if (phase === "restart") {
  const { p, a } = JSON.parse(fs.readFileSync(rt + "/replay.json", "utf8"));
  const r = await call("nyxa_propose_action", { proposal: p, attestation: a }); show("10 replay after backend restart", r);
  ok(r.reason === "replay", "replay denied after restart (durable ledger)");
} else if (phase === "off") {
  const r = await call("nyxa_propose_action", { proposal: P() }); show("11 mode off (regression)", r);
  ok(r.domain !== "ATTESTATION", "attestation mode off leaves existing behaviour unchanged");
}
await client.close();
