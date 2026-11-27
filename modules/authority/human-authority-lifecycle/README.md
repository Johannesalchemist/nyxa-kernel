# One-Click Human Authority — Lifecycle (Erweiterung von Authority V2)

| Feld | Wert |
|---|---|
| Verantwortlicher Mensch | Johannes Süß |
| Erzeugendes System | Claude Code, Cloud-Session |
| Datum | 2026-11-27, Europe/Berlin |
| Status | `IMPLEMENTED` · auf Server B gegen den **echten** V2-Issuer getestet · Release V2.1 gebaut · **nicht installiert** (root-Installation M11, Vorbedingung WP-A1) · **nicht GREEN** |

## Ursachen der Fehlerhistorie (live geprüft)
| # | Befund | Ursache |
|---|---|---|
| 1 | `human_authority_token_not_configured` | `nyxa_mandate_issue` **ohne** `issuer_grant_id` fällt auf den Token-Pfad zurück; der Grant-Pfad (`issueFrame`) ist vorhanden, brauchte aber die Grant-ID |
| 2 | Publisher verlangt Benutzerwechsel | `framePublisher.py` muss als Portal-Dienstkonto laufen; kein automatischer Auslöser |
| 4–6 | Bestätigung ohne Mandat | V1-Binding mit TTL 300 s; nichts löste den bestätigten Grant serverseitig ein. Mandatsregister: kein aktives Mandat. Ob ein Grant entstand, ist nicht prüfbar (Issuer-Audit nur für das Portal-Dienstkonto lesbar) → `unverified` |

## Lösung (ohne parallele Authority)
1. **`discover_patch.py`:** Ein Issuer-IPC-Modus `discover`, **nur lesend**. Er gibt die Grant-ID nur zurück, wenn genau ein ausgestellter, nicht eingelöster Grant existiert, dessen gepinnte Frame-Transaktion die `proposal_id` des Antrags trägt und dessen Signatur und Claims verifizieren. Die Einlösung bleibt der unveränderte Einmal-Pfad.
2. **`lifecycle.mjs`:** Persistenter Zustandsautomat REQUESTED → PENDING → APPROVED → CLAIMING → ACTIVE → COMPLETED sowie EXPIRED, REVOKED, DENIED und FAILED.
   - Atomare Zustandsdateien und ein Journal mit fsync.
   - Stale-Lock nach Absturz wird freigegeben.
   - Absturz nach der Ausstellung: Das Mandat wird aus dem Journal wiederhergestellt.
   - Absturz nach dem Claim, vor der Ausstellung: Der Grant gilt als verbraucht, es folgt `FAILED`. Ein zweites Mandat entsteht nie.
3. **`publish_worker.py`:** Läuft als Portal-Dienstkonto per systemd-Path-Unit und ruft das vorhandene `framePublisher.publish()` auf. Es veröffentlicht nur einen Antrag zur menschlichen Bestätigung; Autorität entsteht dabei nicht.
4. **`runtime_patch.py`:** Tools `nyxa_authority_request` (Akteur **nur** aus der Prozessbindung `NYXA_DEVELOPMENT_ACTOR`) und `nyxa_authority_status`. Der Tick läuft im vorhandenen Backend-Prozess; es gibt keinen eigenen Timer.

## Tests
| Ort | Umfang | Ergebnis |
|---|---|---|
| lokal | Lifecycle: automatische Übernahme, Neustart, doppelte Zustellung, Absturz an beiden Stellen, falscher Akteur, abgelaufener Grant, Mehrdeutigkeit, Antragsablauf, Widerruf, fehlende Freigabe ohne Mutation, Pfad-Traversal | 5/5 |
| Server B, echter V2-Issuer mit echtem Unix-Socket und Claim-Store | gesamte vorhandene Issuer-Suite (inkl. sprachübergreifendem IPC mit echten NYXA-Stores und Replay) + Frame-Tests + Discover (nur lesend, Einmal-Claim, Replay, Drift, Ablauf, Shape und Route) | **26/26** |
| Server B | V2.1-Build aus den produktiven Eingaben (Baseline-Hashes OK) + beide Patches; `node --check` und `py_compile` | OK |

**Nicht getestet:** die produktive Kette mit echtem Passkey, echter Schreiboperation und echtem Scope-DENY. Das ist die Live-Abnahme nach der Installation.
