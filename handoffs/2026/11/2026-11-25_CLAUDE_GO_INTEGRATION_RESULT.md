# Handoff · Ergebnis der Implementierungs- und Integrationsfreigabe (GO, 25.11.2026)

| Feld | Wert |
| --- | --- |
| Datum / Zeitzone | 2026-11-26, ca. 00:10 Europe/Berlin (Arbeit am 25.11. abends) |
| Auftraggeber | Johannes Süss, Human Authority / System Owner. Entscheidung: GO für alle fünf Punkte |
| Erzeugendes System | Claude (Anthropic), Claude Code. Auf dem Server als Betreiberkonto **ohne** Rechteausweitung (kein sudo) |
| Vorgänger | `2026-11-25_CLAUDE_UNIFIED_DISCOVERY_MEMORY_INTEGRATION.md` |
| Epistemischer Status | `DRAFT`. Eine einzelne Agenten-Arbeit, unabhängige Bestätigung steht aus |
| Reviewstatus | `IN_REVIEW` |
| Kanonischer Status | [`research/COMPONENT_STATUS_MATRIX.md`](../../../research/COMPONENT_STATUS_MATRIX.md) und [`research/component-registry.public.json`](../../../research/component-registry.public.json) |
| Nicht öffentlich | Privater Integrations-Handoff, root-Runbook (mit SHA-256), vollständige Registry mit Fundorten. Alle liegen im Operations-Verzeichnis des Betreibers |

## Umgesetzt

| GO-Punkt | Ergebnis | Nachweis |
| --- | --- | --- |
| 1 Discovery | **NYXA Discovery V1**: findet Komponenten über Repos, *alle* lokalen Branches, Worktrees, Verzeichnisnamen und User-Timer. Eine kuratierte Evidenzschicht mit Herabstufungsregel verhindert Verifikation ohne Beleg. Läuft stündlich als gehärteter User-Dienst | 3/3 Tests; Lauf: 67 Repos, 1.414 Branches, alle zuvor übersehenen Komponenten gefunden, dazu der **RIVA-Pilot** (7/7) |
| 1 Lesezugriffe | Vorbereitet als **ein** root-Runbook: 7 nur lesende Roots, ACLs mit Ausschlüssen (versiegelter Holdout, Modellgewichte, Audit- und Memory-Daten, Heartbeat-Zustand, Schlüssel), Neustart nur der Claude-Bridge, Probelauf als Standard, Rollback | Syntaxprüfung OK, Hash im privaten Handoff |
| 2 Autonome Kandidaten | Live geprüft. Siehe Konflikt K1: Mit unveränderter E0 kann **kein** unattestierter Agenten-Kandidat gespeichert werden. Nichts geschrieben, keine Umgehung versucht | Drei dokumentierte Proben (C5, E0 zu hoch, E0 zu niedrig) |
| 3 Memory-Sync | **CP-001** implementiert als Modul (Envelope mit serverseitiger Identität, Konfidenzdeckel für unattestierte Beobachtungen, Widersprüche als Referenzen, Supersede/Retract, Recall-Labels). Liegt bewusst außerhalb der Dateien, an denen Codex arbeitet | 7/7 Integrationstests |
| 4 Registry | Konflikt Server C **analysiert und aufgelöst**: Das Routing ist korrekt, die Toolbox-Registrierung veraltet. Maschinenlesbare Registry als gemeinsame Statusquelle, öffentliche Projektion im Repo | – |
| 5 Integration | Heartbeat und Embodiment als **Ereignisquellen an den V3-Envelope angeschlossen** (eigener Integrations-Branch auf V3): Das echte Heartbeat-Journal besteht End-to-End die Hash-Ketten-Prüfung, Embodiment liefert nur Aggregate ohne Gesichtswerte. Runpod-Budgetgrenzen unverändert | 7/7; V3-Build grün |

## Nicht umgesetzt, weil es echte Blocker oder Architekturkonflikte sind

| ID | Befund | Was du entscheiden oder ausführen musst |
| --- | --- | --- |
| K3 | Die Agenten-Session hat keine Rechteausweitung. Runtime, Bridge und Connector-Konfiguration gehören dem Dienstkonto. Die Docker-Gruppe wäre faktisch root. Sie wurde **nicht** genutzt, weil das eine Umgehung wäre | Das root-Runbook einmal als root ausführen (Probelauf, dann `--apply`). Es deckt Roots, ACLs, Bridge-Neustart und die Reverifikation des Prüfstands „6 PASS / 11 HOLD“ ab |
| K2 | Die Runtime ist eine eigene Git-Historie mit 11 uncommitteten Live-Patches an governance-kritischen Dateien. V3, Runpod und die neuen Adapter liegen in einer anderen Linie | Freigabe für den Abgleichpfad: Live-Patches zuerst als Snapshot versionieren (root), dann rebasen, die volle Suite plus Live-Gate-Tests auf dem Testhost fahren, dann das Release mit kontrolliertem Neustart |
| K1 | E0 bewertet Evidenz nur über Claim-Tags (CLAIM 0,4 < 0,7). Die GO-Vorgabe „autonom, E0 beibehalten“ ist so nicht erfüllbar | (a) externer Attestor (Evidence Passport); (b) E0-Regel „speichern mit Epistemik-Status statt halten“ für nicht-autoritative Projekt-Kandidaten, Promotion bleibt menschlich; (c) Status quo |
| – | Die Codex-Arbeit am Memory-Schema ist **nicht abgeschlossen**: uncommittet, ihr Testlauf hängt seit über 30 Stunden. Der hängende Test ist auch in meinem Lauf auffällig | Die Freigabebedingung „nach Abschluss“ ist nicht erfüllt. Keine Commits auf dem fremden Branch, kein Eingriff in den fremden Prozess |

## Testbefunde auf der V3-Basis (eigener Nachtest)

- Grün: Build, V3- und Kernmodule, meine 7 Integrationstests, Discovery 3/3, Embodiment 3/3, RIVA 7/7.
- Rot, eingeordnet: 3 Patch-Sandbox-Tests (Umgebung: Die Sandbox lässt sich nicht aufbauen). 2 Wirkradius-Tests (die Governance entscheidet **strenger** als erwartet, DENY statt ESCALATE; der Test ist veraltet, es gibt keine Sicherheitsregression). 1 Neustart-Test hängt. Ich habe keinen dieser Tests verändert.

## Öffentlich und privat

Das öffentliche Repo enthält keine Hostnamen, IPs, Pfade oder Benutzernamen. Das wurde vor dem Push geprüft. Der Integrations-Branch wurde **nicht** nach GitHub gepusht, weil das Ziel-Repository öffentlich ist und der Test einen lokalen Standardpfad enthält.

## Nächster zulässiger Schritt

1. Betreiber: root-Runbook im Probelauf, dann anwenden.
2. Betreiber: Entscheidung zu K1 und K2.
3. Danach: MCP-Lesezugriff auf die Registry prüfen. Abgleich Runtime ↔ V3 nach K2. Release mit End-to-End-Probe.
