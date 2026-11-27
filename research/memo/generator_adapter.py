"""Generator adapters for reflection_qa (Welle 4, Continuation R3). 2026-11-27 Europe/Berlin.

FileBackedGenerator replays model outputs that were produced by a REAL model session and stored
with provenance (model family, session reference, time, corpus chunk hashes). It refuses outputs
whose chunk hash does not match the chunk being processed, so a response can never be applied to
different text. Live adapters (existing NYXA model routing) plug in with the same call shape.
Ollama is excluded by policy.
"""
from __future__ import annotations
import hashlib, json

class FileBackedGenerator:
    def __init__(self, path: str):
        doc = json.load(open(path, encoding="utf-8"))
        prov = doc.get("provenance", {})
        for k in ("generator", "session", "created", "authorized_corpus"):
            if not prov.get(k): raise ValueError(f"provenance missing {k}")
        if "ollama" in json.dumps(prov).lower(): raise ValueError("ollama excluded by policy")
        self.provenance = prov
        self.by_hash = {r["chunk_sha256"]: r for r in doc["responses"]}

    def __call__(self, chunk: dict) -> dict:
        h = hashlib.sha256(chunk["text"].encode()).hexdigest()
        r = self.by_hash.get(h)
        if r is None: raise KeyError(f"no generator output bound to chunk {chunk['doc_id']}/{chunk['chunk_id']} ({h[:12]})")
        return {"direct": r.get("direct", []), "indirect": r.get("indirect", [])}


def to_candidate_proposals(train, *, actor: str, task_id: str, run_id: str, version: str):
    """Existing memory path, no new store: each governed QA becomes an ordinary proposal for the
    candidate store (target memory:/candidate, strict payload). Facts -> 'observation', inferences ->
    'documentation_note'. Gamma, mandates and promotion via Human Gate decide; nothing is written here."""
    out = []
    for x in train:
        claim_tag = "FACT" if x.epistemic == "fact" else "INFERENCE"
        out.append({
            "actor": actor, "action": "nyxa_memory_store_candidate", "target": "memory:/candidate", "scope": "memory:/",
            "claims": [{"tag": claim_tag, "statement": f"{x.question} -> {x.answer}"[:2000],
                        "source": ";".join(f"{s.doc_id}#{s.chunk_id}@{s.sha256[:12]}" for s in x.sources)[:500]}],
            "uncertainty": 0.2 if claim_tag == "FACT" else 0.4, "requestedCapabilityClass": "I1", "estimatedIrreversibility": "I1",
            "provenance": {"taskId": task_id, "runId": run_id, "requestingIdentity": actor},
            "payload": {"content": f"Q: {x.question}\nA: {x.answer}"[:4000],
                        "candidate_type": "observation" if claim_tag == "FACT" else "documentation_note",
                        "source": "agent", "scope": "project",
                        "purpose": f"reflection-qa {version} {x.qa_id} stage={x.stage}"[:500],
                        "confidence": 0.8 if claim_tag == "FACT" else 0.6, "importance": 0.4}})
    return out
