# Datenschutzprüfung V0.2: Runway Characters (Arbeitspaket A4)

**Status:** `DRAFT`. Dies ist eine technische Bestandsaufnahme und **keine Rechtsberatung**. Die Prüfung durch
Datenschutzbeauftragte bzw. Rechtsberatung steht aus.
**Quellenstatus:** `SOURCE-BOUND` für die Runway-Dokumentation (2026-11-06); alles mit `UNVERIFIED` oder `UNKNOWN` wurde nicht
an einer Primärquelle (Datenschutzerklärung, AVV/DPA, Subprozessorliste von Runway) geprüft. Diese Dokumente
wurden in dieser Session **nicht** gelesen.
**Verfasst:** Claude Code, 2026-11-06, Europe/Berlin. Verantwortlich: Johannes Süß.

## 1. Datenflüsse (technisch, aus Code und SDK)

| Daten | Weg | Speicherung | Status |
| --- | --- | --- | --- |
| Mikrofon-Audio der Nutzerin / des Nutzers | Browser → WebRTC (LiveKit-Raum aus `consumeSession`) → Runway | bei Runway: Aufnahme (`recordingUrl`) | Fluss: SOURCE-VERIFIED (SDK); Speicherung: dokumentiert |
| Kamera | **nicht verwendet**; die Seite sendet `Permissions-Policy: camera=()` | — | technisch erzwungen (Browser) |
| Avatar-Video und -Audio | Runway → Browser | Aufnahme bei Runway | dokumentiert |
| Transkript | Runway erzeugt es; der Browser zeigt finale Einträge an | bei Runway (`transcript`) | dokumentiert |
| Session-Metadaten | lokaler Server: `.state/ledger.json`, `.state/audit.jsonl` | lokal; keine IP, kein Transkript, keine Schlüssel | SOURCE-VERIFIED + Test RW-10 |
| Runway-API-Key | nur Server-Umgebung | — | Test RW-10 |

## 2. Empfänger und Subprozessoren

| Empfänger | Rolle | Status |
| --- | --- | --- |
| Runway AI, Inc. (Runway Dev API) | Verarbeitung von Audio, Transkript, Aufnahme; Avatar-Rendering | Empfänger SOURCE-VERIFIED; Rolle (Auftragsverarbeiter?) **UNVERIFIED** |
| LiveKit (Transport; `consumeSession` liefert LiveKit-URL und Token) | Medientransport | Betreiber (Runway-eigen oder LiveKit Cloud) **UNKNOWN** |
| Runway-Modell- und Hosting-Subprozessoren | — | **UNKNOWN** (Subprozessorliste nicht gelesen) |
| In Variante B zusätzlich: STT-/TTS-Anbieter, Anthropic, LiveKit-Betreiber | — | siehe ADR-0004 |

## 3. Aufbewahrung und Löschung

| Punkt | Befund | Status |
| --- | --- | --- |
| Aufbewahrungsfrist für Transkripte und Aufnahmen bei Runway | in den gelesenen Dokumenten nicht angegeben | **UNKNOWN** |
| Download-URL der Aufnahme | läuft nach 24–48 h ab (die Aufnahme selbst nicht) | dokumentiert (SDK-Kommentar) |
| Löschmechanismus | `DELETE` Conversation „inklusive Transkript und Aufnahme“ (`avatarConversations.delete`) | dokumentiert, **nicht live getestet** |
| Löschung im Modul | `RUNWAY_DELETE_CONVERSATION_AFTER_END=true` löscht nach jedem Session-Ende (Standard: aus, weil irreversibel und ungetestet) | implementiert, nur gegen Mock getestet |
| Löschung in Backups, Trainingsnutzung der Daten | — | **UNKNOWN** |
| Lokale Daten | `.state/` enthält nur Metadaten; Löschung durch Entfernen des Verzeichnisses | SOURCE-VERIFIED |

## 4. Region und Drittlandtransfer

- Runway ist ein US-Unternehmen. Verarbeitungsregion und Rechenzentrumsstandort: **UNKNOWN**.
- Für die Übermittlung personenbezogener Daten in die USA (DSGVO Kap. V) zu prüfen: Zertifizierung nach EU-US Data Privacy
  Framework **oder** Standardvertragsklauseln samt Transfer Impact Assessment. Status: **UNVERIFIED**.

## 5. Rechtsgrundlagen und Verträge (zu klären)

1. Rechtsgrundlage nach Art. 6 DSGVO (für eine Demo voraussichtlich Einwilligung; Entscheidung offen).
2. Auftragsverarbeitungsvertrag (Art. 28) mit Runway; prüfen, ob Runway ihn für Runway Dev anbietet: **UNKNOWN**.
3. Stimme: Art. 9 greift, wenn Stimmaufnahmen zur eindeutigen Identifizierung verarbeitet werden (biometrische
   Daten). Bewertung offen.
4. Transparenz: Nutzer:innen müssen erkennen können, dass sie mit einer KI sprechen (Art. 50 KI-VO). Die Seite weist
   darauf hin. Der Inhalt dieses Hinweises ist **nicht** juristisch geprüft.
5. Datenschutz-Folgenabschätzung (Art. 35): bei systematischer Verarbeitung von Sprache und Video, insbesondere mit
   Minderjährigen, voraussichtlich erforderlich.

## 6. Minderjährige und Schule

- Art. 8 DSGVO, in Deutschland für Einwilligungen in Dienste der Informationsgesellschaft: unter 16 Jahren ist die
  Zustimmung der Sorgeberechtigten nötig.
- Im Schulkontext gelten zusätzlich die Landesschul- und Landesdatenschutzgesetze. Einwilligungen im
  Abhängigkeitsverhältnis Schule–Schüler:in sind problematisch. Die Prüfung ist offen.
- **Technische Sperre:** Die Kontexte `pilot:schule-in-der-hosentasche` und `audience:minors` geben im Policy-Gate
  standardmäßig `ESCALATE` zurück. Der Server legt dann keine Session an (Test RW-11).
- **Aus diesem Dokument folgt keine Freigabe für einen schulischen Piloten.**

## 7. Nächste zulässige Schritte

1. Datenschutzerklärung, Nutzungsbedingungen, AVV/DPA und Subprozessorliste von Runway beschaffen und den Inhalt
   mit Hash ablegen.
2. Aufbewahrungsfrist bei Runway schriftlich bestätigen lassen.
3. Löschung im isolierten Live-Test prüfen (Protokoll T6).
4. Datenschutzbeauftragte bzw. Rechtsberatung einbinden, bevor reale Dritte die Demo nutzen.
