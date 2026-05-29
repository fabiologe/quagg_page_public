/**
 * Layer style definitions for the IFC viewer.
 * Add new styles here — no other file needs to change.
 *
 * Properties:
 *  id            — unique key
 *  label         — display label shown in the UI
 *  projection    — 'Perspective' | 'Orthographic'
 *  background    — hex color string or null (null = default dark bg)
 *  gridVisible   — boolean
 *  categoryColors — { IFC_CATEGORY_NAME: hex } or null (null = default engine palette)
 */
export const LAYER_STYLES = {
    realistic: {
        id:             'realistic',
        label:          '🎨 Realistisch',
        projection:     'Perspective',
        background:     null,
        gridVisible:    true,
        categoryColors: null,
    },
    plan: {
        id:             'plan',
        label:          '📐 Planungslayer',
        projection:     'Orthographic',
        background:     '#ffffff',
        gridVisible:    false,
        categoryColors: {
            IFCWALL:             '#2c2c2c',
            IFCWALLSTANDARDCASE: '#2c2c2c',
            IFCWALLTYPE:         '#2c2c2c',
            IFCSLAB:             '#555555',
            IFCSLABTYPE:         '#555555',
            IFCCOLUMN:           '#333333',
            IFCCOLUMNTYPE:       '#333333',
            IFCBEAM:             '#444444',
            IFCBEAMTYPE:         '#444444',
            IFCWINDOW:           '#7fbfff',
            IFCWINDOWTYPE:       '#7fbfff',
            IFCDOOR:             '#8b6914',
            IFCDOORTYPE:         '#8b6914',
            IFCPIPESEGMENT:      '#e65100',
            IFCPIPESEGMENTTYPE:  '#e65100',
            IFCPIPEFITTING:      '#e65100',
            IFCDUCT:             '#00695c',
            IFCDUCTTYPE:         '#00695c',
            IFCDUCTFITTING:      '#00695c',
            IFCROOF:             '#4e342e',
            IFCROOFTYPE:         '#4e342e',
            IFCFOOTING:          '#616161',
            IFCFOOTINGTYPE:      '#616161',
            IFCSTAIR:            '#757575',
            IFCSTAIRTYPE:        '#757575',
            IFCSTAIRFLIGHT:      '#757575',
            IFCPLATE:            '#546e7a',
            IFCMEMBER:           '#455a64',
            IFCMEMBERTYPE:       '#455a64',
            IFCSPACE:            '#b3e5fc',
            IFCCURTAINWALL:      '#4fc3f7',
            IFCCURTAINWALLTYPE:  '#4fc3f7',
            IFCRAILING:          '#37474f',
            IFCFLOWSEGMENT:      '#bf360c',
            IFCFLOWFITTING:      '#bf360c',
            IFCFLOWTERMINAL:     '#bf360c',
            IFCAIRTERMINAL:      '#006064',
            IFCPUMP:             '#311b92',
            IFCVALVE:            '#311b92',
            IFCFURNITURE:        '#795548',
            IFCFURNITURETYPE:    '#795548',
        },
    },
};

/**
 * Apply a layer style. Engine must expose:
 *   setBackgroundColor(hex|null), setGridVisible(bool),
 *   setCameraProjection(type), applyStyleColors(colorMap|null)
 */
export async function applyLayerStyle(style, engine) {
    if (!style || !engine) return;
    engine.setBackgroundColor(style.background ?? null);
    engine.setGridVisible(style.gridVisible ?? true);
    await engine.setCameraProjection(style.projection ?? 'Perspective');
    await engine.applyStyleColors(style.categoryColors ?? null);
}
