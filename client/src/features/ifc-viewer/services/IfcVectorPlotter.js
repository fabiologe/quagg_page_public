/**
 * IFC Vector Plotter
 *
 * Draws two types of vector lines into a jsPDF document:
 *
 *  TYPE 1 — Section contour (thick black):
 *    Triangle–plane intersections of visible fragment meshes.
 *    These are the "cut" lines in a technical floor plan.
 *
 *  TYPE 2 — Below-cut projection (thin, coloured by IFC type):
 *    2D FootPrint / Axis curves from web-ifc entity data,
 *    with a bounding-box fallback for elements that have no 2D representation.
 *
 * Coordinate mapping (orthographic top-down view):
 *   worldX → paperX = (worldX - cam.left) / (cam.right - cam.left) * dw + M
 *   worldZ → paperY = (1 - (worldZ - cam.bottom) / (cam.top - cam.bottom)) * dh + M
 *   (Three.js OrthoCam looking down -Y: cam.left/right span X, cam.top/bottom span Z)
 */

import * as THREE from 'three';

// ── Line styles (colour + width in mm) ──────────────────────────────────────

export const VECTOR_LINE_STYLES = {
    // Architectural
    IFCWALL:              { r: 0,   g: 0,   b: 0,   w: 0.35, dash: false },
    IFCWALLSTANDARDCASE:  { r: 0,   g: 0,   b: 0,   w: 0.35, dash: false },
    IFCWALLTYPE:          { r: 0,   g: 0,   b: 0,   w: 0.35, dash: false },
    IFCCOLUMN:            { r: 0,   g: 0,   b: 0,   w: 0.5,  dash: false },
    IFCCOLUMNTYPE:        { r: 0,   g: 0,   b: 0,   w: 0.5,  dash: false },
    IFCSLAB:              { r: 60,  g: 60,  b: 60,  w: 0.18, dash: false },
    IFCSLABTYPE:          { r: 60,  g: 60,  b: 60,  w: 0.18, dash: false },
    IFCDOOR:              { r: 0,   g: 0,   b: 0,   w: 0.18, dash: false },
    IFCDOORTYPE:          { r: 0,   g: 0,   b: 0,   w: 0.18, dash: false },
    IFCWINDOW:            { r: 0,   g: 100, b: 200, w: 0.18, dash: false },
    IFCWINDOWTYPE:        { r: 0,   g: 100, b: 200, w: 0.18, dash: false },
    IFCBEAM:              { r: 0,   g: 0,   b: 0,   w: 0.35, dash: false },
    IFCBEAMTYPE:          { r: 0,   g: 0,   b: 0,   w: 0.35, dash: false },
    IFCSTAIR:             { r: 80,  g: 80,  b: 80,  w: 0.18, dash: true  },
    IFCSTAIRFLIGHT:       { r: 80,  g: 80,  b: 80,  w: 0.18, dash: true  },
    IFCROOF:              { r: 80,  g: 80,  b: 80,  w: 0.18, dash: true  },
    IFCFOOTING:           { r: 80,  g: 80,  b: 80,  w: 0.25, dash: false },
    IFCFOOTINGTYPE:       { r: 80,  g: 80,  b: 80,  w: 0.25, dash: false },
    IFCPLATE:             { r: 80,  g: 80,  b: 80,  w: 0.18, dash: false },
    IFCMEMBER:            { r: 40,  g: 40,  b: 40,  w: 0.25, dash: false },

    // MEP / Infrastructure
    IFCPIPESEGMENT:       { r: 200, g: 80,  b: 0,   w: 0.18, dash: false },
    IFCPIPEFITTING:       { r: 200, g: 80,  b: 0,   w: 0.18, dash: false },
    IFCPIPESEGMENTTYPE:   { r: 200, g: 80,  b: 0,   w: 0.18, dash: false },
    IFCDUCT:              { r: 0,   g: 120, b: 120, w: 0.18, dash: false },
    IFCDUCTFITTING:       { r: 0,   g: 120, b: 120, w: 0.18, dash: false },
    IFCDUCTTYPE:          { r: 0,   g: 120, b: 120, w: 0.18, dash: false },
    IFCFLOWSEGMENT:       { r: 180, g: 60,  b: 0,   w: 0.15, dash: false },
    IFCFLOWFITTING:       { r: 180, g: 60,  b: 0,   w: 0.15, dash: false },
    IFCFLOWTERMINAL:      { r: 180, g: 60,  b: 0,   w: 0.15, dash: false },
    IFCAIRTERMINAL:       { r: 0,   g: 120, b: 130, w: 0.15, dash: false },
    IFCPUMP:              { r: 100, g: 0,   b: 200, w: 0.18, dash: false },
    IFCVALVE:             { r: 100, g: 0,   b: 200, w: 0.18, dash: false },
    IFCFURNITURE:         { r: 120, g: 90,  b: 50,  w: 0.12, dash: false },
    IFCFURNITURETYPE:     { r: 120, g: 90,  b: 50,  w: 0.12, dash: false },

    // Unknown / irregular → light grey dashed BBox
    default: { r: 160, g: 160, b: 160, w: 0.1, dash: true, bboxOnly: true },
};

// Section contour style (Type 1 — cut line through geometry)
const SECTION_CONTOUR_STYLE = { r: 0, g: 0, b: 0, w: 0.5 };

// ── Coordinate transform ──────────────────────────────────────────────────────

/**
 * Build a world→paper transform from the current orthographic camera frustum.
 * The camera looks down -Y, so its left/right spans world X and top/bottom spans world Z.
 *
 * @param {THREE.OrthographicCamera} cam
 * @param {number} M   - margin in mm
 * @param {number} dw  - drawing area width in mm
 * @param {number} dh  - drawing area height in mm
 */
function makePaperTransform(cam, M, dw, dh) {
    // cam.left/right/top/bottom are CAMERA-LOCAL coords. For the top-down ortho
    // camera built by getScaleSnapshot (up=(0,0,-1), looking down -Y), the world
    // bounds of the visible plane are:
    //   worldX_range = cam.position.x + [cam.left, cam.right]
    //   worldZ_range = cam.position.z - [cam.top, cam.bottom]   (negated: up=-Z)
    // and "camera top" (+halfH) corresponds to SMALLER world Z (which is paper top → low pixel Y).
    const z   = cam.zoom || 1;
    const wW  = (cam.right - cam.left) / z;
    const wH  = (cam.top   - cam.bottom) / z;

    const wXmin = cam.position.x + cam.left   / z;
    const wXmax = cam.position.x + cam.right  / z;
    const wZmin = cam.position.z - cam.top    / z;  // paper-top edge
    const wZmax = cam.position.z - cam.bottom / z;  // paper-bottom edge

    return {
        toX: (wx) => (wx - wXmin) / (wXmax - wXmin) * dw + M,
        toY: (wz) => (wz - wZmin) / (wZmax - wZmin) * dh + M,
        // Expose bounds for any caller that needs them (and for debug)
        _bounds: { wXmin, wXmax, wZmin, wZmax, wW, wH },
    };
}

// ── Type 1: Section contour via triangle–plane intersection ──────────────────

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _mat = new THREE.Matrix4();

/**
 * Walk the Three.js scene and collect line segments where the cut plane
 * intersects each triangle. Handles both indexed and non-indexed geometry.
 * Skips LODMesh instance matrices (uses base geometry at world position).
 *
 * @param {THREE.Object3D} scene
 * @param {THREE.Plane}    cutPlane
 * @returns {{ x1, z1, x2, z2 }[]}
 */
export function computeSectionContour(scene, cutPlane) {
    const segs = [];
    scene.traverse(obj => {
        if (!obj.isMesh) return;
        const geo = obj.geometry;
        if (!geo?.attributes?.position) return;

        const pos = geo.attributes.position;
        const idx = geo.index;
        _mat.copy(obj.matrixWorld);

        const faceCount = idx ? idx.count / 3 : pos.count / 3;

        for (let f = 0; f < faceCount; f++) {
            const ai = idx ? idx.getX(f * 3)     : f * 3;
            const bi = idx ? idx.getX(f * 3 + 1) : f * 3 + 1;
            const ci = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
            _vA.fromBufferAttribute(pos, ai).applyMatrix4(_mat);
            _vB.fromBufferAttribute(pos, bi).applyMatrix4(_mat);
            _vC.fromBufferAttribute(pos, ci).applyMatrix4(_mat);
            const seg = _trianglePlaneIntersect(cutPlane, _vA, _vB, _vC);
            if (seg) segs.push(seg);
        }
    });
    return segs;
}

/** Compute intersection of a single triangle with a plane.
 *  Returns { x1, z1, x2, z2 } or null. */
function _trianglePlaneIntersect(plane, a, b, c) {
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

// ── Type 2: IFC 2D FootPrint extraction ─────────────────────────────────────

const PRODUCT_TYPES_TO_QUERY = [
    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCOLUMN', 'IFCSLAB', 'IFCDOOR', 'IFCWINDOW',
    'IFCBEAM', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCROOF', 'IFCFOOTING', 'IFCPLATE', 'IFCMEMBER',
    'IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCDUCT', 'IFCDUCTFITTING',
    'IFCFLOWSEGMENT', 'IFCFLOWFITTING', 'IFCFLOWTERMINAL', 'IFCAIRTERMINAL',
    'IFCPUMP', 'IFCVALVE', 'IFCFURNITURE',
    'IFCBUILDINGELEMENTPROXY',  // generic/irregular elements → bboxOnly fallback
];

/**
 * Extract 2D polyline segments from IFC FootPrint/Axis representations.
 * For elements without a 2D representation, falls back to a top-view BBox outline
 * derived from the fragment model — so every element gets at least an indication.
 *
 * @param {object} webIfc       - IfcLoader.webIfc (raw web-ifc API)
 * @param {number} modelID      - web-ifc model ID (usually 0)
 * @param {object|null} model   - OBC FragmentsModel (for BBox fallback); null = skip fallback
 * @returns {Promise<{ segments: { x1, z1, x2, z2 }[], category: string, hasBbox: boolean }[]>}
 */
export async function extractFootprintSegments(webIfc, modelID, model = null) {
    const results = [];
    // Track IDs per category that had a FootPrint so we know which need BBox fallback
    const allByCategory = new Map();
    const withFootprint = new Set();

    for (const typeName of PRODUCT_TYPES_TO_QUERY) {
        const typeConst = webIfc[typeName];
        if (!typeConst) continue;

        let ids;
        try { ids = webIfc.GetLineIDsWithType(modelID, typeConst); } catch { continue; }
        if (!ids?.length) continue;
        allByCategory.set(typeName, [...ids]);

        for (const id of ids) {
            let product;
            try { product = webIfc.GetLine(modelID, id, true); } catch { continue; }
            if (!product) continue;

            const segs = _extractProductCurves(product);
            if (segs.length > 0) {
                results.push({ segments: segs, category: typeName, hasBbox: false });
                withFootprint.add(id);
            }
        }
    }

    // BBox fallback: for every IFC element NOT covered by a FootPrint,
    // derive a top-down rectangle from the fragment model's bounding box.
    if (model && typeof model.getBoxes === 'function') {
        for (const [typeName, ids] of allByCategory) {
            const missing = ids.filter(id => !withFootprint.has(id));
            if (!missing.length) continue;

            let boxes;
            try { boxes = await model.getBoxes(missing); } catch { continue; }
            if (!boxes?.length) continue;

            for (const box of boxes) {
                if (!box || box.isEmpty()) continue;
                // Project the 3D box onto the XZ plane (top-down view)
                const x1 = box.min.x, x2 = box.max.x;
                const z1 = box.min.z, z2 = box.max.z;
                const rect = [
                    { x1, z1, x2, z2: z1 }, // bottom edge
                    { x1: x2, z1, x2, z2 }, // right edge
                    { x1: x2, z1: z2, x2: x1, z2 }, // top edge
                    { x1, z1: z2, x2: x1, z2: z1 }, // left edge
                ];
                results.push({ segments: rect, category: typeName, hasBbox: true });
            }
        }
    }

    return results;
}

/**
 * Try to extract 2D curve segments from a product's representations.
 * Handles IFCPOLYLINE, IFCCOMPOSITECURVE, IFCGEOMETRICCURVESET.
 * Returns [] if no 2D representation found.
 */
function _extractProductCurves(product) {
    const reps = product?.Representation?.Representations;
    if (!Array.isArray(reps)) return [];

    for (const rep of reps) {
        const ident = rep?.RepresentationIdentifier?.value ?? rep?.RepresentationIdentifier;
        if (ident !== 'FootPrint' && ident !== 'Axis') continue;

        const placement = _buildPlacementMatrix(product?.ObjectPlacement);
        const segs = [];
        for (const item of rep?.Items ?? []) {
            _extractCurveItem(item, placement, segs);
        }
        if (segs.length > 0) return segs;
    }
    return [];
}

/** Recursively extract line segments from IFC curve entities. */
function _extractCurveItem(item, matrix, out) {
    if (!item) return;

    // IFCPOLYLINE: array of IfcCartesianPoint
    if (item.Points) {
        const pts = item.Points.filter(Boolean).map(p => _applyPlacement(p, matrix));
        for (let i = 0; i + 1 < pts.length; i++) {
            out.push({ x1: pts[i].x, z1: pts[i].z, x2: pts[i+1].x, z2: pts[i+1].z });
        }
        // Close loop if last point ≠ first
        if (pts.length > 2) {
            const f = pts[0], l = pts[pts.length - 1];
            if (Math.abs(f.x - l.x) > 0.001 || Math.abs(f.z - l.z) > 0.001) {
                out.push({ x1: l.x, z1: l.z, x2: f.x, z2: f.z });
            }
        }
        return;
    }

    // IFCCOMPOSITECURVE: array of IfcCompositeCurveSegment → ParentCurve
    if (item.Segments) {
        for (const seg of item.Segments ?? []) {
            _extractCurveItem(seg?.ParentCurve ?? seg, matrix, out);
        }
        return;
    }

    // IFCGEOMETRICCURVESET: array of Elements (curves)
    if (item.Elements) {
        for (const el of item.Elements ?? []) {
            _extractCurveItem(el, matrix, out);
        }
        return;
    }

    // IFCTRIMMEDCURVE: BasisCurve
    if (item.BasisCurve) {
        _extractCurveItem(item.BasisCurve, matrix, out);
    }
}

/**
 * Extract X/Z world coordinates from an IfcCartesianPoint,
 * applying the product's placement matrix.
 * IFC 2D points typically have [X, Y] in the local horizontal plane.
 */
function _applyPlacement(pt, matrix) {
    const coords = pt?.Coordinates ?? pt?.coordinates ?? [];
    const lx = (typeof coords[0] === 'object' ? coords[0].value : coords[0]) ?? 0;
    const lz = (typeof coords[1] === 'object' ? coords[1].value : coords[1]) ?? 0;
    // matrix is a THREE.Matrix4; apply to [lx, 0, lz]
    const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(matrix);
    return { x: v.x, z: v.z };
}

/**
 * Build a THREE.Matrix4 from the IFC product's ObjectPlacement.
 * Traverses IfcLocalPlacement → RelativePlacement → IfcAxis2Placement3D.
 * Returns identity if placement cannot be resolved.
 *
 * Composition: child = parent × local (so the result transforms local → world).
 */
function _buildPlacementMatrix(placement) {
    if (!placement) return new THREE.Matrix4();

    // Start with the parent placement chain (or identity if no parent)
    const m = placement.PlacementRelTo
        ? _buildPlacementMatrix(placement.PlacementRelTo)
        : new THREE.Matrix4();

    const rel = placement.RelativePlacement;
    if (!rel) return m;

    const loc = rel.Location;
    if (!loc) return m;

    const getCoord = (c, i) => {
        const arr = c?.Coordinates ?? c?.coordinates ?? [];
        const v = arr[i];
        return (typeof v === 'object' ? v?.value : v) ?? 0;
    };

    const tx = getCoord(loc, 0);
    const ty = getCoord(loc, 1);
    const tz = getCoord(loc, 2);

    const rd = rel.RefDirection;
    const ax = rel.Axis;

    const xDir = new THREE.Vector3(
        rd ? (typeof rd.DirectionRatios[0] === 'object' ? rd.DirectionRatios[0].value : rd.DirectionRatios[0]) : 1,
        rd ? (typeof rd.DirectionRatios[1] === 'object' ? rd.DirectionRatios[1].value : rd.DirectionRatios[1]) : 0,
        rd ? (typeof rd.DirectionRatios[2] === 'object' ? rd.DirectionRatios[2].value : rd.DirectionRatios[2]) : 0,
    ).normalize();

    const zDir = new THREE.Vector3(
        ax ? (typeof ax.DirectionRatios[0] === 'object' ? ax.DirectionRatios[0].value : ax.DirectionRatios[0]) : 0,
        ax ? (typeof ax.DirectionRatios[1] === 'object' ? ax.DirectionRatios[1].value : ax.DirectionRatios[1]) : 0,
        ax ? (typeof ax.DirectionRatios[2] === 'object' ? ax.DirectionRatios[2].value : ax.DirectionRatios[2]) : 1,
    ).normalize();

    const yDir = new THREE.Vector3().crossVectors(zDir, xDir).normalize();

    const local = new THREE.Matrix4().set(
        xDir.x, yDir.x, zDir.x, tx,
        xDir.y, yDir.y, zDir.y, ty,
        xDir.z, yDir.z, zDir.z, tz,
        0,      0,      0,      1,
    );

    m.multiply(local);
    return m;
}

// ── Main draw entry point ────────────────────────────────────────────────────

/**
 * Draw all vector lines into an open jsPDF document.
 *
 * @param {jsPDF}                   doc       - Active jsPDF doc (already has raster bg or blank)
 * @param {THREE.OrthographicCamera} cam      - Current orthographic camera
 * @param {THREE.Scene}              scene    - Three.js scene (for section contour)
 * @param {THREE.Plane|null}         cutPlane - Active clip plane (null = skip contour)
 * @param {object|null}              ifcData  - { webIfc, modelID, model? } or null
 * @param {number}                   M        - Margin in mm
 * @param {number}                   dw       - Drawing width in mm
 * @param {number}                   dh       - Drawing height in mm
 * @param {object}                   opts     - { hatch?, scaleBar?, scaleRatio? }
 */
export async function drawVectorPlan(doc, cam, scene, cutPlane, ifcData, M, dw, dh, opts = {}) {
    const { toX, toY } = makePaperTransform(cam, M, dw, dh);

    // ── TYPE 0: Per-element outlines (BBox or concave Triangle-Union) ───────
    if (opts.outlines && opts.outlines.length) {
        _drawCategoryOutlines(doc, opts.outlines, toX, toY, M, dw, dh,
            opts.styleMap, opts.styleToLegacy, opts.styleMapPerModel);
    }

    // ── TYPE 1: Section contour + closed-polygon hatching ──────────────────
    if (cutPlane) {
        const contourSegs = computeSectionContour(scene, cutPlane);

        if (opts.hatch && contourSegs.length) {
            const polys = _chainSegmentsToPolygons(contourSegs);
            _drawHatchPolygons(doc, polys, toX, toY, M, dw, dh);
        }

        doc.setDrawColor(SECTION_CONTOUR_STYLE.r, SECTION_CONTOUR_STYLE.g, SECTION_CONTOUR_STYLE.b);
        doc.setLineWidth(SECTION_CONTOUR_STYLE.w);
        for (const s of contourSegs) {
            const px1 = toX(s.x1), py1 = toY(s.z1);
            const px2 = toX(s.x2), py2 = toY(s.z2);
            if (_inBounds(px1, py1, M, dw, dh) || _inBounds(px2, py2, M, dw, dh)) {
                doc.line(px1, py1, px2, py2);
            }
        }
    }

    // ── TYPE 2: IFC 2D FootPrint / Axis + BBox fallback ─────────────────────
    if (ifcData?.webIfc != null) {
        const products = await extractFootprintSegments(
            ifcData.webIfc, ifcData.modelID, ifcData.model ?? null
        );
        for (const { segments, category, hasBbox } of products) {
            const style = VECTOR_LINE_STYLES[category] ?? VECTOR_LINE_STYLES.default;
            doc.setDrawColor(style.r, style.g, style.b);
            // BBox-derived rects render thinner + dashed to differentiate from real footprints
            doc.setLineWidth(hasBbox ? Math.min(style.w, 0.1) : style.w);
            if (style.dash || hasBbox) doc.setLineDashPattern([0.5, 0.5], 0);
            else                        doc.setLineDashPattern([], 0);

            for (const s of segments) {
                const px1 = toX(s.x1), py1 = toY(s.z1);
                const px2 = toX(s.x2), py2 = toY(s.z2);
                if (_inBounds(px1, py1, M, dw, dh) || _inBounds(px2, py2, M, dw, dh)) {
                    doc.line(px1, py1, px2, py2);
                }
            }
        }
        doc.setLineDashPattern([], 0); // reset
    }

    // ── Annotations + Measurements (drawn on top of geometry) ───────────────
    if (opts.annotations?.length) _drawAnnotations(doc, opts.annotations, toX, toY, M, dw, dh);
    if (opts.measurements?.length) _drawMeasurements(doc, opts.measurements, toX, toY, M, dw, dh);

    // ── Scale bar + North arrow (drawn last so they sit on top) ─────────────
    if (opts.scaleBar && opts.scaleRatio) {
        _drawScaleBar(doc, M, dw, dh, opts.scaleRatio);
        _drawNorthArrow(doc, M, dw, dh);
    }
}

// ── Annotations (3D pins → 2D paper) ────────────────────────────────────────
function _drawAnnotations(doc, annotations, toX, toY, M, dw, dh) {
    for (const ann of annotations) {
        // Annotation position is stored as [x, y, z] world — project to top-down (x, z)
        const wx = ann.position[0];
        const wz = ann.position[2];
        const px = toX(wx);
        const py = toY(wz);
        if (!_inBounds(px, py, M, dw, dh)) continue;

        // Pin: filled circle in annotation color
        const c = _hexToRgb(ann.color ?? '#e91e63');
        doc.setFillColor(c.r, c.g, c.b);
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.3);
        doc.circle(px, py, 1.6, 'FD');           // filled with white outline

        // Index inside pin
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(String(ann.idx ?? '?'), px, py + 0.7, { align: 'center' });

        // Text label next to the pin (with white halo for readability)
        if (ann.text) {
            const tx = px + 3;
            const ty = py;
            const txt = ann.text.length > 40 ? ann.text.slice(0, 37) + '…' : ann.text;
            doc.setFontSize(7);
            doc.setTextColor(255, 255, 255);
            for (const [ox, oy] of [[-0.25,0],[0.25,0],[0,-0.25],[0,0.25]]) {
                doc.text(txt, tx + ox, ty + oy);
            }
            doc.setTextColor(c.r, c.g, c.b);
            doc.text(txt, tx, ty);
        }
    }
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
}

// ── Measurements (3D 2-point distances → 2D paper) ──────────────────────────
function _drawMeasurements(doc, measurements, toX, toY, M, dw, dh) {
    doc.setDrawColor(255, 152, 0);     // orange — Viewer uses bright yellow, orange prints better
    doc.setFillColor(255, 152, 0);
    doc.setLineWidth(0.3);

    for (const m of measurements) {
        if (!m?.p1 || !m?.p2) continue;
        const px1 = toX(m.p1.x), py1 = toY(m.p1.z);
        const px2 = toX(m.p2.x), py2 = toY(m.p2.z);
        if (!_inBounds(px1, py1, M, dw, dh) && !_inBounds(px2, py2, M, dw, dh)) continue;

        // Line + endpoint markers (small filled triangles for arrow look)
        doc.line(px1, py1, px2, py2);
        doc.circle(px1, py1, 0.6, 'F');
        doc.circle(px2, py2, 0.6, 'F');

        // Distance label centred above
        const mx = (px1 + px2) / 2;
        const my = (py1 + py2) / 2;
        const angle = Math.atan2(py2 - py1, px2 - px1) * 180 / Math.PI;
        const label = m.dist < 1   ? `${(m.dist * 1000).toFixed(0)} mm`
                    : m.dist < 10  ? `${m.dist.toFixed(2)} m`
                    :                `${m.dist.toFixed(1)} m`;

        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        for (const [ox, oy] of [[-0.3,0],[0.3,0],[0,-0.3],[0,0.3]]) {
            doc.text(label, mx + ox, my - 1.5 + oy, { align: 'center', angle: -angle });
        }
        doc.setTextColor(255, 152, 0);
        doc.text(label, mx, my - 1.5, { align: 'center', angle: -angle });
    }
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
}

function _hexToRgb(hex) {
    const m = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (!m) return { r: 233, g: 30, b: 99 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// ── Polygon chaining: connect contour segments into closed loops ────────────
/**
 * Build closed polygons from a soup of segments by joining ones that share endpoints.
 * Tolerant matching (1 mm world snap) — IFC tessellation often produces tiny gaps.
 * Returns Array<Array<{x, z}>>  — each inner array is a closed ring.
 */
function _chainSegmentsToPolygons(segs) {
    if (!segs.length) return [];
    const EPS = 0.005; // 5 mm snap
    const key = (p) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`;

    // Build adjacency map: endpoint → list of segment indices that touch it
    const pool = segs.map((s, i) => ({ i, used: false, a: { x: s.x1, z: s.z1 }, b: { x: s.x2, z: s.z2 } }));
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
            if (key(head) === key(ring[0])) break; // closed
        }
        // Only keep rings that closed and are big enough to bother with
        if (ring.length >= 4 && key(head) === key(ring[0])) polys.push(ring);
    }
    return polys;
}

/**
 * Draw a 45° crosshatch fill inside each polygon — concrete-style pattern.
 * Uses a single line-clipping pass per polygon (Sutherland-Hodgman not needed —
 * we just test each scan line's intersections with the polygon edges).
 */
function _drawHatchPolygons(doc, polys, toX, toY, M, dw, dh) {
    if (!polys.length) return;
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.08);
    const SPACING = 2; // mm spacing in paper space — tight for concrete look

    for (const poly of polys) {
        // Polygon in paper-mm space
        const ppts = poly.map(p => ({ x: toX(p.x), y: toY(p.z) }));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of ppts) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        // Diagonal hatch: line direction (1,1). Iterate offset c = x + y from minX+minY to maxX+maxY
        for (let c = Math.floor(minX + minY); c <= maxX + maxY; c += SPACING) {
            // Line: x + y = c  → from (c - maxY, maxY) to (maxX, c - maxX) clipped to bbox
            // Compute intersections with all polygon edges
            const hits = [];
            for (let i = 0; i < ppts.length - 1; i++) {
                const a = ppts[i], b = ppts[i + 1];
                // Solve t for a + t*(b-a) such that (a.x + t*dx) + (a.y + t*dy) = c
                const dx = b.x - a.x, dy = b.y - a.y;
                const denom = dx + dy;
                if (Math.abs(denom) < 1e-6) continue;
                const t = (c - a.x - a.y) / denom;
                if (t < 0 || t > 1) continue;
                hits.push({ x: a.x + t * dx, y: a.y + t * dy });
            }
            if (hits.length < 2) continue;
            // Sort by x and connect pairs (in/out intervals)
            hits.sort((a, b) => a.x - b.x);
            for (let i = 0; i + 1 < hits.length; i += 2) {
                doc.line(hits[i].x, hits[i].y, hits[i + 1].x, hits[i + 1].y);
            }
        }
    }
}

// ── Scale bar (DIN-style) ───────────────────────────────────────────────────
function _drawScaleBar(doc, M, dw, dh, scaleRatio) {
    // Bar 20 mm wide at scale 1:100 → represents 2 m. We pick a nice round metre value.
    const barLengthMm = 40; // 4 cm on paper regardless of scale
    const worldMeters = (barLengthMm / 1000) * scaleRatio; // metres represented
    const niceValues  = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const nice        = niceValues.reduce((best, v) =>
        Math.abs(v - worldMeters) < Math.abs(best - worldMeters) ? v : best, niceValues[0]);
    const adjustedMm  = (nice / scaleRatio) * 1000;

    const x0 = M + dw - adjustedMm - 5;
    const y0 = M + dh - 8;
    const h  = 2; // bar height in mm

    // Two-segment bar (alternating black/white) for classic scale look
    const half = adjustedMm / 2;
    doc.setFillColor(0);
    doc.rect(x0, y0, half, h, 'F');
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    doc.rect(x0 + half, y0, half, h, 'S');

    // Tick labels
    doc.setFontSize(7); doc.setTextColor(0);
    doc.text('0', x0, y0 - 0.5, { align: 'center' });
    doc.text(`${nice / 2}`, x0 + half, y0 - 0.5, { align: 'center' });
    doc.text(`${nice} m`, x0 + adjustedMm, y0 - 0.5, { align: 'center' });

    // Scale label below
    doc.setFontSize(6); doc.setTextColor(60);
    doc.text(`1 : ${scaleRatio}`, x0 + adjustedMm / 2, y0 + h + 2.5, { align: 'center' });
}

// ── North arrow (top-right of drawing area) ─────────────────────────────────
function _drawNorthArrow(doc, M, dw, dh) {
    const cx = M + dw - 10;
    const cy = M + 12;
    const r  = 7;

    doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.circle(cx, cy, r, 'S');

    // Solid north triangle (top half, black) + white bottom half (outline)
    doc.setFillColor(0);
    doc.triangle(cx, cy - r * 0.85, cx - r * 0.4, cy, cx + r * 0.4, cy, 'F');
    doc.setFillColor(255);
    doc.triangle(cx, cy + r * 0.85, cx - r * 0.4, cy, cx + r * 0.4, cy, 'FD');

    doc.setFontSize(7); doc.setTextColor(0);
    doc.text('N', cx, cy - r - 1.2, { align: 'center' });
}

function _inBounds(x, y, M, dw, dh) {
    return x >= M - 1 && x <= M + dw + 1 && y >= M - 1 && y <= M + dh + 1;
}

// ── Cohen–Sutherland line clipping ──────────────────────────────────────────
// Clips a segment (x1,y1)→(x2,y2) to the rectangle [M..M+dw, M..M+dh].
// Returns null if entirely outside, else { x1, y1, x2, y2 } of the visible part.
const _INSIDE = 0, _LEFT = 1, _RIGHT = 2, _BOTTOM = 4, _TOP = 8;
function _outCode(x, y, xmin, ymin, xmax, ymax) {
    let code = _INSIDE;
    if (x < xmin) code |= _LEFT;
    else if (x > xmax) code |= _RIGHT;
    if (y < ymin) code |= _BOTTOM;
    else if (y > ymax) code |= _TOP;
    return code;
}
function _clipLine(x1, y1, x2, y2, M, dw, dh) {
    const xmin = M, xmax = M + dw, ymin = M, ymax = M + dh;
    let c1 = _outCode(x1, y1, xmin, ymin, xmax, ymax);
    let c2 = _outCode(x2, y2, xmin, ymin, xmax, ymax);
    while (true) {
        if (!(c1 | c2)) return { x1, y1, x2, y2 };          // both inside
        if (c1 & c2)    return null;                         // both outside, same side
        const c = c1 || c2;
        let x = 0, y = 0;
        if      (c & _TOP)    { x = x1 + (x2 - x1) * (ymax - y1) / (y2 - y1); y = ymax; }
        else if (c & _BOTTOM) { x = x1 + (x2 - x1) * (ymin - y1) / (y2 - y1); y = ymin; }
        else if (c & _RIGHT)  { y = y1 + (y2 - y1) * (xmax - x1) / (x2 - x1); x = xmax; }
        else if (c & _LEFT)   { y = y1 + (y2 - y1) * (xmin - x1) / (x2 - x1); x = xmin; }
        if (c === c1) { x1 = x; y1 = y; c1 = _outCode(x1, y1, xmin, ymin, xmax, ymax); }
        else          { x2 = x; y2 = y; c2 = _outCode(x2, y2, xmin, ymin, xmax, ymax); }
    }
}

/**
 * Draw the outlines produced by the IfcGeometryProcessor.
 * Each entry: { category, rings: [outer, hole1, …], bbox, fallback? }
 * rings carry world-space (u,v) — we transform with toX/toY which map world→paper.
 *
 * @param {object} styleMap - optional user style overrides (Category → style def)
 */
function _drawCategoryOutlines(doc, outlines, toX, toY, M, dw, dh, styleMap, styleToLegacy, styleMapPerModel) {
    for (const { category, rings, fallback, ruleStyle, modelId } of outlines) {
        // Pick the most specific style map: per-model override (if any) → global → default
        const perModel = (modelId && styleMapPerModel?.[modelId]) ? styleMapPerModel[modelId] : null;
        const baseStyle = perModel?.[category]
                       ?? styleMap?.[category]
                       ?? VECTOR_LINE_STYLES[category]
                       ?? VECTOR_LINE_STYLES.default;
        // Per-element rule overrides the base when a rule matched (ruleStyle is in
        // the high-level shape — convert via the legacy helper if provided)
        const overlay = ruleStyle && styleToLegacy ? styleToLegacy(ruleStyle) : null;
        const style = overlay ? { ...baseStyle, ...overlay } : baseStyle;
        if (style.enabled === false) continue;

        const r = style.r ?? 80, g = style.g ?? 80, b = style.b ?? 80;
        const baseW = style.w ?? 0.25;
        const w = Math.max(0.1, fallback === 'bbox' ? Math.min(baseW, 0.12) : baseW);
        doc.setDrawColor(r, g, b);
        doc.setLineWidth(w);
        // Dash: explicit pattern from style, or fall back to the legacy boolean flag
        const dashArr = style.dashPattern
            ?? (style.dash || fallback === 'bbox' ? [0.5, 0.5] : []);
        doc.setLineDashPattern(dashArr, 0);

        for (const ring of rings) {
            for (let i = 0; i < ring.length - 1; i++) {
                const a = ring[i], b = ring[i + 1];
                const px1 = toX(a[0]), py1 = toY(a[1]);
                const px2 = toX(b[0]), py2 = toY(b[1]);
                const clipped = _clipLine(px1, py1, px2, py2, M, dw, dh);
                if (clipped) doc.line(clipped.x1, clipped.y1, clipped.x2, clipped.y2);
            }
        }
    }
    doc.setLineDashPattern([], 0);
}
