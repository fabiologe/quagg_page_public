# Testliste für Fabio — Teil XXVI bis XXVIII (2026-10-03 morgens)

**Wo:** quagg-engineering.org/cde, Testprojekt **42069 BlazeIT** (nie 1337) — oder ohne Projekt. In Firefox.
**Vorher:** alle offenen CDE-Tabs neu laden. Das Journal schreibt jetzt Stufe 6 (Bauwerke); ein alter Tab liest es
nur noch und zeigt das Banner „neu laden".
Fürs Ausgeben braucht es ein geladenes Modell mit Koordinatenbezug (z. B. ein Gelände).

Neben jedem Punkt steht, was herauskommen soll. **Fett** sind die Punkte, die ich NICHT selbst im Browser gefahren habe —
die zuerst.

---

## A · Zuerst: was nur du prüfen kannst

1. **Griffe mit der Maus** — Kammer aus Vorlage anlegen (B1), eine Wand wählen, „Bearbeiten":
   - Griff „Dicke" quer ziehen → die Wand wird dicker, die Pille nennt den Wert.
   - Griff „Wandhöhe" nach oben ziehen → die Wand wächst; die Decke auf ihr folgt mit (steht auf der Längswand Nord).
   - Bauwerk wählen → ein Griff in der Mitte: ziehen verschiebt die ganze Kammer.
2. **Ausgeben über den Server** (42069) — die Kammer oder den RÜB ausgeben:
   - Im Register ein neues Dokument, Prüfbericht ohne Fehler, IDS 0 von 18.
   - Die IFC in einem anderen Betrachter öffnen (BIMvision, Solibri o. ä.): eine Anlage „RÜB" mit den Bauteilen darin,
     zwei Räume, Öffnungen als Löcher in den Stirnwänden.
3. **Tablet** (falls zur Hand): Kammer aus Vorlage mit einem Tipp setzen, Werte ändern über das Formular.

## B · Bauwerk aus einer Vorlage (Teil XXVIII)

1. Werkzeugleiste „Erzeugen" → **„Rechteckkammer aus Vorlage"** → ein Klick ins Gelände (Aussenecke Nordwest).
   → Eine Kammer: Bodenplatte, 4 Wände, Decke, Raum; im Strukturbaum alles unter „Kammer". Verlauf: **ein** Eintrag.
2. Strg+Z → die ganze Kammer ist weg (ein Schritt). Strg+Y → wieder da.
3. Kammer wählen → „Werte der Vorlage ändern" → lichte Länge 4 → 5.
   → Platte, Längswände, Querwand Ost, Decke, Raum wachsen mit; Mengen: Beton 26,004 m³, Raum 37,5 m³.
4. Eine Wand von Hand dicker machen („Dicke ändern"), dann wieder die Länge ändern.
   → Diese Wand bleibt, wie sie ist; am Bauwerk steht ein Befund „weicht von der Vorlage ab".
   → „An Vorlage angleichen" → die Wand passt wieder, der Befund ist weg.
5. Kammer drehen (z. B. 30°) und spiegeln, danach die Länge ändern.
   → Die Kammer wächst in ihrer neuen Lage, sie springt nicht zurück.
6. Kammer kopieren → an der Kopie die Länge ändern → nur die Kopie ändert sich.
7. **„Zweikammer-RÜB aus Vorlage"** → ein Klick.
   → Zwei Kammern, Trennwand, Schwelle oben auf der Trennwand (Krone = OK Platte + 2,40), Decke.
   → „Werte der Vorlage ändern": Schwellenkrone 2,40 → 2,20 → Trennwand niedriger, Schwelle folgt,
     Betriebswasserspiegel beider Kammern im Eigenschaftsfenster = neue Krone.
   → Lichte Länge 16,67 → Raum-Mengen zusammen ≈ 250 m³.
8. Ungültige Werte: Schwelle 2,5 bei Krone 2,4 → abgelehnt mit Grund („Trennwand hätte keine Höhe").

## C · Einbauten und Rigole (Teil XXVIII)

1. „Rechen zeichnen" quer durch eine Kammer → Eigenschaften: IfcFilter / STRAINER, Stababstand, Reinigung.
2. „Drossel zeichnen" (DN 200, Q_Dr 25 l/s) → im ausgegebenen IFC steht Q_Dr als 0,025 m³/s.
3. „Tauchwand zeichnen" (Unterkante über der Sohle) → hängt von oben; Objekttyp „Tauchwand".
4. „Sauberkeitsschicht" und „Bettung" unter die Platte → Platten mit Objekttyp; Mengen stimmen (Fläche × Dicke).
5. „Rigole zeichnen" 20 × 2 m, Höhe 1,2, Hohlraumanteil 30 %.
   → Ohne Hohlraumanteil lässt sie sich nicht anlegen.
   → Im IFC: IfcCourse / FILTER, Quagg_Versickerung.NutzbaresVolumen 14,4 (gerechnet).
6. Mengen-Reiter / Eigenschaftsfenster einer Wand: **GrossSideArea** = Länge × Höhe (eine Seite).

## D · Bauwerke bearbeiten (Teil XXVII)

1. Öffnung in eine Wand setzen (rund Ø 0,30 oder rechteckig) → ein Loch in der Wand; die Wand bleibt im Bauwerk;
   im Strukturbaum steht die Öffnung unter ihrer Wand.
2. Ein Rohr durch eine Wand zeichnen → „Rohrdurchführung setzen" → Loch genau dort, wo die Rohrachse die Wand kreuzt.
3. Bodenplatte anheben (verschieben, Höhe +0,20) → Wände, Raum und Decke kommen mit; eine Öffnung bleibt an ihrer Stelle in der Wand.
4. Werkzeuge an einem Bauteil, das nicht passt, fehlen in der Leiste (z. B. „Haltung teilen" an einer Wand) — und die Leiste sagt warum.

## E · Bauwerke aus Bauteilen (Teil XXVI)

1. Wand, Platte, Raum, Überlaufschwelle von Hand zeichnen → „Bauwerk anlegen" → Teile zuordnen → Strukturbaum zeigt sie darunter.
2. Bauwerkstyp RRB / RÜB wählen → im IFC eine Klassifizierung mit Quelle.
3. „Aus Bauwerk lösen" → das Teil steht wieder frei an der Site; „Zu Bauwerk hinzufügen" ordnet es wieder zu.

## F · Nebenbei achten auf

- Konsole (F12) bei allen Schritten: keine roten Fehler.
- Firefox: Auswahllisten (Vorlage, Rolle beim Angleichen) öffnen sich richtig.
- Bekannt und harmlos: ein Rohr ohne Schacht und ohne Gefälle bekommt die Hinweise „Gefälle zu flach" und „loses Ende".

Funde bitte mit Schritt-Nummer (z. B. „B5: Kammer springt nach dem Drehen").
