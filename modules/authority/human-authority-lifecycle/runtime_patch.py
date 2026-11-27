#!/usr/bin/env python3
"""Wires the one-click lifecycle into the V2-built governed runtime (dist/server.js) with exact anchors.
- tools nyxa_authority_request (actor = process-bound NYXA_DEVELOPMENT_ACTOR, never from input) and nyxa_authority_status
- lifecycle tick inside the existing backend process (no extra timer); enabled only with the trusted issuer route
Usage: runtime_patch.py <built-output-dir>  -> PATCH_OK
"""
import sys
from pathlib import Path
def once(t, old, new):
    if t.count(old) != 1: raise SystemExit(f'ANCHOR_MISMATCH {old[:50]!r} x{t.count(old)}')
    return t.replace(old, new, 1)
TOOLS_OLD = '''        name: "nyxa_mandate_list",
        description: "Lists durable mandates and their active/revoked state.",
        inputSchema: objectSchema({}),
        annotations: READ_ANNOTATIONS
    }
];'''
TOOLS_NEW = '''        name: "nyxa_mandate_list",
        description: "Lists durable mandates and their active/revoked state.",
        inputSchema: objectSchema({}),
        annotations: READ_ANNOTATIONS
    },
    {
        name: "nyxa_authority_request",
        description: "Requests ONE bounded development frame for the transport-bound actor. The owner confirms once by passkey; NYXA publishes, discovers, claims and activates automatically. Creates no authority by itself.",
        inputSchema: objectSchema({ root: stringSchema(40), window: stringSchema(20), purpose: stringSchema(300) }, ["purpose"]),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
    },
    {
        name: "nyxa_authority_status",
        description: "Read-only processing state of an authority request (REQUESTED..ACTIVE/COMPLETED or EXPIRED/REVOKED/DENIED/FAILED).",
        inputSchema: objectSchema({ request_id: stringSchema(64) }, ["request_id"]),
        annotations: READ_ANNOTATIONS
    }
];'''
DISPATCH_OLD = '''            if (name === "nyxa_mandate_list") {'''
DISPATCH_NEW = '''            if (name === "nyxa_authority_request") {
                assertKeys(input, ["root", "window", "purpose"]);
                return await this.handleAuthorityRequest(input);
            }
            if (name === "nyxa_authority_status") {
                assertKeys(input, ["request_id"]);
                return await this.handleAuthorityStatus(input);
            }
            if (name === "nyxa_mandate_list") {'''
METHODS_OLD = '''    async handleMandateIssue(input) {'''
METHODS_NEW = '''    async authorityLifecycle() {
        if (!process.env.NYXA_AUTHORITY_LIFECYCLE_DIR || process.env.NYXA_AUTHORITY_ADAPTER_CONFIG !== "/opt/nyxa-authority-v1/adapter.json" ||
            process.env.NYXA_MANDATE_DATA_DIR !== "/opt/nyxa-governed-memory-mcp-runtime/data-authority-v1")
            return null;
        if (!this._lifecycle) {
            const { createLifecycle } = await import("../authority/lifecycle.mjs");
            const { discover } = await import("../authority/issuerDiscover.mjs");
            const { issueFrame } = await import("../authority/delegationV2.mjs");
            this._lifecycle = createLifecycle({ dir: process.env.NYXA_AUTHORITY_LIFECYCLE_DIR, discover, mandateStore: this.mandateStore,
                issueFrame: (args) => issueFrame({ ...args, audit: async (record) => { await args.audit(record); await this.audit("allowed", "nyxa_authority_lifecycle", record); } }) });
            const timer = setInterval(() => { this._lifecycle.tick().catch(() => undefined); }, 15000);
            timer.unref?.();
        }
        return this._lifecycle;
    }
    async handleAuthorityRequest(input) {
        const actor = process.env.NYXA_DEVELOPMENT_ACTOR;
        if (!["chatgpt", "claude", "sophia"].includes(actor))
            return toolJsonResult({ error: "authenticated_development_actor_required" }, true);
        const lifecycle = await this.authorityLifecycle();
        if (!lifecycle)
            return toolJsonResult({ error: "authority_lifecycle_not_configured" }, true);
        try {
            const result = lifecycle.request({ actor, root: optionalString(input, "root", 40) ?? "governed-dev",
                window: optionalString(input, "window", 20) ?? "regular", purpose: requiredString(input, "purpose", 300) });
            await this.audit(result.ok ? "allowed" : "blocked", "nyxa_authority_request", { actor, ...result });
            return toolJsonResult(result.ok ? { ...result, next: "owner_confirms_once_in_portal" } : result, !result.ok);
        }
        catch (error) {
            await this.audit("blocked", "nyxa_authority_request", { actor, reason: String(error.message).slice(0, 80) });
            return toolJsonResult({ error: String(error.message).slice(0, 80) }, true);
        }
    }
    async handleAuthorityStatus(input) {
        const lifecycle = await this.authorityLifecycle();
        if (!lifecycle)
            return toolJsonResult({ error: "authority_lifecycle_not_configured" }, true);
        try { return toolJsonResult(lifecycle.status(requiredString(input, "request_id", 64))); }
        catch { return toolJsonResult({ error: "unknown_request" }, true); }
    }
    async handleMandateIssue(input) {'''
START_OLD = '''        this.mandateStore = new MandateStore(process.env.NYXA_MANDATE_DATA_DIR ?? this.config.dataDir);'''
START_NEW = START_OLD + '''
        this.authorityLifecycle().catch(() => undefined);'''
def patch(out):
    f = Path(out) / 'dist' / 'server.js'; s = f.read_text()
    for o, n in ((TOOLS_OLD, TOOLS_NEW), (DISPATCH_OLD, DISPATCH_NEW), (METHODS_OLD, METHODS_NEW), (START_OLD, START_NEW)): s = once(s, o, n)
    f.write_text(s); print('PATCH_OK')
if __name__ == '__main__': patch(sys.argv[1])
