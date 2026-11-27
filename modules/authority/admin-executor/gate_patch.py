#!/usr/bin/env python3
"""Minimal Human Gate patch for the admin bundle op (R10). Exact, count-checked text replacements; refuses otherwise.
  1. register 'nyxa-admin-bundle-v1' as a dynamic generic-approval operation (own directory, non-v2: TTL<=300 s,
     proposal 15 min, one-shot per binding_id),
  2. finish the reservation (reserved -> consumed) after grant issuance, like frames and agent actions,
  3. persist the signed subject per grant (authority-grants/frame-transactions/<gid>.json, 0600, owner 993) so the
     root executor can recompute transaction_digest. The issuer never accepts it as a frame (different action).
usage: gate_patch.py <in server.mjs> <out server.mjs> <expected input sha256>"""
import hashlib, sys
from pathlib import Path
OP = "nyxa-admin-bundle-v1"
EDITS = [
 ("for (const id of frameOperations) dynamicOperations.set(id,{directory:id,open:openGenericApprovalBridge});\n",
  "for (const id of frameOperations) dynamicOperations.set(id,{directory:id,open:openGenericApprovalBridge});\n"
  f"const ADMIN_OPERATION='{OP}';\ndynamicOperations.set(ADMIN_OPERATION,{{directory:ADMIN_OPERATION,open:openGenericApprovalBridge}});\n"),
 ("if (verified.subject.operation_id === 'nyxa-agent-approved-action-v1' || isFrame) {",
  "const isAdmin=verified.subject.operation_id===ADMIN_OPERATION;\n          if (verified.subject.operation_id === 'nyxa-agent-approved-action-v1' || isFrame || isAdmin) {"),
 ("            if (isFrame) {\n", "            if (isFrame || isAdmin) {\n"),
]
def patch(text):
    for old, new in EDITS:
        if text.count(old) != 1: raise SystemExit(f"GATE_PATCH_REFUSED: anchor count {text.count(old)}: {old[:60]!r}")
        text = text.replace(old, new)
    return text
if __name__ == "__main__":
    src, dst, want = sys.argv[1:4]; data = Path(src).read_bytes()
    if hashlib.sha256(data).hexdigest() != want: raise SystemExit("GATE_PATCH_REFUSED: input hash mismatch")
    out = patch(data.decode()); Path(dst).write_text(out); print(hashlib.sha256(out.encode()).hexdigest())
