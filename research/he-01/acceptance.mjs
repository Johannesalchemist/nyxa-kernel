// HE-01 hard acceptance (self-determination, revocability, anti-manipulation, identity). Each criterion maps to
// executable tests; the pilot may start only if ALL pass. Exit 0 = ACCEPTED, 4 = REJECTED.
import { execFileSync } from "node:child_process"; import path from "node:path";
const R = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const EVO = "modules/sophia/evolution-assistant";
const CRITERIA = [
  { id: "SD1 goals only by the human", file: `${EVO}/evolutionAssistant.test.mjs`, name: "development model" },
  { id: "SD2 every action needs a human decision; governed effects need a grant", file: `${EVO}/evolutionCycle.test.mjs`, name: "positive path" },
  { id: "SD3 rejection effective, no bypass by re-proposal, 'never' permanent", file: `${EVO}/evolutionCycle.test.mjs`, name: "rejection is effective" },
  { id: "RV1 correction, revocation, deliberate non-action", file: `${EVO}/evolutionCycle.test.mjs`, name: "correction, revocation" },
  { id: "RV2 objection removes entries from use immediately", file: `${EVO}/evolutionAssistant.test.mjs`, name: "possibility navigator" },
  { id: "MP1 no pressure/scarcity/guilt/gamification language", file: `${EVO}/evolutionCycle.test.mjs`, name: "manipulation guard" },
  { id: "MP2 silence by default; initiative only when evidenced as welcome", file: `${EVO}/evolutionCycle.test.mjs`, name: "relationship evolution" },
  { id: "ID1 personal data only for the passkey-bound owner (no name auth, no cross-user)", file: `${EVO}/runtime/evolutionRuntime.e2e.test.mjs`, name: "HTTP e2e" },
  { id: "ID2 impersonation/replay/session-swap resistance", file: "modules/authority/room-identity/roomIdentity.test.mjs", name: "" },
];
const SELFTEST = process.env.HE01_SELFTEST === "1"; if (SELFTEST) CRITERIA.push({ id: "SELFTEST nonexistent", file: `${EVO}/evolutionCycle.test.mjs`, name: "zzz-no-such-test" });
const out = CRITERIA.map((c) => {
  try {
    const o = String(execFileSync(process.execPath, [...(c.name ? ["--test-name-pattern", c.name] : []), path.join(R, c.file)], { stdio: "pipe" }));
    const ran = Number((o.match(/^# pass (\d+)/m) ?? [])[1] ?? 0); // a pattern matching nothing must not count as acceptance
    return ran > 0 ? { ...c, pass: true, testsRun: ran } : { ...c, pass: false, detail: ["no_test_matched"] };
  }
  catch (e) { return { ...c, pass: false, detail: String(e.stdout).split("\n").filter((l) => /not ok|fail/.test(l)).slice(0, 3) }; }
});
const ok = out.every((c) => c.pass);
console.log(JSON.stringify({ he01_acceptance: ok ? "ACCEPTED" : "REJECTED", criteria: out.map(({ id, pass, testsRun, detail }) => ({ id, pass, testsRun, ...(detail ? { detail } : {}) })) }, null, 1));
process.exit(ok ? 0 : 4);
