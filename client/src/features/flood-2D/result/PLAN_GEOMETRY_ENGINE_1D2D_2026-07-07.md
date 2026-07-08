# Unified Geometry Engine — 1D-Kanalnetz ⊕ 2D-Oberfläche als EIN Modell

**Datum:** 2026-07-07 · **Status:** Architektur-Entwurf (Antwort auf "wie könnte man das gestalten?")
**Kontext:** Die 1D/2D-Solver-Kopplung (EPA-SWMM ⇄ LISFLOOD-FP) ist gebaut+verifiziert
([[project_swmm_lisflood_coupling]]). Jetzt: das Kanalnetz soll im MapEditor **sichtbar, anklickbar,
erstell- und editierbar** werden (Schächte + Haltungen), IFC-Import inklusive — und die künstliche
Grenze zwischen 1D und 2D soll im Modell **verschwinden**.

---

## Leitprinzip

**Ein Entwässerungssystem ist EIN geometrisches Kontinuum.** Ob Wasser gerade im Rohr (1D) oder auf der
Fläche (2D) fließt, ist eine **Solver-Repräsentation**, keine Modellierungs-Eigenschaft. Die Engine
modelliert daher **eine Geometrie** und **kompiliert** daraus mehrere Solver-Inputs. Die 1D/2D-Grenze
existiert nur noch im Compiler, nicht im Datenmodell und nicht in der Editor-UX.

Drei Konsequenzen, die das Design tragen:
1. **Eine Geometrie, mehrere Kompilate** (2D-Raster · SWMM-Netz · Kopplungs-Map) — deterministisch abgeleitet.
2. **Kopplung entsteht aus Geometrie, nicht aus Deklaration** — wo ein Schachtdeckel eine 2D-Zelle berührt,
   ist automatisch ein Übergabepunkt. Das ist die technische Auflösung der 1D/2D-Grenze.
3. **Ein Höhenmodell** — Sohle (invert), Deckel (rim), Gelände (DEM) liegen im selben z-Raum; die Engine
   erzwingt Konsistenz (z. B. rim = Gelände an der xy-Position, sofern nicht überschrieben).

---

## Kern: das Unified Entity Model ("Geometry Engine")

Eine format- und solver-**agnostische** Zwischenschicht. Alles, was existiert, ist eine **Entity** mit
Geometrie + hydraulischer Rolle:

| Primitiv | Geometrie | Rollen (Beispiele) | Kompiliert nach |
|---|---|---|---|
| **Node** | 3D-Punkt (x,y,rim,invert) | Schacht, Einlauf, Auslauf, Bauwerk (Wehr/Drossel/Pumpe/Becken) | SWMM Junction/Outfall/Storage · Kopplungspunkt |
| **Link** | 3D-Polylinie + Querschnitt | Haltung (`covered`), Gerinne/Rinne (`open`), Durchlass | SWMM Conduit **oder** SGC-Gerinne (je `conveyance`) |
| **Surface** | Mesh/Raster | Gelände (DEM), Gebäude, Wehr/Brücke, Bathymetrie | terrain.asc/.n · flow.weir |
| **Region** | Polygon | Fläche/Mulde/Becken, Rauheitszone | (info) · Rauheit · Speicher |

Jede Entity: `{ id, geom, role, conveyance, attrs, style, refs }`. Dazu zwei Indizes:
- **Topologie-Graph** (Node↔Link-Konnektivität) — für Netz-Validierung, SWMM-Export, Pfadanalyse.
- **Spatial-Index** (Uniform-Grid über die DEM-Zellweite) — für Zelle↔Entity-Queries (Auto-Kopplung,
  Picking, Snapping). Wiederverwendbar: bestehendes `utils/gridIndex.js`.

Ein **Unified Store** (`useNetworkStore` / erweiterter Nachfolger von `useGeoStore`) hält die Entities als
Single Source of Truth. Die heutigen fragmentierten Sammlungen (`geoStore.nodes`, `culvertLinks`,
`bridges`, `weirs`; `isybau` Node/Edge) werden über **Adapter** eingespeist — nichts bricht sofort.

---

## Die Auflösung der 1D/2D-Grenze (das eigentliche Ziel)

Drei Mechanismen im Datenmodell:

1. **`conveyance`-Flag pro Link** — dieselbe Polyliniengeometrie wird zu **Rohr (SWMM-Conduit, 1D)** oder
   **offenem Gerinne (SGC, 2D-nah)**, je nach `covered|open`. Ein Gerinne, das unter eine Straße taucht,
   wechselt nur das Flag — keine neue Geometrie, kein Werkzeugwechsel.
2. **Geometrische Auto-Kopplung** — der Coupling-Compiler fragt den Spatial-Index: jeder Node, dessen
   `rim` in einer aktiven DEM-Zelle liegt, wird automatisch Kopplungsschacht → `flow.coupling` entsteht
   ohne manuelles Zuordnen (heute noch `selectCouplingNodes` heuristisch; Ziel: rein geometrisch).
3. **Durchgängiges Höhenmodell** — Engine hält invert/rim/DEM konsistent; ein Editor-Zug an einem Schacht
   aktualisiert Kopplungszelle, SGC-Sohle und SWMM-Knoten in einem Rutsch.

So verschwindet die Grenze: der Nutzer zeichnet **ein** Netz in **einer** Szene; der Compiler entscheidet
pro Element, ob es als 1D, 2D oder Kopplungspunkt in den Solver geht.

---

## Compilation Layer (Geometry → Solver-Inputs)

Deterministische, testbare Compiler (reine Funktionen `Model → Files`):

- **2D-Compiler** = bestehender `InputGenerator` (Surfaces/Regions → `terrain.asc/.n`, Structures → `flow.weir`, SGC-Links → `sgc.*.asc`).
- **1D-Compiler** = bereits portierter `services/swmm/SwmmBuilder` (coupled-Modus) → `network.inp`.
- **Coupling-Compiler** = `services/swmm/couplingExport` → `flow.coupling` (heute aus Node-Liste; Ziel:
  aus Spatial-Index abgeleitet).

Der Runner (`Flood2DSolverRunner`) ruft im `runpod`-Modus alle drei und lädt das Datei-Set hoch — der
Backend-Pfad ist schon fertig (In-Process-SWMM-Kopplung, `quagg-coupling.patch`).

---

## Editor-Integration (MapEditor3D)

Wiederverwendung statt Neubau:
- **Rendering:** `useLayerRenderer` bekommt zwei neue Layer (`renderLayers.js` RENDER_ORDER):
  `manholes` (InstancedMesh Zylinder/Kugeln, eingefärbt nach Rolle) und `conduits` (TubeGeometry/Line
  entlang der Polylinie, Radius = Profilhöhe). Große Netze → Instancing + Frustum-Culling.
- **Picking:** ein Raycaster-Hit → `entity.id` → Auswahl; Property-Panel (Muster: `ElementPropertiesModal`
  aus isybau) zum Editieren von rim/invert/Profil/Material.
- **Werkzeuge:** ein `NetworkTool` (Muster der bestehenden Object-Tools): Klick = Schacht setzen,
  Klick-Kette = Haltung ziehen; **Greifpunkte via `useControlPointEditor`** (Schacht verschieben,
  Haltungs-Stützpunkte editieren). Auto-Reset über das bestehende `flood2d-object-placed`-Event.
- **Snapping:** Spatial-Index liefert nächsten Node/Link zum Einrasten (Netz-Konnektivität sauber halten).

---

## Import/Export-Adapter (format-agnostisch)

Alle Adapter erzeugen/lesen **dieselben Entities** — die Engine ist das Austauschformat:
- **ISYBAU XML** → Entities: kanonischer Parser (`isybau/utils/xmlParser` Z-Interpolation +
  `isyifc`-Worker Einheiten-Auto-Reparatur), Namens-Zoo (Mulden/Becken/Gerinne…) → wenige Rollen.
- **IFC (BIM)** → Entities: IFC4 `IfcDistributionSystem` / `IfcPipeSegment` (Haltung) / `IfcPipeFitting`
  (Formstück) / `IfcDistributionChamberElement` (Schacht/Bauwerk) ⇄ Link/Node. **Round-Trip** über die
  bestehenden `isyifc/core/export/IfcWriter*.js` + einen neuen IFC-Reader (oder web-ifc). So lassen sich
  Kanaldaten als IFC „reinhauen" und wieder als IFC exportieren — die Engine hält beide Richtungen.
- Optional GeoJSON/DXF als weitere Adapter (gleiche Ziel-Entities).

---

## Datenmodell-Skizze

```js
// Entity (Diskriminierte Union über `kind`)
{ id, kind: 'node'|'link'|'surface'|'region',
  geom: { /* node: {x,y,rim,invert}; link: {points:[{x,y,z}], profile:{shape,h,w}} */ },
  role: 'manhole'|'inlet'|'outfall'|'weir'|'orifice'|'pump'|'storage'|'conduit'|'channel'|'terrain'|'building',
  conveyance: 'covered'|'open'|null,   // Link: 1D-Rohr vs. offenes Gerinne
  attrs: { material, kSt, coverZ, bottomZ, volume, /* rollen-spezifisch */ },
  refs: { fromNodeId, toNodeId, systemId }, style }
```
Topologie = abgeleiteter Graph aus `refs`; Spatial-Index = abgeleitet aus `geom` + DEM-Header.

---

## Gestaffelter Fahrplan (kein Big-Bang, baut auf der verifizierten Kopplung)

| Stufe | Inhalt | Verifizierbar |
|---|---|---|
| **G0** | Entity-Model + Unified Store + **Adapter** aus `geoStore`/isybau (nichts bricht) | Node-Tests: Adapter round-trip |
| **G1** | **Auto-Kopplung aus Geometrie** (Spatial-Index → `flow.coupling`), ersetzt Heuristik | erweitert `test_coupling_export.mjs` |
| **G2** | Netz **read-only** im MapEditor3D rendern (importierte ISYBAU sichtbar: Schächte+Haltungen) | App: Import → sichtbar |
| **G3** | **Edit-Tools** (Schacht/Haltung CRUD) via `useControlPointEditor` + Property-Panel | App: setzen/verschieben/löschen |
| **G4** | **IFC-Adapter** in/out (Round-Trip mit `isyifc` IfcWriter + Reader) | Test: IFC → Entities → IFC |
| **G5** | **Verschmelzung** `covered↔open` (Rohr↔Gerinne/SGC), durchgängiges Höhenmodell, ein Netz→ein Lauf | End-to-End gekoppelter Lauf aus editiertem Netz |

G0–G1 sind Datenmodell + Compiler (Terminal-testbar). G2–G5 sind UI (in der laufenden App zu verifizieren).

---

## Grenzen & Konstanten (bewusst)

- Die **Solver bleiben** wie sie sind: LISFLOOD = uniformes 2D-Raster ([[reference_bridge_solver_resolution]]),
  SWMM = 1D-DYNWAVE. Die Geometry Engine ist **Modell + Compiler**, kein neuer Solver.
- Die Verschmelzung ist **modell-/kopplungsseitig**, nicht CFD: 1D↔2D tauschen an Punkten Masse aus
  (`quagg-coupling.patch`), sie werden nicht zu einem gemeinsamen Gleichungssystem.
- **Migration ohne Bruch:** Adapter-Schicht zuerst; die bestehenden Tools/Stores laufen weiter, bis die
  Engine sie eingemeindet.
- **Performance:** InstancedMesh + Spatial-Index + Culling für große Netze (10⁴–10⁵ Elemente).

**Nächster konkreter Schritt (empfohlen):** G0 — Entity-Model + Unified Store + Adapter, dann G1
(Auto-Kopplung), weil das direkt an den fertigen Backend-Pfad andockt und Terminal-verifizierbar ist.
Siehe [[project_swmm_lisflood_coupling]] für den Solver-Stand.
