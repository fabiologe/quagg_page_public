/**
 * useWeirResults — rekonstruiert den Durchfluss Q(t) über/durch jedes Wehr aus den
 * gerasterten Kantenfluss-Feldern (.Qx/.Qy → qFluxFrames) des Solvers.
 *
 * Idee: Der Solver liefert KEINEN expliziten Wehr-Durchfluss, sondern nur die
 * zell-zentrierten Flusskomponenten qx/qy (m³/s, ent-staggert in handler.py). Ein
 * Wehr ist eine Polylinie, die — über dieselbe Funktion wie der Input-Export
 * (`discretizeWeirPolyline`) — in dieselben Rasterzellen + Sperr-Flächen zerlegt
 * wird, die auch der Solver bekommen hat. Der Durchfluss durch das Wehr ist dann
 * die Summe der NORMAL-Komponente über alle Wehrzellen.
 *
 * Reine Datenschicht — kein three.js, kein Chart. Der pure Kern
 * (`computeWeirSeries`) ist node-testbar; die Composable hängt nur Reaktivität dran.
 */
import { computed, unref } from 'vue';
// Relativ-Import (statt @/-Alias), damit der pure Kern node-testbar bleibt
// (test_weir_results.mjs läuft ohne Vite-Alias-Auflösung).
import { discretizeWeirPolyline } from '../../utils/weirGeometry.js';
import { flipRow } from '../../utils/gridIndex.js';

/**
 * EINHEIT VERIFIZIERT: LISFLOOD-FP schreibt .Qx/.Qy als volumetrischen Fluss [m³/s]
 * über die jeweilige Zellkante (NICHT spezifisch [m²/s]). Die zell-zentrierte (gemittelte)
 * Komponente ist für eine dünne Wehrwand ≈ der Durchfluss durch die Wand → reine Summe über
 * die Wehrzellen = Gesamt-Q [m³/s], OHNE Multiplikation mit der Zellweite.
 *
 * Kalibriert an einem cs=2-Lauf (pod-c8416a7c6ab1, 2026-06-19): der Querschnitt-Durchfluss
 * Σ(de-staggertes qx/qy) ≈ 3212 m³/s lag exakt zwischen res.mass Qin=3053 und Qout=3619
 * (Verhältnis 1.04). Bei m²/s wäre er halb so groß gewesen (~1600, Verhältnis 2.0). cs=2 ist
 * entscheidend — bei cs=1 sind beide Einheiten numerisch ununterscheidbar. → Faktor = 1.0.
 */
export const Q_UNIT_FACTOR = 1.0;

const NODATA = -1000; // alles darunter (z.B. -9999) gilt als trocken/ungültig

function isFiniteElev(v) {
    return Number.isFinite(v) && v > NODATA;
}

/** Normalkomponente einer Wehrzelle: E/W-Wand → qx, N/S-Wand → qy, Eck → größere. */
function cellNormalFlux(dirs, qx, qy, idx) {
    const hasX = dirs.has('E') || dirs.has('W');
    const hasY = dirs.has('N') || dirs.has('S');
    const vx = qx ? qx[idx] : 0;
    const vy = qy ? qy[idx] : 0;
    if (hasX && hasY) return Math.abs(vx) >= Math.abs(vy) ? vx : vy; // Eckzelle: dominante Komponente
    if (hasX) return vx;
    return vy;
}

/**
 * Pure Kernfunktion: pro Wehr eine Zeitreihe { Q, HW, TW, overtop } je Frame.
 *
 * @param {object} p
 * @param {Array}  p.weirLines  geoStore.weirLines (Polylinien mit points[], hc, openings)
 * @param {object} p.header     Result-Header { ncols, nrows, cellsize, xllcorner, yllcorner }
 * @param {Map<number,{qx:Float32Array,qy:Float32Array}>} p.qFluxFrames
 * @param {Map<number,Float32Array>} [p.elevFrames]  Wasserspiegel je Frame (für HW/TW)
 * @param {number} [p.saveInterval]  Sekunden je Frame (nur für die Zeitachse)
 * @returns {Array<{id,label,hc,frames:number[],times:number[],Q:number[],HW:number[],TW:number[],overtop:number[],Qmax:number,overtopFrames:number}>}
 */
export function computeWeirSeries({ weirLines, header, qFluxFrames, elevFrames = null, saveInterval = 0 }) {
    if (!Array.isArray(weirLines) || weirLines.length === 0) return [];
    if (!header || !qFluxFrames || qFluxFrames.size === 0) return [];
    const { ncols, nrows } = header;
    const frameIds = [...qFluxFrames.keys()].sort((a, b) => a - b);

    return weirLines.map((line, li) => {
        // Dieselbe Diskretisierung wie der Input-Export → deckungsgleiche Zellen/Flächen.
        const rawCells = discretizeWeirPolyline(line.points || [], header, null, {
            openings: line.openings || [],
        });
        // Eckzellen erscheinen zweimal (E + S) → pro (col,row) zusammenfassen.
        const cellMap = new Map();
        for (const c of rawCells) {
            const key = c.col + ',' + c.row;
            let e = cellMap.get(key);
            if (!e) { e = { col: c.col, row: c.row, dirs: new Set() }; cellMap.set(key, e); }
            e.dirs.add(c.direction);
        }
        const cells = [...cellMap.values()];
        const hcFallback = Number.isFinite(line.hc) ? line.hc : null;

        const frames = [], times = [], Q = [], HW = [], TW = [], overtop = [];
        let Qmax = 0, overtopFrames = 0;

        for (const f of frameIds) {
            const comp = qFluxFrames.get(f);
            const qx = comp?.qx, qy = comp?.qy;
            const elev = elevFrames ? elevFrames.get(f) : null;

            let acc = 0;
            let hw = -Infinity, tw = Infinity;
            for (const cell of cells) {
                const rr = flipRow(cell.row, nrows); // Result-Raster ist top-down (row 0 = Nord)
                if (cell.col < 0 || cell.col >= ncols || rr < 0 || rr >= nrows) continue;
                const idx = rr * ncols + cell.col;
                acc += cellNormalFlux(cell.dirs, qx, qy, idx);

                if (elev) {
                    const hasX = cell.dirs.has('E') || cell.dirs.has('W');
                    // Nachbarn senkrecht zur Wand für Ober-/Unterwasser
                    const probes = hasX
                        ? [[cell.col - 1, rr], [cell.col + 1, rr]]
                        : [[cell.col, rr - 1], [cell.col, rr + 1]];
                    for (const [pc, pr] of probes) {
                        if (pc < 0 || pc >= ncols || pr < 0 || pr >= nrows) continue;
                        const z = elev[pr * ncols + pc];
                        if (!isFiniteElev(z)) continue;
                        if (z > hw) hw = z;
                        if (z < tw) tw = z;
                    }
                }
            }

            const q = Math.abs(acc) * Q_UNIT_FACTOR;
            const hwVal = hw === -Infinity ? null : hw;
            const twVal = tw === Infinity ? null : tw;
            const ot = (hwVal != null && hcFallback != null) ? Math.max(0, hwVal - hcFallback) : 0;

            frames.push(f);
            times.push(saveInterval > 0 ? f * saveInterval : f);
            Q.push(q);
            HW.push(hwVal);
            TW.push(twVal);
            overtop.push(ot);
            if (q > Qmax) Qmax = q;
            if (ot > 1e-4) overtopFrames++;
        }

        return {
            id: line.id ?? `weir_${li}`,
            label: line.label || `Wehr ${li + 1}`,
            hc: hcFallback,
            cellCount: cells.length,
            frames, times, Q, HW, TW, overtop,
            Qmax,
            overtopFrames,
        };
    });
}

/**
 * Composable-Wrapper: hält die Wehr-Zeitreihen reaktiv. Alle Argumente dürfen Refs
 * oder rohe Werte sein. Leeres Array, wenn keine Wehre oder keine qFluxFrames (z.B.
 * WASM-Pfad) — der Aufrufer blendet das Panel dann aus.
 */
export function useWeirResults({ weirLines, header, qFluxFrames, elevFrames, saveInterval }) {
    const weirSeries = computed(() => computeWeirSeries({
        weirLines: unref(weirLines) || [],
        header: unref(header),
        qFluxFrames: unref(qFluxFrames),
        elevFrames: unref(elevFrames) || null,
        saveInterval: unref(saveInterval) || 0,
    }));

    const hasWeirData = computed(() => weirSeries.value.length > 0);

    return { weirSeries, hasWeirData };
}
