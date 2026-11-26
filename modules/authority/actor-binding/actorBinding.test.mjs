// WP-A1-ACTOR-BINDING isolated tests. Mock tailscaled LocalAPI + stub backend.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, "bridge-actor-bound.cjs");
const STUB = path.join(HERE, "stub");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nyxa-ab-"));
const SOCK = path.join(tmp, "ts.sock");
let whoisAnswer = "PEER_A"; // stable id the mock reports for any address, or null
let whoisDown = false;
let selfId = "SELFNODE01"; // StableID the mock reports for the bridge host itself, or null
const lapi = http.createServer((req, res) => {
  if (whoisDown) { req.socket.destroy(); return; }
  if (req.url.startsWith("/localapi/v0/status")) {
    if (selfId === null) { res.writeHead(503); return res.end(); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ Self: { ID: selfId } }));
  }
  if (!req.url.startsWith("/localapi/v0/whois?addr=") || whoisAnswer === null) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ Node: { StableID: whoisAnswer }, UserProfile: { LoginName: "owner@example.test" } }));
});
await new Promise((r) => lapi.listen(SOCK, r));
after(() => { lapi.closeAllConnections(); lapi.close(); });

function writeBinding(name, obj, mode = 0o600) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj));
  fs.chmodSync(p, mode);
  return p;
}
const good = { version: 1, actor: "claude", localApiSocket: SOCK,
  allowedPeers: [{ nodeStableId: "PEERAAAA1" }, { nodeStableId: "PEERBBBB2" }] };

let portSeq = 39400 + Math.floor(Math.random() * 400);
function startBridge(env) {
  const port = portSeq++;
  const child = spawn(process.execPath, [BRIDGE], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, BRIDGE_PORT: String(port),
      BRIDGE_BIND_HOST: "127.0.0.1", BRIDGE_MCP_RUNTIME_CWD: STUB, BRIDGE_MCP_DATA_DIR: tmp, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  const ready = new Promise((resolve) => {
    const iv = setInterval(() => { if (out.includes("broker_ready")) { clearInterval(iv); resolve(true); } }, 25);
    child.on("exit", (code) => { clearInterval(iv); resolve(code); });
  });
  return { child, port, ready, log: () => out };
}

async function rpc(port, body, sid) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (sid) headers["mcp-session-id"] = sid;
  const r = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  try { json = JSON.parse(line ? line.slice(6) : text); } catch { /* non-json */ }
  return { status: r.status, sid: r.headers.get("mcp-session-id"), json };
}
const init = { jsonrpc: "2.0", id: 1, method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };
async function open(port) {
  const r = await rpc(port, init);
  assert.equal(r.status, 200);
  await rpc(port, { jsonrpc: "2.0", method: "notifications/initialized" }, r.sid);
  return r.sid;
}
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const payload = (r) => JSON.parse(r.json.result.content[0].text);

test("startup fails closed: authority env without binding", async () => {
  const b = startBridge({ NYXA_MANDATE_DATA_DIR: "/opt/nyxa-governed-memory-mcp-runtime/data-authority-v1" });
  assert.notEqual(await b.ready, true);
  assert.match(b.log(), /actor_binding_required_for_authority_route/);
});

for (const [name, obj, mode, code] of [
  ["extra-key", { ...good, extra: 1 }, 0o600, "shape"],
  ["bad-actor", { ...good, actor: "root" }, 0o600, "actor"],
  ["world-writable", good, 0o666, "group_or_world_writable"],
  ["no-peers", { ...good, allowedPeers: [] }, 0o600, "peers"],
  ["bad-json", "{", 0o600, "json"],
]) {
  test(`startup fails closed: invalid binding ${name}`, async () => {
    const b = startBridge({ BRIDGE_ACTOR_BINDING_FILE: writeBinding(name + ".json", obj, mode) });
    assert.notEqual(await b.ready, true);
    assert.match(b.log(), new RegExp("actor_binding_invalid:" + code));
  });
}

test("startup fails closed: symlinked binding", async () => {
  const real = writeBinding("real.json", good);
  const link = path.join(tmp, "link.json");
  fs.symlinkSync(real, link);
  const b = startBridge({ BRIDGE_ACTOR_BINDING_FILE: link });
  assert.notEqual(await b.ready, true);
  assert.match(b.log(), /not_regular_file/);
});

test("review R1: bridge host itself in allowedPeers refuses start (device != agent)", async () => {
  selfId = "PEERAAAA1";
  const b = startBridge({ BRIDGE_ACTOR_BINDING_FILE: writeBinding("self.json", good) });
  assert.notEqual(await b.ready, true);
  assert.match(b.log(), /self_node_not_allowed/);
  selfId = "SELFNODE01";
});

test("review R1: unknown host identity refuses start (fail closed)", async () => {
  selfId = null;
  const b = startBridge({ BRIDGE_ACTOR_BINDING_FILE: writeBinding("noself.json", good) });
  assert.notEqual(await b.ready, true);
  assert.match(b.log(), /self_identity_unavailable/);
  selfId = "SELFNODE01";
});

test("bound bridge: identity, actor propagation, proposal mismatch, session takeover, LocalAPI outage", async (t) => {
  const b = startBridge({ BRIDGE_ACTOR_BINDING_FILE: writeBinding("good.json", good),
    NYXA_MANDATE_DATA_DIR: "/opt/nyxa-governed-memory-mcp-runtime/data-authority-v1" });
  t.after(() => b.child.kill("SIGTERM"));
  assert.equal(await b.ready, true, b.log());

  whoisAnswer = "UNKNOWNNODE9";
  assert.equal((await rpc(b.port, init)).status, 403, "unknown tailnet node denied");
  whoisAnswer = null;
  assert.equal((await rpc(b.port, init)).status, 403, "unresolvable peer denied");

  whoisAnswer = "PEERAAAA1";
  const sid = await open(b.port);
  const who = payload(await rpc(b.port, call(2, "stub_whoami", {}), sid));
  assert.equal(who.backend_actor, "claude", "backend env carries bound actor");

  const deny = await rpc(b.port, call(3, "nyxa_propose_action", { proposal: { actor: "chatgpt", action: "nyxa_apply_patch" } }), sid);
  const d = payload(deny);
  assert.equal(deny.json.result.isError, true);
  assert.deepEqual([d.policy_decision, d.domain, d.reason], ["DENY", "TRANSPORT_IDENTITY", "authenticated_actor_mismatch"]);
  assert.equal(d.forwarded, undefined, "mismatched proposal never forwarded");

  const missing = payload(await rpc(b.port, call(4, "nyxa_propose_action", {}), sid));
  assert.equal(missing.policy_decision, "DENY", "missing proposal denied");

  const ok = payload(await rpc(b.port, call(5, "nyxa_propose_action", { proposal: { actor: "claude", action: "x" } }), sid));
  assert.deepEqual([ok.forwarded, ok.proposal_actor, ok.backend_actor], [true, "claude", "claude"]);

  // Review R2: alternative governed paths carrying a proposal (toolbox wrapper, nesting, arrays).
  for (const [i, args] of [
    { name: "nyxa.dev.run_test", input: { proposal: { actor: "chatgpt", action: "nyxa_run_test" } } },
    { batch: [{ deep: { proposal: { actor: "sophia" } } }] },
    { input: { proposal: null } },
    { input: { proposal: [{ actor: "claude" }] } },
  ].entries()) {
    const r = payload(await rpc(b.port, call(20 + i, "toolbox_execute", args), sid));
    assert.equal(r.domain, "TRANSPORT_IDENTITY", "nested/alternative proposal path denied #" + i);
    assert.equal(r.forwarded, undefined);
  }
  const tb = payload(await rpc(b.port, call(30, "toolbox_execute", { name: "nyxa.dev.run_test", input: { proposal: { actor: "claude" } } }), sid));
  assert.equal(tb.forwarded, true, "matching toolbox proposal forwarded");
  const plain = payload(await rpc(b.port, call(31, "toolbox_list", {}), sid));
  assert.equal(plain.forwarded, true, "calls without proposals unaffected");

  whoisAnswer = "PEERBBBB2"; // also allowed, but did not open this session
  assert.equal((await rpc(b.port, call(6, "stub_whoami", {}), sid)).status, 403, "session takeover by other node denied");
  const r = await fetch(`http://127.0.0.1:${b.port}/mcp`, { method: "DELETE", headers: { "mcp-session-id": sid } });
  assert.equal(r.status, 403, "foreign node cannot delete session");

  whoisAnswer = "PEERAAAA1";
  whoisDown = true;
  assert.equal((await rpc(b.port, call(7, "stub_whoami", {}), sid)).status, 403, "LocalAPI outage fails closed");
  whoisDown = false;
  assert.equal((await rpc(b.port, call(8, "stub_whoami", {}), sid)).status, 200, "recovers after outage");
  assert.match(b.log(), /"event":"proposal_actor_denied"/);
  assert.match(b.log(), /"event":"session_peer_mismatch"/);
});

test("unbound legacy mode unchanged without authority env (regression)", async (t) => {
  const b = startBridge({});
  t.after(() => b.child.kill("SIGTERM"));
  assert.equal(await b.ready, true, b.log());
  whoisAnswer = null;
  const sid = await open(b.port);
  const who = payload(await rpc(b.port, call(2, "stub_whoami", {}), sid));
  assert.equal(who.backend_actor, null, "no actor without binding -> backend V2 frame mandates stay unusable");
});
