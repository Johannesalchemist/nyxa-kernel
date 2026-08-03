# NYXA Repository Policy V0.1

## 1. Kanonischer Status

`Johannesalchemist/nyxa-kernel` ist die kanonische Quelle für NYXA Forschungsarchitektur, Governance, Knospel-Schemata, Handoffs und Architekturentscheidungen.

Lokale Ordner, Session-Artefakte und Chat-Ausgaben besitzen keine kanonische Autorität, solange sie nicht mit Herkunft und Status in dieses Repository übernommen wurden.

## 2. Trennung der Ebenen

- `research/`: wissenschaftliche Aussagen, Quellen, Hypothesen und Evidenz.
- `governance/`: Regeln für Prüfung, Freigabe, Freeze und Reset.
- `schemas/`: formale Verträge, Validatoren, Fixtures und Tests.
- `modules/`: konkrete produktive Module samt epistemischem Vertrag.
- `runtime/`: Referenzen auf produktive Systeme, keine Betriebsgeheimnisse.
- `handoffs/`: unveränderliche Übergaben zwischen Sessions und Systemen.
- `decisions/`: verbindliche Entscheidungen mit Begründung und Status.

Keine Datei darf gleichzeitig produktive Konfiguration und epistemische Freigabe verdeckt vermischen.

## 3. Quellenstatus

Jede wissenschaftlich oder architektonisch relevante Datei muss genau einen Quellenstatus führen:

- `SOURCE-VERIFIED`
- `SOURCE-BOUND`
- `HANDOFF-DERIVED-PENDING-CONFORMITY`
- `RECONSTRUCTED-NO-SOURCE`
- `UNVERIFIED`

Eine Rekonstruktion darf eine fehlende Primärquelle nicht still ersetzen.

## 4. Artefaktstatus

Zulässige Statuswerte:

- `DRAFT`
- `IN_REVIEW`
- `VALIDATED`
- `FROZEN`
- `REJECTED`
- `SUPERSEDED`

`MERGED` ist kein epistemischer Status.

## 5. Import vorhandener Artefakte

Vorhandene GPT-, Kimi- oder lokale Artefakte werden in vier Klassen eingeteilt:

1. `CANONICAL-CANDIDATE`: unmittelbar relevant und vollständig.
2. `EVIDENCE-ONLY`: als Beleg oder Entwicklungsprotokoll relevant.
3. `SUPERSEDED`: historisch relevant, aber fachlich ersetzt.
4. `EXCLUDE`: Secrets, personenbezogene Rohdaten, temporäre Dateien oder irrelevante Ausgaben.

Jeder Import benötigt ein Manifest mit ursprünglichem Pfad, SHA-256, erzeugendem System, Datum, Status und Zielpfad.

## 6. Freeze

Ein Freeze erfordert:

- vollständige Quelle oder dokumentierten Rekonstruktionsstatus,
- bestandene automatische Validierung,
- unabhängige Review,
- dokumentierte offene Abweichungen,
- formale Freeze-Entscheidung unter `decisions/`.

## 7. KI-Zusammenarbeit

GPT und Kimi arbeiten nicht über gegenseitig kopierte Chatfragmente, sondern über Branches, Handoffs und Pull Requests. Jede Session liest den aktuellen Repository-Stand, dokumentiert ihre Inputs und legt vollständige Ergebnisse zurück.

## 8. Sicherheit

Verboten:

- Secrets und Schlüssel,
- `.env`-Dateien,
- personenbezogene Rohdaten,
- private Kommunikationsinhalte ohne Freigabe,
- Produktionslogs mit Zugangsdaten,
- nicht redigierte Datenbankexporte.

## 9. Konflikte

Widersprüche werden als Befund abgelegt. Keine Quelle überschreibt eine andere allein aufgrund späteren Datums. Eine Entscheidung muss den Konflikt explizit auflösen oder offen halten.
