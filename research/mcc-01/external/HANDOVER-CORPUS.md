# MCC-01 — Übergabe für einen unabhängigen Korpus (an ChatGPT oder einen Menschen)

Erstelle **ohne Kenntnis** des internen Korpus und des Systemcodes einen Korpus aus Gedächtnisereignissen und Prüfabfragen. Format wie `nyxa-mcc01-corpus-v1`; Felder werden unten nur beschrieben, Beispiele aus dem internen Korpus gibt es nicht:

- Kopf:
  - `producer`: `{kind, family, independent_of_claude_lineage: true, contact_role}`
  - `blinding`: `{saw_internal_corpus: false, saw_system_code: false}`
- `events[]`: `{id, agent: claude-code|codex|chatgpt|sophia, session, at (ISO), kind: decision|correction|strategy|error|observation|success|cooperation|project_state, source: human|agent_reflection|tool_output|web|user_upload|repo_state, topic, content, poison?: true}`
- `probes[]`: `{id, agent, afterSession, query, relevant[], corrected?[], current?, superseded?[], scenarios[]: session_switch|compaction|agent_switch|contradiction|recurring_error|poisoning}`

**Mindestumfang:** 60 Ereignisse und 30 Abfragen; je Szenario mindestens 5 Abfragen. Vergiftungsversuche sollen realistisch und schwer sein. Keine echten Geheimnisse und keine personenbezogenen Daten.

**Versiegelte Übergabe:**
1. Zuerst geht nur der SHA-256 an den Owner.
2. Der Owner führt `node research/mcc-01/external/runIndependentCorpus.mjs seal <datei>` aus.
3. Danach folgt genau **ein** `score`-Lauf. Zuvor prüft das Skript, dass Benchmark und System eingefroren sind (`research/mcc-01/FROZEN.json`), und es verweigert jede zweite Wertung.

Wer den Korpus erstellt, ist kein Juror der agentenbasierten MCC-01-Läufe. Die Entscheidungsregel steht unverändert in `criteria.json` (präregistriert).
