// Test: Ablauf-Pinsel-Tool — reine Logik (outflowBrush.js) + Ende-zu-Ende mit der bestehenden
// Export-Pipeline (InputGenerator.js), die unverändert bleibt (perimeterCells/literalEdgeArc
// haben exakt dieselbe Form wie beim bisherigen Projektions-Feature).
// Ausführen: node src/features/flood-2D/test/test_outflow_brush.mjs (aus client/)
import { classifyPaintedCells, buildOutflowBrushFeature } from '../utils/outflowBrush.js';
import { collectLiteralEdgeCells } from '../utils/terrainFront.js';
import { InputGenerator } from '../middleware/InputGenerator.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const mkHeader = (ncols = 20, nrows = 20, cellsize = 5) => ({
    ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, xll: 0, yll: 0,
});

console.log('── classifyPaintedCells: literale Kante vs. Front-Innenzelle ──');
{
    const header = mkHeader();
    const gridData = new Float32Array(20 * 20).fill(10);
    // Kerbe: rechte Spalten teilweise NoData → Front bei col=14 (analog test_perimeter_walk.mjs)
    for (let r = 8; r <= 12; r++) for (let c = 15; c < 20; c++) gridData[r * 20 + c] = -9999;

    const painted = [
        { col: 0, row: 5 },   // literale West-Kante
        { col: 14, row: 10 }, // Front-Innenzelle (Kerbe)
        { col: 5, row: 0 },   // literale Süd-Kante
    ];
    const { literalEdgeArc } = classifyPaintedCells(painted, gridData, header);
    assert(literalEdgeArc.length === 2, `2 von 3 Zellen sind literale Kante (${literalEdgeArc.length})`);
    assert(literalEdgeArc.some(c => c.col === 0 && c.row === 5), 'West-Kanten-Zelle enthalten');
    assert(literalEdgeArc.some(c => c.col === 5 && c.row === 0), 'Süd-Kanten-Zelle enthalten');
    assert(!literalEdgeArc.some(c => c.col === 14 && c.row === 10), 'Front-Innenzelle NICHT in literalEdgeArc');
}

console.log('── buildOutflowBrushFeature: leere Auswahl ⇒ null ──');
{
    const header = mkHeader();
    const gridData = new Float32Array(20 * 20).fill(10);
    assert(buildOutflowBrushFeature([], header, gridData) === null, 'leeres Array ⇒ null');
    assert(buildOutflowBrushFeature(null, header, gridData) === null, 'null ⇒ null');
}

console.log('── buildOutflowBrushFeature: Feature-Form + Namen ──');
{
    const header = mkHeader();
    const gridData = new Float32Array(20 * 20).fill(10); // voll gültig, alles literale Kante möglich
    const painted = [{ col: 3, row: 0 }, { col: 4, row: 0 }, { col: 5, row: 0 }];
    const feature = buildOutflowBrushFeature(painted, header, gridData);

    assert(feature.type === 'Feature', 'type=Feature');
    assert(feature.properties.type === 'BOUNDARY', 'properties.type=BOUNDARY');
    assert(feature.properties.boundary_type === 'OUTFLOW', 'boundary_type=OUTFLOW (Pinsel ist nur für Ablauf)');
    assert(feature.properties.edge === null, 'edge=null (Pinsel-Auswahl ist kein einzelnes deklariertes Segment)');
    assert(feature.properties.nearFront === true, 'nearFront=true (jede gemalte Zelle ist per Konstruktion real)');
    assert(feature.properties.perimeterCells.length === 3, 'perimeterCells enthält alle 3 gemalten Zellen');
    assert(feature.properties.literalEdgeArc.length === 3, 'alle 3 sind literale Kante ⇒ literalEdgeArc = alle 3');
    assert(feature.properties.name.includes('3 Zellen'), `Name nennt die Zellenzahl\n     → ${feature.properties.name}`);
    assert(!feature.properties.name.includes('kein „Frei"'), 'kein Frei-Warnhinweis, da literalEdgeArc nicht leer');
    assert(feature.geometry.type === 'LineString' && feature.geometry.coordinates.length === 3, 'geometry: LineString mit 3 Koordinaten');
}

console.log('── buildOutflowBrushFeature: nur Front-Innenzellen ⇒ literalEdgeArc=null, KEIN statischer Warnhinweis im Namen ──');
{
    // Der Name bleibt bewusst neutral (nur Zellenzahl) — seit dem Front-FREE-Projektions-Fix
    // ist "Frei" auch ohne literalEdgeArc meist möglich (InputGenerator.js projiziert auf die
    // nächste echte Kante); ein einmalig hier eingefrorener "geht nicht"-Text wäre potenziell
    // falsch/veraltet. Die tatsächliche Eignung berechnen BoundaryConfig.vue/AssignmentModal.vue
    // live aus outflowEligibility, nicht dieser Name.
    const header = mkHeader();
    const gridData = new Float32Array(20 * 20).fill(10);
    for (let r = 8; r <= 12; r++) for (let c = 15; c < 20; c++) gridData[r * 20 + c] = -9999;
    const painted = [{ col: 14, row: 9 }, { col: 14, row: 10 }]; // reine Front-Innenzellen
    const feature = buildOutflowBrushFeature(painted, header, gridData);
    assert(feature.properties.literalEdgeArc === null, 'literalEdgeArc=null, wenn keine Zelle literale Kante ist');
    assert(feature.properties.name.includes('2 Zellen'), `Name nennt weiterhin die Zellenzahl\n     → ${feature.properties.name}`);
    assert(!feature.properties.name.includes('kein „Frei"'), `kein statischer Frei-Warnhinweis mehr im Namen\n     → ${feature.properties.name}`);
}

console.log('── Ende-zu-Ende: Pinsel-Feature durch die UNVERÄNDERTE InputGenerator.js-Pipeline ──');
{
    // Beweist, dass die Export-Pipeline (perimeterCells/literalEdgeArc-Konsum, s. vorherige
    // Session-Phase) für ein Pinsel-Feature genauso funktioniert wie für ein projiziertes.
    const ncols = 20, nrows = 20, cellsize = 5;
    const gridData = new Float32Array(ncols * nrows).fill(10);
    const header = mkHeader(ncols, nrows, cellsize);
    const literalEdgeSet = collectLiteralEdgeCells(gridData, header);

    // FREE: nur literale Kante nutzbar.
    const paintedFree = [{ col: 3, row: 0 }, { col: 4, row: 0 }, { col: 5, row: 0 }];
    const freeFeature = buildOutflowBrushFeature(paintedFree, header, gridData, { literalEdgeSet });

    const gen = new InputGenerator();
    const files = gen.processScenario({
        grid: { ncols, nrows, cellsize, xllcorner: 0, yllcorner: 0, gridData, data: gridData },
        boundaries: [freeFeature], manholes: [], ganglinien: {},
        assignments: { [freeFeature.id]: { type: 'OUTFLOW_FREE', outflowSlope: 0.01 } },
        globalRoughness: 0.04,
        config: { sim_time: '600.0', initial_tstep: '1.0', saveint: '60.0', massint: '60.0', acceleration: '' },
        weirs: [], bridges: []
    });
    const lines = (files['flow.bci'] || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sLines = lines.filter(l => /^S\s/.test(l));
    assert(sLines.length === 1, `Pinsel-FREE ⇒ genau eine gemergte native S-Zeile\n     → ${lines.join('\n     → ')}`);
    assert(sLines.every(l => /FREE\s+0\.010000$/.test(l)), 'korrektes Sohlgefälle übernommen');
}

console.log(failures === 0 ? '\n✅ Alle Ablauf-Pinsel-Tests bestanden.' : `\n❌ ${failures} Test(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
