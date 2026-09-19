/**
 * DER SCHNITT QUER ZUR ACHSE (Teil XX, Stufe D — 2026-09-19).
 *
 * Fabio (2026-09-10): „später ein Gerinne-Schnitt wie in SaintV-2D." Dort
 * zeigt ein Formular das Soll-Trapez. Hier gibt es mehr zu sehen, weil das
 * Gelände da ist: an einer Station quer zur Achse das Urgelände, das Gelände
 * jetzt (nach allen Vorgängen) und das Soll-Trapez — Sohle, Sohlbreite,
 * Böschung 1 : n bis ans Urgelände. Kein Wasserspiegel: die CDE rechnet
 * keine Hydraulik.
 *
 * Die ACHSE kommt vom Rezept (`querschnitt`): Punkte in Welt mit der Sohle
 * als Höhe, die Sohlbreite je Teilstrecke, die Neigung. Die STATION ist die
 * Weglänge im Grundriss — wie überall (Geste, Längsschnitt, Gefälle).
 * „Links" wie in `Operationen._anLinie`: (dz, −dx), negativer Abstand = links.
 *
 * Rein: die Höhen fragt es bei `urAn`/`istAn` (Welt-x/z → Welt-Y, oder
 * null), gerechnet wird in Welt.
 */

import { ortBei, stationiere } from '../geometrie/Stationierung.js';

/** Abtastschritt quer (m) — fein genug für ein 0,5-m-Raster, grob genug für eine Tafel. */
export const QUER_SCHRITT_M = 0.25;
/** Wie weit der Schnitt über die Böschungsoberkante hinaus reicht (m). */
export const QUER_RAND_M = 2;

const _fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Wo die Böschung von der Sohlkante aus das Urgelände trifft — `seite` +1
 * rechts (positiver Abstand), −1 links. Ohne Neigung: senkrecht an der
 * Sohlkante. Ohne Treffer bis `bis`: dort, wo der Schnitt endet.
 */
function _oben(seite, { sohle, b2, n, bis, gelaendeBei }) {
    if (!(n > 0)) {
        const y = gelaendeBei(seite * b2);
        return { d: seite * b2, y: y ?? sohle };
    }
    const schritt = QUER_SCHRITT_M / 4;
    let vorher = null;
    for (let d = b2; d <= bis + 1e-9; d += schritt) {
        const soll = sohle + (d - b2) / n;
        const g = gelaendeBei(seite * d);
        if (g === null) { vorher = null; continue; }
        const diff = soll - g;
        if (diff >= 0) {
            if (!vorher) return { d: seite * d, y: soll };
            const t = vorher.diff / (vorher.diff - diff);             // linear dazwischen
            const dd = vorher.d + (d - vorher.d) * t;
            return { d: seite * dd, y: sohle + (dd - b2) / n };
        }
        vorher = { d, diff };
    }
    return { d: seite * bis, y: sohle + (bis - b2) / n, offen: true };
}

/**
 * Der Schnitt an einer Station.
 *
 * @param {object} q    vom Rezept: {achse: [{x, y (Sohle, Welt), z}], sohlbreiten?: [m je Punkt], sohlbreite?: m, neigung: 1 : n}
 * @param {number} station  Weglänge im Grundriss (m); wird auf die Achse geklemmt
 * @param {object} o
 * @param {(x:number, z:number) => number|null} o.urAn    Urgelände (Welt-Y)
 * @param {(x:number, z:number) => number|null} [o.istAn] Gelände jetzt (Welt-Y)
 * @returns {object|null}
 */
export function querschnittBei(q, station, { urAn, istAn = null, rand = QUER_RAND_M, schritt = QUER_SCHRITT_M } = {}) {
    const achse = (q?.achse ?? []).filter(p => [p?.x, p?.y, p?.z].every(Number.isFinite));
    if (achse.length < 2 || typeof urAn !== 'function') return null;
    const st = stationiere(achse);
    const s = Math.min(Math.max(0, Number(station) || 0), st.laenge);
    const o = ortBei(st, s);
    const r = { x: o.richtung.z, z: -o.richtung.x };                 // links
    const sohle = o.y;
    const b = Math.max(0, _fin(Number(q.sohlbreiten?.[o.i])) ?? _fin(Number(q.sohlbreite)) ?? 0);
    const n = Math.max(0, Number(q.neigung) || 0);
    const b2 = b / 2;
    const bei = (an) => (d) => {
        if (typeof an !== 'function') return null;
        const v = an(o.x - r.x * d, o.z - r.z * d);                 // +d = rechts
        return _fin(v);
    };
    const urBei = bei(urAn), istBei = bei(istAn);
    const urMitte = urBei(0);
    const tiefe = urMitte === null ? null : urMitte - sohle;
    // So weit, dass die Böschung das Urgelände sicher trifft — am Hang auch
    // auf der höheren Seite.
    let hoch = urMitte ?? sohle + 2;
    for (const d of [-b2 - 10, -b2 - 5, b2 + 5, b2 + 10]) { const g = urBei(d); if (g !== null) hoch = Math.max(hoch, g); }
    const reichweite = b2 + Math.max(0, hoch - sohle) * n + rand * 3;
    const links = _oben(-1, { sohle, b2, n, bis: reichweite, gelaendeBei: urBei });
    const rechts = _oben(1, { sohle, b2, n, bis: reichweite, gelaendeBei: urBei });
    const halb = Math.max(Math.abs(links.d), Math.abs(rechts.d), b2) + rand;
    const linie = (an) => {
        const aus = [];
        for (let d = -halb; d <= halb + 1e-9; d += schritt) {
            const y = an(d);
            if (y !== null) aus.push({ d: Math.round(d * 1e6) / 1e6, y });
        }
        return aus;
    };
    return {
        station: s, laenge: st.laenge,
        punkt: { x: o.x, y: sohle, z: o.z }, richtung: r,
        sohle, sohlbreite: b, neigung: n, tiefe, halb,
        ur: linie(urBei),
        ist: typeof istAn === 'function' ? linie(istBei) : [],
        soll: [{ d: links.d, y: links.y }, { d: -b2, y: sohle }, { d: b2, y: sohle }, { d: rechts.d, y: rechts.y }],
        obenBreite: rechts.d - links.d,
        offen: !!(links.offen || rechts.offen),
    };
}

/** Die Querlinie im Raum (Welt) — für die Marke an der Station. */
export function querlinie(schnitt) {
    if (!schnitt) return null;
    const { punkt: p, richtung: r, halb } = schnitt;
    return [{ x: p.x + r.x * halb, y: p.y, z: p.z + r.z * halb }, { x: p.x - r.x * halb, y: p.y, z: p.z - r.z * halb }];
}
