#!/usr/bin/env node
// Bridge E2E Governance Test Pack — v2 (Rework)
//
// Herkunft: siehe README.md. Diese Version korrigiert v1 (Commit eeceb26) gemäß dem Rework-Handoff vom
// 06.11.2026 ("WORK HANDOFF → CLAUDE: NYXA Bridge-E2E: Remediation, Verification & Adversarial Review").
// Wiederverwendet: Preflight-Grundidee, Testfall-Gliederung T01–T10, externer Ledger-Anker, E2-Sperrmechanik.
// Korrigiert: Transportvertrag (lib/transport.mjs), Attestation (lib/preflight.mjs),
// Hashketten-Content-Integrität (lib/audit_chain.mjs), T04/T05/T07/T09 Beweisführung.
//
// Diese Datei bleibt ohne Fremdabhängigkeiten (nur Node-Bordmittel + lokale lib/-Module).

import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildTransport } from "./lib/transport.mjs";
import { runPreflightGuard } from "./lib/preflight.mjs";
import { recomputeAuditChain, loadRealHashFn } from "./lib/audit_chain.mjs";

const CONFIG = {
  cmd: process.env.BRIDGE_E2E_CMD ?? null,
  endpoint: process.env.BRIDGE_E2E_ENDPOINT ?? null,
  targetAttestationInline: process.env.BRIDGE_E2E_TARGET_ATTESTATION ?? null,
  targetAttestationFile: process.env.BRIDGE_E2E_TARGET_ATTESTATION_FILE ?? null,
  enableE2: process.env.BRIDGE_E2E_ENABLE_E2 === "true",
  e2ApprovalRef: process.env.BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF ?? null,
  auditLogPath: process.env.BRIDGE_E2E_AUDIT_LOG_PATH ?? null,
  auditLogModulePath: process.env.BRIDGE_E2E_AUDITLOG_MODULE_PATH ?? null,
  evidenceDir: process.env.BRIDGE_E2E_EVIDENCE_DIR ?? "./bridge-e2e-evidence",
  i0ToolName: process.env.BRIDGE_E2E_I0_TOOL_NAME ?? "system_status",
  runId: `bridge-e2e:${randomUUID()}`,
  timeoutMs: Number(process.env.BRIDGE_E2E_TIMEOUT_MS ?? 10000),
};

const results = [];
function recordResult({ id, description, expected, actual, pass, auditEvidenceRef, raw, subVerdicts }) {
  const entry = {
    id,
    description,
    timestamp: new Date().toISOString(),
    expected,
    actual,
    pass, // true | false | null (null = kein automatisches Urteil, NICHT "bestanden")
    // Getrennte Teilurteile, falls `pass` mehrere unabhängige Eigenschaften zusammenfasst (z.B. T08:
    // Verkettungskonsistenz vs. Content-Hash-Integrität). pass=true bezieht sich NUR auf die hier genannten
    // Teilurteile — ein fehlendes oder false-Teilurteil darf nicht durch ein PASS auf Zeilenebene verdeckt
    // werden. Korrektur nach Red-Team-Review vom 06.11.2026 (Punkt 4: "T08 darf keinen vollständigen
    // Integritätsnachweis suggerieren").
    subVerdicts: subVerdicts ?? null,
    auditEvidenceRef: auditEvidenceRef ?? null,
    raw: raw ?? null,
    correlationId: CONFIG.runId,
  };
  results.push(entry);
  const label = pass === true ? "PASS" : pass === false ? "FAIL" : "UNJUDGED";
  console.log(`[${label}] ${id} — ${description}`);
  return entry;
}

function ensureEvidenceDir() {
  if (!existsSync(CONFIG.evidenceDir)) mkdirSync(CONFIG.evidenceDir, { recursive: true });
}
function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

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
    return { runId: this.runId, independentEventCount: this.events.length, events: this.events, anchorHash: sha256(canonical) };
  }
}

// ---------------------------------------------------------------------------
// Testfälle T01–T10 gegen den konfigurierten Transport (echte Bridge ODER MockTransport für Selbsttests).
// ---------------------------------------------------------------------------

async function runTestSuite(transport, ledger) {
  let sessionId = null;

  // T01 — initialize mit echtem Vertrag: Session-ID aus sessionHeader/result, notifications/initialized gesendet.
  {
    ledger.record({ kind: "request", test: "T01", method: "initialize" });
    const resp = await transport.request("initialize", { correlationId: CONFIG.runId });
    sessionId = resp.sessionHeader ?? resp.result?.sessionId ?? null;
    const pass = resp.transportLevel.ok && resp.mcpLevel.hasEnvelope !== false && !resp.error && !!sessionId;
    ledger.record({ kind: "response", test: "T01", hasSession: !!sessionId });
    recordResult({
      id: "T01",
      description: "MCP-Initialize liefert gültige Sitzung (Session-ID aus Header ODER Result, kein error)",
      expected: "transportLevel.ok, mcpLevel ohne error, sessionId vorhanden",
      actual: JSON.stringify({ transportLevel: resp.transportLevel, mcpLevel: resp.mcpLevel, hasSession: !!sessionId }),
      pass,
      raw: resp,
    });
  }

  // T02 — tools/list
  {
    const resp = await transport.request("tools/list", { sessionId });
    const toolNames = resp.result?.tools?.map((t) => t.name) ?? [];
    const pass = resp.transportLevel.ok && !resp.error && Array.isArray(toolNames) && toolNames.length > 0;
    recordResult({
      id: "T02",
      description: "tools/list liefert nicht-leeren, fehlerfreien Tool-Katalog",
      expected: "transportLevel.ok, kein error, nicht-leere Tool-Liste",
      actual: pass ? toolNames.join(",") : JSON.stringify(resp),
      pass,
      raw: resp,
    });
  }

  // T03 — I0-Leseaufruf, Transport-/MCP-/Tool-Ebene getrennt bewertet
  {
    const resp = await transport.request("tools/call", { sessionId, name: CONFIG.i0ToolName, arguments: {}, correlationId: CONFIG.runId });
    const transportOk = resp.transportLevel.ok;
    const mcpOk = !resp.mcpLevel.error;
    const toolOk = !resp.error && resp.result != null;
    recordResult({
      id: "T03",
      description: "I0-Leseaufruf — Transport-, MCP- und Tool-Ebene getrennt bewertet",
      expected: "transportOk=true, mcpOk=true, toolOk=true",
      actual: `transportOk=${transportOk} mcpOk=${mcpOk} toolOk=${toolOk}`,
      pass: transportOk && mcpOk && toolOk,
      auditEvidenceRef: CONFIG.runId,
      raw: resp,
    });
  }

  // T04 — ungültige Session-ID: kontrollierte Ablehnung UND Nachweis, dass keine Toolwirkung stattfand.
  {
    const invalidSession = "invalid-" + randomUUID();
    const marker = "t04-" + randomUUID();
    const resp = await transport.request("tools/call", { sessionId: invalidSession, name: CONFIG.i0ToolName, arguments: { marker } });
    const rejected = !!resp.error;
    let noEffectConfirmed = "unknown_no_audit_log_path";
    if (CONFIG.auditLogPath && existsSync(CONFIG.auditLogPath)) {
      const content = readFileSync(CONFIG.auditLogPath, "utf8");
      noEffectConfirmed = !content.includes(marker); // marker darf NICHT als erfolgreiche Tool-Ausführung auftauchen
    }
    recordResult({
      id: "T04",
      description: "Ungültige Session-ID wird abgelehnt UND erzeugt keine Toolwirkung im Audit",
      expected: "rejected=true, noEffectConfirmed=true (oder unknown bei fehlendem Audit-Pfad)",
      actual: `rejected=${rejected} noEffectConfirmed=${noEffectConfirmed}`,
      pass: noEffectConfirmed === "unknown_no_audit_log_path" ? null : rejected && noEffectConfirmed === true,
      raw: resp,
    });
  }

  // T05 — geschlossene Session über echten Close-Mechanismus (HTTP DELETE bzw. transport.closeSession)
  {
    await transport.closeSession(sessionId);
    const resp = await transport.request("tools/call", { sessionId, name: CONFIG.i0ToolName, arguments: {} });
    const pass = !!resp.error;
    recordResult({
      id: "T05",
      description: "Geschlossene Session (echter Close-Mechanismus) lässt keine weitere Nutzung zu",
      expected: "error nach closeSession()",
      actual: pass ? JSON.stringify(resp.error) : "kein error — Session fälschlich weiter nutzbar",
      pass,
      raw: resp,
    });
  }

  // T06 — wiederholte Session-Nutzung: KEIN erfundenes PASS, explizit NOT_TESTED mit Begründung.
  {
    const init2 = await transport.request("initialize", { correlationId: CONFIG.runId + ":T06" });
    const sid2 = init2.sessionHeader ?? init2.result?.sessionId ?? null;
    const first = await transport.request("tools/call", { sessionId: sid2, name: CONFIG.i0ToolName, arguments: {} });
    const second = await transport.request("tools/call", { sessionId: sid2, name: CONFIG.i0ToolName, arguments: {} });
    recordResult({
      id: "T06",
      description: "Wiederholte Nutzung derselben Session gegen dokumentierten Session-Vertrag",
      expected: "NOT_TESTED — kein dokumentierter Session-Vertrag der Zielimplementierung in dieser Session verifiziert",
      actual: JSON.stringify({ first: first.error ?? "ok", second: second.error ?? "ok" }),
      pass: null, // bleibt explizit UNJUDGED, siehe Begründung in expected
      raw: { first, second },
    });
  }

  // T07 — zwei parallele Sessions: getrennte Sessions UND nichtüberlappende Audit-Korrelation.
  // Hinweis: ein eigenständiger Child-Prozess-Nachweis (Betriebssystemebene) ist mit diesem Skript gegen eine
  // reale Bridge NICHT möglich (kein Prozesszugriff aus diesem Testclient). Lock-Korrektheit wird hier NICHT
  // behauptet — nur Session-Trennung und Audit-Korrelierbarkeit.
  {
    const corrA = CONFIG.runId + ":A";
    const corrB = CONFIG.runId + ":B";
    const [initA, initB] = await Promise.all([
      transport.request("initialize", { correlationId: corrA }),
      transport.request("initialize", { correlationId: corrB }),
    ]);
    const sidA = initA.sessionHeader ?? initA.result?.sessionId;
    const sidB = initB.sessionHeader ?? initB.result?.sessionId;
    const markerA = "t07a-" + randomUUID();
    const markerB = "t07b-" + randomUUID();
    const [callA, callB] = await Promise.all([
      transport.request("tools/call", { sessionId: sidA, name: CONFIG.i0ToolName, arguments: { marker: markerA }, correlationId: corrA }),
      transport.request("tools/call", { sessionId: sidB, name: CONFIG.i0ToolName, arguments: { marker: markerB }, correlationId: corrB }),
    ]);
    const distinctSessions = !!(sidA && sidB && sidA !== sidB);
    const bothAnswered = !!(callA && !callA.error && callB && !callB.error);
    let noCrossContamination = "unknown_no_audit_log_path";
    if (CONFIG.auditLogPath && existsSync(CONFIG.auditLogPath)) {
      const content = readFileSync(CONFIG.auditLogPath, "utf8");
      const linesWithA = content.split("\n").filter((l) => l.includes(markerA));
      const linesWithB = content.split("\n").filter((l) => l.includes(markerB));
      noCrossContamination = linesWithA.every((l) => !l.includes(corrB)) && linesWithB.every((l) => !l.includes(corrA));
    }
    recordResult({
      id: "T07",
      description:
        "Zwei parallele Sessions: getrennte Session-IDs, beide Aufrufe beantwortet, keine Audit-Vermischung " +
        "(Lock-Korrektheit selbst NICHT behauptet — siehe E1)",
      expected: "distinctSessions=true, bothAnswered=true, noCrossContamination=true (oder unknown)",
      actual: `distinctSessions=${distinctSessions} bothAnswered=${bothAnswered} noCrossContamination=${noCrossContamination}`,
      pass: noCrossContamination === "unknown_no_audit_log_path" ? null : distinctSessions && bothAnswered && noCrossContamination === true,
      auditEvidenceRef: `${corrA},${corrB}`,
      raw: { initA, initB, callA, callB },
    });
  }

  // T08 — vollständige Hashketten-Nachrechnung inkl. Genesis-Anker und (falls verfügbar) Content-Integrität.
  {
    let realHashFn = null;
    let realHashFnStatus = "not_configured";
    if (CONFIG.auditLogModulePath) {
      const loaded = await loadRealHashFn(CONFIG.auditLogModulePath);
      if (loaded?.error) realHashFnStatus = loaded.error;
      else if (loaded?.fn) {
        realHashFn = loaded.fn;
        realHashFnStatus = "loaded";
      }
    }
    const chain = recomputeAuditChain(CONFIG.auditLogPath, { realHashFn });
    const contentIntegrityVerified = chain.contentIntegrity === "verified";
    recordResult({
      id: "T08",
      description:
        "Audit-Log: ZWEI GETRENNTE Teilurteile — Verkettung+Genesis-Anker, UND Content-Hash-Integrität. " +
        "`pass` deckt NUR die Verkettung ab. contentIntegrityVerified=false bedeutet 'ungeprüft', NICHT " +
        "'fehlerfrei angenommen' — ein PASS hier ist KEIN vollständiger Integritätsnachweis ohne realHashFn.",
      expected: "chain.valid=true (Verkettung); contentIntegrityVerified=true NUR wenn realHashFn geladen wurde",
      actual: JSON.stringify({ ...chain, realHashFnStatus, contentIntegrityVerified }),
      pass: chain.valid === true,
      subVerdicts: {
        chainLinkageValid: chain.valid === true,
        contentIntegrityVerified,
        contentIntegrityStatus: chain.contentIntegrity ?? "unknown",
      },
      raw: { chain, realHashFnStatus },
    });
  }

  // T09 — fehlgeschlagener Aufruf eindeutig einer Audit-Zeile zugeordnet (Marker, nicht nur Run-ID-Treffer);
  // Unterscheidung HTTP-Bridge-Ablehnung vs. im MCP-Tool selbst auditierter Fehler.
  // Nutzt eine EIGENE frische Session, nicht die äußere `sessionId` — diese wurde in T05 absichtlich
  // geschlossen. Wiederverwendung hätte den Aufruf als "closed_session" statt "unknown_tool" abgelehnt und
  // damit nie den auditierten Tool-Fehlerpfad erreicht (im Selbsttest real beobachtet, siehe Handoff).
  {
    const initT09 = await transport.request("initialize", { correlationId: CONFIG.runId + ":T09" });
    const sidT09 = initT09.sessionHeader ?? initT09.result?.sessionId ?? null;
    const marker = "t09-" + randomUUID();
    const resp = await transport.request("tools/call", { sessionId: sidT09, name: "nonexistent_tool_" + CONFIG.runId, arguments: { marker }, correlationId: CONFIG.runId });
    const httpLevelRejection = resp.transportLevel.httpStatus >= 400;
    const mcpToolLevelError = !!resp.mcpLevel?.error || !!resp.error;
    let matchedAuditLine = "unknown_no_audit_log_path";
    if (CONFIG.auditLogPath && existsSync(CONFIG.auditLogPath)) {
      const lines = readFileSync(CONFIG.auditLogPath, "utf8").split("\n");
      matchedAuditLine = lines.some((l) => l.includes(marker));
    }
    recordResult({
      id: "T09",
      description: "Fehlgeschlagener Aufruf eindeutig per Marker im Audit nachweisbar; Fehlerquelle unterschieden",
      expected: "mcpToolLevelError=true, matchedAuditLine=true (eindeutiger Marker-Treffer, nicht nur runId)",
      actual: `httpLevelRejection=${httpLevelRejection} mcpToolLevelError=${mcpToolLevelError} matchedAuditLine=${matchedAuditLine}`,
      pass: matchedAuditLine === "unknown_no_audit_log_path" ? null : mcpToolLevelError && matchedAuditLine === true,
      auditEvidenceRef: marker,
      raw: resp,
    });
  }

  // T10 — Validator-Selbsttest mit Genesis-Kette + genau einer gezielten Manipulation je Fall,
  // inklusive Positivkontrolle. Prüft, dass der Validator aus dem ERWARTETEN Grund scheitert.
  {
    const t10Results = runValidatorSelfTest();
    const allAsExpected = t10Results.every((r) => r.asExpected);
    recordResult({
      id: "T10",
      description: "Validator-Selbsttest: Positivkontrolle + je eine gezielte Manipulation, erwarteter Fehlergrund geprüft",
      expected: "alle Fälle liefern genau den erwarteten reason-Code (oder valid=true bei Positivkontrolle)",
      actual: JSON.stringify(t10Results),
      pass: allAsExpected,
      raw: t10Results,
    });
  }

  return sessionId;
}

// ---------------------------------------------------------------------------
// T10-Fixtures: eine echte Genesis-verankerte Kette, dann je ein Fall mit genau einer Manipulation.
// ---------------------------------------------------------------------------

function buildGenesisChainFixture() {
  const { GENESIS_ANCHOR, defaultCanonicalSerialize, sha256Hex } = globalThis.__auditChainHelpers;
  const records = [];
  let prev = GENESIS_ANCHOR;
  for (let i = 0; i < 3; i++) {
    const base = { seq: i, action: "test_event", correlationId: "t10-fixture", previous_event_hash: prev };
    const event_hash = sha256Hex(defaultCanonicalSerialize({ ...base, event_hash: undefined }));
    const record = { ...base, event_hash };
    records.push(record);
    prev = event_hash;
  }
  return records;
}

function writeFixture(evidenceDir, name, records) {
  ensureEvidenceDir();
  const path = join(evidenceDir, `t10-${name}.log`);
  writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n"), "utf8");
  return path;
}

function runValidatorSelfTest() {
  const good = buildGenesisChainFixture();
  const cases = [];

  // Positivkontrolle
  {
    const path = writeFixture(CONFIG.evidenceDir, "positive", good);
    const chain = recomputeAuditChain(path);
    cases.push({ case: "positive_control", expectedReason: null, result: chain, asExpected: chain.valid === true });
  }

  // Manipuliertes Ereignis (event_hash eines mittleren Eintrags verändert)
  {
    const tampered = good.map((r, i) => (i === 1 ? { ...r, event_hash: r.event_hash.replace(/.$/, r.event_hash.endsWith("0") ? "1" : "0") } : r));
    const path = writeFixture(CONFIG.evidenceDir, "tampered-event", tampered);
    const chain = recomputeAuditChain(path);
    // Der direkte Effekt eines veränderten event_hash in dieser Linkkette ist ein previous_hash_mismatch im Folgeeintrag.
    cases.push({ case: "tampered_event", expectedReason: "previous_hash_mismatch", result: chain, asExpected: chain.valid === false && chain.reason === "previous_hash_mismatch" });
  }

  // Falscher Vorgänger
  {
    const wrongPrev = good.map((r, i) => (i === 2 ? { ...r, previous_event_hash: "deadbeef".repeat(8) } : r));
    const path = writeFixture(CONFIG.evidenceDir, "wrong-previous", wrongPrev);
    const chain = recomputeAuditChain(path);
    cases.push({ case: "wrong_previous", expectedReason: "previous_hash_mismatch", result: chain, asExpected: chain.valid === false && chain.reason === "previous_hash_mismatch" });
  }

  // Fehlendes Hashfeld
  {
    const missing = good.map((r, i) => {
      if (i !== 0) return r;
      const { event_hash, ...rest } = r;
      return rest;
    });
    const path = writeFixture(CONFIG.evidenceDir, "missing-field", missing);
    const chain = recomputeAuditChain(path);
    cases.push({ case: "missing_hash_field", expectedReason: "missing_hash_field", result: chain, asExpected: chain.valid === false && chain.reason === "missing_hash_field" });
  }

  // Defekte JSON-Zeile
  {
    const path = join(CONFIG.evidenceDir, "t10-corrupted-line.log");
    writeFileSync(path, good.map((r) => JSON.stringify(r)).join("\n") + "\nNOT_JSON{{{", "utf8");
    const chain = recomputeAuditChain(path);
    cases.push({ case: "corrupted_line", expectedReason: "corrupted_line", result: chain, asExpected: chain.valid === false && chain.reason === "corrupted_line" });
  }

  // Fehlender Genesis-Anker (erste Zeile referenziert nicht den Genesis-Anker)
  {
    const noGenesis = good.map((r, i) => (i === 0 ? { ...r, previous_event_hash: "ff".repeat(32) } : r));
    const path = writeFixture(CONFIG.evidenceDir, "missing-genesis", noGenesis);
    const chain = recomputeAuditChain(path);
    cases.push({ case: "missing_genesis_anchor", expectedReason: "missing_genesis_anchor", result: chain, asExpected: chain.valid === false && chain.reason === "missing_genesis_anchor" });
  }

  // Abgeschnittene Kette (leere Datei)
  {
    const path = join(CONFIG.evidenceDir, "t10-truncated.log");
    writeFileSync(path, "", "utf8");
    const chain = recomputeAuditChain(path);
    cases.push({ case: "truncated_empty_chain", expectedReason: "empty_or_unexpected_chain_end", result: chain, asExpected: chain.valid === false && chain.reason === "empty_or_unexpected_chain_end" });
  }

  return cases;
}

// ---------------------------------------------------------------------------
// E2 — vorbereitet, nicht ausgeführt.
// ---------------------------------------------------------------------------

function prepareE2Stub() {
  return {
    id: "E2-PREPARED-NOT-EXECUTED",
    description:
      "Nachweis, dass eine technisch ausführbare, aber mangels erfolgreicher Auditierung unzulässige Wirkung " +
      "tatsächlich verhindert wird (beobachtete Wirkung, nicht nur Exception/Logeintrag). Als separater Testfall " +
      "vorbereitet. Ausführung gesperrt, solange BRIDGE_E2E_ENABLE_E2 und BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF " +
      "nicht beide explizit gesetzt sind, UND solange keine produktionsfreie Fault-Injection-Methode für die " +
      "reale AuditLog-Implementierung spezifiziert ist (aus dieser Session heraus nicht verifizierbar, da kein " +
      "Lesezugriff auf den Quellcode der Ziel-Implementierung bestand).",
    executed: false,
  };
}

// ---------------------------------------------------------------------------
// E1 — Cross-Process Lock: nur Testplan, keine Ausführung (siehe Handoff-Abschnitt 5/9).
// ---------------------------------------------------------------------------

function prepareE1Plan() {
  return {
    id: "E1-PLAN-NOT-EXECUTED",
    description:
      "Adversarial-Plan für Stale-Lock-Reclamation, konkurrierende Prozesse, Timeout-Rennen und Lock-Entfernung " +
      "durch Fremdprozess. BLOCKIERT in dieser Session: der tatsächliche Lock-Code (open(...,'wx'), 30s " +
      "Stale-Timeout, 10s Acquire-Timeout) liegt nur auf Server B vor und wurde hier nicht gelesen — eine " +
      "Simulation ohne den realen Code wäre eine Erfindung, keine Verifikation (AGENTS.md: keine impliziten " +
      "Annahmen). Nächster Schritt: AuditLog.js-Quelltext von Server B in einer Session mit Lesezugriff " +
      "beschaffen, dann zwei konkurrierende lokale Prozesse gegen denselben Audit-Pfad in einer isolierten " +
      "Kopie des realen Lock-Codes laufen lassen.",
    executed: false,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const preflight = runPreflightGuard(CONFIG);
  if (!preflight.ok) {
    console.error("PREFLIGHT FAILED — kein Testlauf.");
    for (const p of preflight.problems) console.error(" - " + p);
    process.exit(2);
  }
  ensureEvidenceDir();

  const { GENESIS_ANCHOR, defaultCanonicalSerialize, sha256Hex } = await import("./lib/audit_chain.mjs");
  globalThis.__auditChainHelpers = { GENESIS_ANCHOR, defaultCanonicalSerialize, sha256Hex };

  const ledger = new ExternalLedger(CONFIG.runId);
  const transport = buildTransport(CONFIG);
  ledger.record({ kind: "run_start", attestationApprovedScope: preflight.attestation?.approvedScope ?? null });

  let sessionId = null;
  try {
    sessionId = await runTestSuite(transport, ledger);
  } finally {
    const e2 = prepareE2Stub();
    const e1 = prepareE1Plan();
    for (const stub of [e1, e2]) {
      results.push({
        id: stub.id,
        description: stub.description,
        timestamp: new Date().toISOString(),
        expected: "n/a — nicht ausgeführt",
        actual: "n/a — nicht ausgeführt",
        pass: null,
        correlationId: CONFIG.runId,
      });
    }

    ledger.record({ kind: "run_end", sessionId, resultCount: results.length });
    try {
      transport.close();
    } catch {
      /* best effort */
    }

    const report = {
      runId: CONFIG.runId,
      generatedAt: new Date().toISOString(),
      attestationApprovedScope: preflight.attestation?.approvedScope ?? null,
      config: { ...CONFIG },
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
    console.log("HOLD bleibt in Kraft — dieser Lauf ist kein Freigabenachweis (E1/E2 nicht nachgewiesen).");

    if (failCount > 0) process.exitCode = 1;
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}

export { CONFIG, results, runTestSuite, ensureEvidenceDir, recordResult, prepareE1Plan, prepareE2Stub, runValidatorSelfTest };
