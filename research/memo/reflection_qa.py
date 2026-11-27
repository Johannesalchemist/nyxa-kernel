"""NYXA Reflection-QA pipeline (Welle 4) following MeMo arXiv:2605.15156v2, Section 4.1.

2026-11-27 Europe/Berlin. Owner: Johannes Suess. Generated with Claude Code. Status: DRAFT.
Paper stages (verbatim names from Sec. 4.1): 1 fact extraction (direct/indirect),
2 consolidation, 3 verification and rewriting (self-containment), 4 entity surfacing,
5 cross-document synthesis. The paper explicitly leaves provenance unhandled and does not
address temporal validity or contradictions; NYXA adds them here as hard governance:
every record carries sources, validity interval, consent state and an epistemic type
(fact / inference / hypothesis); revoked consent, missing provenance, expired validity,
unresolved contradictions and hypotheses never enter the training set.
LLM-dependent steps go through a pluggable `generator` (any model); nothing here trains.
"""
from __future__ import annotations
import hashlib, json, re
from dataclasses import dataclass, field, asdict, replace
from typing import Callable, Iterable

EPISTEMIC = ("fact", "inference", "hypothesis")
STAGES = ("extract_direct", "extract_indirect", "consolidated", "verified", "entity", "cross_doc")
_DEICTIC = re.compile(r"\b(he|she|it|they|this|that|these|those|the (document|passage|text|chunk|above|article))\b", re.I)


@dataclass(frozen=True)
class Source:
    doc_id: str
    chunk_id: str
    sha256: str


@dataclass(frozen=True)
class QA:
    qa_id: str
    question: str
    answer: str
    stage: str
    epistemic: str
    sources: tuple[Source, ...]
    entities: tuple[str, ...] = ()
    valid_from: str | None = None          # ISO date, inclusive
    valid_to: str | None = None            # ISO date, exclusive; None = open
    subjects: tuple[str, ...] = ()         # data subjects for consent/revocation
    parents: tuple[str, ...] = ()
    status: str = "candidate"              # candidate | contested | excluded

    def __post_init__(self):
        if self.stage not in STAGES: raise ValueError(f"stage:{self.stage}")
        if self.epistemic not in EPISTEMIC: raise ValueError(f"epistemic:{self.epistemic}")


def qa_id(question: str, answer: str, sources: Iterable[Source]) -> str:
    h = hashlib.sha256()
    h.update(question.strip().lower().encode()); h.update(b"\0"); h.update(answer.strip().lower().encode())
    for s in sorted(sources, key=lambda s: (s.doc_id, s.chunk_id)): h.update(f"\0{s.doc_id}/{s.chunk_id}/{s.sha256}".encode())
    return "qa-" + h.hexdigest()[:20]


def _mk(question, answer, stage, epistemic, sources, **kw) -> QA:
    sources = tuple(sorted(set(sources), key=lambda s: (s.doc_id, s.chunk_id)))
    return QA(qa_id(question, answer, sources), question.strip(), answer.strip(), stage, epistemic, sources, **kw)


# ---- Stage 1: fact extraction -------------------------------------------------------------------
def extract(chunks: list[dict], generator: Callable[[dict], dict]) -> list[QA]:
    """generator(chunk) -> {"direct": [...], "indirect": [...]} each item {q,a,entities?,valid_from?,valid_to?}.
    Direct extraction is recorded as fact, indirect (inferred) extraction as inference."""
    out = []
    for c in chunks:
        src = Source(c["doc_id"], c["chunk_id"], hashlib.sha256(c["text"].encode()).hexdigest())
        g = generator(c)
        for kind, stage, epi in (("direct", "extract_direct", "fact"), ("indirect", "extract_indirect", "inference")):
            for it in g.get(kind, []):
                out.append(_mk(it["q"], it["a"], stage, epi, [src], entities=tuple(it.get("entities", ())),
                               valid_from=it.get("valid_from"), valid_to=it.get("valid_to"),
                               subjects=tuple(c.get("subjects", ()))))
    return out


# ---- Stage 2: consolidation ---------------------------------------------------------------------
def _intersect(a_from, a_to, b_from, b_to):
    lo = max([x for x in (a_from, b_from) if x], default=None)
    hi = min([x for x in (a_to, b_to) if x], default=None)
    return (lo, hi) if not (lo and hi and lo >= hi) else None


def consolidate(qas: list[QA], merger: Callable[[list[QA]], dict | None]) -> list[QA]:
    """Q_con = Q_raw ∪ Q_mrg. Groups pairs sharing an entity; merger(group) -> {q,a} or None.
    Merged pairs are at most `inference`; validity is the intersection (disjoint -> not merged)."""
    by_entity: dict[str, list[QA]] = {}
    for x in qas:
        for e in x.entities: by_entity.setdefault(e, []).append(x)
    merged = []
    for ent, group in sorted(by_entity.items()):
        if len(group) < 2: continue
        win = (None, None)
        for g in group:
            win = _intersect(win[0], win[1], g.valid_from, g.valid_to) if win is not None else None
        if win is None: continue
        m = merger(group)
        if not m: continue
        merged.append(_mk(m["q"], m["a"], "consolidated", "inference",
                          [s for g in group for s in g.sources], entities=(ent,), valid_from=win[0], valid_to=win[1],
                          subjects=tuple(sorted({s for g in group for s in g.subjects})), parents=tuple(g.qa_id for g in group)))
    return qas + merged


# ---- Stage 3: verification and rewriting (self-containment) -------------------------------------
def self_contained(x: QA) -> bool:
    return not _DEICTIC.search(x.question)


def verify(qas: list[QA], rewriter: Callable[[QA], dict | None] | None = None) -> list[QA]:
    """Keep self-contained pairs; rewrite others (with the chunk context, via rewriter); discard
    pairs still ambiguous after rewriting (paper: unresolved pronouns, implicit references)."""
    out = []
    for x in qas:
        if self_contained(x):
            out.append(x); continue
        r = rewriter(x) if rewriter else None
        if r:
            y = replace(x, question=r["q"].strip(), answer=r.get("a", x.answer).strip())
            if self_contained(y):
                out.append(replace(y, qa_id=qa_id(y.question, y.answer, y.sources), parents=y.parents + (x.qa_id,)))
    return out


# ---- Stage 4: entity surfacing (reversal-curse mitigation) --------------------------------------
def surface_entities(qas: list[QA], describer: Callable[[str, list[QA]], str | None]) -> list[QA]:
    """For each named entity: question encodes its attributes/relations, answer is its identity."""
    out = []
    groups: dict[str, list[QA]] = {}
    for x in qas:
        for e in x.entities: groups.setdefault(e, []).append(x)
    for ent, grp in sorted(groups.items()):
        q = describer(ent, grp)
        if q:
            epi = "fact" if all(g.epistemic == "fact" for g in grp) else "inference"
            out.append(_mk(q, ent, "entity", epi, [s for g in grp for s in g.sources], entities=(ent,),
                           subjects=tuple(sorted({s for g in grp for s in g.subjects})), parents=tuple(g.qa_id for g in grp)))
    return out


# ---- Stage 5: cross-document synthesis ----------------------------------------------------------
def cross_document(qas: list[QA], doc_groups: list[set[str]], synthesizer: Callable[[str, list[QA]], dict | None]) -> list[QA]:
    """Converging clues: one entity supported by >= 2 documents of the same group. Output is
    `inference` (never fact) and keeps every contributing source. Cost ~ O(groups * pairs)."""
    out = []
    for grp in doc_groups:
        per_entity: dict[str, list[QA]] = {}
        for x in qas:
            if {s.doc_id for s in x.sources} <= grp:
                for e in x.entities: per_entity.setdefault(e, []).append(x)
        for ent, items in sorted(per_entity.items()):
            if len({s.doc_id for i in items for s in i.sources}) < 2: continue
            r = synthesizer(ent, items)
            if r:
                out.append(_mk(r["q"], r["a"], "cross_doc", "inference", [s for i in items for s in i.sources],
                               entities=(ent,), subjects=tuple(sorted({s for i in items for s in i.subjects})),
                               parents=tuple(i.qa_id for i in items)))
    return out


# ---- NYXA governance (not in the paper) -------------------------------------------------------------
def _norm(q: str) -> str:
    return re.sub(r"\W+", " ", q.lower()).strip()


def govern(qas: list[QA], *, revoked_subjects: set[str], as_of: str) -> tuple[list[QA], dict]:
    """Returns (training_set, report). Exclusion reasons are counted, never silently dropped."""
    report = {"input": len(qas), "excluded": {}}
    def ex(reason): report["excluded"][reason] = report["excluded"].get(reason, 0) + 1
    keep = []
    for x in qas:
        if not x.sources: ex("no_provenance"); continue
        if set(x.subjects) & revoked_subjects: ex("consent_revoked"); continue
        if x.valid_to and x.valid_to <= as_of: ex("validity_expired"); continue
        if x.valid_from and x.valid_from > as_of: ex("not_yet_valid"); continue
        if x.epistemic == "hypothesis": ex("hypothesis_not_trainable"); continue
        keep.append(x)
    by_q: dict[str, list[QA]] = {}
    for x in keep: by_q.setdefault(_norm(x.question), []).append(x)
    final = []
    for group in by_q.values():
        answers = {_norm(g.answer) for g in group}
        if len(answers) > 1:
            for _ in group: ex("contradiction_unresolved")
            report.setdefault("contested", []).append(sorted(g.qa_id for g in group))
            continue
        final.append(sorted(group, key=lambda g: g.qa_id)[0])   # identical answers: deduplicate
    report["training"] = len(final)
    return sorted(final, key=lambda g: g.qa_id), report


def export(qas: list[QA], report: dict, version: str) -> tuple[str, dict]:
    """Versioned JSONL + manifest (sha256, counts, exclusion reasons). Authorization to TRAIN on
    it is a separate human decision; this function only prepares the candidate dataset."""
    lines = "".join(json.dumps(asdict(x), sort_keys=True, ensure_ascii=False) + "\n" for x in qas)
    manifest = {"schema": "nyxa-reflection-qa-dataset-v1", "version": version, "records": len(qas),
                "sha256": hashlib.sha256(lines.encode()).hexdigest(), "governance": report,
                "source_paper": "arXiv:2605.15156v2", "training_authorized": False}
    return lines, manifest
