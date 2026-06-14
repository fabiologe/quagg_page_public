/**
 * depthSpikes.js — robuste Behandlung numerischer Tiefen-Ausreißer.
 *
 * LISFLOOD-FP kann an Stabilitätsgrenzen (Wet/Dry, sehr kleine Tstep, steile
 * Sohle) in EINZELNEN Zellen kurzzeitig absurde Wasserstände (z. B. 10 m)
 * produzieren — eine Nadel inmitten flacher Nachbarn. Das verzerrt im Viewer
 *   (a) die Geometrie (10-m-Dorn) und
 *   (b) die Farbskala (alles andere wird platt-blau, weil max ≈ 10).
 *
 * Strategie: solche Zellen ERKENNEN (extrem + räumlich isoliert), für die
 * ANZEIGE auf einen robusten Deckel kappen, und die Farbskala auf ein Perzentil
 * statt das rohe Maximum legen. Der ROHWERT bleibt unangetastet (separat in den
 * Frames) → Probe/Tooltip zeigen weiterhin den echten Wert, Info geht nicht
 * verloren. Die markierten Zellen werden zurückgegeben (für Gefahrenmarker).
 *
 * @param {Float32Array} depth  Tiefen-Frame (bereits NaN/Inf-bereinigt empfohlen)
 * @param {number} ncols @param {number} nrows
 * @param {object} [opts]
 * @returns {{ display: Float32Array, robustMax: number,
 *             flagged: Array<{i:number,col:number,row:number,value:number}> }}
 */
export function analyzeDepthSpikes(depth, ncols, nrows, opts = {}) {
  const N = depth.length;
  const WET     = opts.wet     ?? 0.02; // m — ab hier "nass"
  const RATIO   = opts.ratio   ?? 3.0;  // d > Nachbar-Max · RATIO  → verdächtig
  const ABS     = opts.abs     ?? 1.0;  // und d − Nachbar-Max > ABS (m) → isolierter Dorn
  const MIN_HIGH = opts.minHigh ?? 0.5; // m — darunter gar nicht prüfen (flache Läufe → nie flaggen)
  const doFlag = opts.flag !== false;   // false → nur robusten Deckel (p99), keine Spike-Marker/Kappung
  const haveDims = !!(ncols && nrows && ncols * nrows === N);

  // 1) Spikes per RÄUMLICHER ISOLATION erkennen — UNABHÄNGIG von globaler Statistik
  //    (sonst frisst ein Spike sein eigenes Perzentil und bleibt unerkannt).
  const flagged = [];
  const isSpike = N > 0 ? new Uint8Array(N) : null;
  if (haveDims && doFlag) {
    for (let i = 0; i < N; i++) {
      const d = depth[i];
      if (!(d > MIN_HIGH) || !Number.isFinite(d)) continue;
      const col = i % ncols;
      const row = (i - col) / ncols;
      let nmax = 0;
      if (col > 0)         nmax = Math.max(nmax, depth[i - 1]);
      if (col < ncols - 1) nmax = Math.max(nmax, depth[i + 1]);
      if (row > 0)         nmax = Math.max(nmax, depth[i - ncols]);
      if (row < nrows - 1) nmax = Math.max(nmax, depth[i + ncols]);
      // Echtes tiefes Wasser hat ähnlich tiefe Nachbarn → nur ISOLIERTE Dorne flaggen.
      if (d > nmax * RATIO && (d - nmax) > ABS) {
        isSpike[i] = 1;
        flagged.push({ i, col, row, value: d });
      }
    }
  }

  // 2) Robuster Anzeige-Deckel = p99 über nasse, NICHT geflaggte Zellen
  const sample = [];
  const stride = Math.max(1, Math.floor(N / 4000));
  for (let i = 0; i < N; i += stride) {
    const d = depth[i];
    if (d > WET && Number.isFinite(d) && !(isSpike && isSpike[i])) sample.push(d);
  }
  sample.sort((a, b) => a - b);
  const p99 = sample.length ? sample[Math.min(sample.length - 1, Math.floor(0.99 * sample.length))] : 0;
  const robustMax = Math.max(p99, 0.1);

  // 3) Anzeige-Tiefe: geflaggte Zellen auf den Deckel kappen (keine Nadel, bleibt "heiß")
  let display = depth;
  if (flagged.length) {
    display = depth.slice();
    for (const f of flagged) display[f.i] = Math.min(f.value, robustMax);
  }

  return { display, robustMax, flagged };
}
