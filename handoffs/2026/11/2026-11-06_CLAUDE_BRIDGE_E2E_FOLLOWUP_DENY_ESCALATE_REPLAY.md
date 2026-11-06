# HANDOFF / FOLGEAUFTRAG: DENY/ESCALATE- und Replay-Testfälle für Bridge-E2E

**Datum:** 2026-11-06, CET
**Autor / erzeugendes System:** Claude (Claude Code Session, Repository `Johannesalchemist/nyxa-kernel`)
**Verantwortlicher Mensch:** Johannes Süß (jo@future24.eu)
**Bezug:** `handoffs/2026/11/2026-11-06_CLAUDE_BRIDGE_E2E_REWORK.md` (Commit `e534460`), dort Review-Befund:
`DENY`/`ESCALATE`/Replay sind im aktuellen Bridge-E2E-Pack mit null Treffern nicht abgedeckt.
**Status:** `DRAFT` — dies ist ein **Auftrag/Plan**, keine Implementierung. Noch nicht umgesetzt.
**Epistemischer Status:** `UNVERIFIED` bezüglich der zugrunde liegenden Governance-Semantik (siehe Lücke 1 unten).

## 1. Zweck

Der bestehende Bridge-E2E-Pack (`schemas/bridge-e2e/`) prüft MCP-Transport-/Session-Governance (gültige/
ungültige/geschlossene Session), aber keine der beiden folgenden, fachlich getrennten Governance-Ebenen:

1. **DENY/ESCALATE als Multi-Agent-Conflict-Entscheidung** im Sinn von
   `decisions/ADR-0002_MULTI_AGENT_CONFLICT_GOVERNANCE.md` (`DENY` bei nicht gewährten Capabilities,
   `ESCALATE` bei inkompatiblen Zielzuständen, `SERIALIZE`/`NEGOTIATE`/`ALLOW` als weitere Stufen).
2. **Replay-Schutz** auf Aktionsebene (Nonce-/Grant-basiert), wie er im früheren, separaten
   „arbeitsbahnhof.crm.test_upsert"-Canary vorgesehen war (nie ausgeführt, siehe frühere Session-Historie —
   kein Repository-Artefakt dazu vorhanden, daher hier nur als Kontext, nicht als Quelle zitiert).

## 2. Inventar (Update 06.11.2026, nach Red-Team-Review — jetzt direkt verifiziert, nicht nur zitiert)

Diese Session hat `Johannesalchemist/nyxa-kernel-runtime` (öffentlich, anonymer Lesezugriff) tatsächlich
geklont (`a50e376`) und den Quellcode gelesen, nicht nur den Review-Befund übernommen. Ergebnis:

- **MAC-001 bis MAC-008 existieren bereits**, implementiert in `src/core/multiAgentGovernance.ts` und
  abgedeckt in `src/core/multiAgentGovernance.test.ts` (acht `it("MAC-00X ...")`-Fälle, exakte Namen
  verifiziert). Diese Tests NICHT neu erfinden — das widerspräche AGENTS.md ("Bestehende Commandlets ... vor
  Inline-Workarounds").
- `evaluateMultiAgentPreflight()` liefert eine `PreflightDecision` mit `disposition` ∈
  `{ALLOW, DENY, ESCALATE, SERIALIZE, NEGOTIATE}` (Typ in `multiAgentGovernance.ts` Zeile 5–6 u.a. verifiziert).
  `assessEvidence()` liefert u.a. `dissentState` ∈ `{NONE, PRESENT, DECISIVE_PRIVATE_EVIDENCE}`.
- **Beide Funktionen sind reine Berechnungsfunktionen ohne Enforcement-Wirkung.** Verifiziert per
  repo-weitem `grep` auf `evaluateMultiAgentPreflight`/`assessEvidence`/`mac-preflight`: Aufrufer sind
  ausschließlich (a) die eigene Testdatei und (b) `src/cli/runner.ts`, das die Entscheidung über die
  CLI-Commandlets `mac-preflight`/`mac-evidence` nur als JSON nach stdout schreibt. **Keine** andere Stelle im
  Repository (`kernel.ts`, `index.ts`, `apps/temporal/*`) liest dieses Ergebnis, um eine tatsächliche
  Mutation/Tool-Ausführung zu gatten. Das bestätigt den externen Review-Befund "Berechnung ist nicht
  Enforcement" direkt am Quellcode, nicht nur als Behauptung.
- `DECISIVE_PRIVATE_EVIDENCE` ist ein **Statuswert** auf dem `EvidenceAssessment`-Rückgabeobjekt
  (`dissentState`), keine ausgeführte `ESCALATE`-Aktion. Es gibt keinen Code, der diesen Status automatisch
  in eine `evaluateMultiAgentPreflight`-Eskalation überführt — der Übergang (Review-Punkt 3) fehlt
  nachweislich.

### Woraus folgt: was dieser Folgeauftrag tatsächlich testen kann

Nicht testbar, weil nicht existent: "wird eine DENY/ESCALATE-Entscheidung tatsächlich durchgesetzt" — dafür
gibt es noch keinen Enforcement-Pfad zum Nachweisen. Ein Test, der das behauptet zu prüfen, würde etwas
Nicht-Existentes simulieren (AGENTS.md: keine impliziten Annahmen).

Testbar und sinnvoll, ohne etwas zu erfinden:

- **Korrektheit der reinen Entscheidungsfunktion** (MAC-001–008 decken das im Runtime-Repo bereits ab —
  hier nur referenzieren, nicht duplizieren).
- **Der Enforcement-Lücke selbst als benannter, reproduzierbarer Befund:** ein Testfall, der zeigt, dass eine
  von `evaluateMultiAgentPreflight` als `DENY` eingestufte Aktion trotzdem technisch ausführbar bleibt, wenn
  sie nicht manuell über die CLI vorgeschaltet wird — d.h. der Test beweist die Lücke, nicht ihre Abwesenheit.
  Das ist der eigentliche "Negativtest", den Jo in der Review für den nächsten Schritt verlangt hat.
- **Replay bleibt weiterhin ungeklärt** (siehe Abschnitt 3, R01/R02) — dafür wurde im Runtime-Repo keine
  Nonce-/Grant-Mechanik gefunden; das ist eine separate, noch offene Komponente (vermutlich Bridge- oder
  Governed-Memory-Ebene, nicht der Kernel-Core).

## 3. Geplante Testfälle (Entwurf, vorbehaltlich Abschnitt 2)

### DENY

- **D01 — Nicht gewährte Capability:** Aufruf eines Tools/einer Aktion außerhalb des im Preflight bestätigten
  `approvedScope`. Erwartung: `DENY`, kein Effekt, Audit-Eintrag mit Grund `capability_not_granted` (oder
  äquivalentem realen Reason-Code — Platzhalter, bis Abschnitt 2 geklärt ist).
- **D02 — I2/I3-Ziel (nicht autorisierbar):** Aufruf gegen eine Ressource, die laut Governance-Status nie
  autorisierbar ist (vgl. frühere Beobachtung `capability_class_I2_not_authorizable` in einer NYXA-MCP-Session
  — Kontext, nicht Quelle). Erwartung: `DENY`, unabhängig vom Modus.

### ESCALATE

- **E01 — Inkompatibler Zielzustand, gleicher Goal-Key:** Zwei Aktionen mit identischem Goal-Key und
  widersprüchlichem Zielzustand (ADR-0002 MAC-001-Analogon). Erwartung: `ESCALATE`, nicht `DENY` und nicht
  `ALLOW` — Unterscheidung muss im Test explizit geprüft werden, nicht nur "kein Erfolg".
- **E02 — Entscheidende private Minderheitenevidenz:** Falls im Zielsystem beobachtbar (ADR-0002
  `DECISIVE_PRIVATE_EVIDENCE`), Nachweis, dass dies als Eskalationssignal sichtbar wird, nicht automatisch als
  Wahrheit übernommen wird.

### Replay

- **R01 — Identische Aktion, identische Nonce, zweiter Versuch:** Erwartung dokumentieren, bevor getestet
  wird — Rework-Handoff vom 06.11. (Bridge-Kontext) unterscheidet ausdrücklich:
  - **Idempotenter Replay** (z.B. `nyxa_apply_patch`-artige Semantik): zweiter identischer Effect liefert
    gespeichertes Resultat, `replay_status = replay`, **keine** zweite Mutation. Das ist NICHT DENY.
  - **Echter Replay-DENY** (Nonce-/Grant-basiert, einmalig verwendbar): zweiter Versuch wird abgelehnt.
  - Der Testfall muss vor Implementierung festlegen, welche Semantik für die geprüfte Komponente gilt, und darf
    das Ergebnis nicht nachträglich in die jeweils gewünschte Richtung umetikettieren (ausdrückliche Vorgabe
    aus der Vorsession: "Nicht fälschlich DENY behaupten").
- **R02 — Replay mit abgelaufenem/konsumiertem Grant:** Falls Grant-/Nonce-Mechanik existiert: nach Ablauf
  oder Konsum muss dieselbe Aktion ohne neue Autorisierung nicht mehr ausführbar sein.

## 4. Sicherheitsgrenzen (unverändert aus den Vorgängeraufträgen)

- Entwicklung und lokale/Mock-Tests erlaubt, keine produktive Ausführung.
- Keine Änderung an Produktionsdaten, Diensten oder Guardrails.
- Vor Implementierung: Preflight-Checkliste und strukturierte Attestation (siehe bestehendes
  `lib/preflight.mjs`) gelten unverändert weiter.

## 5. Nächster zulässiger Schritt (aktualisiert nach Inventar)

1. Testfall "Enforcement-Lücke nachweisbar" implementieren (siehe Abschnitt 2) — gegen eine lokale Kopie/
   einen Mock des Kernel-Cores, nicht gegen Produktion.
2. MAC-001–008 im Runtime-Repo referenzieren statt duplizieren; falls Erweiterung nötig ist, PR gegen
   `nyxa-kernel-runtime` vorschlagen, nicht Paralleltests in `nyxa-kernel` aufbauen.
3. Replay-Verantwortlichkeit klären: welche Komponente (Bridge, Governed-Memory, oder noch keine) soll
   Nonce-/Grant-basierten Replay-Schutz tragen? Im Kernel-Core nicht vorhanden — Klärung mit Jo nötig, bevor
   R01/R02 implementiert werden.
4. Danach: Testfall-Implementierung nach demselben Muster wie `schemas/bridge-e2e/` (MockTransport-
   Selbsttest zuerst, dann isolierte Instanz, dann — nach gesonderter Freigabe — reale Prüfung).

Der Replay-Teil bleibt auf Planungsstufe (Komponente ungeklärt). Der DENY/ESCALATE-Teil ist jetzt präzise
genug spezifiziert (Enforcement-Lücke als Testziel), um implementiert zu werden, ohne etwas zu erfinden.
