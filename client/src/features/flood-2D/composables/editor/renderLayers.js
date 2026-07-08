/**
 * renderLayers.js
 *
 * Zentrale Quelle der Wahrheit für die Zeichenreihenfolge (renderOrder) UND die Tiefen-/
 * Transparenz-Policy aller 3D-Ebenen im Flood-2D-Editor und -Ergebnisviewer.
 *
 * Bisher waren renderOrder-Werte als Magic Numbers über useLayerRenderer.js und ResultMap3D.vue
 * verstreut (Terrain 0, bridgeGroup 1, water 50, flow 996/997 …) — das führte zu inkonsistentem
 * Verhalten. Diese Datei bündelt das.
 *
 * Policy (wichtig wegen three.js Opaque-/Transparent-Pass):
 *  - FESTE GEOMETRIE (Terrain, Gebäude, Wehre, Brücken, Nodes): opak, depthTest+depthWrite an.
 *    Sie sind die „harten Blocker": sie schreiben den Tiefenpuffer.
 *  - WASSER: reine 2D-Haut, transparent, depthTest AN, depthWrite AUS. Wird ZULETZT gezeichnet
 *    (renderOrder über allen festen Bauwerken): es prüft den Tiefenpuffer (Gebäude/herausragende
 *    Bauwerke blockieren es) und liegt über submergierten Bauwerken/Bett, schreibt selbst aber
 *    nicht in die Tiefe → kein z-fighting der Wasserhaut. Über Gebäude-Footprints existiert
 *    ohnehin keine Wasser-Geometrie (Löcher aus der geklonten Terrain-Geometrie).
 *  - ANNOTATIONEN (Flow-/Boundary-Pfeile, Selektion, Probe): depthTest:false + hohe renderOrder
 *    → immer sichtbar, auch über dem Wasser.
 *
 * renderOrder sortiert nur INNERHALB eines Pass (opak bzw. transparent); die Werte sind daher
 * primär zur konsistenten Ordnung gleicher Pässe + als dokumentierte Hierarchie gedacht.
 */
export const RENDER_ORDER = {
  TERRAIN: 0,
  BUILDINGS: 5,
  NODES: 6,
  NETWORK: 6,      // Kanalnetz (Schächte + Haltungen) — feste Geometrie wie Nodes
  WEIRS: 7,
  BRIDGES: 8,
  BOUNDARY_LINES: 9,
  WATER: 20,
  FLOW_ARROWS: 30,
  BOUNDARY_ARROWS: 31,
  SELECTION: 40,
  PROBE: 50,
};
