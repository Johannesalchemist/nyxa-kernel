#!/usr/bin/env python3
"""Publisher worker (runs as the portal's service identity via a systemd path unit; replaces the manual user switch).
Consumes lifecycle inbox requests {request_id, operation}, validates them against the pinned frame set and calls the
EXISTING framePublisher.publish() (one pending proposal per frame binding, fresh proposal UUID). Writes an ack to the
lifecycle outbox. It publishes a proposal for HUMAN confirmation only; it creates no authority.
Usage: publish_worker.py --lifecycle-dir D --publisher /path/framePublisher.py --frames-root R --pins pins.json
"""
import argparse, importlib.util, json, os, re, time, uuid
from pathlib import Path
FRAME = re.compile(r'^nyxa-dev-frame-v2-(governed-dev|silicon-dev)-(regular|extended)-(chatgpt|claude|sophia)$')

def load_publisher(path):
    spec = importlib.util.spec_from_file_location('framePublisher', path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

def atomic_write(path, obj):
    tmp = path.with_suffix('.tmp'); fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644 if path.name == 'binding.json' else 0o640)
    with os.fdopen(fd, 'w') as f: json.dump(obj, f); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

def run(lifecycle, publisher, frames_root, pins, now_ms=None, admin_store='/var/lib/nyxa-admin/bundles', admin_owner_uid=0):
    pub = load_publisher(publisher); pinned = set(json.loads(Path(pins).read_text()))
    inbox, outbox, done = Path(lifecycle) / 'inbox', Path(lifecycle) / 'outbox', Path(lifecycle) / 'inbox-done'
    results = []
    for f in sorted(inbox.glob('*.json')):
        try:
            req = json.loads(f.read_text()); rid = str(uuid.UUID(req['request_id'], version=4)); op = req['operation']
            if op == 'nyxa-admin-bundle-v1':
                # Admin bundle: dynamic artifact (content-addressed, root-owned). Write the binding the portal gate validates,
                # then publish exactly like a frame. Authority comes only from the owner's passkey on this exact SHA.
                if set(req) != {'request_id', 'operation', 'artifact_sha256', 'artifact_path', 'display'} or rid != req['request_id'] \
                   or not re.fullmatch(r'[0-9a-f]{64}', req['artifact_sha256']) or req['artifact_path'] != f"{admin_store}/{req['artifact_sha256']}.sh":
                    raise ValueError('admin_request_invalid')
                import socket
                st = os.lstat(req['artifact_path'])  # must already be staged by root (content-addressed, root-owned, not group/world-writable)
                if not (st.st_uid == admin_owner_uid and (st.st_mode & 0o170000) == 0o100000 and not st.st_mode & 0o022): raise ValueError('admin_bundle_not_staged')
                # The display is built here, never taken verbatim: the hand-off dir is writable by other service identities,
                # so a request must not be able to show the owner a misleading text. Full SHA always shown.
                label = re.sub(r'[^\w .,:()/+-]', '', str(req['display']))[:160]
                req['display'] = f"Admin-Bündel auf {socket.gethostname()}: {label} | SHA-256 {req['artifact_sha256']}"
                b = {'schema': 'nyxa-generic-approval-binding-v1', 'operation_id': op, 'action': 'nyxa_admin_bundle_apply', 'target': 'host:' + socket.gethostname(),
                     'artifact_sha256': req['artifact_sha256'], 'artifact_path': req['artifact_path'], 'max_executions': 1, 'ttl_seconds': 300,
                     'display': str(req['display'])[:512], 'binding_id': str(uuid.uuid4())}
                atomic_write(Path(frames_root) / op / 'binding.json', b)
            elif set(req) != {'request_id', 'operation'} or rid != req['request_id'] or not FRAME.fullmatch(op) or op not in pinned:
                raise ValueError('request_invalid_or_frame_not_pinned')
            if (outbox / f.name).exists(): raise ValueError('already_acknowledged')
            r = pub.publish(Path(frames_root) / op, op, now_ms or int(time.time() * 1000))
            ack = {'ok': True, 'request_id': rid, **r}
        except Exception as e:
            ack = {'ok': False, 'request_id': f.stem, 'reason': str(e)[:80]}
        if not (outbox / f.name).exists(): atomic_write(outbox / f.name, ack)
        # R9 live finding: ReadWritePaths are separate bind mounts, rename across them fails (EXDEV). The ack in the
        # outbox is the durable record, so the processed hand-off is removed instead of moved.
        f.unlink(); results.append(ack)
    return results

if __name__ == '__main__':
    a = argparse.ArgumentParser(); [a.add_argument(x, required=True) for x in ('--lifecycle-dir', '--publisher', '--frames-root', '--pins')]
    n = a.parse_args(); print(json.dumps(run(n.lifecycle_dir, n.publisher, n.frames_root, n.pins)))
