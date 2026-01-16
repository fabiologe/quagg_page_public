/**
 * ISYBAU / IFC Converter Types & Logic Contract
 * Version: 2.0 (Strict & Detailed)
 * * Enthält Typ-Definitionen für:
 * 1. Raw XML Input (Was wir vom Parser bekommen - "Dirty")
 * 2. Normalized Graph (Was wir an den 3D Viewer geben - "Clean")
 * 3. Enums & Mappings (Übersetzungstabellen)
 */

// ==========================================
// 1. ENUMS & KONSTANTEN (Vocabulary)
// ==========================================

// G300 Knotentyp
export const KnotenTyp = {
    Schacht: 0,
    Anschlusspunkt: 1,
    Bauwerk: 2
};

// G205 Profilart (Vereinfacht für 3D-Generierung)
export const ProfilGeometrie = {
    Kreis: 'Circle',
    Rechteck: 'Rect',
    Trapez: 'Trapezoid',
    Ei: 'Egg',
    Unbekannt: 'Circle' // Fallback
};

// V106 Punktattribut (Wichtig für Z-Koordinate!)
export const PunktAttribut = {
    DMP: 'DMP', // Deckelmittelpunkt -> Priorität 1 für Oben
    SMP: 'SMP', // Schachtmittelpunkt/Sohle -> Priorität 1 für Unten
    SBW: 'SBW', // Bauwerksrand -> Für BoundingBox
    RR: 'RR',  // Regenrohr -> Für Anschlusspunkte
    GA: 'GA',  // Gebäudeanschluss
    AP: 'AP'   // Allgemeiner Anschlusspunkt
};

// Visual Helper
export const ConnectorType = {
    Regenrohr: 'RR',
    Strassenablauf: 'SE',
    Hausanschluss: 'GA',
    Unbekannt: 'AP'
};

// ==========================================
// JSDoc Definitions for Logic reference
// ==========================================

/**
 * @typedef {Object} INode
 * @property {string} id
 * @property {'Manhole'|'Connector'|'Structure'} type
 * @property {Object} pos - Three.js Coordinates (Y is UP)
 * @property {number} pos.x
 * @property {number} pos.y
 * @property {number} pos.z
 * @property {Object} geometry
 * @property {number} geometry.coverZ
 * @property {number} geometry.bottomZ
 * @property {number} geometry.height
 * @property {'Cylinder'|'Box'} geometry.shape
 * @property {Object} geometry.dimensions
 * @property {number} geometry.dimensions.width
 * @property {number} geometry.dimensions.length
 * @property {Object} attributes
 * @property {number} [attributes.functionCode]
 * @property {string} [attributes.material]
 * @property {string} [attributes.subType]
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} IEdge
 * @property {string} id
 * @property {string} sourceId
 * @property {string} targetId
 * @property {Object} profile
 * @property {string} profile.type - ProfilGeometrie Enum
 * @property {number} profile.width - Meters
 * @property {number} profile.height - Meters
 * @property {number} [profile.diameter]
 * @property {string} [material]
 * @property {string[]} warnings
 */
