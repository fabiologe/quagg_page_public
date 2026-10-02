# Teil XXVIII — Bauwerke aus Vorlagen, Einbauten, Rigole

**Fahrplan, Stand 2026-10-02. Geplant, nicht gebaut.** Halt nach diesem Dokument;
gebaut wird erst nach Freigabe der Entscheidungen E31–E38.

Grundlage: Teil XXVII ([fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md](fahrplan-teil-xxvii-bauwerke-bearbeiten-2026-10-02.md),
Abschnitt 7 „Danach") und die offenen Szenarien in [planungsszenarien.md](planungsszenarien.md):
**P7** (RÜB, das Vollbild), **P8** (Rigole), **P5** (Stützwand, Schalungsfläche). Jede Aussage sagt,
ob sie **gemessen**, **gelesen**, **abgezählt** oder **eingeschätzt** ist.

---

## 0 · Das Ziel in einem Satz

Ein Becken entsteht aus **einer** Vorlage mit seinen Massen und wird über diese Masse geändert —
„lichte Länge 4,00 → 5,00" ist ein Kommando, kein Dutzend; dazu die Einbauten, die P7 und P8
noch fehlen.

---

## 1 · Vorprüfung

| # | Fund | Art | Beleg |
|---|---|---|---|
| **1** | **Eine Kammer kostet 21 Kommandos und 21 Rückgängig-Schritte** (7 Bauteile, 1 Bauwerk, 7 Zuordnungen, 6 Aufstellungen) | Lücke | gemessen: `abnahmeBearbeiten.test.js` (B7) |
| **2** | **Eine Kammer um 1 m verlängern kostet 9 Kommandos**: Querwand Ost verschieben, je zwei Ecken an Bodenplatte, Decke und Raum, je ein Endpunkt an beiden Längswänden — und niemand hält die neun zusammen | Lücke | abgezählt am Kammer-Bauplan |
| **3** | **Eine Bibliotheks-Vorlage kennt genau ein Rezept** (`{rezept, vorgaben}`); ein Bauwerk aus mehreren Teilen ist keine Vorlage | Lücke | gelesen: `katalog/Katalogschema.js` (`_vorlage`) |
| **4** | **Dieselbe Kommandofolge ein zweites Mal** wird abgelehnt („neu heisst neu", E2) — eine Vorlage, die neu auswerten soll, braucht „gleiche Kennung = neuer Stand desselben Teils" | Randbedingung | gelesen: `useBearbeitung.fuehreAus` |
| **5** | **Öffnungen und Durchführungen überleben eine Neuauswertung**, solange ihre Wand ihre Kennung behält: sie sitzen relativ (Station, Unterkante) und rechnen bei jedem Aufbau neu (B3, B4) | trägt | gemessen: B3-Test „Öffnung folgt ihrer Wand" |
| **6** | **Klassen und Ausführungen der Einbauten gibt es alle**: Rechen `IfcFilter/STRAINER` (mit `Quagg_Rechen`), Drossel `IfcValve/REGULATING` (mit `Quagg_Drossel`), Kieskörper `IfcCourse/FILTER`. Für **Bettung** und **Sauberkeitsschicht** passt keine Ausführung genau | trägt / Lücke | gemessen: `schema.predefined`, `vorlagen_fuer` |
| **7** | **`Quagg_Versickerung` ist belegt** — in P8 (Hohlraumanteil, Durchlässigkeit kf, Versickerungsfläche, Herleitung). *Berichtigung:* Teil XXVI (Z8) nannte den Satz „nirgends belegt" | Berichtigung | gelesen: `planungsszenarien.md` P8 |
| **8** | **Die Schalungsfläche** (P5) hat ihr Ziel: `Qto_WallBaseQuantities.GrossSideArea`. Kein Körpermass liefert sie heute | Lücke | gemessen: `schema.qto_vorlage('IfcWall')` |

---

## 2 · Entscheidungen vor dem Bauen

| # | Frage | Empfehlung | Verworfen |
|---|---|---|---|
| **E31** | **Woraus besteht eine Bauwerk-Vorlage?** | **Eingebaut als Code**: eine Funktion `werte → Teile je Rolle` (Rezept, Bauplanparameter, Stand auf welcher Rolle) — wie die Ableitungen (Teil XXIII, E1). Ihre WERTE sind Felder mit Vorgabe, geprüft wie Rezeptfelder. Eine Vorlage aus der Bibliothek kommt erst mit einer kleinen, geprüften Formelsprache — nicht in diesem Teil | Vorlagen als JSON mit Ausdrücken jetzt: ein zweiter Interpreter für zwei Vorlagen |
| **E32** | **Wie entsteht ein Bauwerk aus einer Vorlage?** | **Ein Kommando** `bauwerk-aus-vorlage` (Werte + `neu` für Bauwerk und je Rolle): ein Vorgang, ein Rückgängig. Das Bauwerk trägt `vorlage: { id, werte, rollen: { <rolle>: <Kennung> } }` | 21 Einzelkommandos in einem Sammelvorgang: die Rollen gingen verloren |
| **E33** | **Wie ändert man es?** | Am Bauwerk `vorlage-werte-setzen`: die Vorlage wird NEU ausgewertet, jede Rolle schreibt auf ihre Kennung — nur, was sich ändert. Was die Vorlage nicht steuert (Merkmale, Ausführung, Objekttyp, Öffnungen, zusätzliche Teile) bleibt | Bauwerk löschen und neu anlegen: alle Kennungen neu, alle Öffnungen verwaist |
| **E34** | **Und wenn jemand ein Teil von Hand geändert hat?** | **Nicht still überschreiben.** Die letzte Auswertung steht am Bauwerk; ein Teil, dessen gesteuerte Werte davon abweichen, wird beim Neuauswerten **übersprungen** und als Befund `vorlage_abweichung` genannt; das Werkzeug „An Vorlage angleichen" holt es zurück | Überschreiben mit Hinweis: die Handarbeit ist weg, bevor jemand den Hinweis liest |
| **E35** | **Lage-Verweise** (Wandachse folgt Plattenrand)? | **Nicht bauen.** Die Vorlage deckt Kammer und RÜB ab (Fund 2); allgemeine Lage-Bezüge wären ein Bedingungslöser. Erst bei einem Fall, den keine Vorlage trägt | Lage-Verweise jetzt: Mechanik ohne Szenario |
| **E36** | **Einbauten für P7** | Katalogrezepte aus den vorhandenen Bausteinen: **Rechen** (`IfcFilter/STRAINER`, Stäbe als Körper, `Quagg_Rechen`), **Drossel** (`IfcValve/REGULATING`, `Quagg_Drossel`), **Tauchwand** (Wand, `USERDEFINED` „Tauchwand"), **Bettung** und **Sauberkeitsschicht** als Platte mit `USERDEFINED` und Objekttyp — keine geratene Ausführung (Fund 6) | Eigene Klassen erfinden: gibt es in IFC nicht |
| **E37** | **P8 Rigole: wohin mit dem Hohlraumanteil?** | Als **Merkmal**, wie P8 vorschlägt: `Quagg_Versickerung` in den Katalog (Fund 7), Rezept „Rigole" (`IfcCourse/FILTER`); das **nutzbare Volumen** ist Körpervolumen × Hohlraumanteil — gerechnet, nicht getippt (Muster `lagemerkmale`: ein Merkmal aus Körpermass × Feld) | Als `IfcSpace`: ein Kieskörper ist nicht leer |
| **E38** | **Schalungsfläche (P5)** | Körpermass `seitenflaeche` = 2 × Länge × Höhe einer Wand (beide Seiten) → `GrossSideArea`; Stirnflächen gehören nicht dazu | Mit Stirnflächen: hängt am Anschluss, den das Rezept nicht kennt |

---

## 3 · Leitplanken

1. Erst messen, dann bauen — jede Stufe beginnt mit der Zahl von heute.
2. Ein Kommando, ein Vorgang, ein Rückgängig — auch für 20 Teile.
3. Kein Werkzeug kennt einen Bauteiltyp; Vorlagen kennen ihre Rollen, nicht die Werkzeuge.
4. Alte Journale bleiben lesbar; `vorlage` am Bauwerk ist additiv.
5. `backend/app/ifc/*` wirkt sofort — Schreiberstufen treffen das Gold.
6. Ein Commit je Stufe mit Test und Gegenprobe; kein Build, kein Push, kein pm2 ohne Zuruf.
7. Wird Kern über die genannten Stellen hinaus nötig → Befund, anhalten.

---

## 4 · Die Stufen

| Stufe | Inhalt | Fund | Art | Halbtage |
|---|---|---|---|---|
| **V0** | Messen und einfrieren (Funde 1–8 als Tests) | alle | Test | 1 |
| **V1** | Vorlagen-Register und Kommando `bauwerk-aus-vorlage` | 1, 3, 4 | Kern | 3 |
| **V2** | Vorlage **Rechteckkammer** (die Kammer aus Teil XXVI, Abschn. 6) | 1 | Katalog (Code) | 1 |
| **V3** | Neu auswerten: `vorlage-werte-setzen`, Abweichungen, „An Vorlage angleichen" | 2, 5 | Kern | 3 |
| **V4** | Vorlage **Zweikammer-RÜB** (der RÜB aus Z9.2, Trennwand und Schwelle als Rollen) | — | Katalog (Code) | 1 |
| **V5** | Einbauten: Rechen, Drossel, Tauchwand, Bettung, Sauberkeitsschicht | 6 | Katalog | 2 |
| **V6** | Rigole: `Quagg_Versickerung`, Rezept, nutzbares Volumen als Rechenmerkmal | 7 | Katalog + Kern klein | 2 |
| **V7** | Schalungsfläche: Körpermass `seitenflaeche` | 8 | Kern klein | 1 |
| **V8** | Abnahme: P7 aus der Vorlage, Masse geändert, Einbauten, IFC; Browserprobe | — | Test + Browser | 2 |
| | | | **Summe** | **16** |

### V1 · Vorlagen-Register und Kommando

- `services/vorlage/Bauwerksvorlagen.js`: Register eingebauter Vorlagen `{ id, titel, felder, rollen(werte) }`;
  `rollen` liefert je Rolle `{ rezept, kategorie, name, parameter, stehtAuf?: <rolle> }` — reine Funktion.
- Werkzeug `bauwerk-aus-vorlage` (Gruppe Erzeugen): Felder = Vorlage + Werte; `anwenden` schreibt das
  Bauwerk und je Rolle ein Teil (Kennungen aus `neu`), `teilVon` gesetzt, `hoeheVon` aus `stehtAuf`.
- **Zahl:** Kammer = **1 Kommando** (vorher 21), 1 Rückgängig; Paket gleich dem aus Teil XXVI
  (Beton 22,164 m³, Raum 30,000 m³), Kennungen je Rolle im Bauwerk.

### V3 · Neu auswerten

- `vorlage-werte-setzen` am Bauwerk: neue Werte → `rollen(werte)` → je Rolle ein `erzeugt` auf ihre
  Kennung, nur bei Änderung; Felder ausserhalb der Vorlage bleiben. Höhenfolgen (B5) laufen mit.
- Abweichung: die letzte Auswertung je Rolle steht am Bauwerk; weicht ein gesteuerter Wert ab →
  übersprungen, Befund `vorlage_abweichung` mit Rolle und Feld; Werkzeug „An Vorlage angleichen".
- **Zahl:** lichte Länge 4,00 → 5,00 = **1 Kommando** (vorher 9); Beton 22,164 → **26,004 m³**
  (Platte 5,60 · 3,60 · 0,40 = 8,064; Längswände 2 · 5,60 · 0,30 · 2,50 = 8,400; Querwände 4,500;
  Decke 5,60 · 3,60 · 0,25 = 5,040); Raum 30,000 → 37,500 m³; eine Öffnung in der Längswand Nord
  bleibt an Station und Kennung.

### V8 · Abnahme

P7 so weit, wie dieses Modell reicht: Zweikammer-RÜB aus der Vorlage mit Schwelle 212,40, Rechen im
Zulauf, Drossel, Tauchwand, Bettung und Sauberkeitsschicht; Zulauf und Ablauf mit Durchführungen;
lichte Länge so geändert, dass **2 × Kammervolumen = 250 m³ ± 1 %** (aus `IfcSpace.NetVolume`, nicht
eingegeben). IFC: Prüftor sauber, IDS 0 von 18. Browserprobe wie Z9.4/B7.

---

## 5 · Was nicht gebaut wird

- Lage-Verweise (E35) und Vorlagen aus der Bibliothek mit Formeln (E31).
- Bemessung nach DWA-A 128 / A 138: die Werte (V, Q_Dr, Schwellenhöhe) bleiben **Eingaben** (P7).
- Ports (S8), die Zerlegung des Schachts (P6, E21), Bewehrung, Fugen, Statik.

## 6 · Zwischenstände

- **Nach V2 (≈ 2½ Tage):** eine Kammer in einem Kommando.
- **Nach V3 (≈ 4 Tage):** eine Kammer über ihre Masse ändern — der eigentliche Hebel.
- **Nach V5 (≈ 6 Tage):** P7 ist modellierbar.

**Heute realistisch:** V0 und V1.
