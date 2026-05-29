/**
 * Default line styles per IFC category.
 *
 * The User can override these in the Vector Style Editor; this module just
 * provides reasonable starting values inspired by DIN 1356-2 conventions.
 *
 * Shape:
 *   color:        '#rrggbb'
 *   lineWidth:    mm  (paper units)
 *   lineDash:     'solid' | 'dashed' | 'dotted' | 'dashDot' | 'phantom' | 'longDash'
 *   hatchPattern: 'none' | 'concrete' | 'steel' | 'masonry' | 'wood' | 'earth' | 'glass'
 *   enabled:      true  (false = skip element entirely)
 */

export const DASH_PATTERNS = {
    solid:    [],
    dashed:   [3, 2],
    dotted:   [0.5, 0.8],
    dashDot:  [3, 1, 0.5, 1],
    phantom:  [4, 1, 0.5, 1, 0.5, 1],   // DIN: hidden lines
    longDash: [6, 2],
};

export const HATCH_PATTERNS_OPTIONS = ['none','concrete','steel','masonry','wood','earth','glass'];

function mk(color, lineWidth, lineDash = 'solid', hatchPattern = 'none') {
    return { color, lineWidth, lineDash, hatchPattern, enabled: true };
}

export const DEFAULT_LINE_STYLES = {
    // Architectural
    IFCWALL:              mk('#000000', 0.35, 'solid',  'concrete'),
    IFCWALLSTANDARDCASE:  mk('#000000', 0.35, 'solid',  'concrete'),
    IFCWALLTYPE:          mk('#000000', 0.35, 'solid',  'concrete'),
    IFCCOLUMN:            mk('#000000', 0.50, 'solid',  'concrete'),
    IFCCOLUMNTYPE:        mk('#000000', 0.50, 'solid',  'concrete'),
    IFCSLAB:              mk('#3c3c3c', 0.25, 'solid',  'concrete'),
    IFCSLABTYPE:          mk('#3c3c3c', 0.25, 'solid',  'concrete'),
    IFCDOOR:              mk('#000000', 0.20, 'solid'),
    IFCDOORTYPE:          mk('#000000', 0.20, 'solid'),
    IFCWINDOW:            mk('#0064c8', 0.20, 'solid'),
    IFCWINDOWTYPE:        mk('#0064c8', 0.20, 'solid'),
    IFCBEAM:              mk('#000000', 0.35, 'solid',  'steel'),
    IFCBEAMTYPE:          mk('#000000', 0.35, 'solid',  'steel'),
    IFCSTAIR:             mk('#505050', 0.25, 'dashed'),
    IFCSTAIRFLIGHT:       mk('#505050', 0.25, 'dashed'),
    IFCROOF:              mk('#505050', 0.25, 'dashed'),
    IFCFOOTING:           mk('#505050', 0.30, 'solid',  'concrete'),
    IFCFOOTINGTYPE:       mk('#505050', 0.30, 'solid',  'concrete'),
    IFCPLATE:             mk('#505050', 0.20, 'solid'),
    IFCMEMBER:            mk('#282828', 0.30, 'solid'),
    IFCRAILING:           mk('#000000', 0.18, 'solid'),
    IFCCURTAINWALL:       mk('#0064c8', 0.25, 'solid'),

    // MEP / Infrastructure (sewer-oriented colours)
    IFCPIPESEGMENT:       mk('#c85000', 0.25, 'solid'),
    IFCPIPEFITTING:       mk('#c85000', 0.25, 'solid'),
    IFCPIPESEGMENTTYPE:   mk('#c85000', 0.25, 'solid'),
    IFCDUCT:              mk('#007878', 0.25, 'solid'),
    IFCDUCTFITTING:       mk('#007878', 0.25, 'solid'),
    IFCDUCTTYPE:          mk('#007878', 0.25, 'solid'),
    IFCFLOWSEGMENT:       mk('#b43c00', 0.22, 'solid'),
    IFCFLOWFITTING:       mk('#b43c00', 0.22, 'solid'),
    IFCFLOWTERMINAL:      mk('#b43c00', 0.22, 'solid'),
    IFCAIRTERMINAL:       mk('#007878', 0.22, 'solid'),
    IFCDISTRIBUTIONCHAMBERELEMENT: mk('#a06432', 0.30, 'solid', 'concrete'),
    IFCPUMP:              mk('#6400c8', 0.25, 'solid'),
    IFCVALVE:             mk('#6400c8', 0.25, 'solid'),

    // Furnishings + spaces
    IFCFURNITURE:         mk('#785a32', 0.15, 'solid'),
    IFCFURNITURETYPE:     mk('#785a32', 0.15, 'solid'),
    IFCSPACE:             mk('#a0a0a0', 0.12, 'dotted'),
    IFCBUILDINGELEMENTPROXY: mk('#969696', 0.20, 'solid'),

    // Fallback for unknown categories
    default:              mk('#646464', 0.18, 'solid'),
};

/** Produce a deep clone of the defaults — used as initial state in the store. */
export function cloneDefaults() {
    const out = {};
    for (const [k, v] of Object.entries(DEFAULT_LINE_STYLES)) out[k] = { ...v };
    return out;
}
