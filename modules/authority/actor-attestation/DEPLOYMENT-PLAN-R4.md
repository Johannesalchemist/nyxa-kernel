# Authority V2 + Agent Attestation — Weg zur aktiven Produktionsdurchsetzung (R4)

2026-11-27, Europe/Berlin · `PREPARED` · Ausführung nur durch Human Authority (root, Server B). Keine Stufe schaltet eine bestehende Governance-Grenze ab; `off` ist nur Übergangsstufe.

| Stufe | Inhalt | Eintrittskriterium | Abnahme / Abbruch |
|---|---|---|---|
| 1 Release + Preflight | Release-Build `build.py` + `patch_attestation.py` (4/4 Direkt-Tool-Anker, Proposal-Anker), neue `SHA256SUMS`, `deploy-authority-v2.sh --check`, `preflight-wp-a1.sh` | unabhängiges Review | `--check` PASS; Preflight ohne unbeantwortetes HOLD |
| 2 Shadow/Observe | Gate aktiv berechnet, aber nur protokolliert (Modus `observe`, **noch zu implementieren**: verify + audit, kein Deny) | Stufe 1 | 24 h ohne unerklärte `would_deny` bei legitimen Agenten |
| 3 Canary | `required` nur für **einen** Agenten-Passport (claude, `governed-dev:/authority-v1/`), andere Akteure `observe` | Stufe 2 | ALLOW mit realer Wirkung; realer DENY (Scope); ESCALATE (kein Mandat); Replay; Bypass (Direkt-Tool, Toolbox, Weiterleitung); Widerruf ohne Neustart |
| 4 Reale Prüfmatrix | wie Stufe 3 + Nebenläufigkeit (2 Instanzen, gemeinsamer Nonce-Ledger), Absturz zwischen Nonce und Effekt | Stufe 3 | alle Fälle PASS, Audit-Kette konsistent |
| 5 Erweiterung | weitere Passports (sophia, chatgpt-Tunnel) einzeln | Stufe 4 | je Akteur Stufe-3-Matrix |
| 6 Produktionsabnahme | `required` für alle Effektpfade, dokumentierte Entscheidung (ADR) | Stufe 5 | Human-Gate-Freigabe, Rollback geprobt |

## Bereits verifiziert (isoliert/real, R3–R4)

Proposal- und Direkt-Tool-Pfade, Toolbox-Effekte, direkter Backend-Start, ALLOW mit realer Wirkung, Replay inkl. Neustart, 8 konkurrierende Prozesse/2 Instanzen → 1 Gewinner, **Widerruf ohne Neustart** (Registry-Neuladen bei Dateiänderung, R4), Absturz zwischen Nonce-Verbrauch und Effekt → *at-most-once* (gleiche Attestierung nie erneut ausgeführt; neue Signatur nötig).

## Offene Punkte vor Stufe 2

1. Modus `observe` implementieren (verify + audit ohne Deny).
2. **Executor-Bindung:** Das Gate sitzt am Eintritt (`handleProposeAction`). Die Ausführung (`executeAllowedProposal`) ist nicht zusätzlich an den attestierten Digest gebunden; da derselbe Aufruf das geparste Proposal unverändert weitergibt, ist das Risiko gering, aber nicht ausgeschlossen (z. B. spätere asynchrone Ausführung). Nächster Schritt: attestierten Digest am Executor erneut prüfen (Lesen des Executor-Codes nötig).
3. Effekt-Idempotenz bleibt beim Executor (vorhandene `replayGuard`/`patchReplayGuard`); Zusammenspiel mit Nonce-Ledger im Canary messen.
4. Mehrere Backend-Instanzen auf **verschiedenen** Hosts: getrennte Audience je Instanz (verhindert hostübergreifendes Replay); gemeinsamer Ledger nur auf demselben Dateisystem atomar.
