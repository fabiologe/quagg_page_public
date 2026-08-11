import { jsPDF } from 'jspdf';
import * as THREE from 'three';
import { drawVectorPlan, computeSectionContour } from './IfcVectorPlotter.js';
import { extractConcaveOutlines }      from './IfcShapeOutlines.js';
import { vectorContentToDxf }          from './DxfExporter.js';
import { DEFAULT_LINE_STYLES }         from './DefaultLineStyles.js';
import { simplifyOutlines }            from './PolygonSimplify.js';
import { styleToLegacy }               from './VectorStyleEngine.js';
import { TERRAIN_CATEGORIES_DEFAULT } from './TerrainMesh.js';
import { createGeometryResolver }      from './geometry/GeometryResolver.js';
import { computeSlopeHatch }           from './SlopeHatch.js';
import { computeContourLines }         from './ContourLines.js';
import { extractAxisPolylines, formatGefaelle, AXIS_CATEGORIES_DEFAULT } from './AxisAnnotations.js';
import { renderLabelTemplate }         from './LabelTemplate.js';
import { FRAGMENTS_DATA_CONFIG }       from './IfcDataConfig.js';

/** Rebuild a THREE.OrthographicCamera from a serialized plot frustum. */
function _cameraFromFrustum(f) {
    const cam = new THREE.OrthographicCamera(f.left, f.right, f.top, f.bottom, -100000, 100000);
    cam.position.fromArray(f.position);
    cam.up.fromArray(f.up);
    cam.lookAt(new THREE.Vector3().fromArray(f.target));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    return cam;
}

const PAPER_SIZES = {
    A0: [841, 1189],
    A1: [594, 841],
    A2: [420, 594],
    A3: [297, 420],
    A4: [210, 297],
};

const M  = 10;  // margin mm
const TB = 40;  // title block height mm

/**
 * Draw the outer border + title block. Both raster and vector exports share
 * the exact same layout (4-column, 2-row Schriftfeld with logo cell).
 *
 * @param {jsPDF}  doc
 * @param {number} dw    drawing width (mm)
 * @param {number} dh    drawing height (mm)
 * @param {object} titleBlock { projekt, auftraggeber, bearbeiter, firma, nummer, datum, massstab, index }
 * @param {string|null} logo  base64 image data URL for the logo cell
 */
function _drawTitleBlock(doc, dw, dh, titleBlock, logo) {
    // Outer border around drawing + title block
    doc.setLineWidth(0.7);
    doc.setDrawColor(0);
    doc.rect(M, M, dw, dh + TB);

    const ty = M + dh;
    doc.setLineWidth(0.3);
    doc.line(M, ty, M + dw, ty);
    doc.line(M, ty + 20, M + dw, ty + 20);

    const cols = [0.40, 0.65, 0.82];
    cols.forEach(f => doc.line(M + dw * f, ty, M + dw * f, ty + TB));

    const cellMax = (f) => dw * (f === 0 ? 0.39 : 0.24) - 3;
    const writeCell = (lbl, val, f, baseY) => {
        doc.setFontSize(6); doc.setTextColor(130); doc.text(lbl, M + dw * f + 1.5, baseY);
        doc.setFontSize(9); doc.setTextColor(0);   doc.text(val, M + dw * f + 1.5, baseY + 7, { maxWidth: cellMax(f) });
    };

    writeCell('Projekt',      titleBlock.projekt      ?? '', 0,    ty + 4);
    writeCell('Auftraggeber', titleBlock.auftraggeber ?? '', 0.40, ty + 4);
    writeCell('Bearbeiter',   titleBlock.bearbeiter   ?? '', 0.65, ty + 4);

    const logoX = M + dw * 0.82;
    const logoW = dw * 0.18;
    if (logo) {
        doc.addImage(logo, logoX + 2, ty + 2, logoW - 4, TB - 4, '', 'FAST');
    } else {
        doc.setFontSize(6); doc.setTextColor(130); doc.text('Firma', logoX + 1.5, ty + 4);
        doc.setFontSize(9); doc.setTextColor(0);   doc.text(titleBlock.firma ?? '', logoX + 1.5, ty + 11, { maxWidth: logoW - 3 });
    }

    const defaultDate = new Date().toLocaleDateString('de-DE');
    writeCell('Nr.',     titleBlock.nummer   ?? '',                 0,    ty + 24);
    writeCell('Datum',   titleBlock.datum    || defaultDate,        0.40, ty + 24);
    writeCell('Maßstab', titleBlock.massstab ?? '1:100',            0.65, ty + 24);

    if (titleBlock.index) {
        doc.setFontSize(8); doc.setTextColor(0);
        doc.text(`Rev. ${titleBlock.index}`, M + dw * 0.65 + 1.5, ty + 37);
    }
}

/**
 * T2: Gemeinsame Vektor-Inhalts-Sammlung für PDF- UND DXF-Export.
 * Kamera-unabhängig — alles in Welt-Koordinaten.
 */
export async function collectVectorContent({
    viewDir = 'top', rules = [], fragmentsManager = null, cutPlane = null,
    labelTemplateFor = null, categoryGroups = null, fragmentsList = null,
    scaleRatio = null, slopeHatch = null, contours = null, axisLabels = null,
    ifcData = null, styleMap = null,
} = {}) {
    // ── Per-element concave outlines (BBox fallback per element on failure) ─
    let outlines = [];
    if (categoryGroups && fragmentsList) {
        try {
            outlines = await extractConcaveOutlines(categoryGroups, fragmentsList, {
                viewDir, rules, fragmentsManager, cutPlane,
                labelTemplateFor: labelTemplateFor ?? (() => ''),
            });
        } catch (e) {
            console.error('[PdfExporter] outlines pipeline crashed', e);
        }

        // Ramer-Douglas-Peucker simplification — removes triangle-zigzag.
        // Tolerance scales with the plot scale: at 1:100 a 2 cm world tolerance
        // collapses to 0.2 mm on paper (invisible). At 1:1000 we can be coarser.
        if (outlines.length && scaleRatio) {
            const epsilon = Math.max(0.005, scaleRatio * 0.0002); // metres
            outlines = simplifyOutlines(outlines, epsilon);
        }
    }

    // ── Sprint T1/G: Gelände-Auswertungen — über den GeometryResolver, damit
    // auch geschlossene Erdkörper-VOLUMENKÖRPER (IfcCivilElement) eine
    // Oberfläche liefern (Repräsentations-Mismatch, solid→surface).
    let slopeSegments = null;
    let contourLevels = null;
    if ((slopeHatch?.enabled || contours?.enabled) && categoryGroups && fragmentsList) {
        try {
            const terrainCats = slopeHatch?.categories?.length
                ? slopeHatch.categories
                : TERRAIN_CATEGORIES_DEFAULT;
            const resolver = createGeometryResolver({ categoryGroups, fragmentsList, fragmentsManager });
            const surf = await resolver.forCategory(terrainCats).getForm('surface', {
                // Böschungs-Oberkanten nicht auf Zellrasterbreite verschmieren
                cell: (slopeHatch?.enabled && scaleRatio)
                    ? Math.max(0.25, (((slopeHatch.tickSpacingMm ?? 3) / 1000) * scaleRatio) / 2)
                    : null,
            });
            if (surf.warnings?.length) console.warn('[GeometryResolver]', surf.warnings);
            const { positions, triCount } = surf.data ?? { positions: new Float64Array(0), triCount: 0 };
            if (triCount) {
                if (slopeHatch?.enabled && scaleRatio) {
                    slopeSegments = computeSlopeHatch(positions, triCount, {
                        minSlopeDeg: slopeHatch.minSlopeDeg ?? 20,
                        // Strichabstand: Papier-mm × Maßstab → Weltmeter
                        tickSpacingWorld: ((slopeHatch.tickSpacingMm ?? 3) / 1000) * scaleRatio,
                        // Striche unter 0,8 mm Papier sind nur Rauschen
                        minTickLenWorld: 0.0008 * scaleRatio,
                    }).segments;
                }
                if (contours?.enabled) {
                    contourLevels = computeContourLines(positions, triCount, {
                        interval: contours.interval ?? 0.5,
                        majorEvery: contours.majorEvery ?? 5,
                    });
                }
            }
        } catch (e) {
            console.error('[PdfExporter] Gelände-Auswertung fehlgeschlagen', e);
        }
    }

    // ── Sprint T1/AP-C: Haltungsbeschriftung entlang der Achse ──────────────
    let axisItems = null;
    if (axisLabels?.enabled) {
        try {
            axisItems = await _buildAxisLabelItems({
                apis: axisLabels.apis?.length ? axisLabels.apis : (ifcData ? [ifcData] : []),
                coordOffsets: axisLabels.coordOffsets ?? null,
                categories: axisLabels.categories?.length ? axisLabels.categories : AXIS_CATEGORIES_DEFAULT,
                fragmentsManager, labelTemplateFor, styleMap,
            });
        } catch (e) {
            console.error('[PdfExporter] Achs-Beschriftung fehlgeschlagen', e);
        }
    }

    return { outlines, slopeSegments, contourLevels, axisItems };
}

/**
 * T2: Vektor-Plan als DXF R12 (Rohkoordinaten E/N — fällt lagerichtig ins CAD).
 * Nimmt dieselben Optionen wie exportVectorPlanPDF, braucht aber keine Kamera.
 */
export async function exportVectorPlanDXF(opts = {}) {
    const {
        titleBlock = {}, scene = null, cutPlane = null,
        styleMap = null, scaleRatio = 100,
        coordOffset = { x: 0, z: 0 }, flipNorth = false,
    } = opts;

    const content = await collectVectorContent({ ...opts, viewDir: 'top' });

    // Schnittkontur (szenenweit) — im PDF macht das der Plotter, hier direkt
    let sectionSegments = null;
    if (scene && cutPlane) {
        try { sectionSegments = computeSectionContour(scene, cutPlane); } catch { /* */ }
    }

    const styleFor = (category) =>
        styleMap?.[category]
        ?? styleToLegacy(DEFAULT_LINE_STYLES[category] ?? DEFAULT_LINE_STYLES.default);

    const dxfText = vectorContentToDxf(
        { ...content, sectionSegments, styleFor },
        { offset: coordOffset, flipNorth, scaleRatio },
    );

    const safeName = (titleBlock.projekt || 'lageplan').replace(/[^\w\-]/g, '-');
    const blob = new Blob([dxfText], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── T1/AP-C: Achs-Beschriftungs-Daten (Extraktion + Label-Rendering) ────────

function _axScalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return typeof v === 'object' ? null : v;
}

const _AX_ATTR_KEYS = ['Name', 'Description', 'GlobalId', 'Tag', 'ObjectType', 'PredefinedType'];

/** OBC-getData-Items → Map<localId, {attributes, psets}> (Muster IfcShapeOutlines). */
function _axParseBatch(raw) {
    const out = new Map();
    const items = Object.values(raw ?? {})[0] ?? [];
    for (const item of items) {
        const localId = _axScalar(item._localId ?? item.localId ?? item.expressID);
        if (localId == null) continue;
        const attributes = {};
        for (const k of _AX_ATTR_KEYS) {
            const v = _axScalar(item?.[k]);
            if (v != null) attributes[k] = v;
        }
        const psets = {};
        for (const rel of (item?.IsDefinedBy ?? [])) {
            const psetName = _axScalar(rel?.Name);
            if (!psetName) continue;
            const props = {};
            for (const p of (rel?.HasProperties ?? [])) {
                const propName = _axScalar(p?.Name);
                const v = _axScalar(p?.NominalValue) ?? _axScalar(p?.Value);
                if (propName) props[propName] = v;
            }
            psets[psetName] = props;
        }
        out.set(localId, { attributes, psets });
    }
    return out;
}

/**
 * Achs-Polylinien + gerenderte Labels für alle Modelle/Kategorien.
 * Annahme (dokumentiert): fragments-localId ≙ web-ifc-expressID — bei Miss
 * bleibt das Label auf Geometrie-Werte (laenge/gefaelle) beschränkt.
 */
async function _buildAxisLabelItems({ apis, coordOffsets, categories, fragmentsManager, labelTemplateFor, styleMap }) {
    const items = [];
    for (const api of (apis ?? [])) {
        if (!api?.webIfc) continue;
        const modelKey = api.fragmentModelId ?? null;
        const off = modelKey != null ? (coordOffsets?.[modelKey] ?? null) : null;

        let products = [];
        try {
            products = extractAxisPolylines(api.webIfc, api.modelID, { categories, coordOffset: off });
        } catch { continue; }
        if (!products.length) continue;

        // je Kategorie: Template auflösen + EIN Batch-Pset-Fetch
        const byCat = new Map();
        for (const p of products) {
            (byCat.get(p.category) ?? byCat.set(p.category, []).get(p.category)).push(p);
        }
        for (const [cat, prods] of byCat) {
            const tpl = labelTemplateFor?.(cat, modelKey) ?? '';
            if (!tpl) continue;

            let dataById = new Map();
            if (fragmentsManager && modelKey != null) {
                try {
                    const raw = await fragmentsManager.getData(
                        { [modelKey]: prods.map(p => p.expressId) }, FRAGMENTS_DATA_CONFIG);
                    dataById = _axParseBatch(raw);
                } catch { /* Label ohne Pset-Anteile */ }
            }

            const fontMm = Number(styleMap?.[cat]?.labelFontSize) > 0 ? Number(styleMap[cat].labelFontSize) : 2.0;
            for (const p of prods) {
                const d = dataById.get(p.expressId) ?? { attributes: {}, psets: {} };
                const label = renderLabelTemplate(tpl, {
                    category: cat,
                    localId: p.expressId,
                    attributes: {
                        ...d.attributes,
                        laenge: p.laenge,
                        gefaelle: formatGefaelle(p.gefaelle),
                    },
                    psets: d.psets,
                });
                if (!label) continue;
                items.push({
                    polyline: p.polyline,
                    label: Array.isArray(label) ? label.join(' · ') : label,
                    fontMm,
                });
            }
        }
    }
    return items;
}

/**
 * T1/E5: Diagonales Status-Wasserzeichen („VORABZUG", „WIP", …).
 * GState-Opacity wenn verfügbar, sonst hellgrauer Text als Fallback.
 */
function _drawWatermark(doc, text, M, dw, dh) {
    const label = String(text).toUpperCase();
    const angle = Math.atan2(dh, dw) * 180 / Math.PI;
    // Zielbreite ~70 % der Diagonale; grobe Glyphenbreite ≈ 0,55 × Fontgröße
    const diag = Math.hypot(dw, dh);
    const fontMm = Math.min(60, (diag * 0.7) / (label.length * 0.55));
    doc.setFontSize(fontMm / 0.3528);

    let usedGState = false;
    try {
        if (typeof doc.saveGraphicsState === 'function' && typeof doc.GState === 'function') {
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.12 }));
            doc.setTextColor(120, 120, 120);
            usedGState = true;
        }
    } catch { /* Fallback unten */ }
    if (!usedGState) doc.setTextColor(225, 225, 225);

    doc.text(label, M + dw / 2, M + dh / 2, { align: 'center', angle });

    if (usedGState) {
        try { doc.restoreGraphicsState(); } catch { /* */ }
    }
    doc.setTextColor(0, 0, 0);
}

/**
 * Draw dimensions on the PDF.
 * @param {jsPDF}  doc
 * @param {{p1:{x,y}, p2:{x,y}, distInMeters:number}[]} dims  - p1/p2 in % (0..100) of drawing area
 * @param {number} ax, ay   - top-left of drawing area in mm
 * @param {number} aw, ah   - drawing area width/height in mm
 */
function _drawDimensions(doc, dims, ax, ay, aw, ah) {
    const fmt = (m) => m < 1 ? `${(m * 1000).toFixed(0)} mm`
                              : m < 10 ? `${m.toFixed(2)} m`
                              : `${m.toFixed(1)} m`;
    doc.setDrawColor(213, 0, 0);
    doc.setFillColor(213, 0, 0);
    doc.setLineWidth(0.25);

    for (const d of dims) {
        const x1 = ax + (d.p1.x / 100) * aw;
        const y1 = ay + (d.p1.y / 100) * ah;
        const x2 = ax + (d.p2.x / 100) * aw;
        const y2 = ay + (d.p2.y / 100) * ah;

        // Line + endpoint dots
        doc.line(x1, y1, x2, y2);
        doc.circle(x1, y1, 0.6, 'F');
        doc.circle(x2, y2, 0.6, 'F');

        // Label centred between endpoints, slightly above
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        const txt = fmt(d.distInMeters);

        // White halo behind text so it reads against any background
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        for (const [ox, oy] of [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]]) {
            doc.text(txt, mx + ox, my - 1.5 + oy, { align: 'center', angle: -angle });
        }
        doc.setTextColor(213, 0, 0);
        doc.text(txt, mx, my - 1.5, { align: 'center', angle: -angle });
    }

    // Restore defaults
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0);
    doc.setFillColor(0);
}

/**
 * Export the current plan as a PDF.
 * @param {object} opts
 * @param {string|null} opts.snapshot   - base64 PNG data URL of the 3D view
 * @param {string}      opts.format     - 'A0'|'A1'|'A2'|'A3'|'A4'
 * @param {string}      opts.orientation - 'landscape'|'portrait'
 * @param {object}      opts.titleBlock - Schriftfeld field values
 * @param {string|null} opts.logo       - base64 image for the logo cell (optional)
 */
export function exportPlanPDF({ snapshot, format, orientation, titleBlock, logo, dimensions = [] }) {
    const [baseW, baseH] = PAPER_SIZES[format] ?? PAPER_SIZES.A3;
    const [pw, ph] = orientation === 'landscape' ? [baseH, baseW] : [baseW, baseH];

    const doc = new jsPDF({ unit: 'mm', format: format.toLowerCase(), orientation });
    const dw = pw - 2 * M;
    const dh = ph - 2 * M - TB;

    // ── Drawing area ──────────────────────────────────────────────────
    if (snapshot) {
        doc.addImage(snapshot, 'PNG', M, M, dw, dh, '', 'FAST');
    } else {
        doc.setFillColor(240, 240, 240);
        doc.rect(M, M, dw, dh, 'F');
    }

    // ── Dimensions overlay (drawn on top of snapshot) ─────────────────
    if (dimensions.length) _drawDimensions(doc, dimensions, M, M, dw, dh);

    // ── Border + title block ──────────────────────────────────────────
    _drawTitleBlock(doc, dw, dh, titleBlock, logo);

    // ── Save ──────────────────────────────────────────────────────────
    const safeName = (titleBlock.projekt || 'plan').replace(/[^\w\-]/g, '-');
    doc.save(`${safeName}.pdf`);
}

/**
 * Export a vector plan PDF.
 * Combines a semi-transparent raster background with vector lines
 * from section contour (triangle-plane intersection) and IFC 2D FootPrint geometry.
 *
 * @param {object} opts
 * @param {string|null}              opts.snapshot    - base64 PNG for background (optional)
 * @param {string}                   opts.format
 * @param {string}                   opts.orientation
 * @param {object}                   opts.titleBlock
 * @param {string|null}              opts.logo
 * @param {THREE.OrthographicCamera} opts.camera      - current ortho cam (for coordinate mapping)
 * @param {THREE.Scene}              opts.scene       - Three.js scene (section contour)
 * @param {THREE.Plane|null}         opts.cutPlane    - active section cut plane
 * @param {object|null}              opts.ifcData     - { webIfc, modelID, model? }
 */
export async function exportVectorPlanPDF({
    snapshot, format, orientation, titleBlock, logo,
    plotFrustum,                                       // {left,right,top,bottom,position,target,up,viewDir}
    scene, cutPlane, ifcData, dimensions = [],
    scaleRatio = null, hatch = false, scaleBar = false,
    categoryGroups   = null,                            // raw groups for category resolution
    fragmentsList    = null,                            // fragments.list (modelId → model)
    fragmentsManager = null,                            // FragmentsManager — used to read Psets for rules
    styleMap         = null,                            // user-defined per-category styles (legacy shape)
    styleMapPerModel = null,                            // optional { modelId: { category: legacyStyle } }
    rules            = [],                              // user-defined style rules (high-level shape)
    annotations      = [],                              // pinned notes (Vue store)
    measurements     = [],                              // 2-point distance markers (Vue store)
    showLabels       = true,                            // draw {labelTemplate}-resolved labels?
    labelTemplateFor = null,                            // (category) => 'tpl string'   — high-level
    labelOpts        = null,                            // { fontSize?, minElementSize? }
    ifcGridAxes      = null,                            // [{name, start:{x,z}, end:{x,z}}] — DIN axes
    // ── Sprint T1: Tiefbau-Lageplan ─────────────────────────────────────────
    slopeHatch       = null,                            // { enabled, categories?, minSlopeDeg?, tickSpacingMm? }
    contours         = null,                            // { enabled, interval?, majorEvery? }
    utmGrid          = null,                            // { offset:{x,z}, flipNorth?, spacing? }
    northAngle       = 0,                               // Nordpfeil-Verdrehung in Grad
    watermark        = null,                            // Text (z. B. 'VORABZUG') oder null
    axisLabels       = null,                            // { enabled, categories?, apis?, coordOffsets? }
}) {
    const camera  = plotFrustum ? _cameraFromFrustum(plotFrustum) : null;
    const viewDir = plotFrustum?.viewDir ?? 'top';

    const { outlines, slopeSegments, contourLevels, axisItems } = await collectVectorContent({
        viewDir, rules, fragmentsManager, cutPlane, labelTemplateFor,
        categoryGroups, fragmentsList, scaleRatio,
        slopeHatch, contours, axisLabels, ifcData, styleMap,
    });

    const [baseW, baseH] = PAPER_SIZES[format] ?? PAPER_SIZES.A3;
    const [pw, ph] = orientation === 'landscape' ? [baseH, baseW] : [baseW, baseH];

    const doc = new jsPDF({ unit: 'mm', format: format.toLowerCase(), orientation });
    const dw = pw - 2 * M;
    const dh = ph - 2 * M - TB;

    // ── Optional raster background ───────────────────────────────────
    if (snapshot) {
        doc.addImage(snapshot, 'PNG', M, M, dw, dh, '', 'FAST');
    } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(M, M, dw, dh, 'F');
    }

    // ── T1/E5: Status-Wasserzeichen (unter der Vektorik, über dem Raster) ───
    if (watermark) _drawWatermark(doc, watermark, M, dw, dh);

    // ── Vector lines (await — extractFootprintSegments is async) ─────
    if (camera) {
        await drawVectorPlan(doc, camera, scene, cutPlane, ifcData, M, dw, dh, {
            hatch, scaleBar, scaleRatio,
            outlines, styleMap, styleMapPerModel, styleToLegacy,
            annotations, measurements,
            showLabels, labelOpts,
            ifcGridAxes,
            slopeHatch: slopeSegments,
            contours: contourLevels,
            utmGrid, northAngle,
            axisLabels: axisItems,
        });
    }

    // ── Dimensions overlay ───────────────────────────────────────────
    if (dimensions.length) _drawDimensions(doc, dimensions, M, M, dw, dh);

    // ── Border + title block ─────────────────────────────────────────
    _drawTitleBlock(doc, dw, dh, titleBlock, logo);

    const safeName = (titleBlock.projekt || 'plan').replace(/[^\w\-]/g, '-');
    doc.save(`${safeName}-vektor.pdf`);
}
