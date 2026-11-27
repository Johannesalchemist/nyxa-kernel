# Integration Closure Report R6 — Evolution Assistant & Relational Intelligence (2026-11-27)

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` · Ausgang `99cdab5` · Zwischenstand `d5915a8` · dieser Commit (siehe `git log`) |
| Epistemischer Status | `DRAFT` · Review ausstehend · alle Goldlabels/Tests von dieser Sitzung (nicht unabhängig) |

## Ausgangsprüfung (Inspect)
- `8146ecf`/`99cdab5` lagen auf dem Remote. Es gab keine fremden Commits und keine Überschneidung mit `ccr-434fe282` und `ccr-d55d95c2`.
- Deployment: Beide Commits sind **nicht** ausgerollt. Room und Heartbeat sind unverändert.
- Die tatsächliche Sophia-Taktung läuft als root-eigene systemd-Timer (`nyxa-sophia-room-pilot`, `nyxa-sophia-shadow` [failed], `nyxa-dream-shadow-v1`). Units und Journale sind für diese Sitzung **nicht lesbar**.

## Ergebnisse je Arbeitspaket
| WP | Umgesetzt | Evidenz |
|---|---|---|
| WP1 | <ul><li>Bewerter v2.1 eingefroren (`FROZEN.json`, bekannte Grenzen D6–D9)</li><li>Herkunftsprüfung `provenanceVerifier.mjs`</li><li>Split-Manifest</li><li>externe Holdout-Schnittstelle: Schema, versiegeln, nur einmal werten, Abdeckung, Überschneidung, Blindung, Unabhängigkeit</li><li>CE-02 Amendment 01 vor jedem Ergebnis</li><li>Start-Gate</li></ul> | Tests 3/3 + 3/3; Präregistrierung intakt; **CE-02-Gate: BLOCKED (`no_external_holdout_pass`)** |
| WP2 | Room-Identitätsbindung auf dem **bestehenden** Passkey-Grant-Vertrag (`nyxa-human-authority-grant-v2`): <ul><li>Sitzung an einen Geräteschlüssel gebunden</li><li>jede Anfrage signiert</li><li>Name wird nie als Autorisierung genutzt</li></ul> Runtime-Adapter mit Handlern und Heartbeat-Job | adversarial 6/6 (Impersonation, gefälschter Grant, Replay, Schlüsseltausch, Request-Replay, Manipulation, Sitzungswechsel, Cross-User, Widerruf, Ablauf); echter HTTP-E2E 1/1 |
| WP3 | 7 Funktionen in `evolutionExtensions.mjs` | 11/11 Modultests |
| WP4 | Zyklus vollständig mit synthetischen Daten: Erfahrung → … → strategisches Lernen. Annahme, Ablehnung, „nie“, umformulierter Umgehungsversuch, Korrektur, Widerruf und Nicht-Handeln sind abgedeckt. | `evolutionCycle.test.mjs` |
| WP5 | EI-01: Protokoll, 5 Bedingungen, Messgrößen, Entscheidungsregel, Teilnehmerinfo, Einwilligung, Moderation; Rollentrennung erzwungen | `roles.mjs` 1/1; **LightNet: keine Implementierung gefunden (`unverified`), nicht neu erfunden** |
| WP6 | Inventur (nur Namen/Dateinamen), Abhängigkeitsgraph, Runbook mit Phasen 0–4, Abnahmeskript | keine eingebetteten Schlüssel außerhalb des Compose-Verzeichnisses auf B; Server A ohne App-Verbraucher; **Gateway über Apache :80 öffentlich erreichbar** |
| WP7 | Pilotplan; Abnahme der harten Kriterien ausführbar (mit Schutz gegen Scheinabnahme) | **ACCEPTED** 9/9 Kriterien, jedes mit ≥ 1 real gelaufenem Test |
| WP8 | Modus `observe` im Attestierungs-Gate (reversibel, ohne Freigabe) | Attestierung 14/14 |

## F-Punkte (rekonstruiert aus R3/R4-Handoffs, live geprüft)
| # | Inhalt | Stand 2026-11-27 | Prüfung |
|---|---|---|---|
| F1 | Repo privat | **offen** — `nyxa-kernel` und `nyxa-kernel-runtime` sind public | Repo-Liste |
| F1b | History-Rewrite | **offen**, setzt F1-Entscheidung voraus | — |
| F2 | Avatar-Migration | **offen, Risiko besteht fort** (Details nur geschützt auf Server B) | Live-Prüfung |
| F3 | Authority-V2-Release | **offen**: Bridge und Governed Memory ohne Attestierungs-Variablen. `observe` ist jetzt verfügbar (Stufe 2) | `systemctl show` |
| F4 | Autorisierungsserver | **offen** | — |
| F5 | LiveAvatar-Kauf | **zurückgestellt**, bis LiteAvatar bewertet ist | — |
| F6 | Schlüsselrotation | **offen, dringlicher**: Runbook und Abnahme bereit | s. o. |
| **F6a (neu)** | Sofort-Eindämmung: Proxy `<vhost-S>` → `:<gw-port>` und `<pfad-L>` → `:<gw-port>` entfernen | **offen, empfohlen sofort**, reversibel | HTTP-Probe |
| F7 | eingewilligte Sophia-Daten | offen | — |
| F8 | Owner-Login für Realtime-Messung | offen | — |
| F9 | Room-Integration | **umsetzungsbereit**. Nötig sind die Registrierung der Transaktion `room-identity-bind-v1` im Human-Gate-Katalog, die Routen hinter `requireBoundIdentity` und das Lesen bzw. Anpassen der root-Timer-Units | — |
| F10 | HE-01-Teilnehmende | offen. Zusätzlich: Die Passkey Authority akzeptiert fest nur den Principal `nyxa-owner` | Quelltext des Issuers |
| F11 (neu) | EI-01: Einladungen, Einwilligung, Veröffentlichung | offen | — |
| — | unabhängiger externer Prüfsatz | offen; Vorbedingung für CE-02 und EI-01 | Gate |

## Nächste echte Barrieren
1. Root bzw. Owner: F6a, dann F6. Danach F2. Danach F9 (Katalog und Timer-Units).
2. Externer Prüfsatz von einem Menschen oder einer anderen Modellfamilie, dann CE-02-Läufe.
3. Die Passkey Authority braucht eine Principal-Registrierung für weitere Menschen (F10/F11).

## Redaktionsvermerk
Hostname, Pfad und Ports des öffentlich erreichbaren Gateways standen kurzzeitig im Klartext in Commit `eae1af6`. Mit dem Folge-Commit sind sie durch Platzhalter ersetzt; die exakte Zuordnung liegt nur geschützt auf Server B (`f6-redaction-map.txt`, 0600). In der **Historie** bleibt `eae1af6` lesbar. Eine Bereinigung wäre ein History-Rewrite (F1b) und wird nicht eigenmächtig durchgeführt. Wirksamste Abhilfe ist F6a (Proxy entfernen), danach F6.
