// Transport-Adapter.
//
// Korrektur gegenüber v1 (Rework-Auftrag §4, T01/T04/T05): die HTTP-Variante bildet jetzt den
// Streamable-HTTP-MCP-Vertrag nach, nicht mehr nur rohes JSON-RPC-over-POST:
//   - initialize() liefert die Session-ID über den `mcp-session-id`-Response-Header, nicht aus dem JSON-Body.
//   - Nach initialize() wird die Pflicht-Notification `notifications/initialized` gesendet (kein `id`, keine
//     Antwort erwartet), bevor weitere Aufrufe erfolgen.
//   - Jeder Folgeaufruf trägt den `mcp-session-id`-Header.
//   - Sitzungen werden über echtes HTTP DELETE auf denselben Endpunkt geschlossen (Header, kein Body).
//
// Diese Annahmen (Header-Name, DELETE-Semantik) folgen der MCP-Streamable-HTTP-Spezifikation allgemein, sind
// aber gegen die *installierte* Bridge-Version nicht live verifiziert worden (kein Zugriff auf Server B aus
// dieser Session). Ein Fehlschlag von T01 mit "unexpected transport contract" ist daher ein möglicher, nicht
// auszuschließender Befund und MUSS vor einer erneuten Korrektur gegen den realen HTTP-Verkehr (z.B. per
// Mitschnitt) abgeglichen werden, nicht blind nachgebessert werden.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const MCP_PROTOCOL_VERSION = "2025-06-18"; // dokumentierte Annahme, siehe Kommentar oben

export class StdioTransport {
  constructor(cmd, { timeoutMs = 10000 } = {}) {
    const [bin, ...args] = cmd.split(" ");
    this.child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.pending = new Map();
    this.timeoutMs = timeoutMs;
    this.child.stdout.on("data", (chunk) => this._onData(chunk));
    this.child.stderr.on("data", () => {});
  }

  _onData(chunk) {
    this.buffer += chunk.toString("utf8");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const resolver = this.pending.get(msg.id);
      if (resolver) {
        this.pending.delete(msg.id);
        resolver(msg);
      }
    }
  }

  async request(method, params, { sessionId } = {}) {
    const id = randomUUID();
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, sessionId } });
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    this.child.stdin.write(payload + "\n");
    return result;
  }

  async notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async closeSession() {
    /* stdio hat kein HTTP-DELETE-Äquivalent; Session-Schließung über method "session/close" */
  }

  close() {
    this.child.kill();
  }
}

export class HttpTransport {
  constructor(endpoint, { timeoutMs = 10000 } = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.sessionId = null;
  }

  async _post(body, extraHeaders = {}) {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    Object.assign(headers, extraHeaders);
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const sessionHeader = res.headers.get("mcp-session-id");
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: { code: -32700, message: "non-JSON response", raw: text } };
    }
    return { httpStatus: res.status, sessionHeader, body: parsed };
  }

  async request(method, params, { sessionIdOverride } = {}) {
    const id = randomUUID();
    const previousSession = this.sessionId;
    if (sessionIdOverride !== undefined) this.sessionId = sessionIdOverride;
    const resp = await this._post({
      jsonrpc: "2.0",
      id,
      method,
      params: method === "initialize" ? { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "bridge-e2e-test", version: "0.2.0" }, ...params } : params,
    });
    if (sessionIdOverride !== undefined) this.sessionId = previousSession;

    if (method === "initialize" && resp.sessionHeader) {
      this.sessionId = resp.sessionHeader;
      await this.notify("notifications/initialized", {});
    }

    // Transport-, MCP- und Tool-Ebene getrennt ausweisen (Rework-Auftrag §4, T03).
    return {
      transportLevel: { httpStatus: resp.httpStatus, ok: resp.httpStatus >= 200 && resp.httpStatus < 300 },
      mcpLevel: { hasEnvelope: !!resp.body && resp.body.jsonrpc === "2.0", error: resp.body?.error ?? null },
      result: resp.body?.result ?? null,
      error: resp.body?.error ?? (resp.httpStatus >= 400 ? { code: resp.httpStatus, message: "http_level_rejection" } : null),
      sessionHeader: resp.sessionHeader,
      raw: resp,
    };
  }

  async notify(method, params) {
    await this._post({ jsonrpc: "2.0", method, params });
  }

  async closeSession(sessionId) {
    const headers = { "mcp-session-id": sessionId ?? this.sessionId };
    const res = await fetch(this.endpoint, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return { httpStatus: res.status };
  }

  close() {}
}

/**
 * MockTransport: vollständig lokale, in-process Simulation eines minimalen MCP-Servers inklusive echter
 * Audit-Hashkette (siehe lib/audit_chain.mjs). Dient ausschließlich lokalen Selbsttests (Phase C) — bildet
 * NICHT die reale Bridge nach, sondern ein Referenzverhalten, gegen das der Testharness selbst auf Korrektheit
 * geprüft werden kann, bevor er gegen eine echte isolierte Instanz läuft.
 */
export class MockTransport {
  constructor({ onAuditAppend }) {
    this.sessions = new Map(); // sessionId -> { initializedNotified: bool, closed: bool }
    this.onAuditAppend = onAuditAppend;
    this.tools = {
      system_status: { capabilityClass: "I0", handler: () => ({ status: "ok" }) },
      failing_tool: {
        capabilityClass: "I0",
        handler: () => {
          throw new Error("intentional_failure_for_T09");
        },
      },
    };
  }

  _appendAudit(event) {
    if (this.onAuditAppend) this.onAuditAppend(event);
  }

  async request(method, params = {}, { sessionIdOverride } = {}) {
    if (method === "initialize") {
      const sessionId = `mock-session-${randomUUID()}`;
      this.sessions.set(sessionId, { initializedNotified: false, closed: false });
      this._appendAudit({ action: "initialize", sessionId, correlationId: params.correlationId ?? null });
      return {
        transportLevel: { httpStatus: 200, ok: true },
        mcpLevel: { hasEnvelope: true, error: null },
        result: { sessionId, protocolVersion: "mock-1" },
        error: null,
        sessionHeader: sessionId,
        raw: { mock: true },
      };
    }

    const sessionId = sessionIdOverride ?? params.sessionId;
    const session = this.sessions.get(sessionId);

    if (method === "notifications/initialized") {
      if (session) session.initializedNotified = true;
      return { transportLevel: { httpStatus: 202, ok: true }, mcpLevel: { hasEnvelope: false }, result: null, error: null };
    }

    if (method === "session/close") {
      if (session) session.closed = true;
      this._appendAudit({ action: "session_close", sessionId });
      return { transportLevel: { httpStatus: 200, ok: true }, mcpLevel: { hasEnvelope: true, error: null }, result: { closed: true }, error: null };
    }

    if (!session || session.closed) {
      this._appendAudit({ action: "rejected", sessionId, reason: !session ? "invalid_session" : "closed_session" });
      return {
        transportLevel: { httpStatus: 404, ok: false },
        mcpLevel: { hasEnvelope: true, error: { code: -32001, message: !session ? "invalid_session" : "closed_session" } },
        result: null,
        error: { code: -32001, message: !session ? "invalid_session" : "closed_session" },
      };
    }

    if (method === "tools/list") {
      return {
        transportLevel: { httpStatus: 200, ok: true },
        mcpLevel: { hasEnvelope: true, error: null },
        result: { tools: Object.keys(this.tools).map((name) => ({ name, capabilityClass: this.tools[name].capabilityClass })) },
        error: null,
      };
    }

    if (method === "tools/call") {
      const tool = this.tools[params.name];
      if (!tool) {
        this._appendAudit({
          action: "tool_call_failed",
          sessionId,
          toolName: params.name,
          correlationId: params.correlationId ?? null,
          marker: params.arguments?.marker ?? null,
          reason: "unknown_tool",
        });
        return {
          transportLevel: { httpStatus: 200, ok: true },
          mcpLevel: { hasEnvelope: true, error: { code: -32601, message: "unknown_tool" } },
          result: null,
          error: { code: -32601, message: "unknown_tool" },
        };
      }
      try {
        const result = tool.handler(params.arguments);
        this._appendAudit({
          action: "tool_call_succeeded",
          sessionId,
          toolName: params.name,
          correlationId: params.correlationId ?? null,
          marker: params.arguments?.marker ?? null,
        });
        return { transportLevel: { httpStatus: 200, ok: true }, mcpLevel: { hasEnvelope: true, error: null }, result, error: null };
      } catch (err) {
        this._appendAudit({
          action: "tool_call_failed",
          sessionId,
          toolName: params.name,
          correlationId: params.correlationId ?? null,
          marker: params.arguments?.marker ?? null,
          reason: err.message,
        });
        return {
          transportLevel: { httpStatus: 200, ok: true },
          mcpLevel: { hasEnvelope: true, error: { code: -32000, message: err.message } },
          result: null,
          error: { code: -32000, message: err.message },
        };
      }
    }

    return {
      transportLevel: { httpStatus: 400, ok: false },
      mcpLevel: { hasEnvelope: true, error: { code: -32601, message: "method_not_found" } },
      result: null,
      error: { code: -32601, message: "method_not_found" },
    };
  }

  async notify(method, params) {
    if (method === "notifications/initialized") {
      // kein sessionId im params bei echtem MCP-Protokoll; Mock verfolgt es separat über request() calls.
    }
  }

  async closeSession(sessionId) {
    return this.request("session/close", { sessionId });
  }

  close() {}
}

export function buildTransport(config) {
  if (config.cmd) return new StdioTransport(config.cmd, { timeoutMs: config.timeoutMs });
  return new HttpTransport(config.endpoint, { timeoutMs: config.timeoutMs });
}
