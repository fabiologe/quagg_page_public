/**
 * EIN RAUM IN DER ERDMULDE (Teil XXIX, G-T2 — Konzept § 11.3, Lücke L-B).
 *
 * Der Dauerstau eines Teichs ist das Wasser zwischen Gelände und Wasserspiegel; der Rückhalteraum das zwischen
 * zwei Spiegeln, wo das Gelände tiefer liegt. Ein Raum der CDE war ein senkrechtes Prisma (Grundfläche × Höhe):
 * die Mulde 1 : 3 hätte zwischen 99 und 100 1 424 m³, das Prisma über der Wasserfläche 1 196 m³ (G0).
 *
 * Gerechnet auf DERSELBEN Fläche wie die Schicht (`Schicht.js`): der Umriss in Dreiecke, je Dreieck gegen die
 * Dreiecke des Rasters geschnitten — jedes Stück liegt in EINER Ebene des Geländes. Darin ist „Gelände unter dem
 * Spiegel" eine Halbebene (die Ebene ist linear), also wird jedes Stück noch einmal an der Linie Gelände = Spiegel
 * geschnitten, beim Raum zwischen zwei Spiegeln auch an Gelände = untere Grenze. Boden = max(Gelände, unten),
 * Decke = oben — beides linear je Stück, also ist der Körper exakt und sein Volumen das Integral.
 *
 * Wo Boden und Decke sich berühren (an der Wasserlinie), trägt das Wasser einen Film von 1,5 µm (siehe FILM) —
 * so bleibt jede Kante eindeutig, auch wo zwei Wasserflächen sich in einer Linie berühren.
 *
 * Rein: kein three, keine Engine.
 */
import { meshVolume } from '../MeshOps.js';
import { QUANT, eckenSammler, ohrenschnitt, randkanten, schneideKonvex, zellEbenen, zerlegeKonvex } from './Schicht.js';

/** Konvexes Polygon gegen die Halbebene f ≤ 0 (f linear) — Sutherland–Hodgman mit einer Kante. */
function _kappe(poly, f) {
    const aus = [];
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        const fp = f(p), fq = f(q);
        if (fp <= 0) aus.push(p);
        if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
            const t = fp / (fp - fq);
            aus.push({ x: p.x + t * (q.x - p.x), z: p.z + t * (q.z - p.z) });
        }
    }
    return aus;
}

/** So weit liegt ein Geländeknoten mindestens neben dem Spiegel (siehe `raumInMulde`). */
export const KNOTEN_ABSTAND = 1e-5;

const _flaeche = (a, b, c) => ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;

/**
 * @param {{raster}} eingaben  das Gelände (Welt)
 * @param {{umriss: Array<{x, z}>, oben: number, unten?: number|null}} parameter
 *   `oben`: der Spiegel (Welt-Y); `unten`: die untere Grenze (Welt-Y) — leer heisst „bis aufs Gelände".
 * @returns {{ergebnis: (koerper & {wasserflaeche, tiefster, ausserhalb})|null, warnungen: string[]}}
 */
export function raumInMulde({ raster } = {}, { umriss, oben, unten = null } = {}) {
    const warnungen = [];
    const O = Number(oben);
    if (!Number.isFinite(O)) throw new Error(`raumInMulde: Spiegel ${oben} ist keine Zahl`);
    const U = unten === null || unten === undefined || unten === '' ? -Infinity : Number(unten);
    if (!(U < O)) return { ergebnis: null, warnungen: [`raum_leer: die untere Grenze (${unten}) liegt nicht unter dem Spiegel (${oben})`] };
    const { punkte, dreiecke } = ohrenschnitt(Array.isArray(umriss) ? umriss : []);
    if (!dreiecke.length) return { ergebnis: null, warnungen: ['raum_leer: der Umriss hat keine Fläche'] };
    const { x0, z0, cell, nx, nz } = raster ?? {};
    if (!(nx >= 2 && nz >= 2 && cell > 0)) return { ergebnis: null, warnungen: ['raum_leer: kein Gelände'] };
    // KEIN KNOTEN AUF DEM SPIEGEL: liegt ein Geländeknoten näher als KNOTEN_ABSTAND am Spiegel (oder an der unteren
    // Grenze), gilt er für diese Rechnung als um KNOTEN_ABSTAND DARÜBER (trocken). Ein Knoten genau auf Spiegelhöhe
    // machte zwei Wasserflächen, die sich in einem Punkt berühren — als EIN Körper nicht geschlossen —, und einer
    // knapp daneben schnitt Splitter von wenigen µm (gemessen an Knoten aus Float32, 250,1499999821 gegen den Spiegel
    // 250,15: bis 111 von 1 800 Körpern offen). Das Gelände ändert sich um höchstens 10 µm, nur in dieser Rechnung;
    // am Teich (Konzept § 11) sind das etwa 10⁻³ m³.
    const heights = Float64Array.from(raster.heights, (h) => (Math.abs(h - O) < KNOTEN_ABSTAND ? O + KNOTEN_ABSTAND
        : (Number.isFinite(U) && Math.abs(h - U) < KNOTEN_ABSTAND ? U + KNOTEN_ABSTAND : h)));
    raster = { ...raster, heights };

    // Ecken: je Grundrisspunkt EINE Ecke mit ihrem Boden (stetig: max(Gelände, unten)); die Decke ist überall O.
    const { ecke: eckeRoh, ex, ez, ey: eb } = eckenSammler();
    const ecke = (p, boden) => eckeRoh(p, (q) => Math.min(O, boden(q)));
    const tris = [];
    let wasser = 0, umrissFl = 0, gedeckt = 0;
    for (const [ia, ib, ic] of dreiecke) {
        const t = [punkte[ia], punkte[ib], punkte[ic]];
        umrissFl += _flaeche(t[0], t[1], t[2]);
        const minX = Math.min(t[0].x, t[1].x, t[2].x), maxX = Math.max(t[0].x, t[1].x, t[2].x);
        const minZ = Math.min(t[0].z, t[1].z, t[2].z), maxZ = Math.max(t[0].z, t[1].z, t[2].z);
        const ix0 = Math.max(0, Math.floor((minX - x0) / cell)), ix1 = Math.min(nx - 2, Math.floor((maxX - x0) / cell));
        const iz0 = Math.max(0, Math.floor((minZ - z0) / cell)), iz1 = Math.min(nz - 2, Math.floor((maxZ - z0) / cell));
        for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
                for (const ebene of zellEbenen(raster, ix, iz)) {
                    const stueck = schneideKonvex(t, ebene.tri);
                    if (stueck.length < 3) continue;
                    for (let j = 1; j + 1 < stueck.length; j++) gedeckt += Math.max(0, _flaeche(stueck[0], stueck[j], stueck[j + 1]));
                    const h = (p) => ebene.y(p.x, p.z);
                    const nass = _kappe(stueck, (p) => h(p) - O);
                    // Kein Stück liegt GENAU auf der unteren Grenze (die Knoten sind abgerückt, KNOTEN_ABSTAND) — in den
                    // Muldenecken lag sonst ein Dreieck ganz auf 99,00 und zählte zu beiden Seiten (0,5 m² zu viel).
                    const teile = Number.isFinite(U)
                        ? [[_kappe(nass, (p) => U - h(p)), h], [_kappe(nass, (p) => h(p) - U), () => U]]
                        : [[nass, h]];
                    for (const [poly, boden] of teile) {
                        if (poly.length < 3) continue;
                        for (const [pa, pb, pc] of zerlegeKonvex(poly)) {
                            const a = ecke(pa, boden), b = ecke(pb, boden), c = ecke(pc, boden);
                            if (a === b || b === c || a === c) continue;
                            tris.push([a, b, c]);
                            wasser += Math.max(0, _flaeche({ x: ex[a], z: ez[a] }, { x: ex[b], z: ez[b] }, { x: ex[c], z: ez[c] }));
                        }
                    }
                }
            }
        }
    }
    const ausserhalb = umrissFl > 0 ? Math.max(0, 1 - gedeckt / umrissFl) : 0;
    if (ausserhalb > 0.001) warnungen.push(`raum_teilweise: ${(ausserhalb * 100).toFixed(1)} % des Umrisses liegen nicht auf dem Gelände`);
    // WO BODEN UND DECKE SICH BERÜHREN — an der Wasserlinie und dort, wo das Gelände eine Linie genau auf Spiegelhöhe
    // bildet und auf BEIDEN Seiten Wasser steht. Im zweiten Fall berühren sich zwei Wasserkörper in einer Kante:
    // vier Flächen an einer Kante, kein geschlossener Körper (gemessen im Browser: Spiegel 250,15 über Geländeknoten
    // aus Float32; im Zufallstest 111 von 1 800 offen). Statt Ecken zusammenzulegen bekommt das Wasser dort einen Film
    // von FILM — dicker als die Toleranz des Attests, dünner als alles, was ein Volumen merkt (< 1e-4 m³ am Teich).
    const FILM = 1.5 * QUANT;
    for (let i = 0; i < eb.length; i++) if (O - eb[i] < FILM) eb[i] = O - FILM;
    if (!tris.length) return { ergebnis: null, warnungen: [...warnungen, 'raum_leer: das Gelände liegt im Umriss nirgends unter dem Spiegel'] };
    let tiefsterRoh = O;
    for (const y of eb) if (y < tiefsterRoh) tiefsterRoh = y;
    if (O - tiefsterRoh <= FILM) return { ergebnis: null, warnungen: [...warnungen, 'raum_leer: das Gelände liegt im Umriss nirgends unter dem Spiegel'] };

    const rand = randkanten(tris, ex.length);
    const T = (i) => [ex[i], O, ez[i]];
    const Bo = (i) => [ex[i], eb[i], ez[i]];
    const flaechen = [];
    for (const [a, b, c] of tris) {
        flaechen.push([T(a), T(c), T(b)]);
        flaechen.push([Bo(a), Bo(b), Bo(c)]);
    }
    for (const [u, w] of rand) {
        flaechen.push([T(u), T(w), Bo(w)]);
        flaechen.push([T(u), Bo(w), Bo(u)]);
    }
    const positions = new Float64Array(flaechen.length * 9);
    flaechen.forEach((f, i) => positions.set([...f[0], ...f[1], ...f[2]], i * 9));
    const attest = meshVolume(positions, flaechen.length, { snapEps: QUANT });
    if (!attest.closed) warnungen.push(...attest.warnings);
    const tiefster = tiefsterRoh;
    // Wo der Spiegel über den Umriss hinaus reicht (das Gelände am Rand liegt tiefer): Wände am Umriss — gesagt.
    // Eine Wand nur aus Film ist die Wasserlinie, keine Wand.
    const randNass = rand.some(([u, w]) => O - eb[u] > 2 * FILM || O - eb[w] > 2 * FILM);
    if (randNass) warnungen.push('raum_am_umriss: am Umriss liegt das Gelände unter dem Spiegel — dort ist der Raum senkrecht abgeschnitten');
    return {
        ergebnis: { positions, triCount: flaechen.length, closed: attest.closed, volumen: attest.volume, warnungen: attest.warnings,
                    wasserflaeche: wasser, tiefster, ausserhalb },
        warnungen,
    };
}
