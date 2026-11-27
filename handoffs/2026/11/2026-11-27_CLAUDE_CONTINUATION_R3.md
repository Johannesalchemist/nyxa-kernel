# Handoff 2026-11-27 — Continuation R3 (REDIGIERT, öffentliches Repository)

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch / Ausgang | `ccr-05bf3d01-8z9z1d`, Ausgang `4cb94db`, Remote synchron, keine fremden Commits |
| Epistemischer Status | `DRAFT` · Review ausstehend |
| Evidenz | `research/evidence/2026-11-27/CONTINUATION-R3_EVIDENCE.md` (redigiert, Hash-Zuordnung zu geschützter Rohevidenz) |

## Repository-Sichtbarkeit (Befund)

`Johannesalchemist/nyxa-kernel` ist **public**. R1/R2 enthielten operative Infrastrukturdetails (keine Secrets). Ab R3: operative Details nur noch geschützt auf Server B, im Repo redigiert. Keine History-Bereinigung und keine Sichtbarkeitsänderung ohne Freigabe.

## Umgesetzt und verifiziert

| Bereich | Ergebnis |
|---|---|
| P0 Authority Closure | Direkt-Tools attestierungspflichtig; Identität strikt getrennt von Berechtigung; Rotation/Widerruf/Owner-Pflicht der Registry; Replay unter Nebenläufigkeit; reales Backend: alle Fälle PASS inkl. Fall 9 und positivem ALLOW mit realer Wirkung (isoliert) |
| P0 Transport & OAuth | `modules/authority/oauth-resource-server/` (4/4); MCP `2026-07-28` an Primärquelle bestätigt; drei getrennte Identitätsklassen |
| P0 Systemhygiene | Avatar-API-Migration vorbereitet (geschützt, nicht ausgeführt); Staging als `jo` ohne Secrets band nicht (Ursache wahrscheinlich nicht lesbare Env-Dateien, `unverified`) |
| P1 Strategy Evolution | `modules/cognition/strategy-evolution/` (5/5), Adoption über bestehenden Kandidatenspeicher (`process_pattern`) |
| P1 MeMo | Datei-Adapter mit Provenienzpflicht; realer Lauf mit dieser Modellsitzung als Generator auf autorisiertem Repo-Korpus; Proposals im bestehenden Speichervertrag |
| P1 Sophia | Room-Integration + AudioWorklet in Chromium mit echter WebRTC-Verbindung geprüft; providerneutral; No-Op erhält Sprachdialog |
| P1 Adversarial | Harness 20/0 technisch; 9/9 Modellverhalten simuliert (nicht unabhängig) |

## Offene Blocker

1. Root/Deployment (Human Gate): Authority-V2-Release mit Attestierung, Avatar-API-Migration, Log-Fix, Root-Gerüst.
2. Autorisierungsserver für OAuth (Supabase-Auth-Eignung `unverified`), danach praktische Client-Tests.
3. Echte Sprachsitzung + Provider für Avatar (menschliche Anmeldung, Kosten).
4. Unabhängige Evaluation (zweite Modellfamilie/Mensch) für Modellverhalten und Strategien.
5. Kein live erreichbarer autorisierter Modelladapter für MeMo außer dieser Sitzung.
6. Remote-Desktop-Commander-Kontingent ≥ 81 %.

## Konkret begrenzte Freigabeanforderungen

| # | Freigabe | Umfang | Rückweg |
|---|---|---|---|
| F1 | Repo-Sichtbarkeit `nyxa-kernel` → private (oder History-Bereinigung) | GitHub-Einstellung durch Owner | Sichtbarkeit zurücksetzen |
| F2 | Avatar-API-Migration (`--check`, `--stage`, `--cutover`) | eine Unit, ein Dienstbenutzer, Rechte der API-Dateien, Env-Datei mit Minimal-Keys | `--rollback` (PM2-App bleibt bis `--finalize` erhalten) |
| F3 | Authority-V2-Release inkl. Attestierungs-Patch, Modus zunächst `off` | Release-Build + `deploy-authority-v2.sh` | Modus `off` / vorherige Release |
| F4 | Auswahl Autorisierungsserver + Client-Registrierung für die Webroute | Konfiguration, kein Code-Deploy | — |
| F5 | LiveAvatar (Tarif/Slot/Key) erst nach Bewertung des selbstgehosteten LiteAvatar-Pfads | kostenpflichtig | Abo kündigen |
