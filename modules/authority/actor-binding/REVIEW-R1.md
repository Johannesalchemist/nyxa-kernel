# Adversariales Review R1 — WP-A1-ACTOR-BINDING

| Feld | Wert |
|---|---|
| Datum | 2026-11-26, Europe/Berlin |
| Reviewer | Claude Code (Cloud-Session) — **selbe Instanz wie der Autor; das ist KEIN unabhängiges Review** im Sinne von AGENTS.md/Repository-Policy §6 |
| Status | Befunde R1/R2 behoben und getestet; R3–R6 offen bzw. organisatorisch |

## Befunde

| ID | Angriff / Frage | Befund | Maßnahme | Nachweis |
|---|---|---|---|---|
| R1 | **Device Identity ≠ Agent Identity / gemeinsam genutzter Host** | Tailscale `whois` identifiziert Knoten, nicht Prozesse. War der Bridge-Host selbst als Peer erlaubt (so im ersten E2E), authentifizierte sich *jeder* lokale Benutzer/Prozess auf Server B als `claude`. | Bridge fragt beim Start `/localapi/v0/status` → `Self.ID`; Start verweigert, wenn der eigene Knoten erlaubt ist (`self_node_not_allowed`) oder die eigene Identität nicht ermittelbar ist (`self_identity_unavailable`). | 2 Unit-Tests; realer Lauf Server B: „real host node in binding refused at startup“, „local process on bridge host denied (403)“ |
| R2 | **Actor Spoofing über alternative Backend-Pfade** | Nur `nyxa_propose_action` wurde geprüft. `toolbox_execute` mit `input.proposal` (z. B. `nyxa.dev.run_test`, governed) und andere Verschachtelungen gingen ungeprüft durch. | Jedes `proposal`-Objekt in den Argumenten (Tiefe ≤ 6, auch in Arrays) muss `actor == gebundener Akteur` tragen; `null`/Array-Proposals werden abgelehnt. | 6 zusätzliche Assertions; realer knotenübergreifender Lauf Server A → B: „toolbox-wrapped actor spoof denied“ |
| R3 | **Proxy-Verbindungen** | Leitet ein erlaubter Knoten fremden Verkehr weiter (`tailscale serve`/Funnel, Reverse Proxy, Tunnel), erbt dieser Verkehr die Knotenidentität. Technisch in der Bridge nicht erkennbar. `mcp.future24.eu` läuft auf Server B hinter Apache; das Proxy-Ziel ist für `jo` nicht lesbar (`unknown`). | Organisatorische Vorbedingung im Deployment-Auftrag: erlaubter Client-Knoten darf keinen Fremdverkehr proxien; dedizierter Knoten (Tag) pro Akteur; Apache-Ziel von `mcp.future24.eu` muss vor Deployment geprüft werden. | — (offen) |
| R4 | **Session Hijacking** | Session-ID (UUIDv4) ist an den initialisierenden Knoten gebunden; fremder Knoten mit gültiger ID → 403 auf POST/GET/DELETE. Innerhalb desselben Knotens kann ein Prozess mit gestohlener Session-ID diese nutzen (Folge von R1/R3: Knoten = Vertrauensgrenze). | Kein zusätzlicher Code; dokumentierte Grenze. | Unit-Test „session takeover by other node denied“ |
| R5 | **Alternative Backend-Zugänge ohne Bridge** | Das Governed Backend liest `NYXA_DEVELOPMENT_ACTOR` aus seiner Prozessumgebung. Wer `node dist/index.js` mit gesetzter Variable starten und auf die Datenverzeichnisse schreiben kann, umgeht die Bridge. `/opt/nyxa-governed-memory-mcp-runtime` ist für `jo` nicht lesbar (Permission denied) – positiv, aber für `nyxamcp`/root nicht geprüft. Weitere Zugänge: NYXA MCP (Claude-Connector, hier Policy `draft`), SentinelX, Tunnel-Client (OpenAI, `nyxa-readonly`). | Deployment-Auftrag verlangt Prüfung der Dateirechte der Mandate-/Daten-Verzeichnisse und, dass nur die gebundenen Bridges `NYXA_DEVELOPMENT_ACTOR` setzen. | — (offen, root nötig) |
| R6 | **Verhaltensänderung im laufenden V1-Backend** | Im V2-Kandidaten verweigert `nyxa_apply_patch` direkt, sobald `NYXA_DEVELOPMENT_ACTOR` gesetzt ist (`development_mandate_proposal_required`). Ob das live laufende V1-`dist/server.js` die Variable auswertet, ist für `jo` nicht lesbar. | Vorbedingung im Deployment-Auftrag: Live-`dist/server.js` auf `NYXA_DEVELOPMENT_ACTOR` prüfen; Actor Binding nur zusammen mit oder nach Authority V2 aktivieren. | — (offen) |
| R7 | Test-Hygiene | `trap 'kill ${pid:-0}'` traf ohne Bridge-PID die eigene Prozessgruppe. | Trap korrigiert. | — |

## Zugangswege (live, 2026-11-26)

| Weg | Ergebnis |
|---|---|
| NYXA MCP `operational_route_resolve` server-b/read | `PREFLIGHT_OK` (nur Knotenidentität) |
| NYXA MCP server-b/effect | `ESCALATE: requires_separate_governed_execution_authority` |
| NYXA MCP server-a/read | `PREFLIGHT_OK`, StableID `na9XZpXjL621CNTRL`, suggestedUser `deploy` |
| NYXA MCP server-c | `HOLD: target_retired` |
| Remote Desktop Commander | Server A (`deploy`) und Server B (`jo`, NoNewPrivs, kein sudo) online; Kontingent > 80 % |
| SentinelX / Ops Broker | in dieser Session kein Werkzeug verfügbar; laut V2-STATUS keine operative Route zu Server B (Host-Limit) — `unverified` |
| Tailscale SSH | aus dem Cloud-Container nicht erreichbar (kein Tailnet-Mitglied) — `unverified` |

Ergebnis: Es existiert derzeit **kein** autorisierter Root-Weg für Agenten. Root-Schritte bleiben beim Menschen (Human Authority Gate).
