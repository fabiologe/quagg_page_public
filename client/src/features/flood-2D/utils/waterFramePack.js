/**
 * waterFramePack.js — pure Per-Frame-Pipeline der Wasseroberfläche.
 *
 * Rechnet aus einem Tiefen-Frame (+ optional Solver-WSE .elev und Velocity) die
 * ANZEIGE-Daten, die der Wasser-Shader braucht — ohne THREE, ohne DOM, ohne Vue:
 *   pack (RG, Float32Array 2N):  R = geglättete Anzeige-Tiefe (Fragment-discard/Farbe)
 *                                G = Anzeige-Wasserspiegel lokal (= Welt − minZ) INKLUSIVE
 *                                    Trockenzellen-Fill (höchster nasser Nachbar-Spiegel,
 *                                    „kein Vorhang" an der Uferlinie)
 *   turb (Uint8Array N, optional): Turbulenz 0..255 für Gischt/Wellen (nur Modus 0)
 *   smoothedDepth (Float32Array N): geglättete Tiefe — braucht fillOvertop() für den
 *                                    Überström-Test an Wehrkanten
 *
 * Läuft identisch auf dem Main-Thread (synchroner Fallback in useWaterSurface) und im
 * waterSurfaceWorker — deshalb hier KEINE Abhängigkeiten außer depthSpikes. Die Werte
 * sind bit-identisch zu denen, die der frühere CPU-Displacement-Pfad in position.z /
 * aDepth geschrieben hat (Paritäts-Test: test/test_water_framepack.mjs).
 */
import { analyzeDepthSpikes } from './depthSpikes.js';

export const WET = 0.005; // m — Schwelle „nass" (deckt sich mit dem Fragment-discard)
export const NODATA_ELEV = -1000; // .elev-Werte darunter (z. B. -9999) gelten als ungültig/trocken

// Räumliche Glättung der Tiefe vor dem Z-Displacement. Ohne sie wird die Wasserhaut in
// turbulenten Bereichen zackig. 0 = roh, 1 = voll geglättet (85 % geglättet).
export const SMOOTH_MIX = 0.85;

/**
 * 9-Tap-Box-Blur über das Tiefenfeld, aber NASS-GATED: trockene Zellen bleiben exakt trocken und
 * nasse Zellen mitteln NUR über nasse Nachbarn. So blutet kein Wasser über eine Wehrkante (oder eine
 * beliebige Nass/Trocken-Front) — der Stauspiegel bleibt scharf, keine Phantom-Tiefe hinter der Wand.
 * @param {Float32Array} raw   top-down, idx = row*ncols+col (deckt sich mit der Vertex-Reihenfolge)
 */
export function smoothDepth(raw, ncols, nrows, scratch) {
  const out = (scratch && scratch.length === raw.length) ? scratch : new Float32Array(raw.length);
  for (let r = 0; r < nrows; r++) {
    const rm = r > 0 ? r - 1 : 0;
    const rp = r < nrows - 1 ? r + 1 : nrows - 1;
    for (let c = 0; c < ncols; c++) {
      const i = r * ncols + c;
      const d0 = raw[i];
      if (!(d0 > WET)) { out[i] = d0; continue; } // trocken bleibt trocken

      const cm = c > 0 ? c - 1 : 0;
      const cp = c < ncols - 1 ? c + 1 : ncols - 1;
      let sum = 0, cnt = 0;
      const acc = (v) => { if (v > WET) { sum += v; cnt++; } };
      acc(raw[rm * ncols + cm]); acc(raw[rm * ncols + c]); acc(raw[rm * ncols + cp]);
      acc(raw[r  * ncols + cm]); acc(d0);                  acc(raw[r  * ncols + cp]);
      acc(raw[rp * ncols + cm]); acc(raw[rp * ncols + c]); acc(raw[rp * ncols + cp]);

      const dAvg = cnt > 0 ? sum / cnt : d0; // nur über nasse Nachbarn mitteln
      out[i] = d0 + (dAvg - d0) * SMOOTH_MIX;
    }
  }
  return out;
}

/**
 * @param {object} opts
 * @param {Float32Array} opts.depth      Roh-Tiefen-Frame (top-down, ncols·nrows) — wird nicht mutiert
 * @param {Float32Array} [opts.elev]     exakter Solver-Wasserspiegel (.elev), bevorzugt vor baseZ+Tiefe
 * @param {Float32Array} [opts.velocity] Geschwindigkeits-Betrag (Froude-Anteil der Turbulenz)
 * @param {Float32Array} opts.baseZ      Terrainhöhe je Vertex (lokal = Welt − minZ)
 * @param {number} opts.ncols @param {number} opts.nrows
 * @param {number} opts.minZ @param {number} opts.cellsize
 * @param {boolean} [opts.detectSpikes]  false → nur robuster Farb-Deckel, keine Spike-Marker/Kappung
 * @param {boolean} [opts.wantTurb]      true → Turbulenz-Feld mitrechnen (Modus 0)
 * @param {object} [scratch]  wiederverwendbare Zwischenpuffer { surf, rawTurb } — NUR Temporaries;
 *                            alle Rückgabe-Arrays sind frisch (LRU-Cache/Worker-Transfer-fähig)
 * @returns {{ pack: Float32Array, turb: Uint8Array|null, smoothedDepth: Float32Array,
 *             robustMax: number, flagged: Array }}
 */
export function packWaterFrame(opts, scratch = {}) {
  const { baseZ, ncols, nrows, minZ = 0, cellsize = 0 } = opts;
  const N = ncols * nrows;
  let raw = opts.depth;

  // Solver-Ausreißer abfangen: NaN/Inf/negative Tiefen würden Vertices
  // unkontrolliert verschieben → als trocken (0) behandeln.
  // Kopie nur, wenn tatsächlich etwas Ungültiges gefunden wird.
  let sanitized = false;
  for (let i = 0; i < N; i++) {
    const d = raw[i];
    if (!Number.isFinite(d) || d < 0) {
      if (!sanitized) { raw = raw.slice(); sanitized = true; }
      raw[i] = 0;
    }
  }

  // Numerische Tiefen-Dorne (Solver-Instabilität: 10-m-Nadel in flacher Umgebung)
  // für die ANZEIGE kappen + robusten Farb-Deckel bestimmen. Rohwerte bleiben
  // erhalten — Probe/Tooltip zeigen weiter den echten Wert; die Stellen werden via
  // onStats als Gefahrenmarker gemeldet, damit die Info nicht verloren geht.
  const spikes = analyzeDepthSpikes(raw, ncols, nrows, { flag: opts.detectSpikes !== false });

  // Tiefe räumlich glätten → keine zackige Oberfläche in turbulenten Bereichen.
  // (frisches Array: wandert in den LRU-Cache bzw. als Transferable zurück zum Main-Thread)
  const depth = smoothDepth(spikes.display, ncols, nrows, null);

  // ── Wasseroberfläche je Vertex (lokal = Welt − minZ) ───────────────────────
  // BEVORZUGT der exakte Solver-Wasserspiegel .elev: er ist unabhängig vom (evtl.
  // abweichenden) Viewer-Terrain baseZ — die Haut sitzt genau dort, wo der Solver
  // Wasser hat, statt auf baseZ+geglätteteTiefe. Fehlt elev (Summenraster/Altdaten),
  // Fallback auf baseZ+Tiefe. Tiefen-Dorne werden über robustMax gezähmt.
  const elev = (opts.elev instanceof Float32Array && opts.elev.length === N) ? opts.elev : null;
  const surf = (scratch.surf && scratch.surf.length === N)
    ? scratch.surf : (scratch.surf = new Float32Array(N)); // lokale Oberfläche nasser Zellen, sonst -Infinity
  for (let i = 0; i < N; i++) {
    if (!(depth[i] > WET)) { surf[i] = -Infinity; continue; }
    let zl;
    if (elev && Number.isFinite(elev[i]) && elev[i] > NODATA_ELEV) {
      zl = elev[i] - minZ;
      const rise = zl - baseZ[i];
      if (rise > spikes.robustMax) zl = baseZ[i] + spikes.robustMax; // Tiefen-Dorn zähmen
      else if (rise < 0)           zl = baseZ[i] + depth[i];         // elev unter Terrain → Fallback
    } else {
      zl = baseZ[i] + depth[i];
    }
    surf[i] = zl;
  }

  const pack = new Float32Array(N * 2); // [R=Anzeige-Tiefe, G=Anzeige-WSE] je Zelle
  for (let i = 0; i < N; i++) {
    const d = depth[i];
    pack[i * 2] = d;
    if (d > WET) {
      pack[i * 2 + 1] = surf[i]; // nasse Zelle: exakter Solver-Wasserspiegel (.elev)
    } else {
      // Trockene Zelle: auf den HÖCHSTEN nassen Nachbar-Wasserspiegel anheben (kein „Vorhang");
      // der trockene Teil wird im Fragment via vDepth-discard ohnehin ausgespart.
      const col = i % ncols;
      const row = (i - col) / ncols;
      let s = -Infinity;
      if (col > 0          && surf[i - 1]     > -Infinity) s = Math.max(s, surf[i - 1]);
      if (col < ncols - 1  && surf[i + 1]     > -Infinity) s = Math.max(s, surf[i + 1]);
      if (row > 0          && surf[i - ncols] > -Infinity) s = Math.max(s, surf[i - ncols]);
      if (row < nrows - 1  && surf[i + ncols] > -Infinity) s = Math.max(s, surf[i + ncols]);
      pack[i * 2 + 1] = (s > -Infinity) ? s : baseZ[i];
    }
  }

  // ── Turbulenz je Zelle (treibt Gischt + Wellen im Shader) — nur Modus 0 ──────
  // Maß: Steilheit des Wasserspiegels gegen NASSE Nachbarn (Stau an der Wand,
  // Wechselsprung) — genau dort, wo das Wasser „anklatscht". Ruhige Teiche/Ufer haben
  // ~gleiches Niveau → kein Gradient → kein Schaum. Schnelles Wasser (falls Velocity-
  // Frame anliegt) schäumt zusätzlich. Trockene Zellen bleiben 0.
  let turb = null;
  if (opts.wantTurb) {
    turb = new Uint8Array(N);
    const vel = (opts.velocity instanceof Float32Array && opts.velocity.length === N)
      ? opts.velocity : null;
    const TURB_DZ = 0.25;    // m Spiegel-Sprung zum Nachbarn → volle Gradient-Turbulenz (Wehr-Anprall)
    const FR_FULL = 1.2;     // Froude-Zahl, ab der die Oberfläche voll aufgewühlt ist (schießend)
    const SLOPE_FULL = 0.05; // Wasserspiegel-GEFÄLLE (5 %) → volle Wellen-Amplitude
    const rawTurb = (scratch.rawTurb && scratch.rawTurb.length === N)
      ? scratch.rawTurb : (scratch.rawTurb = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      if (!(d > WET)) { rawTurb[i] = 0; continue; }
      let t = 0;
      const wsp = surf[i]; // echter Wasserspiegel (elev-basiert) statt baseZ+Tiefe
      const col = i % ncols, row = (i - col) / ncols;
      let g = 0;
      if (col > 0         && surf[i - 1]     > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i - 1]));
      if (col < ncols - 1 && surf[i + 1]     > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i + 1]));
      if (row > 0         && surf[i - ncols] > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i - ncols]));
      if (row < nrows - 1 && surf[i + ncols] > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i + ncols]));
      t = Math.min(1, g / TURB_DZ);
      // Spiegel-GEFÄLLE (dimensionslos, g je Zellschritt / cellsize): steile Strecken
      // (Rampen, Gefällstrecken) sind auch unterhalb Fr 1 rau — deutlich empfindlicher
      // als der absolute TURB_DZ-Sprung, der den Wehr-Anprall markiert.
      if (cellsize > 0) t = Math.max(t, Math.min(1, g / (cellsize * SLOPE_FULL)));
      if (vel) {
        // Physik statt Heuristik: Froude-Zahl Fr = v/√(g·h). Schießender Abfluss (Fr≳1,
        // flach + schnell: Rampen, Wechselsprung-Nähe) reißt die Oberfläche auf; tiefes
        // Wasser bleibt auch bei gleicher Geschwindigkeit glatt — wie in echt.
        const fr = vel[i] / Math.sqrt(9.81 * Math.max(d, 0.02));
        const vt = Math.min(1, fr / FR_FULL);
        t = Math.max(t, vt * vt);
      }
      rawTurb[i] = t;
    }
    // Turbulenz räumlich aufweiten + glätten (nass-gated, 8-connected): Dilatation hält die
    // Spitze direkt an der Wehrkante, die Mittelung verbreitert das Schaumband auf ~3 Zellen
    // und nimmt der harten 1-Zellen-Linie das Zackige. Quantisierung auf 1/255 ist unsichtbar
    // (treibt nur Smoothsteps im Shader).
    for (let r = 0; r < nrows; r++) {
      for (let c = 0; c < ncols; c++) {
        const i = r * ncols + c;
        if (!(depth[i] > WET)) { turb[i] = 0; continue; }
        let s = rawTurb[i], mx = rawTurb[i], cnt = 1;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr; if (rr < 0 || rr >= nrows) continue;
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const cc = c + dc; if (cc < 0 || cc >= ncols) continue;
            const j = rr * ncols + cc;
            if (!(depth[j] > WET)) continue;
            s += rawTurb[j]; if (rawTurb[j] > mx) mx = rawTurb[j]; cnt++;
          }
        }
        turb[i] = Math.round(255 * (0.5 * mx + 0.5 * (s / cnt))); // Dilatation (Spitze) + Glättung (weiche Kante)
      }
    }
  }

  return { pack, turb, smoothedDepth: depth, robustMax: spikes.robustMax, flagged: spikes.flagged };
}
