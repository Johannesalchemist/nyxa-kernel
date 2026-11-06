#!/usr/bin/env node
// Bridge E2E Governance Test Pack
//
// Herkunft: siehe README.md in diesem Verzeichnis (Herkunftspflicht gemäß AGENTS.md).
// Status: DRAFT / IN_REVIEW. Noch nicht produktiv ausgeführt.
//
// Zweck: nicht nur die Erreichbarkeit einer MCP-Bridge prüfen, sondern die tatsächliche Durchsetzung der
// NYXA-Governance (Audit-Hashkette, Session-Vertrag, Scope-Isolation, Fail-Closed-Verhalten) nachweisen.
//
// Transport: JSON-RPC 2.0 über entweder
//   - stdio (BRIDGE_E2E_CMD gesetzt: Kommando wird gespawnt, JSON-RPC-Frames über stdin/stdout), oder
//   - HTTP(S) (BRIDGE_E2E_ENDPOINT gesetzt: POST je Request).
// Keine der beiden Optionen hat in dieser Entwicklungssession einen verifizierten Zielwert — beide sind vom
// ausführenden Menschen am Zielsystem zu setzen. Siehe RUN_INSTRUCTIONS.md.
//
// Keine Fremdabhängigkeiten (nur Node-Bordmittel), damit das Skript ohne zusätzliche Supply-Chain-Fläche auf dem
// Zielsystem läuft.

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Konfiguration (ausschließlich über Umgebungsvariablen — keine Pfade/Hosts im Code hartcodiert)
// ---------------------------------------------------------------------------

const CONFIG = {
  cmd: process.env.BRIDGE_E2E_CMD ?? null, // z.B. "node /pfad/zu/build/index.js"
  endpoint: process.env.BRIDGE_E2E_ENDPOINT ?? null, // z.B. "http://127.0.0.1:PORT/mcp"
  targetAttestation: process.env.BRIDGE_E2E_TARGET_ATTESTATION ?? null,
  enableE2: process.env.BRIDGE_E2E_ENABLE_E2 === "true",
  auditLogPath: process.env.BRIDGE_E2E_AUDIT_LOG_PATH ?? null,
  evidenceDir: process.env.BRIDGE_E2E_EVIDENCE_DIR ?? "./bridge-e2e-evidence",
  runId: `bridge-e2e:${randomUUID()}`,
  timeoutMs: Number(process.env.BRIDGE_E2E_TIMEOUT_MS ?? 10000),
};

// ---------------------------------------------------------------------------
// Preflight Guard — technisch prüfbare Teilmenge von PREFLIGHT_CHECKLIST.md.
// Dies ersetzt NICHT die manuelle Checkliste, sondern verhindert nur den offensichtlichsten Fehlgebrauch.
// ---------------------------------------------------------------------------

function runPreflightGuard() {
  const problems = [];

  if (!CONFIG.cmd && !CONFIG.endpoint) {
    problems.push(
      "Weder BRIDGE_E2E_CMD noch BRIDGE_E2E_ENDPOINT gesetzt. Ziel unbekannt -> Abbruch (Policy: kein unklarer Bridge-Prozess)."
    );
  }
  if (CONFIG.cmd && CONFIG.endpoint) {
    problems.push("Sowohl BRIDGE_E2E_CMD als auch BRIDGE_E2E_ENDPOINT gesetzt. Genau einen Transport wählen.");
  }
  if (!CONFIG.targetAttestation) {
    problems.push(
      "BRIDGE_E2E_TARGET_ATTESTATION fehlt. Ohne dokumentierte Zielidentitäts-Bestätigung (Preflight Punkt 1) kein Lauf."
    );
  }
  for (const protectedFragment of ["data/", "data-claude-bridge/", "data-tunnel/", "data-tunnel-v2/"]) {
    const haystack = `${CONFIG.cmd ?? ""} ${CONFIG.endpoint ?? ""} ${CONFIG.auditLogPath ?? ""}`;
    if (haystack.includes(protectedFragment)) {
      problems.push(
        `Konfiguration verweist auf geschützten Pfad-Fragment "${protectedFragment}". Abbruch gemäß Sicherheitsgrenzen.`
      );
    }
  }
  if (CONFIG.enableE2) {
    // E2 bleibt absichtlich nur vorbereitet, nicht freigegeben, solange keine gesonderte Freigabe explizit
    // dokumentiert wurde. Diese Datei kann das nicht selbst autorisieren.
    const ack = process.env.BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF ?? null;
    if (!ack) {
      problems.push(
        "BRIDGE_E2E_ENABLE_E2=true gesetzt, aber BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF fehlt. E2 bleibt gesperrt " +
          "(Architekturentscheidung: E1/E2 sind Freigabeblocker, keine implizite Freigabe)."
      );
    }
  }

  if (problems.length > 0) {
    console.error("PREFLIGHT FAILED — kein Testlauf.");
    for (const p of problems) console.error(" - " + p);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Transport-Adapter
// ---------------------------------------------------------------------------

class StdioTransport {
  constructor(cmd) {
    const [bin, ...args] = cmd.split(" ");
    this.child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.pending = new Map();
    this.child.stdout.on("data", (chunk) => this._onData(chunk));
    this.child.stderr.on("data", () => {}); // bewusst verworfen, kein stderr-Parsing als Erfolgskriterium
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
        continue; // unparsebare Zeile wird nicht stillschweigend als Erfolg gewertet, siehe recordRaw in Aufrufer
      }
      const resolver = this.pending.get(msg.id);
      if (resolver) {
        this.pending.delete(msg.id);
        resolver(msg);
      }
    }
  }

  async request(method, params) {
    const id = randomUUID();
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, CONFIG.timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    this.child.stdin.write(payload + "\n");
    return result;
  }

  close() {
    this.child.kill();
  }
}

class HttpTransport {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async request(method, params) {
    const id = randomUUID();
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(CONFIG.timeoutMs),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { id, error: { code: -32700, message: "non-JSON response", raw: text } };
    }
  }

  close() {}
}

function buildTransport() {
  if (CONFIG.cmd) return new StdioTransport(CONFIG.cmd);
  return new HttpTransport(CONFIG.endpoint);
}

// ---------------------------------------------------------------------------
// Evidenz-Sammlung
// ---------------------------------------------------------------------------

const results = [];

function recordResult({ id, description, expected, actual, pass, auditEvidenceRef, raw }) {
  const entry = {
    id,
    description,
    timestamp: new Date().toISOString(),
    expected,
    actual,
    pass,
    auditEvidenceRef: auditEvidenceRef ?? null,
    raw: raw ?? null,
    correlationId: CONFIG.runId,
  };
  results.push(entry);
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id} — ${description}`);
  return entry;
}

function ensureEvidenceDir() {
  if (!existsSync(CONFIG.evidenceDir)) mkdirSync(CONFIG.evidenceDir, { recursive: true });
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// Audit-Hashketten-Nachrechnung
//
// Erkennt explizit auch: fehlende Hashfelder, beschädigte Zeilen, unerwartete Kettenenden.
// Ein beschädigter oder unvollständiger Datensatz ist ein Integritätsfehler, niemals ein stilles PASS.
// ---------------------------------------------------------------------------

function recomputeAuditChain(logPath) {
  if (!logPath || !existsSync(logPath)) {
    return { valid: false, reason: "audit_log_path_missing_or_unreadable", checked: 0 };
  }
  const lines = readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
  let previousHash = null;
  let checked = 0;
  for (const [idx, line] of lines.entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return { valid: false, reason: "corrupted_line", lineIndex: idx, checked };
    }
    if (!record.event_hash || !record.previous_event_hash) {
      return { valid: false, reason: "missing_hash_field", lineIndex: idx, checked };
    }
    if (previousHash !== null && record.previous_event_hash !== previousHash) {
      return { valid: false, reason: "previous_hash_mismatch", lineIndex: idx, checked };
    }
    // Die Hash-Berechnungsfunktion der Zielimplementierung ist hier bewusst NICHT reimplementiert
    // (AGENTS.md: "Bestehende Commandlets, Validatoren und Workflows werden vor Inline-Workarounds verwendet").
    // Diese Funktion prüft nur die Verkettungs-Konsistenz der exponierten Felder, nicht die kryptographische
    // Korrektheit von event_hash selbst. Das ist ein dokumentierter Scope-Hinweis, kein stiller Lückenschluss.
    previousHash = record.event_hash;
    checked++;
  }
  if (checked === 0) {
    return { valid: false, reason: "empty_or_unexpected_chain_end", checked: 0 };
  }
  return { valid: true, checked, lastHash: previousHash };
}

// ---------------------------------------------------------------------------
// Externer, vom geprüften System unabhängiger Ledger-Anker.
//
// Wird außerhalb des AuditLog-Pfads der Zielimplementierung geschrieben, über eine eigene, unabhängige
// Ereigniszählung geführt und am Ende als eigene Datei mit eigenem Hash exportiert. Dient als zweite,
// vom geprüften System nicht kontrollierte Quelle für "wie viele Testereignisse sollten entstanden sein".
// ---------------------------------------------------------------------------

class ExternalLedger {
  constructor(runId) {
    this.runId = runId;
    this.events = [];
  }
  record(event) {
    this.events.push({ ...event, seq: this.events.length, recordedAt: new Date().toISOString() });
  }
  finalize() {
    const canonical = JSON.stringify({ runId: this.runId, events: this.events });
    return {
      runId: this.runId,
      independentEventCount: this.events.length,
      events: this.events,
      anchorHash: sha256(canonical),
    };
  }
}

// ---------------------------------------------------------------------------
// Testfälle (Tabelle aus dem Arbeitsauftrag)
// ---------------------------------------------------------------------------

async function runTestSuite(transport, ledger) {
  let sessionId = null;

  // T01 — MCP-Initialize -> gültige Sitzung
  {
    ledger.record({ kind: "request", test: "T01", method: "initialize" });
    const resp = await transport.request("initialize", { correlationId: CONFIG.runId });
    const pass = !!(resp && !resp.error && resp.result);
    sessionId = resp?.result?.sessionId ?? null;
    ledger.record({ kind: "response", test: "T01", hasSession: !!sessionId });
    recordResult({
      id: "T01",
      description: "MCP-Initialize liefert gültige Sitzung",
      expected: "result mit sessionId, kein error",
      actual: pass ? "ok" : JSON.stringify(resp),
      pass: pass && !!sessionId,
      raw: resp,
    });
  }

  // T02 — tools/list -> korrekte Tool-Liste
  {
    const resp = await transport.request("tools/list", { sessionId });
    const toolNames = resp?.result?.tools?.map((t) => t.name) ?? [];
    const pass = Array.isArray(toolNames) && toolNames.length > 0 && !resp.error;
    recordResult({
      id: "T02",
      description: "tools/list liefert erwartete Tool-Liste",
      expected: "nicht-leere Tool-Liste, kein error",
      actual: pass ? toolNames.join(",") : JSON.stringify(resp),
      pass,
      raw: resp,
    });
  }

  // T03 — I0-Leseaufruf -> erfolgreiche Antwort
  {
    const resp = await transport.request("tools/call", {
      sessionId,
      name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
      arguments: {},
      correlationId: CONFIG.runId,
    });
    const pass = !!(resp && !resp.error);
    recordResult({
      id: "T03",
      description: "I0-Leseaufruf antwortet erfolgreich",
      expected: "result, kein error",
      actual: pass ? "ok" : JSON.stringify(resp),
      pass,
      auditEvidenceRef: CONFIG.runId,
      raw: resp,
    });
  }

  // T04 — ungültige Session-ID -> kontrollierte Ablehnung
  {
    const resp = await transport.request("tools/call", {
      sessionId: "invalid-" + randomUUID(),
      name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
      arguments: {},
    });
    const pass = !!(resp && resp.error); // Ablehnung ist das erwartete, nicht das Fehlerhafte Ergebnis
    recordResult({
      id: "T04",
      description: "Ungültige Session-ID wird kontrolliert abgelehnt",
      expected: "error-Antwort (kein Absturz, keine stille Annahme)",
      actual: pass ? JSON.stringify(resp.error) : "kein error-Feld — unerwartet akzeptiert",
      pass,
      raw: resp,
    });
  }

  // T05 — geschlossene Session -> keine weitere Nutzung
  {
    await transport.request("session/close", { sessionId });
    const resp = await transport.request("tools/call", {
      sessionId,
      name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
      arguments: {},
    });
    const pass = !!(resp && resp.error);
    recordResult({
      id: "T05",
      description: "Geschlossene Session lässt keine weitere Nutzung zu",
      expected: "error-Antwort nach session/close",
      actual: pass ? JSON.stringify(resp.error) : "kein error-Feld — Session fälschlich weiter nutzbar",
      pass,
      raw: resp,
    });
  }

  // T06 — wiederholte Session-Nutzung -> Verhalten gemäß Session-Vertrag
  // Hinweis: "gemäß Vertrag" ist hier bewusst nicht als hartes PASS/FAIL auf ein bestimmtes Verhalten codiert,
  // da der tatsächliche Session-Vertrag der Zielimplementierung in dieser Entwicklungssession nicht verifiziert
  // werden konnte (kein Live-Zugriff). Das Skript protokolliert das tatsächliche Verhalten zur menschlichen
  // Bewertung gegen den dokumentierten Vertrag, markiert es aber nicht eigenmächtig als PASS.
  {
    const init2 = await transport.request("initialize", { correlationId: CONFIG.runId });
    const sid2 = init2?.result?.sessionId ?? null;
    const first = await transport.request("tools/call", {
      sessionId: sid2,
      name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
      arguments: {},
    });
    const second = await transport.request("tools/call", {
      sessionId: sid2,
      name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
      arguments: {},
    });
    recordResult({
      id: "T06",
      description: "Wiederholte Nutzung derselben Session — Verhalten protokolliert, nicht automatisch bewertet",
      expected: "unknown — gegen dokumentierten Session-Vertrag menschlich zu bewerten",
      actual: JSON.stringify({ first: first?.error ?? "ok", second: second?.error ?? "ok" }),
      pass: null, // explizit kein automatisches Urteil
      raw: { first, second },
    });
  }

  // T07 — zwei parallele Sessions -> keine Audit-Kollision
  {
    const [initA, initB] = await Promise.all([
      transport.request("initialize", { correlationId: CONFIG.runId + ":A" }),
      transport.request("initialize", { correlationId: CONFIG.runId + ":B" }),
    ]);
    const sidA = initA?.result?.sessionId;
    const sidB = initB?.result?.sessionId;
    const [callA, callB] = await Promise.all([
      transport.request("tools/call", {
        sessionId: sidA,
        name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
        arguments: {},
        correlationId: CONFIG.runId + ":A",
      }),
      transport.request("tools/call", {
        sessionId: sidB,
        name: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
        arguments: {},
        correlationId: CONFIG.runId + ":B",
      }),
    ]);
    const distinctSessions = !!(sidA && sidB && sidA !== sidB);
    const bothAnswered = !!(callA && !callA.error && callB && !callB.error);
    recordResult({
      id: "T07",
      description: "Zwei parallele Sessions erzeugen keine Audit-Kollision",
      expected: "zwei unterscheidbare Session-IDs, beide Aufrufe erfolgreich, getrennt korrelierbar",
      actual: `distinctSessions=${distinctSessions} bothAnswered=${bothAnswered}`,
      pass: distinctSessions && bothAnswered,
      auditEvidenceRef: `${CONFIG.runId}:A,${CONFIG.runId}:B`,
      raw: { initA, initB, callA, callB },
    });
  }

  // T08 — Audit-Nachrechnung -> durchgehend gültige Hashkette
  {
    const chain = recomputeAuditChain(CONFIG.auditLogPath);
    recordResult({
      id: "T08",
      description: "Audit-Log-Hashkette ist durchgehend gültig",
      expected: "valid=true über alle geprüften Einträge",
      actual: JSON.stringify(chain),
      pass: chain.valid === true,
      raw: chain,
    });
  }

  // T09 — fehlgeschlagene Aufrufe -> nachweisbar im Audit
  // Erzeugt einen bewusst fehlschlagenden, aber harmlosen Aufruf (unbekanntes Tool) und erwartet, dass er im
  // nachträglich neu gelesenen Audit-Log auffindbar ist.
  {
    const unknownCall = await transport.request("tools/call", {
      sessionId,
      name: "nonexistent_tool_" + CONFIG.runId,
      arguments: {},
      correlationId: CONFIG.runId,
    });
    let foundInAudit = "unknown_no_audit_log_path";
    if (CONFIG.auditLogPath && existsSync(CONFIG.auditLogPath)) {
      const content = readFileSync(CONFIG.auditLogPath, "utf8");
      foundInAudit = content.includes(CONFIG.runId);
    }
    recordResult({
      id: "T09",
      description: "Fehlgeschlagener Aufruf ist im Audit nachweisbar",
      expected: "error-Antwort UND Fund im Audit-Log unter correlationId",
      actual: `error=${!!unknownCall?.error} foundInAudit=${foundInAudit}`,
      pass: !!unknownCall?.error && foundInAudit === true,
      auditEvidenceRef: CONFIG.runId,
      raw: unknownCall,
    });
  }

  // T10 — ungehashte Ereignisse -> Integritätsfehler statt PASS
  // Simuliert KEINEN echten ungehashten Eintrag im Zielsystem (das wäre E2-artig). Statt dessen wird die
  // Nachrechnungsfunktion selbst gegen eine synthetische, absichtlich fehlerhafte Kette getestet
  // (Selbsttest des Prüfwerkzeugs, keine Wirkung auf das Zielsystem).
  {
    const synthetic = [
      JSON.stringify({ event_hash: "a", previous_event_hash: null }),
      JSON.stringify({ previous_event_hash: "a" }), // event_hash fehlt absichtlich
    ].join("\n");
    const tmpPath = join(CONFIG.evidenceDir, `t10-synthetic-${CONFIG.runId.split(":")[1]}.log`);
    ensureEvidenceDir();
    writeFileSync(tmpPath, synthetic, "utf8");
    const chain = recomputeAuditChain(tmpPath);
    const pass = chain.valid === false && chain.reason === "missing_hash_field";
    recordResult({
      id: "T10",
      description: "Prüfwerkzeug erkennt ungehashtes Ereignis als Integritätsfehler, nicht als PASS",
      expected: "valid=false, reason=missing_hash_field",
      actual: JSON.stringify(chain),
      pass,
      raw: chain,
    });
  }

  return sessionId;
}

// ---------------------------------------------------------------------------
// E2 — vorbereitet, nicht ausgeführt (siehe README.md / ADR-Blocker)
// ---------------------------------------------------------------------------

async function prepareE2Stub() {
  return {
    id: "E2-PREPARED-NOT-EXECUTED",
    description:
      "Absichtliches Auslösen eines Audit-Schreibfehlers. Als separater Testfall vorbereitet, Ausführung " +
      "gesperrt durch Preflight-Guard, solange BRIDGE_E2E_ENABLE_E2 und BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF nicht " +
      "beide explizit gesetzt sind. E2 ist laut Architekturentscheidung ein Freigabeblocker, kein Routinetest.",
    executed: false,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  runPreflightGuard();
  ensureEvidenceDir();

  const ledger = new ExternalLedger(CONFIG.runId);
  const transport = buildTransport();

  ledger.record({ kind: "run_start", targetAttestation: CONFIG.targetAttestation });

  let sessionId = null;
  try {
    sessionId = await runTestSuite(transport, ledger);
  } finally {
    const e2 = await prepareE2Stub();
    results.push({
      id: e2.id,
      description: e2.description,
      timestamp: new Date().toISOString(),
      expected: "n/a — nicht ausgeführt",
      actual: "n/a — nicht ausgeführt",
      pass: null,
      correlationId: CONFIG.runId,
    });

    ledger.record({ kind: "run_end", sessionId, resultCount: results.length });
    try {
      transport.close();
    } catch {
      /* best effort */
    }

    const report = {
      runId: CONFIG.runId,
      generatedAt: new Date().toISOString(),
      targetAttestation: CONFIG.targetAttestation,
      config: { ...CONFIG, targetAttestation: "[see report.targetAttestation]" },
      results,
      externalLedger: ledger.finalize(),
    };
    const reportPath = join(CONFIG.evidenceDir, `report-${CONFIG.runId.split(":")[1]}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    const passCount = results.filter((r) => r.pass === true).length;
    const failCount = results.filter((r) => r.pass === false).length;
    const unjudgedCount = results.filter((r) => r.pass === null).length;

    console.log("\n--- Bridge E2E Summary ---");
    console.log(`runId: ${CONFIG.runId}`);
    console.log(`PASS: ${passCount}  FAIL: ${failCount}  UNJUDGED: ${unjudgedCount}`);
    console.log(`Evidenzbericht: ${reportPath}`);
    console.log(
      "HOLD bleibt in Kraft — dieser Lauf ist kein Freigabenachweis, unabhängig vom Ergebnis " +
        "(E1/E2 nicht nachgewiesen)."
    );

    if (failCount > 0) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
