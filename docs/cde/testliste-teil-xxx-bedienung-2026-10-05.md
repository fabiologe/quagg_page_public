# Testliste für Fabio — Teil XXX Bedienung (B8, 2026-10-05)

**Wo:** quagg-engineering.org/cde — **erst nach einem Build** (Teil XXX ist committet bis `001fa8e`, nicht gebaut,
nicht gepusht; Teil XXIX ist ebenfalls noch nicht live). In **Firefox**, danach auf dem **Tablet**.
**Projekt:** zum Zeichnen ohne Projekt oder 42069 (nie 1337); für Schichten, Massen und Befunde der Teich in **10001**.
**Vorher:** alle offenen CDE-Tabs neu laden.

Neben jedem Punkt steht, was herauskommen soll. **Fett** ist, was ich NICHT im Browser gefahren habe (Firefox, Tablet,
echte GPU) — die zuerst.

---

## A · Zuerst: was nur du prüfen kannst

1. **Tempo mit echter Grafikkarte** (10001): ein Kommando, das nur ein Bauteil ändert (z. B. eine Wand dicker) —
   wie lange, bis das Bild steht? Gemessen im Headless-Chrome ohne GPU und unter Last: rund 4–5,6 s (vorher ≈ 20 s).
   Eine Zahl von dir mit Firefox und GPU ist die erste echte.
2. **Tablet:** Wand zeichnen mit dem Finger — in der Tafel „Rechtwinklig" an, Länge 5 tippen, „Punkt setzen".
   → Die Wand ist genau 5 m lang und steht in Ost/Nord. Alle Knöpfe ≥ 40 px, kein Ziel unter dem Daumen verdeckt.
3. **Tablet:** „Mehrere wählen" in der Tafel → zwei Bauteile antippen → „Löschen" → beide weg, ein Schritt im Verlauf.
4. **Firefox:** Umschalt halten beim zweiten Punkt → rechter Winkel; die Pille sagt „rechtwinklig".

## B · Platz und Ergebnis (B1, B2, B6)

1. Modell laden → die Tafel „Bauteil" steht offen, die Palette ist zu sehen (kein Klick nötig).
2. „Wand" → zwei Klicks in die Bildmitte, Enter.
   → Das Formular steht rechts in der Tafel, nicht im Bild; die Mitte bleibt frei.
   → Danach ist die neue Wand gewählt, die Kamera kehrt in die Ansicht von vorher zurück.

## C · Tasten (B3)

1. Eigenes Bauteil wählen → **Entf** → weg, Meldung mit „Rückgängig". **Strg+Z** → wieder da.
2. **Strg+C**, **Strg+V** → die Kopie hängt am Zeiger, ein Klick setzt sie; danach ist sie gewählt. **Strg+D** = beides.
3. **Strg+A** → der ganze Eigenbau gewählt. **Umschalt-/Strg-Klick** nimmt dazu oder heraus.
4. Beim Zeichnen gehören die Tasten dem Werkzeug: Rücktaste nimmt den letzten Punkt, Enter schliesst ab.

## D · Präzise zeichnen (B5)

1. Wand zeichnen, den ersten Punkt knapp neben das Ende einer vorhandenen eigenen Wand setzen.
   → Er rastet genau darauf ein; die Pille nennt den Fang („→ Wand · Punkt 2").
2. Nach dem ersten Punkt **„5", Enter** → zweiter Punkt 5 m weit in Zeigerrichtung. **„4", Tab, „90", Enter** → 4 m
   nach Nord. Rücktaste/Esc nehmen erst das Getippte zurück, nicht den Punkt.
3. Die Pille sagt beim Zeichnen „L 12,34 m · 37,5°".

## E · Am Objekt weiter (B7) — im Teich 10001, Bearbeiten an

1. In der Bearbeitungsmarke oben steht „n Befunde" (in 10001: 4). Marken (Stiel + Ring) über den Bauteilen.
   → Ein Klick auf „4 Befunde" wählt das erste Bauteil und sagt in der Meldung, was nicht stimmt; noch ein Klick → das
   nächste.
2. Tondichtung wählen → „Ecken ziehen" → 4 Griffe auf der Oberkante. Eine Ecke ziehen.
   → Die Pille nennt neben den Kantenlängen das **Volumen**, das nach dem Loslassen gilt (z. B. „Volumen 741 m³ (−116)").
   → Loslassen: die Schicht folgt, Klasse und Vorlage bleiben (Tafel: „Aus Vorlage Tondichtung").
   → **Achtung, das schreibt ins Projekt** — danach Strg+Z.
3. Dasselbe am Wasserkörper „Dauerstau": die Griffe sitzen auf dem Spiegel.

## F · Was sich NICHT geändert haben darf

- Gelände, Erdkörper und Umrisse sehen nach einem Kommando aus wie vorher (Bildvergleich vor/nach B4: 0 Pixel
  Unterschied).
- Ausgeben: dieselben Mengen wie vorher.

**Bekannt offen:** eigene Körper ohne Hülle im Beziehungsindex (Fund aus B4, eine Zeile, eigener Schritt); Marken für
Befunde an Geliefertem; eine Marke selbst antippen (der Zähler springt stattdessen).
