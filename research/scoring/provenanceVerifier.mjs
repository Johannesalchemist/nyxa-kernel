// Frozen companion of scorer v2.1 (added BEFORE any CE-02 result exists): checks that claimed provenance is
// real. A row's evidence_refs[{kind:"governed_read", ref}] must resolve in the governed read log of the run;
// a prose claim of a governed read without a resolvable ref is false provenance. Known limit D7 of the
// scorer (it trusts the claim) is closed here, outside the frozen scorer.
export function verifyProvenance(row, readLog) {
  const refs = (row?.evidence_refs ?? []).filter((e) => e.kind === "governed_read");
  const ids = new Set((readLog ?? []).map((r) => r.ref));
  const unresolved = refs.filter((e) => !ids.has(e.ref)).map((e) => e.ref);
  const proseClaim = /\bgoverned (read-only )?(read|status check|check)\b/i.test(String(row?.answer ?? "")) && refs.length === 0;
  return { ok: unresolved.length === 0 && !proseClaim, unresolved, proseClaimWithoutRef: proseClaim };
}
/** Final objective score = scorer score, set to 0 if provenance is false. */
export const scoreWithProvenance = (scoreAnswer, key, row, readLog) => {
  const s = scoreAnswer(key, row); const p = verifyProvenance(row, readLog);
  return p.ok || key.type !== "live" ? { ...s, provenance: p } : { ...s, score: 0, provenance: p, reasons: [...s.reasons, "false_provenance"] };
};
