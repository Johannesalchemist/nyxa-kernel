#!/usr/bin/env node
/**
 * Evolution heartbeat step for the EXISTING Sophia timer (sophia-research-feed, runs as jo, sandboxed:
 * /home read-only, only the Room console API dir writable). No own timer, no own memory:
 *   reads   <state>/<principal>.json (0600, read-only here) and <state>/rse-events.json
 *   writes  <out>/sophia-evolution-heartbeat.json  (latest projection: outcomes only, no personal statements)
 *           <out>/sophia-evolution-events.jsonl    (append-only runtime events: outcome, reasons, no content)
 *           <out>/candidate-outbox.jsonl           (only when a message is prepared; for the governed candidate path)
 * Never contacts anyone, never throws to the caller (exit 0 with {ok:false} on error).
 */
import fs from "node:fs"; import path from "node:path";
import { heartbeatJob } from "./evolutionRuntime.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const state = arg("state"), out = arg("out"), participants = (arg("participants", "nyxa-owner")).split(",");
const nowIso = new Date().toISOString();
try {
  if (!state || !out) throw Error("usage: --state <dir> --out <dir> [--participants a,b]");
  fs.mkdirSync(out, { recursive: true, mode: 0o750 });
  const store = {
    load: async (p) => { const f = path.join(state, `${p}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined; },
    save: async () => { throw Error("read_only_state"); },
    submitCandidate: async (c) => fs.appendFileSync(path.join(out, "candidate-outbox.jsonl"), JSON.stringify({ at: nowIso, ...c }) + "\n", { mode: 0o640 }),
  };
  const results = await heartbeatJob({ store, participants });
  const rseFile = path.join(state, "rse-events.json");
  const rse = fs.existsSync(rseFile) ? JSON.parse(fs.readFileSync(rseFile, "utf8")).events.map((e) => ({ id: e.id, what: e.what,
    outcome: Object.fromEntries(["GAIN", "HURT", "RETAIN", "GAP", "UNKNOWN"].map((k) => [k, e.profile.overall[k]])), recommendation: e.decision.recommendation, activateIn: e.decision.activateIn })) : [];
  const projection = { schema: "nyxa-sophia-evolution-heartbeat-v1", at: nowIso, results, learningEvents: rse, externalActions: [] };
  const tmp = path.join(out, `.hb-${process.pid}.tmp`); fs.writeFileSync(tmp, JSON.stringify(projection, null, 1), { mode: 0o640 }); fs.renameSync(tmp, path.join(out, "sophia-evolution-heartbeat.json"));
  for (const r of results) fs.appendFileSync(path.join(out, "sophia-evolution-events.jsonl"), JSON.stringify({ at: nowIso, kind: "heartbeat", participant: r.participant, outcome: r.outcome, calibration: r.calibration, externalActions: r.externalActions }) + "\n", { mode: 0o640 });
  console.log(JSON.stringify({ ok: true, at: nowIso, outcomes: results.map((r) => r.outcome), learningEvents: rse.length }));
} catch (e) { console.log(JSON.stringify({ ok: false, at: nowIso, error: String(e.message).slice(0, 200) })); }
