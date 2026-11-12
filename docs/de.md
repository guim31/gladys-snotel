# SNOTEL

Bringt die **Schneedecke der SNOTEL-Stationen** nach Gladys: rund 900 automatische
Bergstationen des Natural Resources Conservation Service (NRCS) des USDA im Westen der USA und
in Alaska. Schneehöhe, Schneewasseräquivalent, der Schnee der letzten 24 Stunden und die
Lufttemperatur, stündlich, über die öffentliche AWDB-API des NRCS. Kein Konto, kein Schlüssel.

> **Vorläufige Stundenwerte, keine Lawinen- oder Hochwasserwarnung.** SNOTEL-Daten sind rohe
> Sensorwerte, die der NRCS später prüft; sie können verspätet sein, fehlen oder falsch sein,
> und die Integration hängt von deinem Gladys, deinem Internetzugang und einem öffentlichen
> Dienst ab. Lies vor einer Skitour den Lagebericht deines Lawinenwarndienstes. Diese
> Integration ist nicht mit dem USDA oder dem NRCS verbunden.

## Was du bekommst

- **Ein Gerät pro verfolgter Station**, mit dem, was die Station misst: die **Schneehöhe**, das
  **Schneewasseräquivalent** (das Wasser, das die Schneedecke beim Schmelzen ergäbe), dieses
  Wasser als **Prozent des Medians** des Datums (1991-2020), wenn der NRCS einen hat, den
  **Neuschnee der letzten 24 Stunden**, die **Lufttemperatur** und das Datum der letzten
  Messung.
- Einheiten nach Wahl: cm, mm und °C, oder Zoll und °F wie beim NRCS.
- Eine Station, die nichts mehr sendet, wird als solche angezeigt („Keine neue Messung
  seit…“): Ein alter Wert wird nie wieder wie ein frischer gesendet.
- Ein **Dashboard-Widget**: deine Stationen mit Schneehöhe und Neuschnee, oder die Details einer
  Station.
- Eine Schaltfläche **„Stationen suchen“**, die die Stationen eines Bundesstaats, nach Name oder
  Nummer, oder rund um dein Haus auflistet, mit Triplet, Höhe und Entfernung.
- Szenen nutzen die Funktionen direkt: „Neuschnee über 20 cm“ ist ein Pulvertag.

## Voraussetzungen

- Gladys Assistant **5.1.0** oder neuer.
- Internetzugang von Gladys aus: Die Integration liest `wcc.sc.egov.usda.gov`.
- Für „Rund um mein Haus“: der Standort deines Hauses in Gladys (Einstellungen, Häuser). Die
  Integration fragt bei der Installation danach (Berechtigung „location“). Er dient nur im
  Container dazu, die nächsten Stationen zu finden: nie an den NRCS gesendet, nie gespeichert
  oder protokolliert.
- SNOTEL deckt die Berge im Westen der USA und Alaska ab. Eine Station eines anderen NRCS-Netzes
  (SCAN, SNOLITE…) kann per Triplet verfolgt werden: Du bekommst, was sie misst.

## Konfiguration

### Einstellungen

| Einstellung                | Was sie bewirkt                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Stationen                  | Triplets (`1050:CA:SNTL`), Nummern (`766`), Adressen von NRCS-Seiten oder Namen, durch Kommas getrennt. |
| Rund um mein Haus          | Verfolgt auch die 3 nächsten SNOTEL-Stationen im Umkreis von 50, 100 oder 200 km um dein Haus.          |
| Einheiten                  | Metrisch (cm, mm, °C) oder imperial (Zoll, °F) für neue Geräte.                                         |
| Sprache der Funktionsnamen | Namen der Funktionen neuer Geräte und Sprache ihrer Texte.                                              |

Höchstens 20 Stationen werden aus den Einstellungen verfolgt. Speichere, öffne dann den Tab
**Entdecken** und lege die gewünschten Geräte an: Eine Station, deren Gerät existiert, bleibt
verfolgt, auch wenn du sie aus den Einstellungen entfernst. Das Löschen des Geräts beendet die
Verfolgung.

Ein Gerät behält die Einheiten und Namen seiner Anlage. Nach einer Änderung der Einheiten bietet
der Tab Entdecken an, das Gerät zu **aktualisieren**; bis dahin bleiben seine Werte in den alten
Einheiten.

### Deine Stationen finden

Die Schaltfläche **„Stationen suchen“** der Konfiguration listet bis zu 15 Stationen mit
Triplet, Bundesstaat, Höhe in Fuß und Metern und, wenn dein Haus einen Standort hat, ihrer
Entfernung auf:

- wähle einen **Bundesstaat**, um seine Stationen aufzulisten (die nächsten zuerst, sonst
  alphabetisch);
- gib einen **Namen** (Snowbird), ein County, eine Stations**nummer** (1050) oder ein
  **Triplet** ein;
- lass alles leer, um die Stationen rund um dein Haus aufzulisten.

Kopiere die Triplets in „Stationen“ und speichere.

## Geräte

| Funktion                    | Typ in Gladys              | Einheit      | Hinweise                                                   |
| --------------------------- | -------------------------- | ------------ | ---------------------------------------------------------- |
| Schneehöhe                  | Füllstandssensor (Tiefe)   | cm oder Zoll | Ultraschallsensor, stündlich.                              |
| Neuschnee (24 h)            | Füllstandssensor (Tiefe)   | cm oder Zoll | In 24 Stunden gewonnene Höhe, siehe unten.                 |
| Schneewasseräquivalent      | Füllstandssensor (Tiefe)   | mm oder Zoll | Schneekissen, stündlich.                                   |
| Schneewasser, % des Medians | Füllstandssensor (Prozent) | %            | Tageswert von gestern gegenüber dem Median des Datums.     |
| Lufttemperatur              | Temperatursensor           | °C oder °F   | Beobachtete Temperatur, stündlich.                         |
| Letzte Messung              | Text                       |              | Datum der letzten Messung oder „Keine neue Messung seit…“. |

Eine Funktion gibt es nur, wenn die Station sie misst. **Neuschnee** ist die aktuelle
Schneehöhe minus der geringsten Höhe der 24 Stunden davor (jede Stunde mit ihren Nachbarn
geglättet, damit ein Ausreißer des Sensors nicht zählt): Neuschnee setzt sich, es ist also eine
Untergrenze dessen, was gefallen ist. Das Prozent des Medians gibt es nur, wenn der NRCS einen
Median für die Station veröffentlicht: Junge Stationen, vor allem in Alaska, haben keinen. Zu
Saisonbeginn ergibt ein kleiner Median große Prozentwerte.

Die Werte werden im Container stündlich aktualisiert (die Stationen senden stündlich, manchmal
gebündelt alle paar Stunden). Nach 12 Stunden ohne neue Messung bleiben die Werte stehen, und
„Letzte Messung“ sagt, seit wann.

## Dashboard-Widget

Füge das Widget **SNOTEL-Schneedecke** einem Dashboard hinzu:

- ohne Einstellung listet es deine Stationen auf (höchstens 10): Schneehöhe und Neuschnee der
  24 Stunden; eine Zeile wird blau mit einem Schneesymbol, wenn Schnee gefallen ist;
- mit einer gewählten Station zeigt es ihre Kacheln für Schneehöhe, Neuschnee und
  Schneewasseräquivalent, dann das Prozent des Medians, die Lufttemperatur und die letzte
  Messung.

Die Namen sind die, die du den Geräten in Gladys gegeben hast.

## Szenenbeispiele

- **Pulveralarm**: Auslöser „ein Gerätewert ändert sich“, Funktion „Neuschnee (24 h)“ deiner
  Lieblingsstation, über 20 (cm): Schick dir um 6 Uhr eine Nachricht.
- **Schneedecke unter dem Normalwert**: Funktion „Schneewasser, % des Medians“ unter 70: eine
  Nachricht, um das Wasser des Sommers zu planen.
- **Frost am Ausgangspunkt**: Funktion „Lufttemperatur“ unter -15 °C.

## Datenquellen, Lizenz und Kontingente

- Daten: das SNOTEL-Netz des **Natural Resources Conservation Service des USDA**, gelesen über
  die öffentliche **AWDB-REST-API** (`wcc.sc.egov.usda.gov/awdbRestApi`). Daten der
  US-Regierung, gemeinfrei. Die Stundenwerte sind vorläufig; der NRCS prüft sie später.
- Anfragen: höchstens drei pro Stunde für alle deine Stationen zusammen (Stundenwerte; alle 6
  Stunden die Tageswerte und Mediane; einmal am Tag die Metadaten der Stationen), dazu die
  Stationsliste, einmal pro Woche, wenn du Stationen per Name oder rund um dein Haus verfolgst.
  Die API hat kein veröffentlichtes Kontingent, aber ihre Firewall lehnt Anfrageserien ab (HTTP
  403): Die Integration versucht es dann einfach zur nächsten Stunde erneut.
- Gegen die echte API getestet am 12. November 2026 (Stationen in Kalifornien, Colorado, Utah,
  Washington und Alaska, eine Station ohne Schneesensor und ein unbekanntes Triplet).

## Fehlerbehebung

- **„Unbekannte Station“**: Prüfe das Triplet mit „Stationen suchen“; eine inaktive Station
  steht nicht in der SNOTEL-Liste.
- **„Der Dienst des NRCS (AWDB) antwortet nicht“**: Die API ist ausgefallen oder lehnt Anfragen
  eine Weile ab; die Messwerte kommen von selbst zurück.
- **Keine Schneehöhe an einem Gerät**: Der Sensor der Station sendet nichts (im Sommer oder
  defekt); die anderen Werte kommen weiter.
- **Kein Prozent des Medians**: Der NRCS hat keinen Median für diese Station oder dieses Datum.
- **Protokolle**: Setze `LOG_LEVEL=debug`, um jede Aktualisierung zu sehen. Auf der
  Standardstufe werden nur der Start, verstummende oder zurückkehrende Stationen und Fehler
  protokolliert.

## Grenzen

- Rohe, vorläufige Daten: keine Lawinen-, Hochwasser- oder Wetterwarnung.
- Neuschnee wird aus der Schneehöhe berechnet, nicht gemessen: Setzung, Wind und Sensorrauschen
  machen ihn ungenau.
- Diese Integration ist nicht mit dem USDA oder dem NRCS verbunden. SNOTEL ist ein Programm des
  NRCS des USDA.
