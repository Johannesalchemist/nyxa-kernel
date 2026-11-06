// Audit-Hashketten-Nachrechnung mit Content-Integritätsprüfung.
//
// WICHTIG (Herkunft/Scope-Hinweis gemäß AGENTS.md "Bestehende Commandlets ... vor Inline-Workarounds"):
// Die exakte kanonische Serialisierung und Genesis-Konstante der realen Ziel-Implementierung
// (`/opt/nyxa-governed-memory-mcp-runtime/.../AuditLog.js` bzw. `.../dev/.../AuditLog.js`) ist aus dieser
// Entwicklungssession heraus NICHT gelesen worden (kein Dateizugriff auf Server B). Die hier verwendete
// `defaultCanonicalSerialize` ist daher eine DOKUMENTIERTE ANNAHME, keine verifizierte Reimplementierung.
//
// Ein Content-Hash-Vergleich gegen die reale Implementierung ist nur gültig, wenn die reale Hash-Funktion
// selbst wiederverwendet wird. Dafür existiert `loadRealHashFn()`: sie importiert optional ein Modul am
// Zielsystem (Pfad über BRIDGE_E2E_AUDITLOG_MODULE_PATH), das eine Funktion exportiert, die exakt die
// Produktions-/Dev-Logik abbildet. Ohne diesen Pfad bewertet `recomputeAuditChain` NUR Verkettungs-Konsistenz
// (previous_event_hash-Kette) und markiert Content-Integrität explizit als `unverified_unknown_serialization`.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const GENESIS_ANCHOR = "0".repeat(64);

export function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

// Dokumentierte Annahme, nicht verifiziert. Sortierte Schlüssel, event_hash selbst ausgeschlossen.
export function defaultCanonicalSerialize(record) {
  const { event_hash, ...rest } = record;
  const sortedKeys = Object.keys(rest).sort();
  const sorted = {};
  for (const k of sortedKeys) sorted[k] = rest[k];
  return JSON.stringify(sorted);
}

export async function loadRealHashFn(modulePath) {
  if (!modulePath) return null;
  if (!existsSync(modulePath)) {
    return { error: `module_path_not_found:${modulePath}` };
  }
  try {
    const mod = await import(pathToFileURL(modulePath).href);
    const fn = mod.computeEventHash ?? mod.default?.computeEventHash ?? null;
    if (typeof fn !== "function") {
      return { error: "module_does_not_export_computeEventHash" };
    }
    return { fn };
  } catch (err) {
    return { error: `module_import_failed:${err.message}` };
  }
}

/**
 * Rekonstruiert die Kette und prüft:
 *  - jede Zeile ist parsebares JSON (sonst: corrupted_line),
 *  - event_hash und previous_event_hash sind vorhanden (sonst: missing_hash_field),
 *  - previous_event_hash == Hash des Vorgängers (sonst: previous_hash_mismatch),
 *  - erster Eintrag referenziert den Genesis-Anker (sonst: missing_genesis_anchor),
 *  - mindestens ein Eintrag vorhanden ist (sonst: empty_or_unexpected_chain_end),
 *  - optional: event_hash selbst ist über realHashFn (falls geladen) reproduzierbar
 *    (sonst: content_hash_mismatch). Ohne realHashFn: contentIntegrity = "unverified_unknown_serialization".
 */
export function recomputeAuditChain(logPath, { realHashFn = null, genesisAnchor = GENESIS_ANCHOR } = {}) {
  if (!logPath || !existsSync(logPath)) {
    return { valid: false, reason: "audit_log_path_missing_or_unreadable", checked: 0 };
  }
  const lines = readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { valid: false, reason: "empty_or_unexpected_chain_end", checked: 0 };
  }

  let previousHash = null;
  let checked = 0;
  let contentIntegrity = realHashFn ? "verified" : "unverified_unknown_serialization";

  for (const [idx, line] of lines.entries()) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return { valid: false, reason: "corrupted_line", lineIndex: idx, checked, contentIntegrity };
    }
    if (!record.event_hash || !record.previous_event_hash) {
      return { valid: false, reason: "missing_hash_field", lineIndex: idx, checked, contentIntegrity };
    }
    const expectedPrev = previousHash === null ? genesisAnchor : previousHash;
    if (record.previous_event_hash !== expectedPrev) {
      return {
        valid: false,
        reason: idx === 0 ? "missing_genesis_anchor" : "previous_hash_mismatch",
        lineIndex: idx,
        checked,
        contentIntegrity,
      };
    }
    if (realHashFn) {
      const recomputed = realHashFn(record, expectedPrev);
      if (recomputed !== record.event_hash) {
        return { valid: false, reason: "content_hash_mismatch", lineIndex: idx, checked, contentIntegrity };
      }
    }
    previousHash = record.event_hash;
    checked++;
  }

  return { valid: true, checked, lastHash: previousHash, contentIntegrity };
}
