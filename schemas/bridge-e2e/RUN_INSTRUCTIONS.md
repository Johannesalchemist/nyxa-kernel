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

Pflichtfelder:

```bash
export BRIDGE_E2E_TARGET_ATTESTATION="hostname=<...>; whoami=<...>; pid=<...>; auditlog_sha256_match=<true/false>; geprueft_von=<Name>; zeitpunkt=<ISO8601>"
export BRIDGE_E2E_AUDIT_LOG_PATH="/pfad/zur/isolierten/instanz/audit.log"
export BRIDGE_E2E_EVIDENCE_DIR="/pfad/zu/evidence/<run-datum>"
```

Optional:

```bash
export BRIDGE_E2E_I0_TOOL_NAME="system_status"   # Name eines echten I0-Lesetools der Zielimplementierung
export BRIDGE_E2E_TIMEOUT_MS="10000"
```

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
