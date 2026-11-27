#!/usr/bin/env python3
"""NYXA Admin Bundle Executor (R10 candidate), 2026-11-27 Europe/Berlin. Owner: Johannes Suess. Generated with Claude Code.

Bounded administrative execution through the EXISTING Human Authority architecture — no general root access:
  * runs ONLY a bundle whose exact SHA-256 the owner approved by passkey (Human Gate grant, Ed25519, same canonical
    claim contract as /opt/nyxa-authority-v1/issuer_claim_service.py: schema nyxa-human-authority-grant-v2,
    issuer webauthn://auth.future24.eu, principal nyxa-owner, user_verification, max_executions 1, time window),
  * grant bound to action 'nyxa_admin_bundle_apply', target 'host:<hostname>', artifact_sha256 = bundle SHA,
    artifact_path = content-addressed root-owned bundle path, transaction_digest = digest of the published binding,
  * one-use: O_EXCL ledger entry per grant_id (and per nonce) before execution; a crash never re-executes,
  * fixed bundle contract: --apply, then --verify; on verify failure --rollback; per-step timeout; clean env,
  * receipt (JSON, hashes of bundle/grant/outputs) for every attempt; never prints secrets it did not produce.
It does not mutate the portal's or issuer's files and is not reachable by any agent identity: the only input that can
authorize execution is a grant signed by the Human Gate key.
"""
import base64, hashlib, json, os, re, stat, subprocess, time
from pathlib import Path

OPERATION = "nyxa-admin-bundle-v1"
ACTION = "nyxa_admin_bundle_apply"
CLAIMS = {"schema", "grant_id", "issuer", "principal", "credential_fingerprint", "action", "target", "artifact_sha256",
          "artifact_path", "nonce", "issued_at", "expires_at", "max_executions", "audit_correlation", "transaction_digest",
          "user_verification", "origin", "rp_id"}
TX_FIELDS = ("operation_id", "action", "target", "artifact_sha256", "artifact_path", "display", "ttl_seconds")
HEX = re.compile(r"^[0-9a-f]{64}$"); UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

class Denied(Exception):
    pass

def canonical(v):
    """Identical to the issuer's canonical JSON (recursive, sorted keys, compact, non-ASCII kept)."""
    if isinstance(v, list): return "[" + ",".join(canonical(x) for x in v) + "]"
    if isinstance(v, dict): return "{" + ",".join(json.dumps(k, ensure_ascii=False, separators=(",", ":")) + ":" + canonical(v[k]) for k in sorted(v)) + "}"
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
sha = lambda b: hashlib.sha256(b).hexdigest()

def transaction(binding):
    return {k: binding[k] for k in TX_FIELDS}

def verify_grant(envelope, binding, bundle_sha, public_key, hostname, now):
    """Returns the verified claims or raises Denied(reason). Order: shape -> binding -> scope -> time -> signature."""
    if not isinstance(envelope, dict) or set(envelope) != {"algorithm", "claims", "signature"} or envelope["algorithm"] != "Ed25519": raise Denied("envelope_invalid")
    c = envelope["claims"]
    if not isinstance(c, dict) or set(c) != CLAIMS: raise Denied("claims_invalid")
    tx = transaction(binding)
    if binding.get("operation_id") != OPERATION or binding.get("action") != ACTION or binding.get("target") != f"host:{hostname}": raise Denied("binding_scope_invalid")
    if binding.get("artifact_sha256") != bundle_sha or not HEX.fullmatch(bundle_sha): raise Denied("bundle_hash_mismatch")
    if (c["schema"] != "nyxa-human-authority-grant-v2" or c["issuer"] != "webauthn://auth.future24.eu" or c["principal"] != "nyxa-owner" or
        c["origin"] != "https://auth.future24.eu" or c["rp_id"] != "auth.future24.eu" or c["user_verification"] is not True or c["max_executions"] != 1 or
        c["action"] != ACTION or c["target"] != binding["target"] or c["artifact_sha256"] != bundle_sha or c["artifact_path"] != binding["artifact_path"] or
        c["transaction_digest"] != sha(canonical(tx).encode()) or not UUID.fullmatch(str(c["grant_id"])) or
        not isinstance(c["nonce"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", c["nonce"]) or not HEX.fullmatch(str(c["credential_fingerprint"]))):
        raise Denied("grant_scope_invalid")
    if (type(c["issued_at"]) is not int or type(c["expires_at"]) is not int or c["issued_at"] > now + 30 or c["issued_at"] < now - 300 or
        c["expires_at"] <= now or c["expires_at"] <= c["issued_at"] or c["expires_at"] - c["issued_at"] > min(300, binding["ttl_seconds"])):
        raise Denied("grant_time_invalid")
    sig = envelope["signature"]
    if not isinstance(sig, str) or not re.fullmatch(r"[A-Za-z0-9_-]{86}", sig): raise Denied("signature_encoding")
    raw = base64.urlsafe_b64decode(sig + "==")
    try:
        public_key.verify(raw, canonical(c).encode())
    except Exception:
        raise Denied("signature_invalid")
    return c

def claim_once(ledger: Path, claims):
    """O_EXCL reservation of grant_id AND nonce before any execution (at-most-once, survives crashes/restarts)."""
    for key in (f"grant-{claims['grant_id']}", f"nonce-{claims['nonce']}"):
        try:
            fd = os.open(ledger / key, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            raise Denied("grant_already_used")
        with os.fdopen(fd, "w") as f: f.write(json.dumps({"at": int(time.time()), "artifact": claims["artifact_sha256"]})); f.flush(); os.fsync(f.fileno())

def trusted_bundle(path: Path, expected_sha, owner_uid=0):
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid != owner_uid or st.st_mode & 0o022 or st.st_nlink != 1: raise Denied("bundle_untrusted_file")
    data = path.read_bytes()
    if sha(data) != expected_sha: raise Denied("bundle_hash_mismatch")
    return data

def run_bundle(path: Path, timeout_s=300):
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"}
    def step(mode):
        try:
            r = subprocess.run(["/bin/bash", str(path), mode], stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout_s, env=env, cwd="/")
            return {"mode": mode, "rc": r.returncode, "stdout_sha256": sha(r.stdout), "stdout_tail": r.stdout.decode(errors="replace")[-2000:], "stderr_tail": r.stderr.decode(errors="replace")[-1000:]}
        except subprocess.TimeoutExpired:
            return {"mode": mode, "rc": 124, "timeout": True}
    steps = [step("--apply")]
    if steps[-1]["rc"] == 0: steps.append(step("--verify"))
    if steps[-1]["rc"] != 0: steps.append(step("--rollback"))
    ok = len(steps) == 2 and all(s["rc"] == 0 for s in steps)
    return {"ok": ok, "steps": steps, "rolled_back": any(s["mode"] == "--rollback" for s in steps)}

def execute(envelope, binding, bundle_path: Path, public_key, ledger: Path, receipts: Path, hostname, now=None, timeout_s=300):
    now = int(time.time()) if now is None else now
    receipt = {"schema": "nyxa-admin-receipt-v1", "at": now, "bundle_path": str(bundle_path), "binding_sha256": sha(canonical(binding).encode())}
    try:
        expected = binding.get("artifact_sha256", "")
        trusted_bundle(bundle_path, expected, owner_uid=os.geteuid())
        c = verify_grant(envelope, binding, expected, public_key, hostname, now)
        claim_once(ledger, c)
        receipt.update(grant_id=c["grant_id"], bundle_sha256=expected, grant_sha256=sha(canonical(envelope).encode()), result=run_bundle(bundle_path, timeout_s))
        receipt["status"] = "APPLIED" if receipt["result"]["ok"] else ("ROLLED_BACK" if receipt["result"]["rolled_back"] else "FAILED")
    except Denied as d:
        receipt.update(status="DENIED", reason=str(d))
    receipts.mkdir(parents=True, exist_ok=True)
    out = receipts / f"{now}-{receipt.get('grant_id', 'denied')}-{os.urandom(6).hex()}.json"  # unique even for several denials per second
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    with os.fdopen(fd, "w") as f: json.dump(receipt, f, indent=1)
    return receipt
