# WP5 Systemhygiene Server B — Befunde und vorbereitete Bereinigung

Stand 2026-11-27, Europe/Berlin · Quellenstatus `SOURCE-VERIFIED` (read-only als `jo`) · erzeugt mit Claude Code · Review ausstehend.
Nichts wurde gelöscht oder verändert.

## 1. `/package.json` (+ Projektgerüst im Dateisystem-Root)

| Fakt | Wert |
|---|---|
| Datei | `/package.json`, 663 B, `root:root 0644`, mtime/ctime `2026-05-18 16:15:08 UTC` |
| Begleitdateien (alle 2026-05-18, root) | `/package-lock.json`, `server.ts`, `index.ts`, `env.ts`, `modes.ts`, `audit.trace.ts`, `tsconfig.json`, `dev.sh`, `src/`, `scripts/` |
| Inhalt | `nyxa-governed-memory-mcp` 0.1.0, `"type":"module"`, `@modelcontextprotocol/sdk 1.29.0`, `zod 4.0.17`, `dotenv 16.4.5` |
| Paketbesitz | kein dpkg-Eintrag; kein `/node_modules` |
| Herkunft (Bewertung `unverified`) | frühes Gerüst des Governed Memory MCP, erzeugt als root mit Arbeitsverzeichnis `/` |

**Abhängigkeiten (Wirkung):** Node löst für jede `.js`-Datei ohne nähere `package.json` die Root-`package.json` auf → ESM. Betroffen (Scan Tiefe 3, ohne `node_modules`):
- Node-Skripte mit `require()`, die unter ESM **nicht** laufen: `/opt/n8n/qa-workbook-mail-v2-20261029T190601Z.js`, `/opt/call-training/list_candidates.js` (`/opt/n8n/qa-workbook-mail-code-v1.js` nicht lesbar).
- Staged/Backup-Skripte unter `/home/jo/nyxa-*`, `/home/jo/thechat-backups/…` (Status je Datei `unknown`).
- Browser-Assets unter `/var/www/future24.eu/**` — **nicht** betroffen (vom Browser geladen).
- Bekannter Vorfall: Stub-Backend im WP-A1-Test brach dadurch (2026-11-26), behoben durch lokale `package.json`.

**Empfehlung (Entscheidung Johannes):** Root-Gerüst nach `/root/archive/nyxa-gmm-scaffold-20260518/` **verschieben** (nicht löschen), danach die beiden `require()`-Skripte einmal starten. Rückweg: zurückverschieben. Vorher prüfen, ob ein Dienst mit `WorkingDirectory=/` Node startet: `grep -rl "WorkingDirectory=/$" /etc/systemd/system`.

## 2. `/avatar_access.log` (22 MB) und `/avatar_error.log`

| Fakt | Wert |
|---|---|
| Verursacher | Apache-Vhost `avatar.future24.eu` (`sites-available/avatar.future24.eu.conf` und `-le-ssl.conf`, aktiv seit 2026-04-15): `ErrorLog /avatar_error.log`, `CustomLog /avatar_access.log combined` — absolute Pfade statt `${APACHE_LOG_DIR}` |
| Ziel des Vhosts | `ProxyPass / http://127.0.0.1:4000/` |
| Rotation | keine (Debian-`logrotate` rotiert nur `/var/log/apache2/*.log`) |
| Inhalt (Stichprobe) | Scanner-Verkehr (z. B. Cortex Xpanse), 404 auf `POST /en` |

**Vorbereitet:** `avatar-logs-fix.sh` (root): Vhost-Pfade auf `${APACHE_LOG_DIR}/avatar-{access,error}.log`, `apachectl configtest` mit automatischem Rücksprung, `reload`, Altlogs gzip-archiviert nach `/var/log/apache2/archive/`, Root-Dateien geleert, aber nicht gelöscht. Rotation danach durch vorhandenes `/etc/logrotate.d/apache2`.

## 3. Nebenbefund Sicherheit: Avatar-API läuft als root

`root 1099 node /opt/avatar/api/server.js` (Port 4000, öffentlich über `avatar.future24.eu`). `/opt/avatar/api/.env` `root 0600`; `/opt/avatar/api` ist `drwxrwxr-x root:root`. Ein öffentlich erreichbarer Node-Prozess als root ist ein unnötiges Risiko. Empfehlung: eigener Dienstbenutzer + systemd-Härtung wie bei `nyxa-claude-mcp-bridge.service`. Kein Eingriff ohne Entscheidung.
