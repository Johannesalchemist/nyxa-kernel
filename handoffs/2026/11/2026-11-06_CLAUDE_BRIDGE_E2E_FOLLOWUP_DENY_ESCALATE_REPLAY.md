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

## 2. Bekannte Lücke vor Implementierung (muss zuerst geklärt werden)

Dieser Auftrag kann nicht blind implementiert werden, ohne zuerst zu klären, **welche konkrete Komponente**
DENY/ESCALATE/Replay tatsächlich entscheidet:

- Ist es der Bridge-Prozess selbst (`nyxa-claude-mcp-bridge.service` / `bridge.cjs`)?
- Ist es die Governed-Memory-Runtime (`AuditLog.js`-Umgebung, `gamma`-artige C1–C5-Prüfung aus früheren
  NYXA-MCP-Observierungen)?
- Ist es ein noch nicht in diesem Repository dokumentierter Multi-Agent-Kernel-Core
  (`Johannesalchemist/nyxa-kernel-runtime`, laut ADR-0002 "Runtime computes -> Memory persists -> Audit
  explains")?

Ohne diese Klärung würde ein Testfall-Autor raten müssen, welchen Vertrag er prüft — das widerspricht
AGENTS.md ("Keine impliziten Annahmen. Unbekanntes wird als `unknown` markiert."). **Erster Schritt vor
Implementierung: Klärung mit Jo, welche Komponente adressiert wird, und ob ihr MAC-001–MAC-008-Testpack
(laut ADR-0002) bereits existiert und wiederverwendet werden kann/soll statt eines neuen Bridge-spezifischen
Tests.**

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

## 5. Nächster zulässiger Schritt

1. Mit Jo kl—ren, welche Komponente DENY/ESCALATE/Replay tatsächlich entscheidet (Abschnitt 2).
2. Prüfen, ob ein MAC-001–MAC-008-Testpack (ADR-0002) bereits in `nyxa-kernel-runtime` existiert — falls ja,
   dieses wiederverwenden statt neu zu bauen (AGENTS.md: bestehende Mechanismen vor neuen Tools).
3. Erst danach: Testfall-Implementierung nach demselben Muster wie `schemas/bridge-e2e/` (MockTransport-
   Selbsttest zuerst, dann isolierte Instanz, dann — nach gesonderter Freigabe — reale Prüfung).

Dieser Auftrag bleibt bis zur Klärung aus Abschnitt 2 auf Planungsstufe. Keine Implementierung ohne diese
Klärung, um kein erfundenes Governance-Verhalten zu testen.
