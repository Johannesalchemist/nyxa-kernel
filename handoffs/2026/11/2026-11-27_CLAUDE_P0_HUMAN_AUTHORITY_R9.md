# P0 Human Authority R9 (2026-11-27) — Bootstrap bereit, nicht GREEN

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` · R9-Commits `0a6281a`, `34a4a31`, dieser Bericht |
| Ergebnis | **Nicht GREEN.** Ein einziger privilegierter Installationsauftrag ist geprüft (`--check` PASS) und wartet auf Freigabe; die Live-Abnahme ist vorbereitet |

## Privilegierter Ausführungspfad (live geprüft)
| Komponente | Befund | Für WP-A1/M11 nutzbar? |
|---|---|---|
| NYXA Toolbox | nur Lese-Capabilities und feste Effekt-Capabilities (Tests, Xcode, n8n, CafePilot); keine Installation auf Server B | nein |
| Effektroute Server B | `ESCALATE: requires_separate_governed_execution_authority` | nein |
| Bounded-Ops-Broker | feste Operationen nur für CafePilot (inspect/start/stop/inventory) über einen hashgepinnten root-Helfer. **Drift:** Der Helfer-SHA weicht vom im Broker gepinnten Wert ab; der Broker weist daher jede Operation ab (fail-closed) | nein |
| „Execute one approved …“-Executoren | nur für root lesbar, an Sophia-Testläufe gebunden | nicht prüfbar, nicht zweckgebunden |
| SentinelX | keine operative Route zu Server B (Host-Limit) | nein |

**Folge:** Ein einmaliger privilegierter Bootstrap ist unvermeidbar. Er ist **ein** prüfbarer Auftrag statt einer Serie von Einzelschritten.

## Der eine Auftrag: `NYXA-BOOTSTRAP-R9.sh`
Ablage geschützt auf Server B. SHA-256 `c7fe41682671a833794a0a6fbaa9a9963d8544ae3c1ff514d29ce9376d9dd8d3`.

| Stufe | Inhalt | Rückweg |
|---|---|---|
| Vorprüfung | <ul><li>Host und Dienstidentitäten</li><li>Tailnet-Selbst-ID und gebundener Client (Server A, online, ≠ Server B)</li><li>Kernel-Commit `34a4a31` mit Prüfsummen der Akteursbindung</li><li>Release V2.2 (Manifest `f63b4862`)</li><li>M1-Skript</li><li>WP-A1-Tests der Repo-Fassung 11/11</li></ul> | — |
| 1 M1 | Eindämmung der zwei unbeabsichtigten öffentlichen Wege (aktive Default-vHost-Datei) | eigenes `--rollback` |
| 2 WP-A1 | <ul><li>zweite, gebundene Bridge-Instanz auf eigenem Port</li><li>Akteur `claude` **nur** für den Tailnet-Knoten von Server A, aus dem gepinnten Repo-Commit</li><li>bestehende Bridge unverändert</li><li>Lifecycle- und Attestierungsvariablen mit festen Werten an das gebundene Backend</li></ul> | `--rollback-authority` |
| 3 V2.2 | <ul><li>Issuer mit `discover`, Lifecycle, Publisher-Path-Unit (Portal-Dienstkonto)</li><li>Tools `nyxa_authority_request`, `nyxa_authority_status`, `nyxa_authority_release`</li><li>Attestierung im Modus `observe` (M4)</li><li>Portal-Gate</li></ul> | `--rollback-authority` |
| 4 Aktivierung | Neustarts; `--verify` prüft Dateien, Dienste, Ablehnung des eigenen Knotens (`403`) und M1 | — |

## Live-Abnahme (vorbereitet auf Server A)
`acceptance-r9.sh` (SHA `1c6dc090…`): Ein **echter Claude-Code-Agent** auf Server A spricht über die gebundene Bridge, die den Akteur aus der Tailscale-Identität ableitet; es gibt keine Akteur-Header. Ablauf:
1. Antrag stellen.
2. Status pollen (nur lesend).
3. Bei `ACTIVE`: Schreiboperation im Scope und Versuch außerhalb des Scopes (`silicon-dev`).
4. `nyxa_authority_release`, dann erneuter Schreibversuch.
5. Endstatus und Mandatsliste; die Evidenzdateien werden gehasht.

Die serverseitige Gegenprobe (Lifecycle-Journal, Audit, Mandatsregister) erfolgt durch mich.

## Unvermeidbare persönliche Handlungen
1. **Einmalig:** `sudo bash …/NYXA-BOOTSTRAP-R9.sh --apply` auf Server B, nach Sicht der `--check`-Ausgabe. Kein bestehender begrenzter Executor kann das (siehe oben).
2. **Claude-Code-Anmeldung auf Server A erneuern:** „OAuth session expired and could not be refreshed“; Kontoanmeldung.
3. **Einmal per Passkey bestätigen**, sobald der Antrag im Portal erscheint. Danach keine weitere Interaktion.

## Abnahmefälle Abschnitt 7 — Stand
| Fall | Nachweis bisher | Live nach Bootstrap |
|---|---|---|
| doppelte Zustellung, Neustart nach Bestätigung, Neustart während Claim/Ausstellung, abgelaufene Freigabe, Widerruf, falscher Akteur, Mehrdeutigkeit | Lifecycle-Tests 5/5 | Neustart des Backends während `PENDING`; Widerruf über `nyxa_authority_release` |
| Replay, verändertes Manifest bzw. Transaktion, Drift, Ablauf | echter Issuer 26/26 | Replay einer verbrauchten Grant-ID |
| Scope-Überschreitung | Frame-Policy (V2) | Schreibversuch `silicon-dev` |
| nicht erreichbarer Issuer | `issuerDiscover`: `issuer_transport_unavailable` → Wiederholung, keine Mutation | Issuer kurz stoppen (nur mit Owner) |
| hängender Publisher | `REQUESTED` → `FAILED: publisher_unavailable` nach 15 min, andere Aufträge laufen weiter | — |
| alternative Tool-Pfade | Akteur nur aus der Prozessbindung; alte Bridge ohne Bindung → `authenticated_development_actor_required` | Aufruf über die ungebundene Route |
| zwei gleichzeitige Anträge | je Frame höchstens ein offener Antrag (`request_already_open`); verschiedene Frames unabhängig | — |

## M1–M9
- **M1** ist im Bootstrap enthalten. Die Exposition bestand um 19:10 UTC fort.
- **M2** (Rotation) ist bewusst **nicht** im Bootstrap, weil sie ein Wartungsfenster und Neuanmeldungen erfordert. Runbook und Skript sind bereit.
- **M3** (Avatar): Das Skript ist bereit. Nach erfolgreicher Authority-Abnahme kann es als zweiter Bundle-Auftrag folgen.
- **M6 und M7:** Die GitHub-Werkzeuge dieser Sitzung können die Repository-Sichtbarkeit nicht ändern. Das bleibt eine Einstellung des Owners. M7 ist irreversibel und eine eigene Entscheidung.
- **M8 und M9:** unverändert offen.
