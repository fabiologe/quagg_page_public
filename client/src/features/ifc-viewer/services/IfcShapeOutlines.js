/**
 * Concave Per-Element Outlines
 *
 * Phase 2 of the vector plotter pipeline. For each IFC element we ask the
 * OBC API for its triangle soup, project all triangles to the view plane and
 * boolean-union them into a multipolygon. The result preserves concavities,
 * holes, and irregular shapes that the BBox-only pipeline cannot represent.
 *
 * APIs used:
 *   model.getItem(localId)            → Item
 *   item.getGeometry()                → ItemGeometry
 *   itemGeometry.getTriangles()       → THREE.Triangle[][] (world-space)
 *
 * Falls back to a projected BBox if geometry fetch fails for an element.
 */

import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { resolveRuleStyle, rulesForCategory } from './VectorRuleEngine.js';
import { renderLabelTemplate } from './LabelTemplate.js';
import { FRAGMENTS_DATA_CONFIG as DATA_CONFIG } from './IfcDataConfig.js';
import { trianglePlaneIntersect, chainSegmentsToPolygons } from './SectionContour.js';

const PROJECTORS = {
    top:   (v) => [v.x, v.z],
    front: (v) => [v.x, v.y],
    side:  (v) => [v.z, v.y],
};

const DEGENERATE_EPS = 1e-9;

/**
 * @param {Array<{ name, groupData }>} categoryGroups
 * @param {Map<string, any>}            fragmentsList
 * @param {{viewDir?, rules?, fragmentsManager?}} opts
 * @returns {Promise<{ category, rings, bbox, localId, modelId, fallback?, ruleStyle? }[]>}
 */
export async function extractConcaveOutlines(categoryGroups, fragmentsList, opts = {}) {
    const viewDir = opts.viewDir ?? 'top';
    const project = PROJECTORS[viewDir] ?? PROJECTORS.top;
    const rules   = opts.rules ?? [];
    const out = [];

    // labelTemplateFor(category, modelId) → 'Wand {Name}' or null/empty
    const labelTemplateFor = opts.labelTemplateFor ?? (() => '');
    const fragmentsManager = opts.fragmentsManager ?? null;
    // When the user has an active section cut, switch to per-element cross-section
    // mode — the resulting outlines have natural cutouts for doors, windows, voids.
    const cutPlane         = opts.cutPlane ?? null;

    for (const group of categoryGroups ?? []) {
        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        if (!map) continue;

        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
        for (const [modelId, rawIds] of entries) {
            const localIds = _normalizeIds(rawIds);
            if (!localIds?.length) continue;
            const model = fragmentsList.get(modelId);
            if (!model) continue;

            // Pre-fetch Pset/Attribute data per element IF any rule for this
            // category needs it. We batch the fetch for the whole category at once.
            const catRules    = rulesForCategory(rules, group.name);
            const catTemplate = String(labelTemplateFor(group.name, modelId) ?? '').trim();
            const templateNeedsData = catTemplate.length > 0 && _templateUsesElementData(catTemplate);
            const ruleNeedsData = catRules.some(r => r.condition?.psetName || r.condition?.propertyName);
            const catNeedsData  = (ruleNeedsData || templateNeedsData) && fragmentsManager;

            let dataByLocalId = null;
            if (catNeedsData) {
                try {
                    const raw = await fragmentsManager.getData({ [modelId]: localIds }, DATA_CONFIG);
                    dataByLocalId = _parseBatchData(raw);
                } catch (e) {
                    console.warn(`[ShapeOutlines] data fetch failed for ${group.name}`, e?.message ?? e);
                }
            }

            for (const localId of localIds) {
                let entry = null;
                try {
                    entry = await _shapeForItem(model, localId, group.name, modelId, project, cutPlane);
                } catch { /* try bbox fallback below */ }

                if (!entry) {
                    // Fallback: project the element's box as a rectangle
                    try {
                        const boxes = await model.getBoxes([localId]);
                        const b = boxes?.[0];
                        if (b && !b.isEmpty()) {
                            // With a cut plane, decide whether the bbox is fully above the cut.
                            // If yes, flag aboveCut so the plotter can dash this element.
                            let aboveCutBox = false;
                            if (cutPlane) {
                                const proj = new THREE.Vector3();
                                cutPlane.projectPoint(b.getCenter(new THREE.Vector3()), proj);
                                if (b.min.y > proj.y + 0.005) aboveCutBox = true;
                            }
                            const ring = _projectBox(b, project);
                            entry = {
                                category: group.name,
                                rings: [ring],
                                bbox:    _ringsBBox([ring]),
                                localId, modelId,
                                fallback: 'bbox',
                                ...(aboveCutBox ? { aboveCut: true } : {}),
                            };
                        }
                    } catch { /* skip */ }
                }

                if (!entry) continue;

                // Build element context once — shared by rules + label
                const ctx = {
                    category:   group.name,
                    localId,
                    attributes: dataByLocalId?.[localId]?.attributes ?? null,
                    psets:      dataByLocalId?.[localId]?.psets      ?? null,
                };

                if (catRules.length) {
                    const ruleStyle = resolveRuleStyle(catRules, ctx);
                    if (ruleStyle) {
                        entry.ruleStyle = ruleStyle;
                        // A rule may override the label template too — apply it
                        if (ruleStyle.labelTemplate !== undefined && ruleStyle.labelTemplate !== null) {
                            const tpl = String(ruleStyle.labelTemplate).trim();
                            if (tpl) entry.label = renderLabelTemplate(tpl, ctx) || null;
                            else     entry.label = null;
                        }
                    }
                }
                // If no rule supplied a label, fall back to the category template
                if (entry.label === undefined && catTemplate) {
                    entry.label = renderLabelTemplate(catTemplate, ctx) || null;
                }

                out.push(entry);
            }
        }
    }

    return out;
}

// ── Per-item shape extraction ───────────────────────────────────────────────

async function _shapeForItem(model, localId, category, modelId, project, cutPlane) {
    const item = model.getItem?.(localId);
    if (!item) return null;
    const geo = await item.getGeometry();
    if (!geo) return null;

    const triangleSets = await geo.getTriangles();
    if (!triangleSets?.length) return null;

    // ── Decide which mode applies ──────────────────────────────────────────
    // With a cut plane: intersect bbox classifies the element as
    //   crossing   → per-element cross-section (T1.B, natural cutouts)
    //   above      → silhouette + aboveCut flag (T1.A, dashed at draw time)
    //   below      → silhouette (visible from above, no special flag)
    // Without cut plane: silhouette as before.
    let aboveCut = false;
    let useCrossSection = false;
    if (cutPlane) {
        try {
            const boxes = await model.getBoxes([localId]);
            const box = boxes?.[0];
            if (box && !box.isEmpty()) {
                const cutOrigin = new THREE.Vector3();
                cutPlane.projectPoint(box.getCenter(new THREE.Vector3()), cutOrigin);
                const cutY = cutOrigin.y;
                const EPS = 0.005;
                if (box.min.y > cutY + EPS)      aboveCut = true;
                else if (box.max.y > cutY - EPS) useCrossSection = true;
                // else: fully below cut → standard silhouette, no flag
            } else {
                useCrossSection = true; // bbox unknown, try cross-section
            }
        } catch {
            useCrossSection = true;
        }
    }

    // ── Cross-section mode: cutouts (doors, windows, voids) become real holes ─
    if (useCrossSection) {
        const segs = [];
        for (const set of triangleSets) {
            if (!set?.length) continue;
            for (const tri of set) {
                const seg = trianglePlaneIntersect(cutPlane, tri.a, tri.b, tri.c);
                if (seg) segs.push(seg);
            }
        }
        if (!segs.length) return null;
        const polys = chainSegmentsToPolygons(segs);
        if (!polys.length) return null;
        const rings = polys
            .map(ring => ring.map(p => project({ x: p.x, y: 0, z: p.z })))
            .filter(r => r.length >= 4);
        if (!rings.length) return null;
        return {
            category,
            rings,
            bbox:    _ringsBBox(rings),
            localId, modelId,
        };
    }

    // ── Silhouette mode: triangle-union projection (no cut, full footprint) ─
    const polys = [];
    for (const set of triangleSets) {
        if (!set?.length) continue;
        for (const tri of set) {
            const a = project(tri.a);
            const b = project(tri.b);
            const c = project(tri.c);
            // Skip degenerate (collinear) — would crash polygon-clipping
            const ax = b[0] - a[0], ay = b[1] - a[1];
            const bx = c[0] - a[0], by = c[1] - a[1];
            if (Math.abs(ax * by - ay * bx) < DEGENERATE_EPS) continue;
            polys.push([[a, b, c, a]]);
        }
    }
    if (!polys.length) return null;

    // Boolean union — chunked for large meshes (polygon-clipping degrades >~1k triangles)
    let united;
    try {
        united = _unionPolys(polys);
    } catch {
        return null; // caller will fall back to bbox
    }

    // polygon-clipping returns Array<Polygon> where Polygon = Array<Ring> = [outer, hole1, …]
    // Flatten to one "outlines" record per polygon — multipolygon → multiple records.
    if (!united?.length) return null;

    const rings = [];
    for (const poly of united) {
        for (const ring of poly) {
            if (ring.length >= 4) rings.push(ring);
        }
    }
    if (!rings.length) return null;

    return {
        category,
        rings,
        bbox:    _ringsBBox(rings),
        localId, modelId,
        ...(aboveCut ? { aboveCut: true } : {}),
    };
}

/**
 * Boolean-union of N polygons. Polygon-clipping has O(N²)-ish behaviour above
 * ~500 triangles, so we chunk + merge hierarchically.
 */
function _unionPolys(polys) {
    if (polys.length === 1) return polys;
    const CHUNK = 400;
    if (polys.length <= CHUNK) {
        return polygonClipping.union(polys[0], ...polys.slice(1));
    }
    const merged = [];
    for (let i = 0; i < polys.length; i += CHUNK) {
        const slice = polys.slice(i, i + CHUNK);
        merged.push(polygonClipping.union(slice[0], ...slice.slice(1)));
    }
    if (merged.length === 1) return merged[0];
    return polygonClipping.union(merged[0], ...merged.slice(1));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert the multi-model OBC getData() response into a flat
 * {localId → { attributes, psets }} map, normalized to plain values.
 *
 * Input shape (from OBC fragments.getData):
 *   { [modelId]: [{ _category, Name: {value}, IsDefinedBy: [{Name, HasProperties: [...]}], ... }, ...] }
 *
 * Output shape (for the rule engine):
 *   { [localId]: { attributes: {Name, ...}, psets: { Pset_X: { Prop: value } } } }
 */
function _parseBatchData(raw) {
    if (!raw) return null;
    const out = {};
    const scalar = (v) => {
        if (v == null) return null;
        if (typeof v === 'object' && 'value' in v) return v.value;
        if (typeof v === 'object') return null;
        return v;
    };
    const ATTR_KEYS = ['Name', 'Description', 'GlobalId', 'Tag', 'ObjectType', 'PredefinedType'];

    for (const items of Object.values(raw)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            // OBC sometimes wraps the id as { value: number } — unwrap via scalar()
            const localId = scalar(item?._localId ?? item?.localId ?? item?.expressID);
            if (localId == null) continue;

            // Top-level attributes
            const attributes = {};
            for (const k of ATTR_KEYS) {
                const s = scalar(item[k]);
                if (s != null) attributes[k] = String(s);
            }

            // Psets nested in IsDefinedBy → HasProperties → IFCPROPERTYSINGLEVALUE
            const psets = {};
            for (const rel of (item.IsDefinedBy ?? [])) {
                const psetName = rel?.Name?.value ?? rel?.Name ?? null;
                if (!psetName || !Array.isArray(rel?.HasProperties)) continue;
                const props = {};
                for (const p of rel.HasProperties) {
                    const propName = p?.Name?.value ?? p?.Name;
                    if (!propName) continue;
                    const v = p?.NominalValue?.value ?? p?.Value?.value ?? p?.NominalValue ?? p?.Value;
                    props[String(propName)] = v == null ? null : String(v);
                }
                psets[String(psetName)] = props;
            }

            out[localId] = { attributes, psets };
        }
    }
    return out;
}

/** Does the template reference anything beyond {category}/{localId}? */
function _templateUsesElementData(template) {
    return /\{([^}]+)\}/.test(template) && /\{(?!category[}\s:]|localId[}\s:])/i.test(template);
}


function _normalizeIds(raw) {
    if (Array.isArray(raw))      return raw;
    if (raw instanceof Set)       return [...raw];
    if (raw && typeof raw[Symbol.iterator] === 'function') return [...raw];
    return null;
}

function _projectBox(b, project) {
    const corners = [
        new THREE.Vector3(b.min.x, b.min.y, b.min.z),
        new THREE.Vector3(b.max.x, b.min.y, b.min.z),
        new THREE.Vector3(b.max.x, b.max.y, b.min.z),
        new THREE.Vector3(b.min.x, b.max.y, b.min.z),
        new THREE.Vector3(b.min.x, b.min.y, b.max.z),
        new THREE.Vector3(b.max.x, b.min.y, b.max.z),
        new THREE.Vector3(b.max.x, b.max.y, b.max.z),
        new THREE.Vector3(b.min.x, b.max.y, b.max.z),
    ];
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const c of corners) {
        const [u, v] = project(c);
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    return [
        [minU, minV], [maxU, minV],
        [maxU, maxV], [minU, maxV],
        [minU, minV],
    ];
}

function _ringsBBox(rings) {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const ring of rings) {
        for (const [u, v] of ring) {
            if (u < minU) minU = u; if (u > maxU) maxU = u;
            if (v < minV) minV = v; if (v > maxV) maxV = v;
        }
    }
    return { minU, maxU, minV, maxV };
}
