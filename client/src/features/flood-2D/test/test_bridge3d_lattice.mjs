// Tests für BridgeMeshLattice (3D-Brückenkörper) + v8-Export-Integration
// Ausführen: node src/features/flood-2D/test/test_bridge3d_lattice.mjs (aus client/)
import {
    deriveFrame, createLattice, worldToUV, uvToWorld, sampleSheet,
    insertLoopCut, deriveDirection, rasterizeFootprint, latticeToCells,
    footprintArea, footprintTerrainStats, sampleGridZ,
} from '../utils/BridgeMeshLattice.js';
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const mkHeader = (cs, ncols = 100, nrows = 100) => ({
    ncols, nrows, cellsize: cs,
    xllcorner: -cs / 2, yllcorner: -cs / 2, xll: 0, yll: 0
});

// 40×8-Rechteck, Spannachse O-W
const rect = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 8 }, { x: 0, y: 8 }];

console.log('── deriveFrame ──');
{
    const f = deriveFrame(rect);
    assert(near(Math.abs(f.spanDir.x), 1) && near(f.spanDir.y, 0), 'spanDir entlang der langen Kante (O-W)');
    assert(near(f.spanLen, 40), `spanLen ≈ 40 (got ${f.spanLen})`);
    assert(near(f.crossLen, 8), `crossLen ≈ 8 (got ${f.crossLen})`);
    // worldToUV/uvToWorld Roundtrip
    const { u, v } = worldToUV({ ...f }, 20, 4);
    assert(near(u, 0.5) && near(v, 0.5), `Mitte → (u,v)=(0.5,0.5) (got ${u},${v})`);
    const w = uvToWorld({ ...f }, u, v);
    assert(near(w.x, 20) && near(w.y, 4), 'uvToWorld Roundtrip');
    assert(near(Math.abs(footprintArea(rect)), 320), 'Shoelace-Fläche = 320');
    assert(near(footprintArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]), 0), 'kollinearer Ring → Fläche 0');
}

console.log('── sampleSheet (bilinear, Bogen) ──');
{
    const lat = createLattice(rect, { soffit: 10, deck: 14 });
    assert(lat.nSpan === 2 && lat.nCross === 2, 'createLattice: 2×2');
    assert(near(sampleSheet(lat, lat.bottomZ, 0.37, 0.8), 10), 'flaches Sheet überall konstant');

    // 3-Stationen-Bogen: u=[0,0.5,1], bottomZ [10,12,10]
    const arch = {
        ...lat, nSpan: 3, u: [0, 0.5, 1],
        bottomZ: [[10, 12, 10], [10, 12, 10]],
        topZ: [[14, 14, 14], [14, 14, 14]],
    };
    assert(near(sampleSheet(arch, arch.bottomZ, 0.25, 0.5), 11), `Bogen: sample(0.25) = 11 (got ${sampleSheet(arch, arch.bottomZ, 0.25, 0.5)})`);
    assert(near(sampleSheet(arch, arch.bottomZ, 0.5, 0), 12), 'Bogen: Scheitel = 12');
    assert(near(sampleSheet(arch, arch.bottomZ, 1, 1), 10), 'Bogen: Ende = 10');
    // v-Interpolation: schiefe Querneigung
    const skew = { ...lat, bottomZ: [[10, 10], [12, 12]] };
    assert(near(sampleSheet(skew, skew.bottomZ, 0.5, 0.25), 10.5), 'v-Interpolation (Querneigung)');
}

console.log('── insertLoopCut ──');
{
    const lat = createLattice(rect, { soffit: 10, deck: 14 });
    const cut = insertLoopCut(lat, 0.5);
    assert(cut.nSpan === 3 && cut.u.length === 3, 'Loop Cut: nSpan 2→3');
    assert(cut.u[0] < cut.u[1] && cut.u[1] < cut.u[2], 'u sortiert');
    assert(near(cut.u[1], 0.5), 'Cut bei u=0.5');
    assert(near(cut.bottomZ[0][1], 10) && near(cut.topZ[1][1], 14), 'Z interpoliert');
    assert(insertLoopCut(cut, 0.505) === null, 'Cut auf bestehender Station (eps 0.02) abgelehnt');
    assert(lat.nSpan === 2, 'Original-Lattice unverändert (deep clone)');
    // Cut im interpolierten Bogen
    const arch = { ...cut, bottomZ: [[10, 12, 10], [10, 12, 10]] };
    const cut2 = insertLoopCut(arch, 0.25);
    assert(near(cut2.bottomZ[0][1], 11), `Bogen-Cut bei 0.25 → z=11 (got ${cut2.bottomZ[0][1]})`);
}

console.log('── deriveDirection ──');
{
    const ew = createLattice(rect, { soffit: 10, deck: 14 });
    const nsRect = rect.map(p => ({ x: p.y, y: p.x })); // 90° gedreht
    const ns = createLattice(nsRect, { soffit: 10, deck: 14 });
    assert(deriveDirection(ew, 'AUTO') === 'S', 'O-W-Spannweite → S (blockt N-S-Fluss)');
    assert(deriveDirection(ns, 'AUTO') === 'E', 'N-S-Spannweite → E (blockt O-W-Fluss)');
    assert(deriveDirection(ns, 'NS') === 'S' && deriveDirection(ew, 'EW') === 'E', 'Override greift');
}

console.log('── rasterizeFootprint ──');
{
    const small = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 0, y: 4 }];
    const c1 = rasterizeFootprint(small, mkHeader(1));
    const c5 = rasterizeFootprint(small, mkHeader(5));
    // @1m: Zentren bei x∈{0..10}? Ränder liegen AUF Zellzentren → PiP-Randverhalten;
    // robust: innere Zentren x∈[1..9], y∈[1..3] = 27 sicher enthalten
    assert(c1.length >= 27 && c1.length <= 11 * 5, `@1m plausible Zellzahl (got ${c1.length})`);
    assert(c1.every(c => c.x >= 0 && c.x <= 10 && c.y >= 0 && c.y <= 4), '@1m alle Zentren in der BBox');
    assert(c5.length >= 1, `@5m mindestens 1 Zelle (got ${c5.length})`);
    assert(c5.every(c => c.x % 5 === 0 && c.y % 5 === 0), '@5m Zentren auf dem Raster');
    assert(rasterizeFootprint(small.map(p => ({ x: p.x + 5000, y: p.y })), mkHeader(1)).length === 0, 'Footprint außerhalb Grid → 0 Zellen');
}

console.log('── latticeToCells ──');
{
    const fp = [{ x: 2, y: 2 }, { x: 38, y: 2 }, { x: 38, y: 6 }, { x: 2, y: 6 }];
    const lat0 = createLattice(fp, { soffit: 10, deck: 14 });
    const lat = { ...insertLoopCut(lat0, 0.5), bottomZ: [[10, 12, 10], [10, 12, 10]] };
    const h = mkHeader(2, 50, 50);
    const gridData = new Float32Array(50 * 50).fill(5); // flaches Terrain z=5
    const bridge = { footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };
    const cells = latticeToCells(bridge, h, gridData);

    assert(cells.length > 0, `Zellen erzeugt (got ${cells.length})`);
    assert(cells.every(c => c.direction === 'S'), 'O-W-Spannweite → alle S');
    assert(cells.every(c => c.width === 2 && c.Cd === 0.8 && c.Tz === 1.5), 'width=cellsize, Cd/Tz durchgereicht');
    assert(cells.every(c => c.z === 5 && c.z_sohle === 5), 'Terrain-z aus gridData');
    // Bogenprofil: soffit am Scheitel (u≈0.5 → x≈20) höher als an den Enden
    const atApex = cells.filter(c => Math.abs(c.x - 20) <= 1);
    const atEnd = cells.filter(c => c.x <= 4);
    const maxApex = Math.max(...atApex.map(c => c.soffit));
    const maxEnd = Math.max(...atEnd.map(c => c.soffit));
    assert(maxApex > maxEnd + 1, `per-Zelle-soffit folgt Bogen (Scheitel ${maxApex.toFixed(2)} > Ende ${maxEnd.toFixed(2)})`);
    assert(cells.every(c => c.deck === 14), 'Deck konstant');

    // gridData = null (Export-Pfad) → kein z, aber soffit/deck vorhanden
    const noZ = latticeToCells(bridge, h, null);
    assert(noZ.length === cells.length && noZ.every(c => c.z === undefined && Number.isFinite(c.soffit)), 'gridData=null toleriert');

    const stats = footprintTerrainStats(fp, h, gridData);
    assert(stats && near(stats.meanZ, 5), 'footprintTerrainStats: meanZ = 5');
}

console.log('── sampleGridZ (Rasterlot) ──');
{
    const h = mkHeader(2, 10, 10);
    const data = new Float32Array(100);
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) data[r * 10 + c] = r; // Höhe = row
    assert(sampleGridZ(h, data, 0, 0) === 0, 'Zelle (0,0) → z=0');
    assert(sampleGridZ(h, data, 4.4, 8.6) === 4, 'Rundung auf nächstes Zellzentrum (row 4 bei y=8.6, cs=2)');
    assert(sampleGridZ(h, data, 100, 0) === null, 'außerhalb → null');
    data[0] = -9999;
    assert(sampleGridZ(h, data, 0, 0) === null, 'NoData → null');
    assert(sampleGridZ(h, null, 0, 0) === null, 'gridData=null toleriert');
}

console.log('── generateWeirFile v8: mesh3d-Branch ──');
{
    const gen = new InputGenerator();
    const fp = [{ x: 2, y: 2 }, { x: 18, y: 2 }, { x: 18, y: 6 }, { x: 2, y: 6 }];
    const lat0 = createLattice(fp, { soffit: 12, deck: 14 });
    const lat = { ...insertLoopCut(lat0, 0.5), bottomZ: [[12, 13.5, 12], [12, 13.5, 12]] };
    const meshBridge = {
        id: 'b3d-test', kind: 'mesh3d', footprint: fp, lattice: lat,
        directionMode: 'AUTO', Cd: 0.8, Tz: 1.5,
        z_sohle: 5, soffit: 12, deck: 14, width: 4,
        cells: latticeToCells({ footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 }, mkHeader(2, 50, 50), null),
    };
    const h1 = mkHeader(1, 100, 100);
    const out = gen.generateWeirFile([], [meshBridge], h1, { engine: 'v8' });
    const lines = out.trim().split('\n').slice(1);
    assert(lines.length > 0, `v8 mesh3d: ${lines.length} Zeilen erzeugt`);
    assert(lines.every(l => / SB /.test(l)), 'v8 mesh3d: alle Zeilen mit SB-Tag (O-W-Spannweite)');
    assert(lines.every(l => l.trim().endsWith('1.0000')), 'v8 mesh3d: w = Export-Zellweite');
    // hc variiert über die Spannweite (Bogen): mehrere unterschiedliche hc-Werte
    const hcs = new Set(lines.map(l => l.trim().split(/\s+/)[4]));
    assert(hcs.size > 3, `v8 mesh3d: hc variiert per Zelle (${hcs.size} distinct)`);
    const hcVals = [...hcs].map(Number);
    assert(Math.min(...hcVals) >= 12 - 1e-6 && Math.max(...hcVals) <= 13.5 + 1e-6, 'hc im Bereich [12, 13.5]');

    // Regression: v5 mit mesh3d nutzt precomputed cells (per-Zelle-soffit)
    const outV5 = gen.generateWeirFile([], [meshBridge]);
    const v5lines = outV5.trim().split('\n').slice(1);
    assert(v5lines.length === meshBridge.cells.length * 2, 'v5 mesh3d: 2 Zeilen pro precomputed Zelle');
    assert(!outV5.includes('SB'), 'v5: keine Brücken-Tags');

    // Regression: Legacy-Linienbrücke v8 unverändert (axis-Pfad)
    const legacy = {
        id: 'br-legacy', axis: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
        z_sohle: 10, soffit: 12.5, deck: 13.5, width: 8, Cd: 1.2, Tz: 1.5,
        cells: [{ x: 0, y: 0, z: 10, direction: 'S' }],
    };
    const outLegacy = gen.generateWeirFile([], [legacy], h1, { engine: 'v8' });
    const legacyLines = outLegacy.trim().split('\n');
    assert(legacyLines[0] === '21', `v8 Legacy-Brücke: weiterhin 21 Zellen (got ${legacyLines[0]})`);
}

console.log(failures === 0 ? '\n✅ Alle Bridge3D-Lattice-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
