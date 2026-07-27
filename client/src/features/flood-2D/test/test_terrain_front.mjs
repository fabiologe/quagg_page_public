// Test: "wahre" (ggf. irreguläre) Geländekante eines geclippten DEMs — Ablauf-Eignung soll
// nicht nur die literale Rechteck-Kante kennen, sondern auch die Nähe zur vom Rasterrand
// aus erreichbaren NoData-Front (terrainFront.js).
// Ausführen: node src/features/flood-2D/test/test_terrain_front.mjs   (aus client/)
import { computeExteriorMask, isNearExteriorFront, FRONT_TOLERANCE_CELLS_DEFAULT, NODATA_THRESHOLD, outwardCardinalDirections }
    from '../utils/terrainFront.js';
import { snapToNearestEdge } from '../utils/boundarySegments.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const mkHeader = (ncols = 20, nrows = 20, cellsize = 5) => ({
    ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0,
});

// Gleiche Kerbe wie test_boundary_inflow.mjs Block 5: rechte Spalten (c=15..19) teilweise
// NoData über r=8..12 — mit dem Außenrand verbunden (c=19 = ncols-1).
function makeNotchGrid(ncols = 20, nrows = 20) {
    const gridData = new Float32Array(ncols * nrows).fill(10);
    for (let r = 8; r <= 12; r++) for (let c = 15; c < ncols; c++) gridData[r * ncols + c] = -9999;
    return gridData;
}

console.log('── computeExteriorMask: randverbundene Kerbe vs. isoliertes Innen-Loch ──');
{
    const header = mkHeader();
    const gridData = makeNotchGrid();
    // Isoliertes NoData-Loch bei (10,10), umgeben von gültigem Gelände — NICHT mit dem
    // Rand verbunden (liegt weit von der Kerbe bei c=15..19 entfernt).
    gridData[10 * 20 + 10] = -9999;

    const mask = computeExteriorMask(gridData, header);
    assert(mask[10 * 20 + 17] === 1, 'Kerben-Zelle (c17,r10) als randverbunden erkannt');
    assert(mask[8 * 20 + 15] === 1, 'Kerben-Zelle (c15,r8) als randverbunden erkannt');
    assert(mask[10 * 20 + 10] === 0, 'isoliertes Innen-Loch (c10,r10) NICHT als exterior markiert (kein naiver Schwellwert-Scan)');
    assert(mask[0 * 20 + 0] === 0, 'gültige Eck-Zelle (c0,r0) nicht markiert');
}

console.log('── isNearExteriorFront: drei Fälle (Rechteck-Kante / nahe Kerbe / vollständig innen) ──');
{
    const header = mkHeader();
    const gridData = makeNotchGrid();
    const mask = computeExteriorMask(gridData, header);

    // a) Westrand (col=0) — echte Rechteck-Kante, weit von der Kerbe entfernt.
    const westCoords = [[0, 20], [0, 60]];
    const { edge: westEdge } = snapToNearestEdge(westCoords, header, 1.5);
    assert(westEdge === 'W', `Westrand wird als Rechteck-Kante erkannt (${westEdge})`);
    assert(!isNearExteriorFront(westCoords, header, mask, FRONT_TOLERANCE_CELLS_DEFAULT), 'Westrand liegt NICHT nahe der Kerben-Front');

    // b) col=14 (dieselben Koordinaten wie test_boundary_inflow.mjs Block 5) — direkt neben
    // der Kerbe (c=15), aber keine Rechteck-Kante.
    const frontCoords = [[70, 40], [70, 60]];
    const { edge: frontEdge } = snapToNearestEdge(frontCoords, header, 1.5);
    assert(frontEdge === null, `col=14 ist keine Rechteck-Kante (${frontEdge})`);
    assert(isNearExteriorFront(frontCoords, header, mask, FRONT_TOLERANCE_CELLS_DEFAULT), 'col=14 liegt nahe der Kerben-Front (Näherung)');

    // c) Zentrum — weder Rechteck-Kante noch nahe der Kerbe.
    const interiorCoords = [[50, 50], [50, 50]];
    const { edge: interiorEdge } = snapToNearestEdge(interiorCoords, header, 1.5);
    assert(interiorEdge === null, 'Zentrum ist keine Rechteck-Kante');
    assert(!isNearExteriorFront(interiorCoords, header, mask, FRONT_TOLERANCE_CELLS_DEFAULT), 'Zentrum liegt NICHT nahe der Kerben-Front (vollständig innen)');
}

console.log('── isNearExteriorFront prüft jeden Vertex, nicht nur die Endpunkte ──');
{
    const header = mkHeader();
    const gridData = makeNotchGrid();
    const mask = computeExteriorMask(gridData, header);
    // Beide Endpunkte weit von der Kerbe, aber ein mittlerer Vertex direkt daneben (c=14,r=10 → x=70,y=50).
    const coordsWithMidVertex = [[10, 10], [70, 50], [10, 90]];
    assert(isNearExteriorFront(coordsWithMidVertex, header, mask, FRONT_TOLERANCE_CELLS_DEFAULT),
        'mittlerer Vertex nahe der Front wird erkannt, obwohl beide Endpunkte weit weg liegen');
}

console.log('── Regressions-Absicherung: computeExteriorMask == eingefrorene Referenzimplementierung ──');
{
    // Frozen bei Extraktion aus InputGenerator.js _fillGlobalBoundary (2026-07-22) — bewusst
    // NICHT automatisch synchron gehalten, dient als unabhängiger Anker gegen Drift.
    function referenceFloodFill(gridData, header) {
        const { ncols, nrows } = header;
        const ND = NODATA_THRESHOLD;
        const total = ncols * nrows;
        const exterior = new Uint8Array(total);
        const stack = [];
        const seedExt = (c, r) => {
            if (c < 0 || c >= ncols || r < 0 || r >= nrows) return;
            const k = r * ncols + c;
            if (exterior[k] || gridData[k] > ND) return;
            exterior[k] = 1; stack.push(k);
        };
        for (let c = 0; c < ncols; c++) { seedExt(c, 0); seedExt(c, nrows - 1); }
        for (let r = 0; r < nrows; r++) { seedExt(0, r); seedExt(ncols - 1, r); }
        while (stack.length) {
            const k = stack.pop();
            const c = k % ncols, r = (k - c) / ncols;
            seedExt(c - 1, r); seedExt(c + 1, r); seedExt(c, r - 1); seedExt(c, r + 1);
        }
        return exterior;
    }
    const cellByCellEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

    // 1) Ecken-Kerbe (wie oben)
    const header1 = mkHeader();
    const grid1 = makeNotchGrid();
    assert(cellByCellEqual(computeExteriorMask(grid1, header1), referenceFloodFill(grid1, header1)),
        'Kerben-Gitter: computeExteriorMask == Referenz-Flood-Fill');

    // 2) Diagonales Wassereinzugsgebiet (obere linke Dreiecks-Hälfte gültig, Rest NoData)
    const header2 = mkHeader(16, 16, 2);
    const grid2 = new Float32Array(16 * 16).fill(-9999);
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) if (c + r < 16) grid2[r * 16 + c] = 5;
    assert(cellByCellEqual(computeExteriorMask(grid2, header2), referenceFloodFill(grid2, header2)),
        'diagonales Einzugsgebiet: computeExteriorMask == Referenz-Flood-Fill');

    // 3) Randverbundene Front UND isoliertes Innen-Loch gemeinsam
    const header3 = mkHeader();
    const grid3 = makeNotchGrid();
    grid3[10 * 20 + 10] = -9999; // isoliertes Loch, s.o.
    assert(cellByCellEqual(computeExteriorMask(grid3, header3), referenceFloodFill(grid3, header3)),
        'Kerbe + isoliertes Loch gemeinsam: computeExteriorMask == Referenz-Flood-Fill');
}

console.log('── computeExteriorMask: 8-Konnektivität — Diagonal-Kette erreicht den Rand nur über Ecken ──');
{
    // Schiefe/rotierte DGMs rastern ihre (nicht achsparallele) Außenkante als Treppenstufen —
    // an jeder Ecke kann die NoData-Fläche jenseits der Kante nur DIAGONAL mit dem Rest
    // zusammenhängen. Hier: NoData bei (0,0) [literale Ecke, randverbunden], (1,1), (2,2),
    // (3,3) — jede Zelle berührt die vorherige NUR diagonal, ihre eigenen orthogonalen
    // Nachbarn sind alle gültig. Ein reiner 4-Konnektivitäts-Flood-Fill bliebe bei (0,0)
    // stehen und würde (1,1)/(2,2)/(3,3) fälschlich als isoliertes Loch einstufen.
    const header = mkHeader(10, 10, 1);
    const gridData = new Float32Array(10 * 10).fill(10);
    gridData[0 * 10 + 0] = -9999;
    gridData[1 * 10 + 1] = -9999;
    gridData[2 * 10 + 2] = -9999;
    gridData[3 * 10 + 3] = -9999;

    const mask = computeExteriorMask(gridData, header);
    assert(mask[0 * 10 + 0] === 1, '(0,0) [literale Ecke] ist exterior');
    assert(mask[1 * 10 + 1] === 1, '(1,1) nur diagonal an (0,0) angebunden — trotzdem exterior');
    assert(mask[2 * 10 + 2] === 1, '(2,2) über die Diagonal-Kette erreichbar — exterior');
    assert(mask[3 * 10 + 3] === 1, '(3,3) Ende der Diagonal-Kette — exterior, kein isoliertes Loch');
}

console.log('── outwardCardinalDirections: orthogonale Front-Richtung(en) für den Punkt-FREE-Patch ──');
{
    // Kerbe: col=15..19/row=8..12 NoData (wie test_boundary_inflow.mjs Block 10). col=14 grenzt
    // im gesamten Kerben-Bereich orthogonal (Osten) an NoData.
    const header = mkHeader(20, 20, 5);
    const gridData = makeNotchGrid();
    const mask = computeExteriorMask(gridData, header);

    assert(
        outwardCardinalDirections(14, 10, header, mask).join(',') === 'E',
        `Front-Zelle mit NoData exakt im Osten ⇒ nur 'E'\n     → ${outwardCardinalDirections(14, 10, header, mask).join(',')}`
    );
    assert(
        outwardCardinalDirections(10, 10, header, mask).length === 0,
        'Zelle mitten im gültigen Gelände (weit von jeder Front) ⇒ keine Richtung'
    );

    // Reine Diagonal-Ecke (wie test_perimeter_cells.mjs): (5,5) grenzt NUR diagonal an eine
    // solide NoData-Ecke (0..4,0..4) — keine der 4 orthogonalen Richtungen ist NoData/außerhalb.
    const ncols2 = 10, nrows2 = 10;
    const header2 = mkHeader(ncols2, nrows2, 1);
    const gridData2 = new Float32Array(ncols2 * nrows2).fill(10);
    for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) gridData2[r * ncols2 + c] = -9999;
    const mask2 = computeExteriorMask(gridData2, header2);
    assert(
        outwardCardinalDirections(5, 5, header2, mask2).length === 0,
        `reine Diagonal-Eckzelle ⇒ 0 orthogonale Richtungen (kein direktes Punkt-FREE möglich, Fallback auf Kanten-Projektion)\n     → ${outwardCardinalDirections(5, 5, header2, mask2).join(',')}`
    );
}

console.log(failures === 0 ? '\n✅ Alle Terrain-Front-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
