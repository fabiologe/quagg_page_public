// Unit-Tests für utils/boundarySegments.js (rein, ohne InputGenerator)
// Ausführen: node src/features/flood-2D/test/test_boundary_segments.mjs (aus client/)
import {
    cellEdge, edgeAxis, edgeCells, snapToNearestEdge, mergeCellsToIntervals,
} from '../utils/boundarySegments.js';

let failures = 0;
const assert = (cond, msg) => {
    if (cond) console.log(`  ✅ ${msg}`);
    else { console.error(`  ❌ ${msg}`); failures++; }
};

const header = { ncols: 20, nrows: 20, cellsize: 5, xllcorner: 0, yllcorner: 0 };

console.log('── cellEdge ──');
{
    assert(cellEdge(header, 0, 5) === 'W', 'col 0 ⇒ W');
    assert(cellEdge(header, 19, 5) === 'E', 'col 19 ⇒ E');
    assert(cellEdge(header, 7, 0) === 'S', 'row 0 ⇒ S');
    assert(cellEdge(header, 7, 19) === 'N', 'row 19 ⇒ N');
    assert(cellEdge(header, 8, 8) === null, 'innen ⇒ null');
    // Ecke col0/row0: Priorität W > S ⇒ W
    assert(cellEdge(header, 0, 0) === 'W', 'Ecke (0,0) ⇒ deterministisch W (vor S)');
    assert(cellEdge(header, 19, 0) === 'E', 'Ecke (19,0) ⇒ E (vor S)');
}

console.log('── edgeAxis / edgeCells ──');
{
    assert(edgeAxis(header, 'W').vertical === true && edgeAxis(header, 'W').fixed === 0, 'W: vertikal, col 0');
    assert(edgeAxis(header, 'E').fixed === 19, 'E: col 19');
    assert(edgeAxis(header, 'N').vertical === false && edgeAxis(header, 'N').fixed === 19, 'N: horizontal, row 19');
    const wCells = [...edgeCells(header, 'W')];
    assert(wCells.length === 20 && wCells.every(c => c.col === 0), 'edgeCells W: 20 Zellen, alle col 0');
    const sCells = [...edgeCells(header, 'S')];
    assert(sCells.length === 20 && sCells.every(c => c.row === 0), 'edgeCells S: 20 Zellen, alle row 0');
}

console.log('── snapToNearestEdge ──');
{
    // Linie exakt bei x=0 (Westrand)
    const w = snapToNearestEdge([[0, 20], [0, 60]], header, 1.5);
    assert(w.edge === 'W', 'Linie x=0 ⇒ W');
    assert(w.snappedCoords.every(c => c[0] === 0), 'W: x auf 0 projiziert');

    // Linie 1 Zelle (5 m) vom Westrand entfernt ⇒ noch innerhalb 1.5 Zellen ⇒ W
    const near = snapToNearestEdge([[5, 20], [5, 60]], header, 1.5);
    assert(near.edge === 'W', 'Linie 1 Zelle innen ⇒ snappt noch auf W');
    assert(near.snappedCoords.every(c => c[0] === 0), 'W: auf col 0 projiziert');

    // Linie 5 Zellen innen ⇒ kein Snap
    const inner = snapToNearestEdge([[25, 20], [25, 60]], header, 1.5);
    assert(inner.edge === null, 'Linie 5 Zellen innen ⇒ edge null');
    assert(inner.snappedCoords[0][0] === 25, 'innen: Koordinaten unverändert');

    // Horizontale Linie bei y=0 (Südrand)
    const s = snapToNearestEdge([[20, 0], [60, 0]], header, 1.5);
    assert(s.edge === 'S', 'Linie y=0 ⇒ S');
    assert(s.snappedCoords.every(c => c[1] === 0), 'S: y auf 0 projiziert');

    // Ostrand: x = (ncols-1)*cs = 95
    const e = snapToNearestEdge([[95, 20], [95, 60]], header, 1.5);
    assert(e.edge === 'E', 'Linie x=95 ⇒ E');
}

console.log('── mergeCellsToIntervals ──');
{
    // W-Kante: zusammenhängende Reihen 4..11 ⇒ ein Intervall [20, 60]
    const cells = [];
    for (let r = 4; r <= 11; r++) cells.push({ col: 0, row: r });
    const iv = mergeCellsToIntervals(cells, 'W', header);
    assert(iv.length === 1, 'zusammenhängende Reihen ⇒ 1 Intervall');
    assert(iv[0].a === 20 && iv[0].b === 60, `Intervall [20,60] (Zellkanten); got [${iv[0].a},${iv[0].b}]`);

    // Lücke ⇒ zwei Intervalle
    const gap = [{ col: 0, row: 2 }, { col: 0, row: 3 }, { col: 0, row: 7 }, { col: 0, row: 8 }];
    const iv2 = mergeCellsToIntervals(gap, 'W', header);
    assert(iv2.length === 2, `Lücke ⇒ 2 Intervalle; got ${iv2.length}`);
    assert(iv2[0].a === 10 && iv2[0].b === 20, `1. Intervall [10,20]; got [${iv2[0].a},${iv2[0].b}]`);
    assert(iv2[1].a === 35 && iv2[1].b === 45, `2. Intervall [35,45]; got [${iv2[1].a},${iv2[1].b}]`);

    // Akzeptiert auch {x,y}-Indices
    const xy = [{ x: 7, y: 0 }, { x: 8, y: 0 }, { x: 9, y: 0 }];
    const iv3 = mergeCellsToIntervals(xy, 'S', header);
    assert(iv3.length === 1 && iv3[0].a === 35 && iv3[0].b === 50, `S {x,y}: [35,50]; got [${iv3[0]?.a},${iv3[0]?.b}]`);
}

console.log(failures === 0 ? '\n✅ ALL PASS' : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
