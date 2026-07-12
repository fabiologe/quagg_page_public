/**
 * useProjectFile.js — Speichern/Laden eines kompletten Flood-2D-Projekts als EINE kompakte .flood2d-Datei.
 *
 * Größenproblem: JSON von Typed-Arrays (Terrain + viele Tiefen-Frames) wird riesig (~200 MB, Zahlen als Text).
 * Lösung: Typed-Arrays **binär** in eine ZIP packen (jszip, DEFLATE). Tiefen-Frames sind überwiegend Null →
 * komprimieren 10–50×, DEM ~2–4× → Pre-Datei < ~1 MB, mit Ergebnissen meist wenige MB.
 *
 * Format `.flood2d` (ZIP):
 *   manifest.json      — Version, Terrain-Header, hasResults, Surface-/Results-Metadaten
 *   terrain.f32        — Float32 gridData (bottom-up)
 *   geometry.json      — GEO_FIELDS (modifications/boundaries/weirs/weirLines/bridges)
 *   network.json       — Kanalnetz (useNetworkStore: nodes/links/format) für die 1D/2D-Kopplung
 *   hydraulics.json    — Ganglinien/Assignments/Regen/globale Boundary/…
 *   sim.json           — Simulationsparameter
 *   surface/grid.i8 + surface/materials.json   — optional (Textur-Pipeline)
 *   results/*.f32 + results/manifest          — optional (Tiefe/Velocity/Vektoren/Max-Grids)
 */
import JSZip from 'jszip';
import { toRaw } from 'vue';
import { useGeoStore } from '../stores/useGeoStore.js';
import { useHydraulicStore } from '../stores/useHydraulicStore.js';
import { useSurfaceStore } from '../stores/useSurfaceStore.js';
import { useSimulationStore } from '../stores/useSimulationStore.js';
import { useNetworkStore } from '../stores/useNetworkStore.js';
import { GEO_FIELDS, buildResultData } from './useResultDataBridge.js';
import { migrateBoundaries } from '../utils/boundarySegments.js';

const MAGIC = 'flood-2D-project';
const VERSION = 1;

const J = (x) => JSON.parse(JSON.stringify(toRaw(x) ?? null)); // tiefer Klon (entfernt Vue-Reaktivität)

/** Float32Array → frischer, zusammenhängender ArrayBuffer (für jszip). */
function f32buf(arr) {
  const a = arr instanceof Float32Array ? arr : new Float32Array(arr);
  return a.slice().buffer;
}

/** Lädt einen Blob als Datei herunter. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Serialisiert das aktuelle Projekt in einen .flood2d-Blob.
 * @param {object} [opts]
 * @param {boolean} [opts.includeResults=false]  Ergebnis-Frames mit einpacken (größer).
 * @returns {Promise<Blob>}
 */
export async function saveProject({ includeResults = false, onProgress = null } = {}) {
  const report = (label, percent = null) => { try { onProgress?.({ label, percent }); } catch { /* noop */ } };
  const geoStore = useGeoStore();
  const hyd = useHydraulicStore();
  const surf = useSurfaceStore();
  const sim = useSimulationStore();

  report('Sammle Projektdaten…', null);
  const terrain = toRaw(geoStore.terrain);
  if (!terrain || !terrain.gridData) {
    throw new Error('Kein Terrain geladen — es gibt nichts zu speichern.');
  }

  const zip = new JSZip();

  const manifest = {
    magic: MAGIC,
    version: VERSION,
    createdAt: new Date().toISOString(),
    terrain: {
      ncols: terrain.ncols, nrows: terrain.nrows, cellsize: terrain.cellsize,
      minZ: terrain.minZ, maxZ: terrain.maxZ,
      xllcorner: terrain.xllcorner, yllcorner: terrain.yllcorner,
      center: terrain.center ? J(terrain.center) : null,
      bounds: terrain.bounds ? J(terrain.bounds) : null,
    },
    hasResults: false,
    surface: null,
    results: null,
  };

  // Terrain (binär)
  zip.file('terrain.f32', f32buf(toRaw(terrain.gridData)));

  // Vektor-Geometrie (buildings/excavations sind computed aus modifications → nicht separat speichern)
  const geometry = {};
  for (const f of GEO_FIELDS) geometry[f] = J(geoStore[f]);
  zip.file('geometry.json', JSON.stringify(geometry));

  // Kanalnetz (Unified Geometry Engine) — Quelle des gekoppelten 1D/2D-Laufs.
  // Die reaktiven Arrays SIND die editierbare Wahrheit (toModel() ist daraus ableitbar).
  const net = useNetworkStore();
  if (net.hasNetwork) {
    zip.file('network.json', JSON.stringify({
      nodes: J(net.nodes), links: J(net.links), format: net.format || null,
      prefillPercent: Number(net.prefillPercent) || 0,
    }));
  }

  // Hydraulik / Randbedingungen / Regen
  zip.file('hydraulics.json', JSON.stringify({
    ganglinien: J(hyd.ganglinien),
    assignments: J(hyd.assignments),
    rainData: J(hyd.rainData),
    rainSeries: J(hyd.rainSeries),
    rainConfig: J(hyd.rainConfig),
    kostraGrid: J(hyd.kostraGrid),
    rainLocation: J(hyd.rainLocation),
    globalRoughness: hyd.globalRoughness,
    globalBoundaryType: hyd.globalBoundaryType,
    globalBoundaryHfix: hyd.globalBoundaryHfix,
    antecedentMoisture: hyd.antecedentMoisture,
  }));

  // Simulationsparameter
  zip.file('sim.json', JSON.stringify({
    simDuration: sim.simDuration, timeStep: sim.timeStep,
    saveInterval: sim.saveInterval, massInterval: sim.massInterval,
    useAcceleration: sim.useAcceleration, useBmiSolver: sim.useBmiSolver,
    solverMode: sim.solverMode,
    numericalScheme: sim.numericalScheme, sgcEnabled: sim.sgcEnabled,
  }));

  // Oberflächen-Grid (Textur-Pipeline), optional — Int8 (Material-IDs)
  const sg = toRaw(surf.surfaceGrid);
  if (sg && sg.length) {
    const i8 = sg instanceof Int8Array ? sg : Int8Array.from(sg);
    zip.file('surface/grid.i8', i8.slice().buffer);
    zip.file('surface/materials.json', JSON.stringify({
      materials: J(surf.materials), ncols: surf.gridNCols, nrows: surf.gridNRows,
    }));
    manifest.surface = { present: true, length: i8.length };
  }

  // Ergebnisse (optional) — pro Kategorie EIN konkatenierter Blob (bessere Kompression über Frames)
  if (includeResults) {
    const rd = buildResultData(sim, geoStore);
    const frameIds = rd ? Object.keys(rd.frames || {}).map(Number).sort((a, b) => a - b) : [];
    if (rd && frameIds.length) {
      const cellCount = terrain.ncols * terrain.nrows;
      const pack = (obj) => {
        const buf = new Float32Array(frameIds.length * cellCount);
        frameIds.forEach((fid, i) => {
          const a = obj?.[fid];
          if (a) buf.set((a.length === cellCount ? a : a.subarray(0, cellCount)), i * cellCount);
        });
        return buf.buffer;
      };

      zip.file('results/depth.f32', pack(rd.frames));

      const hasVel = Object.keys(rd.velocityFrames || {}).length > 0;
      if (hasVel) zip.file('results/vel.f32', pack(rd.velocityFrames));

      const hasVec = Object.keys(rd.velocityVectorFrames || {}).length > 0;
      if (hasVec) {
        const vx = new Float32Array(frameIds.length * cellCount);
        const vy = new Float32Array(frameIds.length * cellCount);
        frameIds.forEach((fid, i) => {
          const c = rd.velocityVectorFrames[fid];
          if (c) { vx.set(c.vx.subarray(0, cellCount), i * cellCount); vy.set(c.vy.subarray(0, cellCount), i * cellCount); }
        });
        zip.file('results/vec.vx.f32', vx.buffer);
        zip.file('results/vec.vy.f32', vy.buffer);
      }
      if (rd.maxDepthGrid)    zip.file('results/maxDepth.f32',  f32buf(rd.maxDepthGrid));
      if (rd.maxHazardGrid)   zip.file('results/maxHazard.f32', f32buf(rd.maxHazardGrid));
      if (rd.maxVelocityGrid) zip.file('results/maxVel.f32',    f32buf(rd.maxVelocityGrid));
      if (rd.maxElevGrid)     zip.file('results/maxElev.f32',   f32buf(rd.maxElevGrid));
      if (rd.arrivalTimeGrid) zip.file('results/arrival.f32',   f32buf(rd.arrivalTimeGrid));
      if (rd.durationGrid)    zip.file('results/duration.f32',  f32buf(rd.durationGrid));

      // 1D-Kanalnetz-Serien + Kopplungs-/Massenbilanz (kleine JSON, gekoppelte Läufe)
      if (rd.networkResults || rd.couplingBudget || rd.massReport) {
        zip.file('results/network1d.json', JSON.stringify({
          networkResults: rd.networkResults, couplingBudget: rd.couplingBudget, massReport: rd.massReport,
        }));
      }

      manifest.hasResults = true;
      manifest.results = {
        frameIds, cellCount, hasVel, hasVec,
        hasMaxDepth: !!rd.maxDepthGrid, hasMaxHazard: !!rd.maxHazardGrid,
        hasMaxVel: !!rd.maxVelocityGrid, hasMaxElev: !!rd.maxElevGrid,
        hasArrival: !!rd.arrivalTimeGrid, hasDuration: !!rd.durationGrid,
        maxWaterDepth: rd.maxWaterDepth, simDuration: rd.simDuration,
        resultHeader: rd.header ? J(rd.header) : null,
      };
    }
  }

  zip.file('manifest.json', JSON.stringify(manifest));

  report('Komprimiere…', 0);
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 }, streamFiles: true },
    (meta) => report('Komprimiere…', meta.percent)
  );
  report('Fertig', 100);
  return blob;
}

/**
 * Lädt eine .flood2d-Datei und stellt alle Stores wieder her. Ergebnisse (falls vorhanden) landen im
 * simStore → der bestehende „3D-Viewer"-Button serialisiert sie wie nach einer Simulation.
 * @param {File|Blob} file
 * @returns {Promise<{hasResults:boolean, frameCount:number}>}
 */
export async function loadProject(file, onProgress = null) {
  const report = (label, percent = null) => { try { onProgress?.({ label, percent }); } catch { /* noop */ } };
  const geoStore = useGeoStore();
  const hyd = useHydraulicStore();
  const surf = useSurfaceStore();
  const sim = useSimulationStore();

  report('Entpacke Datei…', null);
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Ungültige Datei: manifest.json fehlt.');
  const manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.magic !== MAGIC) throw new Error('Unbekanntes Dateiformat.');

  report('Stelle Projekt wieder her…', null);
  // Terrain
  const terrBuf = await zip.file('terrain.f32').async('arraybuffer');
  const terrainObj = { ...manifest.terrain, gridData: new Float32Array(terrBuf) };
  geoStore.importTerrain(terrainObj);
  geoStore.notifyTerrainModified?.();

  // Vektor-Geometrie
  const gf = zip.file('geometry.json');
  if (gf) {
    const geom = JSON.parse(await gf.async('string'));
    for (const f of GEO_FIELDS) if (geom[f] !== undefined && geom[f] !== null) geoStore[f] = geom[f];
    // Alt-/Linien-Brücken aufs Polygon-mesh3d-Modell heben (einheitliches Rendering & Solver).
    geoStore.migrateBridges?.();
  }

  // Kanalnetz: immer deterministisch wiederherstellen — Projekt OHNE network.json leert den
  // Store (sonst leckt ein Netz aus der vorherigen Session in das geladene Projekt).
  const net = useNetworkStore();
  const nf = zip.file('network.json');
  if (nf) {
    const n = JSON.parse(await nf.async('string'));
    net.setArrays(n.nodes || [], n.links || []);
    net.format = n.format ?? null;
    net.prefillPercent = Number(n.prefillPercent) || 0;
  } else {
    net.clear();
  }

  // Hydraulik
  const hf = zip.file('hydraulics.json');
  if (hf) {
    const h = JSON.parse(await hf.async('string'));
    const set = (k) => { if (h[k] !== undefined && h[k] !== null) hyd[k] = h[k]; };
    ['ganglinien', 'assignments', 'rainData', 'rainSeries', 'rainConfig', 'kostraGrid', 'rainLocation',
     'globalRoughness', 'globalBoundaryType', 'globalBoundaryHfix', 'antecedentMoisture'].forEach(set);
  }

  // Boundary-Migration auf das Kanten-Segment-Modell (idempotent): alte Boundaries
  // an die nächste Rasterkante snappen (properties.edge setzen), veraltete
  // assignment-Felder (inflowMode/direction) entfernen. Läuft NACH Geometrie + Hydraulik.
  if (geoStore.boundaries?.features?.length) {
    const mh = { ncols: terrainObj.ncols, nrows: terrainObj.nrows, cellsize: terrainObj.cellsize,
                 xllcorner: terrainObj.xllcorner, yllcorner: terrainObj.yllcorner };
    const stats = migrateBoundaries(geoStore.boundaries, hyd.assignments || {}, mh);
    if (stats.snapped || stats.interior || stats.fieldsStripped) {
      console.log(`[useProjectFile] Boundary-Migration: ${stats.snapped} an Kante gesnappt, ${stats.interior} als Innenquelle, ${stats.fieldsStripped} veraltete Felder entfernt.`);
    }
  }

  // Simulationsparameter
  const sf = zip.file('sim.json');
  if (sf) {
    const s = JSON.parse(await sf.async('string'));
    const set = (k) => { if (s[k] !== undefined && s[k] !== null) sim[k] = s[k]; };
    // useBmiSolver (Legacy) VOR solverMode setzen, damit neue Projekte mit
    // solverMode='runpod' nicht vom Legacy-Boolean überschrieben werden.
    ['simDuration', 'timeStep', 'saveInterval', 'massInterval', 'useAcceleration', 'useBmiSolver', 'solverMode',
     'numericalScheme', 'sgcEnabled'].forEach(set);
  }

  // Oberflächen-Grid
  const sgf = zip.file('surface/grid.i8');
  const smf = zip.file('surface/materials.json');
  if (sgf && smf) {
    const buf = await sgf.async('arraybuffer');
    const sm = JSON.parse(await smf.async('string'));
    if (sm.materials !== undefined) surf.materials = sm.materials;
    surf.surfaceGrid = new Int8Array(buf);
    if (sm.ncols !== undefined) surf.gridNCols = sm.ncols;
    if (sm.nrows !== undefined) surf.gridNRows = sm.nrows;
  }

  // Ergebnisse
  sim.clearResults();
  if (manifest.hasResults && manifest.results) {
    report('Lade Ergebnisse…', null);
    const { frameIds, cellCount } = manifest.results;
    const header = manifest.results.resultHeader || terrainObj;
    const depth = new Float32Array(await zip.file('results/depth.f32').async('arraybuffer'));
    const velF = zip.file('results/vel.f32');
    const vel = velF ? new Float32Array(await velF.async('arraybuffer')) : null;
    const vxF = zip.file('results/vec.vx.f32');
    const vyF = zip.file('results/vec.vy.f32');
    const vx = vxF ? new Float32Array(await vxF.async('arraybuffer')) : null;
    const vy = vyF ? new Float32Array(await vyF.async('arraybuffer')) : null;

    frameIds.forEach((fid, i) => {
      const off = i * cellCount;
      const d = depth.slice(off, off + cellCount);
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < d.length; k++) { const v = d[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      sim.addResultFrame(fid, d, header, mn, mx);
      if (vel) sim.addVelocityFrame(fid, vel.slice(off, off + cellCount));
      if (vx && vy) sim.addVelocityVectorFrame(fid, vx.slice(off, off + cellCount), vy.slice(off, off + cellCount));
    });

    const loadGrid = async (name, setter) => {
      const f = zip.file(name);
      if (f) setter(new Float32Array(await f.async('arraybuffer')));
    };
    await loadGrid('results/maxDepth.f32',  sim.setMaxDepthGrid);
    await loadGrid('results/maxHazard.f32', sim.setMaxHazardGrid);
    await loadGrid('results/maxVel.f32',    sim.setMaxVelocityGrid);
    await loadGrid('results/maxElev.f32',   sim.setMaxElevGrid);
    await loadGrid('results/arrival.f32',   sim.setArrivalTimeGrid);
    await loadGrid('results/duration.f32',  sim.setDurationGrid);

    if (manifest.results.maxWaterDepth) sim.maxWaterDepth = manifest.results.maxWaterDepth;
    if (manifest.results.simDuration) sim.simDuration = manifest.results.simDuration;

    // 1D-Kanalnetz-Serien + Kopplungs-/Massenbilanz (gekoppelte Läufe)
    const n1 = zip.file('results/network1d.json');
    if (n1) {
      const j = JSON.parse(await n1.async('string'));
      if (j.networkResults) sim.setNetworkResults(j.networkResults);
      if (j.couplingBudget) sim.setCouplingBudget(j.couplingBudget);
      if (j.massReport)     sim.setMassReport(j.massReport);
    }
  }

  return { hasResults: !!manifest.hasResults, frameCount: manifest.results?.frameIds?.length || 0 };
}
