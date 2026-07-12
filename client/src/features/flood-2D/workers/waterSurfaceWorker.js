/**
 * waterSurfaceWorker.js — rechnet die Wasseroberflächen-Pipeline (sanitize → Spike-Kappung →
 * Glättung → WSE/Trocken-Fill-Pack → Turbulenz-Bytes) off-main-thread, damit das Playback
 * auf großen Rastern (>1600² Zellen) nicht am Haupt-Thread hängt.
 *
 * Protokoll (postMessage):
 *   → { type:'init', baseZ, ncols, nrows, minZ, cellsize }   einmal je Mesh-Aufbau
 *   → { type:'pack', reqId, gen, depth, elev?, velocity?, detectSpikes, wantTurb }
 *   ← { type:'packed', reqId, gen, pack, turb|null, smoothedDepth, robustMax, flagged }
 *      (pack/turb/smoothedDepth als Transferables — kein Rück-Kopieren)
 *
 * Vite-Modul-Worker: darf importieren (anders als resultHydrationWorker, der bewusst
 * import-frei gehalten ist) — die Pipeline lebt geteilt in utils/waterFramePack.js.
 */
import { packWaterFrame } from '../utils/waterFramePack.js';

let baseZ = null;
let dims = null;      // { ncols, nrows, minZ, cellsize }
const scratch = {};   // wiederverwendete Temporaries (surf/rawTurb) zwischen den Frames

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    baseZ = m.baseZ;
    dims = { ncols: m.ncols, nrows: m.nrows, minZ: m.minZ ?? 0, cellsize: m.cellsize || 0 };
    return;
  }
  if (m.type !== 'pack' || !baseZ || !dims) return;

  const res = packWaterFrame({
    depth: m.depth,
    elev: m.elev || null,
    velocity: m.velocity || null,
    baseZ,
    ncols: dims.ncols,
    nrows: dims.nrows,
    minZ: dims.minZ,
    cellsize: dims.cellsize,
    detectSpikes: m.detectSpikes,
    wantTurb: m.wantTurb,
  }, scratch);

  const transfers = [res.pack.buffer, res.smoothedDepth.buffer];
  if (res.turb) transfers.push(res.turb.buffer);
  self.postMessage({
    type: 'packed',
    reqId: m.reqId,
    gen: m.gen,
    pack: res.pack,
    turb: res.turb,
    smoothedDepth: res.smoothedDepth,
    robustMax: res.robustMax,
    flagged: res.flagged,
  }, transfers);
};
