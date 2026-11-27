"""R8: read-only discover against the REAL V2-built issuer, claim store and AF_UNIX socket (extends test_frame_ipc)."""
import time, unittest, uuid
import test_frame_ipc as base
from test_issuer_ipc import connect
ROUTE = 'nyxa-delegation-frame-v2'

class Discover(base.FrameIpc):
    def disc(self, pid, **extra):
        return connect(self.bridge.socket, {'mode': 'discover', 'operation_id': ROUTE, 'proposal_id': pid, **extra})

    def test_discover_is_read_only_then_one_use_claim(self):
        now = int(time.time()); gid, tx = self.make_grant((now - 100) * 1000, now - 5, now + 1795)
        self.bridge.start()
        d = self.disc(tx['proposal_id']); self.assertEqual(d, {'ok': True, 'grant_id': gid, 'proposal_id': tx['proposal_id']})
        self.assertEqual(self.disc(tx['proposal_id'])['grant_id'], gid)                       # repeatable, nothing consumed
        self.assertTrue((self.bridge.root / 'issued' / (gid + '.json')).exists())
        self.assertTrue(self.bridge.send(gid, ROUTE)['ok'])                                  # unchanged one-use claim
        self.assertEqual(self.disc(tx['proposal_id'])['reason'], 'DENY:no_confirmed_grant')  # consumed -> not discoverable
        self.assertEqual(self.bridge.send(gid, ROUTE)['reason'], 'DENY:missing_revoked_or_replayed')  # replay

    def test_unknown_drifted_expired_are_not_discovered(self):
        now = int(time.time())
        drift, dtx = self.make_grant((now - 100) * 1000, now, now + 1800, lambda tx: tx.update(display='other'))
        late, ltx = self.make_grant((now - 86401) * 1000, now, now + 1800)
        self.bridge.start()
        self.assertEqual(self.disc(str(uuid.uuid4()))['reason'], 'DENY:no_confirmed_grant')
        self.assertEqual(self.disc(dtx['proposal_id'])['reason'], 'DENY:no_confirmed_grant')
        self.assertEqual(self.disc(ltx['proposal_id'])['reason'], 'DENY:no_confirmed_grant')
        for g in (drift, late): self.assertTrue((self.bridge.root / 'issued' / (g + '.json')).exists())

    def test_request_shape_and_route_enforced(self):
        now = int(time.time()); gid, tx = self.make_grant((now - 100) * 1000, now, now + 1800)
        self.bridge.start()
        self.assertEqual(self.disc(tx['proposal_id'], grant_id=gid)['reason'], 'DENY:request_shape')
        self.assertEqual(connect(self.bridge.socket, {'mode': 'discover', 'operation_id': 'other-op', 'proposal_id': tx['proposal_id']})['reason'], 'DENY:discover_not_allowed')
        self.assertEqual(self.disc('not-a-uuid')['reason'], 'DENY:discover_not_allowed')

if __name__ == '__main__':
    unittest.main()
