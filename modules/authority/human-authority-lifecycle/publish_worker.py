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
    tmp = path.with_suffix('.tmp'); fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640)
    with os.fdopen(fd, 'w') as f: json.dump(obj, f); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)

def run(lifecycle, publisher, frames_root, pins, now_ms=None):
    pub = load_publisher(publisher); pinned = set(json.loads(Path(pins).read_text()))
    inbox, outbox, done = Path(lifecycle) / 'inbox', Path(lifecycle) / 'outbox', Path(lifecycle) / 'inbox-done'
    done.mkdir(exist_ok=True, mode=0o750); results = []
    for f in sorted(inbox.glob('*.json')):
        try:
            req = json.loads(f.read_text()); rid = str(uuid.UUID(req['request_id'], version=4)); op = req['operation']
            if set(req) != {'request_id', 'operation'} or rid != req['request_id'] or not FRAME.fullmatch(op) or op not in pinned:
                raise ValueError('request_invalid_or_frame_not_pinned')
            if (outbox / f.name).exists(): raise ValueError('already_acknowledged')
            r = pub.publish(Path(frames_root) / op, op, now_ms or int(time.time() * 1000))
            ack = {'ok': True, 'request_id': rid, **r}
        except Exception as e:
            ack = {'ok': False, 'request_id': f.stem, 'reason': str(e)[:80]}
        if not (outbox / f.name).exists(): atomic_write(outbox / f.name, ack)
        os.replace(f, done / f.name); results.append(ack)
    return results

if __name__ == '__main__':
    a = argparse.ArgumentParser(); [a.add_argument(x, required=True) for x in ('--lifecycle-dir', '--publisher', '--frames-root', '--pins')]
    n = a.parse_args(); print(json.dumps(run(n.lifecycle_dir, n.publisher, n.frames_root, n.pins)))
