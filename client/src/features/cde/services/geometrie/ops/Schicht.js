/**
 * EINE SCHICHT AUF DEM GELÄNDE (Teil XXIX, G-T1 — Konzept § 11.3, Lücke L-A).
 *
 * Tondichtung, Schutzvlies, Steinschüttung, Oberboden, Schilf, Rasen, ein Weg: Dinge, die AUF einer
 * geformten Fläche liegen, mit einer Dicke. Eine Platte war eben (G0: Steinschüttung als Platte auf der
 * Böschung — vier Ecken, eine Ebene, im Teich gemessen falsch); die Schicht folgt dem Gelände.
 *
 * Gerechnet wird EXAKT auf der Fläche, die das Raster zeigt: der Umriss wird in Dreiecke zerlegt, jedes
 * Dreieck gegen die Dreiecke des Rasters geschnitten (dieselbe Diagonale wie die Anzeige,
 * `diagonale00_11`) — die Stücke sind konvex und liegen je in EINER Ebene des Geländes. Der Umriss bleibt
 * der gezeichnete Umriss, kein Treppenrand aus Zellen.
 *
 * Dicke LOTRECHT (Vorgabe: so misst man auf der Baustelle mit der Latte) oder SENKRECHT ZUR FLÄCHE
 * (eine Dichtungsbahn auf der Böschung): dann wächst der lotrechte Versatz je Ecke mit √(1 + Gefälle²),
 * flächengewichtet über die anliegenden Stücke — auf einer ebenen Böschung genau die Normaldicke.
 *
 * Ein Körper: Boden auf dem Gelände (+ Abstand), Deckel darüber, Wände an den Randkanten. Ecken werden
 * nur zusammengelegt, wo sie numerisch derselbe Punkt sind (`QUANT`); dünne Stücke an Rasterlinien bleiben.
 *
 * Rein: kein three, keine Engine.
 */
import { diagonale00_11, rasterKnoten } from '../SurfaceOps.js';
import { meshVolume } from '../MeshOps.js';

/** Dünner geht nicht: unter 2 mm fielen Boden und Deckel im Paket (auf 1 mm verschweisst) zusammen. */
export const SCHICHT_MIN_DICKE = 0.002;
/**
 * Ecken näher als das gelten als EINE — nur Rechenrauschen (derselbe Punkt, aus zwei Stücken gerechnet,
 * liegt 1e-13 m daneben). Gemessen 2026-10-04 an 4 000 Umrissen mit Ecken auf halben Millimetern: auf 1 mm
 * gerundet (wie `meshVolume` es von sich aus tut) war jeder zweite Körper offen, zusammengelegt auf 1 mm
 * noch 6 — echte Stücke unter 1 mm Breite (eine Umrissecke 0,5 mm neben einer Rasterlinie) zerfallen dabei.
 * Mit 1 µm: 0. Das Attest rechnet mit DERSELBEN Toleranz.
 */
export const QUANT = 1e-6;

/**
 * Ein Sammler für Ecken im Grundriss: legt zusammen, was in x UND z höchstens `QUANT` auseinander liegt.
 * Zahlenschlüssel in zwei Stufen (x-Zelle → z-Zelle → Indizes) — Textschlüssel kosteten die Hälfte der Rechenzeit.
 * @returns {{ecke(p, y): number, ex: number[], ez: number[], ey: number[]}}
 */
export function eckenSammler() {
    const zellen = new Map();
    const ex = [], ez = [], ey = [];
    function ecke(p, y) {
        const kx = Math.floor(p.x / QUANT), kz = Math.floor(p.z / QUANT);
        for (let a = kx - 1; a <= kx + 1; a++) {
            const spalte = zellen.get(a);
            if (!spalte) continue;
            for (let b = kz - 1; b <= kz + 1; b++) {
                const liste = spalte.get(b);
                if (!liste) continue;
                for (const i of liste) if (Math.abs(ex[i] - p.x) <= QUANT && Math.abs(ez[i] - p.z) <= QUANT) return i;
            }
        }
        const i = ex.length;
        ex.push(p.x); ez.push(p.z); ey.push(typeof y === 'function' ? y(p) : y);
        let spalte = zellen.get(kx);
        if (!spalte) { spalte = new Map(); zellen.set(kx, spalte); }
        const liste = spalte.get(kz);
        if (liste) liste.push(i); else spalte.set(kz, [i]);
        return i;
    }
    return { ecke, ex, ez, ey };
}

/** Die Randkanten einer Dreiecksliste: gerichtete Kanten ohne Gegenkante (Zahlenschlüssel). */
export function randkanten(tris, n) {
    const gerichtet = new Set();
    for (const [a, b, c] of tris) { gerichtet.add(a * n + b); gerichtet.add(b * n + c); gerichtet.add(c * n + a); }
    const rand = [];
    for (const [a, b, c] of tris) for (const [u, w] of [[a, b], [b, c], [c, a]]) if (!gerichtet.has(w * n + u)) rand.push([u, w]);
    return rand;
}

/**
 * Ein konvexes Stück in Dreiecke — vom ersten Eckpunkt aus aufgefächert, ausser ein Fächerdreieck hätte keine Fläche:
 * dann vom Schwerpunkt aus. Ein Stück, dessen Ecke wenige µm neben einer Rasterecke auf der Diagonale liegt, gab vom
 * ersten Eckpunkt aus ein Dreieck ohne Fläche, das die lange Diagonale ein drittes Mal benutzte — der Körper war offen
 * (gemessen 2026-10-04: Raum in der Mulde, Spiegel auf Float32-Knotenhöhe, 33 von 1 800). Der Schwerpunkt liegt im
 * Inneren und bringt keinen neuen Randpunkt — die Nachbarn merken nichts.
 * @returns {Array<[p, q, r]>} Dreiecke aus Punkten {x, z}
 */
export function zerlegeKonvex(poly) {
    if (poly.length < 3) return [];
    const f = (a, b, c) => _kreuz(a, b, c);
    const faecher = [];
    let entartet = false;
    for (let j = 1; j + 1 < poly.length; j++) {
        if (!(f(poly[0], poly[j], poly[j + 1]) > 1e-12)) entartet = true;
        faecher.push([poly[0], poly[j], poly[j + 1]]);
    }
    if (!entartet) return faecher;
    const s = { x: poly.reduce((a, p) => a + p.x, 0) / poly.length, z: poly.reduce((a, p) => a + p.z, 0) / poly.length };
    // Ein Dreieck ohne Fläche fällt weg — ein Stück, dessen Punkte alle auf einer Linie liegen, ist keine Fläche.
    return poly.map((a, j) => [s, a, poly[(j + 1) % poly.length]]).filter(([p, a, b]) => f(p, a, b) > 1e-12);
}

/** Fläche eines Rings im Grundriss (x/z), mit Vorzeichen. */
function _flaeche2(ring) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

const _kreuz = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

/**
 * Ohrenschnitt eines einfachen Rings (x/z) → Dreiecke als Indextripel, alle mit positiver Fläche.
 * Gleiche Punkte hintereinander und Punkte auf einer Geraden fallen vorher heraus.
 */
export function ohrenschnitt(ring) {
    let p = [];
    for (const q of ring) {
        const l = p[p.length - 1];
        if (!l || Math.hypot(q.x - l.x, q.z - l.z) > 1e-9) p.push({ x: q.x, z: q.z });
    }
    if (p.length > 1 && Math.hypot(p[0].x - p[p.length - 1].x, p[0].z - p[p.length - 1].z) <= 1e-9) p.pop();
    if (p.length < 3) return { punkte: p, dreiecke: [] };
    if (_flaeche2(p) < 0) p = p.reverse();
    const idx = p.map((_, i) => i);
    const dreiecke = [];
    let schutz = idx.length * idx.length;
    while (idx.length > 3 && schutz-- > 0) {
        let geschnitten = false;
        for (let k = 0; k < idx.length; k++) {
            const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
            const a = p[ia], b = p[ib], c = p[ic];
            const w = _kreuz(a, b, c);
            if (w <= 1e-12) {
                // Auf einer Geraden: der mittlere Punkt trägt nichts — weg damit.
                if (Math.abs(w) <= 1e-12) { idx.splice(k, 1); geschnitten = true; break; }
                continue;
            }
            let frei = true;
            for (const j of idx) {
                if (j === ia || j === ib || j === ic) continue;
                const q = p[j];
                if (_kreuz(a, b, q) >= -1e-12 && _kreuz(b, c, q) >= -1e-12 && _kreuz(c, a, q) >= -1e-12) { frei = false; break; }
            }
            if (!frei) continue;
            dreiecke.push([ia, ib, ic]);
            idx.splice(k, 1);
            geschnitten = true;
            break;
        }
        if (!geschnitten) break;   // kein einfacher Ring (Selbstschnitt) — was da ist, bleibt
    }
    if (idx.length === 3 && _kreuz(p[idx[0]], p[idx[1]], p[idx[2]]) > 1e-12) dreiecke.push([idx[0], idx[1], idx[2]]);
    return { punkte: p, dreiecke };
}

/** Konvexes Polygon gegen konvexes Dreieck (gegen den Uhrzeiger in x/z) — Sutherland–Hodgman. */
export function schneideKonvex(poly, tri) {
    let aus = poly;
    for (let e = 0; e < 3 && aus.length; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const innen = (q) => _kreuz(a, b, q) >= -1e-12;
        const ein = aus;
        aus = [];
        for (let i = 0; i < ein.length; i++) {
            const p = ein[i], q = ein[(i + 1) % ein.length];
            const pi = innen(p), qi = innen(q);
            if (pi) aus.push(p);
            if (pi !== qi) {
                const dp = _kreuz(a, b, p), dq = _kreuz(a, b, q);
                const t = dp / (dp - dq);
                aus.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
            }
        }
    }
    return aus;
}

/** Die zwei Dreiecke einer Zelle mit ihren Ebenen — oder [] im Loch (eine Ecke nicht endlich). */
export function zellEbenen(raster, ix, iz) {
    const { nz, heights } = raster;
    const k = (i, j) => { const n = rasterKnoten(raster, i, j); return { x: n.x, z: n.z, y: heights[i * nz + j] }; };
    const p00 = k(ix, iz), p10 = k(ix + 1, iz), p01 = k(ix, iz + 1), p11 = k(ix + 1, iz + 1);
    if (![p00, p10, p01, p11].every(p => Number.isFinite(p.y))) return [];
    const tris = diagonale00_11(raster, ix, iz) ? [[p00, p10, p11], [p00, p11, p01]] : [[p00, p10, p01], [p10, p11, p01]];
    return tris.map(t => {
        const [a, b, c] = _kreuz(t[0], t[1], t[2]) > 0 ? t : [t[0], t[2], t[1]];
        // Ebene y = a.y + gx·(x − a.x) + gz·(z − a.z)
        const d = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
        const gx = ((b.y - a.y) * (c.z - a.z) - (c.y - a.y) * (b.z - a.z)) / d;
        const gz = ((c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x)) / d;
        return { tri: [a, b, c], y: (x, z) => a.y + gx * (x - a.x) + gz * (z - a.z), neigung: Math.sqrt(1 + gx * gx + gz * gz) };
    });
}

/**
 * @param {{raster}} eingaben  das Gelände, auf dem die Schicht liegt (Welt)
 * @param {{umriss: Array<{x, z}>, dicke: number, abstand?: number, richtung?: 'lot'|'normal'}} parameter
 *   `abstand`: Unterkante über dem Gelände (m, negativ = darunter), in derselben Richtung wie die Dicke.
 * @returns {{ergebnis: (koerper & {grundflaeche, flaeche, umfang, ausserhalb})|null, warnungen: string[]}}
 *   `grundflaeche` im Grundriss, `flaeche` auf dem Gelände (geneigt), `ausserhalb` Anteil des Umrisses ohne Gelände.
 */
export function schicht({ raster } = {}, { umriss, dicke, abstand = 0, richtung = 'lot' } = {}) {
    const warnungen = [];
    if (!(Number(dicke) >= SCHICHT_MIN_DICKE)) throw new Error(`schicht: Dicke ${dicke} unter ${SCHICHT_MIN_DICKE} m`);
    const { punkte, dreiecke } = ohrenschnitt(Array.isArray(umriss) ? umriss : []);
    if (!dreiecke.length) return { ergebnis: null, warnungen: ['schicht_leer: der Umriss hat keine Fläche'] };
    const { x0, z0, cell, nx, nz } = raster ?? {};
    if (!(nx >= 2 && nz >= 2 && cell > 0)) return { ergebnis: null, warnungen: ['schicht_leer: kein Gelände'] };

    // ── Stücke: Umriss-Dreieck ∩ Gelände-Dreieck, je eine Ebene ───────────────
    // ECKEN ZUSAMMENLEGEN (siehe QUANT): was übrig bleibt, liegt weiter auseinander als die Rundung des Attests.
    const { ecke: eckeRoh, ex, ez, ey } = eckenSammler();
    const fw = [], fs = [];   // je Ecke: Gewicht, Σ Gewicht·Neigung
    const ecke = (p, ebene) => { const i = eckeRoh(p, (q) => ebene.y(q.x, q.z)); while (fw.length <= i) { fw.push(0); fs.push(0); } return i; };
    const oben = [];   // Dreiecke (Indextripel, gegen den Uhrzeiger in x/z)
    let grund = 0, ober = 0, umrissFl = 0;
    for (const [ia, ib, ic] of dreiecke) {
        const t = [punkte[ia], punkte[ib], punkte[ic]];
        umrissFl += _kreuz(t[0], t[1], t[2]) / 2;
        const minX = Math.min(t[0].x, t[1].x, t[2].x), maxX = Math.max(t[0].x, t[1].x, t[2].x);
        const minZ = Math.min(t[0].z, t[1].z, t[2].z), maxZ = Math.max(t[0].z, t[1].z, t[2].z);
        const ix0 = Math.max(0, Math.floor((minX - x0) / cell)), ix1 = Math.min(nx - 2, Math.floor((maxX - x0) / cell));
        const iz0 = Math.max(0, Math.floor((minZ - z0) / cell)), iz1 = Math.min(nz - 2, Math.floor((maxZ - z0) / cell));
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                for (const ebene of zellEbenen(raster, ix, iz)) {
                    const stueck = schneideKonvex(t, ebene.tri);
                    if (stueck.length < 3) continue;
                    for (const [pa, pb, pc] of zerlegeKonvex(stueck)) {
                        const a = ecke(pa, ebene), b = ecke(pb, ebene), c = ecke(pc, ebene);
                        if (a === b || b === c || a === c) continue;
                        oben.push([a, b, c]);
                        const f = ((ex[b] - ex[a]) * (ez[c] - ez[a]) - (ez[b] - ez[a]) * (ex[c] - ex[a])) / 2;
                        if (!(f > 0)) continue;
                        grund += f; ober += f * ebene.neigung;
                        for (const v of [a, b, c]) { fw[v] += f; fs[v] += f * ebene.neigung; }
                    }
                }
            }
        }
    }
    if (!oben.length) return { ergebnis: null, warnungen: ['schicht_leer: der Umriss liegt nicht auf dem Gelände'] };
    const ausserhalb = umrissFl > 0 ? Math.max(0, 1 - grund / umrissFl) : 0;
    if (ausserhalb > 0.001) warnungen.push(`schicht_teilweise: ${(ausserhalb * 100).toFixed(1)} % des Umrisses liegen nicht auf dem Gelände`);

    // ── Höhen: Unterkante und Oberkante je Ecke ───────────────────────────────
    const n = ex.length;
    const unten = new Float64Array(n), obenY = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const f = richtung === 'normal' && fw[i] > 0 ? fs[i] / fw[i] : 1;
        unten[i] = ey[i] + Number(abstand || 0) * f;
        obenY[i] = unten[i] + Number(dicke) * f;
    }

    // ── Randkanten: gerichtete Kante ohne Gegenkante ──────────────────────────
    const rand = randkanten(oben, n);

    // ── Körper (nicht indiziert). three: Gegen den Uhrzeiger in x/z zeigt die Normale nach −Y; der
    //    Deckel wird deshalb gespiegelt, der Boden nicht. Wände je Randkante nach aussen. ────────────
    const tris = [];
    const P = (i, y) => [ex[i], y, ez[i]];
    for (const [a, b, c] of oben) {
        tris.push([P(a, obenY[a]), P(c, obenY[c]), P(b, obenY[b])]);
        tris.push([P(a, unten[a]), P(b, unten[b]), P(c, unten[c])]);
    }
    for (const [u, w] of rand) {
        tris.push([P(u, obenY[u]), P(w, obenY[w]), P(w, unten[w])]);
        tris.push([P(u, obenY[u]), P(w, unten[w]), P(u, unten[u])]);
    }
    const positions = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => positions.set([...t[0], ...t[1], ...t[2]], i * 9));
    const attest = meshVolume(positions, tris.length, { snapEps: QUANT });
    if (!attest.closed) warnungen.push(...attest.warnings);
    // Die Normale nach aussen prüfen: ein Volumen mit falschem Vorzeichen hiesse gespiegelte Wicklung.
    let vol6 = 0;
    for (let i = 0; i < tris.length; i++) {
        const o = i * 9;
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(o, o + 9);
        vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
    if (vol6 < 0) warnungen.push('schicht_wicklung: der Körper zeigt nach innen');

    let umfang = 0;
    for (const [u, w] of rand) umfang += Math.hypot(ex[w] - ex[u], ez[w] - ez[u]);
    return {
        // Die Masse der Fläche reisen IM Ergebnis — der Kernel reicht nur `ergebnis` und `warnungen` weiter.
        ergebnis: { positions, triCount: tris.length, closed: attest.closed, volumen: attest.volume, warnungen: attest.warnings,
                    grundflaeche: grund, flaeche: ober, umfang, ausserhalb, stuecke: oben.length },
        warnungen,
    };
}
