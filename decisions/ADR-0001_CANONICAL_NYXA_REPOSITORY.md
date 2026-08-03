# ADR-0001: Kanonisches NYXA Repository

**Status:** `PROPOSED`  
**Datum:** 2026-08-03  
**Entscheider:** Johannes Süß  
**Repository:** `Johannesalchemist/nyxa-kernel`

## Kontext

NYXA-Artefakte wurden bisher über mehrere GPT-, Kimi- und lokale Sessions verteilt erzeugt. Session-lokale Dateisysteme sind nicht dauerhaft gemeinsam sichtbar. Dadurch entstanden fehlende Primärquellen, parallele Versionen, nicht überprüfbare Dateilisten und wiederholte Rekonstruktionen.

## Entscheidung

`Johannesalchemist/nyxa-kernel` wird als kanonische, versionierte Quelle für folgende Bereiche verwendet:

- Knospel und Architekturkontext,
- epistemische Governance,
- formale Schemata und Validatoren,
- wissenschaftliche Artefakte und Evidenzregister,
- unveränderliche Handoffs,
- Architektur- und Freeze-Entscheidungen,
- Referenzen auf produktive NYXA-Systeme.

GPT, Kimi und weitere Agenten arbeiten über Branches, vollständige Dateien, Manifeste und Pull Requests.

## Nichtentscheidung

Dieses ADR macht das Repository nicht automatisch zum Speicher für Secrets, personenbezogene Rohdaten, Produktionslogs oder operative Datenbanken. Es ersetzt auch keinen epistemischen Freeze.

## Konsequenzen

### Positiv

- gemeinsame Quelle für Menschen und Agenten,
- nachvollziehbare Herkunft und Änderungshistorie,
- automatische Validierung möglich,
- keine Abhängigkeit von einzelnen Sessions,
- Konflikte können reviewbar statt still aufgelöst werden.

### Kosten

- bestehende Artefakte müssen inventarisiert werden,
- fehlende Quellen bleiben sichtbar blockiert,
- Agenten benötigen Repository-Zugriff und ein einheitliches Handoff-Protokoll,
- Reviews und Statuspflege werden verpflichtend.

## Alternativen

- ausschließlich lokale Ordner: verworfen wegen mangelnder gemeinsamer Sichtbarkeit.
- ausschließlich Chat-Handoffs: verworfen wegen fehlender Dateiintegrität und Versionierung.
- produktive Runtime-Repositories als Sammelstelle: verworfen wegen Vermischung von Forschung, Governance und Betrieb.

## Nächster Schritt

Bootstrap-Branch reviewen, anschließend Kimi-Import nach Issue #1 durchführen und das Knospel Schema V0.2 vollständig unter `schemas/knospel/v0.2/` übernehmen.
