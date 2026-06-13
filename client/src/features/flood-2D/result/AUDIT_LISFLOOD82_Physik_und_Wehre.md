# Audit: LISFLOOD‑FP 8.2 – Physikalische Korrektheit, Input‑Plausibilität & Wehr‑Verdacht

**Datum:** 2026‑06‑13   **Pfad im Fokus:** Echter RunPod/Docker LISFLOOD‑FP 8.2 (engine `v8`)
**Auslöser:** Verdacht „der letzte Fix hat etwas in der Logik geändert – Wehre werden einfach durchströmt".

> **Pipeline-Walkthrough** (Solver-Verdrahtung, Docker, LISFLOOD-8.0.3-Referenz, Datei-Fluss):
> `backend/app/api/flood2D/engines/docker/README.md`.
> Dort auch der strukturelle Befund: Docker baut **8.0.3** (nicht 8.2), und `weir_flow.cpp` ist nur im
> Backend-Baum hand-gepatcht (`QUAGG-FIX`) — der deployte Solver weicht vom Client-Baum ab.

---

## 0. Kurzfazit (TL;DR)

1. **Der vermutete Wehr‑Bug ist im Input‑Generator NICHT reproduzierbar.** Die v8‑Wehr‑Re‑Diskretisierung erzeugt lückenlose, richtungs‑korrekte Zellen; alle Tests (`test_structure_discretize.mjs`, `test_inputgenerator_v8.mjs`) bestehen.
2. **Drei der zuvor gemeldeten „Bugs" sind Fehlalarme** – gegen den echten LISFLOOD‑Quellcode verifiziert:
   - Wehr‑Koordinaten „müssten Gitterindizes sein" → **falsch**, LISFLOOD liest Weltkoordinaten (`input.cpp:165`).
   - Regen „mm/h vs m/s Mismatch" → **falsch**, LISFLOOD erwartet mm/h (`input.cpp:2109‑2111`).
   - Infiltration‑Einheit → **falsch**, skalares Keyword erwartet m/s (`lisflood.cpp:520`), genau das schreiben wir.
3. **„Der letzte Fix" = die noch nicht committeten Änderungen** an `InputGenerator.js` (`03fd4bc..8702e82`): v8‑Re‑Diskretisierung, SGC‑Export, Export‑Resampling. Das ist der richtige Verdachtsort – aber die Logik darin ist korrekt.
4. **Damit liegt die Ursache von „durchströmten Wehren" – falls real – außerhalb der JS‑Input‑Erzeugung.** Wahrscheinlichste verbliebene Kandidaten am realen Solver: (a) gewähltes Solver‑Schema, (b) Wehr‑Krone `hc` relativ zum **resampleten** DEM, (c) Verwechslung mit Brücken (`<dir>B` = Orifice, lässt bewusst Wasser durch). Diagnose‑Rezept siehe §5.

---

## 1. Wie die LISFLOOD‑Wehr‑Physik wirklich funktioniert

Quelle: `solverHydro/.../LISFLOOD-FP-trunk/weir_flow.cpp` + `input.cpp`.

- **Datei‑Format** (`flow.weir`): erste Zeile = Anzahl, dann je Zeile `x y dir Cd hc m w`.
  `x,y` sind **Weltkoordinaten** (Zellzentrum). LISFLOOD rechnet selbst in Zellindizes um:
  `input.cpp:165` `xi=(int)((x-blx)/dx)`, `yi=(int)((tly-y)/dy)`. → **Unsere Weltkoordinaten sind korrekt.**
- **Physik (Poleni):** Strömung nur wenn Wasserspiegel die Krone übersteigt **und** Zelle nass ist:
  `if ((h0+z0) > Weir_hc && h0 > 0)`. Freiabfluss `Q = Cd·w·hu^1.5`, Rückstau `Q = Cd·w·hu·√(hu−hd)/√m`.
  `hu = (h+z)_oben − hc` (Überfallhöhe). **hc ist die absolute Kronenhöhe in m NHN.**
- **Ersetzt den Normalfluss:** An Wehr‑Zellflächen wird der reguläre Fluss durch den Wehr‑Fluss **ersetzt**, nicht addiert:
  `fp_flow.cpp:47` `if(weirs==ON && *wiptr!=-1) *qptr=CalcWeirQx(...)`. Gilt in **allen** Schemata:
  `fp_flow.cpp` (acceleration), `sgc.cpp:749/779` (Sub‑Grid), `lisflood2/lisflood_processing.cpp` (fv, Guards an Zeilen 84/94/346/384/601/639). → **Kein Schema „durchströmt" ein korrekt gesetztes Wehr.**

**Korrektheits‑Bedingung für ein wirksames Wehr:** `hc` muss über den Bett‑/DEM‑Höhen `z0,z1` der beiden Nachbarzellen liegen. Das stellt der Editor sicher: `WeirTool.vue:130` validiert `hc > terrainZ`, `:155` setzt Default `hc = terrainZ + 5.0`.

---

## 2. Input‑Plausibilität (Garbage‑in‑Check) – Befund pro Datei

| Datei / Keyword | Einheit erwartet (Quelle) | Was wir schreiben | Verdikt |
|---|---|---|---|
| `flow.weir` `x,y` | Weltkoord. (`input.cpp:165`) | Weltkoord. Zellzentrum | ✅ korrekt |
| `flow.weir` `hc` | abs. m NHN | terrainZ+5, validiert | ✅ korrekt |
| `rain.txt` | mm/h (`input.cpp:2111`) | mm/h (`generateRainFile`) | ✅ korrekt |
| `infiltration` (skalar) | m/s (`lisflood.cpp:520`) | m/s · (1−Moisture%) | ✅ korrekt |
| `fpfric` / `manningfile` | Manning n | 0.015–0.10 je Material | ✅ plausibel |
| `.bci/.bdy` QVAR | m²/s pro Zelle | Q/(N·cs) Flux‑Split | ✅ korrekt (Σ = Q) |
| `SGCbed/bank/width` | m NHN / m | interpoliert, Bank=DEM | ✅ korrekt |

**Verbleibende, echte Schwachstellen (kein „garbage", aber Risiko):**

- **R1 – Interner FREE‑Auslass = HFIX(terrain−0,01 m).** `InputGenerator.js:16`. Sobald der Wasserspiegel das Gelände übersteigt, wirkt das wie ein künstliches Wehr auf Geländehöhe → kann Abfluss innerer Auslässe drosseln. Domänenkanten (native N/S/E/W FREE) sind nicht betroffen.
- **R2 – CFL wird nicht erzwungen.** `initial_tstep` ist frei wählbar; nur die UI warnt (`Flood2DSolverRunner.vue:203` `dtMax = cs/√(g·h)`). Garbage‑in möglich, wenn der Nutzer dt zu groß wählt → negative Tiefen.
- **R3 – Einheitliche Krone pro Wehr‑Linie.** v8 nutzt `first.hc` für die ganze Linie (`InputGenerator.js:1297`); bei Wehr über Hang werden Unterschiede nur gewarnt (`:1290`), nicht zellweise abgebildet.

---

## 3. Wie Instabilität in den Solvern entsteht (und was jeder braucht)

| Solver / Schema | Aufruf | Stabilitäts‑Mechanik | Mindest‑Input | Instabilitäts‑Trigger |
|---|---|---|---|---|
| **acceleration** (v5/v8, Default) | `acceleration` | Trägheits‑Formulierung, adaptives dt aus CFL; robust, leicht nicht‑konservativ | DEM, fpfric/Manning, BCs | dt zu groß; abrupte Manning‑/Höhen‑Sprünge (Gebäudekanten) → Schock |
| **fv1** (nur v8) | `fv1` | Volle Flachwasser‑Gl., HLL‑Flux; oszillationsärmer aber teurer | DEM, Manning, BCs | sehr dünne Wasserfilme, trockene/nasse Front bei grobem Raster |
| **SGC** (v8) | `SGCwidth/bed/bank/n/chan` | 1D‑Gerinne im Subgrid, Roe‑Solver | konsistente bed<bank, width>0 | bed≥bank, width>4·cs (→ besser im DGM auflösen, Warnung vorhanden) |
| **BMI** (v5) | Frame‑Loop | wie acceleration, koppelt 1D‑Culverts | wie v5 + Culvert‑Links | Culvert‑Kopplung, Frame‑dt |

**Gemeinsame GIGO‑Quellen für alle:** (1) DEM‑NoData‑Ränder, an denen sich Wasser staut (durch NoData‑Front‑Auslässe entschärft); (2) Gebäude als NoData statt +10 m Rampe (richtig umgesetzt, `Rasterizer.maskBuildingsAsNoData`); (3) Export‑Resampling feiner als 1/8 der Datengrundlage → Scheininformation (Warnung vorhanden).

---

## 4. Was „der letzte Fix" wirklich geändert hat

Uncommitteter Diff `InputGenerator.js` (`03fd4bc..8702e82`):
- `generateWeirFile(...)` bekommt jetzt `header` + `{engine}` → für `v8` **Re‑Diskretisierung** der Strukturen bei Export‑Zellweite (4‑connected, wasserdicht). Vorher: immer Legacy `v5`.
- **SGC‑Export** (`sgc.width/bed/bank.asc`) neu.
- **Export‑Resampling** des DEM bei `exportCellsize`.
- Strukturierte `warn()`‑Pipeline.

→ Genau der vom Nutzer vermutete Ort. **Die Logik ist getestet und korrekt** (siehe §0/§1). Geändertes Verhalten ≠ kaputtes Verhalten.

**In diesem Audit gefixt:** Die `flow.weir`‑Log‑Zeile meldete fälschlich Eingabe‑Objektzahlen mit v5‑Formel (`×2`), während v8 z. B. 52 Zeilen schreibt → beim Debuggen irreführend. Jetzt: tatsächlich geschriebene Struktur‑Zeilen + Engine (`InputGenerator.js:235‑237`).

---

## 5. Diagnose‑Rezept für „durchströmte Wehre" am REALEN 8.2

Da die JS‑Erzeugung korrekt ist, am laufenden Solver verifizieren:

1. **`flow.weir` aus dem realen Lauf dumpen** und prüfen: enthält sie die Wehr‑Zeilen? Stimmen `x,y` mit der gezeichneten Linie überein? Ist `hc` > DEM an diesen Zellen?
2. **Solver‑Schema prüfen:** Lief der Job mit `acceleration` oder `fv1`? Beide unterstützen Wehre – aber bestätigen, dass das `weirfile`‑Keyword in `run.par` tatsächlich ankam (verbose‑Log: „Loading weir information").
3. **Brücke vs. Wehr:** `<dir>B`‑Tags sind **Brücken** (Orifice/Druckabfluss) – die lassen bewusst Wasser unter dem Deck durch. Falls die „Wehre" eigentlich als Brücke angelegt wurden, ist Durchströmen physikalisch korrekt.
4. **hc vs. resampletes DEM:** Bei `exportCellsize` ≠ nativ wird das DEM bilinear geglättet. `hc` bleibt = nativ+5 (absolut), das ist ok – aber wenn das DEM an der Wehr‑Zelle durch Glättung **höher** als `hc` wird, ist das Wehr „begraben" (kein Effekt). Gegenprobe: `hc − DEM(exportgrid)` an den Wehr‑Zellen > 0?
5. **Massbilanz** (`massint`): bei intaktem Wehr muss oberstrom Wasser ponden. Steigt der Pegel oberstrom? Wenn nein → Wehr greift nicht; wenn ja, fließt aber trotzdem ab → Krone zu niedrig.

---

## 6. Empfohlene gezielte Folge‑Fixes (nach Bestätigung via §5)

- **R1:** Interne FREE‑Auslässe optional mit nutzerdefinierter Soll‑Höhe statt `terrain−0,01`.
- **R2:** Harte CFL‑Validierung vor dem Versand (dt ≤ `cs/√(g·h_max)`), nicht nur UI‑Warnung.
- **R3:** v8 Wehr‑Krone zellweise aus dem DEM‑Profil statt `first.hc`, wenn Höhenvariation > Schwelle.
- **Test‑Lücke:** Regressionstest mit echter Editor‑Wehr‑Form (lineId‑Gruppe inkl. Eck‑Doppelflächen aus `useWeirTool.stepFace`) end‑to‑end durch `generateWeirFile`, Assertion: wasserdicht + `hc > DEM`.

*Diese Punkte sind bewusst NICHT vorab umgesetzt – sie ändern physikalisches Verhalten und sollten erst nach der Solver‑seitigen Bestätigung (§5) angefasst werden.*
