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
 * Massen rechnen (`ERDBAU_ZELLE`), und darauf werden die Operationen gefaltet.
 * Sein Rand wird auf die grobe Anzeige gezwungen — kein Riss, auch wenn eine
 * Operation ohne Wirkbereich bis dorthin reicht.
 *
 * WOHER DAS UR IM FLICKEN KOMMT (Teil XXI, 2026-09-17). Bis dahin: die grobe
 * Fläche, fein zerlegt (`flickenRaster`). Der Erdkörper daneben rechnete aber
 * auf dem feinen Korridor, und der tastet die GELIEFERTE Fläche ab — zwei
 * Wege zu derselben Aussage, die sich um Zentimeter durchdrangen (gemessen:
 * 8,5 cm an einer Gerinnesohle; im Bild das Flimmern zwischen Erdkörper und
 * Gelände). Jetzt reicht der Stapel dasselbe feine Ur herein (`feinesUr`);
 * `flickenRaster` bleibt der Rückfall, wenn keine Quelle erreichbar ist.
 *
 * Nichts davon wird gespeichert (Gesetz 5): der Flicken ist gerechnet wie die
 * Anzeige selbst.
 */
import { flickenRaster, hoeheImRaster, rasterKnoten } from '../geometrie/SurfaceOps.js';
import { feinheitFuer, formeNach, wirkbereichVon, mitVorherigen } from './Operationen.js';

/** Weltbox → grobe Zellbox (Knotenindizes), nach aussen auf ganze Zellen. */
function _zellbox(grob, b) {
    const { x0, z0, cell, nx, nz } = grob;
    const ix0 = Math.max(0, Math.floor((b.minX - x0) / cell));
    const ix1 = Math.min(nx - 1, Math.ceil((b.maxX - x0) / cell));
    const iz0 = Math.max(0, Math.floor((b.minZ - z0) / cell));
    const iz1 = Math.min(nz - 1, Math.ceil((b.maxZ - z0) / cell));
    return (ix1 > ix0 && iz1 > iz0) ? { ix0, ix1, iz0, iz1 } : null;
}

/** Eine Zellbox um `n` grobe Zellen weiter — innerhalb des Rasters. */
function _geweitet(z, grob, n) {
    return { ix0: Math.max(0, z.ix0 - n), ix1: Math.min(grob.nx - 1, z.ix1 + n),
             iz0: Math.max(0, z.iz0 - n), iz1: Math.min(grob.nz - 1, z.iz1 + n) };
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
 * @param {object} opt    {zelle, budget} — die Zahlen der Massen (`ERDBAU_ZELLE`,
 *   `ERDBAU_ZELLBUDGET`) — und `feinesUr(bereich, cell) → Promise<raster|null>`:
 *   das Ur-Gelände aus DERSELBEN Quelle wie der Korridor der Erdkörper.
 *   `randAufGrob` (Vorgabe true): den Flickenrand auf die grobe Anzeige
 *   zwingen — nur, wenn die grobe Anzeige daneben liegt. `rand`: die Kästen
 *   um so viele grobe Zellen weiten (die Aussparung der Netzanzeige weitet
 *   um eine Zelle und darf dabei nicht aus dem Flicken fallen).
 * @returns {Promise<{flicken: Array<{box, raster, ur, urAusQuelle}>, zelle: number|null, warnungen: string[]}>}
 */
export async function anzeigeFlicken(ur, stand, ops = [], { zelle, budget, feinesUr = null, randAufGrob = true, rand = 0 } = {}) {
    const leer = (warnungen = []) => ({ flicken: [], zelle: null, warnungen });
    if (!ur || !stand || !ops?.length || !(zelle > 0) || !(budget > 0)) return leer();
    // DIESELBE FEINHEITSREGEL WIE DER KORRIDOR (Teil XXI): `feinheitFuer`
    // entscheidet aus Wirkfläche und schmalster Kennweite. Bis hierher zählte
    // der Flicken grobe Zellen unter den Wirkbereichen und der Korridor
    // rechnete eine Wurzel aus seiner Hüllfläche — zwei Formeln, und sobald
    // sie auseinanderliefen, lagen Erdkörper und Anzeige auf zwei Gittern
    // (gemessen 2026-09-17: 0,689 m Durchdringung an einer offenen Grube).
    const { k } = feinheitFuer(ur, ops, { zelle, budget });
    if (k < 2) return leer();                        // die Anzeige ist schon so fein
    const boxen = [];
    // Wie bei der Formung: je Operation nur, was VOR ihr liegt (Durchstich 2).
    for (const { op, ctx } of mitVorherigen(ops)) {
        const b = wirkbereichVon(ur, op?.art, op?.parameter ?? {}, { ctx });
        const z = b ? _zellbox(ur, b) : null;
        if (z) boxen.push(rand > 0 ? _geweitet(z, ur, rand) : z);
    }
    const kasten = _verschmolzen(boxen);
    if (!kasten.length) return leer();
    const flicken = [];
    const warnungen = [];
    for (const box of kasten) {
        // Das Ur aus der Quelle — dieselbe Fläche, die der Erdkörper abtastet.
        // Sie muss auf DEN Knoten liegen, die der Flicken erwartet; tut sie es
        // nicht (fremdes Gitter), gilt der Rückfall, und das steht als Warnung da.
        const ausQuelle = feinesUr ? await _ausQuelle(feinesUr, ur, box, k, warnungen) : null;
        const fein = ausQuelle ?? flickenRaster(ur, box, k);
        // Warnungen der Faltung meldet schon die grobe Anzeige (dieselben Operationen).
        const { raster } = formeNach(fein, ops, { ur: fein });
        // Der Rand gehört der groben Anzeige — aber nur, wenn die daneben
        // liegt. Zeigt die Anzeige die LIEFERUNG (Teil XXII, `Anzeigenetz`),
        // wäre der gezwungene Rand ein Absatz von bis zu 13 cm mitten im
        // unberührten Gelände (gemessen am Testgelände R02).
        if (randAufGrob) _randAuf(raster, stand);
        // `ur` und `urAusQuelle`: die Aussparung vergleicht geformt gegen Ur
        // auf DEMSELBEN Gitter, und die Naht zur Lieferung passt nur, wenn
        // dieses Ur aus der Lieferung abgetastet ist.
        flicken.push({ box, raster, ur: fein, urAusQuelle: !!ausQuelle });
    }
    return { flicken, zelle: ur.cell / k, warnungen };
}

/**
 * Das feine Ur aus der Quelle für GENAU diese Box — oder null, wenn die Quelle
 * nichts liefert oder ein anderes Gitter trägt (dann wäre der Flicken
 * verschoben, und das grobe Netz ist die ehrlichere Grundlage).
 */
async function _ausQuelle(feinesUr, grob, box, k, warnungen) {
    const X = (ix) => rasterKnoten(grob, ix, 0).x;
    const Z = (iz) => rasterKnoten(grob, 0, iz).z;
    const cell = grob.cell / k;
    let r = null;
    try {
        r = await feinesUr({ minX: X(box.ix0), maxX: X(box.ix1), minZ: Z(box.iz0), maxZ: Z(box.iz1) }, cell);
    } catch { r = null; }
    if (!r) return null;
    const passt = Math.abs(r.cell - cell) < 1e-9
        && Math.abs((r.x0 - grob.x0) / grob.cell - Math.round((r.x0 - grob.x0) / grob.cell)) < 1e-6
        && Math.abs((r.z0 - grob.z0) / grob.cell - Math.round((r.z0 - grob.z0) / grob.cell)) < 1e-6;
    if (!passt) { warnungen.push('anzeige_flicken_gitter: feines Gelände liegt neben dem Raster — Flicken aus dem groben Netz'); return null; }
    return _aufBox(r, grob, box, k);
}

/**
 * Die Box aus einem grösseren feinen Raster herausschneiden — Knoten für
 * Knoten, ohne zu interpolieren. Was ausserhalb liegt, bleibt NaN und fällt
 * beim Zeichnen als Loch auf, statt still falsch zu sein.
 */
function _aufBox(quelle, grob, box, k) {
    const X = (ix) => rasterKnoten(grob, ix, 0).x;
    const Z = (iz) => rasterKnoten(grob, 0, iz).z;
    const nx = (box.ix1 - box.ix0) * k + 1, nz = (box.iz1 - box.iz0) * k + 1;
    const cell = grob.cell / k;
    const f = { x0: X(box.ix0), z0: Z(box.iz0), maxX: X(box.ix1) + 1e-9, maxZ: Z(box.iz1) + 1e-9,
                cell, nx, nz, heights: new Float64Array(nx * nz).fill(NaN) };
    const iVon = Math.round((f.x0 - quelle.x0) / cell), jVon = Math.round((f.z0 - quelle.z0) / cell);
    for (let i = 0; i < nx; i++) {
        const qi = iVon + i;
        if (qi < 0 || qi >= quelle.nx) continue;
        for (let j = 0; j < nz; j++) {
            const qj = jVon + j;
            if (qj < 0 || qj >= quelle.nz) continue;
            f.heights[i * nz + j] = quelle.heights[qi * quelle.nz + qj];
        }
    }
    return f;
}
