/**
 * Linien-Operationen des Kernels (Teil XIV, G5).
 *
 *   drape     eine Grundriss-Linie auf ein Raster legen — die Höhen kommen
 *             bilinear aus dem Raster, ausserhalb bleibt NaN (kein Treffer
 *             ist kein Treffer)
 *   offset    ein metrischer Streifen um eine Polylinie — EIGENBAU, weil
 *             `@turf/buffer` in Grad rechnet und `polygon-clipping` keinen
 *             Versatz kennt. Gehrung an den Knicken (mit Deckel gegen die
 *             Nadel bei spitzen Winkeln), flache oder runde Enden.
 *   isolinie  die Höhenlinie z = wert eines Rasters — Marching Squares je
 *             Zelle, danach Verkettung der Segmente zu Polylinien. Die
 *             Nulllinie der Differenz zweier Raster ist die BÖSCHUNGS-
 *             OBERKANTE, die der Lageplan zeichnet.
 *
 * Rein: kein three, kein DOM; läuft im Worker.
 */
import { rasterAbtasten } from './Raster.js';

/** Gehrungslänge wird gedeckelt: bei spitzen Winkeln würde die Ecke zur Nadel. */
const GEHRUNG_DECKEL = 4;

// ── drape ────────────────────────────────────────────────────────────────────

export function drape({ linie, raster } = {}) {
    const punkte = linie.punkte.map(p => ({ ...p, y: rasterAbtasten(raster, p.x, p.z) }));
    const ohne = punkte.filter(p => !Number.isFinite(p.y)).length;
    return {
        ergebnis: { punkte },
        warnungen: ohne ? [`drape_ausserhalb: ${ohne} ${ohne === 1 ? 'Punkt liegt' : 'Punkte liegen'} ausserhalb des Rasters`] : [],
    };
}

// ── offset ───────────────────────────────────────────────────────────────────

function _norm2(x, z) { const l = Math.hypot(x, z); return l > 1e-12 ? { x: x / l, z: z / l } : null; }

/** Doppelte und zu nahe Punkte weg — sie machen Richtungen unbestimmt. */
function _bereinigt(punkte, eps = 1e-6) {
    const out = [];
    for (const p of punkte) {
        const l = out[out.length - 1];
        if (!l || Math.hypot(p.x - l.x, p.z - l.z) > eps) out.push({ x: p.x, z: p.z });
    }
    return out;
}

/**
 * DER Gehrungs-Kern — eine Formel für den Kernel-Offset UND das Werkzeug
 * „versetzen" (S9), kein zweiter Weg: jeder Punkt wandert entlang der
 * Winkelhalbierenden seiner beiden Kantennormalen um `d / cos`, gedeckelt
 * gegen die Nadel. Indextreu: Punkt i kommt als Punkt i heraus; eine
 * Nullkante nimmt die Richtung des Nachbarn, ein völlig entarteter Punkt
 * bleibt stehen. Linke Normale einer Richtung (x, z) ist (−z, x) — three,
 * Blick von oben; links > 0.
 * @param {Array<{x,z}>} punkte
 * @param {number} d
 * @param {boolean} geschlossen  Ring: auch der Schlussabschnitt zählt
 */
function _gehrung(punkte, d, geschlossen = false) {
    const n = punkte.length;
    const kanten = geschlossen ? n : n - 1;
    const richtungen = [];
    for (let i = 0; i < kanten; i++) {
        const a = punkte[i], b = punkte[(i + 1) % n];
        richtungen.push(_norm2(b.x - a.x, b.z - a.z));
    }
    const out = [];
    for (let i = 0; i < n; i++) {
        const rVor = (geschlossen ? richtungen[(i - 1 + n) % n] : richtungen[i - 1]) ?? richtungen[i] ?? null;
        const rNach = richtungen[i] ?? rVor;
        const v = rVor ?? rNach;
        if (!v) { out.push({ x: punkte[i].x, z: punkte[i].z }); continue; }
        const nVor = { x: -v.z, z: v.x };
        const nNach = { x: -rNach.z, z: rNach.x };
        const m = _norm2(nVor.x + nNach.x, nVor.z + nNach.z) ?? nVor;
        const cos = m.x * nVor.x + m.z * nVor.z;              // Winkel zwischen Gehrung und Normale
        const laenge = Math.min(GEHRUNG_DECKEL, 1 / Math.max(cos, 1e-6));
        out.push({ x: punkte[i].x + m.x * d * laenge, z: punkte[i].z + m.z * d * laenge });
    }
    return out;
}

/**
 * Eine Seite des Streifens: die Polylinie um `d` nach links (d > 0) bzw.
 * rechts (d < 0) versetzt, Gehrung an jedem Knick.
 * @param {Array<{x,z}>} punkte  bereinigt (keine Doppelpunkte)
 */
function _seite(punkte, d) {
    return _gehrung(punkte, d, false);
}

function _rundeKappe(mitte, richtung, d, segmente = 8) {
    // Halbkreis von der LINKEN Seite über die Spitze (in `richtung`) zur
    // rechten — parametrisiert als (sin w, cos w): links = (−rz, rx).
    const out = [];
    const a0 = Math.atan2(-richtung.z, richtung.x);
    for (let i = 1; i < segmente; i++) {
        const t = i / segmente;
        const w = a0 + Math.PI * t;
        out.push({ x: mitte.x + Math.sin(w) * d, z: mitte.z + Math.cos(w) * d });
    }
    return out;
}

/**
 * @param {{linie}} eingaben
 * @param {{abstand: number, ende?: 'flach'|'rund'}} parameter
 * @returns {{ergebnis: umriss|null, warnungen}}
 */
export function offset({ linie } = {}, { abstand, ende = 'flach' } = {}) {
    if (!(abstand > 0)) throw new Error('offset: `abstand` muss > 0 sein');
    const p = _bereinigt(linie.punkte);
    if (p.length < 2) return { ergebnis: null, warnungen: ['offset_zu_kurz: weniger als zwei verschiedene Punkte'] };
    const links = _seite(p, abstand);
    const rechts = _seite(p, -abstand);
    const ring = [...links];
    if (ende === 'rund') {
        const rEnde = _norm2(p[p.length - 1].x - p[p.length - 2].x, p[p.length - 1].z - p[p.length - 2].z);
        ring.push(..._rundeKappe(p[p.length - 1], rEnde, abstand));
    }
    ring.push(...rechts.reverse());
    if (ende === 'rund') {
        const rAnfang = _norm2(p[0].x - p[1].x, p[0].z - p[1].z);
        ring.push(..._rundeKappe(p[0], rAnfang, abstand));
    }
    return { ergebnis: { ring, loecher: [] }, warnungen: [] };
}

/** Fläche eines Grundriss-Rings (Schnürformel, Betrag). */
export function ringFlaeche(ring) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

// ── isolinie ─────────────────────────────────────────────────────────────────

function _interp(a, b, ha, hb, w) {
    const t = (w - ha) / (hb - ha);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Segmente zu Polylinien verketten (Muster `SectionContour.chainSegmentsToPolylines`,
 * hier KOPIERT — der Kernel importiert nichts aus der Serviceschicht).
 */
function _verkette(segmente, eps) {
    const key = (p) => `${Math.round(p.x / eps)}_${Math.round(p.z / eps)}`;
    const anEnde = new Map();   // key → [segIndex…]
    const benutzt = new Uint8Array(segmente.length);
    segmente.forEach((s, i) => {
        for (const p of [s[0], s[1]]) {
            const k = key(p);
            if (!anEnde.has(k)) anEnde.set(k, []);
            anEnde.get(k).push(i);
        }
    });
    const naechstes = (p, ausser) => (anEnde.get(key(p)) ?? []).find(i => !benutzt[i] && i !== ausser);
    const linien = [];
    for (let i = 0; i < segmente.length; i++) {
        if (benutzt[i]) continue;
        if (key(segmente[i][0]) === key(segmente[i][1])) { benutzt[i] = 1; continue; }   // Nullsegment
        benutzt[i] = 1;
        let kette = [segmente[i][0], segmente[i][1]];
        // nach vorn
        for (;;) {
            const j = naechstes(kette[kette.length - 1]);
            if (j === undefined) break;
            benutzt[j] = 1;
            const [a, b] = segmente[j];
            kette.push(key(a) === key(kette[kette.length - 1]) ? b : a);
        }
        // nach hinten
        for (;;) {
            const j = naechstes(kette[0]);
            if (j === undefined) break;
            benutzt[j] = 1;
            const [a, b] = segmente[j];
            kette.unshift(key(a) === key(kette[0]) ? b : a);
        }
        const geschlossen = kette.length > 2 && key(kette[0]) === key(kette[kette.length - 1]);
        if (geschlossen) kette = kette.slice(0, -1);
        linien.push({ punkte: kette, geschlossen });
    }
    return linien;
}

/**
 * @param {{raster}} eingaben
 * @param {{wert: number}} parameter
 * @returns {{ergebnis: Array<{punkte:[{x,z}], geschlossen}>, warnungen}}
 */
export function isolinie({ raster } = {}, { wert = 0 } = {}) {
    const { nx, nz, cell, x0, z0, heights } = raster;
    const K = (ix, iz) => ({ x: x0 + ix * cell, z: z0 + iz * cell });
    const segmente = [];
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            // Ein Knoten GENAU auf der Höhe träfe vier Zellen zugleich und
            // zerrisse die Kette — ein Hauch darüber, konsistent für alle.
            const h = [heights[ix * nz + iz], heights[(ix + 1) * nz + iz],
                       heights[(ix + 1) * nz + iz + 1], heights[ix * nz + iz + 1]]
                .map(v => (v === wert ? v + 1e-9 : v));
            if (!h.every(Number.isFinite)) continue;
            const e = [K(ix, iz), K(ix + 1, iz), K(ix + 1, iz + 1), K(ix, iz + 1)];
            const schnitte = [];
            for (let k = 0; k < 4; k++) {
                const a = h[k], b = h[(k + 1) % 4];
                if ((a < wert) !== (b < wert)) schnitte.push(_interp(e[k], e[(k + 1) % 4], a, b, wert));
            }
            if (schnitte.length === 2) segmente.push([schnitte[0], schnitte[1]]);
            else if (schnitte.length === 4) {
                // Sattel: Mittelwert entscheidet, welche Ecken zusammengehören
                const mitte = (h[0] + h[1] + h[2] + h[3]) / 4;
                if ((mitte < wert) === (h[0] < wert)) segmente.push([schnitte[0], schnitte[1]], [schnitte[2], schnitte[3]]);
                else segmente.push([schnitte[0], schnitte[3]], [schnitte[1], schnitte[2]]);
            }
        }
    }
    return { ergebnis: _verkette(segmente, cell * 1e-3), warnungen: [] };
}

/**
 * Öffentlich (S9): Polylinie oder Ring {x,z} um d versetzen — offen: links > 0
 * in Laufrichtung; Ring: das Vorzeichen folgt der Wicklung, der Aufrufer
 * entscheidet über „nach aussen" an der Fläche. Indextreu (kein Bereinigen —
 * die Höhe je Stützpunkt hängt am Index).
 */
export function versetztePunkte(punkte, d, { geschlossen = false } = {}) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !Number.isFinite(d) || d === 0) {
        return (punkte ?? []).map(p => ({ x: p.x, z: p.z }));
    }
    return _gehrung(punkte, d, geschlossen);
}
