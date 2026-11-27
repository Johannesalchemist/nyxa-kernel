# Admin Bundle Executor (R10-Kandidat)

Eng begrenzte administrative Ausführung über die **bestehende** Human-Authority-Architektur. Keine Root-Shell, kein sudo,
keine neue Authority, kein eigener Timer.

## Ablauf
1. Ein Agent oder jo legt `<name>.sh` und `<name>.json {"display": "..."}` in `/var/lib/nyxa-admin/inbox/` (Gruppe `nyxa-admin-submit`).
2. Eine systemd-Path-Unit (root) staged das Bündel content-adressiert als `/var/lib/nyxa-admin/bundles/<sha256>.sh`
   (root, 0600) und übergibt eine Veröffentlichungsanfrage an den bestehenden Publisher-Worker (Lifecycle-Inbox).
3. Der Publisher (Portal-Identität) schreibt die Gate-Binding `nyxa-admin-bundle-v1/binding.json`:
   action `nyxa_admin_bundle_apply`, target `host:<hostname>`, artifact = Bündel-SHA, TTL 300 s, max_executions 1.
   Der Anzeigetext wird dort gebaut (bereinigt, voller SHA) und nie wörtlich übernommen.
4. Johannes bestätigt im Portal per Passkey **genau diesen SHA**. Der Gate signiert die Grant (Ed25519).
5. Eine Path-Unit (root) auf `authority-grants/issued` startet `admin_runner.py apply`:
   Grant prüfen (Schema, Issuer, Principal, Origin, UV, Aktion, Ziel, Artefakt, Transaktions-Digest, Zeitfenster, Signatur),
   Subjekt prüfen (exakt das signierte Angebot inkl. proposal_id; vom Gate je Grant persistiert), Bündel prüfen (root-eigen, nicht g/w-beschreibbar, nlink 1, SHA), O_EXCL-Ledger (grant_id **und** nonce),
   dann `--apply` → `--verify`; bei Fehlern `--rollback`; Timeout je Schritt; leere Umgebung.
6. Für jeden Versuch wird eine Quittung nach `/var/lib/nyxa-admin/receipts/` geschrieben (für jo lesbar).

## Bedrohungsmodell
| Angreifer | Ergebnis |
|---|---|
| Agent schreibt Bündel | Nur Vorschlag; ohne Passkey keine Ausführung |
| Agent schreibt eine Anfrage direkt in die Lifecycle-Inbox | Nur bereits von root gestagte Bündel; Anzeige wird neu gebaut; Passkey nötig |
| Portal-Identität (993) kompromittiert, Binding umgeschrieben | Grant-Digest passt nicht → DENIED; der Gate-Schlüssel bleibt beim Gate |
| Replay derselben Grant | Ledger O_EXCL → DENIED |
| Bündel nach Freigabe getauscht | SHA-Abgleich → DENIED |
| Grant für eine Frame- oder andere Aktion | action/target/artifact → DENIED |
| Bündel hängt | Timeout (rc 124) → Rollback |

Restrisiko: Der Inhalt des Bündels ist so mächtig, wie Johannes ihn freigibt. Die Grenze ist die menschliche Prüfung
des SHA und des Inhalts (`/var/lib/nyxa-admin/bundles/<sha>.sh` ist für jo lesbar, Gruppe `nyxa-admin-submit`, 0640 nach Staging).
Es gibt immer nur eine offene Admin-Freigabe (eine Binding je Operation).

## Tests
`python3 -m unittest test_admin_executor test_admin_pipeline` (10 Tests): einmalige Ausführung und Replay-Ablehnung,
Rollback, Tausch nach Freigabe, Fälschung/Scope/Zeit/Principal, Timeout, Staging→Publisher→Binding, Ablehnung nicht gestagter Bündel.
