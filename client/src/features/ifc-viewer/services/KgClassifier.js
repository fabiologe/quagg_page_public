/**
 * DIN 276 Kostengruppen-Klassifikator
 *
 * Iteriert über alle categoryGroups, fetched bei Bedarf Pset/Attribute via
 * fragmentsManager.getData, wertet die Mapping-Regeln aus und sammelt pro
 * KG-Code: Element-Count + Brutto-Volumen aus BoundingBox.
 *
 * Output:
 *   {
 *     byKg: Map<kgCode, { count, volume_m3, elements: [{modelId, localId, globalId, category}] }>,
 *     unassigned: { count, byCategory: Map<category, count> },
 *   }
 *
 * Performance: nur die Regeln, die Pset/Property-Reads brauchen, triggern
 * data-fetches — über `rulesNeedElementData` aus dem RuleEngine.
 */

import { findMatchingRule } from './VectorRuleEngine.js';
import { FRAGMENTS_DATA_CONFIG } from './IfcDataConfig.js';
import * as THREE from 'three';

/** Unwrap OBC's `{value: x}` shape. */
function _scalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return typeof v === 'object' ? null : v;
}

/** Convert IsDefinedBy-array into `{psetName: {prop: val}}`. */
function _flattenPsets(item) {
    const out = {};
    for (const rel of (item?.IsDefinedBy ?? [])) {
        const psetName = _scalar(rel?.Name);
        if (!psetName) continue;
        const props = {};
        for (const p of (rel?.HasProperties ?? [])) {
            const propName = _scalar(p?.Name);
            const v = _scalar(p?.NominalValue) ?? _scalar(p?.Value);
            if (propName) props[propName] = v;
        }
        out[psetName] = props;
    }
    return out;
}

const ATTR_KEYS = ['Name', 'Description', 'GlobalId', 'Tag', 'ObjectType', 'PredefinedType'];
function _flattenAttrs(item) {
    const out = {};
    for (const k of ATTR_KEYS) {
        const v = _scalar(item?.[k]);
        if (v != null) out[k] = v;
    }
    return out;
}

/**
 * Does this rule set need element-level Pset/attribute data?
 * (If only category-conditions, we can skip data fetches per category.)
 */
function _ruleNeedsData(rule) {
    return rule?.condition?.psetName != null
        || (rule?.condition?.propertyName != null && rule?.condition?.propertyName !== '');
}
function _anyRuleForCategoryNeedsData(rules, category) {
    return rules.some(r => {
        if (r?.enabled === false) return false;
        const c = r.condition?.category;
        if (c && c !== category) return false;
        return _ruleNeedsData(r);
    });
}

/**
 * Run the classifier.
 *
 * @param {object} args
 * @param {Array<{name, groupData}>} args.categoryGroups
 * @param {Map<string, FragmentsModel>} args.fragmentsList
 * @param {FragmentsManager} args.fragmentsManager
 * @param {Array<Rule>} args.rules — KG mapping rules
 * @param {Map<string, string>} [args.overrides] — globalId → kgCode override
 * @returns {Promise<{ byKg: Map, unassigned: object, perElement: Map }>}
 */
export async function classifyKg({
    categoryGroups, fragmentsList, fragmentsManager, rules, overrides = new Map(),
} = {}) {
    const byKg = new Map();
    const unassigned = { count: 0, byCategory: new Map() };
    const perElement = new Map(); // `${modelId}|${localId}` → kgCode

    if (!categoryGroups?.length || !fragmentsList || !rules?.length) {
        return { byKg, unassigned, perElement };
    }

    const size = new THREE.Vector3();
    const enabledRules = rules.filter(r => r?.enabled !== false);

    for (const group of categoryGroups) {
        const category = group.name;
        const catRules = enabledRules.filter(r => {
            const c = r.condition?.category;
            return !c || c === category;
        });
        // category-only override might still apply even when catRules is empty;
        // but matching needs at least one rule — skip otherwise.
        const needsData = fragmentsManager && _anyRuleForCategoryNeedsData(catRules, category);

        let map;
        try { map = await group.groupData.get(); } catch { continue; }
        if (!map) continue;
        const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);

        for (const [modelId, rawIds] of entries) {
            const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
            if (!localIds?.length) continue;
            const model = fragmentsList.get(modelId);
            if (!model) continue;

            // Bbox per element — used for volume aggregation.
            let boxes = null;
            try { boxes = await model.getBoxes(localIds); } catch { /* */ }

            // Pset/attribute data — only when a relevant rule needs it
            let parsedData = null;
            if (needsData) {
                try {
                    const raw = await fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG);
                    const items = Object.values(raw ?? {})[0] ?? [];
                    parsedData = new Map();
                    for (const item of items) {
                        const lid = _scalar(item._localId ?? item.localId ?? item.expressID);
                        if (lid == null) continue;
                        parsedData.set(lid, {
                            attributes: _flattenAttrs(item),
                            psets:      _flattenPsets(item),
                            globalId:   _scalar(item.GlobalId) ?? '',
                        });
                    }
                } catch (e) {
                    console.warn('[KG] data fetch failed', category, e?.message ?? e);
                }
            }

            for (let i = 0; i < localIds.length; i++) {
                const localId = localIds[i];
                const elemData = parsedData?.get(localId);
                const globalId = elemData?.globalId
                              ?? (boxes?.[i] ? '' : ''); // bbox-only path has no globalId

                let kgCode = overrides.get(globalId);
                if (!kgCode) {
                    const ctx = {
                        category,
                        attributes: elemData?.attributes ?? {},
                        psets:      elemData?.psets      ?? {},
                    };
                    const matched = findMatchingRule(catRules, ctx);
                    kgCode = matched?.kgCode ?? null;
                }

                if (!kgCode) {
                    unassigned.count++;
                    unassigned.byCategory.set(category, (unassigned.byCategory.get(category) ?? 0) + 1);
                    continue;
                }

                const box = boxes?.[i];
                let volume = 0;
                if (box && !box.isEmpty()) {
                    box.getSize(size);
                    volume = size.x * size.y * size.z;
                }

                if (!byKg.has(kgCode)) byKg.set(kgCode, { count: 0, volume_m3: 0, elements: [] });
                const bucket = byKg.get(kgCode);
                bucket.count++;
                bucket.volume_m3 += volume;
                bucket.elements.push({ modelId, localId, globalId, category });

                perElement.set(`${modelId}|${localId}`, kgCode);
            }
        }
    }

    return { byKg, unassigned, perElement };
}
