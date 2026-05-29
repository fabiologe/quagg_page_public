/**
 * Built-in Vector Style Presets
 *
 * Reference style sets that the user can load with one click.
 * Each preset is a partial map of category → style — categories not present
 * in the preset keep their current value (so e.g. the Sewer preset can leave
 * Hochbau-categories untouched).
 *
 * These are read-only — the user can save custom presets in localStorage but
 * cannot overwrite the built-ins.
 */

function mk(color, lineWidth, lineDash = 'solid', hatchPattern = 'none') {
    return { color, lineWidth, lineDash, hatchPattern, enabled: true };
}

/**
 * DIN-orientiert: schwarze Linien in nach Wandstärke abgestuften Strichdicken,
 * Beton-Schraffur in Schnittflächen, gestrichelt für Treppen/Dächer (DIN 1356-2).
 */
const DIN_STYLES = {
    IFCWALL:              mk('#000000', 0.50, 'solid',   'concrete'),
    IFCWALLSTANDARDCASE:  mk('#000000', 0.50, 'solid',   'concrete'),
    IFCCOLUMN:            mk('#000000', 0.70, 'solid',   'concrete'),
    IFCBEAM:              mk('#000000', 0.50, 'solid',   'steel'),
    IFCSLAB:              mk('#000000', 0.35, 'solid',   'concrete'),
    IFCROOF:              mk('#000000', 0.35, 'dashed'),
    IFCSTAIR:             mk('#000000', 0.35, 'dashed'),
    IFCSTAIRFLIGHT:       mk('#000000', 0.35, 'dashed'),
    IFCDOOR:              mk('#000000', 0.25, 'solid'),
    IFCWINDOW:            mk('#000000', 0.25, 'solid'),
    IFCFOOTING:           mk('#000000', 0.50, 'solid',   'concrete'),
    IFCRAILING:           mk('#000000', 0.18, 'solid'),
    IFCMEMBER:            mk('#000000', 0.35, 'solid'),
    IFCSPACE:             mk('#969696', 0.12, 'dotted'),
    IFCFURNITURE:         mk('#646464', 0.15, 'solid'),
};

/**
 * Siedlungswasserwirtschaft / Kanalnetz — orange-Rohrtöne, braune Schächte,
 * türkis für Lüftung/Druckluft. Hochbau-Elemente nicht geändert.
 */
const SEWER_STYLES = {
    IFCPIPESEGMENT:       mk('#c85000', 0.35, 'solid'),
    IFCPIPEFITTING:       mk('#c85000', 0.30, 'solid'),
    IFCPIPESEGMENTTYPE:   mk('#c85000', 0.35, 'solid'),
    IFCFLOWSEGMENT:       mk('#b43c00', 0.30, 'solid'),
    IFCFLOWFITTING:       mk('#b43c00', 0.30, 'solid'),
    IFCFLOWTERMINAL:      mk('#b43c00', 0.30, 'solid'),
    IFCDUCT:              mk('#007878', 0.25, 'solid'),
    IFCDUCTFITTING:       mk('#007878', 0.25, 'solid'),
    IFCAIRTERMINAL:       mk('#00a0a0', 0.25, 'solid'),
    IFCVALVE:             mk('#6400c8', 0.30, 'solid'),
    IFCPUMP:              mk('#6400c8', 0.35, 'solid'),
    IFCDISTRIBUTIONCHAMBERELEMENT: mk('#8a5a32', 0.45, 'solid', 'concrete'),
};

/**
 * Architekturplan, farbig — strukturierende Farbcodes für Übersichtspläne.
 */
const ARCHITECT_COLOR_STYLES = {
    IFCWALL:              mk('#2c2c2c', 0.40, 'solid',   'concrete'),
    IFCWALLSTANDARDCASE:  mk('#2c2c2c', 0.40, 'solid',   'concrete'),
    IFCCOLUMN:            mk('#5d4037', 0.55, 'solid',   'concrete'),
    IFCBEAM:              mk('#5d4037', 0.40, 'solid'),
    IFCSLAB:              mk('#bcaaa4', 0.25, 'solid'),
    IFCDOOR:              mk('#6d4c41', 0.22, 'solid'),
    IFCWINDOW:            mk('#1565c0', 0.22, 'solid'),
    IFCROOF:              mk('#795548', 0.35, 'dashed'),
    IFCSTAIR:             mk('#795548', 0.30, 'dashed'),
    IFCSPACE:             mk('#80cbc4', 0.12, 'dotted'),
    IFCFURNITURE:         mk('#a1887f', 0.15, 'solid'),
};

export const BUILT_IN_PRESETS = [
    { id: 'din',       name: 'DIN 1356-2 (schwarz/weiß)', styles: DIN_STYLES,              builtin: true },
    { id: 'sewer',     name: 'Siedlungswasser / Kanal',   styles: SEWER_STYLES,            builtin: true },
    { id: 'architect', name: 'Architektur (farbig)',      styles: ARCHITECT_COLOR_STYLES,  builtin: true },
];
