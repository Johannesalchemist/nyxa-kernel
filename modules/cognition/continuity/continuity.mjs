/**
 * NYXA Cross-Agent Cognitive Continuity — adapter layer (2026-11-27, Europe/Berlin). Owner: Johannes Suess.
 * Generated with Claude Code. Status: TESTED-IN-ISOLATION; not activated (see mandate M10).
 *
 * NOT a memory store. Lifecycle events from Claude Code / Codex hooks, Sophia's heartbeat and ChatGPT (via
 * the existing MCP) are normalised into structured records and persisted ONLY as proposals for the EXISTING
 * governed candidate store (memory:/candidate, nyxa_propose_action -> gamma -> candidate store). Recall uses the
 * existing read tool (nyxa_memory_recall_candidates). Patterns adopted from reference work (no code copied):
 * progressive disclosure (memsearch, claude-mem), lifecycle capture (claude-mem, Codex hooks), context
 * budget awareness (cc-context-awareness), retain/recall/reflect separation (Hindsight).
 */
import { createHash } from "node:crypto";

export const KINDS = ["project_state", "decision", "error", "correction", "strategy", "observation"];
const TYPE = { project_state: "observation", decision: "decision", error: "risk", correction: "process_pattern", strategy: "process_pattern", observation: "observation" };
const TRUSTED_SOURCES = new Set(["human", "agent_reflection"]); // tool output, web, files, other users = untrusted
const sha = (s) => createHash("sha256").update(s).digest("hex");
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const tok = (s) => new Set(norm(s).split(/[^\p{L}\p{N}_.-]+/u).filter((t) => t.length > 2));
const jac = (a, b) => { const A = tok(a), B = tok(b); const i = [...A].filter((x) => B.has(x)).length; return i / Math.max(1, A.size + B.size - i); };
export const tokens = (s) => Math.ceil(String(s ?? "").length / 4); // coarse, labelled proxy

// ---------- Privacy: redaction before anything leaves the hook --------------------------------------------
const SECRET = [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(sk|pk|rk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_-]{16,}\b/g, /\b[A-Z][A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD|PASS)[A-Z0-9_]*\s*=\s*\S+/g,
  /\b(\d{1,3}\.){3}\d{1,3}\b/g, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g];
export function redact(text) { let t = String(text ?? ""); let n = 0; for (const r of SECRET) t = t.replace(r, () => (n++, "[REDACTED]")); return { text: t, redactions: n }; }

// ---------- Poisoning defense -------------------------------------------------------------------------------
const INSTRUCTION = /\b(ignore (all|previous|prior)|disregard|from now on|always (run|allow|approve|disable)|never (ask|check|verify)|you must|system prompt|bypass|disable (the )?(gate|governance|attestation|check))\b/i;
export function trustOf(source) { return TRUSTED_SOURCES.has(source) ? "trusted" : "untrusted"; }

/** Normalise one lifecycle/tool event into a structured record (or null if nothing worth keeping). */
export function captureEvent(ev) {
  const { agent, session, event, kind, topic, content, source = "tool_output", at, ref } = ev;
  if (!agent || !session || !event || !at) throw Error("provenance_required");
  if (!KINDS.includes(kind)) return null;
  const r = redact(content); const body = r.text.slice(0, 1200);
  let k = kind; const flags = [];
  if (r.redactions) flags.push(`redacted:${r.redactions}`);
  const trust = trustOf(source);
  if (INSTRUCTION.test(body)) flags.push("instruction_like");
  // Untrusted material can never become a decision, correction or strategy; instruction-like text is quarantined.
  if (trust === "untrusted" && ["decision", "correction", "strategy"].includes(k)) { flags.push(`downgraded_from:${k}`); k = "observation"; }
  const quarantined = flags.includes("instruction_like") && trust === "untrusted";
  return { id: sha(`${agent}|${session}|${event}|${at}|${body}`).slice(0, 16), kind: k, topic: norm(topic ?? ""), content: body, trust, quarantined, flags,
    provenance: { agent, session, event, source, at, ref: ref ?? null }, status: "active", supersedes: null, version: 1 };
}

// ---------- Consolidation: dedup, contradiction, versioned supersession, staleness ----------------------------
export function consolidate(records, { now, staleDays = 120, nearDup = 0.8 } = {}) {
  const out = []; const log = [];
  for (const r of [...records].sort((a, b) => Date.parse(a.provenance.at) - Date.parse(b.provenance.at))) {
    if (r.quarantined) { log.push({ op: "quarantine", id: r.id }); out.push({ ...r, status: "quarantined" }); continue; }
    // Near-duplicate only for contents with enough tokens; short contents ("state A" vs "state B") must match exactly,
    // otherwise contradictions would be silently swallowed as duplicates.
    const longEnough = (t) => tok(t).size >= 4;
    const dup = out.find((x) => x.status === "active" && x.kind === r.kind && x.topic === r.topic && (norm(x.content) === norm(r.content) || (longEnough(x.content) && longEnough(r.content) && jac(x.content, r.content) >= nearDup)));
    if (dup) { dup.provenance.seenAlso = [...(dup.provenance.seenAlso ?? []), r.provenance]; log.push({ op: "dedup", id: r.id, into: dup.id }); continue; }
    // Same topic + decision/correction/project_state with different content = newer version supersedes older,
    // but only if the newer one is at least as trusted (an untrusted record cannot supersede a trusted one).
    const prev = out.find((x) => x.status === "active" && x.topic && x.topic === r.topic && x.kind === r.kind && ["decision", "correction", "project_state"].includes(r.kind));
    if (prev) {
      if (prev.trust === "trusted" && r.trust !== "trusted") { log.push({ op: "conflict_held", id: r.id, against: prev.id }); out.push({ ...r, status: "conflict_pending_review" }); continue; }
      prev.status = "superseded"; out.push({ ...r, supersedes: prev.id, version: prev.version + 1 }); log.push({ op: "supersede", id: r.id, old: prev.id }); continue;
    }
    out.push({ ...r });
  }
  for (const r of out) if (r.status === "active" && now && (now - Date.parse(r.provenance.at)) > staleDays * 86400e3 && r.kind === "project_state") { r.status = "stale"; log.push({ op: "stale", id: r.id }); }
  return { records: out, log };
}

// ---------- Recurring-error detection -> RSE regret (GUARD-inspired, source unverified) ----------------------
/** A new error that matches an error which already has an active correction = regression (HURT). */
export function recurringError(records, newError, { threshold = 0.5 } = {}) {
  const corr = records.filter((r) => r.status === "active" && r.kind === "correction");
  const hit = corr.map((c) => ({ c, s: Math.max(jac(c.topic, newError.topic ?? ""), jac(c.content, newError.content)) })).filter((x) => x.s >= threshold).sort((a, b) => b.s - a.s)[0];
  return hit ? { regression: true, correctionId: hit.c.id, similarity: +hit.s.toFixed(2), regret: { task: newError.topic, context: newError.topic, baseline: true, candidate: false } } : { regression: false };
}

// ---------- Recall with progressive disclosure under a token budget ------------------------------------------
export function recallBundle(records, { query, agent, tokenBudget = 600, k = 8, minRelevance = 0.08 }) {
  const usable = records.filter((r) => r.status === "active" && !r.quarantined);
  // Relevance first: bonuses only break ties among items that are already relevant (fix after MCC-01 mechanism run v1,
  // where unconditional bonuses filled the list with unrelated corrections and crowded out a current decision).
  const scored = usable.map((r) => { const base = jac(query, `${r.topic} ${r.content}`);
      return { r, base, s: base + (base >= minRelevance ? (r.kind === "correction" ? 0.02 : 0) + (r.trust === "trusted" ? 0.01 : 0) : 0) }; })
    .filter((x) => x.base >= minRelevance).sort((a, b) => b.s - a.s).slice(0, k);
  const lines = []; let used = 0;
  for (const { r } of scored) {
    const line = `[${r.kind}${r.trust === "untrusted" ? ", unverified" : ""}] ${r.topic}: ${r.content.slice(0, 160)} (src ${r.provenance.agent}/${r.provenance.event}@${r.provenance.at.slice(0, 10)}, id ${r.id})`;
    if (used + tokens(line) > tokenBudget) break; lines.push(line); used += tokens(line);
  }
  return { forAgent: agent, ids: scored.slice(0, lines.length).map((x) => x.r.id), text: lines.join("\n"), tokens: used, note: "expand by id via nyxa_memory_recall_candidates" };
}

// ---------- Persistence through the EXISTING governed path only ---------------------------------------------
export function toCandidateProposal(r, { actor, taskId, runId }) {
  if (r.status === "quarantined") throw Error("quarantined_not_persisted");
  return { actor, action: "nyxa_memory_store_candidate", target: "memory:/candidate", scope: "memory:/",
    claims: [{ tag: r.trust === "trusted" ? "MEMORY" : "EXTERNAL_EVIDENCE", statement: `${r.kind}: ${r.topic}`.slice(0, 300), source: `${r.provenance.agent}:${r.provenance.session}:${r.provenance.event}`, asOf: r.provenance.at }],
    uncertainty: r.trust === "trusted" ? 0.3 : 0.7, requestedCapabilityClass: "I1", estimatedIrreversibility: "I1", provenance: { taskId, runId, requestingIdentity: actor },
    payload: { content: `${r.topic} :: ${r.content}${r.supersedes ? ` (supersedes ${r.supersedes})` : ""}`.slice(0, 4000), candidate_type: TYPE[r.kind], source: "agent", scope: "project",
      purpose: `continuity:${r.kind}:${r.provenance.agent}`.slice(0, 500), confidence: r.trust === "trusted" ? 0.7 : 0.4, importance: r.kind === "correction" || r.kind === "decision" ? 0.7 : 0.4 } };
}

// ---------- CLAUDE.md / AGENTS.md as navigation, not as memory -----------------------------------------------
export function lintRuleFile(text, { maxLines = 200, maxBytes = 12000 } = {}) {
  const lines = String(text).split("\n"); const issues = [];
  if (lines.length > maxLines) issues.push(`too_long:${lines.length}>${maxLines}`);
  if (Buffer.byteLength(text) > maxBytes) issues.push(`too_large:${Buffer.byteLength(text)}>${maxBytes}`);
  const dated = lines.filter((l) => /\b20\d\d-\d\d-\d\d\b/.test(l)).length; if (dated > 5) issues.push(`dated_log_entries:${dated}`);
  const memo = lines.filter((l) => /\b(remember that|note to self|last session|we decided|today we)\b/i.test(l)).length; if (memo) issues.push(`memory_like_lines:${memo}`);
  return { ok: issues.length === 0, lines: lines.length, bytes: Buffer.byteLength(text), issues };
}
