# ADR-0003: Sophia Unified Room und Governed Task Queue

**Status:** `PROPOSED`
**Datum:** 2026-11-07 (Europe/Berlin)
**Entscheider:** Johannes Süß
**Erzeugt durch:** Claude Code (Anthropic), auf Basis des Implementation Handoffs „NYXA Unified Room · Sophia CEO · Ari/GPT · Claude · Mail · Scheduled Tasks“ vom 07.11.2026
**Quellenstatus:** `SOURCE-BOUND` · **Reviewstatus:** `PENDING INDEPENDENT REVIEW`
**Vorgänger:** ADR-0001, ADR-0002

## Kontext

Auf Server B (`/opt/thechat`) existieren getrennte Kontextwege für Text-Room und OpenAI-Realtime, eine Room-History im Prozessspeicher, eine einfache JSON-Datei-Queue (`apps/console/api/bbs-v2/services/task-queue.js`, ohne atomaren Claim, Lease, Approval oder Idempotenz), ein Temporal-Director-Workflow (`apps/temporal/workflows/director.js`, Temporal-Port 7233 am 2026-11-07 nicht lauschend) und mehrere nicht authentifizierte Room-Endpunkte. Die Belege stehen im Handoff `handoffs/2026/11/2026-11-07_CLAUDE_SOPHIA_UNIFIED_ROOM_HANDOFF.md`.

## Entscheidung (vorgeschlagen)

1. **Sophia ist keine zweite CEO-Instanz.** Sophia ist die menschliche Gesprächsschnittstelle (agent principal) und reicht Aufträge im Namen eines verifizierten Menschen ein. Klassifikation und Routing dürfen den vorhandenen Director wiederverwenden, sobald Temporal nachweislich läuft. Bis dahin klassifiziert Sophia selbst und reicht in die Queue ein.
2. **Eine Auftragswahrheit:** die Governed Task Queue aus `modules/sophia-unified-room` (SQLite, Zustandsautomat aus dem Handoff). Die BBS-JSON-Queue wird nicht erweitert, sondern bleibt für ihre bestehenden Tool-Aufträge bis zur Migration lesbar. Eine zweite parallele Queue für neue Agentenaufträge wird nicht eingeführt.
3. **n8n ist Taktgeber, nicht Autorität.** n8n oder systemd ruft den Worker periodisch auf. Fälligkeit (Europe/Berlin) und Freigabe entscheidet ausschließlich die Queue.
4. **Ein Conversation Bus** ist die serverseitige Quelle für Text, Sprache, Agenten und Mail und ersetzt `roomHistory` schrittweise.
5. **Executor sind tool-los.** Folgeaktionen entstehen nur als neue, freigabepflichtige Aufträge.
6. **Mailversand** läuft ausschließlich über `mail.send_approved` mit menschlichem Einzel-Approval und Payload-Hash. Dafür gibt es kein Mandat.

## Nichtentscheidung

- Integration in `apps/console/api/server.js` und `room.html`, Anlage eines n8n-Workflows und P0-Patches: **nicht entschieden, nicht ausgeführt.**
- Ein Wechsel auf Postgres (Supabase auf Server B) bei Mehr-Host-Betrieb ist offen.
- Die Anbindung von α/β/γ, D1–D7, I0–I3, E0 und Capability Gate ist offen, weil deren Schnittstellen nicht verifiziert sind.
- Ziel-Repository für den Laufzeitcode (`thechat` oder `nyxa-kernel-runtime`): offen. Bis dahin liegt die Referenzimplementierung als Modulvertrag unter `modules/`.

## Konsequenzen

Positiv: Freigaben, Widerruf, Replay-Schutz und Budget lassen sich technisch erzwingen und testen. Es gibt einen Kontext für alle Kanäle und eine korrelierbare Audit-Spur.
Kosten: Migration von `roomHistory`, Token-Mitgabe in `room.html`, Service-Tokens für Sophia und die Worker sowie die Pflege der Approver-Policy.
