// Preflight-Guard mit strukturierter Attestation.
//
// Korrektur gegenüber v1 (siehe handoffs/2026/11/2026-11-06_CLAUDE_BRIDGE_E2E_SCRIPT.md, Rework-Auftrag §6):
// BRIDGE_E2E_TARGET_ATTESTATION akzeptiert keine beliebige nichtleere Zeichenkette mehr. Erwartet wird ein
// JSON-Objekt (als Datei-Pfad über BRIDGE_E2E_TARGET_ATTESTATION_FILE, bevorzugt, oder als Inline-JSON-String
// über BRIDGE_E2E_TARGET_ATTESTATION) mit den sieben im Rework-Auftrag §6 genannten Nachweisfeldern.

import { readFileSync, existsSync } from "node:fs";

export const REQUIRED_ATTESTATION_FIELDS = {
  hostIdentity: "string", // z.B. "hostname=...; tailscale_ip=...; authorized_access_path=..."
  processIdentity: "string", // z.B. "pid=...; user=...; start_command=..."
  loadedRuntimePathAndHash: "string", // tatsächlich geladener Pfad + Code-/AuditLog-Hash, NICHT nur konfigurierter Pfad
  isolatedTestInstanceConfirmed: "boolean",
  separateAuditSinkConfirmed: "boolean",
  noConcurrentWritesConfirmed: "boolean",
  approvedScope: "string", // Referenz auf die konkrete Freigabe für genau diesen Testumfang
};

export function loadAttestation({ inlineJson, filePath }) {
  if (filePath) {
    if (!existsSync(filePath)) return { error: `attestation_file_not_found:${filePath}` };
    try {
      return { value: JSON.parse(readFileSync(filePath, "utf8")) };
    } catch (err) {
      return { error: `attestation_file_not_valid_json:${err.message}` };
    }
  }
  if (inlineJson) {
    try {
      return { value: JSON.parse(inlineJson) };
    } catch (err) {
      return { error: `attestation_inline_not_valid_json:${err.message}` };
    }
  }
  return { error: "attestation_missing" };
}

export function validateAttestation(attestation) {
  const problems = [];
  for (const [field, type] of Object.entries(REQUIRED_ATTESTATION_FIELDS)) {
    if (!(field in attestation)) {
      problems.push(`missing_field:${field}`);
      continue;
    }
    const value = attestation[field];
    if (type === "boolean" && typeof value !== "boolean") {
      problems.push(`wrong_type:${field}:expected_boolean`);
    } else if (type === "string" && (typeof value !== "string" || value.trim().length === 0)) {
      problems.push(`wrong_type_or_empty:${field}:expected_nonempty_string`);
    }
  }
  for (const boolField of ["isolatedTestInstanceConfirmed", "separateAuditSinkConfirmed", "noConcurrentWritesConfirmed"]) {
    if (attestation[boolField] === false) {
      problems.push(`attestation_explicitly_denies:${boolField}`);
    }
  }
  return problems;
}

export function runPreflightGuard(config) {
  const problems = [];

  if (!config.cmd && !config.endpoint) {
    problems.push(
      "Weder BRIDGE_E2E_CMD noch BRIDGE_E2E_ENDPOINT gesetzt. Ziel unbekannt -> Abbruch."
    );
  }
  if (config.cmd && config.endpoint) {
    problems.push("Sowohl BRIDGE_E2E_CMD als auch BRIDGE_E2E_ENDPOINT gesetzt. Genau einen Transport wählen.");
  }

  const loaded = loadAttestation({
    inlineJson: config.targetAttestationInline,
    filePath: config.targetAttestationFile,
  });
  if (loaded.error) {
    problems.push(`target_attestation_invalid:${loaded.error}`);
  } else {
    const attestationProblems = validateAttestation(loaded.value);
    if (attestationProblems.length > 0) {
      problems.push(...attestationProblems.map((p) => `target_attestation_invalid:${p}`));
    }
  }

  for (const protectedFragment of ["data/", "data-claude-bridge/", "data-tunnel/", "data-tunnel-v2/"]) {
    const haystack = `${config.cmd ?? ""} ${config.endpoint ?? ""} ${config.auditLogPath ?? ""}`;
    if (haystack.includes(protectedFragment)) {
      problems.push(`protected_path_fragment_in_config:${protectedFragment}`);
    }
  }

  if (config.enableE2 && !config.e2ApprovalRef) {
    problems.push(
      "BRIDGE_E2E_ENABLE_E2=true ohne BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF. E2 bleibt gesperrt."
    );
  }

  return { ok: problems.length === 0, problems, attestation: loaded.value ?? null };
}
