# HANDOFF: Kimi → NYXA Canonical Repository Import V0.1

**Datum:** 2026-08-03 13:08 CEST  
**Autor / Verantwortung:** Johannes Süß  
**Empfänger:** Kimi Architektur- und Forschungs-Session  
**Repository:** `Johannesalchemist/nyxa-kernel`  
**Zielbranch-Präfix:** `kimi/import-YYYYMMDD-*`  
**Status:** `ACTION-REQUIRED`

## 1. Zweck

Alle bisher in Kimi-Sessions, `/mnt/agents/output`, lokalen Arbeitsordnern oder Chat-Handoffs erzeugten NYXA-Artefakte müssen gegen das kanonische Repository inventarisiert und, soweit relevant, nachvollziehbar übernommen werden.

Das Repository ersetzt keine Quellenprüfung. Es verhindert, dass Artefakte erneut nur in einer Session existieren.

## 2. Startsequenz

1. Repository klonen oder den aktuellen Stand laden.
2. `README.md`, `AGENTS.md`, `KNOSPEL.md` und `governance/REPOSITORY_POLICY_V0.1.md` vollständig lesen.
3. Neuen Branch `kimi/import-20260803-session-artifacts` anlegen.
4. Arbeitsverzeichnis prüfen und benötigte Zielverzeichnisse erstellen.
5. Erst danach Artefakte kopieren oder rekonstruieren.

## 3. Zu inventarisierende Quellen

Mindestens prüfen:

- `/mnt/agents/output`
- Kimi-Session vom 2026-08-03, 12:29 CEST
- alle Kimi-Handoffs zu Epistemic Governance, Knospel, SOTA Phase 1 und Phase 2
- lokale Exporte oder Download-Ordner mit `NYXA`, `Knospel`, `Epistemic`, `Simulation Safety`, `SOTA`, `Phase-1`, `Phase-2`

## 4. Bekannte Artefaktgruppen

### 4.1 Epistemic Governance

Gesucht wird insbesondere der vollständige Primärtext:

`NYXA Epistemic Governance & Simulation Safety Specification V0.1`

Bei Fund:

- unverändert unter `governance/epistemic/v0.1/` ablegen,
- SHA-256 bilden,
- ursprünglichen Pfad und Erzeugungszeit dokumentieren,
- keine stillen redaktionellen Änderungen,
- Quellenstatus `SOURCE-VERIFIED-CANDIDATE` bis unabhängige Prüfung.

Bei Nichtfund:

- Suchprotokoll mit geprüften Pfaden und Befehlen ablegen,
- Status `RECONSTRUCTED-NO-SOURCE` nicht eigenmächtig aufheben.

### 4.2 SOTA Phase 1 und Phase 2

Die berichteten Artefakte 0–19 sowie spätere Reviews müssen inventarisiert werden. Jedes Artefakt wird klassifiziert als:

- `CANONICAL-CANDIDATE`
- `EVIDENCE-ONLY`
- `SUPERSEDED`
- `EXCLUDE`

Keine Datei erhält allein durch Import Implementierungs- oder Freeze-Autorität.

### 4.3 Weitere Forschungs- und Systemartefakte

Relevant sind vollständige Spezifikationen, Schemas, Manifeste, Quellenregister, Tests, Vergleichsanalysen, Entscheidungsprotokolle und Reproduktionspakete.

Temporäre Logs, Tool-Ausgaben, Secrets, `.env`-Dateien, personenbezogene Rohdaten und Cache-Dateien sind ausgeschlossen.

## 5. Pflichtmanifest

Erzeuge:

`handoffs/2026/08/KIMI_IMPORT_MANIFEST_2026-08-03.yaml`

Für jede Datei:

```yaml
- source_path: string
  source_sha256: string
  generated_by: Kimi
  generated_at: ISO8601 | unknown
  source_session: string | unknown
  classification: CANONICAL-CANDIDATE | EVIDENCE-ONLY | SUPERSEDED | EXCLUDE
  target_path: string | null
  source_status: SOURCE-VERIFIED | SOURCE-BOUND | HANDOFF-DERIVED-PENDING-CONFORMITY | RECONSTRUCTED-NO-SOURCE | UNVERIFIED
  artifact_status: DRAFT | IN_REVIEW | VALIDATED | FROZEN | REJECTED | SUPERSEDED
  notes: string
```

## 6. Zielstruktur

- Governance: `governance/`
- Knospel-Schemata: `schemas/knospel/`
- SOTA-Register und Vergleiche: `research/sota/`
- Reports: `research/reports/`
- Entscheidungen: `decisions/`
- Unveränderliche Übergaben: `handoffs/2026/08/`
- Nur Laufzeitreferenzen: `runtime/`

## 7. Validierung

- SHA-256-Manifest erzeugen.
- Doppelte Inhalte anhand Hash erkennen.
- Dateinamen und interne Versionsangaben abgleichen.
- Abweichungen und fehlende Quellen separat dokumentieren.
- Keine automatische Hochstufung auf `VALIDATED` oder `FROZEN`.

## 8. Abschluss

1. Vollständige Dateien committen.
2. Draft Pull Request gegen `main` öffnen.
3. PR-Beschreibung enthält Umfang, Ausschlüsse, Tests, Konflikte und offene Quellen.
4. Dieses Handoff im PR referenzieren.
5. Johannes Süß als menschlichen Entscheidungspunkt benennen.

## 9. Verbindliche Kurzform für Kimi

> Lies zuerst den kanonischen Repository-Kontext. Inventarisiere alle bisher erzeugten NYXA-Artefakte. Importiere nur vollständige und relevante Dateien über einen eigenen Branch. Bewahre Herkunft, Hash, Status und Abweichungen. Keine Secrets, kein Freeze, keine stillen Rekonstruktionen. Öffne anschließend einen Draft PR.
