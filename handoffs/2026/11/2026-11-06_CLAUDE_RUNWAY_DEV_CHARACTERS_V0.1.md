# HANDOFF: Runway Dev Characters, Minimalintegration V0.1

**Datum:** 2026-11-06 (UTC)
**Verantwortlicher Mensch:** Johannes Süß
**Erzeugendes System:** Claude Code (Anthropic), Cloud-Session
**Repository / Branch:** `Johannesalchemist/nyxa-kernel` / `claude/runway-dev-setup-c53ss0`
**Status:** `DRAFT`, `PENDING REVIEW`
**Quellenstatus:** `SOURCE-BOUND` (Runway-Dev-Dokumentation vom 2026-11-06; Einzelnachweise in `modules/runway-dev-characters/MODULE.md`)

## 1. Auftrag

„Hilf mir, die passenden Runway-Dev-Tools zu wählen und loszulegen“, ausgeführt nach https://dev.runway.com/quickstart.txt. Auf Rückfrage hat der Nutzer die Oberfläche **Characters** gewählt. Zum Ablageort hat er keine Präferenz angegeben, daher liegt das Modul als eigenständiges `modules/`-Gerüst vor.

## 2. Ergebnis

- Runway-Dev-Plugin für Claude Code installiert (`runway-api@claude-plugins-official`, Nutzerscope der Session, nicht im Repository).
- Neues Modul `modules/runway-dev-characters/`: Express-Server erzeugt die Realtime-Sessions serverseitig, der Browser verbindet sich über `@runwayml/avatars`.
- Prüfungen: `npm run check` ✓, `npm test` (5/5) ✓, `npm run build` ✓, Smoke-Test des Servers ohne Key ✓ (lehnt korrekt mit 500 bzw. 400 ab).
- **Nicht durchgeführt:** Live-Session. Sie ist kostenpflichtig, und in der Session lag kein API-Key vor. Runway-Dev-MCP-Login: nicht durchgeführt, optional.

## 3. Dateiliste mit SHA-256

| Datei | SHA-256 |
| --- | --- |
| `modules/runway-dev-characters/.env.example` | `960f8f2eb6d9368665a85cf11f709c0021d70a4a9a52fdcf4b982fc9a61580d3` |
| `modules/runway-dev-characters/MODULE.md` | `e4d7d82750c9130861a87c37b9821c57118d2521318407cf3a3a26ebe2747544` |
| `modules/runway-dev-characters/README.md` | `50b884a55ce742b9753aab38a3d085615f83931036c67ce536767e3d8d515fa0` |
| `modules/runway-dev-characters/package-lock.json` | `728d2b5a2d63f5c6e37639f9e276c11f6f46cb0542e5603f1f2ac91cacac572c` |
| `modules/runway-dev-characters/package.json` | `5b62c24a5938193170bc748147b614b1280f577b0c7b25b512894a07ee9d3652` |
| `modules/runway-dev-characters/server.ts` | `d9a899c50b56e8c42c57dfde2ff16060547c3b3c2d7495ac142f027eaff4608d` |
| `modules/runway-dev-characters/src/session.ts` | `4591c7e084c4abf8fb7dbb744a041cfacfdb6c9a8c450813531693bc8a2f1dd6` |
| `modules/runway-dev-characters/test/session.test.ts` | `d106693bd4d10e1abd1c24402144b340e976b1f395b946e2cea7c7525d057de3` |
| `modules/runway-dev-characters/tsconfig.json` | `e4900a5dca356c160fe61a9f196192918e38c2fc436a8c1ee5c034e3e3d42e1d` |
| `modules/runway-dev-characters/vite.config.ts` | `e5adbb8939ad5efe74e86688c642fe476fa3198f43f3eda8048d3e6db9d2d5d1` |
| `modules/runway-dev-characters/web/index.html` | `201ac1b1359b3fc2b619843a407896e11849c851ea287d74123b33634c2e854b` |
| `modules/runway-dev-characters/web/main.ts` | `b3f2a0c3aaab9538a559f0f7a488f77f776eee85275a0d4f3116d685ef3238ae` |
| `modules/runway-dev-characters/web/styles.css` | `9a2bc67743ca9da21378f0961cda4a72eb26ba506757068aa36bfa9b7ae68ab8` |

## 4. Offene Blocker

1. **Ablageort nicht entschieden.** Der Code liegt im Kernel-Repository unter `modules/`. Nach Repository Policy §2 gehört operativer Code womöglich in `nyxa-kernel-runtime`. Dazu ist ein ADR nötig.
2. **Branchpräfix.** Die Session hat `claude/` vorgegeben. Dieses Präfix steht nicht in der Liste von AGENTS.md.
3. **Datenschutz.** Gespräche und Transkripte werden bei Runway verarbeitet. Vor einem Einsatz mit realen Personen, insbesondere Minderjährigen im Pilot, ist eine Prüfung nötig.
4. **Pilot nicht autorisiert.** Dieses Modul ist kein Bestandteil von `Schule in der Hosentasche`.

## 5. Nächster zulässiger Schritt

Review des Moduls, danach ein lokaler Live-Test durch einen Menschen mit eigenem `RUNWAYML_API_SECRET` (`.env`, nie committen). Anschließend ein ADR zu Ablageort und Einsatzzweck.
