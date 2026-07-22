/**
 * streamlineWorker.js — Strömungslinien-Generierung (Jobard & Lefer 1997) im Web Worker.
 *
 * Die RK2-Integration über das volle Raster lief vorher auf dem Main-Thread und hat
 * beim Durchlaufen der Playbar jeden Frame einen spürbaren Ruckler erzeugt (50–200 ms
 * bei großen Rastern). Hier läuft NUR noch die Geometrie-Berechnung; das Rendering
 * (LineSegments2, GPU) bleibt in useFlowStreamlines. Ergebnis-Puffer gehen per
 * Transferable zurück (zero-copy).
 *
 * Protokoll:
 *   → { type:'terrain', ncols, nrows, cellsize, minZ, width, height, gridData, mask, pierGeoms }
 *     (einmal je Terrain/Maske/Pfeiler gecacht — spart die 10-MB-Klonkosten pro Frame)
 *   → { type:'build', reqId, vx, vy, depth, density }
 *   ← { type:'lines', reqId, positions:Float32Array, colors:Float32Array } [transfer]
 *
 * pierGeoms (pierFlowDeflection.buildPierGeometry) deflectiert die integrierte
 * Geschwindigkeit analytisch im Ring um jeden Pfeiler (Umströmung), da das Solver-
 * Feld selbst keine Pfeiler kennt. jetGeoms (weirJetFlow.buildJetGeometry) überlagert
 * analog Kontraktion/Freistrahl an Wehr-Durchlässen.
 *
 * Konvention wie useFlowArrows: zell-zentriert, top-down. +vx=Ost, +vy=Süd.
 * Grid→Welt: localX = -W/2 + c·cs ; localY = H/2 - r·cs ; (Gruppe um -90° um X).
 */
import { flippedIndex } from '../utils/gridIndex';
import { sampleAmbientForPiers, deflectVelocity } from '../utils/pierFlowDeflection';
import { sampleAmbientForJets, applyJetFlow } from '../utils/weirJetFlow';

const WET_MIN = 0.02;     // m — nur nasse Zellen
const NODATA  = -9000;    // Velocity-NoData-Schwelle
// Nutzer-Filter „keine 0-Werte": unterhalb dieser Geschwindigkeit wird weder gesät
// noch weiter integriert — Linien kriechen nicht mehr in stehendes Wasser hinein.
const MIN_SPEED = 0.02;   // m/s
// Nutzer-Filter „keine Riesensprünge > 3": Segmente, deren Endpunkte vertikal weiter
// als 3 m auseinanderliegen (Tiefen-Dorn/Terrainkante), werden nicht gezeichnet —
// horizontale Sprünge kann die Integration (hStep=0,5 Zellen) ohnehin nicht erzeugen.
const MAX_JUMP_Z = 3.0;   // m

// Farbskala identisch zu useFlowArrows (weiß → gold → rot), ohne THREE-Import.
const C0 = [1.0, 1.0, 1.0];
const C1 = [1.0, 0.768, 0.0];   // 0xffc400
const C2 = [1.0, 0.165, 0.0];   // 0xff2a00
function speedColor(t, out, o) {
  let a, b, f;
  if (t < 0.5) { a = C0; b = C1; f = t / 0.5; }
  else         { a = C1; b = C2; f = (t - 0.5) / 0.5; }
  out[o]     = a[0] + (b[0] - a[0]) * f;
  out[o + 1] = a[1] + (b[1] - a[1]) * f;
  out[o + 2] = a[2] + (b[2] - a[2]) * f;
}

let T = null; // gecachtes Terrain: {ncols,nrows,cellsize,minZ,width,height,gridData,mask}

// bilineare Probe über NASSE Zellen; gibt {vx,vy,speed} oder null (außerhalb/trocken)
function buildSampler(vx, vy, depthField, pierGeoms, ambient, jetGeoms, ambientJets) {
  const { ncols, nrows, gridData, mask } = T;
  return (c, r) => {
    if (c < 0 || r < 0 || c > ncols - 1 || r > nrows - 1) return null;
    const c0 = Math.floor(c), r0 = Math.floor(r);
    const c1 = Math.min(ncols - 1, c0 + 1), r1 = Math.min(nrows - 1, r0 + 1);
    const fc = c - c0, fr = r - r0;
    let sx = 0, sy = 0, wsum = 0;
    for (let k = 0; k < 4; k++) {
      const cc = (k & 1) ? c1 : c0;
      const rr = (k & 2) ? r1 : r0;
      const w = ((k & 1) ? fc : 1 - fc) * ((k & 2) ? fr : 1 - fr);
      const i = rr * ncols + cc;                  // top-down (vx/vy/depth)
      if (depthField && !(depthField[i] > WET_MIN)) continue;
      // Eingebrannte Gebäude/Ränder: NoData im gridData (bottom-up!) → wie trocken
      // behandeln, Linien enden sauber an der Brennkante.
      if (gridData && gridData[flippedIndex(rr, cc, ncols, nrows)] <= NODATA) continue;
      if (mask && mask[i] < 128) continue;        // Gebäudemaske (top-down, <128 = Gebäude)
      const vxv = vx[i], vyv = vy[i];
      if (!(vxv > NODATA) || !(vyv > NODATA)) continue;
      sx += vxv * w; sy += vyv * w; wsum += w;
    }
    if (wsum <= 1e-6) return null;
    sx /= wsum; sy /= wsum;
    if (pierGeoms && pierGeoms.length) {
      const d = deflectVelocity(c, r, sx, sy, pierGeoms, ambient);
      sx = d.vx; sy = d.vy;
    }
    if (jetGeoms && jetGeoms.length) {
      const j = applyJetFlow(c, r, sx, sy, jetGeoms, ambientJets);
      sx = j.vx; sy = j.vy;
    }
    return { vx: sx, vy: sy, speed: Math.hypot(sx, sy) };
  };
}

function build(vx, vy, depthField, density) {
  const { ncols, nrows, cellsize, minZ, gridData } = T;
  const cs = cellsize || 1;
  const width = T.width, height = T.height;
  const pierGeoms = T.pierGeoms;
  const ambient = (pierGeoms && pierGeoms.length)
    ? sampleAmbientForPiers(pierGeoms, vx, vy, ncols, nrows, T.mask)
    : null;
  const jetGeoms = T.jetGeoms;
  const ambientJets = (jetGeoms && jetGeoms.length)
    ? sampleAmbientForJets(jetGeoms, vx, vy, ncols, nrows, T.mask)
    : null;
  const sample = buildSampler(vx, vy, depthField, pierGeoms, ambient, jetGeoms, ambientJets);

  // Referenz-Geschwindigkeit (Farb-Normierung) = Max über nasse Zellen
  let sref = 0;
  for (let r = 0; r < nrows; r += 2) for (let c = 0; c < ncols; c += 2) {
    const i = r * ncols + c;
    if (depthField && !(depthField[i] > WET_MIN)) continue;
    const vxv = vx[i], vyv = vy[i];
    if (!(vxv > NODATA) || !(vyv > NODATA)) continue;
    const s = Math.hypot(vxv, vyv); if (s > sref) sref = s;
  }
  if (!(sref > 0)) sref = 1;

  const dens = Math.min(1, Math.max(0, density));
  const dSep = Math.max(1.5, 7 - 5.5 * dens);   // Abstand zwischen Linien (Zellen)
  const dTest = dSep * 0.6;                       // Mindestabstand beim Verfolgen
  const hStep = 0.5;                              // Integrationsschritt (Zellen)
  const MAX_STEPS = 2000;                         // je Richtung
  const MIN_PTS = 8;                              // kürzere Linien verwerfen
  const MAX_LINES = 8000;
  const MAX_VERTS = 800000;

  // ── Spatial Hash (Jobard-Lefer): Stützpunkte akzeptierter Linien ───────────
  const hashCell = dSep;
  const hCols = Math.max(1, Math.ceil(ncols / hashCell));
  const hRows = Math.max(1, Math.ceil(nrows / hashCell));
  const buckets = new Array(hCols * hRows);
  const addSample = (c, r) => {
    const k = Math.min(hRows - 1, (r / hashCell) | 0) * hCols
            + Math.min(hCols - 1, (c / hashCell) | 0);
    (buckets[k] || (buckets[k] = [])).push(c, r);
  };
  const tooClose = (c, r, dist) => {
    const d2 = dist * dist;
    const bc = Math.min(hCols - 1, (c / hashCell) | 0);
    const br = Math.min(hRows - 1, (r / hashCell) | 0);
    for (let rr = br - 1; rr <= br + 1; rr++) {
      if (rr < 0 || rr >= hRows) continue;
      for (let cc = bc - 1; cc <= bc + 1; cc++) {
        if (cc < 0 || cc >= hCols) continue;
        const arr = buckets[rr * hCols + cc];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) {
          const dc = arr[i] - c, dr = arr[i + 1] - r;
          if (dc * dc + dr * dr < d2) return true;
        }
      }
    }
    return false;
  };

  // RK2-Integration ab (c,r) in Richtung dir(+1/-1); stoppt bei bestehender Linie
  // oder unterhalb MIN_SPEED (keine Kriech-Linien in stehendem Wasser).
  function integrate(c0, r0, dir) {
    const pts = [];
    let c = c0, r = r0;
    for (let s = 0; s < MAX_STEPS; s++) {
      const k1 = sample(c, r);
      if (!k1 || k1.speed < MIN_SPEED) break;
      const inv1 = (hStep * dir) / k1.speed;
      const mc = c + k1.vx * inv1 * 0.5, mr = r + k1.vy * inv1 * 0.5;
      const k2 = sample(mc, mr);
      if (!k2 || k2.speed < MIN_SPEED) { pts.push({ c, r, s: k1.speed }); break; }
      const inv2 = (hStep * dir) / k2.speed;
      const nc = c + k2.vx * inv2, nr = r + k2.vy * inv2;
      pts.push({ c, r, s: k1.speed });
      if (s > 1 && tooClose(nc, nr, dTest)) break;
      if (Math.abs(nc - c) + Math.abs(nr - r) < 1e-4) break; // Stillstand (Wirbelkern)
      c = nc; r = nr;
    }
    return pts;
  }

  // ── Geometrie-Sammler (Segment-Paare für LineSegments2) ────────────────────
  const positions = [];
  const colors = [];
  let lineCount = 0;
  let vertCount = 0;

  const worldZ = (c, r) => {
    const ci = Math.min(ncols - 1, Math.max(0, Math.round(c)));
    const ri = Math.min(nrows - 1, Math.max(0, Math.round(r)));
    const idxT = flippedIndex(ri, ci, ncols, nrows);  // gridData ist bottom-up
    const d = depthField ? depthField[ri * ncols + ci] : 0;
    return (gridData[idxT] - minZ) + (d > 0 ? d : 0) + 0.3;
  };
  const toWorld = (p) => ({
    x: -width / 2 + p.c * cs,
    y: height / 2 - p.r * cs,
    z: worldZ(p.c, p.r),
    t: Math.min(1, p.s / sref),
  });

  const rgb = [0, 0, 0];
  function emitLine(line) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = toWorld(line[i]), b = toWorld(line[i + 1]);
      // Riesensprung-Filter: Tiefen-Dorne/Brennkanten erzeugen vertikale Nadeln —
      // solche Segmente auslassen statt eine >3-m-Zacke zu zeichnen.
      if (Math.abs(a.z - b.z) > MAX_JUMP_Z) continue;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      speedColor(a.t, rgb, 0); colors.push(rgb[0], rgb[1], rgb[2]);
      speedColor(b.t, rgb, 0); colors.push(rgb[0], rgb[1], rgb[2]);
      vertCount += 2;
    }
    for (const p of line) addSample(p.c, p.r);
    lineCount++;
  }

  // ── Seed-Queue (Jobard-Lefer) ──────────────────────────────────────────────
  let seedC = -1, seedR = -1, seedS = -1;
  for (let r = 1; r < nrows - 1; r += 2) for (let c = 1; c < ncols - 1; c += 2) {
    const k = sample(c, r);
    if (k && k.speed > seedS) { seedS = k.speed; seedC = c; seedR = r; }
  }
  if (seedC < 0 || seedS < MIN_SPEED) return { positions, colors };

  const queue = [[seedC, seedR]];
  let qi = 0;
  const scanStride = Math.max(1, Math.round(dSep));
  let scanPos = 0;
  const findUncoveredSeed = () => {
    const total = ncols * nrows;
    for (; scanPos < total; scanPos += scanStride) {
      const c = scanPos % ncols, r = (scanPos / ncols) | 0;
      if (r < 1 || r >= nrows - 1 || c < 1 || c >= ncols - 1) continue;
      if (tooClose(c, r, dSep)) continue;
      const k = sample(c, r);
      if (k && k.speed > MIN_SPEED) { scanPos += scanStride; return [c, r]; }
    }
    return null;
  };

  while (lineCount < MAX_LINES && vertCount < MAX_VERTS) {
    let seed;
    if (qi < queue.length) seed = queue[qi++];
    else { seed = findUncoveredSeed(); if (!seed) break; }
    const [sc, sr] = seed;
    if (tooClose(sc, sr, dSep)) continue;
    const k = sample(sc, sr);
    if (!k || k.speed < MIN_SPEED) continue;      // keine Seeds in ~stehendem Wasser

    const back = integrate(sc, sr, -1); back.reverse();
    const fwd = integrate(sc, sr, +1);
    const line = back.concat(fwd.slice(1));
    if (line.length < MIN_PTS) continue;

    emitLine(line);

    const stepEvery = Math.max(1, Math.round(dSep / hStep));
    for (let i = 0; i < line.length; i += stepEvery) {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      let tx = b.c - a.c, ty = b.r - a.r;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      queue.push([line[i].c - ty * dSep, line[i].r + tx * dSep]);
      queue.push([line[i].c + ty * dSep, line[i].r - tx * dSep]);
    }
  }

  return { positions, colors };
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'terrain') {
    T = msg; // gridData/mask bleiben hier gecacht — kein Re-Klonen je Frame
    return;
  }
  if (msg.type === 'build') {
    if (!T) { self.postMessage({ type: 'lines', reqId: msg.reqId, positions: new Float32Array(0), colors: new Float32Array(0) }); return; }
    const { positions, colors } = build(msg.vx, msg.vy, msg.depth, msg.density);
    const pos = new Float32Array(positions);
    const col = new Float32Array(colors);
    self.postMessage({ type: 'lines', reqId: msg.reqId, positions: pos, colors: col }, [pos.buffer, col.buffer]);
  }
};
