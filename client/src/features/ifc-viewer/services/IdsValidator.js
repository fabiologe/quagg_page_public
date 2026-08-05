/**
 * IDS-Validator — führt die Prüfregeln aus IdsDefaults.js gegen das geladene
 * Modell aus (Cockpit-Karte „BIM-Qualität").
 *
 * Arbeitsweise je Spec:
 *   1. Kategorie-Gruppe finden (applicability.category)
 *   2. Element-Daten (Attribute + Psets) batchweise über fragmentsManager holen
 *   3. optionalen Pre-Filter anwenden (applicability.psetCondition)
 *   4. Requirements prüfen: attribute | pset | pset-equals
 *
 * Ergebnis pro Spec: anwendbare Elemente, bestanden, Fehlliste mit
 * Element-Referenzen (für Zoom/Highlight) und Meldungstexten.
 */

import { FRAGMENTS_DATA_CONFIG } from './IfcDataConfig.js';

/** Unwrap OBC's `{value: x}` shape. */
function _scalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return typeof v === 'object' ? null : v;
}

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

const ATTR_KEYS = ['Name', 'Description', 'GlobalId', 'Tag', 'ObjectType', 'PredefinedType', 'LongName'];
function _flattenAttrs(item) {
    const out = {};
    for (const k of ATTR_KEYS) {
        const v = _scalar(item?.[k]);
        if (v != null) out[k] = v;
    }
    return out;
}

function _isPresent(v) {
    return v !== undefined && v !== null && String(v).trim() !== '';
}

function _psetValue(psets, psetName, propertyName) {
    const pset = psets?.[psetName];
    if (!pset) return undefined;
    return propertyName ? pset[propertyName] : pset;
}

/** Ein Requirement gegen einen Element-Kontext prüfen → Meldung oder null. */
function _checkRequirement(req, ctx) {
    if (req.kind === 'attribute') {
        return _isPresent(ctx.attributes?.[req.name]) ? null : (req.message ?? `${req.name} fehlt`);
    }
    if (req.kind === 'pset') {
        const v = _psetValue(ctx.psets, req.psetName, req.propertyName);
        return _isPresent(v) ? null : (req.message ?? `${req.psetName}.${req.propertyName} fehlt`);
    }
    if (req.kind === 'pset-equals') {
        const v = _psetValue(ctx.psets, req.psetName, req.propertyName);
        const ok = _isPresent(v) && String(v).toLowerCase() === String(req.value).toLowerCase();
        return ok ? null : (req.message ?? `${req.psetName}.${req.propertyName} ≠ ${req.value}`);
    }
    return null; // unbekannter Requirement-Typ → nicht prüfbar, nicht fehlgeschlagen
}

function _matchesPreFilter(cond, ctx) {
    if (!cond) return true;
    const v = _psetValue(ctx.psets, cond.psetName, cond.propertyName);
    if (!_isPresent(v)) return false;
    return String(v).toLowerCase() === String(cond.value).toLowerCase();
}

/**
 * @param {object} args
 * @param {Array} args.specs               IDS-Specs (IdsDefaults-Format)
 * @param {Array<{name, groupData}>} args.categoryGroups
 * @param {Map} args.fragmentsList
 * @param {FragmentsManager} args.fragmentsManager
 * @returns {Promise<{
 *   perSpec: Array<{ spec, applicable, passed, failed: Array<{modelId, localId, globalId, name, messages}> }>,
 *   summary: { specsChecked, errors, warnings, infos, totalApplicable, totalFailed, score },
 * }>}
 */
export async function validateIds({ specs, categoryGroups, fragmentsList, fragmentsManager } = {}) {
    const perSpec = [];
    const summary = { specsChecked: 0, errors: 0, warnings: 0, infos: 0, totalApplicable: 0, totalFailed: 0, score: 1 };
    const enabled = (specs ?? []).filter(s => s?.enabled !== false);
    if (!enabled.length || !categoryGroups?.length || !fragmentsList || !fragmentsManager) {
        return { perSpec, summary };
    }

    // Element-Daten je Kategorie nur EINMAL holen, egal wie viele Specs sie prüfen
    const wantedCategories = new Set(enabled.map(s => s.applicability?.category).filter(Boolean));
    const dataByCategory = new Map(); // category → [{modelId, localId, globalId, attributes, psets}]

    for (const category of wantedCategories) {
        const group = categoryGroups.find(g => g.name === category);
        if (!group) { dataByCategory.set(category, []); continue; }
        const elements = [];
        try {
            const map = await group.groupData.get();
            const entries = map instanceof Map ? [...map.entries()] : Object.entries(map ?? {});
            for (const [modelId, rawIds] of entries) {
                const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
                if (!localIds?.length || !fragmentsList.get(modelId)) continue;
                const raw = await fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG);
                const items = Object.values(raw ?? {})[0] ?? [];
                for (const item of items) {
                    const localId = _scalar(item._localId ?? item.localId ?? item.expressID);
                    if (localId == null) continue;
                    elements.push({
                        modelId, localId,
                        globalId:   _scalar(item.GlobalId) ?? '',
                        attributes: _flattenAttrs(item),
                        psets:      _flattenPsets(item),
                    });
                }
            }
        } catch (e) {
            console.warn('[IDS] Daten-Fetch fehlgeschlagen für', category, e?.message ?? e);
        }
        dataByCategory.set(category, elements);
    }

    for (const spec of enabled) {
        const elements = dataByCategory.get(spec.applicability?.category) ?? [];
        const applicable = elements.filter(el => _matchesPreFilter(spec.applicability?.psetCondition, el));

        const failed = [];
        for (const el of applicable) {
            const messages = [];
            for (const req of (spec.requirements ?? [])) {
                const msg = _checkRequirement(req, el);
                if (msg) messages.push(msg);
            }
            if (messages.length) {
                failed.push({
                    modelId: el.modelId, localId: el.localId, globalId: el.globalId,
                    name: el.attributes?.Name ?? '', category: spec.applicability.category,
                    messages,
                });
            }
        }

        perSpec.push({ spec, applicable: applicable.length, passed: applicable.length - failed.length, failed });
        summary.specsChecked++;
        summary.totalApplicable += applicable.length;
        summary.totalFailed     += failed.length;
        if (failed.length) {
            if (spec.severity === 'error')        summary.errors++;
            else if (spec.severity === 'warning') summary.warnings++;
            else                                  summary.infos++;
        }
    }

    summary.score = summary.totalApplicable > 0
        ? (summary.totalApplicable - summary.totalFailed) / summary.totalApplicable
        : 1;
    return { perSpec, summary };
}
