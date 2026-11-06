# Runway Dev Characters: Minimalintegration

Eine Webseite, die ein Echtzeit-Videogespräch mit einem Runway Character startet. Status: `DRAFT` (siehe [MODULE.md](MODULE.md)).

```
Browser (web/main.ts, @runwayml/avatars)
   │  POST /api/avatar/connect {presetId}
   ▼
Server (server.ts, @runwayml/sdk, RUNWAYML_API_SECRET bleibt hier)
   │  realtimeSessions.create → poll bis READY → {sessionId, sessionKey}
   ▼
Browser: streamTo() konsumiert die Einmal-Credentials und verbindet sich per WebRTC
```

## Start

Voraussetzung: Node.js 22.9 oder neuer.

```bash
cd modules/runway-dev-characters
npm install
cp .env.example .env   # RUNWAYML_API_SECRET eintragen (dev.runway.com → Manage → API keys)
npm start              # baut web/ nach dist/ und startet http://localhost:3000
```

Runway Dev arbeitet nach dem Prinzip „pay as you go“ ohne Free Tier. **Jede Session verbraucht Credits.** Sessions dauern höchstens 300 s (`maxDuration` in `src/session.ts`). Beim Schließen des Tabs wird die Session beendet.

- **Preset-Characters:** Auswahl im Dropdown. Erlaubt sind nur die in `api.md` dokumentierten IDs (`PRESET_AVATARS`).
- **Eigener Character:** im Developer Portal anlegen, dann `RUNWAY_AVATAR_ID=<uuid>` in `.env` setzen. Der Server nutzt danach nur noch diesen Character.

## Prüfungen (ohne Credits)

```bash
npm run check   # TypeScript
npm test        # Session-Logik mit gemocktem SDK
npm run build   # Client-Bundle
```

## Dateien

- `server.ts`: Express-Routen `GET /api/avatar/config` und `POST /api/avatar/connect`, liefert außerdem `dist/` aus.
- `src/session.ts`: Avatar-Auswahl, Session anlegen, Warten bis `READY`, Abbruch bei Timeout.
- `web/`: Client (Auswahl, Start, Stummschalten, Beenden, Transkript).
- `test/session.test.ts`: Unit-Tests mit Mock-Client.
