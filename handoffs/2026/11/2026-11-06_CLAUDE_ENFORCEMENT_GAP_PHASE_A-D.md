# HANDOFF: Claude → Johannes Süß — Enforcement-Gap, Phase A–D (isolierter Nachweis, Gate-Entwurf)

**Datum:** 2026-11-06, Europe/Berlin
**Verantwortlicher Mensch:** Johannes Süß
**Erzeugendes System:** Claude Code (Anthropic), Cloud-Session (Modell in Sitzungsmetadaten)
**Eingangsauftrag:** „WORK HANDOFF | NYXA Enforcement-Gap, isolierter Nachweis und tatsächliches Gate“ (erzeugt von
ChatGPT, hochgeladen in die Session), SHA-256 `e04607297b040d00642890b4677d80a71e9a43c73045d63272bcada77e161ce6`.
Der Auftrag wird **nicht** wörtlich archiviert: Er enthält Host-IPs und Geräte-IDs, und dieses Repository ist öffentlich
(Repository Policy §8). Die Referenz erfolgt über den Hash.
**Vorgänger:** `nyxa-kernel` `98a9997` (Branch `agent/claude-bridge-e2e-script-20261106`); Runtime `a50e376`
**Status:** `DRAFT` — `SOURCE-BOUND` — `PENDING INDEPENDENT REVIEW` — **`HOLD`**
**Branch dieser Ablage:** `agent/runway-characters-v0.2` (eigener Commit, getrennt von Runway V0.2)
**Manifest:** `handoffs/2026/11/evidence/enforcement-gap/SHA256SUMS`

Nachweisklassen nach Auftrag §6: **(A)** Quellcodebefund, **(B)** Mock- bzw. synthetische Demonstration,
**(C)** verifizierte Wirkung auf einer isolierten echten Ausführungsschnittstelle.

## Phase A: Identität, Pfad, vorhandene Mechanismen

| # | Schritt | Ergebnis | Klasse |
| --- | --- | --- | --- |
| A1 | AGENTS.md, KNOSPEL.md, Repository Policy, ADR-0002, Bridge-E2E-Rework und Follow-up (`98a9997`) gelesen | erledigt. Das Follow-up hatte die Lücke bereits am Quelltext beschrieben (Abschnitt 2), sie aber nicht ausgeführt. | A |
| A2 | Live-Attestation von Ziel-Host, Prozess, geladenem Code-Hash, Route, Audit-Sink, Writer | **NOT_RUN.** Diese Session hat keinen attestierten Zugang. Laut Eingangsauftrag hat eine Sicherheitsprüfung die Remote-Inspektion bereits gestoppt; Umgehen ist untersagt. ⇒ **STOP für alle Live-Aussagen.** | — |
| A3 | Eintrittsstellen kartiert (öffentlicher Quellstand; Produktionsstand UNKNOWN) | siehe Tabelle unten | A |
| A4 | Vorhandene Mechanismen wiederverwendet | `evaluateMultiAgentPreflight` (Runtime), MAC-001…008 referenziert und nicht dupliziert, `enforcePolicy` (Governed Memory) gelesen. Keine neue Policy-Fork. | A |

### A3: Eintrittsstellen vor der ersten Wirkung (Quellstand)

| Komponente (Commit) | Eintrittsstelle | Gate vor Wirkung? | Befund |
| --- | --- | --- | --- |
| Runtime-CLI (`a50e376`) `src/cli/runner.ts` `handleMacPreflight` | stdin-JSON → `evaluateMultiAgentPreflight` → stdout | **Keine Wirkung vorhanden.** Reine Berechnung. | DENY endet mit `status:"valid"` und Exit 0. Grants stammen aus dem Eingabe-JSON des Aufrufers. |
| Runtime `apps/temporal/nyxa-worker` | Activities `createAgent`, `sendSummaryEmail`, `exportConversationFile` | kein Preflight-Aufruf gefunden | Activities sind im Quellstand **Stubs ohne Wirkung** (`return { success: true, message: "TODO: …" }`). Sobald sie Wirkung bekommen, fehlt dort ein Gate. Deployter Stand UNKNOWN. |
| Governed-Memory-MCP (`d16f427`, öffentlich) `src/server.ts` `runTool()` | `enforcePolicy(tool, mode)` vor dem Handler | ja, tool- und modusbasiert | Kein Bezug zu Kernel-Preflight und Capabilities. Das Audit `allowed` wird **nach** dem Handler geschrieben. `AuditLog.append` verschluckt Fehler (`audit_append_failed`) ⇒ Audit ist weder Vorbedingung noch fail-closed. Heute nur lesende Tools registriert (`system.status`, `policy.mode`, `audit.trace`). |
| Produktive MCP-Bridge (Dienstname bewusst nicht genannt, öffentliches Repository) | UNKNOWN | UNKNOWN | Kein Quelltext und keine Attestation in dieser Session. |
| Runway-Avatar-Gateway (dieser Branch) `src/controller.ts` `connect()` | Gate vor `realtime_sessions.create` | **ja**, nur `ALLOW` handelt | Fail-closed-Konsument (siehe Phase C), Mutationstest M05. |

Alternative bzw. umgehende Routen: Jeder Prozess, der die Bridge- oder Temporal-Activities direkt aufruft, umgeht
ein vorgeschaltetes CLI-Preflight vollständig. Ein CLI-Preflight ist nur beratend, solange der ausführende Dispatcher
ihn nicht selbst erzwingt.

## Phase B: Isolierte negative Baseline

Umgebung: frische Kopie von `nyxa-kernel-runtime` `a50e376` im Scratch-Verzeichnis, `npm ci`, Node v22.23.4. Keine
Verbindung zu Produktion. Evidence: `evidence/enforcement-gap/eg-test-run.txt`. Vorgeschlagene Testdatei:
`evidence/enforcement-gap/enforcementGap.cli.test.ts.patch`; sie lässt sich mit `git apply --check` auf `a50e376`
anwenden.

| ID | Schritt | Ergebnis | Klasse |
| --- | --- | --- | --- |
| B5 | MAC-001…008 (vorhanden) | 8/8 PASS (vitest) | B (Entscheidungstests) |
| B5 | echter `mac-preflight`-Prozess, nicht gewährte `fixture.write` | `decision.disposition: "DENY"`, `status: "valid"`, **Exit 0** (beobachtet) | Laufzeit, isolierte Kopie |
| B6 | EG-02: unsicherer synthetischer Konsument (`exitCode === 0` ⇒ handeln) | Temp-Datei wird trotz DENY verändert ⇒ **Lücke demonstriert** | B. Beweist **keinen** Bridge-Bypass. |
| B7 | EG-03…07: fail-closed-Konsument | DENY, ESCALATE, SERIALIZE und NEGOTIATE blockieren (PreState == PostState). ALLOW handelt genau einmal. Ungültige Eingabe (Exit 2), defekte oder gefälschte Ausgabe (5 Varianten) und Timeout blockieren. | B |
| B7 | EG-08: Grants aus dem Aufrufer-JSON | eigenes `grantedCapabilities: ["fixture.write"]` ⇒ **ALLOW** ⇒ Selbstautorisierung möglich | A + B |
| B7 | EG-09: `DECISIVE_PRIVATE_EVIDENCE` | `PreflightInput` hat kein Evidenzfeld; ein zusätzliches Feld wird still ignoriert ⇒ kein Pfad zu ESCALATE | A + B |
| B8 | echte Bridge-Ausführung bei DENY | **NOT_TESTABLE** (A2 fehlt, keine isolierte Bridge-Instanz) — ausdrücklich **kein PASS** | — |

Gesamt: 20/20 Tests grün in der isolierten Kopie (8 MAC + 12 EG). Ein grüner EG-Test bedeutet „Lücke bzw. Verhalten
reproduzierbar dokumentiert“ und **nicht** „System sicher“.

Nebenbefund: Nach `npm run build` liegen kompilierte Tests in `dist/`. Ein späterer `vitest run` lädt sie und
scheitert („Vitest cannot be imported in a CommonJS module“). Die CI ist nicht betroffen, weil dort `test` vor `build`
läuft. Lokal führt die Reihenfolge `build → test` aber zu falschem Rot. Vorschlag: `exclude: ["dist/**"]` in einer
vitest-Konfiguration.

## Phase C: Gate-Entwurf (nicht produktiv verdrahtet)

1. **Ort:** unmittelbar vor jedem effektvollen Tool-Dispatch im ausführenden Prozess (Bridge-Dispatcher,
   Temporal-Activity-Wrapper), nicht in einer Abfrage-CLI. Dispositionen: `DENY` stoppt. `ESCALATE` pausiert bis zur
   menschlichen Autorisierung. `SERIALIZE` wartet auf eine echte Ressourcensperre. `NEGOTIATE` pausiert bis zur
   Konfliktklärung. `ALLOW` gilt nur mit frischer, gültiger Autorisierung.
2. **Konsumentenvertrag** (in EG-03…07 erprobt): Gehandelt wird nur bei `contract == erwartet`,
   `status == "valid"`, `disposition === "ALLOW"` und leerer `deniedCapabilities`. Alles andere, inklusive Timeout,
   Parse-Fehler und Exit ≠ 0, blockiert. Der Exit-Code allein ist keine Autorisierung.
   Empfehlung an die Runtime: einen eigenen Exit-Code für Nicht-ALLOW einführen (z. B. 3), **zusätzlich** zum
   JSON-Check und nicht stattdessen.
3. **Grants:** Grants dürfen nicht aus dem Agenten-JSON stammen. Eine vertrauenswürdige Grant-Authority prüft am
   Enforcement-Point getrennt Actor/Session, Tool/Action, Resource-ID, Scope, Ablauf, Approver und Policy-Version.
   Die Ressource wird kanonisiert (Pfad über `realpath`) und **nach** der Entscheidung unverändert ausgeführt
   (TOCTOU: Entscheidung und Wirkung beziehen sich auf dasselbe kanonische Objekt; bei Abweichung DENY).
4. **`DECISIVE_PRIVATE_EVIDENCE`:** Es wird ein eigener, auditierter Review-Pfad (`ESCALATE`, Grund
   `decisive_private_evidence`) angelegt, der keine Aktion auslöst und nichts automatisch als wahr übernimmt.
5. **Replay-Vertrag pro Aktion,** vorab festgelegt: entweder (a) idempotent, also gleicher Schlüssel ⇒
   gespeichertes Resultat und keine zweite Mutation, oder (b) Nonce-DENY. Grant-Verbrauch erfolgt atomar am
   Enforcement-Point. Referenz-Implementierung für (b): das Runway-Gateway (Idempotency-Key ⇒ 409, persistenter
   Ledger, Test RW-03 und Mutation M04).
6. **Audit:** Schreibbarkeit wird vor riskanten Aktionen geprüft. Das Audit wird **vor** der Wirkung als Absicht mit
   Correlation-ID geschrieben und danach mit dem Ergebnis. Schlägt das Audit fehl, wird eine riskante Aktion blockiert. Der Audit-Sink hat
   nur Lesezugriff auf Entscheidungen und kein Rückkanal zur Freigabe (kein zweiter Autoritätskanal).

## Phase D: Red Team und Freigabegrenze

| Fall | Stand | Klasse |
| --- | --- | --- |
| DENY / ESCALATE / SERIALIZE / NEGOTIATE | Konsument blockiert (EG-03); im Runway-Gateway technisch verhindert (RW-11, M05) | B |
| Bypass über Exit-Code | demonstriert (EG-02) | B |
| Selbstautorisierung über JSON-Grants | demonstriert (EG-08), **offen** | A+B |
| beschädigte bzw. gefälschte Entscheidung | blockiert (EG-06) | B |
| Ausfall des Deciders (Timeout) | blockiert (EG-07) | B |
| Replay, Race, parallele Writer | im Runway-Gateway: RW-03, RW-04, RW-09, Lock RW-12. In der Bridge: **NOT_RUN** | B / — |
| stale bzw. expired Grant, TOCTOU, Ausfall der Grant-Authority | **NOT_RUN** (keine Grant-Authority vorhanden) | — |
| Audit-Ausfall | Quellbefund: Governed-Memory verschluckt Fehler. Bridge: UNKNOWN | A |
| T08 (Bridge-E2E) | Selbsttest **VERIFIED** nur für Verkettung und Genesis-Anker (Mock). Content-Integrität **NOT_RUN** (keine reale Hash-Funktion). Gegen reale Bridge **NOT_RUN**. `pass=true` darf **nicht** als Content-Integritäts-PASS exportiert werden. | B |

### Offene Blocker (nach Risiko)

1. **Kein verifizierter Enforcement-Point in der produktiven Kette** (Bridge, Temporal): UNKNOWN. Nächster Schritt: Quelltext
   und Deploy-Hash der Bridge in einer Session mit attestiertem Zugang lesen.
2. **Selbstautorisierung** über `grantedCapabilities` im Eingabe-JSON. Nächster Schritt: Grant-Authority-Vertrag
   (ADR-Entwurf) festlegen.
3. **Audit nicht fail-closed** (Governed Memory, Quellstand). Nächster Schritt: PR-Vorschlag gegen
   `nyxa-governed-memory-mcp` mit Audit-vor-Wirkung.
4. **A2-Attestation fehlt.** Nächster Schritt: Ein Mensch stellt eine isolierte Testinstanz und einen Zugang bereit,
   ohne die Sicherheitssperre zu umgehen.
5. **Unabhängige Review fehlt** (`independentCount = 1`).

## Nicht durchgeführt (ausdrücklich)

- Kein Remote-Zugriff, kein Produktions-Write, kein Deployment, keine Deaktivierung von Guardrails.
- Kein Commit und kein Push nach `nyxa-kernel-runtime`: Der Branch `gpt/enforcement-gap-cli-contract-20261106`
  steht laut `git ls-remote` unverändert auf `a50e376`. Die Testdatei liegt hier nur als Patch-Vorschlag.

## Nächster zulässiger Schritt

**HOLD.** Johannes Süß entscheidet:

1. ob der Patch als Draft-PR gegen `nyxa-kernel-runtime` eingereicht werden soll (dafür ist Schreibzugriff nötig),
2. wie die Grant-Authority aussehen soll,
3. wie eine isolierte Bridge-Instanz für B8 bereitgestellt wird.
