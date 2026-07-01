// Tests für BridgeMeshLattice (3D-Brückenkörper) + v8-Export-Integration
// Ausführen: node src/features/flood-2D/test/test_bridge3d_lattice.mjs (aus client/)
import {
    deriveFrame, createLattice, worldToUV, uvToWorld, sampleSheet,
    insertLoopCut, insertLoopCutV, loopCutBlocked, migrateBridgeShape, deriveDirection, rasterizeFootprint, latticeToCells,
    makeHeightSampler, insertPolyVertex, polyStationHits, insertPolyStation,
    footprintArea, footprintTerrainStats, sampleGridZ, frameCorners,
    addPier, removePierAt, uInPier, cellInPier, updatePier, pierIndexAt, movePierCorner, subdividePier,
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

console.log('── frameCorners (Single Source of Truth) ──');
{
    const lat = createLattice(rect, { soffit: 10, deck: 14 });
    const fc = frameCorners(lat);
    assert(fc.length === 4, 'frameCorners liefert 4 Ecken');
    // Frame deckt sich mit dem (rechteckigen) Footprint
    assert(near(fc[0].x, 0) && near(fc[0].y, 0), 'Ecke u0v0 = (0,0)');
    assert(near(fc[1].x, 40) && near(fc[1].y, 0), 'Ecke u1v0 = (40,0)');
    assert(near(fc[2].x, 40) && near(fc[2].y, 8), 'Ecke u1v1 = (40,8)');
    assert(near(fc[3].x, 0) && near(fc[3].y, 8), 'Ecke u0v1 = (0,8)');
    // latticeToCells nutzt den Frame, NICHT bridge.footprint (hier absichtlich Unsinn)
    const h = mkHeader(2, 50, 50);
    const viaFrame = latticeToCells({ lattice: lat, directionMode: 'AUTO' }, h, null);
    const ignoredFootprint = latticeToCells({ lattice: lat, footprint: [{ x: 999, y: 999 }], directionMode: 'AUTO' }, h, null);
    assert(viaFrame.length > 0 && viaFrame.length === ignoredFootprint.length, 'latticeToCells ignoriert bridge.footprint, nutzt Frame');
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

console.log('── insertLoopCutV (Quer-Ststation) + nicht-uniformes v ──');
{
    const lat = createLattice(rect, { soffit: 10, deck: 14 });
    assert(Array.isArray(lat.v) && lat.v.length === 2, 'createLattice: v=[0,1]');
    const cut = insertLoopCutV(lat, 0.5);
    assert(cut.nCross === 3 && cut.v.length === 3 && near(cut.v[1], 0.5), 'Quer-Cut: nCross 2→3, v bei 0.5');
    assert(cut.bottomZ.length === 3 && cut.bottomZ[1].length === 2, 'neue Reihe eingefügt (flach)');
    assert(near(cut.bottomZ[1][0], 10), 'interpolierte Reihe = 10 (flach)');
    assert(insertLoopCutV(cut, 0.505) === null, 'Quer-Cut zu nah → null');
    assert(lat.nCross === 2, 'Original unverändert');
    // nicht-uniformes v: Reihen 10/20/40 bei v=[0,0.25,1]; bei v=0.25 exakt 20
    const nu = { ...lat, nCross: 3, v: [0, 0.25, 1], bottomZ: [[10, 10], [20, 20], [40, 40]], topZ: [[14, 14], [14, 14], [14, 14]] };
    assert(near(sampleSheet(nu, nu.bottomZ, 0.5, 0.25), 20), 'sampleSheet ehrt nicht-uniformes v (v=0.25 → 20)');
    assert(near(sampleSheet(nu, nu.bottomZ, 0.5, 0.625), 30), 'sampleSheet interpoliert zwischen v=0.25 und 1 (→30)');
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
    // A.1: w = reale offene Breite pro Zelle (sub-grid). Volle Spalten = Zellweite,
    // Randspalten (Footprint-Kante bei x=2/x=18 halbiert die Zelle) < Zellweite.
    const ws = lines.map(l => +l.trim().split(/\s+/)[6]);
    assert(ws.every(w => w > 0 && w <= 1 + 1e-6), 'v8 mesh3d: w ≤ Zellweite, > 0');
    assert(ws.some(w => Math.abs(w - 1) < 1e-6), 'v8 mesh3d: volle Spalten = Zellweite');
    assert(ws.some(w => w < 0.99), 'v8 mesh3d: Randspalten sub-grid (w < Zellweite)');
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

console.log('── Pfeiler-Polygon: addPier/uInPier/removePierAt ──');
{
    const lat0 = createLattice(rect, { soffit: 10, deck: 14 });
    assert(Array.isArray(lat0.piers) && lat0.piers.length === 0, 'createLattice: piers initial leer');
    // Pfeiler bei u=0.5, halbe Breite 0.05 → Polygon-Rechteck [0.45..0.55] × [0..1]
    const lat = addPier(lat0, 0.5, 0.05);
    const p = lat.piers[0];
    assert(lat.piers.length === 1 && p.poly?.length === 4 && p.zTop === null, 'addPier setzt 4-Eck-Polygon, zTop=null');
    assert(near(p.poly[0].u, 0.45) && near(p.poly[1].u, 0.55), 'Polygon-Breite [0.45,0.55]');
    assert(lat0.piers.length === 0, 'Original-Lattice unverändert (immutable)');
    assert(uInPier(lat, 0.5) && uInPier(lat, 0.46) && !uInPier(lat, 0.2), 'uInPier trifft nur in der u-Spanne');
    // Sheets unberührt: Soffit/Deck bleiben konstant (Decke fällt NICHT)
    assert(near(sampleSheet(lat, lat.bottomZ, 0.5, 0.5), 10) && near(sampleSheet(lat, lat.topZ, 0.5, 0.5), 14), 'Pfeiler ändert Soffit/Deck nicht');
    // Klemmung an den Rändern
    const edge = addPier(lat0, 0.98, 0.05);
    assert(edge.piers[0].poly.every(c => c.u <= 1 + 1e-9 && c.u >= 0), 'addPier klemmt Polygon auf [0,1]');
    // Toggle: entfernen
    assert(removePierAt(lat, 0.5).piers.length === 0, 'removePierAt löscht den Pfeiler');
    assert(removePierAt(lat, 0.1).piers.length === 1, 'removePierAt außerhalb lässt Pfeiler stehen');
}

console.log('── Pfeiler-Polygon: cellInPier / movePierCorner / subdividePier / zTop ──');
{
    const lat0 = createLattice(rect, { soffit: 10, deck: 14 });
    const lat = addPier(lat0, 0.5, 0.05); // [0.45..0.55] × [0..1]
    assert(cellInPier(lat, 0.5, 0.2) && cellInPier(lat, 0.5, 0.9), 'Voll-Polygon deckt alle v');
    assert(!cellInPier(lat, 0.2, 0.5), 'außerhalb der u-Spanne → nicht im Pfeiler');
    assert(pierIndexAt(lat, 0.5, 0.5) === 0 && pierIndexAt(lat, 0.2, 0.5) === -1, 'pierIndexAt per Point-in-Polygon');
    // Ecke ziehen: Ecke 2 (u1,v1) nach (0.55, 0.4) → oberer Teil wird abgeschrägt
    const moved = movePierCorner(lat, 0, 2, 0.55, 0.4);
    assert(near(moved.piers[0].poly[2].u, 0.55) && near(moved.piers[0].poly[2].v, 0.4), 'movePierCorner verschiebt nur die Ecke');
    assert(!cellInPier(moved, 0.5, 0.9), 'abgeschrägte Ecke: oben jetzt frei');
    // Klemmung beim Ziehen über [0,1]
    const clamped = movePierCorner(lat, 0, 2, 1.5, -0.3);
    assert(clamped.piers[0].poly[2].u === 1 && clamped.piers[0].poly[2].v === 0, 'movePierCorner klemmt auf [0,1]');
    // Verfeinern: 4 → 8 Ecken (Mittelpunkte je Kante)
    const sub = subdividePier(lat, 0);
    assert(sub.piers[0].poly.length === 8, 'subdividePier: 4 → 8 Ecken');
    // zTop ändert die Export-Klassifikation NICHT (hydraulisch = u,v-Überdeckung)
    const latH = updatePier(lat, 0, { zTop: 11.5 });
    assert(cellInPier(latH, 0.5, 0.5) && latH.piers[0].zTop === 11.5, 'zTop gesetzt, Sperrung bleibt (u,v)');
}

console.log('── Pfeiler: pier-Flag in latticeToCells + Orifice-Ausschluss ──');
{
    const gen = new InputGenerator();
    const fp = [{ x: 2, y: 2 }, { x: 38, y: 2 }, { x: 38, y: 6 }, { x: 2, y: 6 }];
    const lat0 = createLattice(fp, { soffit: 10, deck: 14 });
    // Pfeiler in der Mitte der Spannweite (u≈0.5 → x≈20), Band ±0.04
    const lat = addPier(lat0, 0.5, 0.04);
    const h = mkHeader(1, 60, 60);
    const bridge = { id: 'pier-2', kind: 'mesh3d', footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };

    // pier-Flag rein geometrisch (kein Terrain nötig)
    const cells = latticeToCells(bridge, h, null);
    const piers = cells.filter(c => c.pier);
    assert(piers.length > 0, `Pfeilerzellen über das Band erkannt (${piers.length})`);
    assert(piers.every(c => Math.abs(c.x - 20) < 3), 'Pfeilerzellen liegen am Bandzentrum (x≈20)');
    assert(cells.filter(c => c.x <= 4 || c.x >= 36).every(c => !c.pier), 'Randzellen sind offen');
    // Ohne piers → nie pier
    const noPier = { ...bridge, lattice: lat0 };
    assert(latticeToCells(noPier, h, null).every(c => c.pier === false), 'ohne piers → pier=false');

    // collectBridgePierCells (geometrisch, kein Terrain)
    const pierKeys = gen.collectBridgePierCells([bridge], h);
    assert(pierKeys.size === piers.length, `collectBridgePierCells = ${pierKeys.size} Pfeilerzellen`);
    assert(gen.collectBridgePierCells([noPier], h).size === 0, 'ohne piers → leer');
    assert(gen.collectBridgePierCells([{ id: 'l', axis: [{ x: 0, y: 0 }], cells: [] }], h).size === 0, 'Nicht-mesh3d ignoriert');

    // Orifice-Export: Pfeilerzellen liefern keine <dir>B-Zeile
    const out = gen.generateWeirFile([], [bridge], h, { engine: 'v8' });
    const lines = out.trim().split('\n').slice(1);
    const emittedXY = new Set(lines.map(l => { const p = l.trim().split(/\s+/); return `${Math.round(+p[0])},${Math.round(+p[1])}`; }));
    assert([...pierKeys].every(k => !emittedXY.has(k)), 'keine Orifice-Zeile auf einer Pfeilerzelle');
    // Ohne SGC kollabiert die Brücke geometrisch auf 1 Zelle/Spannposition (Floodplain).
    const colsP = lines.map(l => Math.round(+l.trim().split(/\s+/)[0]));
    assert(new Set(colsP).size === colsP.length, 'ohne SGC: geometrisch kollabiert (1 Zeile je Spalte)');
    const pierColsP = new Set([...pierKeys].map(k => +k.split(',')[0]));
    assert([...pierColsP].every(c => !new Set(colsP).has(c)), 'Pfeilerspalten ohne Orifice');
}

console.log('── Collapse: mesh3d über SGC auf 1 Zellreihe je Spannposition ──');
{
    const gen = new InputGenerator();
    // O-W-Brücke (direction 'S'), 7 Reihen tief in Fließrichtung (rows 10..16)
    const fp = [{ x: 1.5, y: 9.5 }, { x: 38.5, y: 9.5 }, { x: 38.5, y: 16.5 }, { x: 1.5, y: 16.5 }];
    const lat0 = createLattice(fp, { soffit: 12, deck: 14 });
    // Querneigung: v=0 → 12.0, v=1 → 12.6 (min-Soffit-Auswahl prüfbar)
    const lat = { ...lat0, bottomZ: [[12.0, 12.0], [12.6, 12.6]] };
    const h = mkHeader(1, 60, 60);
    const bridge = { id: 'collapse-1', kind: 'mesh3d', footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };

    // N-S-Gerinneband: SGC>0 nur in den Spalten 5..35 (über allen Reihen)
    const sgc = new Float32Array(60 * 60);
    for (let r = 0; r < 60; r++) for (let c = 5; c <= 35; c++) sgc[r * 60 + c] = 50;

    const allCells = latticeToCells(bridge, h, null);
    assert(allCells.length > 31, `ungeklappte Brücke ist mehrreihig (${allCells.length} Zellen)`);

    // Ohne SGC: geometrischer Collapse auf 1 Zelle/Spannposition (Floodplain-Brücke).
    const outNoSgc = gen.generateWeirFile([], [bridge], h, { engine: 'v8' });
    const noSgcCols = outNoSgc.trim().split('\n').slice(1).map(l => Math.round(+l.trim().split(/\s+/)[0]));
    assert(noSgcCols.length < allCells.length && new Set(noSgcCols).size === noSgcCols.length, 'ohne SGC: kollabiert auf 1 Zeile je Spalte');

    // Mit SGC: genau eine Orifice-Zelle je Gerinnespalte (5..35 = 31 Spalten)
    const out = gen.generateWeirFile([], [bridge], h, { engine: 'v8', sgcWidthGrid: sgc });
    const lines = out.trim().split('\n').slice(1);
    const cols = lines.map(l => Math.round(+l.trim().split(/\s+/)[0]));
    const uniqCols = new Set(cols);
    assert(lines.length === 31, `mit SGC: 31 Orifice-Zeilen (eine je Gerinnespalte), got ${lines.length}`);
    assert(uniqCols.size === lines.length, 'genau eine Zeile je Spalte (keine Stapel in Fließrichtung)');
    assert([...uniqCols].every(c => c >= 5 && c <= 35), 'nur Spalten über dem Gerinne (Ufer-Spalten verworfen)');
    assert(lines.every(l => / SB /.test(l)), 'alle kollabierten Zeilen mit SB-Tag');
    // restriktivste (niedrigste) Soffitte gewählt: untere Querreihe (~12.0),
    // nicht die obere (~12.6). Footprint-Ränder liegen bei v≈0.07, daher ~12.04.
    const hcs = lines.map(l => +l.trim().split(/\s+/)[4]);
    assert(hcs.every(hc => hc < 12.3), 'min-Soffitte je Spannposition gewählt (untere Querreihe ~12.0, nicht obere ~12.6)');
}

console.log('── Collapse + Pfeiler: Pfeilerband liefert kein Orifice ──');
{
    const gen = new InputGenerator();
    const fp = [{ x: 1.5, y: 9.5 }, { x: 38.5, y: 9.5 }, { x: 38.5, y: 16.5 }, { x: 1.5, y: 16.5 }];
    const lat0 = createLattice(fp, { soffit: 12, deck: 14 });
    // Spannweite O-W ≈ 37 m; Pfeiler-Band so legen, dass es die Spalten ~10..12 trifft.
    // x≈11 → u≈(11−1.5)/37 ≈ 0.257; Band ±1.5 m / 37 ≈ ±0.04
    const lat = addPier({ ...lat0, bottomZ: [[12, 12], [12, 12]] }, 0.257, 0.04);
    const h = mkHeader(1, 60, 60);
    const bridge = { id: 'collapse-2', kind: 'mesh3d', footprint: fp, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };
    const sgc = new Float32Array(60 * 60);
    for (let r = 0; r < 60; r++) for (let c = 5; c <= 35; c++) sgc[r * 60 + c] = 50;

    // Pfeilerspalten geometrisch bestimmen
    const pierCols = new Set(latticeToCells(bridge, h, null).filter(c => c.pier).map(c => c.col));
    assert(pierCols.size >= 1, `Pfeiler überdeckt ${pierCols.size} Spalte(n)`);

    const out = gen.generateWeirFile([], [bridge], h, { engine: 'v8', sgcWidthGrid: sgc });
    const cols = new Set(out.trim().split('\n').slice(1).map(l => Math.round(+l.trim().split(/\s+/)[0])));
    assert([...pierCols].every(c => !cols.has(c)), 'Pfeilerspalten liefern kein Orifice');
    assert(cols.has(5) && cols.has(35), 'offene Gerinnespalten weiterhin als Orifice vorhanden');
    assert(cols.size === 31 - pierCols.size, `31 Gerinnespalten − ${pierCols.size} Pfeilerspalten = ${31 - pierCols.size} (got ${cols.size})`);
}

// ── Polygon-Pipeline: Bogen → Solver, Loop-Cut-Mindestabstand, Migration ─────
{
    const poly = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]; // spanLen 20
    let lat = createLattice(poly, { soffit: 2, deck: 5 });
    lat = insertLoopCut(lat, 0.5, 0);                  // u = [0, 0.5, 1]
    for (let i = 0; i < lat.nCross; i++) lat.bottomZ[i][1] = 4; // Bogen: Soffitte in Spannmitte angehoben
    const bridge = { kind: 'mesh3d', poly, lattice: lat, directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };
    const header = mkHeader(1, 21, 11);

    // (1) Bogen kommt per-Zelle in den Solver: Soffitte variiert entlang der Spannweite
    const soffits = latticeToCells(bridge, header, null).map(c => c.soffit);
    assert(Math.max(...soffits) - Math.min(...soffits) > 1.0, 'Bogen → Solver: cell.soffit variiert (≠ flach)');

    // (2) Loop-Cut-Mindestabstand = Zellweite: 0.6 m (< 1 m) wird abgelehnt, 10 m erlaubt
    assert(insertLoopCut(lat, 0.03, 1.0) === null, 'Loop-Cut feiner als Zellweite → abgelehnt');
    assert(loopCutBlocked(lat, 0.03, 'u', 1.0) === true, 'loopCutBlocked: Sub-Zellweite = true');
    assert(insertLoopCut(lat, 0.25, 1.0) !== null, 'Loop-Cut ≥ Zellweite Abstand → erlaubt');

    // (3) Migration: LINE-Brücke (axis+width) → Polygon-mesh3d mit Zellen
    const mig = migrateBridgeShape({ id: 'm', kind: 'line', axis: [{ x: 0, y: 0 }, { x: 20, y: 0 }], width: 6, soffit: 3, deck: 4 });
    assert(mig.kind === 'mesh3d' && mig.poly?.length === 4 && !!mig.lattice, 'Migration LINE → mesh3d-Polygon');
    assert(latticeToCells(mig, mkHeader(1, 30, 20), null).length > 0, 'migrierte Brücke liefert Solver-Zellen');
}

// ── Per-Ecke-Höhenmodell: Sampler, Zellen folgen Eck-Höhen, Stützpunkt einfügen ──
{
    // Sampler: Dreieck, Höhen [0,0,9] → exakt an Ecken + lineare Kippung
    const tri = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 18 }];
    const s = makeHeightSampler(tri, [0, 0, 9]);
    assert(near(s.at(10, 18), 9) && near(s.at(0, 0), 0), 'Sampler exakt an den Ecken');
    assert(near(s.at(10, 9), 4.5, 0.02), 'Sampler lineare Kippung (Mitte = halbe Höhe)');

    // Mean-Value-Koordinaten: EINE Ecke beeinflusst die GANZE Fläche glatt (kein
    // Triangulierungs-Knick). Quadrat, nur Ecke 0 angehoben → ein Punkt nahe der
    // GEGENÜBERLIEGENDEN Ecke 2 muss messbar mitkommen (bei Ear-Clipping wäre er 0).
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const sq0 = makeHeightSampler(sq, [0, 0, 0, 0]);
    const sqR = makeHeightSampler(sq, [10, 0, 0, 0]); // nur Ecke 0 hoch
    const farFlat = sq0.at(8, 8), farRaised = sqR.at(8, 8); // nahe Ecke 2 (gegenüber)
    assert(farRaised - farFlat > 0.05, `Ecke beeinflusst ganze Fläche (fern: ${farFlat.toFixed(2)}→${farRaised.toFixed(2)})`);
    // Monoton glatt: näher an Ecke 0 = höher als ferner Punkt (kein Diagonal-Sprung)
    assert(sqR.at(2, 2) > sqR.at(8, 8) + 0.5, 'Sampler glatt monoton zur angehobenen Ecke');

    // latticeToCells folgt einer angehobenen Ecke (Gradient), flach = konstant
    const quad = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
    const lat = createLattice(quad, { soffit: 3, deck: 6 });
    const h = mkHeader(1, 21, 11);
    const tilted = { kind: 'mesh3d', poly: quad, lattice: lat, vsoffit: [3, 3, 3, 3], vdeck: [6, 6, 9, 6], directionMode: 'AUTO', Cd: 0.8, Tz: 1.5 };
    const cells = latticeToCells(tilted, h, null);
    const a = cells.find(c => c.x >= 18 && c.y >= 8), b = cells.find(c => c.x <= 2 && c.y <= 2);
    assert(a.deck > b.deck + 2, `Zellen folgen angehobener Ecke (Deck@Ecke=${a.deck.toFixed(2)} > @Basis=${b.deck.toFixed(2)})`);

    // Stützpunkt auf einer Kante → neue Ecke, Höhen interpoliert
    const flat = { poly: quad, vsoffit: [2, 2, 2, 2], vdeck: [6, 6, 6, 6] };
    const ins = insertPolyVertex(flat, 10, -0.3);
    assert(ins.poly.length === 5 && near(ins.poly[1].x, 10) && near(ins.poly[1].y, 0), 'Stützpunkt auf Kante projiziert');
    assert(ins.vsoffit.length === 5 && ins.vdeck.length === 5 && ins.vdeck[1] === 6, 'Stützpunkt-Höhen interpoliert');

    // Längs-Station (axis 'u') quer durch → 2 Rand-Schnittpunkte einfügen (Bogen-Basis)
    const stBridge = { poly: quad, lattice: lat, vsoffit: [3, 3, 3, 3], vdeck: [6, 6, 6, 6] };
    const hits = polyStationHits(quad, lat, 'u', 0.5);
    assert(hits && hits.length === 2, 'Station liefert 2 Rand-Schnittpunkte');
    const ys = hits.map(p => p.y).sort((a2, b2) => a2 - b2);
    assert(near(ys[0], 0) && near(ys[1], 10), 'Station-Punkte auf gegenüberliegenden Kanten (y=0 & y=10)');
    const st = insertPolyStation(stBridge, 'u', 0.5);
    assert(st && st.poly.length === 6 && st.newIndices.length === 2, 'insertPolyStation: 2 neue Ecken + Indizes');

    // Irreguläres Polygon (Dreieck): Station trifft trotzdem den ECHTEN Rand → 2 Punkte
    const triPoly = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 16 }];
    const triLat = createLattice(triPoly, { soffit: 3, deck: 6 });
    const triSt = insertPolyStation({ poly: triPoly, lattice: triLat, vsoffit: [3, 3, 3], vdeck: [6, 6, 6] }, 'u', 0.35);
    assert(triSt && triSt.newIndices.length === 2 && triSt.poly.length === 5, 'Station auf irregulärem Polygon (Dreieck) → 2 Punkte');
}

console.log(failures === 0 ? '\n✅ Alle Bridge3D-Lattice-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
