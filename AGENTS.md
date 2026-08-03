# NYXA Agent Protocol V0.1

## Geltung

Diese Regeln gelten für GPT, Kimi und alle weiteren menschlichen oder künstlichen Beitragsinstanzen.

## Startsequenz

1. Repository und Zielbranch bestimmen.
2. `KNOSPEL.md` vollständig lesen.
3. Relevante Dateien unter `governance/`, `decisions/` und `schemas/` lesen.
4. Verzeichnisse prüfen und fehlende Verzeichnisse vor der Operation anlegen.
5. Vor jeder lokalen Operation in das Repository wechseln.
6. Bestehende Mechanismen und Tools prüfen, bevor neue eingeführt werden.

## Arbeitsregeln

- Deterministische Reihenfolge.
- Architektur zuerst stabilisieren.
- Vollständige Dateien liefern, keine Ersatzfragmente.
- Keine Patch-Inseln und keine parallelen Versionswahrheiten.
- Keine impliziten Annahmen. Unbekanntes wird als `unknown` oder `unverified` markiert.
- Bestehende Commandlets, Validatoren und Workflows werden vor Inline-Workarounds verwendet.
- Produktive Daten und epistemische Bewertung bleiben getrennt.
- Kein Freeze und keine Pilotautorisierung ohne dokumentierte Entscheidung.

## Herkunftspflicht

Jedes neue Artefakt muss enthalten oder über Metadaten referenzieren:

- Autor beziehungsweise verantwortlicher Mensch,
- erzeugendes System und Modell, soweit bekannt,
- Sitzungsdatum und Zeitzone,
- verwendete Quellen,
- Status der Quellen,
- epistemischen Status,
- Reviewstatus,
- bekannten Vorgänger,
- nächsten zulässigen Schritt.

## Branch- und Reviewmodell

- Agenten schreiben nicht unmittelbar auf einen gefrorenen Stand.
- Neue Arbeit erfolgt auf einem benannten Branch.
- Branchpräfixe: `gpt/`, `kimi/`, `human/`, `agent/`, `bootstrap/`.
- Handoffs werden unter `handoffs/YYYY/MM/` abgelegt.
- Architekturentscheidungen werden als ADR unter `decisions/` geführt.
- Ein Merge ersetzt keinen epistemischen Freeze.

## Konfliktregel

Bei widersprüchlichen Artefakten gilt keine automatische Neuheitspriorität. Der Konflikt wird als eigener Befund dokumentiert. Bis zur Entscheidung bleiben beide Quellen referenziert und die betroffene Freigabe ist blockiert.

## Geheimnisse und Datenschutz

Verboten sind Zugangsdaten, API-Schlüssel, private Schlüssel, `.env`-Dateien, personenbezogene Rohdaten, nicht redigierte Logs und Produktionsdatenbankauszüge.

## Abschlusssequenz

1. Validatoren und Tests ausführen.
2. Manifest und Hashes aktualisieren.
3. Handoff mit vollständiger Dateiliste schreiben.
4. Offene Blocker benennen.
5. Commit und Reviewziel dokumentieren.
