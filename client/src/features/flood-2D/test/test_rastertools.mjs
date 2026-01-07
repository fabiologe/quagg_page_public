
import { createGridFromXYZ, burnPolygonsIntoGrid } from '../solverTerra/RasterTools.js';

// 1. Create dummy XYZ data (4x4 grid, cellsize 1.0)
// 0 0 - 3 3
// Z = 10.0
let xyz = "";
for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
        xyz += `${x * 1.0} ${y * 1.0} 10.0\n`;
    }
}

console.log("Testing createGridFromXYZ...");
const gridData = createGridFromXYZ(xyz);
console.log("Header:", gridData.header);

if (gridData.header.ncols !== 4 || gridData.header.nrows !== 4 || gridData.header.cellsize !== 1.0) {
    console.error("FAILED: Header incorrect");
    process.exit(1);
}

// 2. Create dummy Polygon (Triangle covering (1,1), (2,1), (1,2))
// Should hit cells (1,1), maybe others depending on center logic.
// Cell centers:
// Col 1, Row 2 (y=1): Center (1.0, 1.0) -> Point is ON edge/vertex, inside check varies.
// Let's make a box covering middle 2x2: (0.5, 0.5) to (2.5, 2.5)
const geoJSON = {
    type: "Feature",
    geometry: {
        type: "Polygon",
        coordinates: [[
            [0.5, 0.5],
            [2.5, 0.5],
            [2.5, 2.5],
            [0.5, 2.5],
            [0.5, 0.5]
        ]]
    }
};

console.log("Testing burnPolygonsIntoGrid...");
burnPolygonsIntoGrid(gridData, geoJSON, 5.0);

// Check values
// Expected:
// Cells (1,1), (1,2), (2,1), (2,2) should be 15.0
// Others 10.0
// Grid Row mapping:
// Row 0: Y=3
// Row 1: Y=2 -> Center (X,2)
// Row 2: Y=1 -> Center (X,1)
// Row 3: Y=0
// Wait, my center calculation:
// cellCenterX = xllcorner + col * cellsize
// cellCenterY = maxY - row * cellsize
// xllcorner=0, maxY=3. 
// Row 0: Y=3. Col 0: X=0. Point (0,3). Outside box.
// Row 1: Y=2. Col 1: Point (1,2). Inside box (0.5->2.5). Should be 15.
// Row 2: Y=1. Col 1: Point (1,1). Inside box. Should be 15.

// Let's just print the grid
console.log("Grid:");
for (let r = 0; r < 4; r++) {
    let line = "";
    for (let c = 0; c < 4; c++) {
        line += gridData.grid[r * 4 + c].toFixed(1) + " ";
    }
    console.log(line);
}

console.log("Verification complete.");
