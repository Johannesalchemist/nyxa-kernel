#!/usr/bin/env node
"use strict";
/**
 * NYXA Claude MCP Bridge V3 (candidate) -- transport-authenticated actor binding.
 * Baseline: /opt/nyxa-claude-mcp-bridge/bridge.cjs sha256 0492f1e1...57804 (V2).
 * WP-A1-ACTOR-BINDING, 2026-11-26 Europe/Berlin. Owner: Johannes Suess.
 * Generated with Claude Code (cloud session). Status: DRAFT / NOT DEPLOYED.
 *
 * Changes vs V2 (everything else unchanged):
 *  1. BRIDGE_ACTOR_BINDING_FILE pins exactly one actor + allowed Tailscale nodes.
 *  2. Every HTTP request is authenticated by tailscaled LocalAPI whois on the
 *     real TCP peer; unknown/unresolvable peers get 403 (fail closed).
 *  3. A session is bound to the node that initialized it (no session takeover).
 *  4. The backend child receives NYXA_DEVELOPMENT_ACTOR = bound actor, so the
 *     existing V2 server check (authenticated_actor_mismatch) has a trusted source.
 *  5. nyxa_propose_action whose proposal.actor != bound actor is denied at the
 *     bridge before forwarding (defense in depth; backend still re-checks).
 *  6. If authority env (mandate data dir / adapter) is configured, a valid
 *     binding is mandatory, otherwise the process refuses to start.
 * No effect path bypass: tools/list and permitted tools/call go verbatim to the
 * governed backend; this bridge implements no new capabilities.
 */
const { randomUUID } = require("node:crypto");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpExpressApp } = require("@modelcontextprotocol/sdk/server/express.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { loadActorBinding, whois, authorizePeer, localSelfStableId, collectProposals } = require("./tailscaleIdentity.cjs");

const BIND_HOST = process.env.BRIDGE_BIND_HOST || "127.0.0.1";
if (BIND_HOST === "0.0.0.0" || BIND_HOST === "::") {
  throw new Error("BRIDGE_BIND_HOST must not be a wildcard");
}
const PORT = Number(process.env.BRIDGE_PORT || 39281);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("Invalid BRIDGE_PORT");
}
const MCP_RUNTIME_CWD = process.env.BRIDGE_MCP_RUNTIME_CWD || "/opt/nyxa-governed-memory-mcp-runtime";
const MCP_DATA_DIR = process.env.BRIDGE_MCP_DATA_DIR || "/opt/nyxa-governed-memory-mcp-runtime/data-claude-bridge";
const CHILD_AGENT_MODE = process.env.BRIDGE_CHILD_AGENT_MODE || null;
const CHILD_CONNECTOR_CONFIG = process.env.BRIDGE_CHILD_CONNECTOR_CONFIG || null;
const SESSION_IDLE_TIMEOUT_MS = Number(process.env.BRIDGE_SESSION_IDLE_TIMEOUT_MS || 300000);
const IDLE_SWEEP_INTERVAL_MS = Number(process.env.BRIDGE_IDLE_SWEEP_INTERVAL_MS || 60000);
if (!(SESSION_IDLE_TIMEOUT_MS > 0 && IDLE_SWEEP_INTERVAL_MS > 0)) {
  throw new Error("Invalid idle timeout");
}
const AUTHORITY_ENV_PRESENT =
  process.env.NYXA_MANDATE_DATA_DIR === '/opt/nyxa-governed-memory-mcp-runtime/data-authority-v1' ||
  process.env.NYXA_AUTHORITY_ADAPTER_CONFIG === '/opt/nyxa-authority-v1/adapter.json';
const BINDING_FILE = process.env.BRIDGE_ACTOR_BINDING_FILE || null;
// Fail closed at startup: an authority-capable bridge must be actor-bound.
if (AUTHORITY_ENV_PRESENT && !BINDING_FILE) {
  throw new Error("actor_binding_required_for_authority_route");
}
const BINDING = BINDING_FILE ? loadActorBinding(BINDING_FILE) : null;

const sessions = new Map();
let closing = false;
let backendReady = false;

function childEnv() {
  const env = { NYXA_DATA_DIR: MCP_DATA_DIR };
  if (CHILD_AGENT_MODE) env.NYXA_AGENT_MODE = CHILD_AGENT_MODE;
  if (CHILD_CONNECTOR_CONFIG) env.NYXA_CONNECTOR_CONFIG = CHILD_CONNECTOR_CONFIG;
  if (process.env.NYXA_MANDATE_DATA_DIR === '/opt/nyxa-governed-memory-mcp-runtime/data-authority-v1')
    env.NYXA_MANDATE_DATA_DIR = process.env.NYXA_MANDATE_DATA_DIR;
  if (process.env.NYXA_AUTHORITY_ADAPTER_CONFIG === '/opt/nyxa-authority-v1/adapter.json')
    env.NYXA_AUTHORITY_ADAPTER_CONFIG = process.env.NYXA_AUTHORITY_ADAPTER_CONFIG;
  // Process-level authenticated actor: sourced only from the pinned binding.
  if (BINDING) env.NYXA_DEVELOPMENT_ACTOR = BINDING.actor;
  return env;
}
const backendTransport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  cwd: MCP_RUNTIME_CWD,
  env: childEnv(),
});
const backend = new Client(
  { name: "nyxa-claude-bridge-broker", version: "3.0.0-candidate" },
  { capabilities: {} }
);

function audit(event, fields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, actor: BINDING ? BINDING.actor : null, ...fields }));
}

/** Transport authentication: returns verified node id, or null when unbound legacy mode. */
async function authenticate(req) {
  if (!BINDING) return { nodeStableId: null };
  const peer = await whois(BINDING.localApiSocket, req.socket.remoteAddress, req.socket.remotePort);
  const node = authorizePeer(BINDING, peer);
  if (!node) {
    audit("transport_identity_denied", { peer: peer ? peer.nodeStableId : "unresolved" });
    return null;
  }
  return { nodeStableId: node };
}
function denyIdentity(res, code) {
  res.status(403).json({ jsonrpc: "2.0", error: { code: -32003, message: code }, id: null });
}

function sessionEntry(sid) {
  const s = sessions.get(sid);
  if (s) s.lastActivityAt = Date.now();
  return s;
}
async function cleanupSession(sid, reason) {
  const entry = sessions.get(sid);
  if (!entry || entry.cleanedUp) return;
  entry.cleanedUp = true;
  sessions.delete(sid);
  try { await entry.front.close(); } catch (_) { /* already closed */ }
  try { await entry.transport.close(); } catch (_) { /* already closed */ }
  console.log("bridge_session_cleaned_up", sid, reason);
}
async function closeAll(reason) {
  await Promise.all([...sessions.keys()].map((sid) => cleanupSession(sid, reason)));
}

// Review fix R2: every proposal reachable in the arguments (direct, toolbox-wrapped or
// otherwise nested) must name the bound actor; nyxa_propose_action must carry one.
function proposalActorMismatch(params) {
  if (!BINDING || !params) return false;
  const found = collectProposals(params.arguments);
  if (params.name === "nyxa_propose_action" && found.length === 0) return true;
  return found.some((p) => !p || typeof p !== "object" || Array.isArray(p) || p.actor !== BINDING.actor);
}

async function createSession(nodeStableId) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, {
        front, transport, lastActivityAt: Date.now(), cleanedUp: false, nodeStableId
      });
      console.log("bridge_session_initialized", sid);
      audit("session_bound", { session: sid, node: nodeStableId });
    },
    onsessionclosed: (sid) => {
      cleanupSession(sid, "client_closed").catch((err) =>
        console.error("bridge_session_close_failed", err && err.message)
      );
    },
  });
  const front = new Server(
    { name: "nyxa-governed-memory-mcp", version: "0.1.1" },
    {
      capabilities: { tools: {} },
      instructions:
        "NYXA is deny-by-default. Only the governed underlying MCP tools execute. " +
        "Server route preflight never grants execution authority. " +
        "Do not bypass the existing NYXA capability gate or human authority.",
    }
  );
  front.setRequestHandler(ListToolsRequestSchema, async (req) => {
    if (!backendReady) throw new Error("governed_backend_unavailable");
    const params = req.params && req.params.cursor ? { cursor: req.params.cursor } : undefined;
    return await backend.listTools(params);
  });
  front.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (!backendReady) throw new Error("governed_backend_unavailable");
    if (proposalActorMismatch(req.params)) {
      audit("proposal_actor_denied", { node: nodeStableId, tool: req.params.name });
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({
          policy_decision: "DENY", domain: "TRANSPORT_IDENTITY", reason: "authenticated_actor_mismatch" }) }],
      };
    }
    return await backend.callTool(req.params);
  });
  await front.connect(transport);
  return { front, transport };
}

const app = BIND_HOST === "127.0.0.1"
  ? createMcpExpressApp()
  : createMcpExpressApp({ host: BIND_HOST, allowedHosts: [BIND_HOST] });

app.post("/mcp", async (req, res) => {
  const ident = await authenticate(req);
  if (!ident) return denyIdentity(res, "transport_identity_denied");
  if (!backendReady) {
    res.set("Retry-After", "5").status(503).json({
      jsonrpc: "2.0", error: { code: -32000, message: "Backend unavailable" }, id: null
    });
    return;
  }
  const sid = req.headers["mcp-session-id"];
  const existing = sid ? sessionEntry(sid) : null;
  if (sid && !existing) {
    res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null });
    return;
  }
  if (existing && existing.nodeStableId !== ident.nodeStableId) {
    audit("session_peer_mismatch", { session: sid, node: ident.nodeStableId });
    return denyIdentity(res, "session_peer_mismatch");
  }
  if (!sid && (req.body?.method !== "initialize" || req.body?.jsonrpc !== "2.0")) {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Initialize first" }, id: null });
    return;
  }
  let session = existing;
  try {
    if (!session) session = await createSession(ident.nodeStableId);
    await session.transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("bridge_http_handler_error", err && err.message);
    if (!res.headersSent) res.status(500).json({
      jsonrpc: "2.0", error: { code: -32603, message: "Bridge error" }, id: null
    });
    if (!sid && !session?.transport?.sessionId && session) {
      try { await session.front.close(); } catch (_) { /* noop */ }
    }
  }
});
async function sessionScoped(req, res, missingStatus, label) {
  const ident = await authenticate(req);
  if (!ident) return denyIdentity(res, "transport_identity_denied");
  const sid = req.headers["mcp-session-id"];
  const s = sid ? sessionEntry(sid) : null;
  if (!s) {
    res.status(missingStatus).json({ jsonrpc: "2.0", error: { code: missingStatus === 404 ? -32001 : -32000,
      message: missingStatus === 404 ? "Session not found" : "No valid session" }, id: null });
    return;
  }
  if (s.nodeStableId !== ident.nodeStableId) return denyIdentity(res, "session_peer_mismatch");
  try { await s.transport.handleRequest(req, res); }
  catch (e) {
    console.error(label, e && e.message);
    if (!res.headersSent) res.status(500).end();
  }
}
app.get("/mcp", (req, res) => sessionScoped(req, res, 400, "bridge_get_error"));
app.delete("/mcp", (req, res) => sessionScoped(req, res, 404, "bridge_delete_error"));

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) {
      cleanupSession(sid, "idle_timeout").catch(() => {});
    }
  }
}, IDLE_SWEEP_INTERVAL_MS);
sweepTimer.unref();

async function shutdown(reason, code) {
  if (closing) return;
  closing = true;
  clearInterval(sweepTimer);
  backendReady = false;
  console.log("bridge_shutdown", reason);
  await closeAll(reason);
  try { await backend.close(); } catch (_) { /* noop */ }
  process.exit(code);
}
async function main() {
  backend.onerror = (err) => console.error("bridge_backend_error", err && err.message);
  backend.onclose = () => {
    if (!closing) {
      console.error("bridge_backend_disconnected");
      shutdown("backend_disconnected", 1).catch(() => process.exit(1));
    }
  };
  if (BINDING) {
    // Review fix R1: refuse to start if the bridge host itself is an allowed peer, or if
    // the host identity cannot be established (fail closed before the backend starts).
    const self = await localSelfStableId(BINDING.localApiSocket);
    if (!self) throw new Error("actor_binding_invalid:self_identity_unavailable");
    if (BINDING.allowedPeers.some((p) => p.nodeStableId === self))
      throw new Error("actor_binding_invalid:self_node_not_allowed");
  }
  await backend.connect(backendTransport);
  const discovered = await backend.listTools();
  if (!discovered || !Array.isArray(discovered.tools)) throw new Error("backend_tools_list_invalid");
  backendReady = true;
  app.listen(PORT, BIND_HOST, () => {
    console.log("nyxa_claude_mcp_broker_ready", BIND_HOST, PORT, "tools", discovered.tools.length,
      "actor", BINDING ? BINDING.actor : "UNBOUND");
  });
}
process.on("SIGTERM", () => { shutdown("SIGTERM", 0).catch(() => process.exit(1)); });
process.on("SIGINT", () => { shutdown("SIGINT", 0).catch(() => process.exit(1)); });
main().catch((err) => {
  console.error("bridge_backend_startup_failed", err && err.message);
  shutdown("startup_failed", 1).catch(() => process.exit(1));
});
