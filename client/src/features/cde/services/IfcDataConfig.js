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
