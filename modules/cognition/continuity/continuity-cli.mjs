#!/usr/bin/env node
// note  --kind decision|correction|strategy|observation --topic T --content C --source human|agent_reflection|tool_output --agent A --session S
// flush --actor A --task T --run R   -> prints governed proposals (submit via nyxa_propose_action); outbox is rotated, not deleted
// snapshot <recall.json>             -> stores the last governed recall result as the SessionStart cache
import fs from "node:fs"; import path from "node:path";
import { captureEvent, consolidate, toCandidateProposal } from "./continuity.mjs";
const DIR = process.env.NYXA_CONTINUITY_DIR ?? path.join(process.env.HOME ?? "/tmp", ".nyxa-continuity"); fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const a = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const cmd = process.argv[2]; const OB = path.join(DIR, "outbox.jsonl");
if (cmd === "note") { const r = captureEvent({ agent: a("agent") ?? "claude-code", session: a("session") ?? "cli", event: "explicit_note", kind: a("kind"), topic: a("topic"), content: a("content"), source: a("source") ?? "agent_reflection", at: new Date().toISOString() });
  if (r) fs.appendFileSync(OB, JSON.stringify(r) + "\n", { mode: 0o600 }); console.log(JSON.stringify(r)); }
else if (cmd === "flush") { const recs = fs.existsSync(OB) ? fs.readFileSync(OB, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  const c = consolidate(recs, { now: Date.now() }); const props = c.records.filter((r) => r.status === "active").map((r) => toCandidateProposal(r, { actor: a("actor") ?? "claude-code", taskId: a("task") ?? "continuity", runId: a("run") ?? new Date().toISOString() }));
  if (recs.length) fs.renameSync(OB, path.join(DIR, `outbox.flushed-${Date.now()}.jsonl`));
  console.log(JSON.stringify({ proposals: props, consolidation: c.log }, null, 1)); }
else if (cmd === "snapshot") { const src = JSON.parse(fs.readFileSync(process.argv[3], "utf8")); fs.writeFileSync(path.join(DIR, "recall-snapshot.json"), JSON.stringify({ at: new Date().toISOString(), records: src.records ?? [] }), { mode: 0o600 }); console.log("ok"); }
else console.log("usage: note|flush|snapshot");
