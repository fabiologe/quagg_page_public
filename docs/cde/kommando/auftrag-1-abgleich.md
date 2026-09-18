<!-- Fabios Auftrag, wörtlich (2026-09-18). Nur die drei Pfad-Platzhalter sind gefüllt. Pfade relativ zur Wurzel des Repos. -->

# Abgleich Kommandodefinition

Lies beide Auditberichte unter docs/cde/kommando/audit-1-architektur-2026-09-18.md und docs/cde/kommando/audit-2-bearbeitungsstruktur-2026-09-18.md sowie
den vorhandenen Code für Bearbeitung, Zustandsänderung und Undo.
Du änderst nichts und entwirfst nichts Neues. Du gleichst ab.

## Zielbild
Die Kommandodefinition ist die einzige Naht zwischen Oberfläche und
Modell. Jede Nutzeraktion wird zu einem Kommando, das Modell wertet es
aus, die Darstellung zeigt das Ergebnis.
Ein Kommando entspricht einer Nutzerabsicht und einem Undo Schritt.
Ziele werden über stabile GUID referenziert, nicht über Index.
Parameter sind absolute Werte, keine relativen Deltas.
Regelverstöße werden ausgeführt und markiert, nicht abgelehnt.
Berechnete Werte stehen nie im Kommando, nur Rezeptangaben.
Jedes Kommando trägt eine Schemaversion.
Ein Kommando gilt ganz oder gar nicht.

## Aufgabe
Finde zuerst alles im Bestand, was ganz oder teilweise die Rolle eines
Kommandos einnimmt. Das kann anders heißen, etwa Aktion, Event,
Änderung, Mutation, Transaktion oder ein Undo Stack.

Sortiere danach jeden Fund in genau einen Korb.

TRÄGT. Erfüllt das Zielbild bereits. Nenne die Datei und warum.
UMBAU. Richtige Idee, falsche Ausführung. Nenne die Abweichung und den
kleinsten Umbau, der sie behebt.
FEHLT. Im Zielbild vorgesehen, im Bestand nicht vorhanden.

Beantworte zusätzlich diese Fragen am konkreten Code.
Wo verändert die Oberfläche heute direkt den Zustand, also am
Kommandoweg vorbei.
Welche Nutzeraktionen sind heute nicht rückgängig zu machen und warum.
Wie werden Objekte heute referenziert, GUID oder Index.
Werden Änderungen absolut oder relativ gespeichert.
Gibt es bereits Regelprüfungen und blockieren sie die Eingabe.
Existiert Geometrie als gespeichertes Ergebnis ohne Rückverweis auf
ihre Erzeugung.

Prüfe am Ende, ob das, was im Bestand schon trägt, auch für einen Fall
reicht, den es heute nicht gibt. Nimm dafür Auffüllung zwischen Gelände
und Planum.

## Ausgabe
Die drei Körbe als Listen mit Datei und Zeile.
Danach eine Aufwandsschätzung, wie viel Bestand erhalten bleibt und wie
viel neu entsteht, grob in Prozent.
Danach die Entscheidungen, die ich treffen muss, bevor umgebaut werden
kann.
Sag klar, ob der vorhandene Ansatz als Grundlage taugt oder ob ein
Neuaufbau billiger ist. Beschönige nichts.
