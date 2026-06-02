/**
 * Category Attribute Probe
 *
 * Discovers which attributes and Pset properties are typically present on
 * elements of a given IFC category. Used by the Label-Template UI to show
 * the user a clickable list of "fields available in this model".
 *
 * Strategy: take a small random sample of localIds from the category, fetch
 * their data via OBC's fragments.getData(), and aggregate keys + value examples.
 *
 * Sampling — not all elements: a 30-item sample is enough to surface the
 * common fields. Full coverage isn't a goal (Psets are user-defined and may
 * differ between elements).
 */

import { FRAGMENTS_DATA_CONFIG as DATA_CONFIG } from './IfcDataConfig.js';

const ATTR_KEYS = ['Name', 'Description', 'GlobalId', 'Tag', 'ObjectType', 'PredefinedType'];

/**
 * @param {object} groupOrName - either a category-group { name, groupData } or just the name string
 * @param {Array}  allGroups   - all category groups (so we can resolve the name)
 * @param {Map}    fragmentsList
 * @param {object} fragmentsManager
 * @param {number} sampleSize
 * @returns {Promise<{ attributes: {key, samples: string[]}[], psets: {name, properties: {key, samples: string[]}[]}[], samplesUsed: number, totalElements: number }>}
 */
export async function probeCategory(groupOrName, allGroups, fragmentsList, fragmentsManager, sampleSize = 30) {
    const group = typeof groupOrName === 'string'
        ? (allGroups ?? []).find(g => g.name === groupOrName)
        : groupOrName;

    const empty = { attributes: [], psets: [], samplesUsed: 0, totalElements: 0 };
    if (!group || !fragmentsManager) return empty;

    let map;
    try { map = await group.groupData.get(); } catch { return empty; }
    if (!map) return empty;
    const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);

    // Aggregate attribute occurrences across all models in the category
    const attrSamples = new Map();   // key → Set<string sample values>
    const psetSamples = new Map();   // psetName → Map<propName, Set<values>>
    let total = 0, used = 0;

    for (const [modelId, rawIds] of entries) {
        const ids = _normalize(rawIds);
        if (!ids?.length) continue;
        total += ids.length;
        // Reservoir sample
        const picked = _sample(ids, Math.min(sampleSize, ids.length));
        used += picked.length;

        let raw;
        try { raw = await fragmentsManager.getData({ [modelId]: picked }, DATA_CONFIG); }
        catch { continue; }
        if (!raw) continue;

        for (const items of Object.values(raw)) {
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                // Top-level attributes
                for (const k of ATTR_KEYS) {
                    const val = _scalar(item[k]);
                    if (val == null) continue;
                    _addSample(attrSamples, k, String(val));
                }
                // Psets via IsDefinedBy
                for (const rel of (item.IsDefinedBy ?? [])) {
                    const psetName = rel?.Name?.value ?? rel?.Name;
                    if (!psetName || !Array.isArray(rel?.HasProperties)) continue;
                    const bucket = psetSamples.get(String(psetName))
                                ?? psetSamples.set(String(psetName), new Map()).get(String(psetName));
                    for (const prop of rel.HasProperties) {
                        const pn = prop?.Name?.value ?? prop?.Name;
                        if (!pn) continue;
                        const v = prop?.NominalValue?.value ?? prop?.Value?.value
                               ?? prop?.NominalValue   ?? prop?.Value;
                        if (v == null) continue;
                        _addSample(bucket, String(pn), String(v));
                    }
                }
            }
        }
    }

    return {
        attributes: [...attrSamples.entries()].map(([key, s]) => ({
            key,
            samples: [...s].slice(0, 5),
        })),
        psets: [...psetSamples.entries()].map(([name, propMap]) => ({
            name,
            properties: [...propMap.entries()].map(([k, s]) => ({
                key: k,
                samples: [...s].slice(0, 5),
            })),
        })),
        samplesUsed: used,
        totalElements: total,
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _scalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    if (typeof v === 'object') return null;
    return v;
}

function _normalize(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw instanceof Set)  return [...raw];
    if (raw && typeof raw[Symbol.iterator] === 'function') return [...raw];
    return null;
}

function _sample(arr, n) {
    if (arr.length <= n) return [...arr];
    const out = new Set();
    while (out.size < n) out.add(arr[Math.floor(Math.random() * arr.length)]);
    return [...out];
}

function _addSample(map, key, value) {
    if (!map.has(key)) map.set(key, new Set());
    const s = map.get(key);
    if (s.size < 8) s.add(value);
}
