#!/usr/bin/env python3
"""Root-side glue for the Admin Bundle Executor (triggered by systemd path units, no own timer).
  stage : jo submits <inbox>/<name>.sh + <name>.json {display}; root copies it content-addressed into the root-owned
          store (0600), writes a publish request for the EXISTING publisher worker (operation nyxa-admin-bundle-v1).
  apply : for every issued Human Gate grant with action nyxa_admin_bundle_apply, verify against the CURRENT binding and the
          stored bundle, then execute once (admin_executor.execute). Everything else in the grant store is ignored.
"""
import argparse, hashlib, json, os, socket, uuid
from pathlib import Path
from cryptography.hazmat.primitives import serialization
import admin_executor as X

def stage(inbox: Path, store: Path, publish_inbox: Path):
    out = []
    for sh in sorted(inbox.glob("*.sh")):
        meta = inbox / (sh.stem + ".json")
        try:
            display = json.loads(meta.read_text())["display"]; assert isinstance(display, str) and 1 <= len(display) <= 400
            data = sh.read_bytes(); assert len(data) <= 256_000
            s = hashlib.sha256(data).hexdigest(); dst = store / f"{s}.sh"
            if not dst.exists():
                fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
                with os.fdopen(fd, "wb") as f: f.write(data); f.flush(); os.fsync(f.fileno())
            rid = str(uuid.uuid4())
            req = {"request_id": rid, "operation": X.OPERATION, "artifact_sha256": s, "artifact_path": str(dst),
                   "display": display}
            fd = os.open(publish_inbox / f"{rid}.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
            with os.fdopen(fd, "w") as f: os.fchmod(f.fileno(), 0o640); json.dump(req, f)
            out.append({"bundle": s, "request_id": rid})
        except Exception as e:
            out.append({"bundle_file": sh.name, "error": str(e)[:120]})
        finally:
            sh.unlink(missing_ok=True); meta.unlink(missing_ok=True)
    return out

def apply(grants_issued: Path, binding_file: Path, ledger: Path, receipts: Path, public_pem: Path):
    pub = serialization.load_pem_public_key(public_pem.read_bytes()); binding = json.loads(binding_file.read_text()); done = []
    for g in sorted(grants_issued.glob("*.json")):
        try: env = json.loads(g.read_text())
        except Exception: continue
        if (env.get("claims") or {}).get("action") != X.ACTION: continue
        if (ledger / f"grant-{env['claims'].get('grant_id')}").exists(): continue
        done.append(X.execute(env, binding, Path(binding["artifact_path"]), pub, ledger, receipts, socket.gethostname()))
    return done

if __name__ == "__main__":
    a = argparse.ArgumentParser(); a.add_argument("mode", choices=["stage", "apply"]); a.add_argument("--config", required=True); n = a.parse_args()
    c = json.loads(Path(n.config).read_text())
    if n.mode == "stage": print(json.dumps(stage(Path(c["inbox"]), Path(c["store"]), Path(c["publish_inbox"]))))
    else: print(json.dumps(apply(Path(c["grants_issued"]), Path(c["binding_file"]), Path(c["ledger"]), Path(c["receipts"]), Path(c["public_pem"])), default=str))
