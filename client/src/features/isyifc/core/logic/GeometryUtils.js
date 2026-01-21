import { parseIsyValue } from './UnitMatrix.js';

/**
 * Extracts 3D coordinates from a raw node object.
 * @param {import('../types.js').IsyRawNode} rawNode 
 * @returns {Object|null} { x, y, z, coverZ, bottomZ }
 */
export function parseNodeGeometry(rawNode) {
    // New Worker Structure: points is already an array of {attr, x, y, z}
    const pointsList = rawNode.points;

    if (!pointsList || pointsList.length === 0) return null;

    let dmp = null; // Deckel (Cover)
    let smp = null; // Sohle (Bottom)
    let fallback = null;

    // --- LOOP THROUGH ALL POINTS ---
    for (const p of pointsList) {
        const attr = p.attr;

        // Values already extracted as strings/numbers in worker?
        // Worker did: x: p.Rechtswert || p.Y
        // We still need to use UnitMatrix/parseIsyValue because Worker kept raw values.

        const x = parseIsyValue('Rechtswert', p.x);
        const y = parseIsyValue('Hochwert', p.y);
        const z = parseIsyValue('Punkthoehe', p.z);

        const pointData = { x, y, z };

        if (attr === 'DMP') dmp = pointData;
        else if (attr === 'SMP' || attr === 'SBW') smp = pointData;

        // Fallback: Grab the first valid point we see
        if (!fallback && x !== 0 && y !== 0) fallback = pointData;
    }

    // --- MERGE LOGIC ---

    // 1. Position (X/Y) - Priority: Deckel > Sohle > Fallback
    const finalPos = dmp || smp || fallback;
    if (!finalPos) return null;

    // 2. Elevations (Z)
    let coverZ = dmp ? dmp.z : null;
    let bottomZ = smp ? smp.z : null;

    // 3. Gap Filling (Calculate missing Z based on Depth)
    // New Hybrid Worker: rawNode.geometry has normalized depth
    const tiefe = rawNode.geometry?.depth || 0;

    // Fallback: Use explicit CoverZ from attributes if points didn't provide it
    if (coverZ === null && rawNode.geometry?.coverZ != null) {
        coverZ = rawNode.geometry.coverZ;
        // If we used attribute coverZ, we might have coordinates from a non-DMP point?
        // parseNodeGeometry is mainly for Point-Cloud fusion.
    }

    if (coverZ !== null && bottomZ === null) {
        // Have Cover, missing Bottom -> Bottom = Cover - Depth
        bottomZ = tiefe > 0 ? coverZ - tiefe : coverZ - 2.5;
    } else if (bottomZ !== null && coverZ === null) {
        // Have Bottom, missing Cover -> Cover = Bottom + Depth
        coverZ = tiefe > 0 ? bottomZ + tiefe : bottomZ + 2.5;
    }

    // Last resort defaults
    if (bottomZ === null && coverZ === null) {
        coverZ = 2.5; bottomZ = 0;
    }

    // --- RETURN FORMAT ---
    // Coordinate Mapping for Three.js (Y is UP)
    return {
        x: finalPos.x,
        y: bottomZ,     // 3D Y = Real World Z (Elevation)
        z: -finalPos.y, // 3D Z = Real World Y (Northing, inverted)

        // Metadata for constructing the mesh cylinder height
        coverZ: coverZ,
        bottomZ: bottomZ,
        height: Math.abs(coverZ - bottomZ)
    };
}
