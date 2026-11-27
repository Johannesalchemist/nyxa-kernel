import base64, hashlib, json, os, tempfile, time, unittest, uuid
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import admin_executor as X

HOST = "ubuntu-4gb-nbg1-1"
def bundle(dir, body):
    p = Path(dir) / "bundle.sh"; p.write_text(body); os.chmod(p, 0o600); return p, hashlib.sha256(p.read_bytes()).hexdigest()
def binding(path, s, **o):
    b = {"schema": "nyxa-generic-approval-binding-v1", "operation_id": X.OPERATION, "action": X.ACTION, "target": f"host:{HOST}", "artifact_sha256": s,
         "artifact_path": str(path), "max_executions": 1, "ttl_seconds": 300, "display": "Admin-Bündel", "binding_id": str(uuid.uuid4())}; b.update(o); return b
def grant(key, b, now, **o):
    c = {"schema": "nyxa-human-authority-grant-v2", "grant_id": str(uuid.uuid4()), "issuer": "webauthn://auth.future24.eu", "principal": "nyxa-owner",
         "credential_fingerprint": "a" * 64, "action": b["action"], "target": b["target"], "artifact_sha256": b["artifact_sha256"], "artifact_path": b["artifact_path"],
         "nonce": base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("="), "issued_at": now, "expires_at": now + 120, "max_executions": 1, "audit_correlation": "t",
         "transaction_digest": hashlib.sha256(X.canonical(X.transaction(b)).encode()).hexdigest(), "user_verification": True,
         "origin": "https://auth.future24.eu", "rp_id": "auth.future24.eu"}; c.update(o)
    return {"algorithm": "Ed25519", "claims": c, "signature": base64.urlsafe_b64encode(key.sign(X.canonical(c).encode())).decode().rstrip("=")}

GOOD = '#!/bin/bash\ncase "$1" in --apply) echo applied > "$(dirname "$0")/state";; --verify) grep -q applied "$(dirname "$0")/state";; --rollback) rm -f "$(dirname "$0")/state"; echo rolled;; esac\n'
BADVERIFY = '#!/bin/bash\ncase "$1" in --apply) echo applied > "$(dirname "$0")/state";; --verify) exit 1;; --rollback) rm -f "$(dirname "$0")/state";; esac\n'

class AdminExecutor(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); self.key = Ed25519PrivateKey.generate(); self.pub = self.key.public_key(); self.now = int(time.time())
        self.ledger = Path(self.d) / "ledger"; self.ledger.mkdir(mode=0o700); self.receipts = Path(self.d) / "receipts"
    def run_(self, env, b, p, **kw): return X.execute(env, b, p, self.pub, self.ledger, self.receipts, HOST, now=self.now, **kw)
    def test_approved_bundle_runs_once_then_replay_denied(self):
        p, s = bundle(self.d, GOOD); b = binding(p, s); g = grant(self.key, b, self.now)
        r = self.run_(g, b, p); self.assertEqual(r["status"], "APPLIED", r); self.assertTrue((Path(self.d) / "state").exists())
        self.assertEqual(self.run_(g, b, p)["reason"], "grant_already_used")
        self.assertEqual(len(list(self.receipts.iterdir())), 2)
    def test_verify_failure_rolls_back(self):
        p, s = bundle(self.d, BADVERIFY); b = binding(p, s); r = self.run_(grant(self.key, b, self.now), b, p)
        self.assertEqual(r["status"], "ROLLED_BACK"); self.assertFalse((Path(self.d) / "state").exists())
    def test_bundle_changed_after_approval_denied(self):
        p, s = bundle(self.d, GOOD); b = binding(p, s); g = grant(self.key, b, self.now); p.write_text(GOOD + "echo extra\n")
        self.assertEqual(self.run_(g, b, p)["reason"], "bundle_hash_mismatch")
    def test_forged_wrong_scope_expired_untrusted(self):
        p, s = bundle(self.d, GOOD); b = binding(p, s)
        self.assertEqual(self.run_(grant(Ed25519PrivateKey.generate(), b, self.now), b, p)["reason"], "signature_invalid")
        self.assertEqual(self.run_(grant(self.key, binding(p, s, target="host:other"), self.now), binding(p, s, target="host:other"), p)["reason"], "binding_scope_invalid")
        self.assertEqual(self.run_(grant(self.key, b, self.now, action="nyxa_apply_patch"), b, p)["reason"], "grant_scope_invalid")
        self.assertEqual(self.run_(grant(self.key, b, self.now - 400), b, p)["reason"], "grant_time_invalid")
        self.assertEqual(self.run_(grant(self.key, b, self.now, principal="mallory"), b, p)["reason"], "grant_scope_invalid")
        g = grant(self.key, b, self.now); g["claims"]["artifact_path"] = "/tmp/other.sh"
        self.assertEqual(self.run_(g, b, p)["reason"], "grant_scope_invalid")
        os.chmod(p, 0o620); self.assertEqual(self.run_(grant(self.key, b, self.now), b, p)["reason"], "bundle_untrusted_file")
    def test_timeout_triggers_rollback(self):
        p, s = bundle(self.d, '#!/bin/bash\ncase "$1" in --apply) sleep 5;; --rollback) echo rb;; esac\n'); b = binding(p, s)
        r = self.run_(grant(self.key, b, self.now), b, p, timeout_s=1); self.assertEqual(r["status"], "ROLLED_BACK"); self.assertEqual(r["result"]["steps"][0]["rc"], 124)

if __name__ == "__main__":
    unittest.main()
