# P0 Execution R8 — One-Click Human Authority (2026-11-27)

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` · Commits `392508f`, `db277f5`, `3da34d5`, `2e5dab9`, dieser Bericht |
| Ergebnis | **NICHT GREEN.** Implementiert und gegen den echten Issuer getestet; Installation durch das Gate WP-A1 gesperrt |

## Geänderte Dateien
`modules/authority/human-authority-lifecycle/`: `lifecycle.mjs`, `lifecycle.test.mjs`, `issuerDiscover.mjs`, `discover_patch.py`, `test_discover.py`, `publish_worker.py`, `runtime_patch.py`, `README.md`.

## Deployment-Version
Release **V2.1** = V2-Kandidat (unverändert, SHA256SUMS OK) + `discover_patch` + `runtime_patch` + Lifecycle-Module. Gebaut aus den produktiven Eingaben auf Server B; Manifest mit 11 Dateien, SHA-Präfix `98d02108`. Installationsauftrag **M11** liegt geschützt auf Server B (SHA-Präfix `ae80795a`, Modi `--check`, `--install`, `--verify`, `--rollback`).

## Live-Evidenz
- Mandatsregister (governtes MCP, nur lesend): **ein** Mandat, ausgestellt am 2026-11-24, **abgelaufen**; kein aktives Mandat.
- `M11 --check` als Arbeitskonto: Host, Dienstidentitäten, Manifest und Dateien **PASS**; dann `HOLD: actor_transport_not_bound:claude`.
- Server-B-Tests: 26/26 im ursprünglichen Prüf-Layout; der erste Lauf in einem fremden Layout zeigte 25/26, weil ein Node-Fixture fehlte.

## Aktive Mandate
Keine.

## Erreichte GREEN-Zustände
Keiner der fünf Abnahmepunkte (Übernahme, aktives Mandat, autorisierte Schreiboperation, verhinderte Operation, Evidence Receipt), weil keine Installation und keine Bestätigung stattfanden.

## Verbleibende Blocker, in Reihenfolge
1. **WP-A1 (authentifizierte Akteursbindung)** für mindestens einen Akteur ausrollen, z. B. Claude über die gebundene Bridge. Das ist die eigene Aktivierungsvorbedingung des V2-Kandidaten; root-Auftrag liegt im Repo (`modules/authority/actor-binding/DEPLOY-ORDER-WP-A1.md`).
2. **M11 `--install`** (root, einmalig). Danach braucht der Regelbetrieb keine Terminalbefehle mehr.
3. **Live-Abnahme:**
   - Ich rufe `nyxa_authority_request` auf.
   - Johannes bestätigt **einmal** im Portal; der Browser darf danach geschlossen werden.
   - Automatisch folgen `ACTIVE`, eine reale Schreiboperation über `nyxa_apply_patch` im Frame-Scope, ein abgewiesener Schreibversuch außerhalb des Scopes, ein Widerruf und ein weiterer abgewiesener Versuch. Daraus entsteht das Evidence Receipt.
4. Nicht verifizierbar ohne Rechte des Portal-Dienstkontos: ob das Portal V2-Frame-Anträge anzeigt (das Datenlayout spricht dafür) und das Issuer-Audit.

## Anschluss M1–M9
Der neue Pfad stellt **Entwicklungsrahmen** aus (`nyxa_apply_patch` in `governed-dev`/`silicon-dev`), bewusst **keine root-Rechte** („Keine dauerhaften Root-Rechte für Agenten“). M1–M3 und M8 (root-Infrastruktur) und M6/M7 (GitHub-Einstellungen) lassen sich darüber daher **nicht** ausführen und bleiben Owner-Handlungen. M4 (Observe-Rollout) gehört zur Installationskette oben. M9 und M10 sind Budget- bzw. Aktivierungsentscheidungen.
