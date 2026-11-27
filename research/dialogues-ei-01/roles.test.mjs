import test from "node:test"; import assert from "node:assert/strict"; import { checkRoles } from "./roles.mjs";
const H = (id, role, extra = {}) => ({ identity: `human:passkey:${id}`, role, consentRef: `consent-${id}`, lineage: "human", ...extra });
test("separation of scorer validation and experiment; passport binding; consent; judge mix", () => {
  assert.equal(checkRoles([H("v1", "scorer_validator"), H("p1", "participant"), H("j1", "judge"), { identity: "agent:key:judge-x", role: "judge", lineage: "other-family" }, H("m1", "moderator")]).ok, true);
  assert.ok(checkRoles([H("v1", "scorer_validator"), H("v1", "judge")]).errors.includes("role_conflict:human:passkey:v1:scorer_validator+judge"));
  assert.ok(checkRoles([H("p1", "participant"), H("p1", "judge")]).errors.some((e) => e.includes("participant+judge")));
  assert.ok(checkRoles([{ identity: "Johannes", role: "participant" }]).errors.includes("identity_not_passport_bound:Johannes"));
  assert.ok(checkRoles([{ identity: "human:passkey:p2", role: "participant" }]).errors.includes("no_consent:human:passkey:p2"));
  assert.ok(checkRoles([{ identity: "agent:key:c1", role: "judge", lineage: "claude" }]).errors.includes("no_human_judge"));
});
