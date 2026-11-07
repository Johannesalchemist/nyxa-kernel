# Vertrag: NYXA Sophia Unified Room V0.1

**Status:** `DRAFT` · Quellenstatus: `SOURCE-BOUND` (Implementation Handoff vom 07.11.2026, Johannes Süß) · Reviewstatus: `PENDING INDEPENDENT REVIEW`
**Erzeugt durch:** Claude Code (Anthropic), Sitzung vom 2026-11-07, Europe/Berlin
**Verantwortlicher Mensch:** Johannes Süß
**Vorgänger:** keiner im Kernel. Laufzeitstand: `/opt/thechat` @ `81d5248` mit uncommitteten Änderungen (siehe Handoff)
**Nächster zulässiger Schritt:** unabhängige Review, danach Entscheidung über die Integration in `apps/console/api` auf einem Branch

## 1. Architekturprinzip

Ein gemeinsames Auftragssystem, mehrere ausführende Intelligenzen, eine verbindliche Governance.

```
Mensch (authentifiziert) ──► Sophia (agent principal, on-behalf-of) ──► Task Queue ──► Worker ──► Executor (Claude | Ari | Mail)
          ▲                                                    │  approve/deny/revoke (nur Mensch)          │
          └──────────── Conversation Bus (Room) ◄──────────────┴───────── Ergebnis + Provenienz ◄─────────────┘
```

`Runtime computes → Memory persists → Audit explains` (ADR-0002) gilt weiter. Dieses Modul berechnet keine zweite epistemische Bewertung. Es hält Aufträge, Freigaben, Effekte und Audit fest.

## 2. Nachrichtenschema (Conversation Bus)

| Feld | Bedeutung |
|---|---|
| `message_id` | vom Client erzeugt, idempotent; Wiederholung nach einem Reconnect ergibt ein Duplikat ohne zweite Speicherung |
| `conversation_id` | gemeinsamer Kontext für Text, Sprache, Agenten und Mail |
| `session_id` | Ursprungssitzung (Text-Tab, Realtime-Sitzung) |
| `actor_id`, `actor_kind` | stets aus dem authentifizierten Principal, nie aus dem Body |
| `channel` | `text`, `voice`, `agent`, `mail`, `system` |
| `timestamp` | Serverzeit |
| `content_ref` | `sha256:<hex>`, vollständiger Originaltext, integritätsgeprüft |
| `delivery_status` | `COMMITTED`; Zustellung pro Sitzung: `PENDING`, `DELIVERED`, `ACKED`, `FAILED` |
| `visibility` | `room`, `private`, `operator` |
| `provenance` | Herkunft (Kanal, Principal, on-behalf-of, Mail-Quelle) |
| `correlation_id` | verbindet Nachricht, Auftrag, Freigabe, Effekt und Audit |
| `trust` | `trusted_principal` oder `untrusted_external` (Mail und externe Daten) |

Zusätzlich führt der Bus eine Ordnung über das monoton steigende `seq`.

**Regeln**

- Der Serverzustand ist maßgeblich. Was nur in der Oberfläche existiert, gilt nicht als gespeichert.
- `contextWindow()` kürzt nur mit ausdrücklicher Kennzeichnung (`truncated: true` plus `note: EXCERPT …`). Das Original ist über `content_ref` abrufbar (Realtime-Tool `room_content_fetch`).
- Ein Reconnect liefert alle nicht quittierten Nachrichten in Reihenfolge (`pendingFor`, `since`).

## 3. Auftragsschema und Zustandsautomat

```
PROPOSED → PENDING_APPROVAL → APPROVED → CLAIMED → RUNNING → RESULT_RECORDED → VERIFIED → COMPLETED
Nebenzustände: DENIED, CANCELLED, FAILED (+ dead_letter), EXPIRED, ESCALATED
```

Die Übergangstabelle steht in `src/task-queue.cjs` (`TRANSITIONS`). Jeder andere Übergang ergibt `INVALID_TRANSITION`.

| Regel | Durchsetzung |
|---|---|
| R1: Unbekannte Autorisierung führt nicht zur Ausführung | ein nicht konfigurierter Executor, Tasktyp oder eine nicht gewährte Operation wird bei der Einreichung `DENIED` |
| R2: Approval gilt nur für seinen Scope | Das Approval speichert den `scope_hash`, und Claim wie Effekt prüfen die Übereinstimmung |
| R3: Nur gelistete, authentifizierte Menschen geben frei | `approverPolicy` wird injiziert (`NYXA_APPROVER_IDS`), Agenten nie |
| R4: Zeitplan ≠ Freigabe | `triggerAllowed(mode, trigger)` und `effectiveApproval()` werden beide geprüft |
| R5: Atomarer Claim | `BEGIN IMMEDIATE` plus bedingtes `UPDATE … WHERE version = ? AND status = ?` |
| R6: Kein unkontrollierter Replay | Effekte sind über einen stabilen `effect_key` idempotent. Ein Effekt in `STARTED` oder `UNKNOWN` führt zu `ESCALATED` |
| R7: Widerruf wirkt sofort | `authorizeEffect()` verweigert, und ein danach eintreffendes Ergebnis wird verworfen (`DISCARDED_AFTER_CANCELLED`) |
| R8: Budget vor Ausführung | Kostenschätzung und Gate vor dem API-Aufruf, pro Auftrag und pro Tag (Europe/Berlin) |
| R9: Goal ≠ Authority | Ein Auftrag erweitert nie seinen eigenen Scope. Wird der Executor-Scope verengt, wird der Auftrag beim Claim abgebrochen |

**Vorabmandate:** Ein Mandat gilt nur für Leseoperationen (`READ_ONLY_OPERATIONS`). Folgenreiche Operationen (`CONSEQUENTIAL_OPERATIONS`, etwa `mail.send_approved`) sind nicht mandatierbar, werden nie automatisch wiederholt und brauchen stets ein menschliches Einzel-Approval.

## 4. Ausführungsmodi

| Modus | Akzeptierte Trigger |
|---|---|
| DIRECT | `direct`, `manual` |
| ON_APPROVAL | `approval`, `direct`, `manual` |
| HOURLY | `schedule` (Intervall konfigurierbar, an lokalen vollen Stunden ausgerichtet), `manual` |
| DAILY | `schedule` zur konfigurierten lokalen Uhrzeit, `manual` |
| MANUAL | `manual` nur durch einen autorisierten Menschen mit expliziter `task_id` |
| PAUSED | keiner |
| unbekannt | keiner |

Die Zeitzone ist standardmäßig `Europe/Berlin`. Die Sommerzeit wird über die IANA-Datenbank behandelt: Zeiten in der Lücke liegen nach der Lücke, doppeldeutige Zeiten zählen beim ersten Auftreten. Verpasste Ticks erzeugen genau einen Nachholtick.

## 5. Executor-Vertrag

`submit → authorized dispatch → execution → result → independent verification → Room feedback`

- Adapter (`claudeAdapter`, `gptAdapter`) besitzen **keine Tools**. Folgeaktionen entstehen nur als neue Aufträge.
- Das Ergebnis trägt Provenienz: `executor`, `provider`, `model`, `provider_response_id`, `usage`, `input_refs`, `worker_id` und `epistemic_status: UNVERIFIED`.
- Bei der Verifikation muss die prüfende Instanz von Executor und Lease-Inhaber verschieden sein. Eine Gegenprüfung durch einen anderen Executor (`requestCrossCheck`) ist ein eigener, freigabepflichtiger Auftrag. Ihr Verdict speist ausschließlich `verify()` und autorisiert nichts.
- Ein Modell holt keine Aufgaben selbst ab. Ohne laufenden Worker (`bin/worker.cjs`, ausgelöst durch n8n, einen systemd-Timer oder die API) wird nichts ausgeführt.

## 6. Mail-Vertrag

`mail.search`, `mail.read`, `mail.thread`, `mail.draft`, `mail.approval_request`, `mail.send_approved`

- M1: Mailinhalt ist `untrusted_external`, steht im Prompt in `<untrusted_external_data>` und autorisiert nichts.
- M2: Ein Alias ist kein Postfach. Jede Operation braucht ein konfiguriertes Mailbox-Binding. Fehlt es, gilt `DENY`.
- M3: Versandablauf: Entwurf → Freigabeauftrag mit `payload_hash` (Empfänger, Cc, Betreff, Text, Thread) → menschliches Approval → erneutes Laden des Entwurfs und Hash-Vergleich → genau ein Versand → Provider-Message-ID. Fehlt die Bestätigung, wird `UNKNOWN` festgehalten, der Auftrag geht auf `ESCALATED`, und es gibt keinen erneuten Versand.
- M4: Kein Versand auf Modellentscheidung. Ein Mandat kann den Versand nicht abdecken.

## 7. Authentifizierung

- Jede `/api/v2/*`-Route verlangt einen Bearer-Token. Fehlt er, folgt `401`.
- Sophia und Worker nutzen eigene Service-Tokens. Handelt Sophia für einen Menschen, wird dessen **verifizierter** Token im Header `x-nyxa-on-behalf-of` mitgeführt, nie ein Name im Body.
- Freigabe, Widerruf, Executor-Konfiguration und manueller Start sind nur für Principals der Art `human` möglich, die in der Approver-Policy stehen.
