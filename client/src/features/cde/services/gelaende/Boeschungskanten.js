/**
 * Die Kanten eines Erdbaus (Teil XX Stufe B / Teil XXI P3).
 *
 * FABIOS WUNSCH (2026-09-10): „Böschungskanten der Erdbauten leicht
 * hervorheben — Oberkante, Fuss, Sohl- und Kronenkante." Im Raum sind das die
 * Linien, an denen ein Laie sieht, wo gebaut wird; im IFC sind sie das, was
 * eine Vermessung absteckt.
 *
 * WORAUS SIE ENTSTEHEN — aus der DIFFERENZ, nicht aus dem Umriss, den jemand
 * gezeichnet hat. Der gezeichnete Ring liegt auf dem Gelände; wo die Böschung
 * ausläuft, entscheidet die Neigung gegen den Hang, und das steht erst im
 * Ergebnis. Deshalb:
 *
 *   Böschungsoberkante  Isolinie der Differenz bei −`schwelle` — die Grenze,
 *                       an der ABGETRAGEN wurde. (`rasterDifferenz({a, b})`
 *                       liefert b − a, hier nachher − vorher: Abtrag ist
 *                       negativ. Am Code nachgelesen, nicht angenommen.)
 *   Böschungsfuss       Isolinie der Differenz bei +`schwelle` — die Grenze,
 *                       an der AUFGETRAGEN wurde.
 *   Sohlkante           Isolinie des Ergebnisses knapp ÜBER einer ebenen
 *                       Sohle, nur im abgetragenen Bereich: der Knick, an dem
 *                       die Böschung beginnt.
 *   Kronenkante         dasselbe knapp UNTER einer ebenen Krone, nur im
 *                       aufgetragenen Bereich.
 *
 * DIE BÖSCHUNG AN EINER KANTE braucht keinen Sonderfall: ihre gezeichnete
 * Linie IST die Grenze, an der die Differenz null wird — sie fällt unter
 * dieselbe Regel wie jede andere Oberkante. Eine Regel, kein Zweig.
 *
 * WAS ES NICHT GIBT: die Sohlkante eines GENEIGTEN Gerinnes. Eine Höhenlinie
 * beschreibt eine geneigte Fläche nicht — ihre Sohlkante ist keine Isolinie.
 * Sie bleibt deshalb aus, und Oberkante und Fuss stehen trotzdem da.
 *
 * NICHTS DAVON WIRD GESPEICHERT (Gesetz 5): die Kanten sind gerechnet wie die
 * Massen, und beim nächsten Lauf wieder.
 */

import { GELAENDE_OPS } from './Operationen.js';

/**
 * Die vier Arten — Daten für Raum und Oberfläche.
 *
 * WIE SIE IM IFC HEISSEN, steht NICHT hier, sondern beim Schreiber
 * (`backend/app/ifc/eigenbau.py`, `KANTEN_ARTEN`): `IfcAnnotation` mit
 * PredefinedType SURVEY und dem deutschen `ObjectType`. Zwei Tabellen mit
 * demselben Wissen liefen beim ersten Umbenennen auseinander — die Arten-Ids
 * hier sind der Vertrag über die Grenze, die IFC-Namen gehören dem Schreiber.
 */
export const KANTEN_ARTEN = Object.freeze({
    oberkante:   Object.freeze({ id: 'oberkante',   titel: 'Böschungsoberkante' }),
    fuss:        Object.freeze({ id: 'fuss',        titel: 'Böschungsfuß' }),
    sohlkante:   Object.freeze({ id: 'sohlkante',   titel: 'Sohlkante' }),
    kronenkante: Object.freeze({ id: 'kronenkante', titel: 'Kronenkante' }),
});

/**
 * Wie weit über der Sohle die Sohlkante gesucht wird (m).
 *
 * Genau AUF der Sohle liegt eine ganze Fläche, keine Linie — die Isolinie
 * wäre unbestimmt. Zwei Zentimeter darüber schneidet sie die Böschung dort,
 * wo sie beginnt; bei 1 : 1,5 liegt die Linie damit 3 cm neben der wahren
 * Kante, also unter jeder Absteckgenauigkeit.
 */
export const KANTEN_EPSILON = 0.02;

/** Kürzere Schnipsel sind Rauschen des Rasters, keine Kante (Vielfaches der Zelle). */
export const KANTEN_MINDESTLAENGE = 2;

const _zahl = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Länge einer Polylinie im Grundriss. */
function _laenge(punkte, geschlossen = false) {
    let l = 0;
    for (let i = 0; i + 1 < punkte.length; i++) l += Math.hypot(punkte[i + 1].x - punkte[i].x, punkte[i + 1].z - punkte[i].z);
    if (geschlossen && punkte.length > 2) {
        const a = punkte[punkte.length - 1], b = punkte[0];
        l += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return l;
}

/** Ein Raster, das nur dort Werte trägt, wo `passt(differenz)` gilt — sonst NaN. */
function _maskiert(raster, differenz, passt) {
    const heights = Float64Array.from(raster.heights);
    for (let i = 0; i < heights.length; i++) {
        const d = differenz.heights[i];
        if (!Number.isFinite(d) || !passt(d)) heights[i] = NaN;
    }
    return { ...raster, heights };
}

/**
 * Die EBENEN Kennhöhen der Operationen eines Vorgangs.
 *
 * Nur wo eine Operation eine waagerechte Fläche herstellt, gibt es eine
 * Isolinie, die ihre Kante beschreibt. Ein Planum kann beides sein — es
 * schneidet und schüttet; welche der beiden Kanten entsteht, entscheidet die
 * Maske, nicht eine Annahme hier.
 */
export function kennhoehen(ops = []) {
    const aus = [];
    const merke = (art, hoehe) => {
        if (hoehe == null) return;
        if (aus.some(k => k.art === art && Math.abs(k.hoehe - hoehe) < 1e-9)) return;
        aus.push({ art, hoehe });
    };
    for (const op of ops ?? []) {
        // Welche ebene Kante eine Operation herstellt, weiss ihr Eintrag
        // (Teil XXIII, A2) — Gerinne und Böschungen stellen keine her.
        for (const k of GELAENDE_OPS[op?.art]?.kennhoehen?.(op?.parameter ?? {}) ?? []) merke(k.art, _zahl(k.hoehe));
    }
    return aus;
}

/**
 * Die Kanten eines Vorgangs — und das Planbild gleich mit.
 *
 * Beides kommt aus DERSELBEN Isolinie: das Planbild des Lageplans IST die
 * Oberkante und der Fuss. Sie zweimal zu rechnen hiesse, sie zweimal ein
 * bisschen anders zu bekommen.
 *
 * @param {object} kernel                 der Geometrie-Kernel (`op`)
 * @param {object} o
 * @param {object} o.vorher               Raster vor dem Vorgang
 * @param {object} o.nachher              Raster nach dem Vorgang (gleiches Gitter)
 * @param {Array}  [o.ops]                die Operationen (Welt) — für die ebenen Kennhöhen
 * @param {number} [o.schwelle]           ab welcher Höhenänderung eine Zelle als geformt gilt
 * @returns {Promise<{kanten: Array<{art, punkte: Array<{x,y,z}>, geschlossen, laenge}>, bild: Array, warnungen: string[]}>}
 */
export async function boeschungskanten(kernel, { vorher, nachher, ops = [], schwelle = 0.01 } = {}) {
    const warnungen = [];
    if (!kernel || !vorher?.heights || !nachher?.heights) return { kanten: [], bild: [], warnungen };
    const differenz = (await kernel.op('rasterDifferenz', { a: vorher, b: nachher })).ergebnis;
    if (!differenz) return { kanten: [], bild: [], warnungen: ['kanten_ohne_differenz'] };

    const zelle = Number(nachher.cell) || 1;
    const mindest = KANTEN_MINDESTLAENGE * zelle;
    const kanten = [];
    const bild = [];

    /** Eine Isolinienschar auf Höhen legen und als Kanten ablegen. */
    const sammle = async (raster, wert, art, auchInsBild) => {
        const iso = (await kernel.op('isolinie', { raster }, { wert })).ergebnis ?? [];
        for (const l of iso) {
            if (!(l.punkte?.length >= 2)) continue;
            const laenge = _laenge(l.punkte, l.geschlossen);
            if (laenge < mindest) continue;
            if (auchInsBild) bild.push({ punkte: l.punkte, geschlossen: l.geschlossen });
            const punkte = l.punkte.map(p => ({ x: p.x, z: p.z, y: _hoeheIn(nachher, p.x, p.z) }));
            if (punkte.some(p => !Number.isFinite(p.y))) continue;      // am Rand: lieber keine Kante als eine geratene
            kanten.push({ art, punkte, geschlossen: !!l.geschlossen, laenge });
        }
    };

    // OBERKANTE und FUSS: die Grenze des Eingriffs, getrennt nach Vorzeichen.
    // `rasterDifferenz({a, b})` liefert b − a, hier also NACHHER − VORHER:
    // negativ = abgetragen (Oberkante), positiv = aufgetragen (Fuss). Am Code
    // nachgelesen, nicht angenommen (`geometrie/ops/Raster.js`).
    await sammle(differenz, -schwelle, 'oberkante', true);
    await sammle(differenz, schwelle, 'fuss', true);

    // SOHL- und KRONENKANTE: nur dort, wo auch wirklich geformt wurde.
    for (const k of kennhoehen(ops)) {
        const maske = k.art === 'sohlkante'
            ? _maskiert(nachher, differenz, (d) => d < -schwelle)
            : _maskiert(nachher, differenz, (d) => d > schwelle);
        const wert = k.art === 'sohlkante' ? k.hoehe + KANTEN_EPSILON : k.hoehe - KANTEN_EPSILON;
        await sammle(maske, wert, k.art, false);
    }
    return { kanten, bild, warnungen };
}

/** Höhe im Raster (bilinear über die Zelle) — hier lokal, damit das Modul rein bleibt. */
function _hoeheIn(raster, x, z) {
    const { x0, z0, cell, nx, nz, heights } = raster;
    const fx = (x - x0) / cell, fz = (z - z0) / cell;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix + 1 >= nx || iz + 1 >= nz) {
        // Genau am Rand: der letzte Knoten zählt, statt den Punkt zu verwerfen.
        const cx = Math.min(nx - 1, Math.max(0, Math.round(fx)));
        const cz = Math.min(nz - 1, Math.max(0, Math.round(fz)));
        return heights[cx * nz + cz];
    }
    const tx = fx - ix, tz = fz - iz;
    const h00 = heights[ix * nz + iz], h10 = heights[(ix + 1) * nz + iz];
    const h01 = heights[ix * nz + iz + 1], h11 = heights[(ix + 1) * nz + iz + 1];
    if (![h00, h10, h01, h11].every(Number.isFinite)) return NaN;
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}

/** Was der Mengenreiter und das Paket lesen: je Art Anzahl und Länge. */
export function kantenUebersicht(kanten = []) {
    const aus = {};
    for (const k of kanten) {
        const e = aus[k.art] ?? (aus[k.art] = { anzahl: 0, laenge: 0 });
        e.anzahl++; e.laenge += k.laenge;
    }
    for (const e of Object.values(aus)) e.laenge = +e.laenge.toFixed(3);
    return aus;
}
