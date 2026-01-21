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

// SystemType (Entwässerungsart)
export const SystemType = {
    RW: 'Regenwasser',
    SW: 'Schmutzwasser',
    MW: 'Mischwasser',
    Sonstige: 'Sonstige'
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
 * @property {string} [systemType] - SystemType Enum
 * @property {number} [year] - Baujahr
 * @property {number} [sohleZulauf] - Hydraulic Invert Start (Z)
 * @property {number} [sohleAblauf] - Hydraulic Invert End (Z)
 * @property {Array<{x:number, y:number, z?:number}>} [intermediatePoints] - Polyline path
 * @property {string[]} warnings
 */

/**
 * @typedef {Object} IsyRawNode
 * @property {string} id
 * @property {number} kType - 0=Schacht, 1=Anschluss, 2=Bauwerk
 * @property {Object} geometry - Normalized Geometric Properties
 * @property {'Cylinder'|'Box'} geometry.shape
 * @property {number} geometry.width
 * @property {number} geometry.length
 * @property {number} geometry.depth
 * @property {number|null} geometry.coverZ
 * @property {Object} attributes - Core Attributes
 * @property {string} [attributes.material]
 * @property {string} [attributes.subType]
 * @property {Array<{attr:string, x:number, y:number, z:number}>} points - Raw Points
 * @property {Object} raw - Full Metadata Dump
 */

/**
 * @typedef {Object} IsyRawEdge
 * @property {string} id
 * @property {string} source
 * @property {string} target
 * @property {Object} profile - Normalized Profile
 * @property {number} profile.typeCode
 * @property {number} profile.width
 * @property {number} profile.height
 * @property {string} [material]
 * @property {Object} raw - Full Metadata Dump
 */
