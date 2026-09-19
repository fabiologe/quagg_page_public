/**
 * Shared OBC fragments.getData() config — narrow but enough for typical
 * Pset + attribute reads (rule conditions, label templates, attribute probes).
 *
 * Single source of truth: anyone calling `fragmentsManager.getData()` should
 * import this rather than duplicating the shape.
 */
export const FRAGMENTS_DATA_CONFIG = {
    attributesDefault: true,
    relationsDefault: { attributes: false, relations: false },
    relations: { IsDefinedBy: { attributes: true, relations: true } },
};

/**
 * Die GlobalId eines Datensatzes aus `fragmentsManager.getData()`.
 *
 * Die Bibliothek führt sie als `_guid` (`{value}`), NICHT als Attribut
 * `GlobalId` — gemessen am A64-Netz (2026-09-19): bei 40 von 40 Schächten ist
 * `_guid` genau die Kennung aus dem GUID-Index (`getGuidsByLocalIds`), ein
 * Attribut `GlobalId` hat keiner. Wer `item.GlobalId` las, bekam immer `''` —
 * im Cockpit griffen dadurch KG- und DIN-277-Zuweisungen von Hand nie.
 * `GlobalId` bleibt als Rückfall (andere Lader, Testdaten).
 */
export function globalIdAusDaten(item) {
    const v = item?._guid ?? item?.GlobalId;
    const g = v && typeof v === 'object' ? v.value : v;
    return typeof g === 'string' ? g : '';
}
