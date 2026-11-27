"""Pipeline test: root staging -> existing publisher worker (admin op) -> binding the executor accepts."""
import json, os, tempfile, unittest, importlib.util, socket
from pathlib import Path
import admin_runner as R, admin_executor as X
spec = importlib.util.spec_from_file_location("pw", Path(__file__).parent.parent / "human-authority-lifecycle" / "publish_worker.py"); PW = importlib.util.module_from_spec(spec); spec.loader.exec_module(PW)

class FakePub:
    def publish(self, d, op, now):
        b = json.loads((d / "binding.json").read_text()); return {"proposal_id": "p", "operation_id": op, "artifact_sha256": b["artifact_sha256"]}

class T(unittest.TestCase):
    def setUp(self):
        self.t = Path(tempfile.mkdtemp()); [ (self.t / d).mkdir() for d in ("in", "store", "lc", "lc/inbox", "lc/outbox", "frames", "frames/" + X.OPERATION) ]
        (self.t / "pins.json").write_text("[]"); PW.load_publisher = lambda p: FakePub()
    def submit(self, name, body, meta):
        for f, c in ((f"{name}.sh", body), (f"{name}.json", meta)):
            (self.t / "in" / f).write_text(c)
            if os.geteuid() == 0: os.chown(self.t / "in" / f, 1000, 1000)  # submissions come from a non-root user
    def run_worker(self): return PW.run(self.t / "lc", "x", self.t / "frames", self.t / "pins.json")
    def test_stage_publish_binding(self):
        self.submit("b", "#!/bin/bash\nexit 0\n", '{"display":"Broker <script> stilllegen"}')
        [r] = R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox")
        req = json.loads(next((self.t / "lc/inbox").iterdir()).read_text())
        self.assertEqual(req["artifact_path"], str(self.t / "store" / f"{r['bundle']}.sh"))
        [ack] = self.run_worker(); self.assertFalse(ack["ok"]); self.assertEqual(ack["reason"], "admin_request_invalid")  # production store only
        (self.t / "lc/outbox").joinpath(next(iter([p.name for p in (self.t / "lc/outbox").iterdir()]))).unlink()
        R.stage  # re-stage same bundle -> new request, worker configured with the test store
        self.submit("b", "#!/bin/bash\nexit 0\n", '{"display":"Broker <script> stilllegen"}')
        R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox")
        [ack] = PW.run(self.t / "lc", "x", self.t / "frames", self.t / "pins.json", admin_store=str(self.t / "store"), admin_owner_uid=os.geteuid())
        self.assertTrue(ack["ok"], ack); b = json.loads((self.t / "frames" / X.OPERATION / "binding.json").read_text())
        self.assertEqual(b["artifact_sha256"], r["bundle"]); self.assertEqual(b["target"], "host:" + socket.gethostname()); self.assertEqual(b["ttl_seconds"], 300)
        self.assertIn(r["bundle"], b["display"]); self.assertNotIn("<", b["display"])
        self.assertEqual(oct((self.t / "frames" / X.OPERATION / "binding.json").stat().st_mode & 0o777), "0o644")
        X.transaction(b)  # binding carries every transaction field the executor digests
    def test_stage_refuses_symlink_and_waits_for_meta(self):
        (self.t / "secret").write_text("x"); os.symlink(self.t / "secret", self.t / "in/s.sh"); (self.t / "in/s.json").write_text('{"display":"x"}')
        [r] = R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox"); self.assertIn("error", r); self.assertEqual(list((self.t / "store").iterdir()), [])
        (self.t / "in/p.sh").write_text("#!/bin/bash\n"); self.assertEqual(R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox"), [])
        self.assertTrue((self.t / "in/p.sh").exists())  # in progress: untouched
        if os.geteuid() == 0:  # a root-owned file (e.g. hard link to a system file) is never laundered into the store
            (self.t / "in/r.sh").write_text("x"); (self.t / "in/r.json").write_text('{"display":"x"}'); os.chown(self.t / "in/r.json", 1000, 1000)
            [r] = R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox"); self.assertEqual(r["error"], "submission_untrusted_file")
    def test_worker_rejects_unstaged_and_spoofed_display(self):
        s = "a" * 64; f = self.t / "lc/inbox" / "11111111-1111-4111-8111-111111111111.json"
        f.write_text(json.dumps({"request_id": f.stem, "operation": X.OPERATION, "artifact_sha256": s, "artifact_path": f"/var/lib/nyxa-admin/bundles/{s}.sh", "display": "harmlos"}))
        [ack] = self.run_worker(); self.assertFalse(ack["ok"])  # not staged by root -> refused
    def test_frame_requests_unchanged(self):
        f = self.t / "lc/inbox" / "22222222-2222-4222-8222-222222222222.json"; f.write_text(json.dumps({"request_id": f.stem, "operation": "nyxa-dev-frame-v2-silicon-dev-regular-claude"}))
        [ack] = self.run_worker(); self.assertEqual(ack["reason"], "request_invalid_or_frame_not_pinned")

    def test_apply_executes_once_and_records_denials_once(self):
        import base64, time, hashlib
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives import serialization
        k = Ed25519PrivateKey.generate(); pem = self.t / "pub.pem"
        pem.write_bytes(k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        bp = self.t / "store" / "x.sh"; bp.write_text('#!/bin/bash\nexit 0\n'); os.chmod(bp, 0o640); sh = hashlib.sha256(bp.read_bytes()).hexdigest()
        b = {"schema": "nyxa-generic-approval-binding-v1", "operation_id": X.OPERATION, "action": X.ACTION, "target": "host:" + socket.gethostname(), "artifact_sha256": sh,
             "artifact_path": str(bp), "max_executions": 1, "ttl_seconds": 300, "display": "d", "binding_id": "33333333-3333-4333-8333-333333333333"}
        bf = self.t / "binding.json"; bf.write_text(json.dumps(b)); issued = self.t / "issued"; subjects = self.t / "ft"; ledger = self.t / "ledger"; rc = self.t / "rc"
        for d in (issued, subjects, ledger): d.mkdir()
        now = int(time.time())
        def mk(gid, key):
            subj = {**X.transaction(b), "proposal_id": "44444444-4444-4444-8444-444444444444", "proposal_expires_at": 1}
            c = {"schema": "nyxa-human-authority-grant-v2", "grant_id": gid, "issuer": "webauthn://auth.future24.eu", "principal": "nyxa-owner", "credential_fingerprint": "a" * 64,
                 "action": X.ACTION, "target": b["target"], "artifact_sha256": sh, "artifact_path": str(bp), "nonce": base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("="),
                 "issued_at": now, "expires_at": now + 300, "max_executions": 1, "audit_correlation": "c", "transaction_digest": hashlib.sha256(X.canonical(subj).encode()).hexdigest(),
                 "user_verification": True, "origin": "https://auth.future24.eu", "rp_id": "auth.future24.eu"}
            (issued / f"{gid}.json").write_text(json.dumps({"algorithm": "Ed25519", "claims": c, "signature": base64.urlsafe_b64encode(key.sign(X.canonical(c).encode())).decode().rstrip("=")}))
            (subjects / f"{gid}.json").write_text(json.dumps(subj))
        mk("55555555-5555-4555-8555-555555555555", k); mk("66666666-6666-4666-8666-666666666666", Ed25519PrivateKey.generate())
        (issued / "77777777-7777-4777-8777-777777777777.json").write_text(json.dumps({"claims": {"action": "nyxa_dev_frame"}}))  # frame grant: ignored
        run = lambda: R.apply(issued, bf, ledger, rc, pem, subjects)
        r = run(); self.assertEqual(sorted(x["status"] for x in r), ["APPLIED", "DENIED"])
        self.assertEqual(run(), []); self.assertEqual(len(list(rc.iterdir())), 2)  # re-trigger: nothing re-executed, no new receipts

if __name__ == "__main__": unittest.main()
