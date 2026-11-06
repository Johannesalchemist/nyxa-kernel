# Preflight Checklist — vor jeder Ausführung von `bridge_e2e_test.mjs`

Diese Liste ist verpflichtend und manuell vom ausführenden Menschen (nicht vom Skript) zu bestätigen, bevor
`RUN_INSTRUCTIONS.md` befolgt wird. Das Skript selbst erzwingt nur die technisch prüfbare Teilmenge (siehe
`bridge_e2e_test.mjs`, Funktion `runPreflightGuard`).

1. **Zielidentität bestätigt**
   - `hostname` entspricht dem erwarteten, dokumentierten Zielhost.
   - `whoami` entspricht dem erwarteten Betriebsbenutzer.
   - Aktiver MCP-Prozess identifiziert (PID, Startkommando, tatsächlich geladener Entry-Pfad — nicht nur der
     konfigurierte Pfad).
   - SHA-256 von `AuditLog.js` im laufenden Prozesspfad wurde gebildet und gegen den Dev-/Repo-Stand verglichen.
     Abweichung → Abbruch, kein Testlauf.
   - Ergebnis dieses Punktes ist vor Skriptstart als Freitext in `BRIDGE_E2E_TARGET_ATTESTATION` (Umgebungsvariable
     oder Datei, siehe `RUN_INSTRUCTIONS.md`) hinterlegt. Fehlt dieser Wert, bricht das Skript ab.

2. **Scope-Isolation bestätigt**
   - Zielkonfiguration (`BRIDGE_E2E_ENDPOINT` / `BRIDGE_E2E_CMD`) zeigt nachweislich auf eine isolierte Test- oder
     Dev-Instanz, nicht auf den produktiven Bridge-Prozess.
   - Audit-Senke des Zielprozesses ist vom produktiven Audit-Log getrennt, oder alle Testereignisse sind durch ein
     eindeutiges `correlationId`-Präfix (`bridge-e2e:<runId>`) filterbar und werden nach dem Lauf separat
     exportiert und — falls im selben Log geschrieben — als Testartefakte markiert, nicht gelöscht.

3. **Keine Nebenwirkungen auf geschützte Pfade**
   - Keine Schreibzugriffe auf `data/`, `data-claude-bridge/`, `data-tunnel/`, `data-tunnel-v2/`, Bridge-/Tunnel-
     Konfiguration oder laufende Produktionsprozesse. Das Skript enthält dafür keine Pfade — es spricht
     ausschließlich über das MCP-Protokoll mit dem konfigurierten Endpunkt.

4. **E2 bleibt deaktiviert**
   - `BRIDGE_E2E_ENABLE_E2=true` ist NICHT gesetzt, außer eine gesonderte, dokumentierte Freigabe für genau diesen
     Testfall liegt vor (eigener Handoff/ADR, nicht dieses Dokument).

5. **Freigabestatus bestätigt**
   - Die unter `README.md` dokumentierte HOLD-Empfehlung ist weiterhin gültig und wird durch diesen Testlauf nicht
     als Teilfreigabe interpretiert, unabhängig vom Ergebnis.

Bei Unklarheit in Punkt 1 oder 2: **abbrechen**, nicht fortfahren. Dies entspricht Abschnitt 3 des Arbeitsauftrags
("Bei falschem Host, unklarem Bridge-Prozess oder fehlender Scope-Isolation abbrechen").
