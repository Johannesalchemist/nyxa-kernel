# Betriebshandbuch: Sophia Unified Room V0.1

**Status:** `DRAFT — NOT DEPLOYED`. Keine produktive Freischaltung ohne Johannes' ausdrückliche Freigabe.
**Erzeugt:** Claude Code, 2026-11-07, Europe/Berlin · **Verantwortlich:** Johannes Süß

## 1. Voraussetzungen

- Node ≥ 22.13 mit `node:sqlite` (Server B: v22.23.3, verifiziert am 2026-11-07)
- keine npm-Abhängigkeiten
- eine SQLite-Datei außerhalb des Git-Arbeitsbaums, zum Beispiel `/var/lib/nyxa-room/room.sqlite`, Eigentümer ist der Service-User des Room-Servers (aktuell `nyxa`), Modus 0600

## 2. Konfiguration (nur Umgebungsvariablen, keine Secrets im Repository)

| Variable | Zweck | Status |
|---|---|---|
| `NYXA_ROOM_DB` | Pfad zur Datenbank | zu setzen |
| `NYXA_APPROVER_IDS` | kommagetrennte Principal-IDs, die freigeben dürfen | zu setzen; leer bedeutet, niemand darf freigeben |
| `ANTHROPIC_API_KEY`, `NYXA_CLAUDE_MODEL` | Claude-Executor | Modell-ID `unverified`; durch Johannes festzulegen |
| `NYXA_CLAUDE_PRICE_IN_CENTS_PER_MTOK`, `NYXA_CLAUDE_PRICE_OUT_CENTS_PER_MTOK` | Budget-Gate | ohne Preisangabe verweigert der Worker die Ausführung (`PRICING_UNKNOWN`) |
| `OPENAI_API_KEY`, `NYXA_ARI_MODEL`, `NYXA_ARI_PRICE_*` | Ari/GPT-Executor | Modell `unverified` |

## 3. Executor einrichten (Mensch, über die API)

```
PUT /api/v2/executors/claude
{ "mode": "HOURLY", "interval_minutes": 60, "timezone": "Europe/Berlin",
  "allowed_task_types": ["analysis","review","documentation"],
  "allowed_operations": ["llm.invoke","room.post_result"],
  "daily_budget_cents": 300, "max_parallel": 1, "verification_policy": "required" }
```

## 4. Worker auslösen

Bevorzugt über den vorhandenen n8n-Scheduler: ein Schedule Trigger alle 5 Minuten, dann Execute Command:

```
NYXA_ROOM_DB=/var/lib/nyxa-room/room.sqlite node /opt/thechat/modules/sophia-unified-room/bin/worker.cjs --executor claude --trigger schedule --max 3
```

Der Worker entscheidet anhand von `executor_config` selbst, ob der HOURLY- oder DAILY-Slot fällig ist (`NOT_DUE` mit `next_run`), und nimmt den Tick atomar. Laufen zwei Scheduler gleichzeitig, kommt trotzdem nur ein Lauf pro Slot zustande.

Alternativ ein systemd-Timer mit `OnCalendar=*:0/5` und `User=nyxa`.

**Wichtig:** Der n8n-Workflow wurde in dieser Sitzung **nicht** angelegt, weil das eine produktive Änderung wäre. Vor dem Anlegen ist zu prüfen, ob „NYXA Command Intake V1“ (`3rRO74kyfmEEIvLL`) oder „DGL Editorial Human Gate v1“ (`068VA1xRaa3SwepY`) als Freigabe-Oberfläche wiederverwendet werden kann.

## 5. Tägliche Bedienung

| Frage von Johannes | Endpunkt |
|---|---|
| Was wartet auf Freigabe? | `GET /api/v2/tasks?status=PENDING_APPROVAL` |
| Was läuft gerade? | `GET /api/v2/status/summary` |
| Wann ist die nächste Abholung? | `GET /api/v2/executors/claude` → `next_run` |
| Freigeben | `POST /api/v2/tasks/:id/approve` mit dem angezeigten `scope_hash` |
| Widerrufen | `POST /api/v2/tasks/:id/revoke` |
| Nachweis | `GET /api/v2/tasks/:id/audit` |

Sophia antwortet sprachlich auf Basis von `/status/summary`, nicht durch Vorlesen von Listen.

## 6. Störungen

| Symptom | Bedeutung | Handlung |
|---|---|---|
| Auftrag `ESCALATED` mit `EFFECT_OUTCOME_UNKNOWN` | Der Effekt wurde möglicherweise ausgeführt (Netzabbruch) | beim Provider prüfen, dann den Auftrag manuell abschließen oder abbrechen; **nicht** neu einreichen |
| `FAILED` mit `dead_letter` | Wiederholungen erschöpft | Ursache prüfen, gegebenenfalls einen neuen Auftrag mit neuem `idempotency_key` anlegen |
| `DENIED` mit `OPERATION_NOT_ALLOWED` | Scope nicht gewährt | Konfiguration prüfen; den Scope nicht stillschweigend erweitern |
| `PRICING_UNKNOWN` | Preise nicht konfiguriert | Preise setzen |

## 7. Dokumentierte Grenzen

1. Die echte Realtime-Kopplung ist **nicht** implementiert. Der Bus stellt `pendingFor`/`ack` und den Inhaltsabruf bereit, aber `room.html` muss Text-Nachrichten per `conversation.item.create` an den Data Channel senden und auf `conversation.item.created` hin `ack` aufrufen. Der E2E-Nachweis „Sophia nennt den zweiten Kritikpunkt“ ist nur auf Bus- und Tool-Ebene getestet, nicht mit dem echten Modell.
2. Es gibt keinen produktiven Mail-Provider-Adapter. Der Vertrag ist getestet, ein Gmail- oder IMAP-Adapter fehlt. Der Sophia-Alias ist `unverified`.
3. Die Kostenschätzung ist eine Obergrenze (Zeichen geteilt durch 3 plus maximale Ausgabe-Tokens). Die tatsächliche `usage` wird festgehalten, aber noch nicht gegen die Schätzung verrechnet.
4. `spentToday` summiert nach `updated_at` des Auftrags, eine Näherung.
5. SQLite eignet sich für einen Host. Für mehrere Hosts wäre ein Wechsel auf Postgres nötig (Supabase-Postgres läuft auf Server B), was eine Entscheidung erfordert.
6. Die vorhandenen NYXA-Bausteine α/β/γ, D1–D7, I0–I3, E0 und Capability Gate sind **nicht** angebunden, weil ihre Schnittstellen in dieser Sitzung nicht verifiziert wurden. Die Anbindung erfolgt über `approverPolicy` und eine zusätzliche Preflight-Funktion vor `submit()`.
