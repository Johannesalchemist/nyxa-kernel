# Anbindung an die laufende Sophia-Runtime (vorbereitet, nicht deployt)

Live gelesen am 2026-11-27 auf Server B, nur lesend:

- Room-Server mit Realtime-Session, 11 Sophia-Tools, darunter `memory_recall` und `self_inspect`.
- Personenbezogener Room-Speicher: `memoryStore.json`, 4 Nutzer, Einträge als reine Strings.
- Der dortige „Heartbeat“ ist ein 5-Minuten-Watchdog. Er schreibt Statuszeilen ins Log und kürzt die Room-Historie; Reflexion findet dort nicht statt.
- Das governte NYXA-Gedächtnis ist laut der Runtime selbst `exists_not_connected`.

## Blocker (Sicherheit vor Funktion)

1. **Identität:** Die Room-Anmeldung erfolgt nur über den Namen. Die Runtime-Anweisungen selbst sagen: *„this name can be impersonated“*. Ein persönliches Entwicklungsmodell darf darüber **nicht** lesbar oder änderbar sein. Voraussetzung ist ein Human Passport bzw. Passkey (Human Gate) pro Person.
2. **Einwilligung:** Erfahrungen aus Room-Gesprächen dürfen erst nach Einwilligung in das Entwicklungsmodell fließen (F7).
3. **Deployment:** Die Room-Datei ist eine Produktionsdatei eines anderen Dienstnutzers. Sie wird nur über einen freigegebenen Deploy-Pfad geändert, nicht aus der Sitzung.

## Geplante minimale Änderung (nach Freigabe F9)

| Teil | Art | Wirkung |
|---|---|---|
| Realtime-Tool `evolution_view` | nur lesend | liefert Fragen, Möglichkeiten und nächste Schritte der authentifizierten Person; ohne Passkey-Sitzung `identity_insufficient` |
| Realtime-Tool `evolution_note` | nur nach `Tool Call` | legt eine Selbstaussage der Person als Kandidat (`scope: personal`) im bestehenden Speicher ab |
| Heartbeat | Erweiterung des Watchdog-Intervalls | ruft `heartbeatTick()` auf; Ergebnis landet nur im Log bzw. als vorbereiteter Vorschlag, ohne Außenwirkung |
| UI | `ui/evolution-view.html` im Room-Client und im PA | Daten nur vom Host nach starker Anmeldung; Korrigieren und Widersprechen an jedem Eintrag |

Sophias Identität und Stimme bleiben unverändert. Es entsteht kein zweiter Agent und kein zweiter Speicher.
