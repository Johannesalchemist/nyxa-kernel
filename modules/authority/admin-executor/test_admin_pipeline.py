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
    def run_worker(self): return PW.run(self.t / "lc", "x", self.t / "frames", self.t / "pins.json")
    def test_stage_publish_binding(self):
        (self.t / "in/b.sh").write_text("#!/bin/bash\nexit 0\n"); (self.t / "in/b.json").write_text('{"display":"Broker <script> stilllegen"}')
        [r] = R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox")
        req = json.loads(next((self.t / "lc/inbox").iterdir()).read_text())
        self.assertEqual(req["artifact_path"], str(self.t / "store" / f"{r['bundle']}.sh"))
        [ack] = self.run_worker(); self.assertFalse(ack["ok"]); self.assertEqual(ack["reason"], "admin_request_invalid")  # production store only
        (self.t / "lc/outbox").joinpath(next(iter([p.name for p in (self.t / "lc/outbox").iterdir()]))).unlink()
        R.stage  # re-stage same bundle -> new request, worker configured with the test store
        (self.t / "in/b.sh").write_text("#!/bin/bash\nexit 0\n"); (self.t / "in/b.json").write_text('{"display":"Broker <script> stilllegen"}')
        R.stage(self.t / "in", self.t / "store", self.t / "lc/inbox")
        [ack] = PW.run(self.t / "lc", "x", self.t / "frames", self.t / "pins.json", admin_store=str(self.t / "store"), admin_owner_uid=os.geteuid())
        self.assertTrue(ack["ok"], ack); b = json.loads((self.t / "frames" / X.OPERATION / "binding.json").read_text())
        self.assertEqual(b["artifact_sha256"], r["bundle"]); self.assertEqual(b["target"], "host:" + socket.gethostname()); self.assertEqual(b["ttl_seconds"], 300)
        self.assertIn(r["bundle"], b["display"]); self.assertNotIn("<", b["display"])
        self.assertEqual(oct((self.t / "frames" / X.OPERATION / "binding.json").stat().st_mode & 0o777), "0o644")
        X.transaction(b)  # binding carries every transaction field the executor digests
    def test_worker_rejects_unstaged_and_spoofed_display(self):
        s = "a" * 64; f = self.t / "lc/inbox" / "11111111-1111-4111-8111-111111111111.json"
        f.write_text(json.dumps({"request_id": f.stem, "operation": X.OPERATION, "artifact_sha256": s, "artifact_path": f"/var/lib/nyxa-admin/bundles/{s}.sh", "display": "harmlos"}))
        [ack] = self.run_worker(); self.assertFalse(ack["ok"])  # not staged by root -> refused
    def test_frame_requests_unchanged(self):
        f = self.t / "lc/inbox" / "22222222-2222-4222-8222-222222222222.json"; f.write_text(json.dumps({"request_id": f.stem, "operation": "nyxa-dev-frame-v2-silicon-dev-regular-claude"}))
        [ack] = self.run_worker(); self.assertEqual(ack["reason"], "request_invalid_or_frame_not_pinned")

if __name__ == "__main__": unittest.main()
