#!/usr/bin/env node
/**
 * One lifecycle adapter for Claude Code and Codex hooks (stdin JSON). Writes structured, redacted records to
 * a LOCAL OUTBOX (0700 dir, not a memory store); the outbox is flushed only through the governed path
 * (continuity-cli flush -> proposals -> nyxa_propose_action). Never blocks the agent (always exit 0).
 *   SessionStart              -> prints a bounded recall bundle from the last governed recall snapshot
 *   PreCompact / SessionEnd    -> records project state (git branch/HEAD/changed files) before context is lost
 *   PostToolUse (failure)      -> records the error (untrusted tool output, redacted)
 * Field names: Claude Code hook input (hook_event_name, session_id, tool_name, tool_response, cwd, source);
 * Codex payloads are mapped by the same names where present (Codex field names: UNVERIFIED in this session).
 */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
import { captureEvent, recallBundle } from "../continuity.mjs";
const agent = process.argv[2] ?? "claude-code";
const DIR = process.env.NYXA_CONTINUITY_DIR ?? path.join(process.env.HOME ?? "/tmp", ".nyxa-continuity");
const out = (o) => { process.stdout.write(typeof o === "string" ? o : JSON.stringify(o)); };
try {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  const event = input.hook_event_name ?? input.event ?? "unknown"; const session = input.session_id ?? input.sessionId ?? "unknown";
  const at = new Date().toISOString(); const append = (r) => r && fs.appendFileSync(path.join(DIR, "outbox.jsonl"), JSON.stringify(r) + "\n", { mode: 0o600 });
  if (event === "SessionStart") {
    const cache = path.join(DIR, "recall-snapshot.json");
    const recs = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, "utf8")).records : [];
    const b = recallBundle(recs, { query: `${path.basename(input.cwd ?? process.cwd())} ${input.source ?? ""}`, agent, tokenBudget: Number(process.env.NYXA_CONTINUITY_BUDGET ?? 600) });
    const ctx = b.text ? `NYXA continuity (governed, provenance-tagged; unverified items marked):\n${b.text}` : "";
    out(agent === "claude-code" ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } } : ctx);
  } else if (event === "PreCompact" || event === "SessionEnd" || event === "PostCompact") {
    const git = (a) => { try { return execFileSync("git", a, { cwd: input.cwd ?? process.cwd(), encoding: "utf8", timeout: 3000 }).trim(); } catch { return ""; } };
    const state = `branch ${git(["rev-parse", "--abbrev-ref", "HEAD"])} head ${git(["rev-parse", "--short", "HEAD"])} changed ${git(["status", "--porcelain"]).split("\n").filter(Boolean).length} files`;
    append(captureEvent({ agent, session, event, kind: "project_state", topic: `project ${path.basename(input.cwd ?? process.cwd())}`, content: state, source: "repo_state", at }));
  } else if (event === "PostToolUse") {
    const resp = input.tool_response ?? {}; const failed = resp.is_error || resp.exit_code > 0 || resp.interrupted || /\b(error|failed|exception)\b/i.test(String(resp.stderr ?? ""));
    if (failed) { const cmd = String(input.tool_input?.command ?? input.tool_name ?? "tool").split(/\s+/).slice(0, 2).join(" ");
      append(captureEvent({ agent, session, event, kind: "error", topic: cmd, content: String(resp.stderr ?? resp.error ?? JSON.stringify(resp)).slice(0, 800), source: "tool_output", at })); }
  }
} catch (e) { try { fs.appendFileSync(path.join(DIR, "hook-errors.log"), `${new Date().toISOString()} ${String(e.message).slice(0, 200)}\n`, { mode: 0o600 }); } catch {} }
process.exit(0);
