#!/usr/bin/env python3
"""Root-side glue for the Admin Bundle Executor (triggered by systemd path units, no own timer).
  stage : jo submits <inbox>/<name>.sh + <name>.json {display}; root copies it content-addressed into the root-owned
          store (0600), writes a publish request for the EXISTING publisher worker (operation nyxa-admin-bundle-v1).
  apply : for every issued Human Gate grant with action nyxa_admin_bundle_apply, verify against the CURRENT binding and the
          stored bundle, then execute once (admin_executor.execute). Everything else in the grant store is ignored.
"""
import argparse, hashlib, json, os, socket, stat, uuid
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))  # python3 -I drops the script dir; the install dir is root-owned
from cryptography.hazmat.primitives import serialization
import admin_executor as X

def _read_submitted(path: Path, limit: int):
    """Submitted files are untrusted: no symlinks, regular file, single link, not root-owned (no laundering of root files)."""
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid == 0 or st.st_size > limit: raise ValueError("submission_untrusted_file")
        with os.fdopen(os.dup(fd), "rb") as f: return f.read(limit + 1)
    finally: os.close(fd)

def stage(inbox: Path, store: Path, publish_inbox: Path):
    """Triggered on <name>.json (written AFTER <name>.sh). A .sh without its .json is left alone (submission in progress)."""
    out = []
    for meta in sorted(inbox.glob("*.json")):
        sh = inbox / (meta.stem + ".sh")
        try:
            display = json.loads(_read_submitted(meta, 4096))["display"]; assert isinstance(display, str) and 1 <= len(display) <= 400, "display_invalid"
            data = _read_submitted(sh, 256_000); assert len(data) <= 256_000, "bundle_too_large"
            s = hashlib.sha256(data).hexdigest(); dst = store / f"{s}.sh"
            if not dst.exists():
                fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
                with os.fdopen(fd, "wb") as f: os.fchmod(f.fileno(), 0o640); f.write(data); f.flush(); os.fsync(f.fileno())
            rid = str(uuid.uuid4()); ist = os.stat(publish_inbox)
            req = {"request_id": rid, "operation": X.OPERATION, "artifact_sha256": s, "artifact_path": str(dst), "display": display}
            fd = os.open(publish_inbox / f"{rid}.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
            with os.fdopen(fd, "w") as f:
                os.fchmod(f.fileno(), 0o640)
                if os.geteuid() == 0: os.fchown(f.fileno(), ist.st_uid, ist.st_gid)  # same owner/group as lifecycle hand-offs
                json.dump(req, f)
            out.append({"bundle": s, "request_id": rid})
        except Exception as e:
            out.append({"submission": meta.name, "error": str(e)[:120]})
        finally:
            meta.unlink(missing_ok=True); sh.unlink(missing_ok=True)
    return out

def apply(grants_issued: Path, binding_file: Path, ledger: Path, receipts: Path, public_pem: Path, subjects: Path):
    pub = serialization.load_pem_public_key(public_pem.read_bytes()); binding = json.loads(binding_file.read_text()); done = []
    for g in sorted(grants_issued.glob("*.json")):
        try: env = json.loads(g.read_text())
        except Exception: continue
        if (env.get("claims") or {}).get("action") != X.ACTION: continue
        gid = str(env['claims'].get('grant_id'))
        if not X.UUID.fullmatch(gid) or (ledger / f"grant-{gid}").exists() or (ledger / f"denied-{gid}").exists(): continue
        try: subject = json.loads((subjects / f"{gid}.json").read_text())
        except Exception: subject = None  # -> DENIED subject_mismatch, with receipt
        r = X.execute(env, binding, Path(binding["artifact_path"]), pub, ledger, receipts, socket.gethostname(), subject=subject)
        if r["status"] == "DENIED":  # one receipt per denied grant, not one per trigger
            os.close(os.open(ledger / f"denied-{gid}", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600))
        done.append(r)
    return done

if __name__ == "__main__":
    a = argparse.ArgumentParser(); a.add_argument("mode", choices=["stage", "apply"]); a.add_argument("--config", required=True); n = a.parse_args()
    c = json.loads(Path(n.config).read_text())
    if n.mode == "stage": print(json.dumps(stage(Path(c["inbox"]), Path(c["store"]), Path(c["publish_inbox"]))))
    else: print(json.dumps(apply(Path(c["grants_issued"]), Path(c["binding_file"]), Path(c["ledger"]), Path(c["receipts"]), Path(c["public_pem"]), Path(c["subjects"])), default=str))
