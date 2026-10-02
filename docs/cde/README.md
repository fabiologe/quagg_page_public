# Quagg-CDE — Dokumentation

Die CDE ist die gemeinsame Datenumgebung dieses Büros **und** das Werkzeug, in
dem geplant wird. Beides zusammen ist ihr Besonderes und der Grund, warum sie
sich nicht mit einer gekauften CDE vergleichen lässt.

## Zuerst lesen

| Datei | was drinsteht |
|---|---|
| **[mussleistungen.md](mussleistungen.md)** | **Was eine CDE können muss** — M1–M24, Soll aus DIN EN ISO 19650-1 (belegt), Ist am Code gemessen, Lücken nach Schmerz geordnet |
| **[planungswerkzeug.md](planungswerkzeug.md)** | **Das Planungs- und Bearbeitungswerkzeug** — die sechs Begriffe (Bauform · Rezept · Eigenschaftsart · Werkzeug · Operation · Ableitung), die Hausgesetze, die zehn Wächter, und der Entscheidungsbaum zum Erweitern |
| **[planungsszenarien.md](planungsszenarien.md)** | **Zehn konkrete Fälle** mit Zahlen — P1–P4 tragen heute, P5–P8 fordern Entwicklung, daraus die abgeleitete Reihenfolge |
| **[ifc-sonderbauwerk.md](ifc-sonderbauwerk.md)** | **Sonderbauwerke in IFC** — warum es keine Beckenklasse gibt und wie ein Regenüberlaufbecken stattdessen entsteht; jede Klasse gegen das Schema geprüft |

## Etappen und Durchstiche

| Datei | was |
|---|---|
| **[fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md](fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md)** | **Teil XXVII — Bauwerke bearbeiten:** Vorprüfung mit sechs gemessenen Funden (zwei Fehler, die heute bestehen: Kanalgraben an einer Wand, Aussparung wirft die Wand aus dem Bauwerk), Entscheidungen E24–E30, Stufen B0–B7 (≈ 20 Halbtage). **Geplant, nicht gebaut** |
| **[fahrplan-teil-xxvi-bauwerke-2026-10-01.md](fahrplan-teil-xxvi-bauwerke-2026-10-01.md)** | **Teil XXVI — Bauwerke aus Bauteilen:** Vorprüfung mit sieben Funden (zwei Fehler, die heute bestehen), Entscheidungen E17–E23, Stufen Z0–Z9, Abnahmefall Kammer. **komplett: Z0–Z9.4 gebaut und abgenommen**, Funde 8–12 behoben |
| [kommando/](kommando/) | **Teil XXIV, Kommandodefinition** — Aufträge, zwei Audits, Abgleich, Entscheidungen E1–E9, das angenommene Schema, die Durchstiche K1–K10 und die beiden Wiederholungsproben. Eigene README |
| [tragfaehig-2026-09-24.md](tragfaehig-2026-09-24.md) | Etappe „Tragfähig" — stille Rückfälle, CI, ProVI-Achsen, Gelände zweiseitig |
| [viewer/](viewer/) | Viewer-Kur — Bestandsaufnahme und Kur (Kamera, Gelände, Griffe, Gizmo) |
| [erdbau-2026-09-19.md](erdbau-2026-09-19.md) | Erdbau-Nachträge: Ecken als Maß, Gerinne-Schnitt, Profilkörper |
| [../ifc/](../ifc/) | Das Prüftor, Schema-Wahrheit, IDS |

## Die Regeln, die über allem stehen

Sie stehen auch in `CLAUDE.md`, gehören aber hierher, weil sie den Umgang mit
diesen Dokumenten bestimmen:

1. **„Erledigt" heißt nachgeprüft** — eine Zahl vorher und eine nachher, nicht
   „Tests grün".
2. **Eine Regel und ihre Kur messen dieselbe Größe.** Sonst meldet die Kur
   Erfolg, und der Befund steht weiter.
3. **Tests prüfen die ECHTE Schnittstelle.** Baut ein Test seine Eingabe selbst,
   prüft er sich selbst.
4. **Jedes Wissen an einem Ort.** Zwei Orte für dieselbe Zahl sind ein Befund,
   auch wenn beide stimmen.
5. **Nachschlagen statt raten** — IFC-Klassen gegen
   `backend/app/ifc/daten/schema_IFC4X3_ADD2.json` oder den MCP-Server `ifc`,
   Normwerte gegen die Bibliothek. Jede Aussage sagt, ob sie **gemessen**,
   **gelesen** oder **eingeschätzt** ist.
6. **Beschönige nichts.** „Teilweise bestanden" ist ein gültiges Ergebnis.

## Wo der nächste Schritt steht

**[fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md](fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md)** — Teil XXVII, Bauwerke bearbeiten:
Bauwerk als Ganzes bewegen, Öffnungen als `IfcOpeningElement`, Höhen, die einander folgen,
Griffe aus dem Katalog. Entscheidungen E24–E30 offen; geplant, nicht gebaut.
