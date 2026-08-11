/**
 * AxisAnnotations — Haltungsbeschriftung entlang der Leitungsachse (Sprint T1).
 *
 * Liest die 'Axis'-Repräsentationen (IFCPOLYLINE) der Leitungs-Kategorien als
 * ZUSAMMENHÄNGENDE Polylinien (im Gegensatz zu extractFootprintSegments, das
 * sofort in Einzelsegmente zerlegt) und liefert je Element:
 *   - die Achs-Polylinie in Welt-Koordinaten (Offset-korrigiert!)
 *   - berechnete Pseudo-Attribute: laenge (m), gefaelle (‰, aus den
 *     Achs-Höhen — bei 2D-Achsen null)
 *
 * Der Beschriftungstext entsteht über die normale Label-Template-Pipeline
 * ({Name}, {Pset.Prop}, plus {laenge:m} und {gefaelle}); gezeichnet wird im
 * Plotter (_drawAxisLabels) — rotiert am längsten Segment.
 *
 * Koordinaten-Konvention (wie _applyPlacement im Plotter): lokales IFC-X →
 * three-x, IFC-Y → three-z, IFC-Z (Höhe) → three-y. Am Realmodell verifizieren
 * — bei abweichenden Autorensystemen ist die Höhenachse die erste Verdächtige.
 */

import * as THREE from 'three';

export const AXIS_CATEGORIES_DEFAULT = ['IFCPIPESEGMENT', 'IFCFLOWSEGMENT'];

/**
 * Achs-Polylinien aller Produkte der gewünschten Kategorien eines Modells.
 *
 * @param {object} webIfc   web-ifc-API (roh)
 * @param {number} modelID  web-ifc-Modell-ID
 * @param {object} [opts]
 * @param {string[]} [opts.categories]
 * @param {{x,y,z}|null} [opts.coordOffset]  Engine-Offset (roh − offset = Welt
 *                                            ist FALSCH herum: welt = roh − offset;
 *                                            Engine: roh = welt + offset)
 * @returns {Array<{ category, expressId, polyline: Array<{x,y,z}>, laenge, gefaelle }>}
 */
export function extractAxisPolylines(webIfc, modelID, opts = {}) {
    const categories = opts.categories?.length ? opts.categories : AXIS_CATEGORIES_DEFAULT;
    const off = opts.coordOffset ?? null;
    const out = [];

    for (const typeName of categories) {
        const typeConst = webIfc[typeName];
        if (!typeConst) continue;
        let ids;
        try { ids = webIfc.GetLineIDsWithType(modelID, typeConst); } catch { continue; }
        if (!ids?.length) continue;

        for (const id of ids) {
            let product;
            try { product = webIfc.GetLine(modelID, id, true); } catch { continue; }
            if (!product) continue;

            const pts = _extractAxisPoints(product);
            if (pts.length < 2) continue;

            // Fallstrick 7: Rohkoordinate → Three-Welt (welt = roh − offset)
            const polyline = off
                ? pts.map(p => ({ x: p.x - off.x, y: p.y - (off.y ?? 0), z: p.z - off.z }))
                : pts;

            const laenge = polylineLength(polyline);
            out.push({
                category: typeName,
                expressId: id,
                polyline,
                laenge,
                gefaelle: polylineGefaellePromille(polyline),
            });
        }
    }
    return out;
}

/** Erste 'Axis'-Repräsentation als geordnete Punktfolge (Welt-Achsen-Konvention). */
function _extractAxisPoints(product) {
    const reps = product?.Representation?.Representations;
    if (!Array.isArray(reps)) return [];

    for (const rep of reps) {
        const ident = rep?.RepresentationIdentifier?.value ?? rep?.RepresentationIdentifier;
        if (ident !== 'Axis') continue;
        const matrix = _placementMatrix(product?.ObjectPlacement);
        const pts = [];
        for (const item of rep?.Items ?? []) {
            _collectPolylinePoints(item, matrix, pts);
        }
        if (pts.length >= 2) return pts;
    }
    return [];
}

// Die gesamte Placement-Kette rechnet im IFC-ACHSRAUM (x=IFC-X, y=IFC-Y,
// z=IFC-Z=Höhe) — erst NACH der Transformation wird auf die three-Konvention
// gemappt: three.x = X, three.y = Z (Höhe), three.z = Y.
function _collectPolylinePoints(item, matrix, out) {
    if (!item) return;
    if (item.Points) {
        for (const p of item.Points) {
            if (!p) continue;
            const c = p.Coordinates ?? p.coordinates ?? [];
            const val = (v) => (typeof v === 'object' ? v?.value : v) ?? 0;
            const v = new THREE.Vector3(val(c[0]), val(c[1]), c.length > 2 ? val(c[2]) : 0);
            v.applyMatrix4(matrix);                       // IFC-Raum
            out.push({ x: v.x, y: v.z, z: v.y });         // → three-Konvention
        }
        return;
    }
    if (item.Segments) {
        for (const seg of item.Segments ?? []) _collectPolylinePoints(seg?.ParentCurve ?? seg, matrix, out);
        return;
    }
    if (item.Elements) {
        for (const el of item.Elements ?? []) _collectPolylinePoints(el, matrix, out);
        return;
    }
    if (item.BasisCurve) _collectPolylinePoints(item.BasisCurve, matrix, out);
}

/**
 * Placement-Kette IfcLocalPlacement → Axis2Placement3D, komplett im
 * IFC-Achsraum (inkl. RefDirection/Axis-Rotation — Muster aus dem Plotter).
 */
function _placementMatrix(placement) {
    if (!placement) return new THREE.Matrix4();
    const m = placement.PlacementRelTo
        ? _placementMatrix(placement.PlacementRelTo)
        : new THREE.Matrix4();
    const rel = placement.RelativePlacement;
    const loc = rel?.Location;
    if (!loc) return m;

    const val = (arr, i) => {
        const v = (arr ?? [])[i];
        return (typeof v === 'object' ? v?.value : v) ?? 0;
    };
    const coords = loc.Coordinates ?? loc.coordinates ?? [];
    const tx = val(coords, 0), ty = val(coords, 1), tz = val(coords, 2);

    const dir = (d, dx, dy, dz) => (d?.DirectionRatios
        ? new THREE.Vector3(val(d.DirectionRatios, 0), val(d.DirectionRatios, 1), val(d.DirectionRatios, 2)).normalize()
        : new THREE.Vector3(dx, dy, dz));
    const xDir = dir(rel.RefDirection, 1, 0, 0);
    const zDir = dir(rel.Axis, 0, 0, 1);
    const yDir = new THREE.Vector3().crossVectors(zDir, xDir).normalize();

    const local = new THREE.Matrix4().set(
        xDir.x, yDir.x, zDir.x, tx,
        xDir.y, yDir.y, zDir.y, ty,
        xDir.z, yDir.z, zDir.z, tz,
        0, 0, 0, 1,
    );
    return m.multiply(local);
}

// ── Geometrie-Helfer (exportiert für Tests + Plotter) ───────────────────────

/** 3D-Länge der Polylinie (2D wenn keine Höhen). */
export function polylineLength(pts) {
    let s = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        s += Math.hypot(
            pts[i + 1].x - pts[i].x,
            (pts[i + 1].y ?? 0) - (pts[i].y ?? 0),
            pts[i + 1].z - pts[i].z,
        );
    }
    return s;
}

/**
 * Gefälle in ‰ aus den Achs-Höhen: Δy zwischen Anfang und Ende bezogen auf
 * die horizontale Länge. null wenn die Achse keine Höheninformation trägt.
 */
export function polylineGefaellePromille(pts) {
    if (pts.length < 2) return null;
    let l2d = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        l2d += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    }
    if (l2d < 1e-9) return null;
    const dy = (pts[0].y ?? 0) - (pts[pts.length - 1].y ?? 0);
    if (Math.abs(dy) < 1e-9) return null; // 2D-Achse oder exakt horizontal
    return (dy / l2d) * 1000;
}

/** Längstes Einzelsegment (für die Label-Platzierung). */
export function longestSegment(pts) {
    let best = null, bestLen = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
        const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        if (len > bestLen) {
            bestLen = len;
            best = { x1: pts[i].x, z1: pts[i].z, x2: pts[i + 1].x, z2: pts[i + 1].z, len };
        }
    }
    return best;
}

/** Textwinkel lesbar halten: nie kopfüber (−90° … +90°]. */
export function normalizeTextAngle(angleDeg) {
    let a = angleDeg;
    while (a > 90) a -= 180;
    while (a <= -90) a += 180;
    return a;
}

/** Gefälle-Anzeige: „5,2 ‰" (Betrag — Fließrichtung zeigt die Achse). */
export function formatGefaelle(promille) {
    if (promille == null || !Number.isFinite(promille)) return '';
    return `${Math.abs(promille).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ‰`;
}
