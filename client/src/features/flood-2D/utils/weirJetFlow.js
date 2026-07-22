/**
 * weirJetFlow.js — analytische Kontraktions-/Freistrahl-Überlagerung an Wehr-Durchlässen.
 *
 * Der Solver kennt einen Durchlass nur als lumped Orifice-Term (Qp=Cd·Area·√(2gΔh) in
 * weir_flow.cpp, Export als <dir>B — InputGenerator.js generateWeirFile). Das 2D-vx/vy-
 * Feld zeigt an der Durchlass-Zelle daher nur die unauffällige Floodplain-Geschwindigkeit,
 * keine sub-Zell-Kontraktion/Strahlbildung. Dieses Modul überlagert das NUR beim Rendern
 * (Pfeile/Streamlines), analog zu pierFlowDeflection.js — keine Solver-/Exportdaten werden
 * berührt.
 *
 * Anders als bei Pfeilern ist die Strahl-ACHSE hier keine freie Ambient-Richtung, sondern
 * eine STRUKTURELLE Tatsache: jede Wehrzelle trägt bereits ein festes `direction`-Feld
 * ('S'|'E' — dieselbe Konvention wie deriveDirection() in BridgeMeshLattice.js). Nur das
 * VORZEICHEN (Fließrichtung entlang dieser Achse: auf/ab, je nach Wasserstand) und der
 * BETRAG kommen aus dem echten, lokal gesampelten Solver-Feld — der Queranteil wird
 * bewusst verworfen (die Orifice-Formel des Solvers ist selbst 1D, ein Queranteil im
 * rohen Floodplain-vx/vy wäre nur Rauschen für die Strahlrichtung).
 *
 * Worker-sicher: kein THREE/DOM/Vue. Koordinaten in Grid-Index-Einheiten (top-down,
 * c=Spalte, r=Zeile — identisch zu pierFlowDeflection.js/vx,vy).
 * Die Krone selbst (orifice==null) bleibt Sache von weirGeometry.js/collectWeirCrestCells
 * (obstacleMask()) — dieses Modul behandelt ausschließlich orifice!=null-Zellen.
 */
import { bilinearVelocity } from './pierFlowDeflection.js';

export const JET_FLOW_DEFAULTS = Object.freeze({
  // Mindest-Halbbreite [Zellen] — bestimmt zugleich den Beschleunigungs-Deckel:
  // accel=1/(2·aCells) ist streng monoton fallend in aCells, der Floor hier ist also
  // schon der einzige nötige Deckel (bei 0.2 → accel≤2.5, kein separates ACCEL_MULT_MAX nötig).
  MIN_A_CELLS: 0.2,
  ACCEL_MULT_MIN: 1.0,       // Kontraktion nie < 1 (breiter Durchlass ≈ ungestörtes Feld)
  CONVERGENCE_LEN_MULT: 3,   // Anström-Einflusslänge  = 3 × aCells (stromauf)
  JET_LEN_MULT: 6,           // Strahl-Einflusslänge   = 6 × aCells (stromab)
  SPREAD_HALF_ANGLE_DEG: 12, // empirischer Freistrahl-Öffnungswinkel (turbulent, Literatur 11–15°)
  BEND_GAIN: 0.6,            // Stärke der lateralen Umlenkung zur Mittelachse in der Anströmzone
  AMBIENT_PAD_CELLS: 1.5,    // Ambient-Sample-Punkte bei aCells+AMBIENT_PAD_CELLS, entlang der Achse
});

// Einmalig berechnet (Modul-Ladezeit) — kein trig im Hot-Path.
const TAN_SPREAD = Math.tan(JET_FLOW_DEFAULTS.SPREAD_HALF_ANGLE_DEG * Math.PI / 180);

/**
 * Durchlass-Geometrie aller Wehrzellen mit orifice!=null, in Grid-Index-Koordinaten
 * (einmalig pro Terrain/Wehr-Kombination, danach cachebar — Durchlässe bewegen sich
 * nicht pro Frame).
 * @param {Array} weirs   geoStore.weirs (flach, pro Zelle: {x,y,direction,orifice,...})
 * @param {{ncols:number,nrows:number,cellsize:number,xll?:number,xllcorner?:number,yll?:number,yllcorner?:number}} header
 * @returns {Array<{c0:number,r0:number,aCells:number,axisC:number,axisR:number,convLen:number,jetLen:number,ambUp:{c,r},ambDn:{c,r}}>}
 */
export function buildJetGeometry(weirs, header) {
  const { nrows, cellsize } = header;
  const cs = cellsize || 1;
  const xll = header.xll !== undefined ? header.xll : header.xllcorner;
  const yll = header.yll !== undefined ? header.yll : header.yllcorner;
  const out = [];
  for (const w of (weirs || [])) {
    if (w.orifice == null) continue; // Krone → Feature 1 (collectWeirCrestCells), nicht hier
    const c0 = (w.x - xll) / cs;
    const rowBottomUp = (w.y - yll) / cs;
    const r0 = (nrows - 1) - rowBottomUp; // bottom-up → top-down, wie buildPierGeometry

    const widthM = w.orifice.width > 0 ? w.orifice.width : cs;
    const aCells = Math.max((widthM / 2) / cs, JET_FLOW_DEFAULTS.MIN_A_CELLS);
    // 'S' blockt N-S-Fluss → Achse = Zeilen/vy; 'E' blockt O-W-Fluss → Achse = Spalten/vx
    // (dieselbe Konvention wie deriveDirection() in BridgeMeshLattice.js).
    const axisC = w.direction === 'E' ? 1 : 0;
    const axisR = w.direction === 'E' ? 0 : 1;
    const convLen = aCells * JET_FLOW_DEFAULTS.CONVERGENCE_LEN_MULT;
    const jetLen = aCells * JET_FLOW_DEFAULTS.JET_LEN_MULT;
    const pad = aCells + JET_FLOW_DEFAULTS.AMBIENT_PAD_CELLS;
    out.push({
      c0, r0, aCells, axisC, axisR, convLen, jetLen,
      ambUp: { c: c0 - axisC * pad, r: r0 - axisR * pad },
      ambDn: { c: c0 + axisC * pad, r: r0 + axisR * pad },
    });
  }
  return out;
}

/**
 * Ambient-Betrag+Vorzeichen je Durchlass, ENTLANG der festen Bauwerksachse (Queranteil
 * bewusst verworfen — s. Moduldoc). Einmal pro Frame aus zwei achsparallelen Sample-
 * punkten (stromauf/-ab der Öffnung) gemittelt.
 * @returns {Array<{sign:1|-1, speed:number}|null>} parallel zu jetGeoms; null = kein
 *          verlässliches Ambient (beide Sample-Punkte trocken/maskiert).
 */
export function sampleAmbientForJets(jetGeoms, vx, vy, ncols, nrows, mask = null) {
  const out = new Array(jetGeoms.length);
  for (let i = 0; i < jetGeoms.length; i++) {
    const g = jetGeoms[i];
    const sUp = bilinearVelocity(vx, vy, ncols, nrows, g.ambUp.c, g.ambUp.r, mask);
    const sDn = bilinearVelocity(vx, vy, ncols, nrows, g.ambDn.c, g.ambDn.r, mask);
    const alongOf = (s) => (s ? s.vx * g.axisC + s.vy * g.axisR : null);
    const aUp = alongOf(sUp), aDn = alongOf(sDn);
    let along = null;
    if (aUp != null && aDn != null) along = (aUp + aDn) / 2;
    else if (aUp != null) along = aUp;
    else if (aDn != null) along = aDn;
    out[i] = (along == null || Math.abs(along) <= 1e-4) ? null : { sign: along >= 0 ? 1 : -1, speed: Math.abs(along) };
  }
  return out;
}

/**
 * Geschwindigkeit an (c,r) um alle Durchlässe in Reichweite überlagern (additiv, wie
 * pierFlowDeflection.deflectVelocity). Zwei Zonen entlang der festen Achse:
 * Anströmzone (along<0, Beschleunigung + laterale Umlenkung zur Mitte) und Freistrahl-
 * zone (along≥0, Kegelaufweitung + Zentrallinien-Abklingen). Beide treffen sich bei
 * along=0 exakt im selben Wert (speedHere=vThroat, reine Achsrichtung) — keine
 * Sprungstelle an der Nahtstelle. Hot-Path: kein atan2/sin/cos (TAN_SPREAD ist vorab
 * berechnet).
 * @param {number} c, {number} r          Abfragepunkt, Grid-Index (top-down)
 * @param {number} rawVx, {number} rawVy  Solver-Rohgeschwindigkeit an (c,r), m/s
 * @param {Array} jetGeoms   aus buildJetGeometry()
 * @param {Array} ambientForJets  aus sampleAmbientForJets(), gleiche Länge
 * @returns {{vx:number, vy:number}}
 */
export function applyJetFlow(c, r, rawVx, rawVy, jetGeoms, ambientForJets) {
  if (!jetGeoms || !jetGeoms.length) return { vx: rawVx, vy: rawVy };
  let dvx = 0, dvy = 0;
  for (let i = 0; i < jetGeoms.length; i++) {
    const g = jetGeoms[i];
    const amb = ambientForJets ? ambientForJets[i] : null;
    if (!amb) continue;

    // Tatsächliche Fließrichtung DIESES Frames (Achse × Vorzeichen), plus Senkrechte.
    const axC = amb.sign * g.axisC, axR = amb.sign * g.axisR;
    const perpC = -axR, perpR = axC;
    const dx = c - g.c0, dy = r - g.r0;
    const along = dx * axC + dy * axR;
    const cross = dx * perpC + dy * perpR;

    // Kontinuitäts-Näherung: Anström-Querschnitt ≈ eine Zellbreite → Beschleunigung
    // = cs/Öffnungsbreite = 1/(2·aCells) (cs kürzt sich, aCells ist bereits in Zellen).
    // Deckel ergibt sich bereits aus dem MIN_A_CELLS-Floor auf aCells (s.o.).
    const accel = Math.max(JET_FLOW_DEFAULTS.ACCEL_MULT_MIN, 1 / (2 * g.aCells));
    const vThroat = amb.speed * accel;

    let weight = 0, jetVx = rawVx, jetVy = rawVy;
    if (along < 0) {
      // Anströmzone: Beschleunigung + laterale Umlenkung zur Mittelachse.
      const rho = Math.hypot(along, cross);
      if (rho <= g.convLen) {
        const f = (g.convLen - rho) / g.convLen; // 0 am Rand, 1 am Durchlass
        weight = f * f * (3 - 2 * f);            // smoothstep, wie Pfeiler-Blend
        const speedHere = amb.speed + (vThroat - amb.speed) * weight;
        const bend = Math.max(-1, Math.min(1, -cross / Math.max(g.aCells, 1e-6)))
          * JET_FLOW_DEFAULTS.BEND_GAIN * weight;
        const dC = axC + perpC * bend, dR = axR + perpR * bend;
        const n = Math.hypot(dC, dR) || 1;
        jetVx = (dC / n) * speedHere; jetVy = (dR / n) * speedHere;
      }
    } else if (along <= g.jetLen) {
      // Freistrahlzone: Kegelaufweitung (halfWidth linear, TAN_SPREAD vorab berechnet)
      // + Zentrallinien-Abklingen (derselbe smoothstep dient Betrag UND Gewicht).
      const halfWidthAt = g.aCells + along * TAN_SPREAD;
      const p = Math.abs(cross) / Math.max(halfWidthAt, 1e-6);
      if (p < 1) {
        const fDecay = 1 - along / g.jetLen;
        const wDecay = fDecay * fDecay * (3 - 2 * fDecay); // 1 am Mund → 0 am Strahlende
        const fLat = 1 - p;
        const wLat = fLat * fLat * (3 - 2 * fLat);         // 1 auf Achse → 0 am Kegelrand
        weight = wDecay * wLat;
        const speedHere = amb.speed + (vThroat - amb.speed) * wDecay;
        jetVx = axC * speedHere; jetVy = axR * speedHere;
      }
    }
    if (weight > 0) { dvx += weight * (jetVx - rawVx); dvy += weight * (jetVy - rawVy); }
  }
  return { vx: rawVx + dvx, vy: rawVy + dvy };
}
