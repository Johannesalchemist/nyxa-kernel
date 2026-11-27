#!/usr/bin/env python3
"""WP1 (Continuation R2): wire Agent Attestation V1 into the governed backend dist/server.js.

Exact-anchor patcher in the style of release-v2/build.py: every anchor must match exactly the
expected number of times, otherwise nothing is written (fail closed). Input is the Authority V2
candidate build output (v2-verify.../out/dist/server.js); output is a new file.
Usage: patch_attestation.py <in server.js> <out server.js>
"""
import hashlib, re, sys

GATE = '''        const rawProposal = input["proposal"];
        // WP1 Agent Attestation V1: backend-side, before parsing, for every caller and path
        // (nyxa_propose_action, toolbox effect capabilities, bridge or direct backend start).
        {
            const { gateProposal } = await import("../authority/actorAttestationGate.mjs");
            const attestationGate = await gateProposal(rawProposal, input["attestation"]);
            if (!attestationGate.ok) {
                await this.auditGovernance("blocked", undefined, "DENIED", started, "ATTESTATION:" + attestationGate.reason, safeResource("nyxa_propose_action", input));
                return toolJsonResult({ policy_decision: "DENY", domain: "ATTESTATION", reason: attestationGate.reason }, true);
            }
        }'''

EDITS = [
    ('handleProposeAction keys',
     '    async handleProposeAction(input) {\n        assertKeys(input, ["proposal"]);',
     '    async handleProposeAction(input) {\n        assertKeys(input, ["proposal", "attestation"]);', 1),
    ('handleProposeAction gate', '        const rawProposal = input["proposal"];', GATE, 1),
    ('toolbox effect keys', 'assertKeys(args, ["proposal"]);', 'assertKeys(args, ["proposal", "attestation"]);', 1),
    ('toolbox effect forward', 'return await this.handleProposeAction({ proposal: rawProposal });',
     'return await this.handleProposeAction({ proposal: rawProposal, ...(args.attestation !== undefined ? { attestation: args.attestation } : {}) });', 1),
]
# R3: direct write tools outside the proposal path. Exact anchors from the V2 dispatcher:
#   if (name === "<tool>") {\n  assertKeys(input, [...]);\n  return await this.<handler>(input);
TOOL_RX = re.compile(r'(            if \(name === "(nyxa_mandate_issue|nyxa_mandate_derive|nyxa_mandate_revoke|nyxa_human_grant_issue)"\) \{\n)'
                     r'(                assertKeys\()input(, \[[^\]]*\]\);\n)'
                     r'(                return await this\.\w+\()input(\);)')
TOOL_REPL = (r'\1                const __att = await (await import("../authority/actorAttestationGate.mjs")).gateDirectTool(name, input);\n'
             r'                if (!__att.ok) return toolJsonResult({ policy_decision: "DENY", domain: "ATTESTATION", reason: __att.reason, tool: name }, true);\n'
             r'\3__att.args\4\5__att.args\6')
DIRECT = (re.compile(r'if \(process\.env\.NYXA_DEVELOPMENT_ACTOR\)(\s+throw new ConnectorError\("development_mandate_proposal_required")'),
          r'if (process.env.NYXA_DEVELOPMENT_ACTOR || process.env.NYXA_ACTOR_ATTESTATION_MODE === "required")\1', 1)

def main(src, dst):
    text = open(src, encoding="utf-8").read()
    print("input sha256", hashlib.sha256(text.encode()).hexdigest())
    for name, old, new, count in EDITS:
        n = text.count(old)
        if n != count:
            sys.exit(f"HOLD: anchor '{name}' matched {n}x, expected {count}x")
        text = text.replace(old, new)
    text, n = TOOL_RX.subn(TOOL_REPL, text)
    if n != 4:
        sys.exit(f"HOLD: anchor 'direct write tools' matched {n}x, expected 4x")
    rx, repl, count = DIRECT
    text, n = rx.subn(repl, text)
    if n != count:
        sys.exit(f"HOLD: anchor 'direct apply_patch' matched {n}x, expected {count}x")
    open(dst, "w", encoding="utf-8").write(text)
    print("output sha256", hashlib.sha256(text.encode()).hexdigest())
    print("PATCH_OK")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
