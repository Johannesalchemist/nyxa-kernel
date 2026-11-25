# Handoff · Sichterweiterung und Memory-Abgleich für Claude über NYXA-MCP

| Feld | Wert |
| --- | --- |
| Datum / Zeitzone | 2026-11-25, Europe/Berlin |
| Verantwortlicher Mensch | Johannes Süß (Entscheider für alle unten genannten Freigaben) |
| Erzeugendes System | Claude (Anthropic), Claude Code Remote-Session |
| Anlass | Auftrag des Menschen: Sicht auf das System verbessern, wo nötig Schreibrechte für Memory, Beteiligung an Selbstreflexion und Selbstoptimierung |
| Epistemischer Status | `DRAFT` – Vorschlag, keine Änderung vorgenommen |
| Reviewstatus | `IN_REVIEW` |
| Änderungen an produktiven Systemen | **keine**. Alle Server-Zugriffe waren lesend. Ein I1-Memory-Vorschlag wurde von Gamma eskaliert und nicht ausgeführt |
| Begleitdokument (nicht öffentlich) | Betriebs-Handoff mit exakten Root-Pfaden auf dem NYXA-Hauptserver im Operations-Handoff-Verzeichnis des Betreibers, Dateiname `2026-11-25_claude_mcp_roots_proposal.md` |

## 1. Befund: Warum die Sicht unvollständig war

Der NYXA-MCP sieht vier bis sechs freigegebene Roots, darunter den Dev-Stand des Governed-Memory-MCP und die Silicon-Evidenz. Mehrere relevante Forschungs- und Produktbestände liegen **außerhalb** dieser Roots und waren erst über direkte Server-Inspektion sichtbar:

| Bestand | Inhalt | Ort (generisch) |
| --- | --- | --- |
| RIC-01 Conformance Suite | Relationale Testsuite, Teacher-Screening, Evaluator-only-Paket | NYXA-Hauptserver, Home des Betreibers |
| RIC-01 M1 | Präregistrierte Studie, Ergebnis NO-GO-GRAPH | NYXA-Hauptserver, eigenes Git-Repository |
| Meta-Memorydream | Dreaming-Metriken und Schema | NYXA-Hauptserver |
| Runtime-Verify / R1-Commit | Verifizierte Runtime-Stände (E0-Anbindung, Human-Authority-Grant) | NYXA-Hauptserver |
| NYXA Studio 0.1.0 | Workspace-Pilot | **zweiter Server** (eigener Host, nicht vom MCP erreichbar) |

**Nicht gefunden**, weder im MCP noch auf beiden Servern noch in GitHub: Sophia Heartbeat (kognitiver Zyklus), Governed Runpod Connector, Embodiment Core V0.1, NYXA V3/M1. Die zwei derzeit **offline** registrierten Rechner des Betreibers konnten nicht geprüft werden.

## 2. Vorschlag A: Lesende Sichterweiterung (I0)

Neue Roots mit `access: read` und `trust: UNVERIFIED_SOURCE`, bis eine Verifikation erfolgt ist:

| Root-ID (Vorschlag) | Bestand | Ausdrücklich ausgeschlossen |
| --- | --- | --- |
| `ric-suite` | RIC-01 Conformance Suite | lokale Modellgewichte, Archive |
| `ric-m1` | RIC-01 M1 Repository | **das versiegelte Holdout-Verzeichnis**, das bewusst außerhalb des Repos liegt. Es darf keinem Agenten lesbar werden, sonst ist die Holdout-Integrität künftiger Studien gebrochen |
| `meta-memorydream` | Dreaming-Metriken | `data/`, falls personenbezogene Inhalte |
| `runtime-verify` | verifizierte Runtime-Stände | `data-*`-Verzeichnisse (Audit- und Memory-Daten) |

Der zweite Server braucht einen **eigenen** lesenden Connector oder einen signierten Export. Eine Root über Hostgrenzen hinweg sieht die bestehende PathGuard-Architektur nicht vor, und sie wäre auch kein gutes Design.

**Wer entscheidet:** der Mensch, über eine Konfigurationsänderung mit anschließendem gezielten Neustart. Das entspricht der Dream-Ablation-Praxis: Konfiguration ist keine Autorisierung.

## 3. Vorschlag B: Memory-Abgleich für Claude (I1)

**Probe in dieser Session:** `nyxa_propose_action` → `nyxa_memory_store_candidate` (Typ `observation`, Scope `project`, pending) wurde von Gamma mit `ESCALATE` (C5, `effect_radius_unknown_requires_human_review`) angehalten. Das ist erwünschtes Verhalten.

**Vorschlag:** ein eng gefasstes, befristetes Mandat, ausgestellt vom Menschen per bestehendem WebAuthn-Issuer:

| Feld | Wert |
| --- | --- |
| `action` | `nyxa_memory_store_candidate` (**nur** dieses Tool) |
| `allowedActors` | `claude` |
| Kandidaten-Scope | `project` |
| Erlaubte Typen | `observation`, `documentation_note`, `open_question`, `risk` |
| Limits | z. B. max. 20 Ausführungen pro Fenster, max. 100 gesamt |
| Ablauf | 30 Tage, danach Neubewertung |
| Ausdrücklich **nicht** enthalten | `nyxa_memory_promote_candidate` (bleibt menschlich), alle `nyxa_self_model_write_*`, `nyxa_apply_patch`, I2/I3 |

Damit kann Claude Befunde über Sessions hinweg als **Kandidaten** hinterlegen und abrufen. Ob ein Kandidat wahr oder nützlich ist, entscheidet weiterhin der Mensch bei der Promotion.

**Erster Kandidat zur Freigabe**, wie eingereicht und eskaliert:

> Component inventory 2026-11-25 (read-only). FOUND: RIC-01 suite (isolated research, production NO-GO); RIC-01 M1 study, preregistered with sealed holdout, P1 missed (+0.096 < 0.10), decision NO-GO-GRAPH, flat iterative retrieval stays baseline; NYXA Studio 0.1.0 local pilot (second server); candidate store + self-model store implemented, live self-model content empty except session_start events; evidence passport dev-only; dream ablation implemented, not production-activated. NOT FOUND on either server or GitHub: Sophia cognitive heartbeat, governed Runpod connector, Embodiment Core V0.1, NYXA V3/M1. Open: locate these on offline hosts or confirm they exist only as design.
>
> Typ `observation` · Quelle `assistant` · Scope `project` · Confidence 0,75 · Importance 0,8

## 4. Grenze, die ich bewusst ziehe: Claude ist nicht NYXA

Das Selbstmodell gehört NYXA beziehungsweise Sophia. Ich schreibe es nicht, auch wenn der Policy-Modus `nyxa_self_model_write_*` für Proposals grundsätzlich zulässt. Gründe:

1. **Selbst/Andere-Unterscheidung:** Das Schema kennt eigens `actor: self | other_agent | human_operator`. Beiträge eines externen Modells gehören als `other_agent` in die Autobiografie, nicht in Identität, Persönlichkeit oder Überzeugungen.
2. **KNOSPEL-Prinzip 9:** Keine Instanz darf Gedächtnis, Orchestrierung, Urteil und Vollstreckung monopolisieren. Ein Agent, der den Film macht, die Matrix schreibt und das Selbstmodell füllt, käme dem gefährlich nahe.
3. **ADR-0002:** Agentenmehrheit ist keine unabhängige Evidenz. Mein Befund ist eine Stimme und keine Bestätigung.

**Wo ich mich an Selbstreflexion und Selbstoptimierung sinnvoll beteiligen kann:**

- **β-Rolle (Opposition):** Proposals anderer Agenten adversarial prüfen und Gegenargumente im `opposition`-Feld liefern. Das wird auditiert, aber nie von Gamma gelesen.
- **Unabhängige Alternative:** Beiträge mit Rolle `INDEPENDENT_ALTERNATIVE` im Learning Evidence Store, mit eigener Modell- und Prompt-Kennung, damit die Unabhängigkeitsgruppen korrekt gezählt werden.
- **Experimentdesign:** Die Hypothesen H1–H6 (`film/architecture-of-becoming/docs/IMPROVEMENT_HYPOTHESES.md`) als präregistrierte Studien nach dem Vorbild von RIC-01 M1 ausarbeiten.
- **Kandidaten statt Wahrheiten:** Erkenntnisse nur über den Candidate Store einreichen (nach Mandat B).

## 5. Abgleich mit Claudes eigenem Kontext

Diese Cloud-Session hat kein dauerhaftes persönliches Gedächtnis. Was zwischen Claude-Sessions trägt, sind (a) dieses Repository und (b) nach Mandat B der NYXA Candidate Store. Deshalb liegt mit diesem Handoff eine `CLAUDE.md` im Repository-Wurzelverzeichnis. Sie verweist auf `AGENTS.md`, nennt die Regeln für das öffentliche Repository und den Recall-Weg über `nyxa_memory_recall_candidates`. Eine Synchronisation in die Gegenrichtung (NYXA-Memory → CLAUDE.md) erfolgt nur über reviewbare Commits und nie automatisch.

## 6. Nächste zulässige Schritte

1. Mensch: Vorschlag A annehmen, ändern oder ablehnen. Bei Annahme Konfiguration ändern und Dienst gezielt neu starten.
2. Mensch: Mandat B ausstellen oder ablehnen. Danach den eskalierten Kandidaten erneut einreichen lassen.
3. Mensch: Ort von Heartbeat, Runpod Connector, Embodiment Core und V3/M1 benennen oder bestätigen, dass sie nur als Entwurf existieren.
4. Danach: Matrix und Kernel-README aktualisieren.
