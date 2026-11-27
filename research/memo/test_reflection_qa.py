import json, unittest
import reflection_qa as R

CHUNKS = [
  {"doc_id": "d1", "chunk_id": "c1", "text": "Ada founded Lumen in 2019 in Berlin.", "subjects": ["ada"]},
  {"doc_id": "d2", "chunk_id": "c1", "text": "Lumen moved to Hamburg in 2024. Ada leads it.", "subjects": ["ada"]},
  {"doc_id": "d3", "chunk_id": "c1", "text": "Bert joined Lumen.", "subjects": ["bert"]},
]
def gen(c):
    t = c["text"]
    if t.startswith("Ada"):
        return {"direct": [{"q": "Who founded Lumen?", "a": "Ada", "entities": ["Lumen"]},
                           {"q": "Where was Lumen based?", "a": "Berlin", "entities": ["Lumen"], "valid_from": "2019-01-01", "valid_to": "2024-01-01"}],
                "indirect": [{"q": "What did she found?", "a": "Lumen", "entities": ["Ada"]}]}
    if t.startswith("Lumen"):
        return {"direct": [{"q": "Where was Lumen based?", "a": "Hamburg", "entities": ["Lumen"], "valid_from": "2024-01-01"},
                           {"q": "Who leads Lumen?", "a": "Ada", "entities": ["Lumen"]}], "indirect": []}
    return {"direct": [{"q": "Who joined Lumen?", "a": "Bert", "entities": ["Lumen"]}], "indirect": []}

class Pipeline(unittest.TestCase):
    def run_all(self, as_of="2026-11-27", revoked=frozenset()):
        q = R.extract(CHUNKS, gen)
        q = R.consolidate(q, lambda grp: {"q": "Summarize what is known about Lumen.", "a": "; ".join(sorted(g.answer for g in grp))})
        q = R.verify(q, rewriter=lambda x: {"q": "What did Ada found?"} if "she" in x.question else None)
        q = q + R.surface_entities(q, lambda e, g: f"Which organisation was founded by Ada and later moved to Hamburg?" if e == "Lumen" else None)
        q = q + R.cross_document(q, [{"d1", "d2", "d3"}], lambda e, items: {"q": f"Which documents describe {e}?", "a": "d1, d2, d3"})
        return q, R.govern(q, revoked_subjects=set(revoked), as_of=as_of)

    def test_stage_semantics(self):
        q = R.extract(CHUNKS, gen)
        self.assertEqual({x.epistemic for x in q if x.stage == "extract_direct"}, {"fact"})
        self.assertEqual({x.epistemic for x in q if x.stage == "extract_indirect"}, {"inference"})
        self.assertTrue(all(len(x.sources) == 1 and len(x.sources[0].sha256) == 64 for x in q))

    def test_consolidation_respects_validity(self):
        q = R.extract(CHUNKS, gen)
        merged = [x for x in R.consolidate(q, lambda g: {"q": "m", "a": "m"}) if x.stage == "consolidated"]
        self.assertEqual(merged, [], "Berlin(2019-2024) and Hamburg(2024-) are disjoint -> no merge across validity")

    def test_verification_rewrites_or_discards(self):
        q = R.verify(R.extract(CHUNKS, gen), rewriter=lambda x: {"q": "What did Ada found?"})
        self.assertIn("What did Ada found?", [x.question for x in q])
        self.assertNotIn("What did she found?", [x.question for x in q])
        self.assertEqual(len(R.verify(R.extract(CHUNKS, gen), rewriter=None)), 5, "unresolved pronoun discarded without rewriter")

    def test_governance_temporal_contradiction_consent(self):
        _, (train, rep) = self.run_all()
        qs = {x.question: x.answer for x in train}
        self.assertEqual(qs.get("Where was Lumen based?"), "Hamburg", "expired Berlin fact excluded, current kept")
        self.assertEqual(rep["excluded"].get("validity_expired"), 1)
        _, (train_old, rep_old) = self.run_all(as_of="2025-06-01")
        self.assertNotIn("contradiction_unresolved", rep_old["excluded"])
        _, (train_rev, rep_rev) = self.run_all(revoked={"bert"})
        self.assertGreaterEqual(rep_rev["excluded"]["consent_revoked"], 1)
        self.assertNotIn("Who joined Lumen?", [x.question for x in train_rev])
        self.assertTrue(all(x.sources for x in train))

    def test_cross_doc_is_inference_with_all_sources(self):
        q, _ = self.run_all()
        cd = [x for x in q if x.stage == "cross_doc"]
        self.assertTrue(cd and all(x.epistemic == "inference" and {s.doc_id for s in x.sources} == {"d1", "d2", "d3"} for x in cd))

    def test_contradiction_is_contested_not_trained(self):
        a = R._mk("Who leads Lumen?", "Ada", "extract_direct", "fact", [R.Source("d1", "c1", "0" * 64)])
        b = R._mk("Who leads Lumen?", "Bert", "extract_direct", "fact", [R.Source("d9", "c1", "1" * 64)])
        train, rep = R.govern([a, b], revoked_subjects=set(), as_of="2026-11-27")
        self.assertEqual(train, []); self.assertEqual(rep["excluded"]["contradiction_unresolved"], 2)
        h = R._mk("Will Lumen IPO?", "maybe", "extract_indirect", "hypothesis", [R.Source("d1", "c1", "0" * 64)])
        self.assertEqual(R.govern([h], revoked_subjects=set(), as_of="2026-11-27")[1]["excluded"], {"hypothesis_not_trainable": 1})

    def test_export_manifest_deterministic_and_not_authorized(self):
        _, (train, rep) = self.run_all()
        l1, m1 = R.export(train, rep, "2026-11-27.1"); l2, m2 = R.export(train, rep, "2026-11-27.1")
        self.assertEqual(m1["sha256"], m2["sha256"]); self.assertFalse(m1["training_authorized"])
        self.assertEqual(len(l1.splitlines()), m1["records"])
        for line in l1.splitlines(): json.loads(line)

if __name__ == "__main__":
    unittest.main()
