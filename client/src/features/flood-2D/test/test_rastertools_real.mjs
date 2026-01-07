
import { createGridFromXYZ, burnPolygonsIntoGrid } from '../solverTerra/RasterTools.js';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const xyzPath = path.join(__dirname, 'test', 'dgm10_small.xyz');

console.log(`Reading XYZ file from ${xyzPath}...`);
try {
    const xyzContent = fs.readFileSync(xyzPath, 'utf-8');

    console.log("Testing createGridFromXYZ with real data...");
    const gridData = createGridFromXYZ(xyzContent);
    console.log("Header:", gridData.header);

    // Validate Header (Expectations based on dgm10_small.xyz knowledge, simplified check)
    if (gridData.header.ncols <= 0 || gridData.header.nrows <= 0 || gridData.header.cellsize <= 0) {
        console.error("FAILED: Invalid header derived from file.");
        process.exit(1);
    }

    console.log(`Grid created successfully. Dimensions: ${gridData.header.ncols}x${gridData.header.nrows}`);

    // Test Burning (using a hypothetical polygon within the grid's range)
    // Make a small polygon in the middle of the extent
    const midX = gridData.header.xllcorner + (gridData.header.ncols * gridData.header.cellsize) / 2;
    const midY = gridData.header.yllcorner + (gridData.header.nrows * gridData.header.cellsize) / 2;
    const offset = gridData.header.cellsize * 2;

    const poly = {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [[
                [midX - offset, midY - offset],
                [midX + offset, midY - offset],
                [midX + offset, midY + offset],
                [midX - offset, midY + offset],
                [midX - offset, midY - offset]
            ]]
        }
    };

    console.log("Testing burnPolygonsIntoGrid with generated polygon...");
    // Sample a value before burn
    // Find index of center cell
    const col = Math.floor((midX - gridData.header.xllcorner) / gridData.header.cellsize);
    const row = Math.floor(((gridData.header.yllcorner + (gridData.header.nrows - 1) * gridData.header.cellsize) - midY) / gridData.header.cellsize);
    const idx = row * gridData.header.ncols + col;
    const valBefore = gridData.grid[idx];

    burnPolygonsIntoGrid(gridData, poly, 100.0);

    const valAfter = gridData.grid[idx];
    console.log(`Value at center before: ${valBefore}, after: ${valAfter}`);

    if (valAfter !== valBefore + 100.0) {
        console.error("FAILED: Polygon burn did not update the grid value correctly.");
        // Note: It's possible the calculated index is off or point-in-polygon failed? 
        // With cellsize 10, offset 20, the 40x40 box should definitely cover the center.
        process.exit(1);
    }

    console.log("Verification with file successful.");

} catch (err) {
    console.error("Error reading or processing file:", err);
    process.exit(1);
}
