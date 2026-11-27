# M10 — Aktivierung des Continuity-Adapters (Vorlage zur Freigabe)

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, 2026-11-27, Europe/Berlin |
| Status | vorbereitet; Standardmodus `shadow`; **nicht aktiviert** |

## Stufen
| Stufe | Wirkung | Dauer | Abnahme zum Übergang |
|---|---|---|---|
| S0 Shadow | Hooks erfassen redigiert in einen lokalen Ausgangskorb; `flush` schreibt nur `shadow-proposals.jsonl`, **reicht nichts ein** | 7 Tage | Datenschutzprüfung `privacyAudit.mjs` täglich **0 Funde**; Stichprobe von 20 Shadow-Vorschlägen durch den Owner: keiner falsch, keiner mit Autoritätsinhalt; Hook-Laufzeit unter 200 ms; keine Hook-Fehler, die einen Agenten blockieren |
| S1 Aktiv, nur vorschlagen | `NYXA_CONTINUITY_MODE=active`: Vorschläge gehen über `nyxa_propose_action` (γ, Capability Gate) in den Kandidatenspeicher als `pending`; Übernahme (`promoted`) nur durch den Owner | 14 Tage | 0 Datenschutzfunde; kein Vorschlag aus nicht vertrauenswürdiger Quelle als Entscheidung/Korrektur/Strategie; MCC-01 auf **unabhängigem** Korpus erfüllt die präregistrierte Regel |
| S2 Abruf | Beim Sitzungsstart wird ein Bundle aus `nyxa_memory_recall_candidates` (nur `promoted`) über `snapshot` bereitgestellt; unverifizierte Inhalte bleiben getrennt | laufend | Token-Budget eingehalten; Präzision gemäß MCC-01 |

## Datenschutzprüfung
- Redaktion von Schlüsseln, JWTs, Tokens, IP-Adressen und E-Mails **vor** dem Speichern (Tests); dazu eine unabhängige Nachprüfung (`privacyAudit.mjs`, Abbruch bei mehr als 0 Funden).
- Keine Rohausgaben von Tools, nur Fehlerauszüge (max. 800 Zeichen). Keine Dateiinhalte.
- Lokaler Ausgangskorb mit Modus 0700/0600; im Repo nichts.
- Personenbezogene Daten Dritter: nicht erfassen. Selbstaussagen des Owners nur mit Quelle `human`.
- Erfahrungstransfer überträgt **nie** Rechte, Identität oder Autorität (`transfer.mjs`, Tests).

## Rollback
Hooks aus der Agentenkonfiguration entfernen, Modus auf `shadow` setzen, offene `pending`-Kandidaten ablehnen. Der Ausgangskorb bleibt lokal und kann gelöscht werden. Der Kandidatenspeicher bleibt unverändert, weil nichts ohne Owner-Übernahme `promoted` wird.

## Was die Freigabe umfasst
Nur S0 → S1 nach bestandener Abnahme. Jede weitere Stufe ist eine eigene Entscheidung.
