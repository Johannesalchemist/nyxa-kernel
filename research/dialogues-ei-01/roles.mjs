// Role separation for "Emergent Intelligence Through Human-AI Collaboration" (EI-01).
// A person/agent identity may hold at most one of the conflicting roles; identities are passport-bound:
// humans by the passkey principal (room-identity binding), agents by their attestation key_id.
export const ROLES = ["scorer_validator", "participant", "judge", "moderator", "analyst"];
const CONFLICTS = [["scorer_validator", "judge"], ["scorer_validator", "participant"], ["participant", "judge"], ["moderator", "judge"], ["analyst", "judge"]];
export function checkRoles(assignments) {
  const by = new Map(); const errs = [];
  for (const a of assignments) {
    if (!ROLES.includes(a.role)) errs.push(`unknown_role:${a.role}`);
    if (!/^(human:passkey:[a-z0-9-]+|agent:key:[A-Za-z0-9_-]+)$/.test(a.identity)) errs.push(`identity_not_passport_bound:${a.identity}`);
    if (a.identity.startsWith("human:") && !a.consentRef) errs.push(`no_consent:${a.identity}`);
    by.set(a.identity, [...(by.get(a.identity) ?? []), a.role]);
  }
  for (const [id, rs] of by) for (const [x, y] of CONFLICTS) if (rs.includes(x) && rs.includes(y)) errs.push(`role_conflict:${id}:${x}+${y}`);
  // Judges of human-produced and AI-produced outputs must include at least one human and one non-Claude judge.
  const judges = assignments.filter((a) => a.role === "judge");
  if (judges.length && !judges.some((j) => j.identity.startsWith("human:"))) errs.push("no_human_judge");
  if (judges.length && !judges.some((j) => j.lineage && j.lineage !== "claude")) errs.push("no_non_claude_judge");
  return { ok: errs.length === 0, errors: errs };
}
