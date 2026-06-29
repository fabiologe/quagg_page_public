// Tests für weirGeometry (Polylinien-Diskretisierung)
// Ausführen: node src/features/flood-2D/test/test_weir_polyline.mjs (aus client/)
import {
    getLineCells, stepFace, worldToCell, cellToWorld, discretizeWeirPolyline,
    openingWidth, openingSoffit, openingSection, clampOpening,
} from '../utils/weirGeometry.js';
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const header = { ncols: 50, nrows: 50, cellsize: 1, xll: 0, yll: 0 };

console.log('── getLineCells (4-connected) ──');
{
    const horiz = getLineCells(0, 0, 4, 0);
    assert(horiz.length === 5 && horiz.every(c => c.row === 0), 'horizontale Linie: 5 Zellen, row 0');
    const diag = getLineCells(0, 0, 3, 3);
    // 4-connected → keine diagonalen Sprünge: jeder Schritt ändert nur col ODER row
    let ok = true;
    for (let i = 1; i < diag.length; i++) {
        const d = Math.abs(diag[i].col - diag[i - 1].col) + Math.abs(diag[i].row - diag[i - 1].row);
        if (d !== 1) ok = false;
    }
    assert(ok, 'diagonale Linie ist 4-connected (Treppe, kein Lochsprung)');
}

console.log('── worldToCell / cellToWorld Roundtrip ──');
{
    const c = worldToCell(header, 12, 7);
    assert(c.col === 12 && c.row === 7, 'worldToCell (Zellzentren, row 0 = Süd)');
    const w = cellToWorld(header, 12, 7);
    assert(near(w.x, 12) && near(w.y, 7), 'cellToWorld Roundtrip');
}

console.log('── discretizeWeirPolyline ──');
{
    // gerade O-W-Linie (row wechselt nicht) → alle 'S'
    const straight = discretizeWeirPolyline([{ x: 2, y: 10 }, { x: 8, y: 10 }], header);
    assert(straight.length === 7, `gerade Linie: 7 Zellen (got ${straight.length})`);
    assert(straight.every(c => c.direction === 'S'), 'O-W-Linie: alle S');
    assert(straight.every(c => c.row === 10), 'alle auf row 10');

    // L-Polylinie: horizontal dann vertikal → Eckzelle hat BEIDE Flächen
    const bend = discretizeWeirPolyline([{ x: 2, y: 10 }, { x: 6, y: 10 }, { x: 6, y: 14 }], header);
    const cornerCells = bend.filter(c => c.col === 6 && c.row === 10);
    assert(cornerCells.length === 2, `Eckzelle (6,10) hat 2 Flächen (L-Form), got ${cornerCells.length}`);
    const dirs = new Set(cornerCells.map(c => c.direction));
    assert(dirs.has('S') && dirs.has('E'), 'Eckzelle: S + E (lückenlose Barriere)');
    // vertikaler Ast wechselt die Reihe → 'E'
    assert(bend.filter(c => c.col === 6 && c.row > 10).every(c => c.direction === 'E'), 'vertikaler Ast: E');

    // z aus gridData (Höhe = row)
    const gd = new Float32Array(50 * 50);
    for (let r = 0; r < 50; r++) for (let c = 0; c < 50; c++) gd[r * 50 + c] = r;
    const withZ = discretizeWeirPolyline([{ x: 2, y: 10 }, { x: 8, y: 10 }], header, gd);
    assert(withZ.every(c => c.z === 10), 'z aus gridData (row 10 → z=10)');

    // außerhalb des Rasters → verworfen
    const out = discretizeWeirPolyline([{ x: 200, y: 200 }, { x: 210, y: 200 }], header);
    assert(out.length === 0, 'Polylinie außerhalb → 0 Zellen');

    // < 2 Punkte → leer
    assert(discretizeWeirPolyline([{ x: 1, y: 1 }], header).length === 0, '1 Punkt → leer');
}

console.log('── per-Zelle-hc aus z-Profil + Öffnungen ──');
{
    // geneigte Krone: links z=10, rechts z=16 über 6 m
    const pts = [{ x: 2, y: 10, z: 10 }, { x: 8, y: 10, z: 16 }];
    const c = discretizeWeirPolyline(pts, header);
    assert(c.every(x => Number.isFinite(x.hc)), 'alle Zellen haben interpoliertes hc');
    const at = (x) => c.find(k => Math.abs(k.x - x) < 0.01);
    assert(near(at(2).hc, 10) && near(at(8).hc, 16), 'Enden: hc = 10 / 16');
    assert(near(at(5).hc, 13, 0.5), `Mitte (x=5) ≈ 13 (got ${at(5)?.hc})`);
    // ohne z → kein hc (Fallback line.hc im Export)
    assert(discretizeWeirPolyline([{ x: 2, y: 10 }, { x: 8, y: 10 }], header).every(x => x.hc === undefined), 'ohne z → kein per-Zelle-hc');
    // Öffnung bei (5,10), soffit 11.5 → diese Zelle wird Orifice
    const withOpen = discretizeWeirPolyline(pts, header, null, { openings: [{ x: 5, y: 10, soffit: 11.5 }] });
    const orif = withOpen.filter(x => x.orifice);
    assert(orif.length >= 1 && orif.every(x => x.orifice.soffit === 11.5), 'Öffnungszelle(n) tragen orifice.soffit=11.5');
    assert(withOpen.filter(x => Math.abs(x.x - 5) < 0.01).every(x => x.orifice), 'Zelle (5,10) ist Orifice');
    assert(!at(2).orifice && discretizeWeirPolyline(pts, header).find(k => Math.abs(k.x - 2) < 0.01).hc != null, 'Zellen fern der Öffnung sind normale Wehr-Zellen');
}

console.log('── Öffnungstypen: width/soffit/section + clamp ──');
{
    // rund: width = Durchmesser, soffit = Oberkante
    const round = { x: 5, y: 10, type: 'round', soffit: 12, width: 2 };
    assert(openingWidth(round) === 2 && openingSoffit(round) === 12, 'round: width/soffit');
    assert(openingSection(round).length === 16, 'round: 16-Punkt-Kreis-Section');
    // rechteckig: section = 4 Ecken, Höhe respektiert
    const rect = { x: 5, y: 10, type: 'rect', soffit: 12, width: 3, height: 2 };
    const rs = openingSection(rect);
    assert(rs.length === 4 && Math.max(...rs.map(p => p.z)) === 12 && Math.min(...rs.map(p => p.z)) === 10, 'rect: section 4 Ecken, z∈[10,12]');
    assert(openingWidth(rect) === 3, 'rect: width = 3');
    // poly: width/soffit aus bbox
    const poly = { x: 5, y: 10, type: 'poly', points: [{ s: -1.5, z: 10 }, { s: 1.5, z: 10 }, { s: 0, z: 13 }] };
    assert(openingWidth(poly) === 3 && openingSoffit(poly) === 13, 'poly: width=3, soffit=13 (bbox)');
    // clamp: Soffit über Krone → auf Krone; Unterkante unter Gelände → Höhe gekappt; Breite → Linienlänge
    const c = clampOpening({ type: 'rect', soffit: 99, width: 999, height: 999 }, 12.0, 8.0, 4);
    assert(c.soffit === 12.0, 'clamp: Soffit ≤ Krone (12)');
    assert(Math.abs(c.height - (12 - 8)) < 1e-9, 'clamp: Höhe ≤ Soffit−Gelände (4)');
    assert(c.width === 8, 'clamp: Breite ≤ 2·maxHalfWidth (8)');
    const cp = clampOpening({ type: 'poly', soffit: 13, points: [{ s: -9, z: 99 }, { s: 9, z: -5 }, { s: 0, z: 13 }] }, 12, 8, 4);
    assert(cp.points.every(p => p.s >= -4 && p.s <= 4 && p.z >= 8 && p.z <= 12), 'clamp poly: s∈[-4,4], z∈[8,12]');

    // Discretize ehrt Öffnungs-Soffit/-breite (rect 4 m → mehrere Zellen)
    const h = { ncols: 60, nrows: 60, cellsize: 1, xll: 0, yll: 0 };
    const cells = discretizeWeirPolyline([{ x: 2, y: 20 }, { x: 18, y: 20 }], h, null, { openings: [{ x: 10, y: 20, type: 'rect', soffit: 11, width: 4, height: 3 }] });
    const orif = cells.filter(c2 => c2.orifice);
    assert(orif.length >= 3 && orif.every(c2 => c2.orifice.soffit === 11), `rect-Öffnung deckt ${orif.length} Zellen, soffit=11`);
    // Orifice trägt jetzt die volle Hydraulik-Geometrie (nicht nur soffit)
    assert(orif.every(c2 => c2.orifice.width === 4 && c2.orifice.height === 3 && c2.orifice.type === 'rect'),
        'Orifice trägt width=4, height=3, type=rect');
}

console.log('── v8-Export: Polylinie behält Knicke (InputGenerator) ──');
{
    const gen = new InputGenerator();
    const h = { ncols: 60, nrows: 60, cellsize: 1, xll: 0, yll: 0, xllcorner: 0, yllcorner: 0 };
    const line = { id: 'wl1', points: [{ x: 5, y: 20 }, { x: 15, y: 20 }, { x: 15, y: 30 }], hc: 12.5, Cd: 1.704, m: 0.667, w: 1 };
    // Zellen wie sie der Editor in geoStore.weirs ablegt (lineId)
    const cells = discretizeWeirPolyline(line.points, h, null).map(c => ({ lineId: 'wl1', x: c.x, y: c.y, direction: c.direction, Cd: 1.704, hc: 12.5, m: 0.667, w: 1 }));
    const out = gen.generateWeirFile(cells, [], h, { engine: 'v8', weirLines: [line] });
    const lines = out.trim().split('\n').slice(1);
    assert(lines.length > 0, `v8 Polylinie: ${lines.length} Zeilen`);
    // Knick bei (15,20): es muss sowohl der horizontale (S) als auch der vertikale (E) Ast vorkommen
    const dirs = new Set(lines.map(l => l.trim().split(/\s+/)[2]));
    assert(dirs.has('S') && dirs.has('E'), 'v8 Polylinie behält beide Äste (S horizontal + E vertikal)');
    assert(lines.every(l => Math.abs(+l.trim().split(/\s+/)[4] - 12.5) < 1e-6), 'hc = 12.5 für alle');
    // Ohne weirLines: Fallback erste→letzte Zelle (gerade) → kein vertikaler Ast garantiert
    const outStraight = gen.generateWeirFile(cells, [], h, { engine: 'v8' });
    assert(outStraight.trim().split('\n').length - 1 > 0, 'Fallback ohne weirLines erzeugt weiterhin Zeilen');
}

console.log('── v8-Export: geneigte Krone + Öffnung als Orifice ──');
{
    const gen = new InputGenerator();
    const h = { ncols: 60, nrows: 60, cellsize: 1, xll: 0, yll: 0, xllcorner: 0, yllcorner: 0 };
    // geneigte Krone z 10→16, Öffnung bei (12,20) soffit 11
    const line = { id: 'wl2', points: [{ x: 8, y: 20, z: 10 }, { x: 16, y: 20, z: 16 }], openings: [{ x: 12, y: 20, soffit: 11 }], Cd: 1.704, m: 0.667, w: 1 };
    const cells = discretizeWeirPolyline(line.points, h, null, { openings: line.openings }).map(c => ({ lineId: 'wl2', x: c.x, y: c.y, direction: c.direction, Cd: 1.704, hc: c.hc, m: 0.667, w: 1 }));
    const out = gen.generateWeirFile(cells, [], h, { engine: 'v8', weirLines: [line] });
    const lines = out.trim().split('\n').slice(1).map(l => l.trim().split(/\s+/));
    // Krone variiert (mehrere unterschiedliche hc), Enden ~10/~16
    const crestLines = lines.filter(p => !p[2].endsWith('B'));
    const hcs = crestLines.map(p => +p[4]);
    assert(Math.min(...hcs) < 11 && Math.max(...hcs) > 15, `Krone geneigt: hc-Spanne ${Math.min(...hcs)}..${Math.max(...hcs)}`);
    // Öffnung → genau eine <dir>B-Zeile mit hc = soffit 11
    const bLines = lines.filter(p => p[2].endsWith('B'));
    assert(bLines.length >= 1 && bLines.every(p => Math.abs(+p[4] - 11) < 1e-6), `Öffnung als <dir>B mit hc=11 (got ${bLines.length})`);

    // SGC-Clip-Bypass: mit gesetztem sgcWidthGrid (alles 0) bleibt die <dir>B-Öffnung erhalten
    const sgc = new Float32Array(60 * 60); // überall 0 → würde Brücken-<dir>B wegclippen
    const out2 = gen.generateWeirFile(cells, [], h, { engine: 'v8', weirLines: [line], sgcWidthGrid: sgc });
    const b2 = out2.trim().split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(p => p[2].endsWith('B'));
    assert(b2.length === bLines.length, 'Wehr-Öffnung umgeht das SGC-Bridge-Clipping (bleibt erhalten)');

    // Export nutzt die ECHTE Öffnungsbreite (auf Zellweite gekappt) statt pauschal cs.
    // Schmales Rohr (width 0.5 m < cellsize 1) → w-Spalte = 0.5; breite Öffnung → cs.
    const narrow = { id: 'wl3', points: [{ x: 8, y: 20, z: 12 }, { x: 16, y: 20, z: 12 }], openings: [{ x: 12, y: 20, type: 'round', soffit: 11, width: 0.5 }], Cd: 1.704, m: 0.667, w: 1 };
    const nCells = discretizeWeirPolyline(narrow.points, h, null, { openings: narrow.openings }).map(c => ({ lineId: 'wl3', x: c.x, y: c.y, direction: c.direction, Cd: 1.704, hc: c.hc, m: 0.667, w: 1 }));
    const outN = gen.generateWeirFile(nCells, [], h, { engine: 'v8', weirLines: [narrow] });
    const bN = outN.trim().split('\n').slice(1).map(l => l.trim().split(/\s+/)).filter(p => p[2].endsWith('B'));
    assert(bN.length >= 1 && bN.every(p => Math.abs(+p[6] - 0.5) < 1e-6), `schmale Öffnung: w-Spalte = 0.5 (got ${bN.map(p => p[6]).join(',')})`);
}

console.log(failures === 0 ? '\n✅ Alle Weir-Polyline-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
