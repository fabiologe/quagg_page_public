/**
 * DIN 277-1 Flächenklassifikator
 *
 * Liest IFCSPACE-Elemente aus den categoryGroups, holt Pset/Attribute-Daten via
 * OBC fragmentsManager.getData, klassifiziert nach DIN 277-1 Klassen
 * (NUF1-7 / VF / TF) und summiert pro Geschoss + global.
 *
 * NUF-Klassifikation in der Praxis:
 *   IFC-Modelle bringen selten eine native DIN-277-Codierung mit. Standardweg:
 *     1. Wenn ein User-Override existiert (per GlobalId in der RepoFacade) → nehmen.
 *     2. Sonst: Pset_SpaceCommon.Reference auswerten (selten gepflegt).
 *     3. Fallback: Namens-Heuristik gegen den Raumnamen.
 *     4. Letzter Fallback: NUF (sonstige).
 *   Klassifikation ist deterministisch — User kann jederzeit übersteuern.
 *
 * Flächenermittlung:
 *   1. Qto_SpaceBaseQuantities.GrossFloorArea / NetFloorArea (offiziell).
 *   2. Pset_SpaceCommon.NetPlannedArea / GrossPlannedArea.
 *   3. Fallback: BoundingBox X × Z aus model.getBoxes (Draufsicht-Footprint).
 *
 * KGF (Konstruktionsfläche) wird hier NICHT direkt aus IFCSPACE berechnet — die
 * kommt erst in Sprint 1.2 aus IFCWALL/IFCCOLUMN-Footprints. Hier liefern wir
 * vorerst nur NUF/VF/TF + BGF (= Summe aller IFCSPACE-Footprints pro Geschoss).
 */

import { FRAGMENTS_DATA_CONFIG } from './IfcDataConfig.js';

// ── Klassifikations-Klassen ─────────────────────────────────────────────────

export const DIN277_CLASSES = Object.freeze({
    NUF1: { code: 'NUF1', label: 'Wohnen und Aufenthalt' },
    NUF2: { code: 'NUF2', label: 'Büroarbeit' },
    NUF3: { code: 'NUF3', label: 'Produktion, Hand- und Maschinenarbeit, Experimente' },
    NUF4: { code: 'NUF4', label: 'Lagern, Verteilen und Verkaufen' },
    NUF5: { code: 'NUF5', label: 'Bildung, Unterricht und Kultur' },
    NUF6: { code: 'NUF6', label: 'Heilen und Pflegen' },
    NUF7: { code: 'NUF7', label: 'Sonstige Nutzungsflächen' },
    VF:   { code: 'VF',   label: 'Verkehrsflächen' },
    TF:   { code: 'TF',   label: 'Technische Funktionsflächen' },
});

const NAME_HEURISTICS = [
    // VF — Verkehrsflächen
    { rx: /\b(flur|gang|korridor|halle|foyer|eingang|treppe|treppenhaus|aufzug|lift|rampe|atrium)/i, cls: 'VF' },

    // TF — Technische Funktionsflächen
    { rx: /\b(technik|technikraum|hls|elt|elektro|heizung|lüftung|lueftung|lueftungszentr|aufzugmaschin|maschinenraum|trafo|schalt|server|hausansch)/i, cls: 'TF' },

    // NUF6 — Heilen und Pflegen
    { rx: /\b(arzt|behandlung|untersuch|op-saal|patient|pflege|krankenhaus|klinik|sanitär|sanitaer|wc|toilette|dusche|bad|umkleide)/i, cls: 'NUF6' },

    // NUF5 — Bildung
    { rx: /\b(klassen|hörsaal|hoersaal|seminar|biblioth|aula|labor|werkst)/i, cls: 'NUF5' },

    // NUF4 — Lagern/Verkaufen
    { rx: /\b(lager|abstell|archiv|magazin|verkauf|laden|shop)/i, cls: 'NUF4' },

    // NUF3 — Produktion/Werkstatt
    { rx: /\b(produktion|fertigung|montage|werkstatt)/i, cls: 'NUF3' },

    // NUF2 — Büro
    { rx: /\b(büro|buero|besprech|konferenz|sitzung|empfang|chefz|rezeption)/i, cls: 'NUF2' },

    // NUF1 — Wohnen + Aufenthalt
    { rx: /\b(wohn|schlafz|kinderz|küche|kueche|esszimm|wohnzimm|aufenth|sozial|pausen)/i, cls: 'NUF1' },
];

function _heuristicClass(name = '', longName = '') {
    const probe = `${name} ${longName}`.toLowerCase();
    for (const { rx, cls } of NAME_HEURISTICS) {
        if (rx.test(probe)) return cls;
    }
    return 'NUF7'; // sonstige NUF
}

// ── Pset/Qto data extraction ────────────────────────────────────────────────

/** Pluck a scalar value through OBC's `{value: x}` wrapping. */
function _scalar(v) {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return typeof v === 'object' ? null : v;
}

/** Find a Pset by name (case-insensitive) in OBC's IsDefinedBy structure. */
function _findPsetProps(item, psetName) {
    const wanted = psetName.toLowerCase();
    for (const rel of (item?.IsDefinedBy ?? [])) {
        const name = _scalar(rel?.Name);
        if (!name || String(name).toLowerCase() !== wanted) continue;
        const out = {};
        for (const p of (rel?.HasProperties ?? [])) {
            const propName = _scalar(p?.Name);
            const v = _scalar(p?.NominalValue) ?? _scalar(p?.Value);
            if (propName) out[propName] = v;
        }
        return out;
    }
    return null;
}

/**
 * Compute the floor area of a space, in m². Tries the official quantity sets
 * first; falls back to a bbox-derived XZ-footprint when geometry data is rich
 * but Psets are sparse.
 */
function _computeArea(item, bbox) {
    const qto = _findPsetProps(item, 'Qto_SpaceBaseQuantities');
    if (qto) {
        const v = Number(qto.NetFloorArea ?? qto.GrossFloorArea);
        if (Number.isFinite(v) && v > 0) return v;
    }
    const cmn = _findPsetProps(item, 'Pset_SpaceCommon');
    if (cmn) {
        const v = Number(cmn.NetPlannedArea ?? cmn.GrossPlannedArea);
        if (Number.isFinite(v) && v > 0) return v;
    }
    if (bbox && !bbox.isEmpty()) {
        const dx = bbox.max.x - bbox.min.x;
        const dz = bbox.max.z - bbox.min.z;
        if (dx > 0 && dz > 0) return dx * dz;
    }
    return 0;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Iterate every IFCSPACE in every loaded model and produce a per-space record
 * plus aggregates (per storey, per class, global).
 *
 * @param {Array<{name, groupData}>} categoryGroups  engine.getCategoryGroups()
 * @param {Map<string, FragmentsModel>} fragmentsList  engine.getFragmentsList()
 * @param {FragmentsManager} fragmentsManager  engine.getFragmentsManager()
 * @param {Tree} spatialTree  engine.getSpatialTree() — first model's tree
 * @param {object} opts  { overrides?: Map<globalId, classCode> }
 * @returns {Promise<{ spaces: SpaceRecord[], byStorey: Map, totals: object }>}
 */
export async function classifyDin277({
    categoryGroups, fragmentsList, fragmentsManager, spatialTree, overrides = new Map(),
} = {}) {
    if (!categoryGroups || !fragmentsList || !fragmentsManager) {
        return { spaces: [], byStorey: new Map(), totals: _emptyTotals() };
    }

    // 1. find IFCSPACE group
    const spaceGroup = categoryGroups.find(g => g.name === 'IFCSPACE');
    if (!spaceGroup) return { spaces: [], byStorey: new Map(), totals: _emptyTotals() };

    // 2. flatten {modelId: localIds[]}
    const map = await spaceGroup.groupData.get();
    const entries = map instanceof Map ? [...map.entries()] : Object.entries(map);
    if (!entries.length) return { spaces: [], byStorey: new Map(), totals: _emptyTotals() };

    // 3. build localId → storeyId lookup from spatial tree
    const storeyByLocalId = _buildStoreyIndex(spatialTree);

    // 4. iterate models, batch-fetch data + bboxes
    const spaces = [];
    for (const [modelId, rawIds] of entries) {
        const localIds = Array.isArray(rawIds) ? rawIds : (rawIds instanceof Set ? [...rawIds] : null);
        if (!localIds?.length) continue;
        const model = fragmentsList.get(modelId);
        if (!model) continue;

        let raw, boxes;
        try {
            [raw, boxes] = await Promise.all([
                fragmentsManager.getData({ [modelId]: localIds }, FRAGMENTS_DATA_CONFIG),
                model.getBoxes(localIds),
            ]);
        } catch (e) {
            console.warn('[Din277] data/box fetch failed for model', modelId, e?.message ?? e);
            continue;
        }

        const items = Object.values(raw ?? {})[0] ?? [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const localId  = _scalar(item._localId ?? item.localId ?? item.expressID);
            const globalId = _scalar(item.GlobalId) ?? '';
            const name     = _scalar(item.Name)        ?? '';
            const longName = _scalar(item.LongName)    ?? '';
            const bbox     = boxes?.[i] ?? null;

            const cls = overrides.get(globalId)
                     ?? _refClass(item)
                     ?? _heuristicClass(name, longName);

            const area = _computeArea(item, bbox);

            spaces.push({
                modelId, localId, globalId,
                name, longName,
                storeyLocalId: storeyByLocalId.get(localId) ?? null,
                classCode: cls,
                area_m2:   area,
                source:    overrides.has(globalId) ? 'override' : 'auto',
            });
        }
    }

    // 5. aggregate per storey and globally
    const byStorey = new Map();
    const totals   = _emptyTotals();
    for (const s of spaces) {
        if (!byStorey.has(s.storeyLocalId)) byStorey.set(s.storeyLocalId, _emptyTotals());
        const t = byStorey.get(s.storeyLocalId);
        t[s.classCode] = (t[s.classCode] ?? 0) + s.area_m2;
        t.NUF_total = (t.NUF_total ?? 0) + (s.classCode.startsWith('NUF') ? s.area_m2 : 0);
        t.BGF = (t.BGF ?? 0) + s.area_m2;
        totals[s.classCode] = (totals[s.classCode] ?? 0) + s.area_m2;
        totals.NUF_total = (totals.NUF_total ?? 0) + (s.classCode.startsWith('NUF') ? s.area_m2 : 0);
        totals.BGF       = (totals.BGF       ?? 0) + s.area_m2;
    }
    // NGF = NUF + VF + TF (DIN 277-1)
    totals.NGF = (totals.NUF_total ?? 0) + (totals.VF ?? 0) + (totals.TF ?? 0);
    for (const t of byStorey.values()) {
        t.NGF = (t.NUF_total ?? 0) + (t.VF ?? 0) + (t.TF ?? 0);
    }

    return { spaces, byStorey, totals };
}

function _emptyTotals() {
    const t = { BGF: 0, NGF: 0, NUF_total: 0 };
    for (const k of Object.keys(DIN277_CLASSES)) t[k] = 0;
    return t;
}

/**
 * Map every space → its enclosing storey by walking the spatial tree once.
 * We attach storey by the closest IFCBUILDINGSTOREY ancestor.
 */
function _buildStoreyIndex(tree) {
    const out = new Map();
    if (!tree) return out;
    const walk = (node, currentStorey) => {
        if (!node) return;
        const cat = String(node.category ?? '').toUpperCase();
        const storey = cat === 'IFCBUILDINGSTOREY' ? node.localId : currentStorey;
        if (cat === 'IFCSPACE' && storey != null) out.set(node.localId, storey);
        for (const c of (node.children ?? [])) walk(c, storey);
    };
    walk(tree, null);
    return out;
}

/**
 * Reads Pset_SpaceCommon.Reference. Some authoring tools encode the DIN class
 * there directly (NUF1, VF, TF, …). When that's the case we return it; the
 * caller falls back to name-heuristics otherwise.
 */
function _refClass(item) {
    const cmn = _findPsetProps(item, 'Pset_SpaceCommon');
    const ref = String(cmn?.Reference ?? '').trim().toUpperCase();
    if (ref && DIN277_CLASSES[ref]) return ref;
    return null;
}
