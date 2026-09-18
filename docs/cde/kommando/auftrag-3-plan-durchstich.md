<!-- Fabios Auftrag, wörtlich (2026-09-18). Nur die drei Pfad-Platzhalter sind gefüllt. Pfade relativ zur Wurzel des Repos. -->

# Plan Durchstich Achse ziehen

Lies die Kommandodefinition unter docs/cde/kommando/kommandodefinition.md und beide
Auditberichte.
Du implementierst nichts. Du lieferst einen Umsetzungsplan.

## Ziel
Ein einziges Muster läuft vollständig durch alle Schichten. Kein
zweites Muster, keine Sonderfälle, keine Bequemlichkeiten.

## Abnahmekriterium
Zwei Schächte lassen sich setzen, eine Haltung dazwischen ziehen,
die Sohlhöhen ändern. Das Gefälle wird berechnet und die Haltung wird
markiert, sobald das Mindestgefälle unterschritten ist.
Alles davon muss ohne Oberfläche auslösbar sein, allein über Kommandos.

## Vorgaben
Die Oberfläche ist Wegwerfcode und darf hässlich sein.
Das Modell ist Bestand und wird sauber gebaut.
Die Haltung entsteht aus Muster Achse ziehen plus Katalogeintrag, nicht
aus einem eigenen Haltungswerkzeug.
Das Mindestgefälle steht im Katalog, nicht im Code.
Die Geometrie wird als Rezept gespeichert, nicht als Ergebnis.

## Aufgabe
1. Zerlege den Durchstich in Arbeitsschritte, die einzeln committet
   werden können. Jeder Schritt endet mit einem prüfbaren Zustand.
2. Nenne pro Schritt die betroffene Schicht und die berührten Dateien.
3. Beschreibe die Prüfung ohne Oberfläche, also welche Kommandofolge
   den Abnahmefall auslöst und welcher Zahlenwert herauskommen muss.
4. Markiere jeden Schritt als Kernarbeit oder Wegwerfcode.
5. Nenne die Stelle mit dem größten Risiko und was passiert, wenn die
   Annahme dort falsch ist.

## Ausgabe
Der Plan als nummerierte Schritte mit Aufwandseinschätzung in
Halbtagen, danach eine kurze Aussage, welche Schritte heute realistisch
sind und wo ein sinnvoller Zwischenstand liegt.
Wenn die Kommandodefinition für diesen Durchstich nicht ausreicht, sag
das vor dem Plan und nenne genau die fehlende Stelle.

---

<!-- Aus der ersten Fassung desselben Auftrags: die Vorprüfung. -->

## Aufgabe
Prüfe, wie weit der Abnahmefall mit dem heutigen Stand bereits
durchläuft. Gehe ihn Schritt für Schritt durch, vom Setzen des ersten
Schachts bis zur Markierung der Haltung, und sag bei jedem Schritt, ob
er heute funktioniert, teilweise funktioniert oder fehlt.
Nenne den ersten Schritt, an dem es bricht, und warum genau dort.
Erst danach den Plan für die verbleibende Strecke.
