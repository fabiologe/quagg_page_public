/**
 * Section Contour Geometry
 *
 * Pure geometry helpers shared between the scene-wide section pass in
 * IfcVectorPlotter and the per-element section pass in IfcShapeOutlines.
 *
 *   - trianglePlaneIntersect: 0 or 1 line segment per triangle
 *   - chainSegmentsToPolygons: stitch many segments into closed XZ-rings
 *   - chainSegmentsToPolylines: dito, aber OFFENE Ketten bleiben erhalten
 *     (Höhenlinien am DGM-Rand, Böschungskanten — Sprint T1)
 *
 * No Three.js Scene knowledge here — callers prepare world-space vertices
 * (THREE.Vector3) and we return plain { x1, z1, x2, z2 } segments.
 */

import * as THREE from 'three';
// Die Verkettung wohnt seit 2026-09-07 in geometry/Verkettung.js — ohne three,
// damit der Kernel-Worker (MeshOps → chainSegmentsToPolygons) nicht die
// ganze Bibliothek lädt. Hier weiter exportiert für die Aufrufer.
export { chainSegmentsToPolygons, chainSegmentsToPolylines } from './geometry/Verkettung.js';

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


