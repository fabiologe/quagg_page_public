/**
 * pierFlowDeflection.js — analytische Potentialströmungs-Deflection um Brückenpfeiler.
 *
 * Der Solver kennt Pfeiler nur als lumped Wehr-/Öffnungsterm (w×Cd in weir_flow.cpp) —
 * das 2D-vx/vy-Feld hat keinerlei Umströmung (bestätigt: kein "pier" im LISFLOOD-FP-
 * Quellcode). Echte solver-seitige 2D-Auflösung ist mit den üblichen Pfeilerbreiten
 * (meist < 1 DEM-Zelle) und ohne AMR nicht sinnvoll möglich (siehe reference_bridge_
 * solver_resolution). Dieses Modul überlagert deshalb NUR beim Rendern (Pfeile/
 * Streamlines) eine Uniform-Flow+Doublet-Lösung (Potentialströmung um einen Kreis-
 * zylinder) im Ring zwischen Pfeilerrand und Einflussradius — gespeist aus lokal
 * gesampelter Solver-Anströmgeschwindigkeit. Keine Solver-/Exportdaten werden berührt.
 *
 * Worker-sicher: kein THREE/DOM/Vue. Koordinaten in Grid-Index-Einheiten (top-down,
 * c=Spalte, r=Zeile — identische Konvention zu vx/vy in useFlowArrows/streamlineWorker).
 * Innerhalb des Pfeiler-Footprints selbst (r<a) bleibt die bestehende obstacleMask()/
 * collectPierCells()-Ausblendung zuständig (echte Polygonform statt Kreisnäherung).
 */
import { uvToWorld } from './BridgeMeshLattice.js';

export const PIER_FLOW_DEFAULTS = Object.freeze({
  INFLUENCE_MULT: 4,    // Einflussradius R = INFLUENCE_MULT * aCells
  MIN_A_CELLS: 0.5,     // Mindest-Halbbreite in Zellen (Sichtbarkeits-Untergrenze auf groben DEMs)
  MIN_R_CELLS: 2.0,     // Mindest-Einflussradius in Zellen
  RING_SAMPLES: 8,      // Anzahl Ambient-Sample-Punkte pro Pfeiler
  RING_PAD_CELLS: 2.0,  // Sample-Ring liegt aCells+RING_PAD_CELLS vom Pfeilerzentrum entfernt
});

// Deflection-STÄRKE je Pfeiler-Nasenform — bewusst getrennt von pierShapeCd()
// (structureFiles.js: hydraulischer Durchfluss-Beiwert). Hier: rein visuelle Stärke.
const SHAPE_FACTOR = {
  eckig: 1.0,
  abgerundet: 0.85,
  stromlinienfoermig: 0.65,
  'stromlinienförmig': 0.65,
};
const DEFAULT_SHAPE_FACTOR = 0.85;

export function pierNoseShapeFactor(shape) {
  return SHAPE_FACTOR[shape] ?? DEFAULT_SHAPE_FACTOR;
}

/**
 * Pfeiler-Geometrie aller mesh3d-Brücken in Grid-Index-Koordinaten (einmalig pro
 * Terrain/Brücken-Kombination, danach cachebar — Pfeiler bewegen sich nicht pro Frame).
 * @param {Array} bridges  geoStore.bridges
 * @param {{ncols:number,nrows:number,cellsize:number,xll?:number,xllcorner?:number,yll?:number,yllcorner?:number}} header
 * @returns {Array<{c0:number,r0:number,aCells:number,rCells:number,shapeFactor:number,ring:Array<{c:number,r:number}>}>}
 */
export function buildPierGeometry(bridges, header) {
  const { ncols, nrows, cellsize } = header;
  const cs = cellsize || 1;
  const xll = header.xll !== undefined ? header.xll : header.xllcorner;
  const yll = header.yll !== undefined ? header.yll : header.yllcorner;
  const out = [];
  for (const bridge of (bridges || [])) {
    if (bridge.kind !== 'mesh3d' || !bridge.lattice?.piers?.length) continue;
    const { lattice } = bridge;
    const shapeFactor = pierNoseShapeFactor(bridge.pierNose);
    for (const pier of lattice.piers) {
      if (!pier.poly || pier.poly.length < 2) continue;
      let u0 = Infinity, u1 = -Infinity;
      for (const p of pier.poly) { if (p.u < u0) u0 = p.u; if (p.u > u1) u1 = p.u; }
      if (!(u1 > u0)) continue;
      const uCenter = (u0 + u1) / 2;
      const widthM = (u1 - u0) * (lattice.spanLen || 0);
      const world = uvToWorld(lattice, uCenter, 0.5); // v=0.5 = Deck-Mittellinie
      const c0 = (world.x - xll) / cs;
      const rowBottomUp = (world.y - yll) / cs;
      const r0 = (nrows - 1) - rowBottomUp; // bottom-up → top-down, wie flipRow()

      const aCells = Math.max((widthM / 2) / cs, PIER_FLOW_DEFAULTS.MIN_A_CELLS);
      const rCells = Math.max(aCells * PIER_FLOW_DEFAULTS.INFLUENCE_MULT, PIER_FLOW_DEFAULTS.MIN_R_CELLS);

      const ring = [];
      const ringR = aCells + PIER_FLOW_DEFAULTS.RING_PAD_CELLS;
      const N = PIER_FLOW_DEFAULTS.RING_SAMPLES;
      for (let k = 0; k < N; k++) {
        const ang = (k / N) * Math.PI * 2;
        const rc = c0 + ringR * Math.cos(ang);
        const rr = r0 + ringR * Math.sin(ang);
        if (rc < 0 || rc > ncols - 1 || rr < 0 || rr > nrows - 1) continue;
        ring.push({ c: rc, r: rr });
      }
      out.push({ c0, r0, aCells, rCells, shapeFactor, ring });
    }
  }
  return out;
}

// Bilineare Geschwindigkeits-Probe (wie streamlineWorker.buildSampler, aber ohne
// Depth-Gating — der Ambient-Ring liegt knapp außerhalb des Pfeilers, wo im aktiven
// Frame ohnehin Wasser fließt; NoData/Maske werden trotzdem ausgeschlossen).
// Exportiert, weil weirJetFlow.js dieselbe Probe für die Durchlass-Ambient-Sample-
// Punkte braucht (keine Duplikation der Bilinear-Logik).
export function bilinearVelocity(vx, vy, ncols, nrows, c, r, mask) {
  if (c < 0 || r < 0 || c > ncols - 1 || r > nrows - 1) return null;
  const c0 = Math.floor(c), r0 = Math.floor(r);
  const c1 = Math.min(ncols - 1, c0 + 1), r1 = Math.min(nrows - 1, r0 + 1);
  const fc = c - c0, fr = r - r0;
  let sx = 0, sy = 0, wsum = 0;
  for (let k = 0; k < 4; k++) {
    const cc = (k & 1) ? c1 : c0;
    const rr = (k & 2) ? r1 : r0;
    const w = ((k & 1) ? fc : 1 - fc) * ((k & 2) ? fr : 1 - fr);
    const i = rr * ncols + cc;
    if (mask && mask[i] < 128) continue;
    const vxv = vx[i], vyv = vy[i];
    if (!(vxv > -9000) || !(vyv > -9000)) continue;
    sx += vxv * w; sy += vyv * w; wsum += w;
  }
  if (wsum <= 1e-6) return null;
  sx /= wsum; sy /= wsum;
  return { vx: sx, vy: sy, speed: Math.hypot(sx, sy) };
}

/**
 * Ambient-(Freistrom-)Geschwindigkeit je Pfeiler — einmal pro Frame aus dem
 * vorberechneten Ring gesampelt (geschwindigkeits-gewichteter Mittelwert: schwache/
 * maskierte Ringpunkte tragen automatisch ~0 bei; kein separater Wet-Check nötig).
 * @returns {Array<{ux:number,uy:number,speed:number}|null>} parallel zu pierGeoms;
 *          null = kein verlässliches Ambient (aller Ringpunkte trocken/maskiert).
 */
export function sampleAmbientForPiers(pierGeoms, vx, vy, ncols, nrows, mask = null) {
  const out = new Array(pierGeoms.length);
  for (let i = 0; i < pierGeoms.length; i++) {
    const g = pierGeoms[i];
    let ux = 0, uy = 0, wsum = 0;
    for (const pt of g.ring) {
      const s = bilinearVelocity(vx, vy, ncols, nrows, pt.c, pt.r, mask);
      if (!s || s.speed <= 1e-4) continue;
      ux += s.vx * s.speed; uy += s.vy * s.speed; wsum += s.speed;
    }
    out[i] = wsum > 1e-6 ? { ux: ux / wsum, uy: uy / wsum, speed: Math.hypot(ux, uy) / wsum } : null;
  }
  return out;
}

/**
 * Geschwindigkeit an (c,r) um alle Pfeiler in Reichweite deflectieren (additive
 * Überlagerung über Potentialströmungs-Abweichungen vom jeweiligen Ambient).
 * Hot-Path: pro Pfeil-Glyph bzw. RK2-Sub-Schritt aufgerufen — kein atan2/sin/cos.
 * @param {number} c, {number} r          Abfragepunkt, Grid-Index (top-down)
 * @param {number} rawVx, {number} rawVy  Solver-Rohgeschwindigkeit an (c,r), m/s
 * @param {Array} pierGeoms   aus buildPierGeometry()
 * @param {Array} ambientForPiers  aus sampleAmbientForPiers(), gleiche Länge
 * @returns {{vx:number, vy:number}}
 */
export function deflectVelocity(c, r, rawVx, rawVy, pierGeoms, ambientForPiers) {
  if (!pierGeoms || !pierGeoms.length) return { vx: rawVx, vy: rawVy };
  let dvx = 0, dvy = 0;
  for (let i = 0; i < pierGeoms.length; i++) {
    const g = pierGeoms[i];
    const amb = ambientForPiers ? ambientForPiers[i] : null;
    if (!amb || amb.speed <= 1e-4) continue;
    const dx = c - g.c0, dy = r - g.r0;
    const rho2 = dx * dx + dy * dy;
    if (rho2 > g.rCells * g.rCells) continue;
    const rho = Math.sqrt(rho2);

    // Rotation in pfeilerlokale Achsen (along = Anströmrichtung, cross = ⊥ dazu)
    // über Skalarprodukte — vermeidet atan2/sin/cos im Hot-Path.
    const uxHat = amb.ux / amb.speed, uyHat = amb.uy / amb.speed;
    const along = dx * uxHat + dy * uyHat;
    const cross = -dx * uyHat + dy * uxHat;

    // Uniform-Flow + Doublet (Potentialströmung um einen Kreiszylinder, Radius aCells):
    // Staupunkt bei along=±a,cross=0; 2×-Speedup bei along=0,cross=±a.
    const rClamped = Math.max(rho, g.aCells); // Innen-Singularität abfangen (r<a wird eh maskiert)
    const r2 = rClamped * rClamped;
    const t = (g.aCells * g.aCells) / r2;
    const uLocal = amb.speed * (1 - t * (along * along - cross * cross) / r2);
    const vLocal = -amb.speed * (2 * t * along * cross / r2);
    const devAlong = (uLocal - amb.speed) * g.shapeFactor;
    const devCross = vLocal * g.shapeFactor;

    // Glatter (C¹) Blend zwischen Pfeilerrand (a, volle Wirkung) und Einflussradius
    // (R, keine Wirkung) — smoothstep vermeidet eine Sprungstelle bei r=R.
    const span = g.rCells - g.aCells;
    const f = span > 1e-6 ? Math.min(1, Math.max(0, (g.rCells - rho) / span)) : (rho <= g.aCells ? 1 : 0);
    const weight = f * f * (3 - 2 * f);

    // Zurückrotieren in Welt-/Grid-Achsen und additiv aufsummieren.
    dvx += weight * (devAlong * uxHat - devCross * uyHat);
    dvy += weight * (devAlong * uyHat + devCross * uxHat);
  }
  return { vx: rawVx + dvx, vy: rawVy + dvy };
}
