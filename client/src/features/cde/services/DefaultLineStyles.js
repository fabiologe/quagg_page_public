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

// labelTemplate defaults to '' (off). Users opt in per-category in the editor.
// IFCSPACE is the one exception below — rooms almost always have a Name worth showing.
// symbol (T1): 'none' | 'schacht' | 'pumpe' | 'einlauf' | 'hydrant' | 'armatur'
//   — ersetzt die Element-Kontur durch ein papierfestes Punktsymbol (symbolSize mm).
function mk(color, lineWidth, lineDash = 'solid', hatchPattern = 'none', labelTemplate = '', labelFontSize = 2.2, labelAnchor = 'center', symbol = 'none', symbolSize = 3) {
    return { color, lineWidth, lineDash, hatchPattern,
             labelTemplate, labelFontSize, labelAnchor,
             symbol, symbolSize,
             enabled: true };
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

    // Furnishings + spaces — IFCSPACE is the only auto-labeled category
    IFCFURNITURE:         mk('#785a32', 0.15, 'solid'),
    IFCFURNITURETYPE:     mk('#785a32', 0.15, 'solid'),
    IFCSPACE:             mk('#a0a0a0', 0.12, 'dotted', 'none', '{Name|LongName}', 2.6),
    IFCBUILDINGELEMENTPROXY: mk('#969696', 0.20, 'solid'),

    // ── Tiefbau / Infrastruktur (Sprint T1, IFC 4.3) ────────────────────────
    IFCGEOGRAPHICELEMENT: mk('#6d4c41', 0.25, 'solid'),           // Gelände
    IFCEARTHWORKSCUT:     mk('#8d6e63', 0.18, 'solid', 'earth'),  // Aushub
    IFCEARTHWORKSFILL:    mk('#8d6e63', 0.18, 'solid', 'earth'),  // Verfüllung/Damm
    IFCEARTHWORKSELEMENT: mk('#8d6e63', 0.18, 'solid', 'earth'),
    IFCCOURSE:            mk('#9e9d24', 0.18, 'solid'),           // Oberbau-Schichten
    IFCKERB:              mk('#424242', 0.35, 'solid'),           // Bordstein — kräftige Doppelkante
    IFCPAVEMENT:          mk('#757575', 0.18, 'solid'),           // Fahrbahn/Belag

    // Fallback for unknown categories
    default:              mk('#646464', 0.18, 'solid'),
};

/** Auswahlliste für den Stil-Editor (T1: Punktsymbole). */
export const SYMBOL_OPTIONS = ['none', 'schacht', 'pumpe', 'einlauf', 'hydrant', 'armatur'];

/** Produce a deep clone of the defaults — used as initial state in the store. */
export function cloneDefaults() {
    const out = {};
    for (const [k, v] of Object.entries(DEFAULT_LINE_STYLES)) out[k] = { ...v };
    return out;
}
