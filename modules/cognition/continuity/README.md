# Cross-Agent Cognitive Continuity — Adapter (kein Speicher)

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum | 2026-11-27, Europe/Berlin |
| Status | `TESTED-IN-ISOLATION` (7/7 inkl. Hook-E2E mit Claude-Code-Payloads) · **nicht aktiviert** (M10) |
| Speicherort der Erfahrung | ausschließlich der bestehende governte Kandidatenspeicher (`memory:/candidate`). Live geprüft: implementiert und bereit, Audit-Log integer, in der Produktionsepoche derzeit **leer** |

## Referenzimplementierungen (geprüft am 2026-11-27)
| Projekt | Lizenz (LICENSE-Datei, HEAD) | Mechanismus | Datenschutz | Übernahme |
|---|---|---|---|---|
| claude-mem (`ad682a3`) | Apache-2.0 (ältere Quellen nennen AGPL-3.0; ein Unterordner hatte laut Doku PolyForm Noncommercial) | Hooks SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, SessionEnd; erfasst Tool-Nutzung breit; Plugins für Codex/Grok | Erfasst breit, auch Dateiinhalte, ohne Governance-Gate | **Muster** Lifecycle-Erfassung, aber mit Redaktion und nur Fehler, Zustand und explizite Notizen |
| Supermemory (`bf5a7a4`) | MIT; Claude-Plugin **ohne Lizenzdatei** | Memory-API, MCP, SDKs | Standardweg ist eine gehostete API, also Datenabfluss an Dritte. Self-Host-Variante laut Doku vorhanden (nicht geprüft) | nicht übernommen: externer Speicher, Abfluss, Plugin-Lizenz unklar |
| Hindsight (`c828c7e`) | MIT (ein PyPI-Paket nennt Apache-2.0) | retain / recall / reflect (arXiv 2512.12818) | selbst hostbar; braucht Datenbank und LLM für `reflect` | **Muster** der Trennung von Erfassen, Abrufen und Reflektieren; Reflexion bleibt bei MeMo und Strategy Evolution |
| memsearch (`9475691`) | MIT | Markdown als Quelle der Wahrheit, Vektorindex abgeleitet; progressive Offenlegung (Suche, Aufklappen, Transkript); agentenübergreifend (Codex u. a.) | lokal möglich (ONNX-Embeddings) | **Muster** „Index abgeleitet, kanonische Quelle governed“ und progressive Offenlegung (`recallBundle` liefert Index-Zeilen mit IDs) |
| cc-context-awareness (`b85bedd`) | MIT | Statuszeile schreibt den Kontextverbrauch, Hooks melden ihn dem Agenten; Claude und Codex | lokal | **Muster** Token-Budget beim Abruf |
| Claude Code Hooks | — | In Referenz-Konfigurationen belegt: SessionStart (Matcher u. a. `startup|clear|compact`), UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, SessionEnd. PreCompact: aus der Claude-Code-Doku, in dieser Sitzung nicht gegengeprüft | — | `hooks/claude-settings.example.json` |
| Codex Hooks | — | `hooks.json` oder `[hooks]` in `config.toml`; Ereignisse u. a. SessionStart, PreCompact, PostCompact, PostToolUse, UserPromptSubmit, Stop; nicht verwaltete Hooks müssen über `/hooks` freigegeben werden; AGENTS.md-Erkennung; `notify` nur in der Nutzerkonfiguration | — | `hooks/codex-hooks.example.json`; Payload-Felder `unverified` |

Ressourcen und Abrufqualität der Referenzen sind **nicht** von mir gemessen; Herstellerangaben gelten als `unverified`. Gemessen wurden nur die vier Mechanismen in MCC-01 (`research/mcc-01`).

## Bausteine
`captureEvent` (Provenienz Pflicht; Redaktion von Schlüsseln, JWTs, Tokens, IPs und E-Mails; Vertrauensstufe; untrusted wird nie Entscheidung/Korrektur/Strategie; anweisungsartige untrusted Inhalte in Quarantäne) · `consolidate` (Duplikate, versionierte Ablösung, untrusted löst trusted nicht ab, Veralten) · `recurringError` (korrigierter Fehler tritt wieder auf → Regret `HURT` für Strategy Evolution) · `recallBundle` (relevanzbasiert, Token-Budget, Provenienz pro Zeile) · `toCandidateProposal` (bestehender Vertrag) · `lintRuleFile` (CLAUDE.md und AGENTS.md bleiben schlank). Adapter `hooks/lifecycle-hook.mjs` für beide Agenten; `continuity-cli.mjs` mit `note`, `flush` (→ governte Vorschläge) und `snapshot`.

**Zugang je Agent:**
- Claude Code und Codex: über Hooks und MCP.
- ChatGPT: über die bestehende MCP-Route; Lesen über `nyxa_memory_recall_candidates`, Schreiben nur über `nyxa_propose_action`.
- Sophia: über ihren Heartbeat und die Room-Werkzeuge (nach F9).
