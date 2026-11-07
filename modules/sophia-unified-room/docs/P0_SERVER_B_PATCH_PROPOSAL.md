# P0-Patchvorschlag für Server B (`/opt/thechat`)

**Status:** `PROPOSED — NOT APPLIED`. Die Anwendung erfordert Johannes' Freigabe und einen eigenen Branch in `/opt/thechat`.
**Evidenz:** lesende Inspektion am 2026-11-07, ca. 15:28 UTC, Host `ubuntu-4gb-nbg1-1`, Benutzer `jo`, Repository `/opt/thechat`, HEAD `81d5248` (`main`). Zeilennummern beziehen sich auf den Arbeitsbaum von `apps/console/api/server.js` (6371 Zeilen, mtime 2026-10-16 16:15 UTC).
**Erzeugt:** Claude Code · **Verantwortlich:** Johannes Süß

## 1. Befunde (verifiziert durch Codeinspektion, nicht durch Angriff)

| ID | Ort | Befund | Schwere |
|---|---|---|---|
| S1 | `server.js:300` `POST /api/room/live/session` | keine Authentifizierung; erzeugt OpenAI-Realtime-Sitzungen auf Kosten des Server-Keys | hoch (Kosten, Missbrauch) |
| S2 | `server.js:214` `POST /api/room/realtime/delegate` | keine Authentifizierung; der interne Aufruf von `/api/room/message` sendet **keinen** Bearer und ergibt daher immer 401 (Defizit 5); zudem ist `userName:'Johannes'` hartkodiert | hoch |
| S3 | `server.js:2559` `GET /api/room/history` | unauthentifiziert; liefert die gesamte Room-History | hoch (Vertraulichkeit) |
| S4 | `server.js:2586` `DELETE /api/room/clear` | unauthentifiziert; löscht die Room-History | hoch (Integrität) |
| S5 | `server.js:169` `POST /api/room/conference/delegate` | unauthentifiziert, schreibender `record` | mittel |
| S6 | `server.js:2430` | Stammtisch-Befehle hängen am Namensvergleich `userName.toLowerCase() !== 'johannes'` statt an einer Rolle | mittel |
| S7 | `server.js:2213` | `roomHistory` ist ein Array im Prozessspeicher (max. 300 bis 400 Einträge, wird getrimmt); ein Neustart bedeutet Verlust | hoch für Kontinuität |
| S8 | Prozessliste | `server.js` läuft zweimal: PID 499021 (User `nyxa`, 8 Tage) und PID 3482037 (User `root`, 19 Tage). Lauschend auf `127.0.0.1:3000` ist nur ein Prozess. Welcher Prozess bedient und was der zweite tut, ist `unverified` | mittel (parallele Laufzeitwahrheit) |
| S9 | `private/qa-workbooks/{signing,download}.key` | Schlüsseldateien liegen im Git-Arbeitsbaum. Laut `git status` sind sie nicht getrackt; ob `.gitignore` sie ausschließt, ist `unverified`. Inhalt nicht gelesen | mittel |

Abschwächend gilt: Port 3000 lauscht nur auf `127.0.0.1`. Die Erreichbarkeit von außen hängt von Traefik/Reverse-Proxy-Routen für `thechat.future24.eu` ab und ist `unverified`. Ein aktiver Test gegen den öffentlichen Host wurde bewusst nicht durchgeführt.

## 2. Minimaler Patch (Vorschlag)

```diff
-app.post('/api/room/conference/delegate', express.json({limit:'64kb'}), (req,res) => {
+app.post('/api/room/conference/delegate', requireAuth, express.json({limit:'64kb'}), (req,res) => {

-app.post('/api/room/realtime/delegate', express.json({limit:'64kb'}), async (req,res) => {
+app.post('/api/room/realtime/delegate', requireAuth, express.json({limit:'64kb'}), async (req,res) => {
   const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
   if (!message) return res.status(400).json({ok:false,error:'message required'});
   try {
-    const r = await fetch('http://127.0.0.1:' + PORT + '/api/room/message', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,userName:'Johannes'}),signal:AbortSignal.timeout(45000)});
+    // Forward the caller's own verified token; identity comes from the token, never from the body.
+    const r = await fetch('http://127.0.0.1:' + PORT + '/api/room/message', {method:'POST',
+      headers:{'Content-Type':'application/json', Authorization: req.headers['authorization']},
+      body:JSON.stringify({message}), signal:AbortSignal.timeout(45000)});

-app.post('/api/room/live/session', async (req, res) => {
+app.post('/api/room/live/session', requireAuth, async (req, res) => {

-app.get('/api/room/history', (req, res) => {
+app.get('/api/room/history', requireAuth, (req, res) => {

-app.delete('/api/room/clear', (req, res) => {
+app.delete('/api/room/clear', requireAdmin, (req, res) => {
```

Die Room-Oberfläche muss bei `fetch(API + '/api/room/history')` (`room.html:1994`) und beim Live-Session-Aufbau den gespeicherten Bearer-Token mitsenden. Der CORS-Block in `server.js:52` muss für `/api/room/live/session` zusätzlich `Authorization` in `Access-Control-Allow-Headers` erlauben, sonst bricht die Hilarion-Café-Bridge. **Vor dem Patch prüfen, wer diese Endpunkte aufruft** (Hilarion-Café-Bridge, Telegram, n8n), damit kein legitimer Aufrufer ohne Token bricht.

S6: Rolle `room_operator` in den JWT-Claims führen und darauf prüfen. Dafür muss vorher die Herkunft der JWT-Claims (`/api/auth/signup`) geklärt sein.

## 3. Integration des Moduls (Folgeschritt, nicht P0)

```js
const room = require('../../../modules/sophia-unified-room/src/index.cjs');
const roomDb = room.db.open(process.env.NYXA_ROOM_DB);
const auth = room.createAuth({
  verifyHuman: t => { const u = jwt.verify(t, JWT_SECRET); return { id: 'human:' + u.id, roles: u.roles || [] }; },
  verifyService: t => verifyServiceToken(t), // HMAC, eigener Secret, nicht ADMIN_TOKEN
});
const bus = room.createBus(roomDb);
const queue = room.createQueue(roomDb, { approverPolicy: room.approverPolicyFrom((process.env.NYXA_APPROVER_IDS||'').split(',')) });
room_api = require('../../../modules/sophia-unified-room/src/http-api.cjs').createApi({ bus, queue, auth });
room_api.mount(app);
```

Danach in `/api/room/message`: `roomHistory.push` durch `bus.post` ersetzen; `roomHistory` bleibt während der Migration als Lese-Cache.

Realtime-Kopplung in `room.html`, ausgehend von `dc.onopen` und `dc.onmessage` (Zeilen 1688 bis 1720):

1. Beim Öffnen: `POST /api/v2/room/sessions` mit `{conversation_id, channel:'voice'}`.
2. Text, der im Room-Textfeld abgeschickt wird, per `POST /api/v2/room/messages` speichern. Danach `GET /sessions/:id/pending` abrufen und jede Nachricht als `conversation.item.create` (role `user`, Präfix `[Text von <actor>]`) senden. Bei `conversation.item.created` folgt `POST /sessions/:id/ack`.
3. Lange Texte (mehr als 2000 Zeichen) gehen als markierter Auszug plus `content_ref` an Sophia. Dazu kommt ein neues Realtime-Tool `room_content_fetch(content_ref)` gegen `GET /api/v2/room/content/:ref`.
4. `conversation.item.input_audio_transcription.completed` und `response.output_audio_transcript.done` werden mit `channel:'voice'` und `message_id = item_id` gespeichert, was dedupliziert.
5. Die Realtime-Session-Instruktionen erhalten beim Start `contextWindow(conversation_id)`, also die Room-History. Damit ist Defizit 2 behoben.
