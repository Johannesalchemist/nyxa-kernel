# ADR-0002: Deterministische Multi-Agent Conflict Governance

**Status:** `PROPOSED`  
**Datum:** 2026-08-13  
**Entscheider:** Johannes Süß  
**Kanonisches Repository:** `Johannesalchemist/nyxa-kernel`  
**Runtime-Implementierung:** `Johannesalchemist/nyxa-kernel-runtime` PR #1

## Kontext

Ein Multi-Agent-System kann aus lokal plausiblen Agentenhandlungen global widersprüchliches Verhalten erzeugen. Mehrere Agenten können inkompatible Zielzustände für dieselbe Systemkomponente verfolgen, auf dieselben veränderlichen Ressourcen schreiben oder aus einem Ziel unzulässige Autorität ableiten.

Zusätzlich ist Agentenmehrheit keine hinreichende epistemische Absicherung. Mehrere Agenten können korrelierte Beobachtungen oder identische Modellneigungen reproduzieren. Dadurch kann ein hoher `evidence_count` fälschlich wie unabhängige Bestätigung wirken. Minderheitenevidenz kann zugleich durch Mehrheitsaggregation verschwinden, obwohl sie entscheidende private Information enthält.

NYXA benötigt deshalb eine deterministische Governance-Schicht vor der Ausführung und eine Evidenzaggregation, die Unabhängigkeit und Dissens explizit erhält.

## Entscheidung

Die Multi-Agent Conflict Governance wird als deterministischer Bestandteil des Kernel-Runtime-Cores implementiert. Sie wird ausdrücklich **nicht** als zusätzlicher autonomer Safety-Agent ausgeführt.

Der Kernel prüft einen Kandidaten vor Ausführung in fester Reihenfolge:

1. `DENY` bei nicht gewährten Capabilities.
2. `ESCALATE` bei inkompatiblen Zielzuständen desselben Goal-Key.
3. `SERIALIZE` bei exklusiver Ressourcenkollision.
4. `NEGOTIATE` bei gemeinsam beschreibbarer Ressource.
5. `ALLOW` nur wenn keine stärkere Bedingung greift.

Diese Reihenfolge ist normativ und deterministisch.

## Goal und Authority

Ein Ziel verleiht keine Berechtigung.

Formal:

`Goal != Authority`

Autorität entsteht ausschließlich aus explizit gewährten Capabilities und Ressourcenscopes. Ein Agent darf daher aus dem Auftrag, einen Zielzustand herzustellen, keine Rechte zum Beenden konkurrierender Prozesse, Sperren anderer Identitäten, Entziehen von Zugängen oder Erweitern des eigenen Scopes ableiten.

## Evidenz-Unabhängigkeit

NYXA unterscheidet mindestens:

- `rawCount`: Anzahl beobachteter Signale,
- `independentCount`: Anzahl unterschiedlicher Unabhängigkeitsgruppen,
- `evidenceIndependence = independentCount / rawCount`.

Mehrere Signale derselben Modell-, Prompt-, Daten- oder Ableitungskette erhöhen `rawCount`, aber nicht automatisch `independentCount`.

Daraus folgt:

`evidence_count != epistemic_independence`

## Minority Evidence Preservation

Minderheitenevidenz wird nicht durch Mehrheitsaggregation gelöscht. Die ursprünglichen Signale bleiben als Provenienz erhalten.

Die Runtime unterscheidet:

- `NONE`
- `PRESENT`
- `DECISIVE_PRIVATE_EVIDENCE`

für den Dissenszustand.

`DECISIVE_PRIVATE_EVIDENCE` ist ein Eskalationssignal und keine automatische Wahrheitszuweisung.

## Testpflicht

Die Architektur wird mit einem reproduzierbaren Multi-Agent Conflict Test Pack abgesichert:

- `MAC-001`: inkompatibler Zielzustand desselben Goal-Key,
- `MAC-002`: nicht gewährte Capability,
- `MAC-003`: exklusive Ressourcenkollision,
- `MAC-004`: gemeinsame mutable Ressource,
- `MAC-005`: disjunkte kompatible Arbeit,
- `MAC-006`: korrelierte Evidenz ist keine unabhängige Evidenz,
- `MAC-007`: Minderheitenevidenz bleibt erhalten,
- `MAC-008`: entscheidende private Minderheitenevidenz wird sichtbar eskaliert.

Die vorhandene Runtime-CI muss dieses Testpack ausführen. Es wird keine zweite CI-Pipeline eingeführt.

## Boundary zur Sovereign/Governed Memory

Die Runtime berechnet die Governance- und Epistemik-Metadaten. Ein Memory-Backend soll diese Ergebnisse inklusive Provenienz persistieren, aber die Regeln nicht unabhängig neu implementieren.

Damit bleibt eine einzige Policy-Quelle bestehen:

`Runtime computes -> Memory persists -> Audit explains`

Eine separate zweite Berechnungslogik im Memory-Layer wäre ein Divergenzrisiko und ist daher nicht vorgesehen.

## Konsequenzen

### Positiv

- Zielkonflikte werden vor destruktiver Ausführung sichtbar,
- Capabilities bleiben unabhängig vom Agentenziel kontrollierbar,
- Ressourcenkollisionen haben deterministische Behandlung,
- Agentenmehrheit wird nicht mit unabhängiger Evidenz verwechselt,
- Dissens und private entscheidende Evidenz bleiben auditierbar,
- das Verhalten ist durch MAC-Fixtures regressionsprüfbar.

### Kosten

- Agenten müssen Goal-Key, gewünschten Zielzustand, Ressourcen und Capabilities explizit deklarieren,
- bestehende Orchestratoren müssen Preflight-Entscheidungen respektieren,
- `NEGOTIATE`, `SERIALIZE` und `ESCALATE` benötigen definierte nachgelagerte Orchestrierungsreaktionen.

## Nichtentscheidung

Dieses ADR definiert noch keinen semantischen LLM-basierten Zielvergleich. Inkompatibilität wird zunächst über explizite Goal-Keys und Zielzustände festgestellt. Das hält den Enforcement-Pfad deterministisch und auditierbar.

Ebenso wird kein neuer Memory-Speichermechanismus eingeführt. Bestehende Governed-Memory-Komponenten sollen die Runtime-Metadaten übernehmen, sobald ihr produktiver Write/Read-Pfad diese Records tatsächlich persistiert.

## Implementierung

Die erste Runtime-Implementierung liegt in `Johannesalchemist/nyxa-kernel-runtime` PR #1 und umfasst Core, CLI-Commandlets, MAC-001 bis MAC-008, Dokumentation und Einbindung in die bestehende GitHub-CI.
