# Handoff 2026-11-27 — Continuation R4 (REDIGIERT, öffentliches Repository)

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` (Ausgang `9e87806`; CE-01-Präregistrierung `b184ba2`) |
| Epistemischer Status | `DRAFT` · Review ausstehend |

## P0.1 Security Incident Containment

- Repository `nyxa-kernel`: **public** (verifiziert). Historie (17 Commits) vollständig gescannt: **keine Zugangsdaten**; offengelegt sind Tailnet-Adresse, zwei Knoten-IDs, Dienstnamen/Ports und Beschreibungen zweier offener Schwachstellen (Webroute ohne Auth, Avatar-Dienst). Rotation wegen Repo-Inhalt **nicht nötig**.
- **Neues Ereignis R4 (durch diese Sitzung verursacht):** Bei der Identity-Inventur wurde Signaturschlüsselmaterial des Supabase-Auth-Dienstes (ES256-Privatschlüssel und HS256-Secret) durch einen fehlerhaften Redaktionsfilter in die Sitzungsausgabe geschrieben. Nicht im Repository, nicht weitergegeben. Behandlung: als kompromittiert betrachten → Rotation F6.
- Rohevidenz nur geschützt auf Server B; Repo erhält redigierte Fassungen. Privatisierung (F1) und History-Rewrite (F1b) bleiben getrennte Entscheidungen.

## P0.2 Avatar Root Exposure (Privilege-Escalation-Pfad)

Live bestätigt: Dienst läuft als root über PM2 (root), bindet auf allen Interfaces; ausgeführte Datei ist durch einen nicht privilegierten Benutzer beschreibbar; Code lädt zusätzlich die Env-Datei eines anderen Dienstes. **Ursache des Staging-Fehlschlags:** `SQLITE_READONLY` — App legt beim Start eine SQLite-DB im Datenverzeichnis an, das für den Staging-Benutzer nicht schreibbar ist. Migrationsskript (geschützt, SHA-256 `c10cd8ff…`) sieht genau dieses Verzeichnis als einzigen Schreibpfad des Dienstbenutzers vor, Loopback-Bindung, eigene Minimal-Env-Datei, `InaccessiblePaths` für fremde Secrets, Rollback über die unverändert gehaltene PM2-App.

## P0.3 Authority V2

R4-Implementierung: Widerruf ohne Neustart, *at-most-once* bei Absturz zwischen Nonce und Effekt (13/13 Tests). Stufenplan Release → Observe → Canary → Prüfmatrix → Erweiterung → Abnahme: `modules/authority/actor-attestation/DEPLOYMENT-PLAN-R4.md`. Offen: Modus `observe`, Executor-Bindung des Digests.

## P0.4 OAuth & Identity

`modules/authority/oauth-resource-server/IDENTITY-INVENTORY-R4.md`: Human Gate ist kein AS; Supabase Auth in aktueller Konfiguration **nicht geeignet** (feste Audience `authenticated`, Discovery/Client-Registrierung unbestätigt). Clienttests vorbereitet, nicht durchgeführt.

## P1.1/P1.2 CE-01 + Independent Evaluator

`research/ce-01/REPORT.md`: reale Episoden, A/B/C/D, präregistriert, verblindet, signierte Scorecard. Erfahrungsgedächtnis verbessert Qualität (+0,055; verhindert Wiederholungsfehler E2); Strategien über Gedächtnis hinaus ohne messbaren Gewinn; Transfer mit Deckeneffekt; 4 Strategie-Kandidaten mit Evaluationshistorie, **keine Übernahme**.

## P1.3 Sophia Integrated Learning Loop — blockiert

Ein realer Lernzyklus aus **Sophia-Interaktionen** wurde **nicht** durchlaufen. Gründe: kein autorisierter Lesezugriff auf Room-/Sophia-Interaktionsdaten aus dieser Sitzung; diese Daten sind personenbezogen und benötigen Einwilligung/Zweckbindung. Vorhanden und anschlussbereit: MeMo-Pipeline mit Provenienz/Widerruf, Strategy Evolution, Evaluator, Kandidatenspeicher-Vertrag. Benötigt: F7.

## P1.4 Sophia Voice & Avatar

Echte Realtime-Sitzung benötigt Room-Anmeldung durch den Menschen. LiteAvatar-Pilot vorhanden: `lite-avatar` (MIT), `OpenAvatarChat` (Apache-2.0); Renderer laut Pilot „NOT READY“; Ressourcenbedarf/Latenz `unverified` (kein Lauf ohne Freigabe von Rechenzeit).

## Freigabeanforderungen (exakt begrenzt)

| # | Freigabe | Umfang | Rückweg |
|---|---|---|---|
| F1 | `nyxa-kernel` → private | GitHub-Einstellung | zurückstellen |
| F1b | History-Rewrite (getrennt) | nur nach F1-Entscheidung; Entfernung der Infrastruktur-IDs aus Commits ab `143f6d1` | Force-Push irreversibel für Klone → gesonderte Entscheidung |
| F2 | Avatar-Migration `--check/--stage/--cutover` | ein Dienstbenutzer, eine Unit, Rechte der API-Dateien, Minimal-Env | `--rollback` |
| F3 | Authority-V2-Release Stufe 1–3 | Release-Build, Canary für einen Passport | Modus zurück, vorherige Release |
| F6 | **Rotation Supabase-Auth-Signaturschlüssel** (ES256 + HS256) | neue Schlüssel erzeugen, alte als nur-verifizierend auslaufen lassen, danach entfernen; betroffene Sessions neu anmelden | — (Rotation ist die Abhilfe) |
| F7 | Sophia-Lernzyklus | Freigabe eines eng begrenzten, eingewilligten Interaktionsexports (z. B. eigene Gespräche des Owners, Zeitraum, Widerrufbarkeit) oder Lesezugriff über governten Pfad | Widerruf → Ausschluss in MeMo-Governance |
| F8 | Echte Realtime-Messung | Owner meldet sich in Room/Studio an; Messskript misst Latenz/Barge-in | — |

## Nächste ausführbare Schritte

Modus `observe` + Executor-Digest-Bindung; CE-02 (härtere Transferaufgaben, mehrere Läufe, Werkzeugausführung, zweite Modellfamilie); Avatar-Staging mit Dienstbenutzer nach F2.
