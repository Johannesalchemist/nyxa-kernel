#!/usr/bin/env node
// Lokaler Selbsttest (Phase C): führt die Testsuite T01–T10 gegen MockTransport aus — ein echter, lokal
// beobachtbarer Lauf mit realer Genesis-verankerter Audit-Hashkette, OHNE jede Verbindung zu Server B oder
// einer echten Bridge. Dient dem Nachweis, dass der Testharness selbst korrekt arbeitet, bevor er gegen eine
// isolierte reale Instanz läuft (Rework-Auftrag Phase C: "Mock-MCP-Transporttests").
//
// Aufruf: node lib/selftest.mjs

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MockTransport } from "./transport.mjs";
import { GENESIS_ANCHOR, defaultCanonicalSerialize, sha256Hex } from "./audit_chain.mjs";
import { CONFIG, results, runTestSuite, ensureEvidenceDir } from "../bridge_e2e_test.mjs";

globalThis.__auditChainHelpers = { GENESIS_ANCHOR, defaultCanonicalSerialize, sha256Hex };

CONFIG.evidenceDir = process.env.BRIDGE_E2E_SELFTEST_EVIDENCE_DIR ?? "./bridge-e2e-evidence/selftest";
CONFIG.auditLogPath = join(CONFIG.evidenceDir, "mock-audit.log");
CONFIG.runId = `bridge-e2e-selftest:${Date.now()}`;
ensureEvidenceDir();
writeFileSync(CONFIG.auditLogPath, "", "utf8");

let prevHash = GENESIS_ANCHOR;
function appendAudit(event) {
  const base = { ...event, ts: new Date().toISOString(), previous_event_hash: prevHash };
  const event_hash = sha256Hex(defaultCanonicalSerialize({ ...base, event_hash: undefined }));
  const record = { ...base, event_hash };
  const existing = existsSync(CONFIG.auditLogPath) ? readFileSync(CONFIG.auditLogPath, "utf8") : "";
  writeFileSync(CONFIG.auditLogPath, existing + JSON.stringify(record) + "\n", "utf8");
  prevHash = event_hash;
}

async function main() {
  const transport = new MockTransport({ onAuditAppend: appendAudit });
  const ledger = { record: () => {} };
  await runTestSuite(transport, ledger);

  const summary = {
    pass: results.filter((r) => r.pass === true).length,
    fail: results.filter((r) => r.pass === false).length,
    unjudged: results.filter((r) => r.pass === null).length,
    byId: results.map((r) => ({ id: r.id, pass: r.pass })),
  };
  const reportPath = join(CONFIG.evidenceDir, "selftest-report.json");
  writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2), "utf8");

  console.log("\n--- Selftest Summary (MockTransport, keine echte Bridge) ---");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Bericht: ${reportPath}`);
  console.log(`Mock-Audit-Log: ${CONFIG.auditLogPath}`);

  if (summary.fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("SELFTEST FATAL:", err);
  process.exit(1);
});
