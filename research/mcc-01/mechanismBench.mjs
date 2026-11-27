// MCC-01 MECHANISM benchmark (deterministic, no LLM): how well does each continuity mechanism deliver the right,
// current, safe context after session switches, compaction and agent switches? Agent-level MCC-01 (real agents
// acting on the recalled context) is pre-registered separately in criteria.json and NOT run here.
import fs from "node:fs";
import { captureEvent, consolidate, recallBundle, tokens } from "../../modules/cognition/continuity/continuity.mjs";
const CORPUS = process.argv[2] ?? new URL("./corpus.json", import.meta.url).pathname; const OUT = process.argv[3] ?? new URL("./result-mechanism-2026-11-27.json", import.meta.url).pathname;
const C = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const tok = (s) => new Set(String(s).toLowerCase().split(/[^\p{L}\p{N}_.-]+/u).filter((t) => t.length > 2));
const jac = (a, b) => { const A = tok(a), B = tok(b); const i = [...A].filter((x) => B.has(x)).length; return i / Math.max(1, A.size + B.size - i); };
const text = (e) => `${e.topic} ${e.content}`;
const topK = (items, q, k) => items.map((e) => ({ e, s: jac(q, text(e)) })).filter((x) => x.s > 0.05).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.e);

const conditions = {
  A_native: (probe) => { // per-agent memory, lost on agent switch; compaction keeps the agent's last 4 items
    const own = C.events.filter((e) => e.agent === probe.agent).slice(-4); const r = topK(own, probe.query, 5);
    return { retrieved: r.map((e) => e.id), tokens: tokens(r.map(text).join("\n")), stored: own.length, provenance: 0 }; },
  B_markdown_hooks: (probe) => { // shared append-only markdown loaded into context up to 2000 tokens (newest last, oldest cut)
    const lines = C.events.map((e) => ({ id: e.id, line: `- ${e.topic}: ${e.content}` })); let used = 0; const loaded = [];
    for (const l of [...lines].reverse()) { if (used + tokens(l.line) > 2000) break; loaded.push(l); used += tokens(l.line); }
    return { retrieved: loaded.map((l) => l.id), tokens: used, stored: lines.length, provenance: 0 }; },
  C_dedicated_store: (probe) => { const r = topK(C.events, probe.query, 5); // shared store, top-k, no trust/supersession/quarantine
    return { retrieved: r.map((e) => e.id), tokens: tokens(r.map(text).join("\n")), stored: C.events.length, provenance: 1 }; },
  D_nyxa_governed: (probe, ctx) => { const b = recallBundle(ctx.records, { query: probe.query, agent: probe.agent, tokenBudget: 600, k: 5 }); // action context only (unverified is separate, not counted as retrieved)
    return { retrieved: b.ids.map((id) => ctx.map.get(id)), tokens: b.tokens, stored: ctx.records.filter((r) => r.status === "active").length, provenance: 1 }; },
};
// D ingestion through the continuity adapter (same events, same order)
const recs = C.events.map((e) => ({ e, r: captureEvent({ agent: e.agent, session: e.session, event: "explicit_note", kind: e.kind, topic: e.topic, content: e.content, source: e.source, at: e.at }) }));
const cons = consolidate(recs.map((x) => x.r), { now: Date.parse("2026-11-27T19:00:00Z") });
const map = new Map(recs.map((x) => [x.r.id, x.e.id])); const ctx = { records: cons.records, map };

const res = {};
for (const [name, f] of Object.entries(conditions)) {
  const per = C.probes.map((p) => {
    const o = f(p, ctx); const R = new Set(o.retrieved); const rel = new Set(p.relevant);
    const hit = [...R].filter((x) => rel.has(x)).length;
    return { probe: p.id, precision: R.size ? hit / R.size : (rel.size ? 0 : 1), recall: rel.size ? hit / rel.size : 1,
      repeatRisk: (p.corrected ?? []).some((c) => !R.has(c)) ? 1 : 0,
      decisionLoss: p.current ? (!R.has(p.current) || (p.superseded ?? []).some((s) => R.has(s)) ? 1 : 0) : null,
      poisonExposed: C.events.filter((e) => e.poison && R.has(e.id)).length, tokens: o.tokens, stored: o.stored, provenance: o.provenance };
  });
  const avg = (k) => +(per.filter((x) => x[k] !== null).reduce((s, x) => s + x[k], 0) / per.filter((x) => x[k] !== null).length).toFixed(3);
  const sum = (k) => per.reduce((s, x) => s + x[k], 0);
  res[name] = { precision: avg("precision"), recall: avg("recall"), correctedErrorRepeatRisk: sum("repeatRisk"), decisionLoss: sum("decisionLoss"),
    poisonExposures: sum("poisonExposed"), meanContextTokens: Math.round(avg("tokens")), storedRecords: per[0].stored, provenance: per[0].provenance, perProbe: per };
}
const out = { schema: "nyxa-mcc01-mechanism-result-v1", date: "2026-11-27", tz: "Europe/Berlin", corpusEvents: C.events.length, probes: C.probes.length,
  dConsolidation: cons.log.reduce((m, l) => ((m[l.op] = (m[l.op] ?? 0) + 1), m), {}), results: res,
  caveats: ["mechanism-level only: no agent acts on the recalled context", "gold relevance by the authoring session (not independent)", "small corpus (20 events, 10 probes)", "keyword retrieval for A/C (no embeddings); B loads markdown wholesale"] };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("condition            prec  recall repeatRisk decLoss poison tokens stored prov");
for (const [n, r] of Object.entries(res)) console.log(n.padEnd(20), String(r.precision).padEnd(5), String(r.recall).padEnd(6), String(r.correctedErrorRepeatRisk).padEnd(10), String(r.decisionLoss).padEnd(7), String(r.poisonExposures).padEnd(6), String(r.meanContextTokens).padEnd(6), String(r.storedRecords).padEnd(6), r.provenance);
console.log("D consolidation:", JSON.stringify(out.dConsolidation));
