// Paritäts-Test: utils/waterFramePack.js muss BIT-IDENTISCHE Anzeige-Werte liefern wie der
// frühere CPU-Displacement-Pfad in useWaterSurface.update() (Stand vor dem GPU-Umbau).
// Die Referenz unten ist eine WÖRTLICHE Kopie der alten Schleifen (sanitize → Spike-Kappung →
// smoothDepth → surf → position.z/aDepth → Turbulenz); nur die Turbulenz darf um die
// R8-Quantisierung (≤ 1/510) abweichen.
// Ausführen: node src/features/flood-2D/test/test_water_framepack.mjs   (aus client/)
import { packWaterFrame, smoothDepth, WET } from '../utils/waterFramePack.js';
import { analyzeDepthSpikes } from '../utils/depthSpikes.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

// ── Referenz: alte update()-Pipeline (Kopie, NICHT aus dem Modul importiert) ────────────
const SMOOTH_MIX = 0.85;
const NODATA_ELEV = -1000;

function smoothDepthRef(raw, ncols, nrows) {
    const out = new Float32Array(raw.length);
    for (let r = 0; r < nrows; r++) {
        const rm = r > 0 ? r - 1 : 0;
        const rp = r < nrows - 1 ? r + 1 : nrows - 1;
        for (let c = 0; c < ncols; c++) {
            const i = r * ncols + c;
            const d0 = raw[i];
            if (!(d0 > WET)) { out[i] = d0; continue; }
            const cm = c > 0 ? c - 1 : 0;
            const cp = c < ncols - 1 ? c + 1 : ncols - 1;
            let sum = 0, cnt = 0;
            const acc = (v) => { if (v > WET) { sum += v; cnt++; } };
            acc(raw[rm * ncols + cm]); acc(raw[rm * ncols + c]); acc(raw[rm * ncols + cp]);
            acc(raw[r  * ncols + cm]); acc(d0);                  acc(raw[r  * ncols + cp]);
            acc(raw[rp * ncols + cm]); acc(raw[rp * ncols + c]); acc(raw[rp * ncols + cp]);
            const dAvg = cnt > 0 ? sum / cnt : d0;
            out[i] = d0 + (dAvg - d0) * SMOOTH_MIX;
        }
    }
    return out;
}

/** Alte Pipeline: liefert { zArr, dArr, tArr (0..1 Floats|null), robustMax, flagged, smoothed } */
function referencePack({ depth, elev, velocity, baseZ, ncols, nrows, minZ, cellsize, detectSpikes, wantTurb }) {
    const N = ncols * nrows;
    let raw = depth;
    let sanitized = false;
    for (let i = 0; i < N; i++) {
        const d = raw[i];
        if (!Number.isFinite(d) || d < 0) {
            if (!sanitized) { raw = raw.slice(); sanitized = true; }
            raw[i] = 0;
        }
    }
    const spikes = analyzeDepthSpikes(raw, ncols, nrows, { flag: detectSpikes !== false });
    const sm = smoothDepthRef(spikes.display, ncols, nrows);

    const el = (elev instanceof Float32Array && elev.length === N) ? elev : null;
    const surf = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        if (!(sm[i] > WET)) { surf[i] = -Infinity; continue; }
        let zl;
        if (el && Number.isFinite(el[i]) && el[i] > NODATA_ELEV) {
            zl = el[i] - minZ;
            const rise = zl - baseZ[i];
            if (rise > spikes.robustMax) zl = baseZ[i] + spikes.robustMax;
            else if (rise < 0)           zl = baseZ[i] + sm[i];
        } else {
            zl = baseZ[i] + sm[i];
        }
        surf[i] = zl;
    }

    const zArr = new Float32Array(N);
    const dArr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const d = sm[i];
        dArr[i] = d;
        if (d > WET) {
            zArr[i] = surf[i];
        } else {
            const col = i % ncols;
            const row = (i - col) / ncols;
            let s = -Infinity;
            if (col > 0          && surf[i - 1]     > -Infinity) s = Math.max(s, surf[i - 1]);
            if (col < ncols - 1  && surf[i + 1]     > -Infinity) s = Math.max(s, surf[i + 1]);
            if (row > 0          && surf[i - ncols] > -Infinity) s = Math.max(s, surf[i - ncols]);
            if (row < nrows - 1  && surf[i + ncols] > -Infinity) s = Math.max(s, surf[i + ncols]);
            zArr[i] = (s > -Infinity) ? s : baseZ[i];
        }
    }

    let tArr = null;
    if (wantTurb) {
        tArr = new Float32Array(N);
        const vel = (velocity instanceof Float32Array && velocity.length === N) ? velocity : null;
        const TURB_DZ = 0.25, FR_FULL = 1.2, SLOPE_FULL = 0.05;
        const rawTurb = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            const d = sm[i];
            if (!(d > WET)) { rawTurb[i] = 0; continue; }
            let turb = 0;
            const wsp = surf[i];
            const col = i % ncols, row = (i - col) / ncols;
            let g = 0;
            if (col > 0         && surf[i - 1]     > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i - 1]));
            if (col < ncols - 1 && surf[i + 1]     > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i + 1]));
            if (row > 0         && surf[i - ncols] > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i - ncols]));
            if (row < nrows - 1 && surf[i + ncols] > -Infinity) g = Math.max(g, Math.abs(wsp - surf[i + ncols]));
            turb = Math.min(1, g / TURB_DZ);
            if (cellsize > 0) turb = Math.max(turb, Math.min(1, g / (cellsize * SLOPE_FULL)));
            if (vel) {
                const fr = vel[i] / Math.sqrt(9.81 * Math.max(d, 0.02));
                const vt = Math.min(1, fr / FR_FULL);
                turb = Math.max(turb, vt * vt);
            }
            rawTurb[i] = turb;
        }
        for (let r = 0; r < nrows; r++) {
            for (let c = 0; c < ncols; c++) {
                const i = r * ncols + c;
                if (!(sm[i] > WET)) { tArr[i] = 0; continue; }
                let s = rawTurb[i], mx = rawTurb[i], cnt = 1;
                for (let dr = -1; dr <= 1; dr++) {
                    const rr = r + dr; if (rr < 0 || rr >= nrows) continue;
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const cc = c + dc; if (cc < 0 || cc >= ncols) continue;
                        const j = rr * ncols + cc;
                        if (!(sm[j] > WET)) continue;
                        s += rawTurb[j]; if (rawTurb[j] > mx) mx = rawTurb[j]; cnt++;
                    }
                }
                tArr[i] = 0.5 * mx + 0.5 * (s / cnt);
            }
        }
    }
    return { zArr, dArr, tArr, robustMax: spikes.robustMax, flagged: spikes.flagged, smoothed: sm };
}

// ── Synthetisches Szenario ──────────────────────────────────────────────────────────────
// 24×20-Raster: geneigtes Gelände, Teich, Trockenzone am Ufer (Dry-Fill!), NaN/Inf/negative
// Solver-Ausreißer, isolierte 10-m-Nadel (Spike-Kappung), elev teils NODATA / unter Terrain.
function buildScenario(seed = 1) {
    const ncols = 24, nrows = 20, N = ncols * nrows;
    const minZ = 100, cellsize = 2;
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

    const baseZ = new Float32Array(N);
    for (let r = 0; r < nrows; r++) {
        for (let c = 0; c < ncols; c++) baseZ[r * ncols + c] = 0.5 * c + 0.2 * r + rnd() * 0.3;
    }
    const depth = new Float32Array(N);
    const velocity = new Float32Array(N);
    const elev = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const c = i % ncols, r = (i - c) / ncols;
        // Teich links, rechts trocken; ein zweiter nasser Streifen unten
        const wet = (c < 12 && r > 3 && r < 16) || r >= 18;
        depth[i] = wet ? 0.2 + rnd() * 0.8 : 0;
        velocity[i] = wet ? rnd() * 3 : 0;
        // elev meist konsistent (baseZ+Tiefe+Jitter), gelegentlich NODATA oder UNTER Terrain
        const jitter = (rnd() - 0.5) * 0.1;
        elev[i] = minZ + baseZ[i] + depth[i] + jitter;
        if (i % 37 === 0) elev[i] = -9999;                 // NODATA → Fallback baseZ+Tiefe
        if (i % 53 === 0) elev[i] = minZ + baseZ[i] - 0.5; // unter Terrain → Fallback
    }
    // Solver-Ausreißer
    depth[5] = NaN; depth[6] = -0.4; depth[7] = Infinity;
    // Isolierte 10-m-Nadel mitten im flachen Teich (analyzeDepthSpikes muss kappen+flaggen)
    depth[8 * ncols + 6] = 10;
    return { depth, elev, velocity, baseZ, ncols, nrows, minZ, cellsize };
}

function comparePack(name, opts) {
    console.log(`\n${name}`);
    const ref = referencePack(opts);
    const res = packWaterFrame(opts);
    const N = opts.ncols * opts.nrows;

    let dOk = true, zOk = true, sOk = true;
    for (let i = 0; i < N; i++) {
        if (!Object.is(res.pack[i * 2], ref.dArr[i])) { dOk = false; break; }
    }
    for (let i = 0; i < N; i++) {
        if (!Object.is(res.pack[i * 2 + 1], ref.zArr[i])) { zOk = false; break; }
    }
    for (let i = 0; i < N; i++) {
        if (!Object.is(res.smoothedDepth[i], ref.smoothed[i])) { sOk = false; break; }
    }
    assert(dOk, 'pack.R (Anzeige-Tiefe) bit-identisch zu aDepth (alt)');
    assert(zOk, 'pack.G (Anzeige-WSE inkl. Trocken-Fill) bit-identisch zu position.z (alt)');
    assert(sOk, 'smoothedDepth bit-identisch zur alten geglätteten Tiefe (fillOvertop-Input)');
    assert(res.robustMax === ref.robustMax, `robustMax identisch (${res.robustMax.toFixed(3)})`);
    assert(res.flagged.length === ref.flagged.length
        && res.flagged.every((f, k) => f.i === ref.flagged[k].i),
        `flagged identisch (${res.flagged.length} Dorn(e))`);

    if (ref.tArr) {
        let tMax = 0;
        for (let i = 0; i < N; i++) tMax = Math.max(tMax, Math.abs(res.turb[i] / 255 - ref.tArr[i]));
        assert(res.turb instanceof Uint8Array, 'turb als Uint8Array (R8-Textur)');
        assert(tMax <= 1 / 510 + 1e-9, `turb ≤ R8-Quantisierung von alt entfernt (max ${tMax.toFixed(5)})`);
    } else {
        assert(res.turb === null, 'turb = null wenn wantTurb=false');
    }
    return { ref, res };
}

// 1) Voller Fall: elev + velocity + Turbulenz + Spikes
const sc = buildScenario();
const { ref, res } = comparePack('Szenario A — elev + velocity + Turbulenz (Modus 0)',
    { ...sc, detectSpikes: true, wantTurb: true });

// Plausibilität: die Nadel wurde wirklich gekappt und geflaggt
assert(ref.flagged.some(f => f.i === 8 * sc.ncols + 6), 'die 10-m-Nadel ist geflaggt');
assert(res.pack[(8 * sc.ncols + 6) * 2] < 10, 'die 10-m-Nadel ist in der Anzeige-Tiefe gekappt');
// Dry-Fill: eine trockene Zelle direkt neben dem Teich liegt auf Nachbar-WSE, nicht auf baseZ
{
    const i = 8 * sc.ncols + 12; // erste trockene Spalte rechts vom Teich (c=12)
    const wetN = 8 * sc.ncols + 11;
    assert(sc.depth[i] === 0 && res.pack[i * 2] <= 0.005, 'Testzelle ist trocken');
    assert(res.pack[i * 2 + 1] === res.pack[wetN * 2 + 1] || res.pack[i * 2 + 1] > sc.baseZ[i],
        'Trockenzelle am Ufer auf nassen Nachbar-WSE angehoben (kein „Vorhang")');
}
// Eingabe-Frame darf nicht mutiert werden (NaN bleibt NaN im Original)
assert(Number.isNaN(sc.depth[5]), 'Eingabe-Tiefenframe unmutiert (sanitize arbeitet auf Kopie)');

// 2) Ohne elev (Fallback baseZ+Tiefe überall)
comparePack('Szenario B — ohne elev (Summenraster/Altdaten)',
    { ...sc, elev: null, detectSpikes: true, wantTurb: true });

// 3) Daten-Modus: keine Turbulenz, keine Spike-Marker
comparePack('Szenario C — wantTurb=false, detectSpikes=false',
    { ...sc, detectSpikes: false, wantTurb: false });

// 4) Scratch-Wiederverwendung: zweiter Frame mit demselben Scratch-Objekt bleibt korrekt
{
    console.log('\nSzenario D — Scratch-Wiederverwendung über zwei Frames');
    const scratch = {};
    const scB = buildScenario(7);
    const r1 = packWaterFrame({ ...sc, detectSpikes: true, wantTurb: true }, scratch);
    const r2 = packWaterFrame({ ...scB, detectSpikes: true, wantTurb: true }, scratch);
    const ref2 = referencePack({ ...scB, detectSpikes: true, wantTurb: true });
    let ok = true;
    for (let i = 0; i < scB.ncols * scB.nrows; i++) {
        if (!Object.is(r2.pack[i * 2 + 1], ref2.zArr[i])) { ok = false; break; }
    }
    assert(ok, 'Frame 2 mit wiederverwendetem Scratch bit-identisch');
    assert(r1.pack !== r2.pack && r1.smoothedDepth !== r2.smoothedDepth,
        'Rückgabe-Arrays sind frisch (LRU-/Transfer-tauglich, kein Scratch-Aliasing)');
}

// 5) smoothDepth-Export deckt sich mit der Referenz (wird von niemandem sonst importiert,
//    aber die Funktion ist öffentlich — Drift verhindern)
{
    console.log('\nSzenario E — smoothDepth-Export');
    const sm1 = smoothDepth(sc.depth.map ? Float32Array.from(sc.depth, d => (Number.isFinite(d) && d >= 0) ? d : 0) : sc.depth, sc.ncols, sc.nrows, null);
    const sm2 = smoothDepthRef(Float32Array.from(sc.depth, d => (Number.isFinite(d) && d >= 0) ? d : 0), sc.ncols, sc.nrows);
    let ok = true;
    for (let i = 0; i < sm1.length; i++) if (!Object.is(sm1[i], sm2[i])) { ok = false; break; }
    assert(ok, 'smoothDepth bit-identisch zur alten Implementierung');
}

// 6) Turbulenz mit ZWISCHENWERTEN (Szenario A sättigt auf 0/1 → Quantisierung unsichtbar):
//    flacher See ohne Gradient, moderate Froude-Zahlen → turb echt zwischen 0 und 1
{
    console.log('\nSzenario F — Turbulenz-Zwischenwerte (Froude-Regime, Quantisierungs-Check)');
    const ncols = 12, nrows = 12, N = ncols * nrows;
    const baseZ = new Float32Array(N);
    const depth = new Float32Array(N).fill(0.5);
    const velocity = new Float32Array(N);
    for (let i = 0; i < N; i++) velocity[i] = (i % 7) * 0.15; // Fr ≈ 0 … 0.42 → vt² klein
    const opts = { depth, elev: null, velocity, baseZ, ncols, nrows, minZ: 0, cellsize: 2, detectSpikes: true, wantTurb: true };
    const refF = referencePack(opts);
    const resF = packWaterFrame(opts);
    const vals = new Set(resF.turb);
    assert(vals.size > 3, `turb hat echte Zwischenwerte (${vals.size} verschiedene Bytes)`);
    let tMax = 0;
    for (let i = 0; i < N; i++) tMax = Math.max(tMax, Math.abs(resF.turb[i] / 255 - refF.tArr[i]));
    assert(tMax > 0 && tMax <= 1 / 510 + 1e-9, `Quantisierung sichtbar, aber ≤ 1/510 (max ${tMax.toFixed(5)})`);
}

console.log(failures === 0 ? '\n🎉 Alle Paritäts-Tests bestanden.' : `\n💥 ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
