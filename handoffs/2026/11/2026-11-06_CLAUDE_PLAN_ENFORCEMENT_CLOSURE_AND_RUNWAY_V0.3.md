# ARBEITSPLAN: Schließung der Enforcement-Gap und Runway V0.3

**Datum:** 2026-11-06, Europe/Berlin
**Verantwortlicher Mensch:** Johannes Süß
**Erzeugendes System:** Claude Code (Anthropic), Cloud-Session (Modell in Sitzungsmetadaten)
**Grundlage:**
- Freigabe „Commit + Push unter Sicherheitsbedingungen“ vom 2026-11-06 (Chat)
- Commits `c27ba79` (Runway V0.2) und `cc60827` (Enforcement-Gap A–D) auf `agent/runway-characters-v0.2`
**Status:** `DRAFT` — Plan, **nichts davon umgesetzt**. Gesamtstatus **HOLD**.
**Nicht freigegeben:** Merge, Deployment, kostenpflichtige Runway-Aufrufe, Live-Test gegen die NYXA-Bridge, Umgehen von
Zugriffssperren, produktive Aktivierung von Enforcement-Änderungen. ADR-0003 und ADR-0004 bleiben Vorschläge.

## 0. Begriffe für alle Berichte

| Kategorie | Bedeutung |
| --- | --- |
| **Testsimulation** | Mock, synthetischer Konsument oder Attrappe. Beweist nur die lokale Logik. |
| **Implementierte Kontrolle** | Code, der eine Wirkung tatsächlich verhindern kann, nachgewiesen an einer von uns kontrollierten echten Aktion (z. B. Dateischreiben in einer Sandbox, echte HTTP-Anfrage an das Gateway), mit Pre/Post-State, korreliertem Audit und Mutationstest. |
| **Real bestätigte Wirkung** | Beobachtet an der produktiven oder einer attestierten isolierten echten Schnittstelle (Bridge, Runway). Derzeit **keine**. |

**Kriterium für das Verlassen von HOLD:** DENY, ESCALATE, Replay, Scope und Fail-Closed sind jeweils an einer tatsächlich
kontrollierten Aktion als *implementierte Kontrolle* nachgewiesen. Für die Bridge zusätzlich als *real bestätigte Wirkung*
nach gesonderter Freigabe.

## 1. Priorität: Enforcement-Gap schließen (Architektur- und Konsumentenebene)

### EG-1: ADR-0005 „Trusted Grant Authority“ (Vorschlag)

Problem (EG-08): Grants stammen aus dem JSON des Aufrufers. Ein selbst deklariertes Capability-Set ist keine
Autorisierung.

Entwurf:

- **Grant-Token** mit den Feldern `grantId`, `actor`, `session`, `tool`/`action`, kanonische `resourceId`, `scope`,
  `notBefore`, `expiresAt`, `approver`, `policyVersion`, `replayMode` (`single_use` | `idempotent`).
- Signiert vom Approver-Schlüssel (Ed25519). Der öffentliche Schlüssel ist im Enforcement-Point **gepinnt** und kommt nicht
  aus der Anfrage.
- Ausstellung nur durch einen Menschen bzw. eine dafür bestimmte Instanz, getrennt vom ausführenden Agenten (KNOSPEL-Prinzip 9:
  keine Monopolisierung von Urteil und Vollstreckung).
- Das Feld `grantedCapabilities` in der Eingabe wird am Enforcement-Point **ignoriert**. Die CLI behält es nur für die
  Entscheidungsberechnung und kennzeichnet es als `advisory`.
- Offene Frage an Johannes: Wer ist Approver, und wo liegt der private Schlüssel? Hardware-Key oder getrennter Rechner.
  Der Schlüssel liegt **nie** im Repository.

### EG-2: `enforce()` als Bibliothek in `nyxa-kernel-runtime` (Draft-PR, nicht produktiv verdrahtet)

Feste Reihenfolge, jede Stufe fail-closed:

1. Grant prüfen: Signatur, Ablauf, `notBefore`, `policyVersion`, Actor/Session, Tool/Action, Scope.
2. Ressource kanonisieren (`realpath` bzw. ID-Normalisierung) und gegen den Grant-Scope prüfen.
3. `evaluateMultiAgentPreflight` mit den Grants **aus dem Token** aufrufen. Nur `ALLOW` geht weiter. `ESCALATE` erzeugt einen Review-Eintrag,
   `SERIALIZE` und `NEGOTIATE` pausieren.
4. **Audit-Intent** mit `correlationId` schreiben und durch `fsync` dauerhaft machen. Bei Fehler: Abbruch, keine Wirkung.
5. Grant atomar verbrauchen (`single_use`: exklusiver Eintrag, zweiter Versuch wird abgelehnt; `idempotent`: gespeichertes
   Resultat zurückgeben, keine zweite Mutation).
6. TOCTOU-Recheck: Ressource erneut kanonisieren und muss identisch sein.
7. Wirkung ausführen.
8. **Audit-Result** schreiben. Bei Fehler: als `audit_incomplete` markieren und Folgeaktionen sperren.

Zusätzlich in der CLI (Contract 1.1, additiv):

- Exit-Code `3` für jede Nicht-ALLOW-Disposition, **zusätzlich** zur JSON-Prüfung.
- `DECISIVE_PRIVATE_EVIDENCE` als optionale Eingabe führt zu `ESCALATE` mit Grund `decisive_private_evidence`.
- Nebenbefund beheben: vitest schließt `dist/**` aus.

### EG-3: Nachweis an einer tatsächlich kontrollierten Aktion

Ziel ist die *implementierte Kontrolle*, keine reale Wirkung.

- Kontrollierte Aktion: Schreiben einer Datei in ein Sandbox-Verzeichnis über `enforce()`, ausgeführt von einem echten
  Kindprozess.
- Testfälle, jeweils mit Pre/Post-State-Hash, Audit-Korrelation und Mutationstest (Mechanismus entfernen, der Test muss
  fehlschlagen):

  | Fall | Erwartung |
  | --- | --- |
  | DENY | keine Wirkung |
  | ESCALATE | keine Wirkung, Review-Eintrag |
  | Replay | `single_use`: zweiter Versuch abgelehnt; `idempotent`: kein zweites Schreiben |
  | Scope | Wechsel von Pfad oder Ressource außerhalb des Grants wird abgelehnt |
  | TOCTOU | Symlink-Tausch zwischen Prüfung und Wirkung wird abgelehnt |
  | Stale/Expired Grant | abgelehnt |
  | Gefälschte Signatur bzw. falscher Schlüssel | abgelehnt |
  | Selbst deklarierte Capabilities ohne Token | abgelehnt (schließt EG-08) |
  | Audit-Ausfall (Verzeichnis nicht schreibbar) | keine Wirkung |
  | Parallele Writer (N Prozesse, ein `single_use`-Grant) | genau eine Wirkung |
  | Beschädigte Decider-Ausgabe, Timeout | keine Wirkung |

### EG-4: Governed-Memory-MCP (PR-Vorschlag, nicht deployen)

- `runTool()` umstellen auf: Audit-Intent **vor** dem Handler, Abbruch bei Audit-Fehler für Tools mit
  `requiresAudit`/`writesAuthoritativeMemory`.
- `AuditLog.append` darf Fehler für diese Tools nicht verschlucken.
- Andockpunkt für `enforce()` bei künftigen schreibenden Tools.

### EG-5: Bridge (HOLD)

Erst nach menschlicher Bereitstellung einer **attestierten isolierten Instanz**:

- Identität, Code-Hash, Route und Audit-Sink attestieren.
- Danach Enforcement-Point im Dispatcher kartieren und `enforce()` als Draft einziehen.
- Live-Nachweis nur mit gesonderter Freigabe.

Bis dahin ist B8 `NOT_TESTABLE`.

## 2. Runway V0.3 (nach EG-2)

| # | Arbeit | Kategorie nach Umsetzung |
| --- | --- | --- |
| V3-1 | Env-Grants (`NYXA_GRANTED_CAPABILITIES`) durch Grant-Token aus EG-1/EG-2 ersetzen; `src/policy.ts` wird dünner Adapter auf `enforce()` | implementierte Kontrolle |
| V3-2 | Audit fail-closed **ausdrücklich** testen: Audit-Schreibfehler vor `realtime_sessions.create` → keine Session. Heute: `appendFileSync` wirft, der Pfad ist aber nicht getestet. Dazu Hash-Kette für `audit.jsonl` (manipulationsevident) | implementierte Kontrolle |
| V3-3 | Lücke „create-Antwort verloren“ (Red Team R3): Abgleich neuer `in_progress`-Conversations im Zeitfenster der eigenen Anfrage. Kein Fremdeingriff ohne eindeutige Zuordnung | Testsimulation, bis Live-Test |
| V3-4 | Browser-E2E mit Playwright gegen Mock-Server (SDK gestubbt, keine Credits): Login, Start, Heartbeat, Ende, `pagehide` | Testsimulation |
| V3-5 | Isolierter Live-Test nach `LIVE_TEST_PROTOCOL_V0.2.md` | real bestätigte Wirkung (nur nach Freigabe) |
| V3-6 | Umzug nach `nyxa-kernel-runtime` | nach Entscheidung ADR-0003 |
| V3-7 | Sara als Custom Character (Weg 1, ohne Code); Weg 2/3 erst nach ADR-0004-Entscheidung | nach Freigabe |

## 3. Reihenfolge und Abhängigkeiten

```
EG-1 (ADR-Entscheidung) ─► EG-2 (enforce + CLI 1.1, Draft-PR Runtime) ─► EG-3 (Nachweise) ─► V3-1, V3-2
                                                         └─► EG-4 (Governed-Memory-PR)
V3-4 unabhängig sofort möglich
V3-5 braucht Freigabe; V3-6 braucht ADR-0003; EG-5 braucht attestierte Instanz
```

## 4. Benötigte Entscheidungen bzw. Zugänge

1. Approver und Schlüsselhaltung für die Grant Authority (EG-1).
2. Schreibzugriff dieser oder einer Folgesession auf `nyxa-kernel-runtime` und `nyxa-governed-memory-mcp` für Draft-PRs.
3. Bereitstellung einer attestierten isolierten Bridge-Instanz (EG-5).
4. Freigabe des Runway-Live-Tests (V3-5).

## 5. Nächster zulässiger Schritt

ADR-0005 als Entwurf schreiben (EG-1) und `enforce()` mit den Nachweisen aus EG-3 in einer isolierten Kopie der Runtime
umsetzen. Das Ergebnis wird als Patch bzw. Draft-PR vorgelegt und **nicht** produktiv verdrahtet.
