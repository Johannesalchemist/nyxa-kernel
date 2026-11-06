# HANDOFF / REVIEWBERICHT: NYXA × Runway Characters V0.2

**Datum:** 2026-11-06, Europe/Berlin
**Auftraggeber / verantwortlicher Mensch:** Johannes Süß
**Erzeugendes System:** Claude Code (Anthropic), Cloud-Session (Modell in Sitzungsmetadaten)
**Eingangsauftrag:** „WORK HANDOFF: NYXA × Runway Characters V0.2“ (Chat, nicht im Repository → als Quelle `UNVERIFIED`)
**Repository / Branch:** `Johannesalchemist/nyxa-kernel` / `agent/runway-characters-v0.2` (lokal angelegt von
`4179d96`; Commit + Push nach Freigabe vom 2026-11-06, kein Merge)
**Vorgänger:** `handoffs/2026/11/2026-11-06_CLAUDE_RUNWAY_DEV_CHARACTERS_V0.1.md` (`4179d96`)
**Status:** `DRAFT` — `PENDING INDEPENDENT REVIEW` — Zielstatus „sicherheitsgeprüfter Integrationskandidat“ technisch
erreicht, **Abnahme nach Auftrag §9 noch nicht vollständig** (siehe C)
**Manifest:** `handoffs/2026/11/evidence/runway-v0.2/SHA256SUMS` (alle Runway-V0.2-Dateien; Enforcement-Gap hat ein eigenes Manifest)

## Bestandsaufnahme (Startsequenz)

| Punkt | Wert |
| --- | --- |
| Kernel `main` | `cd6f15b` |
| V0.1-Branch | `claude/runway-dev-setup-c53ss0` @ `4179d96` |
| Arbeitsbranch | `agent/runway-characters-v0.2` (zulässiges Präfix laut AGENTS.md) |
| Parallele Änderungen | keine am V0.1-Branch; `agent/claude-bridge-e2e-script-20261106` (`98a9997`) gelesen, nicht berührt |
| `nyxa-kernel-runtime` | `a50e376` (gelesen; `PreflightDisposition` wiederverwendet) |
| Sophia | `thechat` `7aaa471` (nur gelesen, keine Änderung) |
| V0.1-Angaben reproduziert | Typecheck ✓, 5/5 Tests ✓, Build ✓ — vor jeder Änderung |

## A. Implementiert und technisch verifiziert

| Bereich | Umsetzung (Datei) | Nachweis |
| --- | --- | --- |
| A1 Auth | Loopback-Default, Remote nur mit Opt-in + Token (`src/config.ts`); Token→HttpOnly/SameSite=Strict-Cookie mit TTL, Login-Rate-Limit, Host-Allowlist, Origin- und Content-Type-Prüfung (`src/auth.ts`) | RW-01 (7 Tests), M06–M08, Smoke 1/5/6 |
| A2 Kosten | Budget (Default 0) mit atomarer Worst-Case-Reservierung, Parallelitäts- und Ratenlimit, `maxDuration` (Default 120 s), Idempotency-Key, Control-Token je Session, persistenter Ledger (`src/controller.ts`, `src/store.ts`, `src/cost.ts`) | RW-03/04/05, M01–M04, M15, Smoke 7 |
| A3 Lifecycle | Cancel bei FAILED/Timeout/Polling-Fehler/Client-Abbruch (`src/session.ts`); Connect-Grace, Heartbeat, Hard-Cap, idempotentes Ende mit Retry (`reap`, `endRecord`); Recovery beim Neustart, Orphan-Meldung ohne Fremdeingriff, Prozess-Lock; Graceful Shutdown (`server.ts`) | RW-06…09, RW-12, M09–M14, M17–M19, Smoke 2/3/9/12 |
| A3 Credentials | Einmal-Nutzung laut Doku; der Server gibt sie genau einmal aus und speichert sie nicht | Einmaligkeit bei Runway: **UNVERIFIED** (Live-Test T4); Widerruf: nur über `DELETE` Session |
| A4 Datenschutz | `docs/PRIVACY_V0.2.md`; Kamera per `Permissions-Policy` aus; optionale Löschung nach Ende; Audit ohne IP/Transkript | RW-10, M16; Rechtsfragen offen |
| Policy | Gate vor jeder kostenpflichtigen Aktion, Dispositionen wie ADR-0002, nur `ALLOW` handelt; Pilot/Minderjährige → `ESCALATE` (`src/policy.ts`) | RW-11, M05 |
| Client | Login ohne Token-Speicherung, Idempotency-Key je Klick, Heartbeat, Ende bei Connect-Fehler/Fehlerzustand/`pagehide` (keepalive) (`web/main.ts`) | Typecheck + Build; **kein Browser-Test** |
| Werkzeuge | `scripts/secret-scan.mjs`, `scripts/mutation-check.mjs`, `npm run verify` | Ausgaben in `evidence/v0.2/` |

**Verifikationsergebnisse** (saubere Reproduktion in frischer Kopie, Node v22.23.4):
`tsc --noEmit` ✓ · `vite build` ✓ · **50/50 Tests** ✓ · Secret-Scan 0 Treffer ✓ · **Mutationen 20/20 getötet** ✓ ·
`npm audit` 0 Schwachstellen ✓ · Smoke-Test des echten Servers ✓. Keine neuen Abhängigkeiten, Lockfile unverändert.

Details: `modules/runway-dev-characters/docs/VERIFICATION_V0.2.md`.

## B. Architekturentscheidungen

- `decisions/ADR-0003_RUNWAY_CHARACTERS_MODULE_PLACEMENT.md` (`PROPOSED`): Code → `nyxa-kernel-runtime/apps/runway-characters/`,
  Vertrag/Evidence bleiben im Kernel; bis dahin kein Merge nach `main`.
- `decisions/ADR-0004_SOPHIA_AVATAR_LAYER_INTEGRATION.md` (`PROPOSED`): Variantenvergleich A/B/C. Ergebnis: Die
  Trennung „Runway rendert, eigenes System spricht“ ist **dokumentiert** (`integration: livekit | elevenlabs`), aber
  **nicht live geprüft**. Text-an-Avatar ist in den SDK-Typen **UNSUPPORTED**; `personality`/`tools` mit `integration` ist
  **UNSUPPORTED**. Zielbild B via LiveKit; produktiv bleibt C; **keine Sophia-Änderung** in V0.2.

## C. Offene Blocker (nach Risiko)

| # | Blocker | Ursache | Zulässiger nächster Schritt |
| --- | --- | --- | --- |
| C1 | Realverhalten von Runway unbewiesen (Abrechnung, Einmal-Credentials, Cancel, Löschung) | kein freigegebener Live-Test | Freigabe gemäß `docs/LIVE_TEST_PROTOCOL_V0.2.md` (≤ 66 Credits) |
| C2 | Keine unabhängige Prüfung | nur diese Session (`independentCount = 1`) | Review durch Mensch oder unabhängige Instanz |
| C3 | Datenschutz: Aufbewahrung, Subprozessoren, Region, AVV unbekannt | Primärdokumente nicht gelesen | Runway-DPA/Subprozessorliste beschaffen; DSB einbinden |
| C4 | Grants kommen aus Server-Env (Operator = Autorität), nicht aus vertrauenswürdiger Grant-Authority | keine Grant-Authority in NYXA (siehe Enforcement-Gap-Handoff, EG-08) | Grant-Authority-ADR; danach Adapter auf kanonisches Gate umstellen |
| C5 | Ablageort | ADR-0003 offen | Entscheidung; Runtime-PR braucht Schreibzugriff |
| C6 | Sophia-Integration nicht implementiert | Schnittstelle B existiert nicht; `thechat` außerhalb des Auftrags | Spike B nach C1, separat freizugeben |
| C7 | Browser-Client nur typgeprüft | keine Browser-Automation gegen echte Session möglich ohne Credits | Teil des Live-Tests T2/T3 |
| C8 | Commit/Push nicht ausgeführt; Container ist flüchtig | Auftrag §8 | Freigabe „commit + push auf `agent/runway-characters-v0.2`“ |

Abnahmekriterien §9: (1) ✓ kritische Befunde behoben oder blockiert · (2) ✓ Begrenzung technisch erzwungen (Mock/Integration) ·
(3) ✓ Cleanup implementiert und getestet (Mock/Integration) · (4) ✓ Negativtests · (5) teilweise: Entscheidung auf
dokumentierten, nicht beobachteten Fähigkeiten → **offen** · (6) ✓ dokumentiert · (7) ✓ `agent/`-Branch; Ablage offen (ADR-0003) ·
(8) ✓ keine produktive Änderung.

## D. Evidence

| Artefakt | Pfad |
| --- | --- |
| Commit-Basis | `4179d96` (V0.1), Kernel-`main` `cd6f15b` |
| Diff | `git diff 4179d96` auf `agent/runway-characters-v0.2` (37 Dateien, +3873/−247 vor diesem Handoff) |
| SHA-256-Manifest | `handoffs/2026/11/evidence/runway-v0.2/SHA256SUMS` |
| Saubere Reproduktion | `modules/runway-dev-characters/evidence/v0.2/verify-clean-repro.txt` |
| Mutationstest | `.../evidence/v0.2/mutation-check.txt` |
| Smoke-Test echter Server | `.../evidence/v0.2/smoke-server.txt` |
| Dependency-Scan | `.../evidence/v0.2/npm-audit.txt` |
| Quellen-Hashes | `modules/runway-dev-characters/MODULE.md` |

## E. Red-Team-Urteil: was trotz grüner Tests scheitern kann

1. **Schätzung ≠ Abrechnung.** Rundung, Abrechnung von `NOT_READY`/Warteschlange und Abrechnung nach Cancel sind
   unbekannt. Das Budget ist konservativ (Worst-Case-Reservierung), aber nicht beweisbar korrekt.
2. **Ledger ist eine lokale Datei.** Wer Dateisystemzugriff hat, setzt das Budget durch Löschen zurück. Kein Schutz
   gegen den Betreiber selbst. Konto-seitige Ausgabenlimits bei Runway: UNKNOWN.
3. **Lücke zwischen `create` und Ledger.** Geht die Antwort auf `create` verloren (Timeout, Absturz), existiert eventuell
   eine Session, die der Server nicht kennt. Recovery meldet sie nur (absichtlich kein Fremdeingriff). Der Schaden ist begrenzt durch
   `maxDuration` (Default 120 s ≈ 42 Credits).
4. **`kill -9` ohne Neustart.** Dann läuft kein Reaper; Sessions enden erst über Runways `maxDuration`.
5. **Ein gemeinsames Token, keine Identität.** Wer das Token hat, hat volle Autorität. Für Mehrbenutzer- oder
   öffentlichen Betrieb ungeeignet.
6. **Grants aus der Env.** Gleiche Klasse wie EG-08: Wer die Konfiguration kontrolliert, kann sich selbst
   autorisieren.
7. **Heartbeat ≠ Medienfluss.** Ein Tab kann Heartbeats senden, während WebRTC tot ist. Begrenzt nur durch
   `maxDuration`.
8. **In-Memory-Zustände** (Ratenlimit, Login-Sessions, In-Flight-Set) gehen beim Neustart verloren. Budget und
   Parallelität bleiben (persistent).
9. **Remote-Betrieb** mit `ALLOW_REMOTE_BIND=true` ohne TLS: Cookie und Token sind mitlesbar (`COOKIE_SECURE` Default aus).
10. **Audit ist lokal und nicht manipulationssicher** (keine Signatur, keine Hash-Kette).
11. **Lieferkette:** `@runwayml/avatars` läuft im Browser mit Mikrofonzugriff (Versionen exakt gepinnt, Lockfile).
12. **Mock-Treue:** Alle Lifecycle-Tests prüfen gegen ein Mock, das Runways Status-Semantik nachbildet, wie sie
    dokumentiert ist. Weicht die Realität ab (z. B. `DELETE` auf `COMPLETED` → Fehler), greift der Retry-Pfad;
    verifiziert ist das nicht.

Umgehbar sind die Schutzmechanismen vor allem durch Betreiber- bzw. Dateisystemzugriff (1, 2, 5, 6). Von außen über
HTTP ist im getesteten Rahmen keine Umgehung bekannt.

## F. Freigabevorlage

| Entscheidung | Vorschlag | Voraussetzungen |
| --- | --- | --- |
| Commit + Push des Arbeitsbranches | **Empfohlen jetzt** (sonst Verlust beim Container-Ende) | keine; kein Merge |
| Isolierter Live-Test | **Freigabe empfohlen**, eng begrenzt | Protokoll akzeptiert, Budget ≤ 66 Credits, nur Johannes als Testperson |
| Weitere Integration (Spike B, LiveKit) | **Nach** Live-Test, separat | C1 erledigt; LiveKit-Betriebsmodell gewählt |
| PR | **Draft-PR** gegen Runtime nach ADR-0003; im Kernel nur Vertrag/Evidence | ADR-0003 entschieden |
| Merge | **Nicht empfohlen** | C1–C5 |
| Pilotbetrieb / Schule in der Hosentasche | **Abgelehnt**, technisch eskaliert | Freeze, DSFA, Rechtsprüfung, Elternzustimmung; eigene Entscheidung |

Keine pauschale Produktionsfreigabe.

## Dateiliste

Alle geänderten bzw. neuen Runway-V0.2-Dateien inklusive SHA-256: `handoffs/2026/11/evidence/runway-v0.2/SHA256SUMS`.
Verwandter Handoff derselben Session: `handoffs/2026/11/2026-11-06_CLAUDE_ENFORCEMENT_GAP_PHASE_A-D.md`.

## Nächster zulässiger Schritt

Entscheidungen aus F durch Johannes Süß. Zuerst: Commit + Push des Arbeitsbranches.
