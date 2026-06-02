/**
 * Section Contour Geometry
 *
 * Pure geometry helpers shared between the scene-wide section pass in
 * IfcVectorPlotter and the per-element section pass in IfcShapeOutlines.
 *
 *   - trianglePlaneIntersect: 0 or 1 line segment per triangle
 *   - chainSegmentsToPolygons: stitch many segments into closed XZ-rings
 *
 * No Three.js Scene knowledge here — callers prepare world-space vertices
 * (THREE.Vector3) and we return plain { x1, z1, x2, z2 } segments.
 */

import * as THREE from 'three';

/**
 * Intersect a single triangle (3 world-space vertices) with a THREE.Plane.
 * Returns null when the triangle does not cross the plane.
 *
 * The segment coords are projected to the XZ plane (top-view convention).
 * If you need front/side projections you can swap which two components you keep.
 */
export function trianglePlaneIntersect(plane, a, b, c) {
    const dA = plane.distanceToPoint(a);
    const dB = plane.distanceToPoint(b);
    const dC = plane.distanceToPoint(c);

    const pts = [];
    if (_edgeCross(dA, dB)) pts.push(_lerp3(a, b, dA, dB));
    if (_edgeCross(dB, dC)) pts.push(_lerp3(b, c, dB, dC));
    if (_edgeCross(dC, dA)) pts.push(_lerp3(c, a, dC, dA));

    if (pts.length < 2) return null;
    return { x1: pts[0].x, z1: pts[0].z, x2: pts[1].x, z2: pts[1].z };
}

function _edgeCross(d1, d2) { return (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0); }
function _lerp3(a, b, da, db) {
    const t = da / (da - db);
    return new THREE.Vector3(
        a.x + t * (b.x - a.x),
        a.y + t * (b.y - a.y),
        a.z + t * (b.z - a.z),
    );
}

/**
 * Stitch a soup of XZ segments into closed rings by matching shared endpoints
 * (5 mm world-space snap to tolerate the small gaps IFC tessellation leaves).
 *
 * @param {{x1, z1, x2, z2}[]} segs
 * @returns {Array<Array<{x, z}>>}  Each inner array is a closed ring.
 */
export function chainSegmentsToPolygons(segs) {
    if (!segs.length) return [];
    const EPS = 0.005;
    const key = (p) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`;

    const pool = segs.map(s => ({ used: false, a: { x: s.x1, z: s.z1 }, b: { x: s.x2, z: s.z2 } }));
    const byKey = new Map();
    for (const seg of pool) {
        const ka = key(seg.a), kb = key(seg.b);
        (byKey.get(ka) ?? byKey.set(ka, []).get(ka)).push({ seg, end: 'a' });
        (byKey.get(kb) ?? byKey.set(kb, []).get(kb)).push({ seg, end: 'b' });
    }

    const polys = [];
    for (const start of pool) {
        if (start.used) continue;
        const ring = [start.a, start.b];
        start.used = true;
        let head = start.b;
        let safety = 0;
        while (safety++ < 2000) {
            const next = (byKey.get(key(head)) ?? []).find(c => !c.seg.used && c.seg !== start);
            if (!next) break;
            next.seg.used = true;
            const other = next.end === 'a' ? next.seg.b : next.seg.a;
            ring.push(other);
            head = other;
            if (key(head) === key(ring[0])) break;
        }
        if (ring.length >= 4 && key(head) === key(ring[0])) polys.push(ring);
    }
    return polys;
}
