"use strict";
/**
 * NYXA transport actor binding (WP-A1-ACTOR-BINDING), 2026-11-26 Europe/Berlin.
 * Owner: Johannes Suess. Generated with Claude Code (cloud session).
 * Status: DRAFT / TESTED-IN-ISOLATION / NOT DEPLOYED.
 *
 * Resolves the authenticated Tailscale peer of a TCP connection through the
 * local tailscaled LocalAPI (WireGuard-authenticated node identity), and loads
 * a pinned, operator-owned actor binding. No proposal field can influence it.
 */
const fs = require("node:fs");
const http = require("node:http");

const BINDING_KEYS = ["version", "actor", "allowedPeers", "localApiSocket"];
const PEER_KEYS_REQUIRED = ["nodeStableId"];
const PEER_KEYS_ALLOWED = ["nodeStableId", "loginName"];
const ACTORS = new Set(["claude", "chatgpt", "sophia"]);
const STABLE_ID = /^[A-Za-z0-9]{8,64}$/;
const LOGIN = /^[A-Za-z0-9._%+@-]{3,254}$/;

class BindingError extends Error {
  constructor(code) { super("actor_binding_invalid:" + code); this.code = code; }
}

function exactKeys(obj, required, allowed) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  return required.every((k) => keys.includes(k)) && keys.every((k) => allowed.includes(k));
}

/** Load and validate the binding file; any deviation throws (fail closed). */
function loadActorBinding(path) {
  if (typeof path !== "string" || !path.startsWith("/")) throw new BindingError("path_not_absolute");
  const st = fs.lstatSync(path);
  if (st.isSymbolicLink() || !st.isFile()) throw new BindingError("not_regular_file");
  if (st.mode & 0o022) throw new BindingError("group_or_world_writable");
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(path, "utf8")); } catch { throw new BindingError("json"); }
  if (!exactKeys(cfg, BINDING_KEYS, BINDING_KEYS)) throw new BindingError("shape");
  if (cfg.version !== 1) throw new BindingError("version");
  if (!ACTORS.has(cfg.actor)) throw new BindingError("actor");
  if (typeof cfg.localApiSocket !== "string" || !cfg.localApiSocket.startsWith("/")) throw new BindingError("socket");
  if (!Array.isArray(cfg.allowedPeers) || cfg.allowedPeers.length < 1 || cfg.allowedPeers.length > 16)
    throw new BindingError("peers");
  const seen = new Set();
  for (const p of cfg.allowedPeers) {
    if (!exactKeys(p, PEER_KEYS_REQUIRED, PEER_KEYS_ALLOWED)) throw new BindingError("peer_shape");
    if (typeof p.nodeStableId !== "string" || !STABLE_ID.test(p.nodeStableId)) throw new BindingError("peer_stable_id");
    if (p.loginName !== undefined && (typeof p.loginName !== "string" || !LOGIN.test(p.loginName)))
      throw new BindingError("peer_login");
    if (seen.has(p.nodeStableId)) throw new BindingError("peer_duplicate");
    seen.add(p.nodeStableId);
  }
  return Object.freeze({
    actor: cfg.actor,
    localApiSocket: cfg.localApiSocket,
    allowedPeers: Object.freeze(cfg.allowedPeers.map((p) => Object.freeze({ ...p }))),
  });
}

function normalizeAddr(address, port) {
  if (typeof address !== "string" || !Number.isInteger(port)) return null;
  const a = address.startsWith("::ffff:") ? address.slice(7) : address;
  return a.includes(":") ? `[${a}]:${port}` : `${a}:${port}`;
}

/** Query tailscaled LocalAPI whois. Resolves {nodeStableId, loginName} or null (fail closed). */
function whois(socketPath, address, port, timeoutMs = 2000) {
  const addr = normalizeAddr(address, port);
  if (!addr) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = http.request({
      socketPath,
      method: "GET",
      path: "/localapi/v0/whois?addr=" + encodeURIComponent(addr),
      headers: { Host: "local-tailscaled.sock" },
      timeout: timeoutMs,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { if (body.length < 262144) body += c; });
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve(null);
        try {
          const j = JSON.parse(body);
          const id = j && j.Node && j.Node.StableID;
          if (typeof id !== "string" || !STABLE_ID.test(id)) return resolve(null);
          const login = j.UserProfile && typeof j.UserProfile.LoginName === "string" ? j.UserProfile.LoginName : null;
          resolve({ nodeStableId: id, loginName: login });
        } catch { resolve(null); }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

/**
 * Review fix R1 (device != agent): StableID of the node running this bridge.
 * Every local process on that host would authenticate as this node, so callers
 * must refuse a binding that allows it. Resolves null when LocalAPI is unusable.
 */
function localSelfStableId(socketPath, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.request({
      socketPath, method: "GET", path: "/localapi/v0/status?peers=false",
      headers: { Host: "local-tailscaled.sock" }, timeout: timeoutMs,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { if (body.length < 1048576) body += c; });
      res.on("end", () => {
        if (res.statusCode !== 200) return resolve(null);
        try {
          const id = JSON.parse(body)?.Self?.ID;
          resolve(typeof id === "string" && STABLE_ID.test(id) ? id : null);
        } catch { resolve(null); }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

/** Review fix R2: collect every `proposal` object nested in tool arguments (bounded depth). */
function collectProposals(value, depth = 0, out = []) {
  if (depth > 6 || !value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value)) {
    if (k === "proposal") out.push(v);
    collectProposals(v, depth + 1, out);
  }
  return out;
}

/** Authorize a resolved peer against the binding. Returns the peer node id or null. */
function authorizePeer(binding, peer) {
  if (!peer) return null;
  const hit = binding.allowedPeers.find((p) => p.nodeStableId === peer.nodeStableId &&
    (p.loginName === undefined || p.loginName === peer.loginName));
  return hit ? hit.nodeStableId : null;
}

module.exports = { loadActorBinding, whois, authorizePeer, normalizeAddr, localSelfStableId, collectProposals, BindingError };
