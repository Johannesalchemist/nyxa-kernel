# Handoff · NYXA Unified Discovery, Memory & Integration

| Feld | Wert |
| --- | --- |
| Datum / Zeitzone | 2026-11-25, ca. 21:20 Europe/Berlin |
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude (Anthropic), Claude Code Remote-Session; Werkzeuge: NYXA-MCP (I0 und eine Proposal-Probe), Desktop Commander (lesend; schreibend nur in eigenen Handoff- und Proposal-Dateien) |
| Auftrag | Zehn Punkte „Unified Discovery, Memory & Integration“ (Chat, 2026-11-25) |
| Vorgänger | `2026-11-25_CLAUDE_ACCESS_AND_MEMORY_SYNC_REQUEST.md` (bleibt unverändert; Abschnitt 3 dort ist durch Punkt 5 unten präzisiert) |
| Epistemischer Status | `DRAFT` |
| Reviewstatus | `IN_REVIEW` |
| Änderungen an produktiven Systemen | **keine**. Keine Konfiguration, kein Neustart, kein Mandat, kein Memory-Write |
| Nicht öffentliche Begleitdokumente | konsolidiertes Freigabepaket im Operations-Verzeichnis des Betreibers (`2026-11-25_claude_mcp_roots_proposal.md`, ersetzt die Fassung von 19:50 UTC); Contract Proposal `CP-001_MEMORY_SYNC_ENVELOPE.md` im privaten Vertrags-Repository (uncommittet) |

## Ergebnis je Punkt

| # | Punkt | Stand | Ergebnis |
| --- | --- | --- | --- |
| 1 | Registries konsolidieren | erledigt (Analyse) | Kein Neubau. Gefunden: System Registry V1 (veraltet, 21.10.), Registry V2 (HOLD), Toolbox-Registry (45 Fähigkeiten), Studio-Registry (81 Routen), Operator-Routing-Register, Resource-/E0-Discovery. Empfehlung: den bestehenden Komponentenindex (Vertrag C4) um `component_state` und `deployment` erweitern |
| 2 | Vier MCP-Roots vorbereiten | vorbereitet, nicht angewendet | Exakte Konfiguration privat. Ausgeschlossen: versiegelter Holdout, lokale Modelle, Audit- und Memory-Datenverzeichnisse, Schlüsseldateien. Zwei weitere Roots empfohlen (V3-Branch, Heartbeat ohne `state/`). Rechte nur gezielt per ACL. Anwendung und Neustart braucht root |
| 3 | Komponenten rekonstruieren | erledigt | **Heartbeat** gefunden (Shadow, Timer aktiv). **V3** gefunden (Branch, Shadow). **Runpod Connector** gefunden (Branch, Commit 645c6fd). **Embodiment**-Modul gefunden (Staging, 3/3). „Embodiment Core“ als Name: `NOT_FOUND`. Quellen: Branches, Worktrees, V3-Integrationsdoku, Contract-Mapping eines anderen Agenten |
| 4 | Fünf Zustände trennen | erledigt | [`research/COMPONENT_STATUS_MATRIX.md`](../../../research/COMPONENT_STATUS_MATRIX.md) mit `NOT_FOUND` · `UNREACHABLE` · `SPECIFIED_ONLY` · `IMPLEMENTED` · `FUNCTIONALLY_VERIFIED` × Deployment |
| 5 | Mandat für automatische Kandidaten-Speicherung | **Befund: kein Mandat nötig** | NYXA erlaubt nicht-autoritative Kandidaten im Projekt-Scope bereits ohne Einzelfreigabe (der Server vergibt Wirkradius 1). Live-Probe: falsches Ziel → C5 ESCALATE. Korrektes Ziel → Gamma ALLOW, dann **E0 HELD** wegen zu hoher Konfidenz einer unattestierten Eigenbeobachtung. Das ist korrekt. Ein dritter, kalibrierter Versuch wurde vom Sicherheitsklassifikator der Claude-Session blockiert und nicht ausgeführt. Ich habe danach keine weiteren Versuche unternommen |
| 6 | Bidirektionaler Abgleich ChatGPT ↔ Claude ↔ NYXA | vorbereitet | Contract Proposal CP-001 im bestehenden Vertragsprozess: ein Speicher (CandidateStore), serverseitige Agentenidentität, Quellen, Zeit, Epistemik-Status, Attestierung, `contradicts`/`supports`. Selbstmodelle getrennt. Agent ↔ Agent nur über NYXA. Fünf Akzeptanztests |
| 7 | Mandate und Freigaben über den MCP-Adapter | Befund + Bündelvorschlag | Der Weg existiert bereits: Delegation Frame → Transaktion mit Artefakt-Hash → Passkey → Einreichung durch den Betreiber. Ein anderer Agent arbeitet aktiv daran. Ich habe dort nichts gebaut oder geändert. Bündel F1–F3 privat beschrieben. Grenzen: Mandat höchstens 7 Tage, abgeleitetes Mandat höchstens 2 Stunden |
| 8 | Laufende Arbeiten prüfen | erledigt | Aktiv: Codex (Memory-Konsolidierung, uncommittet), Authority-Konsolidierung (heute geändert, Lock-Datei), V3 (Shadow), Embodiment-Staging (heute), Contract-Owner-Mapping (gestern). In keinen fremden Arbeitsbereich geschrieben |
| 9 | Öffentlich und privat trennen | eingehalten | Öffentliches Repo ohne Hostnamen, IPs, Pfade und Benutzernamen (vor dem Push geprüft). Exakte Details nur in privaten Dateien |
| 10 | Funktion prüfen, Matrix aktualisieren | erledigt | Live: Routing-Preflight OK (ein Server `retired`, aber in der Toolbox `degraded` → **Konflikt**). Toolbox-Health OK (45 Fähigkeiten, Orchestrierung `degraded`). Recall OK (Epoche leer). Schreibpfad bis E0 geprüft. Embodiment-Tests 3/3 |

## Offene Blocker und Entscheidungen für den Menschen

1. **Roots anwenden** (root): Konfiguration, ACL und gezielter Neustart. Oder ablehnen.
2. **Kandidaten-Autonomie:** Bestätige in einer Claude-Session ausdrücklich, dass kalibrierte, unattestierte Kandidaten (Konfidenz ≤ E0-Schwelle) automatisch eingereicht werden dürfen. Auf NYXA-Seite ist keine Änderung nötig.
3. **CP-001 prüfen und committen** (Commit-Autorität beim Menschen), nachdem der Codex-Branch committet ist.
4. **Konflikt Server-Register:** `retired` im Routing gegen `degraded` in der Toolbox. Welcher logische Server ist das zweite aktive Gerät?
5. **Prüfstand 6 PASS / 11 HOLD:** Reverifikation nur mit root möglich.
6. **Release V3 / Runpod** in die Runtime: eigene Produktiv-Promotion laut V3-Doku.

## Methodische Lektion (übernommen in die Matrix)

`NOT_FOUND` erst nach Prüfung von Branches, Worktrees, Benutzer-Timern und den Handoffs anderer Agenten vergeben.

## Nächster zulässiger Schritt

Review durch Johannes Süß. Danach F1 und Punkt 2 der Blockerliste. Anschließend unabhängige Bestätigung der Matrix durch einen zweiten Agenten (ChatGPT oder Codex), damit der Inventurbefund attestierbar wird.
