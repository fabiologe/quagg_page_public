/**
 * DAS GELÄNDE BLEIBT, WO NICHT EDITIERT WIRD (Teil XXII, 2026-09-18).
 *
 * Fabio nach dem Test von Teil XXI: „ich habe das Gefühl, dass sich das
 * Bearbeitungsgelände an Stellen, wo keine Editierung stattfindet, verschiebt
 * und abgeändert wird." Es tat es. Mit dem ersten Vorgang wurde das
 * gelieferte Gelände verborgen und durch die Anzeige ersetzt — und die war
 * ÜBERALL ein Raster: ein grobes (2 m) plus feine Flicken in achsparallelen
 * Kästen um jeden Vorgang. Das Raster trifft die Knoten der Lieferung exakt
 * und schneidet ihre Knicke ab. Gemessen am Testgelände R02 (8-m-TIN) mit
 * Fabios vier Operationen: fern jeder Bearbeitung bis 48 cm neben der
 * Lieferung, im Flicken, aber unberührt, bis 13 cm (der Flickenrand hing am
 * groben Raster), und 212 000 statt 6 658 Dreiecke.
 *
 * JETZT: die Anzeige IST die Lieferung — Dreieck für Dreieck —, ausser in den
 * Zellen, die ein Vorgang wirklich verändert. Dort liegt das geformte Raster,
 * dasselbe, auf dem die Erdkörper rechnen (Teil XXI, P1b: koplanar).
 *
 *   Aussparung  Rasterzellen, an deren Knoten sich die geformte Fläche vom
 *               Ur um mehr als `ANZEIGE_EPS` unterscheidet — um eine Zelle
 *               geweitet. Die Weitung ist kein Polster: sie sorgt dafür, dass
 *               jede Randzelle UNVERÄNDERT ist (alle vier Knoten = Ur = die
 *               Lieferung an diesem Punkt). Nur deshalb darf die Randzelle
 *               anders trianguliert werden als die Erdkörper (siehe unten) —
 *               die haben dort keine Dicke.
 *   Netz        jedes Oberflächendreieck der Lieferung, das die Aussparung
 *               nicht berührt, unverändert; die übrigen EXAKT zugeschnitten
 *               (Streifen je Rasterzeile, Stücke zwischen den ausgesparten
 *               Zellen, Höhe aus der Ebene des Dreiecks).
 *   Naht        eine Randzelle zeigt an ihren Aussenkanten die Punkte, an
 *               denen Dreieckskanten der Lieferung die Kante kreuzen, und wird
 *               von ihrer Mitte aus aufgefächert — sonst stünde das Raster
 *               (gerade zwischen zwei Knoten) neben der Lieferung (geknickt)
 *               und dazwischen ein Riss.
 *
 * Rein: kein three, kein Engine-Zugriff. Nichts davon wird gespeichert
 * (Gesetz 5) — die Anzeige ist gerechnet wie bisher.
 */
import { makeHeightSampler } from '../geometrie/HeightSampler.js';
import { hoeheImRaster, rasterKnoten, zellDreiecke } from '../geometrie/SurfaceOps.js';

/** Ab welchem Höhenunterschied (m) ein Knoten als verändert gilt. */
export const ANZEIGE_EPS = 1e-3;
/**
 * Grösste Lieferung, die als Netz angezeigt wird. Darüber bleibt es beim
 * Raster (mit Warnung): das Eigenbau-Modell wird bei jedem Übernehmen neu
 * gebaut, und die Rasteranzeige hat ihr eigenes Budget.
 */
export const ANZEIGE_URNETZ_MAX = 600_000;

const FLAECHE_MIN = 1e-8;       // m² — kleinere Stücke sind Rechenstaub

/**
 * @param {object} p
 * @param {{positions: ArrayLike<number>, triCount: number}} p.urNetz  die Lieferung (Welt)
 * @param {Array<{raster: object, ur: object}>} p.flaechen  je Flicken (oder das grobe Raster)
 *        die geformte Fläche und das Ur auf DEMSELBEN Gitter; `ur` muss aus
 *        der Lieferung abgetastet sein, sonst passt die Naht nicht
 * @returns {{positions: Float64Array, triCount: number, kanten: Float64Array,
 *            kennzahlen: {urDreiecke, oberflaeche, behalten, zugeschnitten, stuecke, zellen, randzellen}}}
 */
export function anzeigeNetz({ urNetz, flaechen = [], eps = ANZEIGE_EPS } = {}) {
    const ober = _oberflaeche(urNetz);
    const aussparungen = flaechen.map(f => _aussparung(f.raster, f.ur, eps)).filter(Boolean);
    const tris = [];                       // Dreiecke der Anzeige, je 9 Werte
    const kanten = [];                     // Strecken, je 6 Werte
    const netzPolys = [];                  // {poly, ganz} — Dreiecke und Stücke der Lieferung
    const nahtPunkte = [];                 // Ecken, die ein Nachbar kennen muss (gegen T-Stösse)
    let behalten = 0, zugeschnitten = 0, stuecke = 0;

    for (let t = 0; t < ober.triCount; t++) {
        const o = t * 9, P = ober.positions;
        const dreieck = [[P[o], P[o + 1], P[o + 2]], [P[o + 3], P[o + 4], P[o + 5]], [P[o + 6], P[o + 7], P[o + 8]]];
        let teile = [dreieck];
        let geschnitten = false;
        for (const a of aussparungen) {
            const neu = [];
            for (const poly of teile) {
                const r = _ausschneiden(poly, a);
                if (r !== null) { geschnitten = true; neu.push(...r); } else neu.push(poly);
            }
            teile = neu;
        }
        if (!geschnitten) {
            netzPolys.push({ poly: dreieck, ganz: true });
            for (let k = 0; k < 3; k++) kanten.push(...dreieck[k], ...dreieck[(k + 1) % 3]);
            behalten++;
            continue;
        }
        zugeschnitten++;
        for (const poly of teile) {
            if (_flaeche(poly) < FLAECHE_MIN) continue;
            netzPolys.push({ poly, ganz: false });
            nahtPunkte.push(...poly);
            stuecke++;
        }
        // Die KANTEN der Lieferung, ausserhalb der Aussparung — die Schnittlinien
        // der Streifen sind Rechenschritte, keine Geländekanten.
        for (let k = 0; k < 3; k++) {
            let strecken = [[dreieck[k], dreieck[(k + 1) % 3]]];
            for (const a of aussparungen) strecken = strecken.flatMap(([p, q]) => _streckeAusserhalb(p, q, a));
            for (const [p, q] of strecken) kanten.push(...p, ...q);
        }
    }

    // DAS GEFORMTE RASTER in der Aussparung — innen genau die Zellteilung der
    // Erdkörper, am Rand der Fächer mit den Kreuzungspunkten der Lieferung.
    const kreuzungen = _kreuzungsIndex(ober);
    let zellen = 0, randzellen = 0;
    for (const a of aussparungen) {
        const { raster, X, Z, nx, nz } = a;
        for (let i = 0; i + 1 < nx; i++) {
            for (let j = 0; j + 1 < nz; j++) {
                if (!a.drin(i, j)) continue;
                zellen++;
                const rand = { s: !a.drin(i, j - 1), o: !a.drin(i + 1, j), n: !a.drin(i, j + 1), w: !a.drin(i - 1, j) };
                const ecken = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]
                    .map(([ii, jj]) => [X[ii], raster.heights[ii * nz + jj], Z[jj]]);
                const randzelle = (rand.s || rand.o || rand.n || rand.w) && ecken.every(p => Number.isFinite(p[1]));
                if (!randzelle) {
                    for (const d of zellDreiecke(raster, i, j)) {
                        tris.push(...d[0], ...d[1], ...d[2]);
                        for (let k = 0; k < 3; k++) kanten.push(...d[k], ...d[(k + 1) % 3]);
                    }
                    continue;
                }
                randzellen++;
                // Umlauf wie `dreieckeMitFlicken`: s (x steigt), o (z steigt), n, w.
                const [c00, c10, c11, c01] = ecken;
                const ring = [
                    c00, ...(rand.s ? kreuzungen.aufStrecke(c00, c10) : []),
                    c10, ...(rand.o ? kreuzungen.aufStrecke(c10, c11) : []),
                    c11, ...(rand.n ? kreuzungen.aufStrecke(c11, c01) : []),
                    c01, ...(rand.w ? kreuzungen.aufStrecke(c01, c00) : []),
                ];
                nahtPunkte.push(...ring);
                const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
                const mitte = [cx, hoeheImRaster(raster, cx, cz) ?? (c00[1] + c10[1] + c11[1] + c01[1]) / 4, cz];
                for (let k = 0; k < ring.length; k++) {
                    tris.push(...mitte, ...ring[k], ...ring[(k + 1) % ring.length]);
                    kanten.push(...ring[k], ...ring[(k + 1) % ring.length]);
                }
            }
        }
    }

    // KONFORM: jeder Nahtpunkt, der auf der Kante eines Dreiecks oder Stücks
    // der Lieferung liegt, wird dort Ecke. Sonst stösst eine Ecke auf eine
    // Kante (T-Stoss) — geometrisch dicht, im Bild aber Pixelblitzer beim
    // Drehen, und der Auswahl-Umriss (`umrissAusNetz`) läse die Stelle als Rand.
    const naht = _punktIndex(nahtPunkte);
    let eingefuegt = 0;
    for (const { poly, ganz } of netzPolys) {
        const ring = naht.aufRand(poly);
        if (ring.length === poly.length) {
            // Nichts einzufügen: das Dreieck bleibt, wie es kam; ein Stück
            // (konvex) wird von seiner ersten Ecke aus aufgefächert.
            if (ganz) tris.push(...poly[0], ...poly[1], ...poly[2]);
            else for (let k = 1; k + 1 < poly.length; k++) tris.push(...poly[0], ...poly[k], ...poly[k + 1]);
            continue;
        }
        eingefuegt += ring.length - poly.length;
        // Mit Punkten auf den Kanten ist das Polygon noch konvex, aber nicht
        // mehr streng: der Fächer geht von der Mitte aus (sie liegt in der
        // Ebene des Dreiecks), sonst entstünden Dreiecke ohne Fläche.
        const m = [0, 1, 2].map(k => poly.reduce((sum, p) => sum + p[k], 0) / poly.length);
        for (let k = 0; k < ring.length; k++) tris.push(...m, ...ring[k], ...ring[(k + 1) % ring.length]);
    }

    return {
        positions: Float64Array.from(tris), triCount: tris.length / 9,
        kanten: Float64Array.from(kanten),
        kennzahlen: { urDreiecke: urNetz?.triCount ?? 0, oberflaeche: ober.triCount, behalten, zugeschnitten, stuecke,
                      zellen, randzellen, eingefuegt },
    };
}

/**
 * Ein Eimergitter über den Nahtpunkten. `aufRand(poly)` gibt den Umlauf des
 * Polygons zurück, mit jedem Nahtpunkt, der STRIKT auf einer seiner Kanten
 * liegt (in der Grundfläche auf 1 µm), an seiner Stelle eingefügt.
 */
function _punktIndex(punkte) {
    if (!punkte.length) return { aufRand: (poly) => poly };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of punkte) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
    const seite = Math.max(1e-3, Math.sqrt(((maxX - minX) * (maxZ - minZ) || 1) / punkte.length) * 4);
    const eimer = new Map();
    const schluessel = (a, b) => a * 1e6 + b;
    for (const p of punkte) {
        const k = schluessel(Math.floor((p[0] - minX) / seite), Math.floor((p[2] - minZ) / seite));
        if (!eimer.has(k)) eimer.set(k, []);
        eimer.get(k).push(p);
    }
    const TOL = 1e-6;
    function aufRand(poly) {
        const b = _box(poly);
        if (b.maxX < minX - TOL || b.minX > maxX + TOL || b.maxZ < minZ - TOL || b.minZ > maxZ + TOL) return poly;
        const a0 = Math.floor((b.minX - TOL - minX) / seite), a1 = Math.floor((b.maxX + TOL - minX) / seite);
        const b0 = Math.floor((b.minZ - TOL - minZ) / seite), b1 = Math.floor((b.maxZ + TOL - minZ) / seite);
        const kandidaten = [];
        for (let a = a0; a <= a1; a++) for (let c = b0; c <= b1; c++) {
            const e = eimer.get(schluessel(a, c));
            if (e) kandidaten.push(...e);
        }
        if (!kandidaten.length) return poly;
        const aus = [];
        let neu = false;
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length];
            aus.push(p);
            const dx = q[0] - p[0], dz = q[2] - p[2], l2 = dx * dx + dz * dz;
            if (l2 < 1e-18) continue;
            const l = Math.sqrt(l2);
            const auf = [];
            for (const s of kandidaten) {
                const t = ((s[0] - p[0]) * dx + (s[2] - p[2]) * dz) / l2;
                if (t * l <= TOL || (1 - t) * l <= TOL) continue;             // eine Ecke, kein Kantenpunkt
                const quer = Math.abs((s[0] - p[0]) * dz - (s[2] - p[2]) * dx) / l;
                if (quer > TOL) continue;
                auf.push([t, s]);
            }
            if (!auf.length) continue;
            auf.sort((u, v) => u[0] - v[0]);
            let letzt = -1;
            for (const [t, s] of auf) {
                if ((t - letzt) * l <= TOL) continue;
                // Die Höhe aus der Kante selbst: der Punkt liegt auf ihr, und so
                // trifft er beide Nachbarn auf dieselbe Zahl.
                aus.push([s[0], p[1] + t * (q[1] - p[1]), s[2]]);
                letzt = t; neu = true;
            }
        }
        return neu ? aus : poly;
    }
    return { aufRand };
}

// ── Die Oberfläche der Lieferung ───────────────────────────────────────────

/** y-Anteil der Normalen (b − a) × (c − a) — das Vorzeichen ist der Umlauf von oben. */
function _ny(ax, az, bx, bz, cx, cz) {
    return (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
}

/**
 * Die Dreiecke, die man von OBEN sieht — so, wie Sampler und Raster das
 * Gelände lesen („höchstes getroffenes Dreieck"). Ein reines DGM ist das ganz;
 * ein geschlossener Erdkörper (das Testgelände ist einer) verliert Wände und
 * Boden. Ausgegeben im Umlauf der Rasteranzeige (ny < 0), damit Netz und
 * Raster eine Fläche sind und kein Leser die eine Hälfte als Unterseite
 * verwirft.
 */
function _oberflaeche(netz) {
    const P = netz?.positions, n = netz?.triCount ?? 0;
    if (!P || !n) return { positions: new Float64Array(0), triCount: 0 };
    let auf = 0, ab = 0;
    const ny = new Float64Array(n);
    for (let t = 0; t < n; t++) {
        const o = t * 9;
        ny[t] = _ny(P[o], P[o + 2], P[o + 3], P[o + 5], P[o + 6], P[o + 8]);
        if (ny[t] > 1e-9) auf++; else if (ny[t] < -1e-9) ab++;
    }
    // Beide Richtungen vertreten: ein Körper (oder ein wirr gewickeltes DGM) —
    // dann entscheidet die Höhe, nicht der Umlauf.
    const sampler = (auf && ab) ? makeHeightSampler(P, n) : null;
    const out = new Float64Array(n * 9);
    let m = 0;
    for (let t = 0; t < n; t++) {
        if (Math.abs(ny[t]) <= 1e-9) continue;              // senkrecht oder entartet
        const o = t * 9;
        if (sampler) {
            const cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
            const cy = (P[o + 1] + P[o + 4] + P[o + 7]) / 3;
            const oben = sampler.sample(cx, cz);
            if (oben == null || cy < oben - 1e-3) continue;
        }
        const d = m * 9;
        if (ny[t] < 0) {
            for (let k = 0; k < 9; k++) out[d + k] = P[o + k];
        } else {
            // umdrehen: a, c, b
            out[d] = P[o]; out[d + 1] = P[o + 1]; out[d + 2] = P[o + 2];
            out[d + 3] = P[o + 6]; out[d + 4] = P[o + 7]; out[d + 5] = P[o + 8];
            out[d + 6] = P[o + 3]; out[d + 7] = P[o + 4]; out[d + 8] = P[o + 5];
        }
        m++;
    }
    return { positions: out.subarray(0, m * 9), triCount: m };
}

// ── Die Aussparung ─────────────────────────────────────────────────────────

/**
 * Welche Zellen dieses Rasters das geformte Raster zeigt: verändert (ein
 * Knoten weicht ab), um eine Zelle geweitet (8er-Nachbarschaft).
 */
function _aussparung(raster, ur, eps) {
    if (!raster || !ur || raster.nx !== ur.nx || raster.nz !== ur.nz) return null;
    const { nx, nz } = raster;
    const cx = nx - 1, cz = nz - 1;
    if (cx < 1 || cz < 1) return null;
    const knoten = new Uint8Array(nx * nz);
    for (let k = 0; k < nx * nz; k++) {
        const a = raster.heights[k], b = ur.heights[k];
        const na = !Number.isFinite(a), nb = !Number.isFinite(b);
        knoten[k] = (na !== nb) || (!na && Math.abs(a - b) > eps) ? 1 : 0;
    }
    const veraendert = new Uint8Array(cx * cz);
    let irgendwas = false;
    for (let i = 0; i < cx; i++) for (let j = 0; j < cz; j++) {
        if (knoten[i * nz + j] || knoten[(i + 1) * nz + j] || knoten[i * nz + j + 1] || knoten[(i + 1) * nz + j + 1]) {
            veraendert[i * cz + j] = 1; irgendwas = true;
        }
    }
    if (!irgendwas) return null;
    const maske = new Uint8Array(cx * cz);
    for (let i = 0; i < cx; i++) for (let j = 0; j < cz; j++) {
        if (!veraendert[i * cz + j]) continue;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const a = i + di, b = j + dj;
            if (a >= 0 && b >= 0 && a < cx && b < cz) maske[a * cz + b] = 1;
        }
    }
    // Summentabelle: „liegt in diesem Rechteck überhaupt eine Zelle?" in O(1).
    const summe = new Int32Array((cx + 1) * (cz + 1));
    for (let i = 0; i < cx; i++) for (let j = 0; j < cz; j++) {
        summe[(i + 1) * (cz + 1) + j + 1] = maske[i * cz + j]
            + summe[i * (cz + 1) + j + 1] + summe[(i + 1) * (cz + 1) + j] - summe[i * (cz + 1) + j];
    }
    const X = Array.from({ length: nx }, (_, i) => rasterKnoten(raster, i, 0).x);
    const Z = Array.from({ length: nz }, (_, j) => rasterKnoten(raster, 0, j).z);
    const drin = (i, j) => i >= 0 && j >= 0 && i < cx && j < cz && maske[i * cz + j] === 1;
    const anzahl = (i0, i1, j0, j1) => {
        if (i1 < i0 || j1 < j0) return 0;
        const S = (i, j) => summe[i * (cz + 1) + j];
        return S(i1 + 1, j1 + 1) - S(i0, j1 + 1) - S(i1 + 1, j0) + S(i0, j0);
    };
    /** Zellindex einer Koordinate — geklemmt; die letzte Zelle darf schmaler sein (Randklemme). */
    const zelleIn = (werte, v) => {
        let lo = 0, hi = werte.length - 2;
        if (v <= werte[0]) return 0;
        if (v >= werte[hi + 1]) return hi;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (werte[mid] <= v) lo = mid; else hi = mid - 1;
        }
        return lo;
    };
    return { raster, X, Z, nx, nz, drin, anzahl, zelleIn };
}

// ── Zuschneiden ────────────────────────────────────────────────────────────

/** Ein konvexes Polygon an einer Achse teilen: [≤ c, ≥ c]. */
function _teile(poly, achse, c) {
    const k = achse === 'x' ? 0 : 2;
    const unten = [], oben = [];
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const dp = p[k] - c, dq = q[k] - c;
        if (dp <= 0) unten.push(p);
        if (dp >= 0) oben.push(p);
        if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
            const t = dp / (dp - dq);
            const s = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])];
            s[k] = c;
            unten.push(s); oben.push(s);
        }
    }
    return [unten.length >= 3 ? unten : null, oben.length >= 3 ? oben : null];
}

function _flaeche(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        a += p[0] * q[2] - q[0] * p[2];
    }
    return Math.abs(a) / 2;
}

function _box(poly) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
    }
    return { minX, maxX, minZ, maxZ };
}

/**
 * Ein konvexes Polygon minus die Aussparung. null = berührt sie nicht (das
 * Polygon bleibt, wie es ist); sonst die übrigen konvexen Stücke.
 *
 * Zeilen mit GLEICHER Belegung werden zu einem Band zusammengefasst: an einer
 * geraden Aussparungskante entsteht so ein Stück statt eines je Zeile.
 */
function _ausschneiden(poly, a) {
    const b = _box(poly);
    const { X, Z } = a;
    if (b.maxX <= X[0] || b.minX >= X[X.length - 1] || b.maxZ <= Z[0] || b.minZ >= Z[Z.length - 1]) return null;
    const i0 = a.zelleIn(X, b.minX), i1 = a.zelleIn(X, b.maxX);
    const j0 = a.zelleIn(Z, b.minZ), j1 = a.zelleIn(Z, b.maxZ);
    if (!a.anzahl(i0, i1, j0, j1)) return null;
    // Je Zeile die belegten Spannen [von, bis] (Zellindizes) im Bereich des Polygons.
    const baender = [];
    for (let j = j0; j <= j1; j++) {
        const spannen = [];
        let von = -1;
        for (let i = i0; i <= i1 + 1; i++) {
            const d = i <= i1 && a.drin(i, j);
            if (d && von < 0) von = i;
            if (!d && von >= 0) { spannen.push([von, i - 1]); von = -1; }
        }
        const schluessel = spannen.map(s => s.join('-')).join(',');
        const letztes = baender[baender.length - 1];
        if (letztes && letztes.j1 === j - 1 && letztes.schluessel === schluessel) { letztes.j1 = j; continue; }
        baender.push({ j0: j, j1: j, schluessel, spannen });
    }
    const aus = [];
    let rest = poly;
    for (const band of baender) {
        if (!band.spannen.length || !rest) continue;
        const [vorher, ab] = _teile(rest, 'z', Z[band.j0]);
        if (vorher) aus.push(vorher);
        if (!ab) { rest = null; break; }
        const [streifen, danach] = _teile(ab, 'z', Z[band.j1 + 1]);
        rest = danach;
        let s = streifen;
        for (const [von, bis] of band.spannen) {
            if (!s) break;
            const [links, r] = _teile(s, 'x', X[von]);
            if (links) aus.push(links);
            if (!r) { s = null; break; }
            s = _teile(r, 'x', X[bis + 1])[1];
        }
        if (s) aus.push(s);
    }
    if (rest) aus.push(rest);
    return aus;
}

/**
 * Eine Strecke minus die Aussparung — für die Kanten. Geteilt an jeder
 * Rasterlinie, die sie kreuzt; ein Teilstück zählt nach seiner Mitte.
 */
function _streckeAusserhalb(p, q, a) {
    const { X, Z } = a;
    const minX = Math.min(p[0], q[0]), maxX = Math.max(p[0], q[0]);
    const minZ = Math.min(p[2], q[2]), maxZ = Math.max(p[2], q[2]);
    if (maxX <= X[0] || minX >= X[X.length - 1] || maxZ <= Z[0] || minZ >= Z[Z.length - 1]) return [[p, q]];
    const i0 = a.zelleIn(X, minX), i1 = a.zelleIn(X, maxX), j0 = a.zelleIn(Z, minZ), j1 = a.zelleIn(Z, maxZ);
    if (!a.anzahl(i0, i1, j0, j1)) return [[p, q]];
    const ts = [0, 1];
    const dx = q[0] - p[0], dz = q[2] - p[2];
    if (Math.abs(dx) > 1e-12) for (let i = i0; i <= i1 + 1; i++) { const t = (X[i] - p[0]) / dx; if (t > 0 && t < 1) ts.push(t); }
    if (Math.abs(dz) > 1e-12) for (let j = j0; j <= j1 + 1; j++) { const t = (Z[j] - p[2]) / dz; if (t > 0 && t < 1) ts.push(t); }
    ts.sort((u, v) => u - v);
    const bei = (t) => [p[0] + t * dx, p[1] + t * (q[1] - p[1]), p[2] + t * dz];
    const aus = [];
    let von = null;
    for (let k = 0; k + 1 < ts.length; k++) {
        if (ts[k + 1] - ts[k] < 1e-12) continue;
        const m = bei((ts[k] + ts[k + 1]) / 2);
        const innen = m[0] > X[0] && m[0] < X[X.length - 1] && m[2] > Z[0] && m[2] < Z[Z.length - 1]
            && a.drin(a.zelleIn(X, m[0]), a.zelleIn(Z, m[2]));
        if (!innen && von === null) von = ts[k];
        if (innen && von !== null) { aus.push([bei(von), bei(ts[k])]); von = null; }
    }
    if (von !== null) aus.push([bei(von), bei(1)]);
    return aus;
}

// ── Die Naht ───────────────────────────────────────────────────────────────

/**
 * Wo kreuzen Dreieckskanten der Lieferung eine achsparallele Strecke? Ein
 * Eimergitter über den Dreiecken — die Randzellen fragen je Kante einmal.
 */
function _kreuzungsIndex(ober) {
    const P = ober.positions, n = ober.triCount;
    if (!n) return { aufStrecke: () => [] };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < n * 3; k++) {
        const x = P[k * 3], z = P[k * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const seite = Math.max(1e-6, Math.sqrt(((maxX - minX) * (maxZ - minZ) || 1) / n) * 2);
    const gx = Math.max(1, Math.ceil((maxX - minX) / seite)), gz = Math.max(1, Math.ceil((maxZ - minZ) / seite));
    const eimer = new Map();
    const ix = (x) => Math.min(gx - 1, Math.max(0, Math.floor((x - minX) / seite)));
    const iz = (z) => Math.min(gz - 1, Math.max(0, Math.floor((z - minZ) / seite)));
    for (let t = 0; t < n; t++) {
        const o = t * 9;
        const x0 = Math.min(P[o], P[o + 3], P[o + 6]), x1 = Math.max(P[o], P[o + 3], P[o + 6]);
        const z0 = Math.min(P[o + 2], P[o + 5], P[o + 8]), z1 = Math.max(P[o + 2], P[o + 5], P[o + 8]);
        for (let a = ix(x0); a <= ix(x1); a++) for (let b = iz(z0); b <= iz(z1); b++) {
            const s = a * gz + b;
            if (!eimer.has(s)) eimer.set(s, []);
            eimer.get(s).push(t);
        }
    }
    /** Punkte strikt zwischen p und q (achsparallel), in Laufrichtung p → q, mit der Höhe der Lieferung. */
    function aufStrecke(p, q) {
        const senkrechtX = Math.abs(p[0] - q[0]) < 1e-12;    // x fest, z läuft
        const fest = senkrechtX ? p[0] : p[2];
        const lauf = senkrechtX ? 2 : 0, quer = senkrechtX ? 0 : 2;
        const von = Math.min(p[lauf], q[lauf]), bis = Math.max(p[lauf], q[lauf]);
        const gesehen = new Set();
        const punkte = [];
        const x0 = senkrechtX ? fest : von, x1 = senkrechtX ? fest : bis;
        const z0 = senkrechtX ? von : fest, z1 = senkrechtX ? bis : fest;
        for (let a = ix(x0); a <= ix(x1); a++) for (let b = iz(z0); b <= iz(z1); b++) {
            for (const t of eimer.get(a * gz + b) ?? []) {
                if (gesehen.has(t)) continue;
                gesehen.add(t);
                const o = t * 9;
                for (let k = 0; k < 3; k++) {
                    const u = o + k * 3, w = o + ((k + 1) % 3) * 3;
                    const du = P[u + quer] - fest, dw = P[w + quer] - fest;
                    let s = null;
                    if (Math.abs(du) < 1e-9) s = [P[u], P[u + 1], P[u + 2]];
                    else if ((du < 0 && dw > 0) || (du > 0 && dw < 0)) {
                        const f = du / (du - dw);
                        s = [P[u] + f * (P[w] - P[u]), P[u + 1] + f * (P[w + 1] - P[u + 1]), P[u + 2] + f * (P[w + 2] - P[u + 2])];
                        s[quer] = fest;
                    }
                    if (s && s[lauf] > von + 1e-7 && s[lauf] < bis - 1e-7) punkte.push(s);
                }
            }
        }
        const steigt = q[lauf] > p[lauf];
        punkte.sort((u, v) => (steigt ? u[lauf] - v[lauf] : v[lauf] - u[lauf]));
        const aus = [];
        for (const s of punkte) {
            if (aus.length && Math.abs(aus[aus.length - 1][lauf] - s[lauf]) < 1e-7) continue;
            aus.push(s);
        }
        return aus;
    }
    return { aufStrecke };
}
