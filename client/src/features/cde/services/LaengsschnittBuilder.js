/**
 * LaengsschnittBuilder — sammelt aus dem geladenen Modell alles, was der
 * Längsschnitt/Querprofil-Generator braucht (Sprint T2):
 *   - Haltungsachsen (AxisAnnotations) inkl. DN aus den Psets
 *   - Schächte (IFCDISTRIBUTIONCHAMBERELEMENT): Lage + Deckel-/Sohlhöhe aus
 *     der BBox, Name aus den Attributen
 *   - Gelände-Sampler (TerrainMesh) für die Geländelinie
 *   - Höhen-Offset (Welt-Y → m NN) aus der Georeferenz des ersten Modells
 */

import { AXIS_CATEGORIES_DEFAULT, polylineLength, polylineGefaellePromille } from './AxisAnnotations.js';
import { makeHeightSampler } from './TerrainMesh.js';
import { GELAENDE_VORBELEGUNG } from './GelaendeQuelle.js';
import { createGeometryResolver } from './geometry/GeometryResolver.js';
import { hoehenversatzAus } from './Koordinaten.js';
import { buildLaengsschnitt } from './Laengsschnitt.js';
import { FRAGMENTS_DATA_CONFIG } from './IfcDataConfig.js';
import { istSchacht } from './Kategorien.js';
import { achsbezugVon } from './Achsbezug.js';

const DN_MESH_FALLBACK_LIMIT = 200; // Querschnitts-Schätzung deckeln (teuer)


function _scalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return typeof v === 'object' ? null : v;
}

/** DN (mm) aus den Psets eines Items — erster NominalDiameter-Treffer. */
function _findDn(item) {
    for (const rel of (item?.IsDefinedBy ?? [])) {
        for (const p of (rel?.HasProperties ?? [])) {
            const name = _scalar(p?.Name);
            if (name && /nominaldiameter|\bdn\b/i.test(String(name))) {
                const v = Number(_scalar(p?.NominalValue) ?? _scalar(p?.Value));
                if (Number.isFinite(v) && v > 0) return v > 10 ? v : v * 1000; // m → mm Heuristik
            }
        }
    }
    return null;
}

/**
 * @returns {Promise<{ data, sampler, heightOffsetY } | null>}
 */
export async function buildLaengsschnittFromModel({
    apis = [], coordOffsets = {}, categoryGroups = null, fragmentsList = null,
    fragmentsManager = null, axisCategories = AXIS_CATEGORIES_DEFAULT,
    gelaendeSampler = null,
} = {}) {
    if (!categoryGroups || !fragmentsList) return null;

    // ── Haltungsachsen über den GeometryResolver (Sprint G) ────────────────
    // Axis-Repräsentation gewinnt; Rohre OHNE Axis (ProVI!) bekommen
    // automatisch eine Skelett-Achse aus dem Mesh — Provenienz in `source`.
    const resolver = createGeometryResolver({
        categoryGroups, fragmentsList, fragmentsManager,
        webIfcApis: apis, coordOffsets,
    });
    const axis = await resolver.forCategory(axisCategories).getForm('axis');
    const entries = (axis.perElement ?? []).filter(e => e.polyline?.length >= 2);
    if (!entries.length) return null;

    // DN aus Psets (Batch je Modell; localId ≙ expressID — dokumentierte Annahme)
    const dnById = new Map(); // 'modelId|localId' → dn
    if (fragmentsManager) {
        const byModel = new Map();
        for (const e of entries) {
            (byModel.get(e.modelId) ?? byModel.set(e.modelId, []).get(e.modelId)).push(e.localId);
        }
        for (const [modelId, localIds] of byModel) {
            try {
                const raw = await fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG);
                const items = Object.values(raw ?? {})[0] ?? [];
                for (const item of items) {
                    const lid = _scalar(item._localId ?? item.localId ?? item.expressID);
                    if (lid != null) dnById.set(`${modelId}|${lid}`, _findDn(item));
                }
            } catch { /* DN optional */ }
        }
    }

    // DN-Mesh-Fallback (Querschnitts-Schätzung) nur für Elemente ohne Pset-DN
    const missingDn = entries.filter(e => !dnById.get(`${e.modelId}|${e.localId}`))
        .slice(0, DN_MESH_FALLBACK_LIMIT);
    if (missingDn.length) {
        try {
            const dns = await resolver.forElements(missingDn).get('dn');
            for (const [key, res] of dns) {
                if (res?.value != null) dnById.set(key, res.value);
            }
        } catch { /* Fallback optional */ }
    }

    const axisItems = entries.map(e => ({
        category: e.category,
        expressId: e.localId,
        polyline: e.polyline,
        laenge: polylineLength(e.polyline),
        gefaelle: polylineGefaellePromille(e.polyline),
        dn: dnById.get(`${e.modelId}|${e.localId}`) ?? null,
        source: e.source, // 'axisRep' | 'mesh' (Skelett)
        // WO DIE HÖHE LIEGT (Teil XXI, E4): `buildStrang` rechnet damit auf die
        // Sohle. Vorher galt jede Achse als Sohle — auch eine aus dem Netz
        // skelettierte, die durch die Rohrmitte läuft.
        achsbezug: achsbezugVon(e.source),
    }));

    // ── Schächte ───────────────────────────────────────────────────────────
    const manholes = [];
    for (const group of categoryGroups) {
        if (!istSchacht(group.name)) continue;
        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map ?? {});
        for (const [modelId, rawIds] of entries) {
            const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
            if (!localIds?.length) continue;
            const model = fragmentsList.get(modelId);
            if (!model) continue;

            let boxes = null;
            try { boxes = await model.getBoxes(localIds); } catch { continue; }

            let nameById = new Map();
            if (fragmentsManager) {
                try {
                    const raw = await fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG);
                    const items = Object.values(raw ?? {})[0] ?? [];
                    for (const item of items) {
                        const lid = _scalar(item._localId ?? item.localId ?? item.expressID);
                        if (lid != null) nameById.set(lid, _scalar(item.Name) ?? '');
                    }
                } catch { /* Namen optional */ }
            }

            for (let i = 0; i < localIds.length; i++) {
                const box = boxes?.[i];
                if (!box || box.isEmpty()) continue;
                manholes.push({
                    x: (box.min.x + box.max.x) / 2,
                    z: (box.min.z + box.max.z) / 2,
                    deckel: box.max.y,
                    sohle: box.min.y,
                    name: nameById.get(localIds[i]) || `S${manholes.length + 1}`,
                });
            }
        }
    }

    // ── Gelände-Sampler (Sprint G: über die abgeleitete Oberfläche, damit
    // auch Erdkörper-Volumenkörper als Gelände funktionieren) ──────────────
    // Teil XIV: der Aufrufer reicht den EINEN Gelände-Sampler der Engine
    // herein (ohne Verdecktes, mit den eigenen DGM-Teilen) — der Rückfall
    // über die Kategorien bleibt für Aufrufer ohne Engine.
    let sampler = gelaendeSampler ?? null;
    if (!sampler) {
        try {
            const surf = await resolver.forCategory(GELAENDE_VORBELEGUNG).getForm('surface');
            if (surf.data?.triCount) sampler = makeHeightSampler(surf.data.positions, surf.data.triCount);
        } catch { /* Gelände optional */ }
    }

    const data = buildLaengsschnitt({ axisItems, manholes, sampler });
    if (!data) return null;

    // Höhen-Offset: roh (m NN) = welt.y + offset.y des ersten Modells.
    // Über `hoehenversatzAus`, weil dieselbe Rechnung vorher auch in
    // `usePlanExport` stand — und beide gleich falsch waren, solange die Engine
    // ein Array lieferte.
    const heightOffsetY = hoehenversatzAus(coordOffsets);

    return { data, sampler, heightOffsetY };
}
