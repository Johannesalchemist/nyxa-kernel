# F6 — Rotation der Supabase-Auth-Signaturschlüssel: Abhängigkeitsanalyse

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum | 2026-11-27, Europe/Berlin |
| Quellen | Live-Lesezugriff Server B: **nur Variablennamen** der laufenden Container, Kommentarzeilen der Compose-Datei, Hash-Vergleich (12 Zeichen) statt Werten |
| Epistemischer Status | `VERIFIED` für Namen/Zuordnung · `UNVERIFIED` für externe Verbraucher |
| Reviewstatus | ausstehend |
| Nächster zulässiger Schritt | Owner-Entscheidung über Wartungsfenster, dann Rotation durch den Owner |

Es wurden keine Schlüssel gelesen, ausgegeben oder geändert.

## Befund

1. **Aktive Signatur ist HS256.** In der Compose-Konfiguration ist die Zeile für asymmetrische GoTrue-Schlüssel auskommentiert. Der laufende Auth-Dienst signiert mit dem symmetrischen Secret, das per Hash-Vergleich identisch mit dem Wert der Env-Datei ist. Das in der Sitzung offengelegte Material umfasst laut R4-Protokoll diesen HS256-Wert und einen ES256-Privatschlüssel.
2. **Tragweite:** Mit dem HS256-Secret lassen sich beliebige Tokens erzeugen, auch mit der Rolle `service_role`. Damit lassen sich Row-Level-Security über PostgREST, Storage und Realtime umgehen. Die Rotation ist deshalb nötig, auch wenn das Material nicht im Repository liegt.
3. **The Room ist nicht betroffen:** Ihr eigenes `JWT_SECRET` ist per Hash-Vergleich ein anderer Wert.

## Abhängige Dienste (Variablennamen, laufende Container)

| Dienst | Verwendet | Wirkung der Rotation |
|---|---|---|
| auth (GoTrue) | `GOTRUE_JWT_SECRET` | alle Sitzungen und Refresh-Flows ungültig → Neuanmeldung aller Nutzer |
| rest (PostgREST) | `PGRST_JWT_SECRET` (aus JWKS, sonst Secret), `PGRST_APP_SETTINGS_JWT_SECRET` | alte Tokens werden abgewiesen |
| realtime, pooler | `API_JWT_SECRET`, `METRICS_JWT_SECRET` | Kanäle trennen und verbinden sich neu |
| storage | `AUTH_JWT_SECRET`, `ANON_KEY`, `SERVICE_KEY` | neue API-Schlüssel nötig |
| edge-functions | `JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | neue API-Schlüssel nötig |
| envoy (Gateway) | `ANON_KEY`, `SERVICE_ROLE_KEY`, `*_ASYMMETRIC` | Gateway weist alte Schlüssel ab |
| studio | `AUTH_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Admin-Oberfläche benötigt neue Schlüssel |
| db | `JWT_SECRET` (DB-Einstellung) | wird beim Neustart neu gesetzt |

**Vorab signierte Schlüssel** (`ANON_KEY`, `SERVICE_ROLE_KEY` mit HS256, `*_ASYMMETRIC` mit ES256) müssen **neu erzeugt** werden. Jede Anwendung, die sie fest eingebaut hat (Frontends, Server-Clients), muss sie neu erhalten. **Externe Verbraucher: `UNVERIFIED`.** Vor der Rotation ist zu inventarisieren, welche Apps die Supabase-URL und den Anon-Key verwenden.

## Ablauf (Vorschlag, durch den Owner)

1. Verbraucher inventarisieren: Suche nach Supabase-URL und Anon-Key-Verwendung in den App-Verzeichnissen, nur Namen.
2. Wartungsfenster ankündigen: Alle Nutzer müssen sich neu anmelden.
3. Sichern: Env-Datei kopieren, nur root-lesbar.
4. Neues HS256-Secret erzeugen (≥ 32 Byte). Neues ES256-Schlüsselpaar nur, wenn asymmetrische Signatur danach aktiviert werden soll. Empfehlung: aktivieren, damit Verbraucher nur noch über öffentliche JWKS prüfen.
5. `ANON_KEY` und `SERVICE_ROLE_KEY` (und die asymmetrischen Varianten) mit den neuen Schlüsseln neu signieren.
6. Alle Supabase-Container neu erzeugen, nicht nur neu starten, damit die Env-Werte neu eingelesen werden.
7. Prüfen:
   - Ein mit dem **alten** Secret signiertes Test-Token muss an REST, Storage und Realtime mit 401 abgewiesen werden.
   - Neue Anmeldung funktioniert.
   - Ein Storage-Upload funktioniert.
   - Eine Edge-Function funktioniert.
8. Verbraucher aktualisieren, dann die Sicherung der alten Env-Datei vernichten.

**Übergangsfenster:** GoTrue signiert mit genau einem HS256-Secret. Ein Betrieb, in dem der alte Schlüssel nur noch zur Prüfung dient, ist mit der aktuellen HS256-Konfiguration nicht vorgesehen; für PostgREST wäre er über JWKS technisch möglich, würde aber das kompromittierte Secret weiter akzeptieren. Empfehlung: harter Schnitt im Wartungsfenster.

**Rückweg:** Die alte Env-Datei wiederherstellen und die Container neu erzeugen. Das setzt aber das kompromittierte Secret wieder ein und ist nur bei einem Totalausfall zulässig.
