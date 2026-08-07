/**
 * Vector Style Engine
 *
 * Resolves the rendering style for one IFC category from the user's saved style
 * map (or default). Designed to be the single point where every other piece of
 * the vector pipeline asks "what style do I use for this element?".
 *
 * Phase 2.1 — category-only lookup. Phase 2.2 will extend this with rule
 * matching against Pset values and IFC attributes.
 */

import { DEFAULT_LINE_STYLES, DASH_PATTERNS } from './DefaultLineStyles.js';

/**
 * Build a resolver bound to the given style map.
 * @param {Record<string, object>} userStyles - the live store state
 * @returns {(category: string) => object}     style for the category
 */
export function makeStyleResolver(userStyles) {
    return function resolve(category) {
        return userStyles?.[category]
            ?? userStyles?.default
            ?? DEFAULT_LINE_STYLES[category]
            ?? DEFAULT_LINE_STYLES.default;
    };
}

/**
 * Convert a resolved style to the legacy {r,g,b,w,dash,hatch} format that the
 * jsPDF rendering helpers in IfcVectorPlotter still expect. This keeps the
 * existing draw code untouched while we migrate styles to the new model.
 */
export function styleToLegacy(style) {
    if (!style) return null;
    const rgb = _hexToRgb(style.color ?? '#646464');
    return {
        r:     rgb.r,
        g:     rgb.g,
        b:     rgb.b,
        w:     style.lineWidth ?? 0.18,
        dash:  style.lineDash && style.lineDash !== 'solid',
        dashPattern: DASH_PATTERNS[style.lineDash] ?? [],
        hatch: style.hatchPattern ?? 'none',
        enabled: style.enabled !== false,
        labelTemplate:  style.labelTemplate  ?? '',
        labelFontSize:  style.labelFontSize  ?? 2.2,
        labelAnchor:    style.labelAnchor    ?? 'center',
        // T1: Punktsymbole (Schacht/Pumpe/…) — ersetzt die Kontur im Plot
        symbol:     style.symbol     ?? 'none',
        symbolSize: style.symbolSize ?? 3,
    };
}

function _hexToRgb(hex) {
    const m = String(hex).match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    return m
        ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
        : { r: 100, g: 100, b: 100 };
}
