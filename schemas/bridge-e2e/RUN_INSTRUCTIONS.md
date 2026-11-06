# Ausführungsanweisung für `sentinelx` / `nyxamcp`

**Diese Anweisung ist NICHT die Freigabe zur Ausführung.** Ausführung erfolgt erst, nachdem
`PREFLIGHT_CHECKLIST.md` vollständig und manuell bestätigt wurde und Jo die produktive Ausführung freigibt.

## 1. Voraussetzungen am Zielsystem

- Node.js verfügbar (keine zusätzlichen npm-Pakete nötig — das Skript nutzt nur Node-Bordmittel).
- Der zu testende MCP-Bridge-Prozess läuft **isoliert**, nicht der produktive Prozess (siehe Preflight Punkt 2).
- Der tatsächlich geladene Laufzeitpfad und die SHA-256 von `AuditLog.js` dieses Prozesses sind bekannt und
  dokumentiert (Preflight Punkt 1). Woher diese Werte stammen (Befehl, Zeitstempel, Ausführender) gehört in
  `BRIDGE_E2E_TARGET_ATTESTATION`.

## 2. Umgebungsvariablen setzen

Genau einen Transport wählen:

```bash
# Option A: stdio (Prozess wird vom Skript gespawnt)
export BRIDGE_E2E_CMD="node /pfad/zur/isolierten/instanz/build/index.js"

# Option B: HTTP(S)
export BRIDGE_E2E_ENDPOINT="http://127.0.0.1:<ISOLIERTER_PORT>/mcp"
```

Pflichtfelder (seit Rework v2 — eine beliebige nichtleere Zeichenkette genügt NICHT mehr):

```bash
export BRIDGE_E2E_TARGET_ATTESTATION_FILE="/pfad/zu/attestation.json"
export BRIDGE_E2E_AUDIT_LOG_PATH="/pfad/zur/isolierten/instanz/audit.log"
export BRIDGE_E2E_EVIDENCE_DIR="/pfad/zu/evidence/<run-datum>"
```

`attestation.json` muss alle sieben Felder aus `lib/preflight.mjs` (`REQUIRED_ATTESTATION_FIELDS`) enthalten:

```json
{
  "hostIdentity": "hostname=...; tailscale_ip=...; authorized_access_path=...",
  "processIdentity": "pid=...; user=...; start_command=...",
  "loadedRuntimePathAndHash": "tatsächlich geladener Pfad + AuditLog-SHA-256, NICHT nur konfigurierter Pfad",
  "isolatedTestInstanceConfirmed": true,
  "separateAuditSinkConfirmed": true,
  "noConcurrentWritesConfirmed": true,
  "approvedScope": "Referenz auf die konkrete Freigabe für genau diesen Testumfang"
}
```

Jedes dieser Felder muss real geprüft, nicht behauptet sein. Jede `*Confirmed`-Angabe mit Wert `false` bricht den Preflight ab (siehe `lib/preflight.mjs`), fehlende Felder ebenso.

Optional:

```bash
export BRIDGE_E2E_I0_TOOL_NAME="system_status"   # Name eines echten I0-Lesetools der Zielimplementierung
export BRIDGE_E2E_TIMEOUT_MS="10000"
export BRIDGE_E2E_AUDITLOG_MODULE_PATH="/pfad/zur/echten/AuditLog.js-Hashfunktion.mjs"
# Nur wenn ein Wrapper-Modul existiert, das `computeEventHash(record, previousHash)` aus der realen
# AuditLog.js re-exportiert (AGENTS.md: bestehende Logik wiederverwenden, nicht neu erfinden). Ohne dieses
# Modul bewertet T08 nur Verkettung + Genesis-Anker, NICHT die kryptografische Content-Integrität.
```

### Vor der Ausführung gegen eine echte Instanz: lokalen Selbsttest laufen lassen

```bash
node lib/selftest.mjs
```

Führt T01–T10 gegen eine lokale `MockTransport`-Simulation aus (keine Netzwerkverbindung, keine echte Bridge).
Erwartung: PASS für T01–T05, T07–T10; `UNJUDGED` für T06 (siehe Begründung im Skript). Jeder `FAIL` hier ist ein
Fehler im Testharness selbst und muss vor einer Ausführung gegen eine echte Instanz behoben werden.

E2 bleibt gesperrt, außer eine gesonderte Freigabe liegt vor:

```bash
# NICHT setzen ohne gesonderte, dokumentierte Freigabe:
# export BRIDGE_E2E_ENABLE_E2="true"
# export BRIDGE_E2E_E2_SEPARATE_APPROVAL_REF="<Referenz auf separate Entscheidung>"
```

## 3. Ausführen

```bash
cd schemas/bridge-e2e
node bridge_e2e_test.mjs
```

Das Skript:

- bricht in `runPreflightGuard()` ab, wenn Pflichtfelder fehlen, beide Transportarten gesetzt sind, geschützte
  Pfadfragmente in der Konfiguration erscheinen, oder E2 ohne zweite Freigabe aktiviert werden soll,
- schreibt den vollständigen Evidenzbericht als JSON nach `BRIDGE_E2E_EVIDENCE_DIR/report-<runId>.json`,
- gibt einen Exit-Code `1` zurück, wenn mindestens ein Testfall `FAIL` ist.

## 4. Nach dem Lauf

1. Evidenzverzeichnis sichern (nicht löschen, nicht überschreiben — Policy: unveränderliche Handoffs/Evidenz).
2. Bericht gegen `EXPECTED_EVIDENCE.md` prüfen.
3. Ergebnis als Handoff unter `handoffs/2026/<MM>/` dokumentieren, inklusive aller offenen `pass: null`-Fälle
   (insbesondere T06) und des unausgeführten E2-Stubs.
4. HOLD-Status explizit erneut bestätigen oder — nur über eine dokumentierte Entscheidung unter `decisions/` —
   ändern. Dieses Skript selbst hat keine Befugnis, HOLD aufzuheben.
