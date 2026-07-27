// Test: Randzellen-Enumeration (terrainFront.js: collectPerimeterCells/collectLiteralEdgeCells/
// findNearestPerimeterCell) — die "Liste aller Randzellen", die der Ablauf-Picker
// (useOutflowPickerTool.js) als Einrast-Ziel nutzt.
// (Ehemals test_perimeter_walk.mjs — walkPerimeterArc/projectOntoPerimeterArc wurden mit dem
// Umstieg von Linie+Projektion auf Pinsel/Picker entfernt, s. outflowBrush.js.)
// Ausführen: node src/features/flood-2D/test/test_perimeter_cells.mjs   (aus client/)
import {
    computeExteriorMask,
    collectPerimeterCells,
    findNearestPerimeterCell,
} from '../utils/terrainFront.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const mkHeader = (ncols = 20, nrows = 20, cellsize = 5) => ({
    ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0,
});

// Gleiche Kerbe wie test_terrain_front.mjs: rechte Spalten (c=15..19) teilweise NoData über
// r=8..12 — mit dem Außenrand verbunden (c=19 = ncols-1).
function makeNotchGrid(ncols = 20, nrows = 20) {
    const gridData = new Float32Array(ncols * nrows).fill(10);
    for (let r = 8; r <= 12; r++) for (let c = 15; c < ncols; c++) gridData[r * ncols + c] = -9999;
    return gridData;
}

console.log('── collectPerimeterCells: Rand + Front-Nachbarn, isoliertes Loch ausgeschlossen ──');
{
    const header = mkHeader();
    const gridData = makeNotchGrid();
    gridData[10 * 20 + 10] = -9999; // isoliertes Innen-Loch, nicht randverbunden
    const mask = computeExteriorMask(gridData, header);
    const perimeter = collectPerimeterCells(gridData, header, mask);

    assert(perimeter.has('0,0'), 'literale Eckzelle (0,0) im Perimeter');
    assert(perimeter.has('19,0') && perimeter.has('0,19') && perimeter.has('19,19'), 'alle vier Rechteck-Ecken im Perimeter');
    assert(perimeter.has('14,10'), 'Innenzelle (14,10) direkt neben der Kerbe im Perimeter');
    assert(!perimeter.has('16,10'), 'Kerben-NoData-Zelle selbst NICHT im Perimeter (sie ist NoData, kein gültiges Gelände)');
    assert(!perimeter.has('12,10'), 'Zelle 2 Schritte von der Kerbe entfernt NICHT im Perimeter');
    assert(!perimeter.has('9,10') && !perimeter.has('11,10') && !perimeter.has('10,9') && !perimeter.has('10,11'),
        'Nachbarn des isolierten Innen-Lochs NICHT im Perimeter (Loch ist nicht randverbunden)');
}

console.log('── collectPerimeterCells: 8-Konnektivität — Innenecke, die nur DIAGONAL an NoData grenzt ──');
{
    // Schiefe/rotierte DGMs: an einer Innenecke (z. B. einer geclippten Rand-Aussparung)
    // grenzt die dort liegende gültige Zelle oft NUR diagonal an die NoData-Fläche — alle 4
    // orthogonalen Nachbarn sind gültiges Gelände. Mit reiner 4-Konnektivität ("eine Seite
    // frei") würde diese Zelle NICHT als Randzelle erkannt, obwohl sie visuell/geometrisch
    // klar an der Kante liegt ("eckiges" Raster).
    const ncols = 10, nrows = 10;
    const header = mkHeader(ncols, nrows, 1);
    const gridData = new Float32Array(ncols * nrows).fill(10);
    // Solide NoData-Ecke unten-links (Zeilen/Spalten 0..4), randverbunden über Zeile 0 / Spalte 0.
    for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) gridData[r * ncols + c] = -9999;

    const perimeter = collectPerimeterCells(gridData, header);
    // (5,5): alle 4 orthogonalen Nachbarn — (4,5),(6,5),(5,4),(5,6) — sind gültig (außerhalb
    // der Aussparung); NUR die Diagonale (4,4) ist NoData.
    assert(gridData[4 * ncols + 5] > -9990 && gridData[6 * ncols + 5] > -9990 &&
        gridData[5 * ncols + 4] > -9990 && gridData[5 * ncols + 6] > -9990,
        'Kontrolle: alle 4 orthogonalen Nachbarn von (5,5) sind tatsächlich gültig');
    assert(gridData[4 * ncols + 4] <= -9990, 'Kontrolle: Diagonal-Nachbar (4,4) ist tatsächlich NoData');
    assert(perimeter.has('5,5'), '(5,5) wird trotz rein diagonaler NoData-Nachbarschaft als Randzelle erkannt');
}

console.log('── findNearestPerimeterCell ──');
{
    const header = mkHeader();
    const gridData = makeNotchGrid();
    const perimeter = collectPerimeterCells(gridData, header);
    const nearest = findNearestPerimeterCell(2, 2, perimeter);
    assert(nearest !== null, 'liefert eine Zelle für einen Innenpunkt');
    // (2,2) ist am nächsten zur Süd- oder West-Kante (beide Distanz 2) — Ergebnis muss
    // tatsächlich im Perimeter-Set liegen und Distanz 2 haben.
    const d2 = (nearest.col - 2) ** 2 + (nearest.row - 2) ** 2;
    assert(d2 === 4, `nächste Randzelle hat Distanz² 4 (${d2}), Zelle (${nearest.col},${nearest.row})`);
}

console.log(failures === 0 ? '\n✅ Alle Randzellen-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
