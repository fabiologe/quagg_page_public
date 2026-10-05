# Testliste für Fabio — Teil XXXI Tablet first (T9, 2026-10-05)

**Wo:** quagg-engineering.org/cde — **erst nach einem Build** (live ist T1 `acf0d9e`; T2–T8 sind committet bis
`7fd8f62`, nicht gebaut, nicht gepusht). Zuerst auf dem **iPad hochkant**, danach in **Firefox**.
**Projekt:** zum Zeichnen ohne Projekt oder 42069 (nie 1337); für Schicht und Raum der Teich in **10001** (schreibt dort —
danach Strg+Z bzw. Rückgängig im Verlauf).
**Vorher:** alle offenen CDE-Tabs neu laden.

Neben jedem Punkt steht, was herauskommen soll. **Fett** ist, was ich NICHT so fahren konnte, wie du es tust (echtes
iPad mit Safari, echter Finger, echte GPU) — die zuerst. Gemessen habe ich mit einem simulierten iPad (820 × 1180,
Touch über das Chrome-Protokoll) und mit Maus und Tastatur.

---

## A · Zuerst: was nur du prüfen kannst

1. **iPad, Wand antippen im Bearbeiten-Modus** → sofort stehen alle Griffe (Ecken, Kanten, Drehen, Höhe, Dicke,
   Verschiebe-Pfeile), jeder etwa fingerkuppengross; die Tafeln unten klappen auf ihre Köpfe zusammen, das Bild nimmt
   gut 80 % des Schirms. Lassen sich die Griffe mit dem Finger treffen, ohne dass der Nachbar kommt?
2. **iPad, einen Pfeil mit dem Finger ziehen, OHNE vorher zu halten** → die Wand folgt sofort, die Kamera steht still.
   Daneben (auf freiem Gelände) dreht derselbe Finger wie gewohnt die Kamera. Fühlt sich das richtig an — oder greift
   man zu oft aus Versehen einen Griff, wenn man die Kamera meint?
3. **iPad, den Höhengriff der Wand antippen** (der Punkt oben in der Mitte) → daneben das Feld „Wandhöhe 2,500 m";
   ins Feld tippen → die **Zahlentastatur** von Safari kommt; „3,1", Enter → die Wand ist 3,10 m hoch.
   (Safari zeigt die Tastatur erst beim Tipp ins Feld — das darf eine Webseite nicht erzwingen.)
4. **Mit echter Grafikkarte:** nach jedem Loslassen — wie lange steht „Wird übernommen …" mit der Plananimation?
   Gemessen headless und unter Last: 1–5 s.

## B · Die Übernahme sichtbar (T1 — schon live)

1. Einen Griff ziehen und loslassen → der blaue Geist bleibt am neuen Ort, unten mittig „Wird übernommen …" mit der
   Plananimation, die Tafel zeigt dasselbe; erst wenn das Bild steht, verschwinden Geist und Anzeige.
2. Während „Wird übernommen …" steht, nimmt die Zeichenfläche nichts an (kein zweiter Zug am alten Stand).

## C · Griffe beim Antippen, in Fingergrösse (T2, T3)

1. Ohne Bearbeiten-Modus: ein Tipp wählt nur aus — keine Griffe.
2. Mit Bearbeiten-Modus: ein Tipp auf eine Wand → alle Griffe der Wand (vorher: keiner, bis man ein Werkzeug wählte).
3. Weit herauszoomen und wieder hinein → die Griffe bleiben auf dem Schirm gleich gross (vorher 3 px in der Übersicht).
4. Einen Griff ziehen → danach stehen wieder ALLE Griffe der Wand, nicht nur die eine Familie.
5. Ein Werkzeug aus der Tafel wählen (z. B. „Drehen") → nur dessen Griff steht, nach dem Zug bleibt es scharf (wie
   bisher).
6. Ein Erdkörper (Aushub) angetippt → seine Ecken stehen sofort; ein Griff, der den ganzen Vorgang verschiebt, nicht.

## D · Sofort ziehen, aber ein Tipp schreibt nicht (T4)

1. Auf einen Griff tippen (aufsetzen, loslassen, ein bisschen zittern) → nichts wird geschrieben, „Verlauf" zählt nicht
   hoch.
2. Den „+" an einer Kante antippen → ein Stützpunkt kommt dazu; den „+" antippen und den Finger weit wegziehen →
   nichts passiert.

## E · Hochkant (T5)

1. Hochkant, Bearbeiten an, Wand angetippt → beide Blätter unten nur noch als Kopf.
2. Einen Kopf antippen → das Blatt klappt auf und bleibt offen, bis du ein anderes Bauteil wählst.
3. Quer (oder am Rechner) → nichts klappt ein.

## F · Die fehlenden Griffe (T6)

1. Eigenes Rohr gewählt → ein Griff am Rohrrand quer zur Achse; ziehen ändert die DN (ganze mm). Dasselbe am eigenen
   Schacht (Griff in halber Tiefe).
2. Eigener Pfosten → ein Griff auf dem Kopf; hochziehen = länger.
3. **10001, Teich:** eine Schicht (z. B. Tondichtung) → ein Höhengriff über der Mitte; 20 cm hochziehen → Dicke
   +0,20 m, das Volumen in der Tafel wächst. Der Wasserkörper „Dauerstau" → ein Griff auf dem Spiegel; hochziehen =
   höherer Spiegel (m NN). **Schreibt ins Projekt — danach zurücknehmen.**

## G · Knoten (T7)

1. Zwei eigene Wände, die sich an einer Ecke treffen (die zweite mit dem Fang genau an die Ecke der ersten zeichnen).
   Erste Wand angetippt → die Ecke ist **grün**. Ziehen → beide Wände gehen mit, ein Rückgängig nimmt beides zurück.
2. Die grüne Ecke antippen → daneben „Knoten lösen (1)"; antippen → er heisst „Knoten verbinden", die Ecke ist nicht
   mehr grün; ziehen → nur die erste Wand geht. Ein anderes Bauteil wählen → wieder verbunden.
3. Die Kante (Mitte) der ersten Wand ziehen → die zweite folgt an ihrem Ende.
4. Zwei Platten nebeneinander mit gemeinsamer Kante → die gemeinsame Kante ziehen → beide Ecken der Nachbarplatte
   gehen mit.
5. **Eigenes Rohr an einem GELIEFERTEN Schacht** (mit dem Knotenfang angeschlossen) → das Rohrende ist grün; ziehen →
   der gelieferte Schacht wandert im Grundriss mit (seine Höhe bleibt), seine gelieferten Haltungen gehen als Forderung
   an den Planer („wie Schacht verschieben"). Im Verlauf ein Schritt. — **Nur im Test geprüft, nicht im Browser.**

## H · Die Zahl am Griff (T8)

1. Höhengriff einer Wand antippen → Feld „Wandhöhe"; Komma oder Punkt; eine falsche Zahl → rot, „Übernehmen" gesperrt.
2. Eckpunkt antippen → Rechtswert, Hochwert, Höhe; 1 m weiter tippen → der Punkt sitzt genau dort (im Knoten mit).
3. Drehgriff antippen → „Drehen um 0°"; 90 → die Wand steht quer.
4. Einen Verschiebe-Pfeil antippen → „um … m"; 2 → die Wand liegt 2 m weiter in Pfeilrichtung.
5. Esc oder ein Tipp daneben schliesst das Feld; am rechten Bildrand geht es links vom Griff auf.
6. Das Namensschild der Auswahl („WALL …") liegt über den Griffen, nicht auf dem Höhengriff.

## I · Was sich NICHT geändert haben darf

- Maus und Tastatur aus Teil XXX: der Bedien-Messlauf zeigt 19 von 19 Werten wie nach T1 (Wand zeichnen, das Neue ist
  gewählt, Kamera zurück, Entf, Strg+Z, Strg+C/V, Strg+A, Fang 0 mm, Länge tippen, Rechtwinklig).
- Ausgeben: dieselben Mengen wie vorher.
