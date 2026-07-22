// Tests: analytische Potentialströmungs-Deflection um Brückenpfeiler (pierFlowDeflection.js).
// Kernaussage: der Solver kennt keine Pfeiler-Umströmung — dieses Modul überlagert nur beim
// Rendern eine Uniform-Flow+Doublet-Lösung im Ring zwischen Pfeilerrand und Einflussradius.
// Ausführen: node src/features/flood-2D/test/test_pier_deflection.mjs   (aus client/)
import { createLattice, addPier } from '../utils/BridgeMeshLattice.js';
import {
    buildPierGeometry,
    sampleAmbientForPiers,
    deflectVelocity,
    pierNoseShapeFactor,
} from '../utils/pierFlowDeflection.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

// Ein synthetischer Pfeiler bei (c0=10, r0=10), aCells=1, rCells=4 (INFLUENCE_MULT=4),
// shapeFactor=1 (volle Wirkung) — isoliert die Formel von buildPierGeometry/Header-Kram.
const g = { c0: 10, r0: 10, aCells: 1, rCells: 4, shapeFactor: 1 };
const ambU = [{ ux: 1, uy: 0, speed: 1 }]; // Ambient strömt in +c-Richtung (Ost)

console.log('── Formel: Staupunkt + 2×-Speedup ──');
{
    // Raw = Ambient, isoliert die reine Deflection-Abweichung.
    const upstream = deflectVelocity(g.c0 - 1, g.r0, 1, 0, [g], ambU);
    const downstream = deflectVelocity(g.c0 + 1, g.r0, 1, 0, [g], ambU);
    assert(Math.hypot(upstream.vx, upstream.vy) < 1e-6, `Staupunkt upstream (θ=π): |v|=${Math.hypot(upstream.vx, upstream.vy).toFixed(4)} ≈ 0`);
    assert(Math.hypot(downstream.vx, downstream.vy) < 1e-6, `Staupunkt downstream (θ=0): |v|=${Math.hypot(downstream.vx, downstream.vy).toFixed(4)} ≈ 0`);

    const side1 = deflectVelocity(g.c0, g.r0 - 1, 1, 0, [g], ambU);
    const side2 = deflectVelocity(g.c0, g.r0 + 1, 1, 0, [g], ambU);
    const s1 = Math.hypot(side1.vx, side1.vy), s2 = Math.hypot(side2.vx, side2.vy);
    assert(Math.abs(s1 - 2) < 1e-6, `2×-Speedup bei θ=π/2 (eine Seite): |v|=${s1.toFixed(4)} ≈ 2.0`);
    assert(Math.abs(s2 - 2) < 1e-6, `2×-Speedup bei θ=π/2 (andere Seite): |v|=${s2.toFixed(4)} ≈ 2.0`);
}

console.log('── Glatter Blend am Einflussradius R ──');
{
    const atR = deflectVelocity(g.c0 + g.rCells, g.r0, 1, 0, [g], ambU);
    const beyondR = deflectVelocity(g.c0 + g.rCells + 0.5, g.r0, 1, 0, [g], ambU);
    assert(atR.vx === 1 && atR.vy === 0, `bei r=R exakt Rohwert (keine Deflection): vx=${atR.vx}`);
    assert(beyondR.vx === 1 && beyondR.vy === 0, `außerhalb R exakt Rohwert: vx=${beyondR.vx}`);

    const justInside = deflectVelocity(g.c0 + g.rCells - 0.01, g.r0, 1, 0, [g], ambU);
    const dev = Math.hypot(justInside.vx - 1, justInside.vy);
    assert(dev < 0.01, `knapp innerhalb R nur winzige Abweichung (kein Sprung): Δ=${dev.toFixed(5)}`);
}

console.log('── Additive Überlagerung bei zwei Pfeilern ──');
{
    const gB = { c0: 10, r0: 14, aCells: 1, rCells: 4, shapeFactor: 1 }; // überlappender 2. Pfeiler
    const ambPair = [ambU[0], ambU[0]];
    const qc = 10, qr = 12; // Punkt im Überlappungsbereich beider Einflusskreise
    const only1 = deflectVelocity(qc, qr, 1, 0, [g], ambU);
    const only2 = deflectVelocity(qc, qr, 1, 0, [gB], ambU);
    const both = deflectVelocity(qc, qr, 1, 0, [g, gB], ambPair);
    const expVx = 1 + (only1.vx - 1) + (only2.vx - 1);
    const expVy = (only1.vy) + (only2.vy);
    assert(Math.abs(both.vx - expVx) < 1e-9 && Math.abs(both.vy - expVy) < 1e-9,
        `Summe der Einzel-Abweichungen == kombiniertes Ergebnis (vx=${both.vx.toFixed(4)} == ${expVx.toFixed(4)})`);
    assert(Number.isFinite(both.vx) && Number.isFinite(both.vy), 'keine NaN/Infinity bei Überlappung');
}

console.log('── Kein Ambient verfügbar → Rohwert unverändert ──');
{
    const noAmb = deflectVelocity(g.c0, g.r0 - 1, 1.23, 4.56, [g], [null]);
    assert(noAmb.vx === 1.23 && noAmb.vy === 4.56, 'ohne Ambient: Rohwert exakt durchgereicht');
}

console.log('── Zero-Pier-Fastpath ──');
{
    const noop = deflectVelocity(5, 5, 3, -2, [], []);
    assert(noop.vx === 3 && noop.vy === -2, 'ohne Pfeiler: No-op, Rohwert unverändert');
}

console.log('── Shape-Factor-Monotonie ──');
{
    const speedAt = (shapeFactor) => {
        const gg = { ...g, shapeFactor };
        const d = deflectVelocity(g.c0, g.r0 - 1, 1, 0, [gg], ambU);
        return Math.hypot(d.vx, d.vy);
    };
    const eckig = speedAt(pierNoseShapeFactor('eckig'));
    const rund = speedAt(pierNoseShapeFactor('abgerundet'));
    const strom = speedAt(pierNoseShapeFactor('stromlinienfoermig'));
    assert(eckig > rund && rund > strom, `Abweichung sinkt eckig(${eckig.toFixed(3)}) > abgerundet(${rund.toFixed(3)}) > stromlinienförmig(${strom.toFixed(3)})`);
}

console.log('── sampleAmbientForPiers: bilineare Mittelung + Masken-Ausschluss ──');
{
    const ncols = 20, nrows = 20;
    const vx = new Float32Array(ncols * nrows).fill(2);
    const vy = new Float32Array(ncols * nrows).fill(0);
    const ring = [{ c: 8, r: 10 }, { c: 12, r: 10 }, { c: 10, r: 8 }, { c: 10, r: 12 }];
    const geoms = [{ c0: 10, r0: 10, aCells: 1, rCells: 4, shapeFactor: 1, ring }];

    const amb = sampleAmbientForPiers(geoms, vx, vy, ncols, nrows, null);
    assert(amb[0] !== null, 'Ambient gefunden (uniformes Feld)');
    assert(Math.abs(amb[0].ux - 2) < 1e-6 && Math.abs(amb[0].uy) < 1e-6 && Math.abs(amb[0].speed - 2) < 1e-6,
        `Ambient ≈ (2,0,speed=2) aus uniformem Feld: (${amb[0].ux.toFixed(3)},${amb[0].uy.toFixed(3)},${amb[0].speed.toFixed(3)})`);

    // Hälfte des Rings maskieren (< 128 = Hindernis) — Rest muss weiterhin (2,0) liefern.
    const mask = new Uint8Array(ncols * nrows).fill(255);
    mask[10 * ncols + 8] = 0; mask[10 * ncols + 12] = 0; // 2 der 4 Ringpunkte sperren
    const ambMasked = sampleAmbientForPiers(geoms, vx, vy, ncols, nrows, mask);
    assert(ambMasked[0] !== null && Math.abs(ambMasked[0].speed - 2) < 1e-6,
        `nach Teil-Maskierung weiterhin korrektes Ambient aus verbleibenden Ringpunkten (speed=${ambMasked[0].speed.toFixed(3)})`);

    const allMasked = new Uint8Array(ncols * nrows).fill(0);
    const ambNone = sampleAmbientForPiers(geoms, vx, vy, ncols, nrows, allMasked);
    assert(ambNone[0] === null, 'komplett maskierter Ring → kein Ambient (null)');
}

console.log('── buildPierGeometry: Integration über echte createLattice+addPier ──');
{
    const fp = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 4 }, { x: 0, y: 4 }]; // Spannweite entlang x, 20 m
    const lattice0 = createLattice(fp, { soffit: 2, deck: 3 });
    const PIER_W = 1.2; // m, deutlich über der Sichtbarkeits-Untergrenze bei cs=1 und cs=2
    const halfU = (PIER_W / 2) / 20;
    const lattice = addPier(lattice0, 0.5, halfU); // Pfeiler mittig bei x=10
    const bridge = { id: 'b', kind: 'mesh3d', lattice, pierNose: 'eckig' };

    const header1 = { ncols: 40, nrows: 40, cellsize: 1, xllcorner: 0, yllcorner: 0 };
    const header2 = { ncols: 20, nrows: 20, cellsize: 2, xllcorner: 0, yllcorner: 0 };

    const geoms1 = buildPierGeometry([bridge], header1);
    const geoms2 = buildPierGeometry([bridge], header2);
    assert(geoms1.length === 1 && geoms2.length === 1, `je 1 Pfeiler-Geometrie erkannt (cs=1: ${geoms1.length}, cs=2: ${geoms2.length})`);

    const expectedA1 = (PIER_W / 2) / 1; // = 0.6
    const expectedA2 = (PIER_W / 2) / 2; // = 0.3 → unter MIN_A_CELLS=0.5, Floor greift
    assert(Math.abs(geoms1[0].aCells - expectedA1) < 1e-6, `aCells bei cs=1 ≈ ${expectedA1} (${geoms1[0].aCells.toFixed(3)})`);
    assert(Math.abs(geoms2[0].aCells - 0.5) < 1e-6, `aCells bei cs=2 an MIN_A_CELLS=0.5 geklemmt (${geoms2[0].aCells.toFixed(3)}, roh wäre ${expectedA2})`);
    assert(geoms1[0].shapeFactor === pierNoseShapeFactor('eckig'), 'shapeFactor aus bridge.pierNose übernommen (eckig)');
    assert(geoms1[0].ring.length > 0, `Ambient-Ring nicht leer (${geoms1[0].ring.length} Punkte)`);
}

console.log(failures === 0 ? '\n✅ Alle Pfeiler-Deflection-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
