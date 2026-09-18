<!-- Fabios Auftrag, wörtlich (2026-09-18). Nur die drei Pfad-Platzhalter sind gefüllt. Pfade relativ zur Wurzel des Repos. -->

# Plan Kommandodefinition

Lies zuerst beide Auditberichte unter docs/cde/kommando/audit-1-architektur-2026-09-18.md und docs/cde/kommando/audit-2-bearbeitungsstruktur-2026-09-18.md
sowie den aktuellen Stand des Datenmodells.
Du implementierst nichts. Du lieferst einen Entwurf zur Entscheidung.

## Ziel
Die Kommandodefinition ist die einzige Naht zwischen Oberfläche und
Modell. Jede Nutzeraktion wird zu einem Kommando, das Modell wertet es
aus, die Darstellung zeigt das Ergebnis. Die Oberfläche verändert
niemals direkt Objekte.

## Feste Vorgaben
Ein Kommando entspricht einer Nutzerabsicht und einem Undo Schritt.
Ziele werden ausschließlich über stabile GUID referenziert.
Parameter sind absolute Werte, nicht relative Deltas.
Ein Kommando, das eine Fachregel verletzt, wird ausgeführt und das
Ergebnis als regelwidrig markiert, nicht abgelehnt.
Berechnete Werte stehen nie im Kommando, nur Rezeptangaben.
Jedes Kommando trägt eine Schemaversion.
Ein Kommando gilt ganz oder gar nicht, kein Teilzustand.

## Aufgabe
1. Entwirf das Schema eines Kommandos. Welche Felder sind Pflicht,
   welche optional, wie werden Muster, Bauform und Parameter benannt.
2. Formuliere damit fünf konkrete Kommandos aus dem Fachbereich,
   darunter Schacht setzen, Haltung ziehen, Sohlhöhe ändern,
   Bauform löschen und Objekte verknüpfen.
3. Beschreibe, wie Undo und Redo aus dem Schema folgen und was passiert,
   wenn ein Kommando ein Objekt referenziert, das inzwischen gelöscht
   wurde.
4. Zeige, wie die Auswertung eines Kommandos auf Eigenschaftsarten
   zugreift und nicht auf Bauteiltypen. Nenne die konkrete Stelle im
   bestehenden Code, an der das heute anders läuft.
5. Prüfe den Entwurf gegen einen vierten Fachfall, den ich absichtlich
   nicht genannt habe. Wähle dafür Auffüllung zwischen Gelände und
   Planum und sag ehrlich, ob das Schema trägt oder erweitert werden
   muss.

## Ausgabe
Das Schema als kommentiertes Beispiel, die fünf Kommandos, eine Liste
offener Entscheidungen, die ich treffen muss, und eine klare Aussage,
was dieser Entwurf bewusst nicht abdeckt.
Nenne Konflikte mit den Auditbefunden explizit, statt sie zu glätten.
