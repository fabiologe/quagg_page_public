/**
 * GeometryResolver — Form-Typsystem + Ableitungsgraph (Sprint G, AP3).
 *
 * Löst den REPRÄSENTATIONS-MISMATCH systematisch: Analysen deklarieren die
 * Form, die sie brauchen ('surface', 'axis', 'solid', …) — der Resolver plant
 * die günstigste Ableitungskette aus den vorhandenen Quellen des Elements
 * (Axis-Repräsentation, Qto, Fragments-Mesh), cached je Element und
 * protokolliert an jedem Ergebnis die Provenienz:
 *     { value | data, unit?, source, path, warnings }
 * Kein stilles Scheitern: Nicht-Ableitbarkeit liefert warnings, nie undefined.
 *
 * FORMEN:  'mesh'    rohe Dreiecke (Float64Array, Welt)
 *          'solid'   mesh + Geschlossenheits-Attest
 *          'surface' obere Hülle als TIN (SlopeHatch/Contours/Sampler-Futter)
 *          'axis'    3D-Polylinie (Welt)
 *
 * ABLEITUNGSGRAPH (Kosten grob relativ):
 *   src:fragments → mesh (1) → solid (2) → …
 *   mesh → surface (4)         [SurfaceOps 'auto']
 *   src:axisRep → axis (1)     [AxisAnnotations, Offset-normiert]
 *   mesh → axis (7)            [MeshOps-Skelettierung]
 *
 * Koordinaten: ALLE Ausgaben in Three-WELT. Axis-Rep kommt roh aus web-ifc
 * und wird via coordOffsets normiert (welt = roh − offset, Fallstrick-7-
 * Konvention); Fragments-Meshes sind bereits Welt.
 * Annahme (dokumentiert): fragments-localId ≙ web-ifc-expressID.
 */

import { collectElementTriangles } from './MeshAcquire.js';
import { meshVolume, skeletonAxis, meshAreas, principalDirection, profileAtStation } from './MeshOps.js';
import { deriveSurface } from './SurfaceOps.js';
import { extractAxisPolylines, polylineLength } from '../AxisAnnotations.js';
import { collectQto, pickQtoValue, LENGTH_KEYS } from '../QuantitySummary.js';
import { FRAGMENTS_DATA_CONFIG } from '../IfcDataConfig.js';

const VOLUME_KEYS = ['NetVolume', 'GrossVolume'];

// Kategorien, deren BBox-Längskante als Längen-Fallback taugt
const LINEAR_CATEGORIES = new Set([
    'IFCPIPESEGMENT', 'IFCFLOWSEGMENT', 'IFCDUCT', 'IFCDUCTSEGMENT',
    'IFCKERB', 'IFCBEAM', 'IFCMEMBER', 'IFCCABLESEGMENT', 'IFCCABLECARRIERSEGMENT',
]);

/**
 * @param {object} deps
 * @param {Array<{name, groupData}>} deps.categoryGroups
 * @param {Map} deps.fragmentsList
 * @param {object|null} [deps.fragmentsManager]
 * @param {Array<{webIfc, modelID, fragmentModelId}>} [deps.webIfcApis]
 * @param {Record<string, {x,y,z}>} [deps.coordOffsets]
 */
export function createGeometryResolver({
    categoryGroups, fragmentsList, fragmentsManager = null,
    webIfcApis = [], coordOffsets = {},
} = {}) {
    // ── Caches ──────────────────────────────────────────────────────────────
    const meshCache = new Map();      // 'modelId|localId' → Promise<{positions, triCount}>
    const axisRepCache = new Map();   // 'modelId|categoriesKey' → Promise<Map<localId, polyline>>
    const qtoCache = new Map();       // 'modelId|idsKey' → Promise<Map<localId, qto>>
    const derivedCache = new Map();   // beliebige abgeleitete Ergebnisse

    function invalidate(modelId) {
        for (const cache of [meshCache, axisRepCache, qtoCache, derivedCache]) {
            for (const k of [...cache.keys()]) {
                if (k.startsWith(`${modelId}|`)) cache.delete(k);
            }
        }
    }

    // ── Element-Auflösung ───────────────────────────────────────────────────
    async function elementsForCategories(categories) {
        const wanted = new Set(categories);
        const out = []; // [{modelId, localId, category}]
        for (const group of (categoryGroups ?? [])) {
            if (!wanted.has(group.name)) continue;
            let map;
            try { map = await group.groupData.get(); } catch { continue; }
            const entries = map instanceof Map ? [...map.entries()] : Object.entries(map ?? {});
            for (const [modelId, rawIds] of entries) {
                const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
                if (!localIds?.length || !fragmentsList?.get(modelId)) continue;
                for (const localId of localIds) out.push({ modelId, localId, category: group.name });
            }
        }
        return out;
    }

    // ── Quellen ─────────────────────────────────────────────────────────────

    /** Meshes eines Element-Satzes batchweise beschaffen (Cache je Element). */
    async function acquireMeshes(elements) {
        const missingByModel = new Map();
        for (const el of elements) {
            if (!meshCache.has(`${el.modelId}|${el.localId}`)) {
                (missingByModel.get(el.modelId) ?? missingByModel.set(el.modelId, []).get(el.modelId)).push(el.localId);
            }
        }
        for (const [modelId, localIds] of missingByModel) {
            const model = fragmentsList.get(modelId);
            const batch = collectElementTriangles(model, localIds, { filter: 'none' });
            for (const localId of localIds) {
                meshCache.set(`${modelId}|${localId}`, batch.then(got => {
                    const range = got.perElement.find(r => r.localId === localId);
                    if (!range) return { positions: new Float64Array(0), triCount: 0 };
                    return {
                        positions: got.positions.subarray(range.start * 9, range.end * 9),
                        triCount: range.end - range.start,
                    };
                }));
            }
        }
        const out = new Map();
        for (const el of elements) {
            out.set(`${el.modelId}|${el.localId}`, await meshCache.get(`${el.modelId}|${el.localId}`));
        }
        return out;
    }

    /** Axis-Repräsentationen je Modell (roh → Welt normiert). */
    async function axisRepsForModel(modelId, categories) {
        const key = `${modelId}|${[...categories].sort().join(',')}`;
        if (!axisRepCache.has(key)) {
            axisRepCache.set(key, (async () => {
                const api = webIfcApis.find(a => a.fragmentModelId === modelId)
                    ?? (webIfcApis.length === 1 ? webIfcApis[0] : null);
                if (!api?.webIfc) return new Map();
                const off = coordOffsets?.[modelId] ?? null;
                let products = [];
                try {
                    products = extractAxisPolylines(api.webIfc, api.modelID, {
                        categories: [...categories], coordOffset: off,
                    });
                } catch { return new Map(); }
                const byId = new Map();
                for (const p of products) byId.set(p.expressId, p.polyline);
                return byId;
            })());
        }
        return axisRepCache.get(key);
    }

    /** Qto-Werte je Element — Batch je Modell, Cache je Element. */
    async function qtoForElements(elements) {
        const out = new Map();
        if (!fragmentsManager) return out;
        const byModel = new Map();
        for (const el of elements) {
            const k = `${el.modelId}|${el.localId}|qto`;
            if (!qtoCache.has(k)) {
                (byModel.get(el.modelId) ?? byModel.set(el.modelId, []).get(el.modelId)).push(el.localId);
            }
        }
        for (const [modelId, localIds] of byModel) {
            const batch = (async () => {
                const map = new Map();
                try {
                    const raw = await fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG);
                    const items = Object.values(raw ?? {})[0] ?? [];
                    for (const item of items) {
                        const lidRaw = item._localId ?? item.localId ?? item.expressID;
                        const lid = typeof lidRaw === 'object' ? lidRaw?.value : lidRaw;
                        if (lid != null) map.set(lid, collectQto(item));
                    }
                } catch { /* qto optional */ }
                return map;
            })();
            for (const localId of localIds) {
                qtoCache.set(`${modelId}|${localId}|qto`, batch.then(m => m.get(localId) ?? null));
            }
        }
        for (const el of elements) {
            const qto = await qtoCache.get(`${el.modelId}|${el.localId}|qto`);
            if (qto) out.set(`${el.modelId}|${el.localId}`, qto);
        }
        return out;
    }

    async function boxesForElements(elements) {
        const out = new Map();
        const byModel = new Map();
        for (const el of elements) {
            (byModel.get(el.modelId) ?? byModel.set(el.modelId, []).get(el.modelId)).push(el.localId);
        }
        for (const [modelId, localIds] of byModel) {
            const model = fragmentsList.get(modelId);
            let boxes = null;
            try { boxes = await model.getBoxes(localIds); } catch { continue; }
            for (let i = 0; i < localIds.length; i++) {
                if (boxes?.[i] && !boxes[i].isEmpty()) out.set(`${modelId}|${localIds[i]}`, boxes[i]);
            }
        }
        return out;
    }

    // ── Handle ──────────────────────────────────────────────────────────────

    function makeHandle(elementsPromise) {
        return {
            /** Zielform beschaffen — merged (surface/mesh) bzw. je Element (axis). */
            async getForm(form, opts = {}) {
                const elements = await elementsPromise;
                if (!elements.length) {
                    return { form, data: null, perElement: [], source: 'none', path: [], warnings: ['keine_elemente'] };
                }

                if (form === 'mesh' || form === 'solid' || form === 'surface') {
                    const cacheKey = `${elements[0].modelId}|set:${_setKey(elements)}|${form}:${opts.method ?? 'auto'}`;
                    if (!derivedCache.has(cacheKey)) {
                        derivedCache.set(cacheKey, (async () => {
                            const meshes = await acquireMeshes(elements);
                            const merged = _mergeMeshes([...meshes.values()]);
                            if (form === 'mesh') {
                                return { form, data: merged, source: 'mesh', path: ['src:fragments', 'mesh'], warnings: [] };
                            }
                            if (form === 'solid') {
                                const vol = meshVolume(merged.positions, merged.triCount);
                                return {
                                    form, data: { ...merged, closed: vol.closed },
                                    source: 'mesh', path: ['src:fragments', 'mesh', 'solid'],
                                    warnings: vol.warnings,
                                };
                            }
                            // surface — JE ELEMENT ableiten und dann mergen:
                            // die auto-Weiche (geschlossen→heightfield) muss pro
                            // Körper entscheiden; ein offenes DGM im selben Satz
                            // darf den Erdkörper nicht auf 'upfaces' zwingen.
                            const parts = [];
                            const methods = new Set();
                            const warnings = [];
                            for (const el of elements) {
                                const mesh = meshes.get(`${el.modelId}|${el.localId}`);
                                if (!mesh?.triCount) continue;
                                const surf = deriveSurface(mesh.positions, mesh.triCount, {
                                    method: opts.method ?? 'auto', cell: opts.cell ?? null,
                                });
                                if (surf.triCount) parts.push(surf);
                                methods.add(surf.method);
                                warnings.push(...surf.warnings);
                            }
                            const mergedSurf = _mergeMeshes(parts);
                            const methodLabel = [...methods].join('+') || 'none';
                            return {
                                form, data: mergedSurf,
                                source: `mesh→surface(${methodLabel})`,
                                path: ['src:fragments', 'mesh', `surface:${methodLabel}`],
                                warnings,
                            };
                        })());
                    }
                    return derivedCache.get(cacheKey);
                }

                if (form === 'axis') {
                    // je Element: Axis-Rep (Kosten 1) vor Skelett (7)
                    const cats = [...new Set(elements.map(e => e.category))];
                    const perElement = [];
                    const meshesNeeded = [];
                    const repByModel = new Map();
                    for (const modelId of new Set(elements.map(e => e.modelId))) {
                        repByModel.set(modelId, await axisRepsForModel(modelId, cats));
                    }
                    for (const el of elements) {
                        const rep = repByModel.get(el.modelId)?.get(el.localId);
                        if (rep?.length >= 2) {
                            perElement.push({
                                ...el, polyline: rep,
                                source: 'axisRep', path: ['src:axisRep', 'axis'], warnings: [],
                            });
                        } else {
                            meshesNeeded.push(el);
                        }
                    }
                    if (meshesNeeded.length) {
                        const meshes = await acquireMeshes(meshesNeeded);
                        for (const el of meshesNeeded) {
                            const mesh = meshes.get(`${el.modelId}|${el.localId}`);
                            const skel = mesh?.triCount ? skeletonAxis(mesh.positions, mesh.triCount) : null;
                            if (skel?.polyline?.length >= 2) {
                                perElement.push({
                                    ...el, polyline: skel.polyline,
                                    source: 'mesh', path: ['src:fragments', 'mesh', 'axis:skelett'],
                                    warnings: skel.warnings,
                                });
                            } else {
                                perElement.push({
                                    ...el, polyline: null,
                                    source: 'none', path: [],
                                    warnings: ['achse_nicht_ableitbar'],
                                });
                            }
                        }
                    }
                    return { form, perElement, warnings: [] };
                }

                return { form, data: null, perElement: [], source: 'none', path: [], warnings: [`form_unbekannt:${form}`] };
            },

            /** Skalare Größe je Element mit Provenienz. */
            async get(name, opts = {}) {
                const elements = await elementsPromise;
                const out = new Map();
                if (!elements.length) return out;

                if (name === 'volumen') {
                    const qtos = await qtoForElements(elements);
                    const rest = elements.filter(el => {
                        const q = qtos.get(`${el.modelId}|${el.localId}`);
                        return pickQtoValue(q ?? {}, VOLUME_KEYS) == null;
                    });
                    const meshes = rest.length ? await acquireMeshes(rest) : new Map();
                    const boxRest = [];
                    for (const el of elements) {
                        const k = `${el.modelId}|${el.localId}`;
                        const qv = pickQtoValue(qtos.get(k) ?? {}, VOLUME_KEYS);
                        if (qv != null) {
                            out.set(k, { value: qv, unit: 'm3', source: 'qto', path: ['src:qto'], warnings: [] });
                            continue;
                        }
                        const mesh = meshes.get(k);
                        if (mesh?.triCount) {
                            const v = meshVolume(mesh.positions, mesh.triCount);
                            if (v.closed) {
                                out.set(k, { value: v.volume, unit: 'm3', source: 'mesh', path: ['src:fragments', 'mesh', 'volumen'], warnings: [] });
                                continue;
                            }
                        }
                        boxRest.push(el);
                    }
                    if (boxRest.length) {
                        const boxes = await boxesForElements(boxRest);
                        for (const el of boxRest) {
                            const k = `${el.modelId}|${el.localId}`;
                            const box = boxes.get(k);
                            const value = box
                                ? (box.max.x - box.min.x) * (box.max.y - box.min.y) * (box.max.z - box.min.z)
                                : 0;
                            out.set(k, {
                                value, unit: 'm3', source: box ? 'bbox' : 'none',
                                path: box ? ['src:fragments', 'bbox'] : [],
                                warnings: box ? ['bbox_naeherung'] : ['keine_geometrie'],
                            });
                        }
                    }
                    return out;
                }

                if (name === 'laenge') {
                    const axis = await this.getForm('axis');
                    const noAxis = [];
                    for (const entry of axis.perElement) {
                        const k = `${entry.modelId}|${entry.localId}`;
                        if (entry.polyline) {
                            out.set(k, {
                                value: polylineLength(entry.polyline), unit: 'm',
                                source: entry.source === 'axisRep' ? 'axis' : 'mesh',
                                path: entry.path, warnings: entry.warnings,
                            });
                        } else {
                            noAxis.push(elements.find(e => `${e.modelId}|${e.localId}` === k));
                        }
                    }
                    if (noAxis.length) {
                        const qtos = await qtoForElements(noAxis);
                        const boxes = await boxesForElements(noAxis);
                        for (const el of noAxis) {
                            const k = `${el.modelId}|${el.localId}`;
                            const qv = pickQtoValue(qtos.get(k) ?? {}, LENGTH_KEYS);
                            if (qv != null) {
                                out.set(k, { value: qv, unit: 'm', source: 'qto', path: ['src:qto'], warnings: [] });
                            } else if (LINEAR_CATEGORIES.has(el.category) && boxes.get(k)) {
                                const box = boxes.get(k);
                                out.set(k, {
                                    value: Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z),
                                    unit: 'm', source: 'bbox', path: ['src:fragments', 'bbox'],
                                    warnings: ['bbox_naeherung'],
                                });
                            } else {
                                out.set(k, { value: null, unit: 'm', source: 'none', path: [], warnings: ['laenge_nicht_ableitbar'] });
                            }
                        }
                    }
                    return out;
                }

                if (name === 'dn') {
                    // Achse + Mesh → Querschnitt in der Mitte
                    const axis = await this.getForm('axis');
                    const meshes = await acquireMeshes(elements);
                    for (const entry of axis.perElement) {
                        const k = `${entry.modelId}|${entry.localId}`;
                        const mesh = meshes.get(k);
                        if (!entry.polyline || !mesh?.triCount) {
                            out.set(k, { value: null, unit: 'mm', source: 'none', path: [], warnings: ['dn_nicht_ableitbar'] });
                            continue;
                        }
                        const mid = polylineLength(entry.polyline) / 2;
                        const prof = profileAtStation(mesh.positions, mesh.triCount, entry.polyline, mid);
                        out.set(k, prof?.dnEstimate_mm != null
                            ? { value: prof.dnEstimate_mm, unit: 'mm', source: 'mesh', path: [...entry.path, 'profile'], warnings: prof.warnings }
                            : { value: null, unit: 'mm', source: 'none', path: [], warnings: ['dn_nicht_ableitbar'] });
                    }
                    return out;
                }

                // Flächen/Höhen/Lage-Kennwerte aus dem Mesh
                const MESH_SIZES = new Set([
                    'flaeche_ober', 'flaeche_grund', 'flaeche_geneigt', 'flaeche_flach',
                    'hoehe_ok', 'hoehe_uk', 'schwerpunkt', 'hauptrichtung',
                ]);
                if (MESH_SIZES.has(name)) {
                    const meshes = await acquireMeshes(elements);
                    for (const el of elements) {
                        const k = `${el.modelId}|${el.localId}`;
                        const mesh = meshes.get(k);
                        if (!mesh?.triCount) {
                            out.set(k, { value: null, unit: null, source: 'none', path: [], warnings: ['keine_geometrie'] });
                            continue;
                        }
                        if (name === 'hauptrichtung') {
                            const pca = principalDirection(mesh.positions, mesh.triCount);
                            out.set(k, { value: pca.dir, unit: null, source: 'mesh', path: ['src:fragments', 'mesh', 'pca'], warnings: pca.warnings });
                        } else {
                            const areas = meshAreas(mesh.positions, mesh.triCount, opts);
                            const unit = name.startsWith('flaeche') ? 'm2' : (name.startsWith('hoehe') ? 'm' : null);
                            out.set(k, { value: areas[name], unit, source: 'mesh', path: ['src:fragments', 'mesh', name], warnings: [] });
                        }
                    }
                    return out;
                }

                for (const el of elements) {
                    out.set(`${el.modelId}|${el.localId}`,
                        { value: null, unit: null, source: 'none', path: [], warnings: [`groesse_unbekannt:${name}`] });
                }
                return out;
            },
        };
    }

    function _setKey(elements) {
        // stabiler Kurz-Schlüssel für Element-Sätze (Kategorie-Handles)
        let h = 0;
        for (const el of elements) {
            const s = `${el.modelId}|${el.localId}`;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
        }
        return `${elements.length}:${h}`;
    }

    return {
        forCategory: (categories) => makeHandle(elementsForCategories(
            Array.isArray(categories) ? categories : [categories])),
        forElements: (list) => makeHandle(Promise.resolve(
            (list ?? []).map(e => ({ category: e.category ?? '', ...e })))),
        invalidate,
    };
}

function _mergeMeshes(meshes) {
    let total = 0;
    for (const m of meshes) total += m?.triCount ?? 0;
    const positions = new Float64Array(total * 9);
    let off = 0;
    for (const m of meshes) {
        if (!m?.triCount) continue;
        positions.set(m.positions.subarray(0, m.triCount * 9), off);
        off += m.triCount * 9;
    }
    return { positions, triCount: total };
}
