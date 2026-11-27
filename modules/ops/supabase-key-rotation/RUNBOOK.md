# F6 — Rotations-Runbook, Wiederanlauf, Abnahme

| Feld | Wert |
|---|---|
| Ausführung | **nur** durch den Owner bzw. root in einem autorisierten Wartungsfenster |
| Erzeugendes System | Claude Code, 2026-11-27, Europe/Berlin |
| Skripte | `acceptance-tests.sh` (lesend, nach der Rotation), Werte werden nie ausgegeben |

## Phase 0 — Sofort-Eindämmung (eigene Freigabe F6a, unabhängig vom Wartungsfenster, reversibel)
1. `a2dissite stream.future24.eu` (oder dort `ProxyPass` auf den ursprünglich gemeinten Dienst korrigieren).
2. Im Default-vHost `ProxyPass /leads` entfernen. Ziel war offenbar der frühere Leadflow-Dienst; der läuft heute auf `127.0.0.1:8010`.
3. `apachectl configtest && systemctl reload apache2`.
4. Prüfen: `curl -s -o /dev/null -w '%{http_code}' http://stream.future24.eu/auth/v1/health` darf **nicht** mehr `401` von Supabase liefern.

Rückweg: Sicherungskopien der beiden vHost-Dateien zurückspielen, dann `reload`.

## Phase 1 — Vorbereitung (T−1 Tag)
- Wartungsfenster festlegen (≈ 30 min) und Nutzer informieren: Alle müssen sich neu anmelden.
- `docker compose ps` notieren und den Stand der Container-Images festhalten.
- Datensicherung der Datenbank (pg_dump) als eigenes, root-lesbares Artefakt.

## Phase 2 — Rotation (T)
1. `.env` sichern: `install -m 600 .env .env.pre-f6`.
2. Neues `JWT_SECRET` erzeugen (≥ 40 Zeichen, z. B. `openssl rand -base64 48 | tr -d '\n/+='`) und **nur** in `.env` schreiben.
3. Neue `ANON_KEY`/`SERVICE_ROLE_KEY` signieren (HS256, Claims `role`, `iss: supabase`, `iat`, `exp`), mit dem Generator der offiziellen Self-Hosting-Anleitung oder einem lokalen Skript ohne Netzwerk.
4. ES256 ist in GoTrue nicht aktiv. Schlüssel aus `JWT_KEYS`/`JWT_JWKS` **entfernen** oder neu erzeugen. Empfehlung: entfernen, bis eine bewusste Aktivierung erfolgt.
5. `docker compose up -d --force-recreate`, damit alle Dienste neu erzeugt werden und die Env neu einlesen.
6. `.env.pre-f6` erst nach bestandener Abnahme mit `shred -u` vernichten.

## Phase 3 — Wiederanlauf
Reihenfolge, falls einzeln: `db` → `auth` → `rest` → `realtime`, `pooler` → `storage` → `edge-functions` → `envoy` → `studio`.
Für jeden Dienst gilt: Healthcheck grün (`docker compose ps`), keine Fehlerzeile mit `JWT` im Log der letzten 2 min.

## Phase 4 — Abnahme (`acceptance-tests.sh`)
| Test | Erwartung |
|---|---|
| A1 Token, signiert mit dem **alten** Secret, an REST | 401 |
| A2 Token, signiert mit dem alten Secret, an Storage und Realtime | 401 / abgewiesen |
| A3 neuer Anon-Key an `auth/v1/health` | 200 |
| A4 Laufende Env-Werte = `.env` (Hash-Vergleich) für alle 8 Dienste | gleich (Hinweis: `PGRST_JWT_SECRET` kann aus `JWT_JWKS` stammen; dann JWKS statt Secret vergleichen) |
| A5 Kein öffentlicher Zugriff auf das Gateway (nach Phase 0) | kein Supabase-401 über :80 |
| A6 Neuanmeldung eines Testnutzers | erfolgreich |

## Rückweg (nur bei Totalausfall)
`.env.pre-f6` zurückspielen und `up -d --force-recreate`. **Damit ist das kompromittierte Secret wieder aktiv.** Die Rotation ist dann sofort neu anzusetzen.
