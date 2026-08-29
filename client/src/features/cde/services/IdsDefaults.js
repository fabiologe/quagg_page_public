/**
 * IDS-Default-Specs (LP-5 Starter-Set)
 *
 * Minimal-Datenmodell statt voller IDS-XML-Implementierung — wir folgen dem
 * buildingSMART-IDS-Konzept, aber als JSON-Struktur, die durch unsere
 * Pset-Read-Pipeline direkt validierbar ist. Spätere Sprint kann einen
 * IDS-XML-Importer dazu setzen (OBC.IDSSpecifications) — das Datenmodell
 * hier ist die kanonische Inner-Form.
 *
 * Spec-Shape:
 *   {
 *     id:        'spec-uuid',
 *     name:      'Außenwände — Brandschutz',
 *     description: 'Kurze Erklärung warum…',
 *     enabled:   true,
 *     severity:  'error' | 'warning' | 'info',
 *
 *     // Applicability (auf welche Elemente bezieht sich die Spec?)
 *     applicability: {
 *       category:        'IFCWALL',         // required
 *       psetCondition?:  { psetName, propertyName, value },  // optional Pre-Filter
 *     },
 *
 *     // Requirements (was muss am Element vorhanden / wahr sein?)
 *     requirements: [
 *       { kind: 'attribute', name: 'Name',  message: 'Name muss gepflegt sein' },
 *       { kind: 'pset',      psetName: 'Pset_WallCommon', propertyName: 'FireRating',
 *         message: 'Brandschutz-Klasse fehlt' },
 *       { kind: 'pset-equals', psetName: 'Pset_WallCommon', propertyName: 'IsExternal',
 *         value: 'true', message: 'IsExternal muss true sein für KG-330' },
 *     ],
 *   }
 *
 * Severity-Levels:
 *   error   = Phase-Gate-Blocker
 *   warning = Hinweis, blockiert nicht
 *   info    = reine Information / Statistik
 */

export const IDS_DEFAULT_SPECS = Object.freeze([
    // ── Räume / IFCSPACE ──────────────────────────────────────────────────
    {
        id: 'spec-space-name', name: 'Räume — Name vorhanden', enabled: true, severity: 'error',
        description: 'Jeder Raum braucht einen Namen für Flächenbilanz und Bauantrag.',
        applicability: { category: 'IFCSPACE' },
        requirements: [
            { kind: 'attribute', name: 'Name', message: 'Raum-Name fehlt' },
        ],
    },
    {
        id: 'spec-space-area', name: 'Räume — Fläche dokumentiert', enabled: true, severity: 'warning',
        description: 'GrossFloorArea oder NetFloorArea hilft bei automatischer Flächenbilanz.',
        applicability: { category: 'IFCSPACE' },
        requirements: [
            { kind: 'pset', psetName: 'Qto_SpaceBaseQuantities', propertyName: 'NetFloorArea',
              message: 'Qto_SpaceBaseQuantities.NetFloorArea fehlt (Fallback auf BBox)' },
        ],
    },

    // ── Wände / IFCWALL ───────────────────────────────────────────────────
    {
        id: 'spec-wall-external-flag', name: 'Wände — IsExternal markiert', enabled: true, severity: 'error',
        description: 'Für KG-Klassifikation (330 außen vs. 340 innen).',
        applicability: { category: 'IFCWALL' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_WallCommon', propertyName: 'IsExternal',
              message: 'IsExternal fehlt' },
        ],
    },
    {
        id: 'spec-wall-loadbearing', name: 'Wände — Tragend/nichttragend markiert', enabled: true, severity: 'warning',
        description: 'Für Statik-Koordination und KG-Untergruppen.',
        applicability: { category: 'IFCWALL' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_WallCommon', propertyName: 'LoadBearing',
              message: 'LoadBearing fehlt' },
        ],
    },
    {
        id: 'spec-wall-fire-rating', name: 'Außenwände — Brandschutz-Klasse', enabled: true, severity: 'warning',
        description: 'FireRating wird im Brandschutz-Konzept erwartet.',
        applicability: {
            category: 'IFCWALL',
            psetCondition: { psetName: 'Pset_WallCommon', propertyName: 'IsExternal', value: 'true' },
        },
        requirements: [
            { kind: 'pset', psetName: 'Pset_WallCommon', propertyName: 'FireRating',
              message: 'FireRating fehlt' },
        ],
    },

    // ── Türen + Fenster ───────────────────────────────────────────────────
    {
        id: 'spec-door-external-flag', name: 'Türen — IsExternal markiert', enabled: true, severity: 'error',
        description: 'Für KG 334 (außen) vs. 344 (innen).',
        applicability: { category: 'IFCDOOR' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_DoorCommon', propertyName: 'IsExternal',
              message: 'IsExternal fehlt' },
        ],
    },
    {
        id: 'spec-door-fire-rating', name: 'Außentüren — Brandschutz-Klasse', enabled: true, severity: 'warning',
        description: 'FireRating ist bei Außen-/Brandschutztüren erforderlich.',
        applicability: {
            category: 'IFCDOOR',
            psetCondition: { psetName: 'Pset_DoorCommon', propertyName: 'IsExternal', value: 'true' },
        },
        requirements: [
            { kind: 'pset', psetName: 'Pset_DoorCommon', propertyName: 'FireRating',
              message: 'FireRating fehlt' },
        ],
    },
    {
        id: 'spec-window-external-flag', name: 'Fenster — IsExternal markiert', enabled: true, severity: 'warning',
        description: 'Für KG 334 (außen) vs. 344 (innen).',
        applicability: { category: 'IFCWINDOW' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_WindowCommon', propertyName: 'IsExternal',
              message: 'IsExternal fehlt' },
        ],
    },

    // ── Decken / Stützen / Träger ─────────────────────────────────────────
    {
        id: 'spec-slab-loadbearing', name: 'Decken — Tragend markiert', enabled: true, severity: 'warning',
        description: 'Standard-Property für Statik-Koordination.',
        applicability: { category: 'IFCSLAB' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_SlabCommon', propertyName: 'LoadBearing',
              message: 'LoadBearing fehlt' },
        ],
    },
    {
        id: 'spec-column-loadbearing', name: 'Stützen — Tragend markiert', enabled: true, severity: 'error',
        description: 'Stützen sind in der Regel tragend; Property muss vorhanden sein.',
        applicability: { category: 'IFCCOLUMN' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_ColumnCommon', propertyName: 'LoadBearing',
              message: 'LoadBearing fehlt' },
        ],
    },

    // ── MEP / Tiefbau ─────────────────────────────────────────────────────
    {
        id: 'spec-chamber-name', name: 'Schächte — Bezeichnung', enabled: true, severity: 'error',
        description: 'DISTRIBUTIONCHAMBERELEMENT braucht eine Schacht-Nr / Name.',
        applicability: { category: 'IFCDISTRIBUTIONCHAMBERELEMENT' },
        requirements: [
            { kind: 'attribute', name: 'Name', message: 'Schacht-Bezeichnung fehlt' },
        ],
    },
    {
        id: 'spec-pipe-system', name: 'Rohrleitungen — System-Klassifikation', enabled: true, severity: 'warning',
        description: 'PipeSegment sollte einem System (Schmutzwasser / Trinkwasser / …) zugeordnet sein.',
        applicability: { category: 'IFCPIPESEGMENT' },
        requirements: [
            { kind: 'pset', psetName: 'Pset_PipeSegmentTypeCommon', propertyName: 'NominalDiameter',
              message: 'NominalDiameter fehlt — wichtig für Mengenermittlung' },
        ],
    },
]);
