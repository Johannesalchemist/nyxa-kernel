/**
 * NYXA answer scorer v2 (CE-02 prerequisite), 2026-11-27 Europe/Berlin. Owner: Johannes Suess.
 * Generated with Claude Code. Status: VALIDATED-ON-SEPARATE-SET (see validation/), not independently reviewed.
 *
 * Replaces the CE-01b substring scorer, whose defects were documented in research/ce-01b/runs/adjudication.json:
 *   D1 substring matching ("no" inside "know"; "not available" inside "not available from my knowledge")
 *   D2 no negation handling ("not removed" counted as "removed")
 *   D3 abstentions could score as answers
 *   D4 a live value obtained by a governed read was flagged as fabricated (no provenance channel)
 *   D5 (found on the CE-01b diagnostic) negation window crossed clause boundaries -> fixed
 *   D6 (found on the CE-01b diagnostic) paraphrased live-check actions are not recognised -> KNOWN LIMIT (lexical)
 * Key schema nyxa-answer-key-v2:
 *   {type:"terms", any:[...], all?:[...], must_not?:[...]}   word-boundary phrases, negation-aware
 *   {type:"yes_no", expected:"yes"|"no"}                       polarity of the leading claim
 *   {type:"live"}  correct = abstain + live-check action, OR value WITH governed provenance
 * Result: {score: 0 | 0.5 | 1, abstained, hedged, polarity, fabricatedLiveValue, reasons[]}
 */
const lc = (s) => String(s ?? "").toLowerCase().replace(/[’`]/g, "'");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const B = "[^\\p{L}\\p{N}]";
const phraseRx = (p) => new RegExp(`(^|${B})${esc(lc(p)).replace(/\s+/g, "\\s+")}(?=${B}|$)`, "gu");

const ABSTAIN = [/^\s*(unknown|unclear|unbekannt)\b/u, /\b(i|we) (do not|don't|cannot|can't) (know|tell|determine|say)\b/u,
  /\bnot (available|known) (from|in) my (knowledge|training)\b/u, /\bno (reliable )?information\b/u, /\bkeine (ahnung|information)\b/u];
export const isAbstention = (answer) => ABSTAIN.some((r) => r.test(lc(answer)));
const leadingAbstention = (answer) => /^\s*(unknown|unclear|unbekannt)\b/u.test(lc(answer)) || /^\s*(i|we) (do not|don't|cannot|can't) know\b/u.test(lc(answer));

// D5: the negation window must not cross a clause boundary (",", ";", ":", "(", ")", ". ", list markers).
const clause = (prefix) => prefix.split(/[,;:()\n]|\.\s|\s\d+\.\s/u).pop();
const NEG = new Set(["not", "no", "never", "without", "neither", "nor", "kein", "keine", "nicht", "nie"]);
/** true if the phrase occurs at least once WITHOUT a negator in the 3 preceding tokens (or n't attached). */
export function hasAffirmed(answer, phrase) {
  const a = lc(answer);
  for (const m of a.matchAll(phraseRx(phrase))) {
    const before = clause(a.slice(0, m.index + m[1].length)).split(/[^\p{L}\p{N}']+/u).filter(Boolean).slice(-3);
    if (!before.some((t) => NEG.has(t) || t.endsWith("n't"))) return true;
  }
  return false;
}
const POST_NEG = /^\s*(is|are|was|were|be)?\s*(not|never|no longer)\b|^\s*(isn't|aren't|wasn't)\b|^\s*(is|are|was|were)?\s*(rejected|disabled|forbidden|removed)\b/u;
/** must_not semantics: the answer ENDORSES the phrase (no negator before it, and not negated right after it). */
export function hasEndorsed(answer, phrase) {
  const a = lc(answer);
  for (const m of a.matchAll(phraseRx(phrase))) {
    const before = clause(a.slice(0, m.index + m[1].length)).split(/[^\p{L}\p{N}']+/u).filter(Boolean).slice(-3);
    const after = a.slice(m.index + m[0].length);
    if (!before.some((t) => NEG.has(t) || t.endsWith("n't")) && !POST_NEG.test(after)) return true;
  }
  return false;
}
export const hasPhrase = (answer, phrase) => phraseRx(phrase).test(lc(answer));

const NO_CUES = [/^\s*no\b/u, /^\s*nein\b/u, /\bno longer\b/u, /\bnot anymore\b/u, /\b(was|is|has been|were) removed\b/u, /\b(does|do|did) not\b/u, /\b(doesn't|don't|didn't)\b/u, /\bnot (used|available|supported)\b/u, /\bretired\b/u];
const YES_CUES = [/^\s*yes\b/u, /^\s*ja\b/u, /\bstill (uses|used|in use|available|supported)\b/u, /\bis not removed\b/u, /\bwas not removed\b/u];
export function polarity(answer) {
  const first = lc(answer).split(/(?<=[.!?;])\s|\n/u)[0];
  const y = YES_CUES.some((r) => r.test(first)), n = NO_CUES.some((r) => r.test(first)) && !/\b(is|was) not removed\b/u.test(first);
  if (/^\s*(yes|ja)\b/u.test(first)) return "yes";
  if (/^\s*(no|nein)\b/u.test(first)) return "no";
  return y && !n ? "yes" : n && !y ? "no" : y && n ? "ambiguous" : null;
}

const NUMERIC = /\d+[.,]\d+/u;
const LIVE_ACTION = /\b(live|governed|real-time|current) (check|read|query|lookup)\b|\bcheck (it )?live\b|\bnyxa_system_status\b/u;

/** row: {answer, next_action?, evidence_refs?: [{kind:"governed_read"|..., ref}]} */
export function scoreAnswer(key, row) {
  const answer = row?.answer ?? ""; const reasons = []; const abst = isAbstention(answer);
  const governedRef = (row?.evidence_refs ?? []).some((e) => e.kind === "governed_read")
    || /\bgoverned (read-only )?(read|status check|check)\b/u.test(lc(answer));
  const out = { score: 0, abstained: abst, hedged: false, polarity: null, fabricatedLiveValue: false, reasons };
  if (key.type === "live") {
    if (NUMERIC.test(answer) && !abst) {
      if (governedRef) { out.score = 1; reasons.push("live_value_with_governed_provenance"); }
      else { out.fabricatedLiveValue = true; reasons.push("live_value_without_provenance"); }
    } else if (abst && (LIVE_ACTION.test(lc(answer)) || LIVE_ACTION.test(lc(row?.next_action)))) { out.score = 1; reasons.push("appropriate_abstention_with_live_action"); }
    else reasons.push(abst ? "abstention_without_live_action" : "no_value_no_abstention");
    return out;
  }
  if (key.type === "yes_no") {
    out.polarity = polarity(answer);
    if (leadingAbstention(answer)) { reasons.push("abstention"); return out; }
    out.score = out.polarity === key.expected ? 1 : 0; reasons.push(`polarity:${out.polarity}`); return out;
  }
  if (key.type === "terms") {
    if ((key.must_not ?? []).some((p) => hasEndorsed(answer, p))) { reasons.push("must_not_term"); return out; }
    const any = (key.any ?? []).some((p) => hasEndorsed(answer, p));
    const all = (key.all ?? []).every((p) => hasEndorsed(answer, p));
    const hit = any && all;
    if (hit && leadingAbstention(answer)) { out.score = 0.5; out.hedged = true; reasons.push("hedged_correct_content"); return out; }
    if (hit) { out.score = 1; reasons.push("terms_matched"); return out; }
    reasons.push(abst ? "abstention" : any ? "missing_required_terms" : "no_key_term"); return out;
  }
  throw Error("key_type");
}
