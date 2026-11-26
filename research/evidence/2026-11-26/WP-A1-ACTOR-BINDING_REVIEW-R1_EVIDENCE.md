# Evidenz WP-A1 Review R1 + /package.json-Herkunft — 2026-11-26 (Europe/Berlin)

Quellenstatus: `SOURCE-VERIFIED` · Reviewstatus: ausstehend · Erzeugt: Claude Code (Cloud-Session)

## Lokal (Claude-Code-Container, Node v22.23.5, SDK 1.30.0)

`node --test actorBinding.test.mjs` → `tests 11 · pass 11 · fail 0` (neu: R1 Host-Knoten verweigert, R1 Host-Identität unbekannt → verweigert; R2 Toolbox-/verschachtelte/null/Array-Proposals abgewiesen, passende Toolbox-Proposals und proposal-freie Aufrufe weitergeleitet).

## Server B (`jo`, `/home/jo/nyxa-actor-binding-20261126`, alte Dateien gesichert unter `r0/`)

```
tailscaleIdentity.cjs: OK      (ae959b68…)
bridge-actor-bound.cjs: OK     (4183d2fb…)
actorBinding.test.mjs: OK      (b777b37f…)
e2e-cross-node.sh: OK          (e0be801f…, vor Trap-Fix; Repo-Stand aadb4958… unterscheidet sich nur im Trap)
# tests 11  # pass 11  # fail 0
PASS B: real host node in binding refused at startup
PASS B: bridge serving, allowed peer na9XZpXjL621CNTRL
PASS B: local process on bridge host denied (403)
```

## Server A (`deploy`) → Server B über echtes Tailnet

```
PASS A: cross-node peer authenticated, session bound
PASS A: backend actor = claude (from binding)
PASS A: direct actor spoof denied
PASS A: toolbox-wrapped actor spoof denied
CLIENT_RESULT=PASS
```

## Herkunft `/package.json` auf Server B (nur gelesen, nichts verändert)

- `/package.json` 663 B, `root:root 0644`, erstellt/geändert `2026-05-18 16:15:08 UTC`; `/package-lock.json` 16:15:35 UTC.
- Inhalt: `"name":"nyxa-governed-memory-mcp","version":"0.1.0","type":"module"`, SDK `1.29.0`.
- Im selben Zeitfenster im Dateisystem-Root: `server.ts`, `index.ts`, `env.ts`, `modes.ts`, `audit.trace.ts`, `tsconfig.json`, `dev.sh`, `src/`, `scripts/` (alle 2026-05-18). Kein dpkg-Besitz.
- Bewertung (`unverified`): frühes Projektgerüst des Governed Memory MCP, versehentlich mit Arbeitsverzeichnis `/` erzeugt. Folge: `"type":"module"` gilt für jede `.js`-Datei auf Server B ohne nähere `package.json`.
- Nicht entfernt. Entfernen erst nach Prüfung, welche `.js`-Dateien ohne eigene `package.json` sich auf ESM-Semantik verlassen.
- Nebenbefund: `/avatar_access.log` (22 MB) und `/avatar_error.log`, zuletzt 2026-11-26 16:44, werden aktiv im Dateisystem-Root beschrieben (Avatar-Dienst mit fehlkonfiguriertem Logpfad; Dienst `unknown`).

## Zugangswege

Siehe `modules/authority/actor-binding/REVIEW-R1.md`, Abschnitt Zugangswege. Server C: `HOLD target_retired`.
