# Runway Dev Characters: gehärteter Integrationskandidat V0.2

Eine lokale Webseite für Echtzeit-Videogespräche mit einem Runway Character. Der Server erzwingt Zugang, Budget, Limits und
Aufräumen. Status: `DRAFT` (siehe [MODULE.md](MODULE.md)).

```
Browser (web/, @runwayml/avatars)
  │  POST /api/auth/login {token}            → HttpOnly-Cookie (Token wird nicht gespeichert)
  │  POST /api/avatar/connect {presetId}     + Idempotency-Key
  ▼
Server (server.ts → src/app.ts → src/controller.ts)
  │  Gate-Reihenfolge: Request-ID → Replay → Avatar → Policy → Key → Parallelität → Budget → Rate
  │  realtime_sessions.create → Poll bis READY (Cancel bei Fehler/Timeout/Abbruch)
  ▼
Browser: streamTo() mit {sessionId, sessionKey}; Heartbeat alle 15 s; Ende per /sessions/:id/end
Reaper: Connect-Timeout, Heartbeat-Verlust, Max-Dauer; Recovery beim Neustart
```

## Start (nur lokal)

Voraussetzung: Node.js 22.9 oder neuer.

```bash
cd modules/runway-dev-characters
npm ci
cp .env.example .env
#  RUNWAYML_API_SECRET=...      (dev.runway.com → Manage → API keys)
#  NYXA_ACCESS_TOKEN=...        (≥ 32 Zeichen; Befehl steht in .env.example)
#  RUNWAY_BUDGET_CREDITS=42     (0 = keine Session möglich; eine 120-s-Session reserviert 42 Credits)
npm start                       # http://127.0.0.1:3000, Anmeldung mit NYXA_ACCESS_TOKEN
```

Runway Dev rechnet pro Nutzung ab („pay as you go“) und hat kein Free Tier. **Jede Session verbraucht Credits.**
Laut Preisliste vom 2026-11-06: 2 Credits sofort, dann 2 Credits je 6 s (1 Credit = 0,01 USD). Das lokale Budget
ist eine **Schätzung**. Maßgeblich ist der Kontostand im Developer Portal.

## Prüfungen (ohne Credits, ohne Netz zu Runway)

```bash
npm run verify                    # Typecheck, Build, 50 Tests, Secret-Scan
node scripts/mutation-check.mjs   # entfernt nacheinander 20 Schutzmechanismen; Tests müssen fehlschlagen
```

## Konfiguration

Alle Variablen sind in [.env.example](.env.example) aufgeführt. Die Standardwerte sind restriktiv:

| Einstellung | Standardwert |
| --- | --- |
| Netzwerkbindung | Loopback |
| Budget | 0 |
| Capability | keine |
| Parallele Sessions | 1 |
| Maximaldauer | 120 s |
| Löschung bei Runway | aus |

Zustand und Audit liegen in `.state/` (git-ignoriert): `ledger.json`, `audit.jsonl` und `server.lock`. Das Budget
wird nur zurückgesetzt, wenn ein Mensch `.state/ledger.json` bewusst entfernt.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `server.ts` | Bootstrap, Recovery, Reaper, geordnetes Herunterfahren |
| `src/config.ts` | Konfiguration mit Fail-Closed-Prüfung |
| `src/auth.ts` | Anmeldung, Cookie, Host- und Origin-Schutz |
| `src/controller.ts` | Gates, Reservierung, Lebenszyklus, Reaper, Recovery |
| `src/session.ts` | Provisionierung bei Runway mit Cleanup |
| `src/store.ts` | persistenter Ledger und Lock |
| `src/policy.ts` | Policy-Gate (Dispositionen wie ADR-0002) |
| `src/audit.ts` | Audit mit Redaktion |
| `src/cost.ts` | Kostenschätzung |
| `src/rateLimit.ts` | Ratenlimit |
| `web/` | Client |
| `test/` | Unit-, Konfigurations- und Adversarialtests (RW-01 bis RW-12) |
| `scripts/` | Secret-Scan, Mutation-Check |
| `docs/` | Verifikation, Datenschutz, Live-Testprotokoll |
| `evidence/v0.2/` | Testausgaben, Smoke-Test, Manifest |
