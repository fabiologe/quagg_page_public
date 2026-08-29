/**
 * Polygon simplification using the Ramer–Douglas–Peucker algorithm.
 *
 * Given a closed polygon ring (e.g. the spiky triangle-union output from
 * IfcShapeOutlines), this removes vertices whose deviation from the simplified
 * shape is below the tolerance — leaving a clean, less zig-zaggy outline.
 *
 * Tolerance is in WORLD units (metres for IFC). Sensible defaults:
 *   • 0.005  m  (5 mm)  — extreme detail, almost identical to input
 *   • 0.02   m  (2 cm)  — good for engineering plans, removes triangle stair-stepping
 *   • 0.05   m  (5 cm)  — heavy smoothing for small overview plans
 */

/**
 * Simplify a ring of [x, y] points.
 * @param {Array<[number, number]>} ring  - vertices, closed (last == first)
 * @param {number}                   epsilon - max deviation in world units
 * @returns {Array<[number, number]>}
 */
export function simplifyRing(ring, epsilon) {
    if (!Array.isArray(ring) || ring.length < 4 || epsilon <= 0) return ring;

    // RDP requires an open polyline; ring is closed (last == first), so we keep
    // that property: simplify the open part, then re-close.
    const open = ring.slice(0, -1);
    const simplified = _rdp(open, epsilon);
    if (simplified.length < 3) return ring; // refuse to flatten away the whole ring
    simplified.push([simplified[0][0], simplified[0][1]]); // close it
    return simplified;
}

/**
 * Simplify every ring (outer + holes) inside a feature record from
 * IfcShapeOutlines. Returns a NEW record — non-destructive.
 */
export function simplifyOutline(record, epsilon) {
    if (!record?.rings?.length) return record;
    return {
        ...record,
        rings: record.rings.map(r => simplifyRing(r, epsilon)),
    };
}

/**
 * Simplify an entire array of outline records. Convenience wrapper.
 */
export function simplifyOutlines(outlines, epsilon) {
    if (!epsilon || epsilon <= 0) return outlines;
    return outlines.map(o => simplifyOutline(o, epsilon));
}

// ── Ramer–Douglas–Peucker core ──────────────────────────────────────────────

function _rdp(points, epsilon) {
    if (points.length < 3) return points.slice();

    // Find the point farthest from the line connecting the endpoints
    const first = points[0];
    const last  = points[points.length - 1];
    let maxDist = 0;
    let index   = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const d = _perpendicularDistance(points[i], first, last);
        if (d > maxDist) { maxDist = d; index = i; }
    }

    if (maxDist > epsilon) {
        // Recurse on both halves and stitch
        const left  = _rdp(points.slice(0, index + 1), epsilon);
        const right = _rdp(points.slice(index), epsilon);
        return left.slice(0, -1).concat(right);
    }
    return [first, last];
}

function _perpendicularDistance(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const ex = p[0] - a[0], ey = p[1] - a[1];
        return Math.sqrt(ex * ex + ey * ey);
    }
    // |((p - a) × (b - a))| / |b - a|
    const num = Math.abs((p[1] - a[1]) * dx - (p[0] - a[0]) * dy);
    return num / Math.sqrt(lenSq);
}
