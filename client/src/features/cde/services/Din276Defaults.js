/**
 * DIN 276-1:2018 — Kostengruppen-Baum + Standard-Mappings IFC → KG.
 *
 * Wir bilden KG-300 (Baukonstruktion), KG-400 (technische Anlagen) und seit
 * Sprint T1 KG-500 (Außenanlagen/Freiflächen — Tiefbau: Erdbau, Oberbau,
 * Entwässerung, Vegetation) ab; IFC 4.3 liefert die passenden Klassen
 * (IfcEarthworks*, IfcCourse, IfcKerb, IfcPavement, IfcGeographicElement).
 * KG-200 Herrichten, KG-600 Ausstattung und KG-700 Baunebenkosten erfordern
 * weiterhin Eingaben außerhalb des Modells.
 *
 * Tiefe: zweistellig (z.B. 320, 330) reicht für die Kostenschätzung in LP 2-3.
 * Dreistellige Untergruppen (322, 333, …) sind optional für LP 5-6, werden hier
 * vorgehalten aber initial nicht eingefärbt.
 */

export const KG_TREE = Object.freeze([
    {
        code: '300', label: 'Bauwerk — Baukonstruktion',
        children: [
            { code: '320', label: 'Gründung, Unterbau', children: [
                { code: '322', label: 'Flachgründungen' },
                { code: '323', label: 'Tiefgründungen' },
                { code: '324', label: 'Unterböden und Bodenplatten' },
            ]},
            { code: '330', label: 'Außenwände, vertikale Baukonstruktionen — außen', children: [
                { code: '331', label: 'Tragende Außenwände' },
                { code: '332', label: 'Nichttragende Außenwände' },
                { code: '333', label: 'Außenstützen' },
                { code: '334', label: 'Außentüren und -fenster' },
                { code: '337', label: 'Elementierte Außenwände (Curtain Wall)' },
            ]},
            { code: '340', label: 'Innenwände, vertikale Baukonstruktionen — innen', children: [
                { code: '341', label: 'Tragende Innenwände' },
                { code: '342', label: 'Nichttragende Innenwände' },
                { code: '343', label: 'Innenstützen' },
                { code: '344', label: 'Innentüren und -fenster' },
            ]},
            { code: '350', label: 'Decken, horizontale Baukonstruktionen' },
            { code: '360', label: 'Dächer' },
            { code: '370', label: 'Baukonstruktive Einbauten' },
        ],
    },
    {
        code: '400', label: 'Bauwerk — Technische Anlagen',
        children: [
            { code: '410', label: 'Abwasser-, Wasser-, Gasanlagen', children: [
                { code: '411', label: 'Abwasseranlagen' },
                { code: '412', label: 'Wasseranlagen' },
                { code: '413', label: 'Gasanlagen' },
            ]},
            { code: '420', label: 'Wärmeversorgungsanlagen' },
            { code: '430', label: 'Raumlufttechnische Anlagen' },
            { code: '440', label: 'Elektrische Anlagen' },
            { code: '450', label: 'Kommunikation, Sicherheit, Information' },
            { code: '460', label: 'Förderanlagen' },
        ],
    },
    {
        code: '500', label: 'Außenanlagen und Freiflächen',
        children: [
            { code: '510', label: 'Erdbau', children: [
                { code: '511', label: 'Geländebearbeitung (Abtrag/Auftrag)' },
                { code: '512', label: 'Bodenverbesserung' },
            ]},
            { code: '520', label: 'Gründung, Unterbau (Außenanlagen)' },
            { code: '530', label: 'Oberbau, Deckschichten', children: [
                { code: '531', label: 'Wege' },
                { code: '532', label: 'Straßen' },
                { code: '533', label: 'Plätze, Höfe' },
            ]},
            { code: '540', label: 'Baukonstruktionen in Außenanlagen' },
            { code: '550', label: 'Technische Anlagen in Außenanlagen', children: [
                { code: '551', label: 'Abwasseranlagen (außen)' },
                { code: '552', label: 'Wasseranlagen (außen)' },
            ]},
            { code: '560', label: 'Ausstattung in Außenanlagen' },
            { code: '570', label: 'Vegetationsflächen' },
            { code: '590', label: 'Sonstige Außenanlagen' },
        ],
    },
]);

/**
 * Flat lookup `code → {code, label, parentCode}` for quick title lookups.
 */
export const KG_LOOKUP = (() => {
    const out = new Map();
    const walk = (nodes, parent = null) => {
        for (const n of nodes) {
            out.set(n.code, { code: n.code, label: n.label, parentCode: parent });
            if (n.children) walk(n.children, n.code);
        }
    };
    walk(KG_TREE);
    return out;
})();

/**
 * Default colour palette for KG-codes — used by the 3D-View "KG-Modus" so the
 * user can visually scan which elements belong to which group. Codes not in
 * here fall back to grey.
 */
export const KG_DEFAULT_COLORS = Object.freeze({
    '320': '#795548', // Gründung — braun
    '330': '#1976d2', // Außenwände — blau
    '340': '#26a69a', // Innenwände — türkis
    '350': '#7e57c2', // Decken — violett
    '360': '#5d4037', // Dächer — dunkelbraun
    '370': '#9e9e9e', // Einbauten — grau
    '410': '#e64a19', // Wasser/Abwasser — orange
    '411': '#bf360c', // Abwasser
    '412': '#0288d1', // Wasser
    '420': '#d32f2f', // Wärme — rot
    '430': '#00897b', // Lüftung — dunkelgrün
    '440': '#fbc02d', // Elektro — gelb
    '450': '#7b1fa2', // Kommunikation — lila
    '460': '#455a64', // Förder — anthrazit
    // KG 500 — Außenanlagen (Sprint T1)
    '510': '#8d6e63', // Erdbau — erdbraun
    '530': '#616161', // Oberbau/Deckschichten — asphaltgrau
    '531': '#757575', // Wege
    '550': '#e64a19', // TA außen — orange
    '551': '#bf360c', // Abwasser außen
    '570': '#558b2f', // Vegetation — grün
});

/**
 * Default rule set: IFC-Kategorie + optionaler Pset-Filter → KG-Code.
 *
 * Diese Regeln kommen als Vorbelegung, der User kann sie im KG-Editor
 * ergänzen, deaktivieren oder mit höherer Priorität übersteuern.
 *
 * Konvention:
 *   - priority 10 = generisches Mapping (Default).
 *   - priority 20 = differenziertes Mapping mit Pset (z.B. IFCWALL + IsExternal=true → 330).
 *   - User-Overrides typischerweise priority 30+.
 */
export const KG_DEFAULT_RULES = Object.freeze([
    // ── Gründung (322 Flachgründungen, 323 Tiefgründungen) ────────────────
    { id: 'kg-default-footing',    enabled: true, priority: 10,
      name: 'Fundamente → KG 322',
      condition: { category: 'IFCFOOTING' }, kgCode: '322' },
    { id: 'kg-default-pile',       enabled: true, priority: 10,
      name: 'Pfähle → KG 323',
      condition: { category: 'IFCPILE' }, kgCode: '323' },

    // ── Außen-/Innenwände (Pset-aufgeteilt) ────────────────────────────────
    { id: 'kg-wall-external',      enabled: true, priority: 20,
      name: 'Außenwände → KG 330',
      condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
      kgCode: '330' },
    { id: 'kg-wall-internal',      enabled: true, priority: 20,
      name: 'Innenwände → KG 340',
      condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'false' },
      kgCode: '340' },
    { id: 'kg-wall-fallback',      enabled: true, priority: 10,
      name: 'Wände ohne Pset → KG 340 (Annahme: innen)',
      condition: { category: 'IFCWALL' }, kgCode: '340' },
    { id: 'kg-wall-std',           enabled: true, priority: 10,
      name: 'IFCWALLSTANDARDCASE → KG 340',
      condition: { category: 'IFCWALLSTANDARDCASE' }, kgCode: '340' },

    // ── Stützen (Pset-aufgeteilt) ──────────────────────────────────────────
    { id: 'kg-column-external',    enabled: true, priority: 20,
      name: 'Außenstützen → KG 333',
      condition: { category: 'IFCCOLUMN', psetName: 'Pset_ColumnCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
      kgCode: '333' },
    { id: 'kg-column-internal',    enabled: true, priority: 10,
      name: 'Stützen (default innen) → KG 343',
      condition: { category: 'IFCCOLUMN' }, kgCode: '343' },

    // ── Türen / Fenster (außen/innen) ──────────────────────────────────────
    { id: 'kg-door-external',      enabled: true, priority: 20,
      name: 'Außentüren → KG 334',
      condition: { category: 'IFCDOOR', psetName: 'Pset_DoorCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
      kgCode: '334' },
    { id: 'kg-window-external',    enabled: true, priority: 20,
      name: 'Außenfenster → KG 334',
      condition: { category: 'IFCWINDOW', psetName: 'Pset_WindowCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' },
      kgCode: '334' },
    { id: 'kg-door-fallback',      enabled: true, priority: 10,
      name: 'Türen (default außen) → KG 334',
      condition: { category: 'IFCDOOR' }, kgCode: '334' },
    { id: 'kg-window-fallback',    enabled: true, priority: 10,
      name: 'Fenster (default außen) → KG 334',
      condition: { category: 'IFCWINDOW' }, kgCode: '334' },
    { id: 'kg-curtainwall',        enabled: true, priority: 10,
      name: 'Curtain Wall → KG 337',
      condition: { category: 'IFCCURTAINWALL' }, kgCode: '337' },

    // ── Decken / Dächer / Einbauten ────────────────────────────────────────
    { id: 'kg-slab',               enabled: true, priority: 10,
      name: 'Decken → KG 350',
      condition: { category: 'IFCSLAB' }, kgCode: '350' },
    { id: 'kg-roof',               enabled: true, priority: 10,
      name: 'Dächer → KG 360',
      condition: { category: 'IFCROOF' }, kgCode: '360' },
    { id: 'kg-stair',              enabled: true, priority: 10,
      name: 'Treppen → KG 351 (Deckenkonstr.)',
      condition: { category: 'IFCSTAIR' }, kgCode: '350' },
    { id: 'kg-proxy',              enabled: true, priority: 5,
      name: 'BuildingElementProxy → KG 370 (Einbauten)',
      condition: { category: 'IFCBUILDINGELEMENTPROXY' }, kgCode: '370' },

    // ── KG 400 — TGA / Tiefbau ─────────────────────────────────────────────
    { id: 'kg-pipe-flow',          enabled: true, priority: 10,
      name: 'FlowSegment → KG 411 (Abwasser)',
      condition: { category: 'IFCFLOWSEGMENT' }, kgCode: '411' },
    { id: 'kg-pipe-segment',       enabled: true, priority: 10,
      name: 'PipeSegment → KG 411 (Abwasser)',
      condition: { category: 'IFCPIPESEGMENT' }, kgCode: '411' },
    { id: 'kg-pipe-fitting',       enabled: true, priority: 10,
      name: 'PipeFitting → KG 411',
      condition: { category: 'IFCPIPEFITTING' }, kgCode: '411' },
    { id: 'kg-flow-fitting',       enabled: true, priority: 10,
      name: 'FlowFitting → KG 411',
      condition: { category: 'IFCFLOWFITTING' }, kgCode: '411' },
    { id: 'kg-flow-terminal',      enabled: true, priority: 10,
      name: 'FlowTerminal → KG 411',
      condition: { category: 'IFCFLOWTERMINAL' }, kgCode: '411' },
    { id: 'kg-chamber',            enabled: true, priority: 10,
      name: 'DistributionChamber (Schächte) → KG 411',
      condition: { category: 'IFCDISTRIBUTIONCHAMBERELEMENT' }, kgCode: '411' },
    { id: 'kg-duct',               enabled: true, priority: 10,
      name: 'Duct → KG 430 (RLT)',
      condition: { category: 'IFCDUCT' }, kgCode: '430' },
    { id: 'kg-duct-fitting',       enabled: true, priority: 10,
      name: 'DuctFitting → KG 430',
      condition: { category: 'IFCDUCTFITTING' }, kgCode: '430' },
    { id: 'kg-air-terminal',       enabled: true, priority: 10,
      name: 'AirTerminal → KG 430',
      condition: { category: 'IFCAIRTERMINAL' }, kgCode: '430' },
    { id: 'kg-valve',              enabled: true, priority: 10,
      name: 'Armaturen (Valve) → KG 412 (Wasser)',
      condition: { category: 'IFCVALVE' }, kgCode: '412' },
    { id: 'kg-pump',               enabled: true, priority: 10,
      name: 'Pumpe → KG 411',
      condition: { category: 'IFCPUMP' }, kgCode: '411' },

    // ── KG 500 — Außenanlagen / Tiefbau (Sprint T1, IFC-4.3-Klassen) ───────
    { id: 'kg-earthworks-cut',     enabled: true, priority: 10,
      name: 'Aushub → KG 510 (Erdbau)',
      condition: { category: 'IFCEARTHWORKSCUT' }, kgCode: '510' },
    { id: 'kg-earthworks-fill',    enabled: true, priority: 10,
      name: 'Verfüllung/Damm → KG 510 (Erdbau)',
      condition: { category: 'IFCEARTHWORKSFILL' }, kgCode: '510' },
    { id: 'kg-earthworks-element', enabled: true, priority: 10,
      name: 'Erdbauwerk → KG 510',
      condition: { category: 'IFCEARTHWORKSELEMENT' }, kgCode: '510' },
    { id: 'kg-course',             enabled: true, priority: 10,
      name: 'Oberbau-Schicht (Course) → KG 530',
      condition: { category: 'IFCCOURSE' }, kgCode: '530' },
    { id: 'kg-pavement',           enabled: true, priority: 10,
      name: 'Belag/Fahrbahn → KG 531',
      condition: { category: 'IFCPAVEMENT' }, kgCode: '531' },
    { id: 'kg-kerb',               enabled: true, priority: 10,
      name: 'Bordstein → KG 530',
      condition: { category: 'IFCKERB' }, kgCode: '530' },
    { id: 'kg-geographic',         enabled: true, priority: 5,
      name: 'Gelände → KG 570 (Vegetation/Freifläche)',
      condition: { category: 'IFCGEOGRAPHICELEMENT' }, kgCode: '570' },

    // Tiefbau-Projekt-Alternative: Leitungen/Schächte als AUSSENANLAGE (551)
    // statt Gebäudetechnik (411). Bewusst deaktiviert — der Nutzer entscheidet
    // je Projekt (priority 30 schlägt dann die 411-Defaults).
    { id: 'kg-pipe-aussen',        enabled: false, priority: 30,
      name: 'Tiefbau: PipeSegment → KG 551 (Außenanlagen)',
      condition: { category: 'IFCPIPESEGMENT' }, kgCode: '551' },
    { id: 'kg-chamber-aussen',     enabled: false, priority: 30,
      name: 'Tiefbau: Schächte → KG 551 (Außenanlagen)',
      condition: { category: 'IFCDISTRIBUTIONCHAMBERELEMENT' }, kgCode: '551' },
]);

/**
 * Return the colour for a KG-code, walking up to the parent if no direct match.
 */
export function kgColor(code) {
    if (!code) return '#888';
    let c = String(code);
    while (c && !KG_DEFAULT_COLORS[c]) {
        const parent = KG_LOOKUP.get(c)?.parentCode;
        if (!parent || parent === c) break;
        c = parent;
    }
    return KG_DEFAULT_COLORS[c] ?? '#888';
}

/**
 * Return a human-readable "330 — Außenwände" line for any code, or the code
 * itself if it's unknown.
 */
export function kgTitle(code) {
    const node = KG_LOOKUP.get(String(code));
    return node ? `${node.code} — ${node.label}` : String(code);
}
