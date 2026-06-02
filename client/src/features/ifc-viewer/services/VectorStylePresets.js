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
 * DIN 1356-1:1995-02 — Tabelle 2 "Linienbreiten", Liniengruppe II für Maßstab 1:100.
 *
 *   Zeile 1 — Begrenzung von Schnittflächen        0.50 mm  (Vollinie)
 *   Zeile 2 — Sichtbare Kanten / Umrisse           0.35 mm  (Vollinie, auch für schmale
 *                                                  Bauteile in der Schnittfläche)
 *   Zeile 3 — Maßlinien / Hilfslinien              0.25 mm  (Vollinie)
 *   Zeile 4 — Verdeckte Kanten                     0.35 mm  (Strichlinie)
 *   Zeile 6 — Achsen                               0.25 mm  (Strichpunktlinie)
 *   Zeile 7 — Bauteile vor/über Schnittebene       0.35 mm  (Punktlinie) — wird im
 *                                                  Plotter automatisch über aboveCut
 *                                                  als dotted gesetzt.
 *
 * Schraffuren: Beton-45° für tragende massive Bauteile, Stahl-Kreuzschraffur für Profile.
 * IFCSPACE: hellgrau/dotted, ausschließlich zur Raumkennzeichnung.
 */
const DIN_STYLES = {
    // ── Begrenzung von Schnittflächen — 0.50 mm Vollinie ───────────────────
    IFCWALL:              mk('#000000', 0.50, 'solid',  'concrete'),
    IFCWALLSTANDARDCASE:  mk('#000000', 0.50, 'solid',  'concrete'),
    IFCWALLTYPE:          mk('#000000', 0.50, 'solid',  'concrete'),
    IFCCOLUMN:            mk('#000000', 0.50, 'solid',  'concrete'),
    IFCCOLUMNTYPE:        mk('#000000', 0.50, 'solid',  'concrete'),
    IFCBEAM:              mk('#000000', 0.50, 'solid',  'steel'),
    IFCBEAMTYPE:          mk('#000000', 0.50, 'solid',  'steel'),
    IFCFOOTING:           mk('#000000', 0.50, 'solid',  'concrete'),
    IFCFOOTINGTYPE:       mk('#000000', 0.50, 'solid',  'concrete'),

    // ── Sichtbare Kanten — 0.35 mm Vollinie ────────────────────────────────
    IFCSLAB:              mk('#000000', 0.35, 'solid',  'concrete'),
    IFCSLABTYPE:          mk('#000000', 0.35, 'solid',  'concrete'),
    IFCROOF:              mk('#000000', 0.35, 'solid'),
    IFCSTAIR:             mk('#000000', 0.35, 'solid'),
    IFCSTAIRFLIGHT:       mk('#000000', 0.35, 'solid'),

    // ── Sichtbare Kanten kleiner Bauteile / Sekundärbauteile — 0.25 mm ────
    IFCDOOR:              mk('#000000', 0.25, 'solid'),
    IFCDOORTYPE:          mk('#000000', 0.25, 'solid'),
    IFCWINDOW:            mk('#000000', 0.25, 'solid'),
    IFCWINDOWTYPE:        mk('#000000', 0.25, 'solid'),
    IFCRAILING:           mk('#000000', 0.25, 'solid'),
    IFCMEMBER:            mk('#000000', 0.25, 'solid'),
    IFCPLATE:             mk('#000000', 0.25, 'solid'),
    IFCBUILDINGELEMENTPROXY: mk('#000000', 0.25, 'solid'),

    // ── Mobiliar, Zubehör — 0.18 mm ───────────────────────────────────────
    IFCFURNITURE:         mk('#646464', 0.18, 'solid'),
    IFCFURNITURETYPE:     mk('#646464', 0.18, 'solid'),

    // ── Räume zur Beschriftung — 0.13 mm dotted ───────────────────────────
    IFCSPACE:             mk('#969696', 0.13, 'dotted'),

    default:              mk('#646464', 0.25, 'solid'),
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
