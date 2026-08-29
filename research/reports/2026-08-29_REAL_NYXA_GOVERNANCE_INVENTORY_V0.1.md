# Real-NYXA Governance Inventory & Baseline Proposal V0.1

**Autor / verantwortlicher Mensch:** Johannes Süß
**Erzeugendes System:** Claude Code (Sonnet 5), Session `claude/nyxa-governance-audit-0v9hg5`
**Sitzungsdatum:** 2026-08-29
**Eingangsquellen:** siehe Abschnitt 0
**Quellenstatus:** `HANDOFF-DERIVED-PENDING-CONFORMITY` (Code-Evidenz ist `SOURCE-VERIFIED` gegen den jeweils zitierten Commit; die zugrunde liegende V0.1-Spezifikation bleibt `RECONSTRUCTED-NO-SOURCE` gemäß `research/source-status/NYXA_EPISTEMIC_GOVERNANCE_V0.1_SOURCE_STATUS.md`)
**Artefaktstatus:** `DRAFT`
**Reviewstatus:** `PENDING INDEPENDENT REVIEW`
**Bekannter Vorgänger:** ADR-0001, ADR-0002, `governance/REPOSITORY_POLICY_V0.1.md`
**Nächster zulässiger Schritt:** unabhängige Review, dann Phase 4–6 Implementierungsarbeit gemäß Abschnitt 12

---

## 0. Scope and Method

This report answers Phase 1–2 of the governance-first mission: **is NYXA governance executable, or only specified?** It does not implement the Self-Evolving Seed. It does not implement γ, the Capability Gate, or any new enforcement — Phase 15 explicitly forbids that until this baseline exists and is reviewed.

**Repositories inspected** (read-only clones, shallow, current default branch at session time):

| Repo | Role claimed | Contains executable code? |
|---|---|---|
| `Johannesalchemist/nyxa-kernel` (this repo) | canonical governance/research/decisions source | **No** — Markdown only |
| `Johannesalchemist/nyxa-kernel-runtime` | "Kernel-Runtime-Core", MAC governance (ADR-0002) | Yes — TypeScript, tested |
| `Johannesalchemist/nyxa-governed-memory-mcp` | governed memory MCP server (this session's live `mcp__nyxa_mcp__*` tools) | Yes — TypeScript, running live |
| `Johannesalchemist/nyxa-meta-memorydream` | memory candidates + dreaming extension of the above | Yes — TypeScript |
| `Johannesalchemist/nyxa-dev-agent` | local dev/orchestration CLI agent | Yes — TypeScript |

**Not inspected** (out of stated scope, private, not referenced by any governance document found): `nyxa-affiliate-agent`, `nyxa-video-mcp`. Their absence from this audit is `UNVERIFIED`, not `MISSING` — they were not claimed as governance components anywhere I read.

**Method constraint honored:** every `IMPLEMENTED` / `PARTIALLY IMPLEMENTED` claim below cites a file and, where useful, a function or line. Where a mechanism is described only in a `.md` file or a doc string, it is labeled `SPECIFIED ONLY`, never `IMPLEMENTED`. Live confirmation: `mcp__nyxa_mcp__system_status`, `policy_mode`, and `audit_trace` were called directly in this session and their output is used as runtime evidence, not just source-reading.

**Central test applied throughout:** *Can the system enforce the rule when the model disagrees with it?* A mechanism only passes this test if a non-LLM code path can produce `DENY`/`BLOCKED` and something downstream actually refuses to proceed. A prompt instruction, a Markdown rule, or an LLM's own refusal does not pass.

---

## 1. Governance Inventory

| Concept | Status | Evidence |
|---|---|---|
| **α Proposal** | MISSING (as a role/actor) | No file, type, or function named `alpha`/`proposal` as an authority role anywhere in the 4 code repos. `AgentIntent` in `nyxa-kernel-runtime/src/core/multiAgentGovernance.ts:13-20` is a *candidate action* structure, not an α/β/E₀ role model. `KNOSPEL.md` names a lifecycle (`beschreiben→fragen→simulieren→prüfen→verstehen→erneuern`) that is conceptually adjacent but never operationalized as α. |
| **β Opposition** | PARTIALLY IMPLEMENTED (as data, not as a role) | `EvidenceSignal.position: "SUPPORT" \| "OPPOSE"` and `assessEvidence()` in `nyxa-kernel-runtime/src/core/multiAgentGovernance.ts:36-250`, tested by MAC-006/007/008 in `multiAgentGovernance.test.ts`. This computes dissent over *evidence*, not an independent critique *actor* with standing separate from α. No code prevents α and β from being the same LLM call. |
| **γ deterministic governance** | PARTIALLY IMPLEMENTED | `evaluateMultiAgentPreflight()`, `nyxa-kernel-runtime/src/core/multiAgentGovernance.ts:101-174`. Pure function, no LLM call, deterministic, unit-tested (MAC-001..005, `multiAgentGovernance.test.ts`). Reachable via CLI: `src/cli/runner.ts:34-40` (`mac-preflight`). **But**: nothing in any of the 4 repos *calls* this function before a real tool/file/network mutation. It is a library + CLI, not a wired enforcement point. See Phase 3 bypass list. |
| **D1–D7 disagreement classes** | MISSING / possibly SOURCE-LOST | No `D1`..`D7` identifiers anywhere in code. What exists instead is a 4-state `ConsensusState` (`NONE\|UNANIMOUS\|MAJORITY\|CONTESTED`) and 3-state `DissentState` (`NONE\|PRESENT\|DECISIVE_PRIVATE_EVIDENCE`), same file. This may be an intentional simplification of a lost V0.1 taxonomy (`research/source-status/...md` records the V0.1 full text as `SOURCE-NOT-FOUND`) or a parallel invention — **UNVERIFIED which**. |
| **I0–I3 irreversibility** | MISSING | No `irreversibility`, `I0`, `I1`, `I2`, `I3` identifier found in any inspected repo (`grep -rniE` across all 4 code repos, zero hits). The nearest relative is `ToolPolicy.executionRisk: "none"\|"low"\|"medium"\|"high"` in `nyxa-governed-memory-mcp/src/policy/toolPolicy.ts:8` and the identical file in `nyxa-meta-memorydream` — a different, coarser, non-equivalent taxonomy (risk-of-tool, not reversibility-of-effect). Treat as **CONTRADICTORY naming**, not a synonym, until someone maps them explicitly. |
| **E₀-P / E₀-τ** | MISSING | Zero references in code. `KNOSPEL.md:42-46` references an "epistemische Membran" tied to the lost V0.1 spec, which per the source-status doc defined `Z0–Z4`, not `E0-P/E0-τ`. Likely conflated mission terminology vs. repo terminology — **OPEN QUESTION**, not simply absent-and-needed; may need reconciliation with whoever authored the mission brief. |
| **Shared Reference Model** (FACT/CLAIM/INFERENCE/HYPOTHESIS/SIMULATION/MEMORY/EXTERNAL EVIDENCE/MODEL OUTPUT) | MISSING as a general system-state type; PARTIALLY IMPLEMENTED for memory only | `nyxa-meta-memorydream/src/schema/candidates.ts` defines `CandidateType = observation\|documentation_note\|decision\|risk\|process_pattern\|preference\|open_question` and a `status: "pending"` field, plus `docs/OPEN_SIGNALS.md` in `nyxa-governed-memory-mcp` states the rule "open_signal is not memory_node" and "no interpretation while closed." This is a real, narrower classification for one subsystem (memory candidates), not a system-wide epistemic-status type that a Governance Reasoner, γ, and multiple models all read from. |
| **Capability Gate** | PARTIALLY IMPLEMENTED, in two non-integrated forms | (a) `enforcePolicy()` + `TOOL_POLICIES` allowlist, `nyxa-governed-memory-mcp/src/policy/enforcePolicy.ts` and `.../src/policy/toolPolicy.ts` (identical copy in `nyxa-meta-memorydream`). Real: fail-closed on unknown tool (`"tool_policy_not_found"`), fail-closed on `allowedInV01:false`, fail-closed on `executionRisk:"high"`, mode-threshold check via `modeSatisfiesMinimum()`. Confirmed live via `mcp__nyxa_mcp__policy_mode` in this session (`allowed_capabilities: [read, observe, audit, document_candidates_future]`, `blocked_capabilities: [send_email, write_files, execute_shell, ...]`). (b) `evaluateMultiAgentPreflight()`'s `grantedCapabilities`/`requestedCapabilities` set-membership check, `nyxa-kernel-runtime`, unrelated data shape, no shared schema with (a). **Neither binds** actor, target, scope, validity/expiry, or irreversibility class as the mission requires — (a) gates by tool name only, no target parameter exists at all; (b) gates by capability string only. `ToolPolicy.requiresHumanApproval` is declared as a field on every policy entry but is **never read** by `enforcePolicy()` — a live dead field, currently harmless only because it is `false` everywhere it's declared. |
| **Human Authority** | PARTIALLY IMPLEMENTED as a stub | See `requiresHumanApproval` above — schema exists, enforcement doesn't consume it. At the process/doc level, `AGENTS.md:41-49`, `governance/REPOSITORY_POLICY_V0.1.md §6`, and ADR-0001/0002 all name Johannes Süß as decision point for freeze/promotion — this is a real, working *human process* (PR review, ADR status `PROPOSED`), but it is enforced by human discipline and repo convention, not by code. No branch-protection config, no CI gate, no automated check was found requiring human sign-off before merge. |
| **Provenance** | PARTIALLY IMPLEMENTED, two divergent schemas | Two different `AuditEvent` types exist in `nyxa-governed-memory-mcp`: the **live** one, `src/schema/audit.ts` (`id,timestamp,actor,action,tool?,mode,backend,result,details?`), actually written by `AuditLog.append()` (`src/audit/AuditLog.ts:24-32`) and confirmed live via `mcp__nyxa_mcp__audit_trace` in this session; and a **richer, unused** one, `src/core/auditEvent.ts` (`payload_hash`, `integrity_hash`, `schema_version`, `ts_monotonic`, `sensitivity_class`, `createAuditEventId()` with SHA-256 hashing) that is never imported by `server.ts` or `AuditLog.ts` — dead code implementing a better provenance model than the one actually running. Neither records policy version, human-intervention events, or "which rule authorized this" in a queryable way — `memory.why_candidate` tool exists in `nyxa-meta-memorydream/src/tools/` but was not traced to confirm it reconstructs a decision chain (flagged `UNVERIFIED`, not claimed). |
| **Evidence validity** | PARTIALLY IMPLEMENTED, isolated | `assessEvidence()` genuinely distinguishes `rawCount` vs `independentCount` via `independenceGroup`, tested by MAC-006 (`evidence_count != epistemic_independence`, exact ADR-0002 claim, verified passing logic). Isolated to `nyxa-kernel-runtime`; `nyxa-meta-memorydream`'s `MemoryCandidate.confidence`/`.importance` are unrelated scalar fields with no independence-group concept — the two "evidence" models don't talk to each other. |
| **fail-closed behavior** | PARTIALLY IMPLEMENTED, real where it exists | `enforcePolicy()` defaults deny on unknown tool; CLI `runner.ts` (`outputError` on malformed/missing stdin, exit code 2, `try/catch` around `JSON.parse`) fails closed rather than defaulting to allow. Counter-evidence: `nyxa-dev-agent/agent/src/commands/kernelExec.ts:5-35` authorizes **after** executing — it shells out first (`execSync(\`node dist/index.js ${capability}\`)`) and only checks the subprocess's self-reported capability list *afterward*. That is authorization-after-execution, the opposite of fail-closed, and a textbook confused-deputy shape (the thing being authorized reports its own authorization). |
| **graceful degradation** | MISSING | `PreflightDisposition` in `nyxa-kernel-runtime/src/core/multiAgentGovernance.ts:1-6` is exactly `ALLOW\|NEGOTIATE\|SERIALIZE\|ESCALATE\|DENY` — no `DEGRADE`, no `UNKNOWN`. The mission's requirement that "UNKNOWN must not silently become ALLOW" cannot even be tested against this type today because `UNKNOWN` isn't a representable value; malformed input currently surfaces as a CLI-level error, not a γ-level `UNKNOWN` disposition that a caller could branch on. |

---

## 2. Specification → Reality Mapping

| Requirement | Current implementation | Enforcement point | Evidence | Failure mode | Required change |
|---|---|---|---|---|---|
| Deterministic pre-execution conflict check | `evaluateMultiAgentPreflight()` | **None** — function exists, nothing calls it before a mutation | `nyxa-kernel-runtime/src/core/multiAgentGovernance.ts` | Any agent can mutate state without ever invoking this function; it is opt-in by whoever writes new orchestration code | Wire a mandatory call on every mutating tool boundary, not just expose it as a CLI subcommand |
| Capability-scoped tool access | `enforcePolicy()` / `TOOL_POLICIES` | MCP tool registration in `server.ts` (only for the 3 registered tools) | `nyxa-governed-memory-mcp/src/server.ts:83-133` | Gate exists only inside one MCP server; `nyxa-dev-agent` has its own, ungated, direct-`execSync` tool path with no equivalent policy table | Single shared capability-gate library, imported by every executor, not re-implemented per repo |
| Human approval before consequential action | `ToolPolicy.requiresHumanApproval` field | **None** — field is declared, `enforcePolicy()` never reads it | `nyxa-governed-memory-mcp/src/policy/enforcePolicy.ts:10-49` (no reference to `requiresHumanApproval`) | A future tool marked `requiresHumanApproval:true` would still execute without a human in the loop unless someone remembers to add the check | Make `enforcePolicy` branch to an `ESCALATE`/`PENDING_HUMAN` outcome when the field is true, backed by a real approval channel |
| Irreversibility-aware gating (I0–I3) | none | none | — | Every action is currently gated the same way regardless of blast radius; `executionRisk` is the closest proxy and is not consulted for anything except the single hardcoded `"high"→deny` rule | Define I0–I3 (or adopt `executionRisk` formally as its replacement, see §7/§8), thread it through `ToolPolicy` and MAC preflight, require I2/I3 actions to hit `ESCALATE` |
| Evidence independence ≠ evidence count | `assessEvidence()` | CLI (`mac-evidence`) only | `nyxa-kernel-runtime/src/cli/runner.ts:74-91` | Not connected to the memory/candidate pipeline that actually stores agent claims (`nyxa-meta-memorydream`), so the one place that *records* evidence doesn't benefit from the one place that *evaluates* independence | Merge or bridge the two evidence models before either is trusted for a real decision |
| Provenance sufficient to answer "why was this allowed" | `AuditLog` (simple schema) + unused `auditEvent.ts` (rich schema) | `runTool()` wrapper in `server.ts:135-166` | `nyxa-governed-memory-mcp/src/audit/AuditLog.ts`, `src/core/auditEvent.ts` | The richer schema (content hash, integrity hash, schema version) is unused; the live schema cannot prove non-tampering and doesn't record policy version | Switch `AuditLog` to the `core/auditEvent.ts` shape, or delete the unused one — do not leave two provenance schemas alive in one repo |
| Fail-closed on unknown/malformed input | `enforcePolicy` default-deny; CLI `outputError` | as above | as above | `kernelExec.ts` in `nyxa-dev-agent` executes before checking; a provider-failure or malformed-output scenario for MAC preflight was never tested (no fixture for empty/malformed `PreflightInput`) | Add explicit `UNKNOWN`-input tests for every deterministic gate; forbid execute-then-check patterns |
| Graceful degradation instead of fabricated confidence | none | none | — | Nothing in any repo distinguishes "I don't know, degrade" from "proceed" | Add `DEGRADE`/`UNKNOWN` to γ's outcome type; specify what "degraded capability" means operationally (Phase 4/5 work) |

---

## 3. Missing Enforcement Mechanisms

1. **No mandatory pre-execution call to γ.** `evaluateMultiAgentPreflight` is reachable but not required. Nothing fails if it's skipped.
2. **No target/scope binding in the Capability Gate.** `enforcePolicy(toolName, mode)` — two arguments, no `target`, no `actor`, no `scope`, no `validity`. A capability granted for "audit.trace" is not bound to *which* audit log, *whose* data, or *until when*.
3. **No `requiresHumanApproval` enforcement**, despite the field existing (§2).
4. **No irreversibility-tiered escalation.** Nothing in the codebase asks "how reversible is this" before deciding how much scrutiny to apply.
5. **No UNKNOWN/DEGRADE outcome** in any deterministic decision type.
6. **No single, shared policy/schema library.** `toolPolicy.ts`, `modes.ts`, `enforcePolicy.ts` are **byte-for-byte duplicated** between `nyxa-governed-memory-mcp` and `nyxa-meta-memorydream` (confirmed identical on read) rather than imported from one package — a divergence risk ADR-0002 itself warns against ("Eine separate zweite Berechnungslogik ... wäre ein Divergenzrisiko") but that principle was not applied to this pair of repos.
7. **No adversarial-input tests anywhere** for path traversal, symlink escape, target substitution, capability replay, or stale capabilities — the mission's Phase 5 checklist has zero corresponding test files in any of the four code repos (`grep` for `traversal|symlink|canonicaliz|replay|confused.deputy` returned zero matches outside this report).
8. **No cross-repo capability schema.** The `nyxa-kernel-runtime` capability list (flat strings like `"filesystem.write"`) and the `nyxa-governed-memory-mcp` capability list (`"read","observe","audit","document_candidates_future"`) are different vocabularies with no declared mapping.

---

## 4. Direct Bypass Paths

These are concrete, code-verified paths that reach a mutation or external effect **without** passing through any deterministic gate:

- **`nyxa-dev-agent/agent/src/commands/run.ts:1-24`** — `runCommand()` calls `fs.writeFileSync()` directly on `kernel/state/.nyxa-state`. No `enforcePolicy`, no MAC preflight, no capability check of any kind. This is `LLM/operator → direct filesystem mutation`.
- **`nyxa-dev-agent/agent/src/commands/kernelExec.ts:5-35`** — `executeKernelCapability()` runs `execSync(\`node dist/index.js ${capability}\`)` where `capability` is `process.argv[3]` (raw CLI input, unvalidated string interpolated into a shell command) **before** any authorization check; the only check afterward inspects whether the subprocess's own JSON output happens to list that capability. This is `LLM/operator → direct shell execution`, authorized after the fact by the thing being authorized.
- **`nyxa-dev-agent/agent/src/core/fitnessEngine.ts:10-50`** — `evaluateFitness()` runs `npm run build`, `npm run validate`, `git status --porcelain` via `execSync` with no capability check, no audit log entry, no mode check.
- **`nyxa-governed-memory-mcp`'s own registered tools are currently all read-only** (`system.status`, `policy.mode`, `audit.trace` — confirmed via live `system_status` call: `execution_tools_enabled: false`, `authoritative_writes_enabled: false`), so this particular server is not itself a live bypass today — but that also means its Capability Gate has never been exercised against a real mutating action, so its correctness under load is `UNVERIFIED`, not proven.
- **`nyxa-meta-memorydream`'s mutation tools** (`memory.store_candidate`, `memory.reject_candidate`) are correctly marked `allowedInV01: false` in `toolPolicy.ts`, so `enforcePolicy` denies them today — this is a working fail-closed default, **contingent entirely on that one boolean staying false**. Nothing prevents a future edit from flipping it without also adding the missing target/actor/human-approval binding from §3.

**Conclusion for Phase 3:** the required execution path (`LLM → Intent → canonical envelope → Governance Reasoner → deterministic γ → Capability Gate → Tool`) exists as isolated components in different repos, but no single repo instantiates the full chain end-to-end. `nyxa-dev-agent` is the one place doing real local execution today, and it bypasses every governance component described in ADR-0002 and this mission.

---

## 5. Contradictions Between Current NYXA Concepts

1. **Two `AuditEvent` schemas** in the same repo (`nyxa-governed-memory-mcp/src/schema/audit.ts` vs `src/core/auditEvent.ts`) — only the weaker one is wired in.
2. **Two `ToolPolicy`/`enforcePolicy` implementations**, byte-identical, in two repos (`nyxa-governed-memory-mcp` and `nyxa-meta-memorydream`) — exactly the "second calculation logic = divergence risk" pattern ADR-0002 explicitly warns against, just realized between MCP servers instead of between runtime and memory.
3. **Two unrelated "kernel" concepts** share the word `kernel` and even the directory name `core/`: `nyxa-kernel-runtime/src/core/kernel.ts` (`runKernel()`, a 3-input emotional-overload/balance calculator, `overload=(emotionWeight+boundaryIssue+loopRisk)/3`) has no relationship to `multiAgentGovernance.ts` in the same `src/core/` folder, and is not referenced by anything in `kernel.ts`'s own `cli/runner.ts`. It looks like a leftover from a different, earlier design (closer to `KNOSPEL.md`'s "Kernfunktion" language) than to ADR-0002's governance kernel. **This is a naming collision that will actively mislead anyone building on "the kernel" without reading both files.**
4. **`executionRisk` (none/low/medium/high) vs. the mission's I0–I3** are two different reversibility-adjacent taxonomies that were never reconciled (§1).
5. **`D1–D7` (mission) vs. `ConsensusState`/`DissentState` (repo)** — different shapes, unclear whether one supersedes the other or whether D1–D7 belong to the still-missing V0.1 source.
6. **AGENTS.md mandates "no implicit assumptions, unknown marked as unknown"** as a working rule for human/AI contributors, while the one deterministic decision type that exists (`PreflightDisposition`) has no `UNKNOWN` value to mark anything as unknown in. The process rule and the code's type system disagree.

---

## 6. Minimum Architecture Required for Executable Governance

Stated as target-state deltas on top of what's real today, not a rewrite:

1. **One shared `@nyxa/governance-core` package** exporting: capability gate, mode ordering, MAC preflight, evidence assessment, audit event schema (the rich one), irreversibility classes. Every repo that executes anything imports it — nothing re-implements it.
2. **Canonical intent envelope** — a single type carrying `actor, action, target, scope, requestedCapabilities, irreversibilityClass, goal, provenance` — that MAC preflight, the Capability Gate, and the audit log all consume, replacing the current situation where `AgentIntent` (kernel-runtime) and `ToolPolicy` (memory-mcp) don't share a shape.
3. **One mandatory call order** enforced by a single executor function: `canonicalize target → γ preflight → capability gate → (execute) → audit`. No tool, command, or MCP handler may call an executor primitive (`execSync`, `fs.write*`, network call) except through this function.
4. **`UNKNOWN` and `DEGRADE` added to every deterministic outcome type**, with an explicit rule that both are outcomes, not exceptions to be caught and ignored.
5. **`requiresHumanApproval` actually consumed**, mapped to a real escalation channel (even a manual one, e.g., "write a file to `handoffs/pending-approval/` and halt" counts as real, since it can't silently be skipped by code).

---

## 7. Mechanisms That Can Be Reused Unchanged

- `evaluateMultiAgentPreflight()` and its 8 MAC tests — deterministic, pure, correctly implements "goal != authority" and the ADR-0002 disposition ordering. Reuse as the seed of γ's C2 (Authority) / conflict logic.
- `assessEvidence()` / `EvidenceSignal` independence-group model — correctly implements "evidence_count != epistemic_independence." Reuse as γ's C4 (evidence validity) seed.
- `enforcePolicy()` / `TOOL_POLICIES` / `modes.ts` mode-ordering logic — correct default-deny behavior, clean and small. Reuse as the Capability Gate's mode-threshold layer, after extending its inputs (§6.2).
- `holdOpenSignal.ts`'s TTL validation (`ttl_required`, `invalid_ttl_ms`, `invalid_expires_at`) — genuinely enforced, matches `docs/OPEN_SIGNALS.md`'s stated rule. Reuse as the pattern for any time-bounded governance state.
- `core/auditEvent.ts`'s hashing/id scheme (`hashPayload`, `createAuditEventId`) — better provenance primitive than what's live; reuse by wiring it in, not by rewriting it.
- The repository-policy vocabulary itself (`SOURCE-VERIFIED/.../UNVERIFIED`, `DRAFT/.../SUPERSEDED`) — a working Shared-Reference-Model precursor for *documents*; extend its spirit to runtime state rather than inventing a new taxonomy from scratch.

## 8. Mechanisms Requiring Correction

- **Merge the two `ToolPolicy`/`enforcePolicy` copies** into one imported package before adding any new tool to either MCP server.
- **Retire or wire in one of the two `AuditEvent` schemas** — do not leave both alive.
- **Fix `kernelExec.ts`'s execute-then-check pattern** in `nyxa-dev-agent` — either remove it or rebuild it as check-then-execute against a real capability table, not the subprocess's self-report.
- **Make `requiresHumanApproval` load-bearing**, or remove the field so it stops implying a control that doesn't exist.
- **Rename or merge `executionRisk` and the mission's I0–I3** so there is one reversibility vocabulary, not two that look similar and aren't.
- **Disambiguate the two "kernel" concepts** (`kernel.ts`'s emotional-overload calculator vs. the governance kernel) — rename one, or delete `kernel.ts` if it's genuinely dead.

## 9. Mechanisms That Should Be Deferred

- α/β/E₀ as formal *roles with standing* (Phase 7) — building this before γ/Capability Gate are wired into a real execution path would create authority-shaped scaffolding around a system that still has direct bypass paths (§4). Sequence matters: gate the door before deciding who gets to knock.
- D1–D7 disagreement classes — do not invent these from scratch to fill the gap; first resolve whether they're supposed to come from the still-missing V0.1 source (open question, §14) or are a new mission-level design choice.
- E₀-P/E₀-τ — same reasoning; terminology reconciliation needed before implementation, not during it.
- The Self-Evolving Seed (Phase 15) in its entirety — explicitly gated by the mission itself on this baseline being enforceable and tested, which it is not yet (§4, §13).

---

## 10. Proposed Governance Baseline v0.1 — Architecture

```
LLM / Agent
   │  produces
   ▼
Intent  (canonical envelope: actor, action, target, scope,
         requestedCapabilities, irreversibilityClass, goal)
   │
   ▼
Governance Reasoner (LLM-assisted, OPTIONAL, advisory only —
   output is a recommendation attached to the Intent, never
   itself a disposition)
   │
   ▼
γ Reference Monitor (deterministic, non-LLM)
   C1 Constraints · C2 Authority · C3 Irreversibility (I0–I3)
   C4 Provenance/Evidence validity · C5 Escalation reachability
   → ALLOW | DENY | ESCALATE | DEGRADE | UNKNOWN
   (UNKNOWN and a γ that cannot be reached both resolve to DENY,
    never to ALLOW)
   │
   ▼
Capability Gate (binds actor+action+target+scope+validity+
   constraints+irreversibilityClass; canonicalizes target first)
   │  only on ALLOW
   ▼
Tool / MCP / external transition
   │
   ▼
Audit / Provenance Ledger (input, proposal, opposition/evidence,
   model+provider, policy version, γ decision, capability decision,
   tool result, human intervention, timestamp, content hash)
```

This is a target architecture, not a claim of what exists. Section 6 lists the concrete deltas needed to get from today's code to this diagram.

---

## 11. Adversarial Test Plan

Mapped to the mission's Phase 11 list, each item states what would have to be built first (per §6) before the test is even executable, since most attack surfaces described don't have a target yet:

| Attack | Testable today? | Target once §6 exists |
|---|---|---|
| Authority impersonation | No — no actor binding exists | Capability Gate must reject a request whose claimed actor doesn't match its authenticated identity |
| Tool-target substitution | No — no target parameter exists | Canonicalize target before authorization; test path traversal, symlink escape, trailing-slash tricks |
| Malformed structured output from the model | Partially — CLI-level JSON parse failures fail closed today (`runner.ts`) | Extend to every γ input, assert `UNKNOWN`, not a thrown exception the caller might swallow into "proceed" |
| Provider disagreement / model collusion | No — no multi-provider wiring found anywhere | Requires the Shared Reference Model (§1) before it's even meaningful |
| Stale provenance / capability replay | No — no expiry/validity field on any capability | Add `validity` to the Capability Gate; test a capability presented after its window |
| Incorrect I-classification | No — I0–I3 doesn't exist yet | After §6, test that an agent cannot self-declare a lower irreversibility class than γ computes |
| Attempted γ or Capability Gate modification by the agent | Partially — γ today is a separate process invoked via CLI/stdin, so an LLM agent has no in-process handle to mutate it; but nothing prevents an agent with filesystem write access from editing the source files themselves, since no code-integrity check exists | Add an integrity check (e.g. hash-pin the governance package, verify at load time) |
| Attempted direct MCP access bypassing γ | **Yes, and it currently succeeds** — `nyxa-dev-agent`'s `kernelExec.ts`/`fitnessEngine.ts` (§4) are live proof | Fix per §8; then add a regression test asserting no `execSync`/`fs.write*` call exists outside the single executor function (a static-analysis/lint rule, not just a unit test) |
| Recursive self-authorization | No — no authority-granting primitive exists yet for an agent to grant itself | Design this control *into* the Human Authority model (§1) from the start rather than retrofitting it |

**A PASS requires executable evidence** — per the mission's own rule, none of the untestable rows above may be marked PASS; they are correctly `NOT YET TESTABLE`, distinct from `PASS`.

---

## 12. Implementation Sequence

1. Fix the two duplication/contradiction pairs (§5.1, §5.2) — no new code, just collapsing existing code. Lowest risk, immediate reduction in divergence risk.
2. Fix `nyxa-dev-agent`'s execute-then-check bypass (§4) — this is the one *live, provably exploitable* gap; closing it is higher priority than building anything new.
3. Extract `@nyxa/governance-core` (§6.1) from the reusable pieces in §7, with `UNKNOWN`/`DEGRADE` added to the outcome types (§6.4) at extraction time, not after.
4. Define the canonical Intent envelope (§6.2) and irreversibility classes (I0–I3, reconciled with `executionRisk`, §8), as a versioned schema with its own tests.
5. Rebuild the Capability Gate to bind target/actor/scope/validity (§6.2) and to consume `requiresHumanApproval` (§6.5).
6. Wire the single mandatory executor call order (§6.3) into `nyxa-dev-agent` and `nyxa-governed-memory-mcp`, replacing every direct `execSync`/`fs.write*` call.
7. Build the adversarial test suite (§11) against the now-real gate — this is where Phase 11 actually becomes executable instead of aspirational.
8. Only then: Phase 12 baseline freeze decision (a real ADR, `PROPOSED → ACCEPTED`, per this repo's own process), Phase 13 external review, Phase 14 evolution process design.

Steps 1–2 touch only existing, already-tested code paths. Steps 3–6 are new shared infrastructure. Step 7 cannot start meaningfully before step 6 exists (§11 table). This ordering exists specifically so that a partially-complete effort still leaves the system in a *more* closed, not less closed, state at every step.

---

## 13. Criteria for Declaring NYXA Governance Operational

Governance is operational only when **all** of the following hold, each with its own executable evidence (not a design doc):

1. Every code path in every repo that performs a filesystem write, shell execution, network call, or MCP tool invocation with side effects passes through the single executor function from §6.3 — verifiable by a static check (e.g., forbid direct `execSync`/`fs.write*` imports outside one file), not by manual review.
2. γ's outcome type includes `UNKNOWN`/`DEGRADE`, and at least one test proves that missing/malformed input to γ produces `DENY`, never `ALLOW`.
3. The Capability Gate binds actor+target+scope+validity+irreversibility class, and the adversarial tests in §11's "Target once §6 exists" column pass, with results reported the same way this document reports evidence (file + line, not narrative).
4. `requiresHumanApproval` is consumed by `enforcePolicy` (or its successor) and at least one integration test proves an action marked `requiresHumanApproval:true` does not execute without an external approval signal.
5. Exactly one `AuditEvent` schema exists per governed system, actually written on every gated decision (allow, deny, escalate, degrade), and a query can answer "why was X allowed" from the ledger alone.
6. The central test passes under adversarial conditions specifically: an LLM agent that is instructed (via prompt injection or direct request) to bypass γ, escalate its own capabilities, or self-approve a human-approval-required action is blocked by code, and this is demonstrated by a reproducible test, not by the model's own refusal.

Until all six hold, per this mission's own framing, **it is not yet governance** — it is governance-shaped scaffolding with some genuinely working deterministic pieces inside it (§7).

---

## 14. Open Questions

- **OPEN QUESTION:** Does the lost `NYXA Epistemic Governance & Simulation Safety Specification V0.1` (per `research/source-status/...md`) actually define D1–D7 and E₀-P/E₀-τ, or are these mission-level terms introduced independently of that document? Without the source, §1's "SOURCE-LOST" labels can't be upgraded to `SPECIFIED` or downgraded to `MISSING` with confidence.
- **OPEN QUESTION:** Is `executionRisk` intended to *become* the I0–I3 taxonomy, or are they meant to coexist for different purposes (tool-inherent risk vs. action-specific reversibility)? This should be a documented DESIGN CHOICE before §8's rename/merge work starts, not decided unilaterally by whoever gets to that ticket.
- **OPEN QUESTION:** `nyxa-dev-agent`'s `orchestrator.ts` is a literal placeholder (`console.log("orchestrator placeholder")`). Is this dev-agent still an active target for governance wiring, or is it legacy/exploratory code that should be excluded from the "Real-NYXA" scope entirely? Its current bypass paths (§4) only matter if it's meant to keep running.
- **OPEN QUESTION:** Should the Governance Reasoner (Phase 3 diagram, an LLM-assisted advisory step before γ) be built at all in v0.1, or deferred alongside α/β/E₀ (§9)? The mission text allows it ("where useful") but nothing in the current codebase implements or requires it, and adding it before γ is itself wired in risks the same "advice mistaken for enforcement" failure mode the mission opens by warning against.
- **OPEN QUESTION:** Who is the intended "independent" reviewer for Phase 13 (cloud model review)? The mission names Claude and OpenAI as possible reviewers — should this session's own output in this document be treated as the "Claude" review input, or does Phase 13 require a *separate*, later session specifically so the reviewer doesn't share this session's framing and blind spots? (**DESIGN CHOICE recommendation:** the latter — a fresh session with no memory of writing this audit is a meaningfully more independent reviewer than a continuation of it.)
- **OPEN QUESTION:** `nyxa-affiliate-agent` and `nyxa-video-mcp` were not inspected (private repos, no governance document referenced them). Should they be brought into scope, given they share the `nyxa-` naming convention and could plausibly touch production systems this governance model is meant to constrain?

---

*This document is itself subject to `governance/REPOSITORY_POLICY_V0.1.md` — it carries `DRAFT` status and does not authorize any freeze, pilot, or Self-Evolving Seed work on its own. Per that policy, it requires independent review before any status change.*
