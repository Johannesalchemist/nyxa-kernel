"""Reproducible run of the Reflection-QA pipeline on the authorized repo corpus (2026-11-27)."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import reflection_qa as R
from generator_adapter import FileBackedGenerator, to_candidate_proposals
d = pathlib.Path(__file__).parent / "runs/2026-11-27"
chunks = json.load(open(d / "corpus.json", encoding="utf-8"))
gen = FileBackedGenerator(str(d / "generator-outputs.json"))
q = R.extract(chunks, gen)
q = R.consolidate(q, lambda grp: None)                       # merger not used in this run (documented)
q = R.verify(q, rewriter=None)                               # strict: discard non-self-contained pairs
q = q + R.surface_entities(q, lambda e, g: None)             # entity surfacing not used in this run
q = q + R.cross_document(q, [{"KNOSPEL.md", "decisions/ADR-0002_MULTI_AGENT_CONFLICT_GOVERNANCE.md"}], lambda e, items: None)
train, rep = R.govern(q, revoked_subjects=set(), as_of="2026-11-27")
lines, manifest = R.export(train, rep, "2026-11-27.1")
manifest["generator_provenance"] = gen.provenance
(d / "dataset.jsonl").write_text(lines, encoding="utf-8")
(d / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
props = to_candidate_proposals(train, actor="claude", task_id="memo-run-2026-11-27", run_id="1", version="2026-11-27.1")
(d / "candidate-proposals.json").write_text(json.dumps(props, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({"extracted": len(q), "training_candidates": manifest["records"], "excluded": rep["excluded"],
                  "proposals": len(props), "sha256": manifest["sha256"], "training_authorized": manifest["training_authorized"]}))
