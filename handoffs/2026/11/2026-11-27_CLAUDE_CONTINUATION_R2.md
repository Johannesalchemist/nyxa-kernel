# Handoff 2026-11-27 — Continuation R2

| Feld | Wert |
|---|---|
| Autor / verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum / Zeitzone | 2026-11-27, Europe/Berlin |
| Branch | `ccr-05bf3d01-8z9z1d` (auf `367c002`) |
| Epistemischer Status | `DRAFT` · Review ausstehend |
| Vorgänger | `2026-11-26_CLAUDE_CONTINUATION_R1.md` |
| Evidenz | `research/evidence/2026-11-27/CONTINUATION-R2_EVIDENCE.md` |

## Arbeitspakete

| WP | Ergebnis | Status |
|---|---|---|
| WP1 Actor Binding | `modules/authority/actor-attestation/`: Ed25519-Agent-Attestierung pro Proposal (Wiederverwendung `canonicalHumanGate`), backend-seitiges Gate am Engpass `handleProposeAction`, Patcher; Bridge lehnt weitergeleitete Anfragen ab | IMPLEMENTED · TESTED (9/9 isoliert, 10/11 reales V2-Backend, 11/11 Bridge-Regression) |
| WP2 Deployment | `DEPLOY-ORDER-WP-A1.md` R2 + `preflight-wp-a1.sh` (Apache-Routing und Backend-Durchsetzung als HOLD-Prüfungen) | PREPARED |
| WP3 Welle 4 | `research/memo/reflection_qa.py`: fünf MeMo-Stufen + NYXA-Governance (Provenienz, Gültigkeit, Widerruf, Fakt/Inferenz/Hypothese, Widersprüche), versionierter Export ohne Trainingsfreigabe | IMPLEMENTED · TESTED (7/7) |
| WP3 Welle 6 | `research/mcp/MCP_2026-07-28_COMPATIBILITY.md` | Analyse, P0-Schritte benannt |
| WP3 Welle 7 | `research/adversarial-harness/` (Registry + Runner über bestehende Tests, Scorecard) | 12/0 technisch, 5 Modellverhalten `not_run` |
| WP3 Strategien | eigener Lernbereich in `research/memo/README.md` | konzipiert |
| WP4 Sophia | `modules/sophia/avatar-sink/`: providerneutrale Senke, Realtime-Audio → LiveAvatar LITE, Barge-in, No-Op-Fallback; Kosten/Voraussetzungen | IMPLEMENTED · TESTED (5/5) · nicht CONNECTED |
| WP5 Hygiene | `modules/ops/server-b-hygiene/`: Herkunft/Abhängigkeiten `/package.json`, Verursacher Avatar-Logs, vorbereiteter Fix `avatar-logs-fix.sh` | PREPARED |

## Kritische Befunde

1. **`mcp.future24.eu/mcp` → Apache → Bridge, nur IP-Filter, keine Authentifizierung.** Der Claude-Webconnector erscheint an der Bridge als Server B selbst; Tailnet-Bindung kann ihn nicht identifizieren. Sicherheitsrelevant unabhängig von WP-A1.
2. **R8:** Mandats-/Grant-Tools außerhalb des Proposal-Pfads sind nicht attestiert.
3. **Avatar-API läuft als root** (`/opt/avatar/api/server.js`, öffentlich über `avatar.future24.eu`).
4. MCP 2026-07-28 entfernt Sessions/`initialize` → Bridge braucht Dual-Stack; Akteursnachweis pro Anfrage ist der tragfähige Weg.

## Erforderliche menschliche Entscheidungen

1. Claude-Webconnector-Route: unverändert ohne Bindung weiterbetreiben (Empfehlung kurzfristig) oder OAuth 2.1 einführen.
2. Stufe 1/2 des Deployment-Auftrags freigeben (root).
3. `avatar-logs-fix.sh` ausführen; Avatar-API auf Dienstbenutzer umstellen.
4. Root-Projektgerüst (`/package.json` u. a.) ins Archiv verschieben.
5. LiveAvatar: Tarif, Avatar-Slot, Bild-Avatar aus bestehendem Sophia-Material, API-Key (kostenpflichtig).
6. MeMo-Experimente: Korpusfreigabe + GPU-Mandat.

## Nächste ausführbare Implementierungsschritte (ohne Freigabe möglich)

1. R8: Attestierung für `nyxa_mandate_derive/revoke` (Argument-Digest), Tests + reales Backend.
2. Bridge Dual-Stack 2025-11-25/2026-07-28 inkl. `Origin`-Prüfung, Tests gegen SDK.
3. Tasks-Extension-Entwurf für `nyxa_apply_patch`/`nyxa_run_test` auf vorhandener Audit-Kette.
4. AudioWorklet-Anbindung der Avatar-Senke im Room-Client (lokal testbar mit Sandbox-Mock).
5. MeMo-Pipeline an einen echten Generator anbinden (bestehendes Modell-Routing, kein Ollama) und auf einem freigegebenen Mini-Korpus laufen lassen.
