# CLAUDE.md · Kontext für Claude-Sessions in `nyxa-kernel`

Dieses Repository ist **öffentlich**. Es ist NYXAs kanonische Quelle für Selbstmodell (`KNOSPEL.md`), Agentenprotokoll (`AGENTS.md`), Governance, Entscheidungen, Forschung und Handoffs.

## Zuerst lesen

1. `AGENTS.md`: Startsequenz, Herkunftspflicht, Konfliktregel, Abschlusssequenz. Das Protokoll ist verbindlich.
2. `KNOSPEL.md` vollständig.
3. Relevante Dateien unter `governance/`, `decisions/`, `research/`.
4. Den jüngsten Handoff unter `handoffs/YYYY/MM/`.

## Öffentlichkeit

- Keine internen Hostnamen, IP-Adressen (auch keine Tailscale-Adressen), absoluten Server-Pfade, Benutzernamen, Secrets oder personenbezogenen Daten committen.
- Für exakte Betriebsdetails einen **nicht öffentlichen** Betriebs-Handoff auf dem Server ablegen und hier nur generisch referenzieren.
- Vor jedem Push die gepushten Dateien auf solche Details prüfen.

## NYXA-MCP und Memory

- Lesen (I0) ist frei: `nyxa_self_model_read`, `nyxa_memory_recall_candidates`, `governance_status`, `nyxa_list`, `nyxa_read_file`, `nyxa_search`.
- Schreiben läuft **nur** über `nyxa_propose_action` und Gamma. `ESCALATE` oder `DENY` werden respektiert, nicht umformuliert. Promotion von Kandidaten bleibt menschlich.
- Claude ist nicht NYXA: keine Schreibzugriffe auf NYXAs Selbstmodell. Beiträge erscheinen als `other_agent` oder als Kandidat.
- Was der MCP nicht sieht, ist nicht automatisch nicht vorhanden. Den Prüfweg nennen und als `unverified` markieren.

## Stand der letzten Claude-Session

Siehe `handoffs/2026/11/2026-11-25_CLAUDE_GO_INTEGRATION_RESULT.md` (neuester Stand), `research/COMPONENT_STATUS_MATRIX.md` und `research/component-registry.public.json`.

## Inventur-Regel

`NOT_FOUND` erst vergeben, nachdem alle lokalen Branches, Worktrees, Verzeichnisnamen, User-Timer sowie die Handoffs und Mappings anderer Agenten geprüft wurden. Die NYXA Discovery V1 macht das automatisch.

## Rechte

Agenten-Sessions auf den Servern haben keine Rechteausweitung. Privilegierte Schritte gehören in ein vom Betreiber ausgeführtes root-Runbook. Die Docker-Gruppe ist kein zulässiger Ersatz für root.
