# Fahrplan Buchhaltungstool „kleiner Pedant" (Kern, ohne Projekteinbindung)

Stand August 2026. Diese Version deckt den Kern ab. Projekteinbindung und Fortschrittstracking sind bewusst draußen und kommen als eigener Fahrplan später.

Einbindung in die App: später über `client/src/views/intern` (interner Bereich).

---

## 1. Ausgangslage

Wer das baut. Ein Ingenieur, der aktuell vier Tage die Woche für einen Klienten (Kohns) arbeitet und einen Tag die Woche in den eigenen Aufbau steckt. Ziel ist die Gründung einer UG haftungsbeschränkt im Januar 2027, ausgerichtet auf Ingenieur und Planungsberatung für Kommunen und öffentliche Auftraggeber in Rheinland Pfalz, Baden Württemberg, Saarland und perspektivisch Hessen.

Warum überhaupt selbst bauen. Drei Gründe tragen das.

Erstens die Kosten. lexoffice oder sevdesk laufen dauerhaft als Abo, ein Eigenbau kostet einmalig Zeit statt fortlaufend Geld, und in der Startphase der UG zählt jeder Euro Fixkosten.

Erstens Punkt zwei, die Kontrolle. Ein Eigenbau kennt von Anfang an die eigene Zielgruppe. Leitweg IDs für Kommunen, XRechnung als Standardfall statt Sonderfunktion, spätere Verzahnung mit Projektdaten, all das muss bei fertiger Software mühsam nachgerüstet oder freigekauft werden, im Eigenbau ist es von Tag eins Kernlogik.

Drittens die Passung fürs eigene Arbeiten. Buchhaltung ist für ADHS typische Verwaltungsarbeit, die leicht liegen bleibt. Ein Tool, das genau auf den eigenen Workflow zugeschnitten ist, mit wenig Reibung beim täglichen Erfassen, senkt die Hürde spürbar. Fertige Software ist für den Durchschnittsnutzer gebaut, nicht für diesen Fall.

Übergeordnetes Ziel des ersten Geschäftsjahres. Kostendeckend werden. Das heißt konkret, der administrative Aufwand für Buchhaltung muss so klein sein, dass er neben dem eigentlichen Ingenieurgeschäft nicht zur Last wird, und gleichzeitig muss jederzeit ein klares Bild bestehen, wie viel Geld tatsächlich da ist, wie viel unterwegs ist und wie viel noch aussteht.

---

## 2. Ziele des Tools

Das Tool soll fünf Dinge leisten, mehr nicht, mehr wäre Ballast.

Belege erfassen. Vom Foto des Kassenbons bis zur digitalen Eingangsrechnung, mit möglichst wenig manueller Tipparbeit.

Rechnungen stellen. Inklusive rechtssicherer XRechnung für Kommunen und Land, mit Leitweg ID Verwaltung pro Auftraggeber.

Geldflüsse zeigen. Was ist bezahlt, was ist gestellt aber offen, was ist absehbar aber noch nicht abgerechnet.

GoBD konform bleiben. Unveränderbar, vollständig, nachvollziehbar, ohne dass das im Alltag spürbar wird.

Dem Steuerberater sauber übergeben. Per DATEV Export, ohne dass am Jahresende eine manuelle Nacharbeit von Wochen ansteht.

---

## 3. Was das Tool bewusst nicht macht

Grenzen zu ziehen ist genauso wichtig wie Funktionen zu bauen, sonst verzettelt sich das Projekt.

Keine Bilanzierung und kein Jahresabschluss. Die UG ist als Kapitalgesellschaft nach Paragraf 242 und 264 HGB voll bilanzierungspflichtig. Bilanz und Gewinn und Verlustrechnung bleiben Aufgabe des Steuerberaters. Das Tool liefert die sauberen Rohdaten dafür, es erstellt sie nicht selbst.

Keine E Bilanz und keine Steuererklärung. Ebenfalls Steuerberater Terrain.

Kein Lohn und keine Personalverwaltung. Für den Anfang irrelevant, ein Einzelunternehmer Fall.

Keine DATEV Online API. Der Weg über Rechnungsdatenservice oder Buchungsdatenservice verlangt ein Partnerprogramm mit Mindestkundenzahl, für Eigennutzung praktisch versperrt. Der dateibasierte EXTF Export ist frei dokumentiert und genügt vollständig.

Kein Peppol Access Point in Eigenregie. Der Portal Upload bei ZRE Rheinland Pfalz und ZRE Baden Württemberg reicht für den Start, Peppol ist ein späteres Ausbaufeld über einen Dienstleister.

Keine Live Bankanbindung im ersten Schritt. CSV und CAMT Import deckt neunzig Prozent des Nutzens bei einem Bruchteil des Aufwands. Ein Aggregator wie finAPI kommt erst, wenn das Belegvolumen es rechtfertigt.

Kein Mehrbenutzerbetrieb. Das Tool ist für einen Nutzer gedacht, keine Mandantenfähigkeit, keine Rechteverwaltung für mehrere Personen. Das spart enorm viel Komplexität.

---

## 4. Architektur des Kerns, die Immutability Frage

Braucht es eine Datenbank. Ja, unbedingt. Ein Missverständnis wäre zu denken, GoBD verbiete Datenbanken, weil Daten unveränderbar sein müssen. Das Gegenteil ist der Fall. GoBD verlangt, dass Änderungen nachvollziehbar bleiben, nicht dass keine Datenbank verwendet wird. Praktisch jede professionelle Buchhaltungssoftware läuft auf einer relationalen Datenbank. Der entscheidende Punkt ist die Architektur um die Datenbank herum, nicht der Verzicht darauf.

Empfehlung PostgreSQL als Kern. Aus drei Gründen. Es erlaubt echte Rechtevergabe auf Datenbankebene, sodass die Anwendung selbst technisch gar nicht in der Lage ist, gebuchte Zeilen zu verändern oder zu löschen. Es unterstützt Trigger, mit denen sich zusätzliche Regeln erzwingen lassen. Und es ist die solide Wahl, falls später von mehreren Geräten zugegriffen werden soll oder Replikation für Backups gebraucht wird.

Alternative für einen reinen Einzelplatzbetrieb wäre SQLite, einfacher im Betrieb weil kein separater Server nötig ist, mit Triggern lässt sich Ähnliches erzwingen, aber die Rechteverwaltung ist schwächer und mehrere gleichzeitige Zugriffe sind unkomfortabler. Für den Start reicht SQLite, aber PostgreSQL ist die Wahl mit mehr Zukunftssicherheit und wird hier empfohlen.

Wie Unveränderbarkeit technisch erzwungen wird.

Erstens, Rechteentzug auf Datenbankebene. Für die zentralen Tabellen, allen voran die Buchungssätze, bekommt die Anwendung ausschließlich das Recht zum Einfügen und Lesen. Update und Delete werden per REVOKE komplett entzogen. Damit kann selbst ein Programmierfehler keine bestehende Buchung mehr verändern, das ist technisch schlicht unmöglich, nicht nur durch Programmlogik verhindert.

Zweitens, Korrekturen ausschließlich per Gegenbuchung. Ein Fehler wird nie editiert, sondern durch eine neue, stornierende Buchung ausgeglichen, die auf die ursprüngliche Zeile verweist. Genau das Prinzip, das auch Paragraf 146 AO fürs Papierzeitalter vorsieht, nur eins zu eins ins Digitale übertragen.

Drittens, eine Hash Kette über die Buchungszeilen. Jede neue Zeile speichert einen SHA 256 Hash, der sich aus dem Inhalt der eigenen Zeile und dem Hash der vorherigen Zeile ergibt. Wird nachträglich irgendwo in der Kette manipuliert, bricht die Kette erkennbar. Diese Technik nutzt zum Beispiel das Open Source Projekt RechnungsFee für genau diesen Zweck, sie ist einfach zu implementieren und macht Manipulation jederzeit überprüfbar.

Viertens, periodische versiegelte Schnappschüsse. In regelmäßigen Abständen, zum Beispiel täglich oder bei jedem Tagesabschluss, wird der aktuelle Kettenzustand zusätzlich extern gesichert, etwa als signierter Hash Eintrag in einem separaten, unabhängigen Speicherort. Das schützt selbst gegen den Fall, dass jemand die gesamte Datenbank samt Kette manipulieren würde.

Fünftens, unveränderliche Ablage für Belegdateien. Original Fotos und PDFs werden in einem Speicherbereich abgelegt, der nach dem Schreiben schreibgeschützt wird, entweder über Dateisystemrechte oder über Objektspeicher mit echtem WORM Verhalten, wie es zum Beispiel MinIO mit aktiviertem Object Lock bietet.

Sechstens, ein separates Audit Log. Jede Aktion im System, auch abgelehnte Versuche, wird in einer eigenen, ebenfalls anfügenden Tabelle protokolliert, mit Zeitstempel, ausführender Instanz und einem Hash der Nutzlast.

Kurz zusammengefasst. PostgreSQL als Speicher, append only als Prinzip, Korrekturen nur per Gegenbuchung, Hash Kette zur Manipulationserkennung, unveränderliche Dateiablage für Originalbelege. Kein Spezialprodukt nötig, alles mit Bordmitteln einer normalen Datenbank umsetzbar.

---

## 5. Datenmodell, Kern-Entitäten

Konten. Kontenrahmen SKR04, Kontonummer, Bezeichnung, Kontoart wie Ertrag, Aufwand, Forderung, Verbindlichkeit.

Buchungssätze, die zentrale Tabelle, append only. Laufende Nummer lückenlos, Buchungsdatum, Belegdatum, Sollkonto, Habenkonto, Betrag, Steuerschlüssel, Buchungstext, Belegreferenz, Stornoreferenz falls es sich um eine Korrekturbuchung handelt, Hash der Zeile, Hash der Vorgängerzeile.

Belege, Eingang. Eindeutige Belegnummer, Zeitpunkt der Erfassung, Dateireferenz zum Original, Ergebnis der OCR Erkennung als strukturiertes Feld, Status wie erkannt, geprüft, gebucht, Verknüpfung zum zugehörigen Buchungssatz sobald gebucht, optionales Kostenmerkmal für spätere Projektzuordnung, das Feld bleibt vorerst leer.

Rechnungen, Ausgang. Fortlaufende, lückenlose Rechnungsnummer, Auftraggeber Referenz, Leitweg ID, Rechnungsdatum, Leistungsdatum, Betrag netto und brutto, Steuersatz, Status wie Entwurf, gestellt, bezahlt, überfällig, Referenz zur erzeugten XRechnung XML Datei, Referenz zum Validierungsbericht, Zeitpunkt des Versands, Versandweg.

Auftraggeber Stammdaten. Name, Adresse, Leitweg ID, bevorzugtes Portal wie ZRE Rheinland Pfalz oder ZRE Baden Württemberg, Kontaktdaten, Notizfeld.

Bankbewegungen. Import Datum, Buchungsdatum laut Bank, Betrag, Verwendungszweck, IBAN Gegenseite, Status wie unabgeglichen, zugeordnet, Referenz zur zugeordneten Rechnung oder zum zugeordneten Beleg.

Erwartetes Geld, die schlanke Alternative zum Projektmodul. Eine einfache Liste mit Bezeichnung, erwartetem Betrag, erwartetem Zeitpunkt der Rechnungsstellung, Status wie angefragt, angeboten, beauftragt, teilweise gestellt, vollständig gestellt. Kein Fortschrittstracking, keine Verknüpfung zu einzelnen Leistungsphasen, nur genug um eine Vorschau auf kommendes Geld zu ermöglichen. Diese Tabelle ist bewusst schlank gehalten und wird beim späteren Projektmodul erweitert, nicht ersetzt.

Auditlog. Getrennt von den fachlichen Tabellen, protokolliert jede schreibende Aktion mit Zeitstempel und Kontext.

---

## 6. Die Geld-Sichten

Drei Sichten decken ab, was gefragt war.

Bezahlt. Summe aller Bankbewegungen, die einer Rechnung zugeordnet und bestätigt sind. Das ist Ist Geld, tatsächlich auf dem Konto.

Gestellt, aber offen. Rechnungen im Status gestellt, denen noch keine passende Bankbewegung zugeordnet wurde. Das sind die offenen Forderungen, wichtig für Mahnwesen und Liquiditätsplanung.

Kommendes Geld, noch nicht gestellt. Aus der schlanken Liste erwarteten Geldes, gefiltert auf Status beauftragt oder teilweise gestellt, abzüglich dessen was bereits als Rechnung existiert. Das zeigt, was absehbar noch kommt, ohne dass dafür schon eine Rechnung geschrieben wurde.

Alle drei Sichten sollten sich in der geplanten Timeline als eigene, farblich unterscheidbare Ebenen darstellen lassen, damit auf einen Blick sichtbar wird, wie sich bezahltes, offenes und kommendes Geld über die Zeit verteilen.

---

## 7. E-Rechnung an Behörden, konkreter Workflow

Schritt eins, Rechnung im Tool anlegen, Auftraggeber aus den Stammdaten wählen, Leitweg ID wird automatisch übernommen.

Schritt zwei, Pflichtfeld Prüfung im Tool selbst, noch vor der eigentlichen XML Erzeugung. Fehlt zum Beispiel die Leitweg ID oder das Leistungsdatum, wird die Rechnung gar nicht erst freigegeben.

Schritt drei, XRechnung XML erzeugen, nach aktuellem Stand Version 3.0.2, auf Basis einer vorhandenen Bibliothek statt komplettem Eigenbau der XML Struktur, das spart enorm viel Zeit und Fehleranfälligkeit.

Schritt vier, automatische Validierung gegen den offiziellen KoSIT Validator vor jedem Versand. Der Validator ist Open Source verfügbar und kann lokal eingebunden werden, sodass jede erzeugte Rechnung vor dem Versand technisch geprüft wird und der Prüfbericht mit abgelegt wird.

Schritt fünf, Versand je nach Auftraggeber. Für Rheinland Pfalz und für das Saarland geht es über den gemeinsam genutzten ZRE Rheinland Pfalz, für Baden Württemberg über den eigenen Zentralen Rechnungseingang Baden Württemberg. Beide erlauben Upload oder E-Mail, Peppol ist als Option vorgesehen, aber für den Start nicht der Weg der Wahl.

Schritt sechs, Statuspflege. Nach Versand wechselt die Rechnung auf gestellt, Versanddatum und Versandweg werden festgehalten, XML Datei und Validierungsbericht bleiben unveränderlich mit der Rechnung verknüpft.

---

## 8. Belegerfassung, konkreter Workflow

Schritt eins, Foto oder PDF wird ins Tool geladen.

Schritt zwei, ein Sprachmodell mit Bildverständnis liest die Belegdaten aus, Lieferant, Betrag, Datum, Steuersatz, das ist 2026 der pragmatischste Weg für kleines Volumen, deutlich günstiger und flexibler als klassische spezialisierte OCR Dienste.

Schritt drei, automatische Plausibilitätsprüfung, stimmt Netto plus Steuer mit dem Bruttobetrag überein, sind alle Pflichtfelder gefüllt. Bei Unstimmigkeit geht der Beleg in eine manuelle Prüfung statt automatisch durchzurutschen, das ist die Absicherung gegen Halluzinationen des Modells.

Schritt vier, automatischer Buchungsvorschlag anhand des Nettobetrags. Unter zweihundertfünfzig Euro netto direkt als Aufwand, zwischen zweihundertfünfzig und achthundert Euro netto ebenfalls Sofortabschreibung, aber mit Hinweis auf die Pflicht zur Aufnahme ins Anlageverzeichnis.

Schritt fünf, Freigabe durch dich, danach wird die Buchung angelegt und ist ab dann unveränderlich.

---

## 9. Dokumentationspipelines im Überblick

Fünf Pipelines decken den gesamten Fluss ab, jede mit klarem Anfang und Ende.

Pipeline Belegeingang. Foto oder PDF, OCR Erkennung, Validierung, Buchungsvorschlag, Freigabe, unveränderliche Ablage.

Pipeline Rechnungsausgang. Entwurf, Pflichtfeld Prüfung, XRechnung Erzeugung, KoSIT Validierung, Versand, Statusverfolgung, Zahlungsabgleich.

Pipeline Kontoabgleich. CSV oder CAMT Import, Zuordnung zu offenen Rechnungen oder Belegen per Betrag und Verwendungszweck, bei Unsicherheit manuelle Freigabe, sonst automatische Buchung.

Pipeline Verfahrensdokumentation. Kein technischer Datenfluss, sondern ein lebendes Textdokument, das beschreibt, wie das System GoBD Anforderungen erfüllt. Wird bei jeder relevanten Architekturänderung nachgetragen, einmal jährlich komplett durchgesehen. Dieses Dokument ist bei einer Betriebsprüfung der erste Ansatzpunkt, es lohnt sich, es von Anfang an mitzuführen statt es nachträglich zu rekonstruieren.

Pipeline Steuerberater Export. Periodisch, empfohlen monatlich oder mindestens quartalsweise statt nur einmal jährlich, damit Fehler früh auffallen. Vor dem Export eine kurze Prüfliste, alle Belege verbucht, keine offenen Klärfälle, Auslandsleistungen korrekt behandelt. Danach Export als DATEV EXTF Buchungsstapel, Format Version 700, Kodierung CP1252, zusammen mit einem Bündel der zugehörigen Belegbilder, referenziert über die Belegnummer im EXTF Feld Belegfeld eins.

---

## 10. Jahresabschluss, Übergabe im Detail

Am Ende jedes Geschäftsjahres, für die UG rechnerisch das erste volle Jahr ab 2027, folgender Ablauf.

Erstens, letzter EXTF Export für den vollständigen Zeitraum, nicht nur den letzten Monat, damit der Steuerberater den kompletten Datensatz durchgängig prüfen kann.

Zweitens, Archivierung eines vollständigen, versiegelten Schnappschusses der Datenbank zum Stichtag, inklusive der Hash Kette zur späteren Überprüfbarkeit. Dieser Schnappschuss geht in die Langzeitablage für die gesetzlich vorgeschriebene Aufbewahrung, acht Jahre für Rechnungen, zehn Jahre für Bücher und die Verfahrensdokumentation selbst.

Drittens, Übergabe an den Steuerberater für die Erstellung von Bilanz und Gewinn und Verlustrechnung, das Tool endet hier bewusst, die Bilanzierung ist nicht Teil des Systems.

Viertens, Rücklauf. Sollte der Steuerberater Korrekturen anmerken, werden diese als neue, ordentlich referenzierte Gegenbuchungen im laufenden Jahr nachgetragen, nie als nachträgliche Änderung der bereits abgeschlossenen Perioden.

---

## 11. Design, die unendlich scrollbare Timeline

Grundidee. Eine horizontale Zeitachse, auf der alle Geldereignisse als Punkte oder Balken erscheinen, gestellte Rechnungen, eingegangene Zahlungen, gebuchte Belege, später auch Meilensteine aus dem Projektmodul. Fünf Zoomstufen, Jahr, Quartal, Monat, Woche, Tag, mit stufenlosem Übergang beim Zoomen und beliebigem Scrollen in beide Zeitrichtungen ohne spürbare Pagination.

Warum das technisch kein triviales Feature ist. Eine wirklich unendliche Timeline lädt niemals alle Daten auf einmal, sondern nur ein Fenster um den aktuell sichtbaren Zeitraum, mit Vorabladen zu beiden Seiten, damit beim Scrollen kein Ruckeln entsteht. Ohne diese Virtualisierung würde die Ansicht bei wachsender Datenmenge zunehmend langsam.

Aggregation pro Zoomstufe. Auf Jahresebene werden keine Einzelbuchungen gerendert, sondern vorab berechnete Monatssummen, dargestellt als Balken. Auf Quartalsebene entsprechend Wochensummen, auf Monatsebene Tagessummen, erst auf Wochen und Tagesebene erscheinen einzelne Buchungen und Belege als eigene, anklickbare Karten mit Detailansicht. Diese Aggregate sollten als eigene, regelmäßig aktualisierte Tabellen oder materialisierte Sichten in der Datenbank vorliegen, nicht bei jedem Seitenaufruf aus den Rohdaten neu berechnet werden, sonst wird die Ansicht bei wachsendem Datenbestand spürbar langsam.

Interaktion. Scrollen oder Wischen bewegt die Zeitachse, ein Zoom Regler oder Mausrad wechselt zwischen den fünf Stufen, ein Klick auf ein Ereignis öffnet die Detailansicht, bei einem Beleg das Originalbild, bei einer Rechnung die XRechnung Vorschau samt Status.

Visuelle Kodierung. Farbe nach Ereignistyp, etwa eine Farbe für Belege, eine für gestellte Rechnungen, eine für eingegangene Zahlungen. Höhe oder Größe des Elements nach Betrag, damit größere Summen auf den ersten Blick auffallen, ohne dass Zahlen einzeln gelesen werden müssen.

Technischer Ansatz fürs Frontend. Eine virtualisierte Renderkomponente, die nur den sichtbaren Zeitausschnitt tatsächlich zeichnet, umgesetzt entweder mit einer vorhandenen Virtualisierungsbibliothek oder bei Bedarf mit einem eigenen Canvas basierten Renderer, falls die Datenmenge und die gewünschte Flüssigkeit der Bewegung das erfordern. Für den Start reicht eine bibliotheksbasierte Lösung völlig aus, ein eigener Canvas Renderer ist ein mögliches späteres Upgrade, falls Performance zum Thema wird.

---

## 12. Technologie-Empfehlung, kurz

Backend und Datenhaltung, PostgreSQL wie oben begründet, angesprochen über eine schlanke API Schicht, die selbst keine Update oder Delete Operationen auf den Kerntabellen kennt.

Belegerkennung, Anbindung eines Sprachmodells mit Bildverständnis für die OCR Aufgabe, mit der beschriebenen Validierungslogik davor geschaltet.

XRechnung Erzeugung, eine vorhandene Bibliothek statt Eigenbau der kompletten XML Struktur, ergänzt um lokale Validierung gegen die offiziellen KoSIT Schemata vor jedem Versand.

Frontend, eine moderne, komponentenbasierte Oberfläche, mit besonderem Augenmerk auf die Timeline als zentrales, aufwendigstes Einzelbauteil.

---

## 13. Reihenfolge des Bauens

Phase eins, das Fundament. Datenbankschema mit append only Erzwingung, Kontenrahmen SKR04 hinterlegt, Buchungssätze mit Hash Kette, Auditlog. Ohne diese Basis ist alles Weitere nur vorläufig.

Phase zwei, Belegerfassung. Foto Upload, OCR Anbindung, Validierung, Buchungsvorschlag, Freigabe. Das ist der Workflow, der sofort im Alltag genutzt wird und schnell Nutzen zeigt.

Phase drei, Rechnungsstellung mit XRechnung. Rechnung anlegen, Pflichtfeld Prüfung, XML Erzeugung, KoSIT Validierung, Portal Versand für ZRE Rheinland Pfalz und ZRE Baden Württemberg.

Phase vier, Geld-Sichten und einfache Timeline. Die drei Sichten bezahlt, offen, kommend, zunächst als einfache Liste oder Balkendarstellung, die volle, unendlich scrollbare Timeline mit allen fünf Zoomstufen kann als eigener Ausbauschritt danach folgen, sobald genug echte Daten vorhanden sind, an denen sich das UI sinnvoll testen lässt.

Phase fünf, Kontoabgleich per CSV und CAMT. Import, automatisches Zuordnen, manuelle Freigabe bei Unsicherheit.

Phase sechs, DATEV Export. EXTF Erzeugung, Prüfung gegen das offizielle DATEV Prüftool, erster echter Testlauf mit dem Steuerberater.

Phase sieben, Verfeinerung der Timeline. Volle Virtualisierung, alle Zoomstufen, Aggregattabellen, visuelle Kodierung nach Typ und Betrag.

---

## 14. Testframework und Produktivsetzung

Grundprinzip. Testumgebung und Produktivumgebung sind von Anfang an zwei komplett getrennte Datenbanken, nie eine gemeinsame Tabelle mit einem Testflag. Der Grund dafür ist, das Herzstück des Systems verweigert Update und Delete auf echten Buchungssätzen, das darf niemals mit Testdaten vermischt werden, sonst untergräbt man genau die Garantie, die man sich gerade aufwendig erarbeitet hat.

Aufbau. Zwei vollständig identische Datenbank Instanzen, eine für Entwicklung und Test, eine für den echten Betrieb. Gleicher Code, gleiches Schema, nur unterschiedliche Verbindungsdaten über eine Umgebungsvariable gesteuert. Damit läuft exakt derselbe Code gegen Testdaten wie später gegen echte Daten, es gibt keine Sonderpfade, die im Ernstfall zum ersten Mal ausgeführt werden.

Lokale Entwicklung am einfachsten über einen containerisierten Postgres, der sich mit einem einzigen Befehl komplett zurücksetzen lässt. Das macht Testen risikofrei, im schlimmsten Fall wird die Testdatenbank verworfen und neu aufgesetzt, in Sekunden erledigt.

Dummy Daten Generator. Ein einzelnes Skript, das eine frische Testdatenbank mit realistischen, aber komplett erfundenen Daten befüllt. Wichtig dabei mehrere Monate Zeitspanne statt nur ein paar einzelne Einträge, sonst lässt sich die Timeline mit ihren fünf Zoomstufen gar nicht sinnvoll testen. Der Generator sollte abdecken.

Erfundene Auftraggeber mit gültig aufgebauten, aber klar als Testfall erkennbaren Leitweg IDs. Rechnungen über alle Status hinweg, Entwurf, gestellt, bezahlt, überfällig. Belege in unterschiedlichen Zuständen, erkannt, geprüft, gebucht. Bankbewegungen, manche zuordenbar, manche bewusst nicht, um den Abgleich zu testen. Und ein paar bewusst kaputte Fälle, ein Beleg bei dem Netto plus Steuer nicht zur Bruttosumme passt, eine Rechnung ohne Leitweg ID, damit die Validierungslogik nicht nur am Erfolgsfall getestet wird.

Was tatsächlich automatisiert getestet gehört, ohne Overengineering. Nicht jede Kleinigkeit braucht einen Test, aber die Dinge, die sich später nicht mehr korrigieren lassen, sehr wohl.

Die Datenbank verweigert Update und Delete auf Buchungssätzen, ein Test versucht genau das und prüft, dass es fehlschlägt. Die Hash Kette erkennt Manipulation, ein Test verändert eine Zeile nachträglich künstlich und prüft, dass die Kette das bemerkt. Jede Buchung ist im Soll und Haben ausgeglichen, kein Buchungssatz darf je unausgeglichen entstehen. Erzeugte XRechnung XML Dateien bestehen die offizielle KoSIT Validierung, dafür gibt es sogar fertige Testfälle von KoSIT selbst, die sich direkt mitverwenden lassen. Der DATEV EXTF Export lässt sich mit dem kostenlosen offiziellen DATEV Prüftool laden, ohne Fehler.

Das reicht bereits. Kein aufwendiger End zu Ende Testrahmen mit hunderten Fällen, sondern eine kleine, gezielte Sammlung, die genau die Stellen absichert, an denen ein Fehler im Nachhinein am teuersten wäre.

Der Übergang zur Produktivsetzung. Genau der Punkt, ohne komplizierte Migration und ohne Fehlersuche live im Echtbetrieb.

Erstens, alles wird ausschließlich gegen die Testdatenbank entwickelt und ausprobiert, niemals direkt gegen die Produktivdatenbank.

Zweitens, jede Anpassung an der Datenbankstruktur wird zuerst gegen eine frisch mit Dummy Daten befüllte Testdatenbank angewendet und geprüft, erst wenn das sauber durchläuft, wird dieselbe Änderung gegen die Produktivdatenbank gefahren. Dadurch bleibt Scharfschalten ein reiner Wiederholungsschritt, keine Erstausführung unter Zeitdruck.

Drittens, eine kurze, feste Checkliste vor dem allerersten Umstieg auf echte Daten, statt eines aufwendigen Freigabeprozesses. Laufen alle festgelegten Tests durch. Wurde mindestens eine echte XRechnung erfolgreich gegen den KoSIT Validator geprüft. Wurde mindestens ein DATEV Export erfolgreich ins Prüftool geladen. Ist die Verfahrensdokumentation für den aktuellen Stand nachgeführt. Sind diese vier Punkte erfüllt, ist der Wechsel auf die Produktivdatenbank ein reiner Konfigurationswechsel, keine Codeänderung.

Viertens, auch nach dem Start bleibt die Testdatenbank dauerhaft bestehen und wird für jede neue Funktion weiter genutzt. Niemals wird testweise etwas gegen die echten Daten ausprobiert, egal wie klein die Änderung erscheint. Genau das ist der Kernpunkt, um Debug Iteration im Produktivbetrieb von vornherein auszuschließen.

---

## 15. Offene Fragen für später

Diese Punkte bewusst nicht in diesem Fahrplan entschieden, sondern für die nächste Runde vorgemerkt.

Wie genau soll die Verzahnung mit dem späteren Projektmodul aussehen, insbesondere wie die schlanke Liste erwarteten Geldes zum vollen Projekt mit Fortschrittstracking migriert wird, ohne bestehende Daten zu verlieren.

Ob und wann ein Wechsel von CSV Import zu einer echten Bankanbindung über einen Aggregator wie finAPI sinnvoll wird, abhängig vom tatsächlichen Belegvolumen.

Wie mit der kommenden XRechnung Version vier umgegangen wird, sobald KoSIT einen verbindlichen Zeitplan veröffentlicht, insbesondere ob ein Parallelbetrieb beider Versionen für eine Übergangszeit nötig wird.

---

## 16. Integration in quagg_page (Stand 2026-08-23, Phase 1 gebaut)

Der kleine Pedant ist kein eigenständiges Projekt, sondern ein Feature im bestehenden Monorepo. Backend als FastAPI-Package, Client als Vue-Feature im internen Bereich. Alles folgt bestehenden Mustern, mit einer bewussten Ausnahme: der Datenhaltung.

**Wo was lebt.**

Backend: `backend/app/api/pedant/` nach dem Vorbild von `app/api/flood3D/` — `router.py` für HTTP, `core/` für Fachlogik ohne HTTP-Abhängigkeit (`journal.py`, `hashkette.py`, `audit.py`, `skr04.py`), `tests/` mit eigener `conftest.py`, `cli.py` für Wartung (`migrate`, `kette-pruefen`, `dummydaten`, `skr04-sql`) und `migrations/` mit nummerierten SQL-Skripten. Registriert in `app/main.py` unter `/FastAPI/pedant`; der Client ruft `/api/pedant/...` (nginx und Vite schreiben um). Wichtig: `.gitignore` ignoriert `backend/*` mit Whitelist — für den Pedanten existiert die Ausnahme `!backend/app/api/pedant/`, der Buchhaltungscode ist als einziger Backend-Kernteil neben flood2D/flood3D/companion versioniert.

Client: `client/src/features/kleiner-pedant/` nach dem Vorbild von `features/pdfeditor/` — `views/PedantView.vue` (reine Shell mit Tab-Leiste), `components/ui|status|journal/` (kleine Einzweck-Komponenten, Ziel unter 250 Zeilen, harte Grenze 400), `services/` (PascalCase, zustandslos), `stores/` (Setup-Stores, ID-Präfix `pedant-`), `styles/theme.css`, `test/`. Route `/intern/pedant` lazy in `src/router/index.js`, Nav-Link „Buchhaltung" in `components/layout/InternLayout.vue`. Icons nur über das Icon-Tor `PedantIcon.vue` (lucide), keine Emojis. Der Token-Wächter (`.stylelintrc.json`) erzwingt `color-no-hex` im Feature; Farbwerte gehören ausschließlich in `styles/theme.css` (`--ped-*` auf `:root`, hell als Default, dunkel unter `:root[data-theme='dark']`; Scrollbar-/Spinner-Tokens des global geladenen SaintV-Themes werden via `:root:has(.pedant-root)` umgebogen).

**Welche Muster wiederverwendet werden.**

Auth: `Depends(get_current_active_user)` aus `app/api/deps.py` plus INTERNAL-Prüfung — beim Pedanten router-weit als Dependency, fail-closed. Der Client-Route-Guard ist Kosmetik; der Backend-Türsteher ist die einzige echte Grenze. Konfiguration: `env()` aus `app/api/flood2D/env_util.py`, weil PM2 die `backend/.env` nicht in den Prozess exportiert. Tests: pytest im Package mit Kreditkarten-Sperre (conftest leert die Prod-URLs hart, bevor irgendein Modul sie lesen kann — kein Testlauf erreicht je `pedant_prod`); Client vitest inklusive Render-Prüfstand (beide Tabs mounten mit Daten). HTTP im Client über die zentrale Axios-Instanz, gekapselt in `services/PedantApi.js` (gibt `response.data` zurück).

**Wo der Pedant bewusst abweicht.**

Die Buchhaltungsdaten liegen NICHT in `backend/quagg.db`. Die SQLite/SQLModel-Schicht der übrigen App kann die zentrale Garantie aus Kapitel 4 nicht liefern: den Rechteentzug per REVOKE. Der Pedant hat eine eigene PostgreSQL-16-Instanz auf demselben Server (nativ, nur localhost, RAM-schonend getunt via `/etc/postgresql/16/main/conf.d/pedant-tuning.conf`), zwei Datenbanken `pedant_test` / `pedant_prod` (Kapitel 14), zwei Rollen: `pedant_app` (nur INSERT+SELECT auf den Kerntabellen — die API) und `pedant_migrate` (DDL — nur `cli.py migrate`). Verbindungsschicht ist pures psycopg 3 (`pedant/db.py`), kein ORM: append-only heißt INSERT+SELECT, die Kette braucht `FOR UPDATE` auf der Kopfzeile, und ein ORM mit Update-Pfaden ist genau das Werkzeug, das hier niemand haben soll. Kein `create_all`: Schemaänderungen laufen ausschließlich über `cli.py migrate`, das Prod verweigert, solange Test nicht auf demselben Stand ist. Beträge sind durchgängig Integer-Cent (DB BIGINT, API, Client); formatiert wird nur zur Anzeige (`services/Geld.js`, `GeldBetrag.vue`).

Die Unveränderbarkeit ist doppelt erzwungen: REVOKE für `pedant_app` UND Sperr-Trigger, die auch den Eigentümer stoppen; die Kettenkontinuität (lückenlose Nummer, `hash_prev` schließt an den Kopf an) prüft zusätzlich ein DB-Trigger bei jedem INSERT. Ehrliche Grenze für die Verfahrensdokumentation: `pedant_migrate` könnte Trigger deaktivieren — dagegen stehen Hash-Kette (`kette_pruefen` als Endpunkt und CLI), Auditlog und später die versiegelten Schnappschüsse.

**Betrieb.**

Backend-Deploy wie gehabt: `pm2 restart quagg-api` nach Python-Änderungen. Die laufende API bedient das Ziel aus `PEDANT_ZIEL` (backend/.env, normal `prod`). Nächtliches Backup 02:30 via systemd-Timer `pedant-backup.timer` → `pg_dump -Fc` nach `/mnt/storagebox/pedant-backups/` (Dumps dürfen auf den CIFS-Mount, die lebende DB nie; Mount-Guard nach email_fetcher-Muster; Restore per stdin, dokumentiert im Skript `/usr/local/sbin/pedant-backup.sh`); sonntags zusätzlich die Cluster-Globals, Aufbewahrung 90 Tage rollierend.

**Entscheidungen für die nächsten Phasen** (aus der Integrationsanalyse 2026-08-23): Beleg-OCR läuft über das Anthropic-SDK mit nachgeliefertem API-Key (das fachliche Muster — `unsicher`-Flag, „nie raten", Sonnet — kommt aus `backend/ingest/vision.py`), immer als Worker, nie im HTTP-Request. Der E-Mail-Weg bleibt komplett außen vor (das Email-Feature ist Prototyp und wird nach diesem Projekt weiterentwickelt): Belegeingang nur per Upload, Rechnungsversand endet beim Portal-Upload plus Datei-Download. Korrektur zur ersten Analyse: nginx setzt bereits GLOBAL `client_max_body_size 100M` (nginx.conf) — Handyfoto-Uploads brauchten keine nginx-Änderung; der Pedant deckelt selbst bei 25 MB im Code. Für die KoSIT-Validierung in Phase 3 braucht der Server eine Java-Runtime (headless JRE oder Docker).

### Phase 2 „Belegerfassung" — gebaut und verifiziert 2026-08-23

**Vorgabe:** ohne API-Key gebaut; die LLM-OCR wird erst kurz vor dem finalen Test am Ende aller Phasen scharf gestellt. Der manuelle Erfassungsweg ist der Hauptpfad und bleibt dauerhaft als Fallback.

Backend: Migration `004_belege.sql` (Tabelle `belege` mit Statusmaschine erfasst → [erkannt →] geprüft → gebucht | verworfen, per DB-Trigger erzwungen; Identitätsfelder unveränderlich; nach `gebucht` nur noch `kostenmerkmal` änderbar; `verworfen` terminal; kein DELETE, auch nicht für den Eigentümer). Ablage content-adressiert unter `/mnt/storagebox/3_Buchhaltung/belege/<jahr>/<sha256>.<endung>` (`core/ablage.py`: echtes Chunk-Streaming + fsync + atomarer replace, MIME-Prüfung per magic bytes gegen die Endungs-Allowlist .pdf/.jpg/.jpeg/.png/.webp, 25-MB-Limit, Mount-Guard; abgelehnte Uploads werden NICHT gespeichert — kein Beleg, keine Aufbewahrungspflicht). Duplikat (gleicher Inhalt) → 409 mit Bestandsnummer. Fachlogik `core/belege.py`: Plausibilität Netto+Steuer=Brutto (kaufmännisch gerundet, ±1 Cent Kassenbon-Toleranz), Buchungsvorschlag an den GWG-Grenzen 250/800 € netto (6260 + Anlageverzeichnis-Hinweis bzw. Aktivierungs-Hinweis), Freigabe bucht EINE Zeile BRUTTO mit DATEV-BU-Steuerschlüssel (19→'9', 7→'8') und `belegreferenz` = Belegnummer — idempotent (Advisory-Lock + Journal-Dedup, ein abgebrochener Lauf heilt sich selbst). Sieben neue Endpunkte hinter dem INTERNAL-Gate. Audit-Zeile für jede Aktion, auch abgelehnte.

Client: dritter Tab „Belege" — BelegDropzone (Dateiwahl + getrennter „Foto aufnehmen"-Input mit capture, Vorschau per Object-URL), BelegListe mit Status-Filter-Chips, BelegPruefung als Split-Maske (Vorschau via Blob+vue-pdf-embed/img, Felder mit Live-Plausibilität und Vorschlagskarte, Verwerfen im Modal), FreigabeKarte (SKR04-Kontowahl mit GWG-Vorbelegung, Geldkonto-Auswahl 1800/1600/3300/1550). Neue geteilte Bausteine PedantModal und FormFeld.

OCR vorbereitet, inaktiv: `core/erkennung.py` (Erkenner-Protocol, AnthropicErkenner mit Lazy-Import — das anthropic-Paket ist NICHT installiert —, MockErkenner für Tests, BELEG_SCHEMA mit `unsicher`-Flag) + CLI `beleg-erkennen`, der unkonfiguriert mit Anleitung verweigert. **Scharfstellen später:** `ANTHROPIC_API_KEY=…` und `PEDANT_OCR=1` in `backend/.env`, `venv/bin/pip install anthropic`, dann `cli beleg-erkennen --ziel prod` — der Ablauf (menschliche Prüfung + Freigabe) ändert sich dabei NICHT, die OCR füllt nur vor.

Stand nach Phase 2: 51 pytest + 33 vitest grün; E2E gegen Prod verifiziert (Upload → 409-Duplikat → Felder → geprüft → Freigabe → Journal-Buchung 6260 an 1800 brutto BU 9 → idempotente Wiederholung → Kette ok → Datei-sha256 == DB-Wert); der E2E-Testfall wurde per Gegenbuchung storniert. Bewusste Grenzen: `verworfen` ist terminal (kein Wiederbelebungs-Pfad), keine Quarantäne für abgelehnte Uploads.

### Phase 3 „Rechnungsstellung mit XRechnung" — gebaut und verifiziert 2026-08-24

**Erzeugungsweg:** eigenes UBL-2.1-Template mit lxml (`core/xrechnung.py`, pur und deterministisch — Golden-File-testbar), normative Vorlage ist die KoSIT-Testsuite; es gibt 2026 keine gepflegte Python-Bibliothek mit XRechnung-UBL als Kernaufgabe. Die Absicherung leistet der **offizielle KoSIT-Validator lokal** (`core/kosit.py`): validator-1.6.3-standalone.jar + XRechnung-3.0.2-Konfiguration v2026-01-31 unter `/opt/kosit/`, installiert und gepinnt (sha256) über `kosit_setup.sh` (openjdk-21-jre-headless). Exit-Code-Semantik: 0 valide, >0 fachliche Ablehnung (Meldungen aus dem Report), Fehler ohne Report → 503 mit Setup-Anleitung. CustomizationID/BT-Mapping liegen isoliert in einem Konstantenblock — der Upgrade-Punkt für XRechnung 4.0 (angekündigt Ende 2026).

**Lückenlose Rechnungsnummer konstruktiv:** Ein Entwurf hat KEINE Nummer; sie wird atomar beim Stellen vergeben (globaler Advisory-Lock), verworfen werden kann nur ein Entwurf ohne Nummer (DB-CHECK). Ein vom Validator abgelehntes Stellen persistiert NICHTS — keine Nummer verbrannt. Migration `005_rechnungen.sql`: `firmendaten` (eine Zeile), `auftraggeber` (deaktivieren statt löschen, Leitweg-ID hart geprüft: Format + ISO-7064-MOD-97-10-Prüfziffer — client- und serverseitig), `rechnungen` (Statusmaschine entwurf → gestellt ↔ bezahlt | verworfen per Trigger; nach dem Stellen ist alles eingefroren außer Statuspflege), `rechnungspositionen` (Mengen als Tausendstel-Ganzzahl, `betrag_cent` als GENERATED-Spalte — EINE Rundungswahrheit in DB, Python und Client).

**Stellen-Flow** (`core/rechnungen.py`): Pflichtfelder (BR-DE-Regeln inkl. Verkäufer-Kontakt und USt-ID-oder-Steuernummer) → UBL erzeugen → KoSIT (rot = 422 mit Meldungen) → Nummer+Snapshot binden → XML + HTML-Prüfbericht content-adressiert nach `/mnt/storagebox/3_Buchhaltung/rechnungen/<jahr>/` (`ablage.bytes_speichern`) → Forderungs-Buchung **1200 an 4400 brutto** im Journal (steuerschluessel '' — 4400 ist DATEV-Automatikkonto), `belegreferenz` = Rechnungsnummer → gestellt. Idempotent und selbstheilend (Advisory-Locks + Journal-Dedup). Steuersatz bewusst fix 19 % (7 %/0 % erst bei realem Bedarf). Versand = Portal-Upload von Hand (XML-Download im Tool, Versand-Vermerk zre_rlp/zre_bw); „bezahlt" manuell und rückholbar bis Phase 5.

**Client:** vierter Tab „Rechnungen" — RechnungsListe (überfällig ABGELEITET aus Fälligkeit), RechnungsFormular mit PositionenTabelle (Live-Summen, gleiche Rundung wie Backend), StellenDialog (Vorprüfung + KoSIT-Probelauf ohne Nummernverbrauch), FirmendatenKarte (Vollständigkeits-Befund), AuftraggeberVerwaltung (Leitweg-Live-Prüfung), RechnungAktionen (XML-/Bericht-Download, Versand, Bezahlt). Statuskarte zeigt `kosit_bereit`.

Stand nach Phase 3: 79 pytest (inkl. ECHTER KoSIT-Integrationstest: unsere Rechnung valide, KoSIT-Beispiel valide, kaputte Rechnung → BR-DE-15) + 41 vitest; E2E gegen die Test-DB mit realem Validator komplett grün (Vorprüfung → Stellen → RE-Nummer → Journal 1200/4400 + Kette → idempotent → XML-sha == DB → lückenlos über Verwerfen hinweg → Versand/Bezahlt). Auf Prod bewusst KEINE Test-Rechnung — die erste echte Rechnung ist der Prod-E2E. Dabei erneut die psycopg-Savepoint-Falle: Advisory-Lock-SELECTs öffnen eine implizite Transaktion; `conn.commit()` direkt nach dem Lock ist Pflicht, sonst wird der nächste Transaktionsblock ein Savepoint.

### Phase 4 „Geld-Sichten und einfache Timeline" — gebaut 2026-08-24

Die drei Sichten aus Kapitel 6 als Kacheln (Hero-Zahlen) im neuen Tab „Geld": **Bezahlt** (bis Phase 5: Rechnungen im Status bezahlt — danach übernimmt der Bankabgleich), **Gestellt, offen** (inkl. abgeleitetem Überfällig-Anteil), **Kommend, nicht gestellt** (aus der schlanken Liste erwarteten Geldes, Status beauftragt/teilweise gestellt, abzüglich `bereits_gestellt_cent`). Migration `006_erwartetes_geld.sql`: die Planungsliste aus Kapitel 5 — bewusst OHNE FK auf Rechnungen (Planung, keine Buchhaltung), der bereits gestellte Anteil wird als Betrag gepflegt; Status um `entfallen` ergänzt (kein DELETE — Haus-Philosophie), wird beim Projektmodul erweitert, nicht ersetzt.

Die **einfache Timeline** (Kapitel 13 Phase vier) ist eine gruppierte Monats-Balkendarstellung (±6 Monate, chart.js): drei farblich unterscheidbare Ebenen mit **validierter, farbfehlsichtigkeits-fester Palette** (dataviz-Referenz: aqua/orange/blau, beide Modi maschinell geprüft — die naiven Theme-Farben Grün/Amber fielen beim Validator durch), Legende, Hover-Tooltips und umschaltbarer **Tabellen-Ansicht** (Barrierefreiheit). Aggregation je Monat im Backend (`core/geldsichten.py::monatsreihe`): bezahlt nach Zahlungsdatum, offen nach Fälligkeit, kommend nach erwartetem Rechnungsdatum. Die volle, unendlich scrollbare Timeline mit fünf Zoomstufen bleibt Phase 7.

Endpunkte hinter dem INTERNAL-Gate: `GET /geld/sichten`, `GET /geld/monatsreihe?zurueck&vor`, `GET/POST /geld/erwartet`, `PUT /geld/erwartet/{id}` (`router_geld.py`). Stand nach Phase 4: 84 pytest + 46 vitest.

### Phase 5 „Kontoabgleich per CSV und CAMT" — gebaut 2026-08-24

Migration `007_bankbewegungen.sql`: importierte Bankumsätze mit **signierten** Cent-Beträgen (erste signierte Beträge im System — es sind Fremddaten der Bank), Dedup über kanonischen Hash (erneuter Import derselben Datei ist ein No-op), Bankfelder nach dem Import per Trigger unveränderlich, Statusmaschine unabgeglichen ↔ zugeordnet/ignoriert. Parser (`core/bankimport.py`, pur): CSV mit Alias-Tabelle für die heterogenen Header deutscher Banken (Sparkasse mit Metazeilen, DKB u. a.) + deutsche Betragsformate, und CAMT.053 namensraum-agnostisch (001.02–.08). Formatweiche nach INHALT, nicht Endung.

**Abgleich (`core/abgleich.py`) mit zwei fachlichen Leitplanken:** (1) Ein EINGANG, der einer offenen Rechnung zugeordnet wird, erzeugt die Zahlungsbuchung 1800 an 1200 in Höhe des BANKbetrags (Belegreferenz = Rechnungsnummer; die Rechnung wird bezahlt, wenn der Betrag den Brutto ±1 Cent trifft — Teilzahlungen bleiben gestellt und im Journal sichtbar). (2) Ein AUSGANG, der einem gebuchten Beleg zugeordnet wird, wird NUR abgehakt — die Aufwandsbuchung existiert seit der Beleg-Freigabe, eine zweite wäre doppelt. Vorschläge mit Konfidenzstufen (sicher = Betrag exakt UND Referenz im Verwendungszweck / betrag / referenz); der **Auto-Abgleich ordnet ausschließlich eindeutige sicher-Treffer** zu (Kap. 9: bei Unsicherheit manuelle Freigabe). Fehlzuordnung lösen = Storno der Zahlungsbuchung per Gegenbuchung + zurück auf unabgeglichen. Dabei gehärtet: der Stellen-Dedup schränkt jetzt auf die Forderungsbuchung (1200/4400) ein, weil die Zahlungsbuchung dieselbe Belegreferenz trägt.

Client-Tab „Bank": Import-Knopf (CSV/CAMT), Filter-Chips, Bewegungsliste mit ±-gefärbten Beträgen, Klärdialog (Vorschläge mit Konfidenz-Pille, manuelle Wahl offener Rechnungen/gebuchter Belege, Ignorieren mit Grund, Lösen mit Storno-Hinweis), Auto-Abgleich-Knopf mit Ergebniszeile. Endpunkte: `POST /bank/import`, `GET /bank`, `GET /bank/{id}/vorschlaege`, `POST /bank/{id}/{zuordnen|ignorieren|loesen}`, `POST /bank/auto-abgleich`. Stand nach Phase 5: 100 pytest + 52 vitest.

### Phase 6 „DATEV-Export" — gebaut 2026-08-24

**EXTF-Buchungsstapel exakt nach Spezifikation** (verifiziert gegen developer.datev.de und die DATEV-Formatdefinition): Kennzeichen EXTF (Fremdsoftware), DATEV-Format-Version 700, Datenkategorie 21, **Formatversion 13 = 125 Spalten**, CP1252 ohne BOM, Semikolon, CRLF, Quoting nur für Textfelder, leere Felder als `;;`, Belegdatum als TTMM (Jahr aus dem Header), Dateiname mit Pflicht-Präfix `EXTF_`. `core/datev.py` ist pur und deterministisch testbar.

Drei fachliche Entscheidungen: (1) **BU-Drehung** — der BU-Schlüssel hängt am Gegenkonto, deshalb wird eine Journal-Buchung mit Vorsteuer-Schlüssel gedreht exportiert (Konto = Geldkonto im Haben, Gegenkonto = Aufwandskonto trägt den BU); ohne Schlüssel geht es gerade heraus, und Automatikkonten wie 4400 bekommen NIE einen BU (#REW00306). (2) **Festschreibung = 0**, nie leer — leer heißt seit 2019 automatisch festschreiben; der Steuerberater schreibt nach Prüfung selbst fest. (3) Feld 10 ist im Stapel das **Buchungsdatum** der Fibu (liegt per Zeitraumfilter sicher im Header-Zeitraum); der Export erzwingt Zeiträume innerhalb EINES Wirtschaftsjahres. Belegfeld 1 = unsere Belegreferenz, gefiltert auf den DATEV-Zeichensatz. DATEV-Berater-/Mandantennummer leben in den Firmendaten (Migration 008, Platzhalter 1001/1, bis der Steuerberater die echten vergibt).

Dazu die **Pipeline aus Kapitel 9**: Prüfliste vor dem Export (nicht gebuchte Belege, unabgeglichene Bankbewegungen, offene Entwürfe — sichtbar, aber nicht blockierend) und das **Belegbilder-ZIP** des Zeitraums, jede Datei benannt `<Belegnummer>_<Originalname>` — der Steuerberater findet sie über Belegfeld 1. Endpunkte: `GET /export/pruefliste`, `GET /export/extf` (Download, windows-1252), `GET /export/belege` (ZIP); im Client die ExportKarte im Status-Tab (Zeitraum, Schnellwahl Monat/Quartal, Prüfliste, zwei Downloads).

**Bewusste Grenze:** Das offizielle DATEV-Prüfprogramm ist eine Windows-Anwendung ohne CLI/Web-Variante — der finale Prüftool-Lauf (Checkliste aus Kapitel 14) passiert auf einem Windows-Rechner oder testweise beim Steuerberater-Import; strukturell ist das Format hier hart getestet (125 Spalten, Pflichtfelder, Zeichensätze, CP1252-Roundtrip). Stand nach Phase 6: 112 pytest + 52 vitest — **damit sind die Bauphasen 1 bis 6 aus Kapitel 13 vollständig**; Phase 7 (Timeline-Vollausbau) folgt laut Fahrplan bewusst erst, „sobald genug echte Daten vorhanden sind". Vor dem Echtbetrieb: OCR scharfstellen (API-Key), Firmendaten füllen, Frontend-Build deployen, admin-Passwort ändern, ein EXTF-Probelauf durchs DATEV-Prüftool.
