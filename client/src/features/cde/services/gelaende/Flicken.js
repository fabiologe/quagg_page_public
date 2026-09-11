/**
 * Feine Flicken für die ANZEIGE des geformten Geländes (Teil XX, 2026-09-11).
 *
 * Im Browser gemessen: die Anzeige ist ein 2-m-Raster. Eine Böschungskante,
 * die zwischen zwei Knotenreihen liegt, verschmierte über eine ganze Zelle —
 * an der gezeichneten Linie bis 1,3 m zu tief, der Fuss 15 cm zu hoch. Die
 * Operation rechnete richtig (an den Knoten auf 5 cm); der Anzeige fehlten
 * die Knoten.
 *
 * Kur: wo Operationen wirken, ein Flicken in der Auflösung, auf der auch die
 * Massen rechnen (`ERDBAU_ZELLE`). Das Ur-Gelände darin ist die grobe Fläche,
 * fein zerlegt (`flickenRaster` — dieselbe Triangulierung), und darauf werden
 * die Operationen gefaltet. Wo keine wirkt, IST der Flicken das grobe Netz;
 * sein Rand wird zusätzlich auf die grobe Anzeige gezwungen — kein Riss, auch
 * wenn eine Operation ohne Wirkbereich bis dorthin reicht.
 *
 * Nichts davon wird gespeichert (Gesetz 5): der Flicken ist gerechnet wie die
 * Anzeige selbst.
 */
import { flickenRaster, hoeheImRaster, rasterKnoten } from '../geometry/SurfaceOps.js';
import { formeNach, wirkbereichVon } from './Operationen.js';

/** Weltbox → grobe Zellbox (Knotenindizes), nach aussen auf ganze Zellen. */
function _zellbox(grob, b) {
    const { x0, z0, cell, nx, nz } = grob;
    const ix0 = Math.max(0, Math.floor((b.minX - x0) / cell));
    const ix1 = Math.min(nx - 1, Math.ceil((b.maxX - x0) / cell));
    const iz0 = Math.max(0, Math.floor((b.minZ - z0) / cell));
    const iz1 = Math.min(nz - 1, Math.ceil((b.maxZ - z0) / cell));
    return (ix1 > ix0 && iz1 > iz0) ? { ix0, ix1, iz0, iz1 } : null;
}

const _beruehren = (a, b) => a.ix0 <= b.ix1 && b.ix0 <= a.ix1 && a.iz0 <= b.iz1 && b.iz0 <= a.iz1;

/** Boxen, die sich berühren oder überlappen, verschmelzen — ein Flicken je Gebiet. */
function _verschmolzen(boxen) {
    const aus = [...boxen];
    for (let i = 0; i < aus.length; i++) {
        for (let j = i + 1; j < aus.length; j++) {
            if (!_beruehren(aus[i], aus[j])) continue;
            const a = aus[i], b = aus[j];
            aus[i] = { ix0: Math.min(a.ix0, b.ix0), ix1: Math.max(a.ix1, b.ix1),
                       iz0: Math.min(a.iz0, b.iz0), iz1: Math.max(a.iz1, b.iz1) };
            aus.splice(j, 1);
            j = i;                                   // die gewachsene Box noch einmal gegen alle
        }
    }
    return aus;
}

/** Der Rand eines Flickens gehört der groben Anzeige. */
function _randAuf(fein, grob) {
    const { nx, nz, heights } = fein;
    const setze = (i, j) => {
        const p = rasterKnoten(fein, i, j);
        const y = hoeheImRaster(grob, p.x, p.z);
        heights[i * nz + j] = y == null ? NaN : y;
    };
    for (let i = 0; i < nx; i++) { setze(i, 0); setze(i, nz - 1); }
    for (let j = 0; j < nz; j++) { setze(0, j); setze(nx - 1, j); }
}

/**
 * @param {object} ur     das grobe Ur-Raster (Welt)
 * @param {object} stand  die grobe Anzeige = formeNach(ur, ops)
 * @param {Array}  ops    alle Operationen des Stapels (Welt)
 * @param {object} opt    {zelle, budget} — die Zahlen der Massen (`ERDBAU_ZELLE`, `ERDBAU_ZELLBUDGET`)
 * @returns {{flicken: Array<{box, raster}>, zelle: number|null, warnungen: string[]}}
 */
export function anzeigeFlicken(ur, stand, ops = [], { zelle, budget } = {}) {
    const leer = (warnungen = []) => ({ flicken: [], zelle: null, warnungen });
    if (!ur || !stand || !ops?.length || !(zelle > 0) || !(budget > 0)) return leer();
    let k = Math.ceil(ur.cell / zelle - 1e-9);
    if (k < 2) return leer();                        // die Anzeige ist schon so fein
    const boxen = [];
    for (const op of ops) {
        const b = wirkbereichVon(ur, op?.art, op?.parameter ?? {});
        const z = b ? _zellbox(ur, b) : null;
        if (z) boxen.push(z);
    }
    const kasten = _verschmolzen(boxen);
    if (!kasten.length) return leer();
    const zellen = kasten.reduce((s, b) => s + (b.ix1 - b.ix0) * (b.iz1 - b.iz0), 0);
    k = Math.min(k, Math.floor(Math.sqrt(budget / zellen)));
    if (k < 2) return leer([`anzeige_flicken_budget: ${zellen} Zellen unter Operationen — die Anzeige bleibt grob`]);
    const flicken = [];
    for (const box of kasten) {
        const fein = flickenRaster(ur, box, k);
        // Warnungen der Faltung meldet schon die grobe Anzeige (dieselben Operationen).
        const { raster } = formeNach(fein, ops, { ur: fein });
        _randAuf(raster, stand);
        flicken.push({ box, raster });
    }
    return { flicken, zelle: ur.cell / k, warnungen: [] };
}
