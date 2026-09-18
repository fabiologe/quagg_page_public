/**
 * Körper-Operationen des Kernels (Teil XIV, G1).
 *
 * `koerperZwischenRastern` ist das Herzstück der ersten Pipeline: der
 * AUSHUBKÖRPER ist der Raum zwischen dem gewachsenen Gelände (oben) und dem
 * geformten (unten) — ein geschlossener Volumenkörper mit Deckel, Boden und
 * Wänden, an dem `meshVolume` ein echtes Attest ausstellt. Daraus wird das
 * IfcEarthworksCut; seine Masse ist die Gegenprobe zur Rasterrechnung
 * (`massenAus`) — zwei unabhängige Wege zu derselben Zahl.
 *
 * Nach dem Muster `flood-2D/utils/Bridge3DGeometry.cellSolid` (Hausregel:
 * kopiert, nie importiert): geteilte Zellecken, Deckel + Boden, Wände NUR an
 * Zellkanten ohne Nachbar in der Region.
 *
 * ZWEI FALLEN, hier ausgetreten:
 *   1. Wo die Dicke null ist (am Regionsrand), fallen Deckel und Boden
 *      zusammen — `meshVolume` dedupliziert auf 1 mm und fände die Kante dann
 *      viermal: „nicht mannigfaltig". Deshalb liegt der Boden dort um DUENN
 *      unter dem Deckel: ein Fünf-Millimeter-Keil am Rand, den die Masse
 *      verschmerzt und der die Topologie sauber hält.
 *   2. Wo `unten` ÜBER `oben` liegt, ist die Dicke null, nicht negativ:
 *      der Boden wird auf den Deckel geklemmt. Damit liefert dieselbe
 *      Funktion Aushub (oben = Ur-Gelände) UND Auftrag (oben = geformt) —
 *      nur die Reihenfolge der Argumente wechselt.
 *
 * Alle Flächen zeigen NACH AUSSEN (three: +Y ist oben). Die Wicklungen sind
 * unten je Kante hergeleitet — wer eine ändert, prüft `closed` im Test.
 */
import { diagonale00_11, rasterKnoten } from '../SurfaceOps.js';
import { meshVolume } from '../MeshOps.js';
import { gleicherBezug, rasterResample } from './Raster.js';

/** Mindestdicke am Rand — über der 1-mm-Quantisierung von `meshVolume`. */
export const DUENN = 0.005;

/**
 * @param {{oben: raster, unten: raster}} eingaben
 * @param {{eps?: number}} parameter  Zellen mit max. Dicke ≤ eps gehören nicht dazu
 * @returns {{ergebnis: koerper|null, warnungen: string[]}}
 */
export function koerperZwischenRastern({ oben, unten } = {}, { eps = DUENN } = {}) {
    const warnungen = [];
    let u = unten;
    if (!gleicherBezug(oben, unten)) {
        u = rasterResample({ raster: unten }, { bezug: oben }).ergebnis;
        warnungen.push('bezug_angeglichen: unten wurde bilinear auf den Bezug von oben umgerechnet');
    }
    const { nx, nz } = oben;
    const H = oben.heights;
    const U = u.heights;

    // ── Region: Zellen, deren vier Ecken beidseitig endlich sind und die
    //    irgendwo dicker als eps sind. ─────────────────────────────────────
    const drin = new Uint8Array((nx - 1) * (nz - 1));
    let zellen = 0;
    const dicke = (ix, iz) => H[ix * nz + iz] - U[ix * nz + iz];
    const endlich = (ix, iz) => Number.isFinite(H[ix * nz + iz]) && Number.isFinite(U[ix * nz + iz]);
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            if (!(endlich(ix, iz) && endlich(ix + 1, iz) && endlich(ix, iz + 1) && endlich(ix + 1, iz + 1))) continue;
            const d = Math.max(dicke(ix, iz), dicke(ix + 1, iz), dicke(ix, iz + 1), dicke(ix + 1, iz + 1));
            if (d > eps) { drin[ix * (nz - 1) + iz] = 1; zellen++; }
        }
    }
    if (!zellen) return { ergebnis: null, warnungen: [...warnungen, 'koerper_leer: nirgends dicker als eps'] };

    const istDrin = (ix, iz) => (ix >= 0 && iz >= 0 && ix + 1 < nx && iz + 1 < nz && drin[ix * (nz - 1) + iz] === 1);

    // ── Ecken: geteilt je (ix, iz, Lage). Boden ≤ Deckel − DUENN. ────────────
    const ecken = [];          // flache xyz-Liste
    const index = new Map();   // 'ix,iz,t|b' → Index
    const ecke = (ix, iz, lage) => {
        const key = `${ix},${iz},${lage}`;
        let i = index.get(key);
        if (i !== undefined) return i;
        const k = rasterKnoten(oben, ix, iz);
        const top = H[ix * nz + iz];
        const y = lage === 't' ? top : Math.min(U[ix * nz + iz], top - DUENN);
        i = ecken.length / 3;
        ecken.push(k.x, y, k.z);
        index.set(key, i);
        return i;
    };

    const tris = [];   // Indizes, je 3
    // Wand zwischen den Ecken A und B; `nachAussen` spiegelt die Wicklung.
    const wand = (ax, az, bx, bz, spiegeln) => {
        const bA = ecke(ax, az, 'b'), tA = ecke(ax, az, 't');
        const bB = ecke(bx, bz, 'b'), tB = ecke(bx, bz, 't');
        if (spiegeln) tris.push(bA, bB, tA, bB, tB, tA);
        else tris.push(bA, tA, bB, bB, tA, tB);
    };

    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            if (!istDrin(ix, iz)) continue;
            const t00 = ecke(ix, iz, 't'), t10 = ecke(ix + 1, iz, 't');
            const t01 = ecke(ix, iz + 1, 't'), t11 = ecke(ix + 1, iz + 1, 't');
            // DIESELBE DIAGONALE WIE DIE ANZEIGE (Teil XXI, 2026-09-17): Deckel
            // und Boden sind dieselben Flächen, die `dreieckeAusRaster` zeichnet
            // — wer anders teilt, baut aus einem Rasterstand zwei Flächen, und
            // die durchdringen sich am Knick (gemessen: 0,20 m am Grubenrand).
            // Deckel: Normale +Y, Boden: Normale −Y.
            if (diagonale00_11(oben, ix, iz)) tris.push(t00, t11, t10, t00, t01, t11);
            else                              tris.push(t00, t01, t10, t01, t11, t10);
            const b00 = ecke(ix, iz, 'b'), b10 = ecke(ix + 1, iz, 'b');
            const b01 = ecke(ix, iz + 1, 'b'), b11 = ecke(ix + 1, iz + 1, 'b');
            if (diagonale00_11(unten, ix, iz)) tris.push(b00, b10, b11, b00, b11, b01);
            else                               tris.push(b00, b10, b01, b10, b11, b01);
            // Wände nur, wo der Nachbar fehlt. Wicklung je Seite hergeleitet:
            // Süd (z0, Aussen −Z): (bA,tA,bB)(bB,tA,tB)   West (x0, Aussen −X): gespiegelt
            // Nord (z1, Aussen +Z): gespiegelt              Ost  (x1, Aussen +X): direkt
            if (!istDrin(ix, iz - 1)) wand(ix, iz, ix + 1, iz, false);
            if (!istDrin(ix, iz + 1)) wand(ix, iz + 1, ix + 1, iz + 1, true);
            if (!istDrin(ix - 1, iz)) wand(ix, iz, ix, iz + 1, true);
            if (!istDrin(ix + 1, iz)) wand(ix + 1, iz, ix + 1, iz + 1, false);
        }
    }

    // ── In die Kernel-Form (nicht indiziert, Float64) ─────────────────────────
    const triCount = tris.length / 3;
    const positions = new Float64Array(triCount * 9);
    for (let i = 0; i < tris.length; i++) {
        const v = tris[i] * 3;
        positions[i * 3] = ecken[v];
        positions[i * 3 + 1] = ecken[v + 1];
        positions[i * 3 + 2] = ecken[v + 2];
    }
    const attest = meshVolume(positions, triCount);
    if (!attest.closed) warnungen.push(...attest.warnings);
    return {
        ergebnis: {
            positions, triCount,
            closed: attest.closed,
            volumen: attest.volume,
            zellen,
            warnungen: attest.warnings,
        },
        warnungen,
    };
}
