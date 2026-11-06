# ADR-0003: Ablage der Runway-Characters-Integration (Kernel vs. Runtime)

**Status:** `PROPOSED`
**Datum:** 2026-11-06 (Europe/Berlin)
**Entscheider:** Johannes Süß
**Verfasst von:** Claude Code (Anthropic), Cloud-Session, im Auftrag von Johannes Süß
**Quellenstatus:** `SOURCE-BOUND` (Repository-Stand `nyxa-kernel` `cd6f15b` + Branch `claude/runway-dev-setup-c53ss0` `4179d96`; `nyxa-kernel-runtime` `a50e376`)
**Reviewstatus:** `PENDING INDEPENDENT REVIEW`
**Vorgänger:** Handoff `handoffs/2026/11/2026-11-06_CLAUDE_RUNWAY_DEV_CHARACTERS_V0.1.md`, offener Blocker 1

## Kontext

V0.1 und V0.2 der Runway-Characters-Integration liegen als ausführbarer Node-Server unter
`modules/runway-dev-characters/` im Kernel-Repository. Dagegen sprechen:

- ADR-0001, Alternativen: „produktive Runtime-Repositories als Sammelstelle“ wurde verworfen. Umgekehrt
  soll das Kernel-Repository keine Betriebssoftware sammeln.
- Repository Policy §2: `modules/` enthält „konkrete produktive Module samt epistemischem Vertrag“, `runtime/`
  nur Referenzen. README: `modules/` = „wissenschaftliche und operative **Verträge**“.
- ADR-0002 legt ausführbare Governance bereits in `nyxa-kernel-runtime` ab (Kernel = Entscheidung, Runtime =
  Implementierung).

Technische Unterschiede (verifiziert am Quelltext):

| Merkmal | Modul (V0.2) | `nyxa-kernel-runtime` (`a50e376`) |
| --- | --- | --- |
| Modulsystem | ESM (`"type": "module"`) | CommonJS |
| Tests | `node:test` | `vitest` |
| Node | ≥ 22.9 | CI: Node 20 |
| Struktur | eigenes `package.json` | Root-Paket + `apps/temporal/nyxa-worker` mit eigenem `package.json` |

## Entscheidung (Vorschlag)

1. **Ausführbarer Code** (Server, Client, Tests, `package.json`, Lockfile) gehört nach
   `Johannesalchemist/nyxa-kernel-runtime` unter `apps/runway-characters/`, analog zu `apps/temporal/nyxa-worker`
   mit eigenem `package.json` und eigenem CI-Job (eigene Node-Version, keine Änderung am bestehenden Root-Job).
2. **Im Kernel verbleiben:** `modules/runway-dev-characters/MODULE.md` (epistemischer Vertrag, Status, Grenzen),
   Datenschutz-Dokument, Live-Testprotokoll, Verifikationsbericht, Evidence-Manifeste, ADRs und Handoffs.
   `MODULE.md` verweist dann auf Runtime-Pfad **und** Commit-SHA.
3. **Eine Versionswahrheit:** Der Umzug erfolgt in genau einem Schritt (Runtime-PR mit dem Code, danach
   Kernel-PR, das den Code entfernt und den Verweis setzt). Bis dahin existiert der Code **nur** auf dem
   Arbeitsbranch `agent/runway-characters-v0.2` und wird **nicht** nach `main` gemergt.
4. Der Policy-Gate-Adapter (`src/policy.ts`) wird nach dem Umzug durch einen direkten Import des kanonischen
   Runtime-Gates ersetzt (siehe ADR-0004, Gate-Integration), statt eine zweite Policy-Quelle zu bilden.

## Nichtentscheidung

- Kein Deployment, kein Pilotbetrieb, keine Freigabe für `Schule in der Hosentasche`.
- Keine Entscheidung über die Sophia-Integrationsvariante (siehe ADR-0004).

## Konsequenzen

- Positiv: Trennung Governance/Betrieb wie in ADR-0001/0002; Runtime-CI prüft den Code; Kernel bleibt frei
  von `node_modules`-Lockfiles produktiver Software.
- Kosten: zwei PRs statt einem; Runtime braucht einen zweiten CI-Job; bis zur Umsetzung bleibt der Code auf
  einem Branch „geparkt“.

## Offene Punkte

- Zustimmung von Johannes Süß.
- Schreibzugriff dieser Session auf `nyxa-kernel-runtime` liegt nicht vor (nur anonymes Lesen); der Umzug ist
  vorbereitet, nicht ausgeführt.

## Nächster zulässiger Schritt

Entscheidung über diesen Vorschlag. Danach Runtime-PR (Draft) mit unverändertem V0.2-Code und Hashmanifest.
