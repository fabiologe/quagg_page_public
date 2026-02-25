
import { v4 as uuidv4 } from 'uuid';

// Helper: Echte IFC GUID Kompression (Valid characters)
const b64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function toIfcGuid(uuid) {
    let res = "";
    for (let i = 0; i < 22; i++) res += b64.charAt(Math.floor(Math.random() * 64));
    return `'${res}'`;
}

// Date formatter
function getIsoDate() {
    return new Date().toISOString().split('.')[0];
}

// --- MVD Options ---
export const MVD_OPTIONS = {
    CoordinationView: 'CoordinationView',
    ReferenceView: 'ReferenceView',
    DesignTransferView: 'DesignTransferView'
};

export const GEOMETRY_OPTIONS = {
    SweptSolid: 'SweptSolid',
    Tessellation: 'Tessellation'
};

// --- Tessellation Helpers ---

function generateCylinderMesh(radius, height, segments = 16) {
    const vertices = [];
    const indices = [];

    vertices.push([0, 0, 0]);
    vertices.push([0, 0, height]);

    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        vertices.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
    }
    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        vertices.push([radius * Math.cos(angle), radius * Math.sin(angle), height]);
    }

    const botStart = 2;
    const topStart = 2 + segments;

    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push([1 + 0, botStart + next + 1, botStart + i + 1]);
    }
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push([1 + 1, topStart + i + 1, topStart + next + 1]);
    }
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const b0 = botStart + i + 1;
        const b1 = botStart + next + 1;
        const t0 = topStart + i + 1;
        const t1 = topStart + next + 1;
        indices.push([b0, b1, t1]);
        indices.push([b0, t1, t0]);
    }

    return { vertices, indices };
}

// --- Material Code -> Name Mapping ---
const MATERIAL_NAMES = {
    'AZ': 'Asbestzement', 'B': 'Beton', 'BS': 'Betonsegmente', 'CNS': 'Edelstahl',
    'EIS': 'Eisen/Stahl', 'FZ': 'Faserzement', 'GFK': 'GFK', 'GG': 'Grauguss',
    'GGG': 'Duktiles Gusseisen', 'GJS': 'Gusseisen m. Kugelgraphit',
    'KST': 'Kunststoff', 'MA': 'Mauerwerk', 'OB': 'Ortbeton',
    'PE': 'Polyethylen', 'PP': 'Polypropylen', 'PVC': 'Polyvinylchlorid',
    'SB': 'Stahlbeton', 'ST': 'Stahl', 'STZ': 'Steinzeug', 'ZG': 'Ziegelwerk',
    'MIX': 'Verschiedene Werkstoffe'
};

function resolveMaterialName(code) {
    if (!code) return 'Beton';
    return MATERIAL_NAMES[String(code).toUpperCase()] || String(code);
}


export class IsybauToIfc {
    constructor(nodes, edges, origin, options = {}) {
        this.nodes = nodes;
        this.edges = edges;
        this.origin = origin || { x: 0, y: 0, z: 0 };
        this.lines = [];
        this.idCounter = 1;
        // Options
        this.mvd = options.mvd || MVD_OPTIONS.ReferenceView;
        this.geometryType = options.geometryType || GEOMETRY_OPTIONS.SweptSolid;
        this.ifcMetadata = options.ifcMetadata || {};
        this.coordMode = options.coordMode || 'relative'; // 'relative' | 'absolute' | 'georef'
        this.worldOrigin = options.worldOrigin || this.origin;
        // Material cache: name -> IfcMaterial ref
        this._materialCache = {};
    }

    // --- LINE WRITERS ---

    nextId() { return this.idCounter++; }

    addLine(type, params) {
        const id = this.nextId();
        const pStr = params.map(p => {
            if (p === null || p === undefined) return '$';
            if (typeof p === 'string') {
                if (p.startsWith('.') && p.endsWith('.')) return p;
                return p.startsWith('\'') ? p : `'${p}'`;
            }
            if (typeof p === 'number') return p.toFixed(4);
            if (Array.isArray(p)) {
                const items = p.map(i => (i && i.ref) ? `#${i.ref}` : (typeof i === 'string' ? `'${i}'` : i));
                return `(${items.join(',')})`;
            }
            if (p.ref) return `#${p.ref}`;
            return p;
        }).join(',');

        this.lines.push(`#${id}= ${type.toUpperCase()}(${pStr});`);
        return { ref: id };
    }

    // --- GEOMETRY HELPERS ---

    point3D(x, y, z) { return this.addLine('IfcCartesianPoint', [[x, y, z]]); }
    dir3D(x, y, z) { return this.addLine('IfcDirection', [[x, y, z]]); }
    axisPlacement(originPt, zAxis = null, refAxis = null) {
        return this.addLine('IfcAxis2Placement3D', [originPt, zAxis, refAxis]);
    }
    localPlacement(relTo, axisPlac) {
        return this.addLine('IfcLocalPlacement', [relTo, axisPlac]);
    }

    // --- TESSELLATION ---

    createTessellatedCylinder(repContext, radius, height, segments = 16) {
        const { vertices, indices } = generateCylinderMesh(radius, height, segments);

        const coordStrings = vertices.map(v => `(${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)})`);
        const pointListId = this.nextId();
        this.lines.push(`#${pointListId}= IFCCARTESIANPOINTLIST3D((${coordStrings.join(',')}));`);
        const pointList = { ref: pointListId };

        const indexStrings = indices.map(tri => `(${tri[0]},${tri[1]},${tri[2]})`);
        const faceSetId = this.nextId();
        this.lines.push(`#${faceSetId}= IFCTRIANGULATEDFACESET(#${pointList.ref},$,.T.,(${indexStrings.join(',')}));`);
        const faceSet = { ref: faceSetId };

        return this.addLine('IfcShapeRepresentation', [
            repContext, "'Body'", "'Tessellation'", [faceSet]
        ]);
    }

    createTessellatedPipe(repContext, radius, length, segments = 16) {
        return this.createTessellatedCylinder(repContext, radius, length, segments);
    }

    // --- SWEPT SOLID ---

    createSweptSolidCylinder(repContext, radius, height) {
        const profile = this.addLine('IfcCircleProfileDef', ['.AREA.', null, null, radius]);
        const position = this.axisPlacement(this.point3D(0, 0, 0));
        const solid = this.addLine('IfcExtrudedAreaSolid', [
            profile, position, this.dir3D(0, 0, 1), height
        ]);
        return this.addLine('IfcShapeRepresentation', [
            repContext, "'Body'", "'SweptSolid'", [solid]
        ]);
    }

    // --- PROPERTY SET HELPERS ---

    /**
     * Create a single IfcPropertySingleValue
     * @param {string} name - Property name
     * @param {*} value - Value (string, number, boolean)
     * @param {string} ifcType - e.g. 'IfcLabel', 'IfcLengthMeasure', 'IfcBoolean', 'IfcIdentifier'
     */
    createPropertyValue(name, value, ifcType = 'IfcLabel') {
        if (value === null || value === undefined || value === '') return null;

        let valStr;
        if (ifcType === 'IfcBoolean') {
            valStr = `IFCBOOLEAN(${value ? '.T.' : '.F.'})`;
        } else if (ifcType === 'IfcLengthMeasure' || ifcType === 'IfcPositiveLengthMeasure') {
            valStr = `${ifcType.toUpperCase()}(${Number(value).toFixed(4)})`;
        } else if (ifcType === 'IfcReal' || ifcType === 'IfcInteger') {
            valStr = `${ifcType.toUpperCase()}(${value})`;
        } else {
            // String types: IfcLabel, IfcIdentifier, IfcText
            valStr = `${ifcType.toUpperCase()}('${String(value).replace(/'/g, "''")}')`;
        }

        const propId = this.nextId();
        this.lines.push(`#${propId}= IFCPROPERTYSINGLEVALUE('${name}',$,${valStr},$);`);
        return { ref: propId };
    }

    /**
     * Create an IfcPropertySet and attach it to an element via IfcRelDefinesByProperties
     */
    createPropertySet(ownerHistory, element, psetName, properties) {
        // Filter out nulls
        const validProps = properties.filter(p => p !== null);
        if (validProps.length === 0) return null;

        const pset = this.addLine('IfcPropertySet', [
            toIfcGuid(), ownerHistory, `'${psetName}'`, null, validProps
        ]);

        this.addLine('IfcRelDefinesByProperties', [
            toIfcGuid(), ownerHistory, null, null, [element], pset
        ]);

        return pset;
    }

    /**
     * Create IfcMaterial and attach via IfcRelAssociatesMaterial (cached)
     */
    createMaterial(ownerHistory, element, materialCode) {
        const name = resolveMaterialName(materialCode);

        // Cache materials to avoid duplicates
        if (!this._materialCache[name]) {
            const matId = this.nextId();
            this.lines.push(`#${matId}= IFCMATERIAL('${name}',$,$);`);
            this._materialCache[name] = { ref: matId };
        }

        const mat = this._materialCache[name];

        // Create association
        this.addLine('IfcRelAssociatesMaterial', [
            toIfcGuid(), ownerHistory, null, null, [element], mat
        ]);

        return mat;
    }

    // --- MAIN GENERATOR ---

    generate() {
        this.lines = [];
        this.idCounter = 1;
        this._materialCache = {};

        const useTessellation = this.geometryType === GEOMETRY_OPTIONS.Tessellation;
        const meta = this.ifcMetadata;

        // 1. Header
        this.lines.push(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [${this.mvd}]'),'2;1');
FILE_NAME('${getIsoDate()}.ifc','${getIsoDate()}',('${meta.ersteller || 'User'}'),('ISYBAU'),'ISYBAU Parser (quagg-engineering.org)','ISYBAU Parser','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`);

        // 2. Project Structure
        const organization = this.addLine('IfcOrganization', [null, `'${meta.ersteller || 'quagg-engineering.org'}'`, null, null, null]);
        const app = this.addLine('IfcApplication', [organization, "'1.0'", "'ISYBAU Import'", "'ISYBAU'"]);
        const person = this.addLine('IfcPerson', [null, "'User'", null, null, null, null, null, null]);
        const personOrg = this.addLine('IfcPersonAndOrganization', [person, organization]);

        const ownerHistory = this.addLine('IfcOwnerHistory', [
            personOrg, app, null, '.ADDED.', Math.floor(Date.now() / 1000), null, null, Math.floor(Date.now() / 1000)
        ]);

        // Units
        const siLength = this.addLine('IfcSIUnit', [null, '.LENGTHUNIT.', null, '.METRE.']);
        const siAngle = this.addLine('IfcSIUnit', [null, '.PLANEANGLEUNIT.', null, '.RADIAN.']);
        const unitAssign = this.addLine('IfcUnitAssignment', [[siLength, siAngle]]);

        // Context
        const worldOrigin = this.point3D(0, 0, 0);
        const zAxis = this.dir3D(0, 0, 1);
        const xAxis = this.dir3D(1, 0, 0);
        const worldPlacement = this.axisPlacement(worldOrigin, zAxis, xAxis);

        const repContext = this.addLine('IfcGeometricRepresentationContext', [
            null, "'Model'", 3, 1.0E-05, worldPlacement, this.dir3D(0, 1, 0)
        ]);

        const project = this.addLine('IfcProject', [
            toIfcGuid(), ownerHistory, "'ISYBAU Project'", null, null, null, null, [repContext], unitAssign
        ]);

        // === PROJECT-LEVEL PSET: ISYBAU_Metadaten (M100-M108) ===
        this.createPropertySet(ownerHistory, project, 'ISYBAU_Metadaten', [
            this.createPropertyValue('Datenstatus', meta.datenstatus, 'IfcIdentifier'),
            this.createPropertyValue('Kollektivart', meta.kollektivart, 'IfcLabel'),
            this.createPropertyValue('Stammdatentyp', meta.stammdatentyp, 'IfcLabel'),
            this.createPropertyValue('Zustaendigkeit', meta.zustaendigkeit, 'IfcLabel'),
            this.createPropertyValue('Regelwerk', meta.regelwerk, 'IfcLabel'),
            this.createPropertyValue('Abwasserbeseitigungspflicht', meta.abwasserbeseitigungspflicht, 'IfcLabel'),
            this.createPropertyValue('Ordnungseinheitentyp', meta.ordnungseinheitentyp, 'IfcLabel'),
            this.createPropertyValue('Praesentationsdatentyp', meta.praesentationsdatentyp, 'IfcLabel'),
            this.createPropertyValue('Ersteller', meta.ersteller, 'IfcLabel'),
        ]);

        // SITE — Coordinate mode logic
        const useAbsolute = this.coordMode === 'absolute';
        const useGeoref = this.coordMode === 'georef';

        // For 'absolute': site at 0,0 (coords are real-world)
        // For 'relative'/'georef': site at origin offset
        const siteX = useAbsolute ? 0 : this.origin.x;
        const siteY = useAbsolute ? 0 : this.origin.y;
        const siteOrigin = this.point3D(siteX, siteY, 0);
        const sitePlace3D = this.axisPlacement(siteOrigin);
        const sitePlacement = this.localPlacement(null, sitePlace3D);

        const site = this.addLine('IfcSite', [
            toIfcGuid(), ownerHistory, "'Site'", null, null, sitePlacement, null, null, '.ELEMENT.',
            [0, 0], 0, null, null
        ]);

        // IfcMapConversion for geo-referenced mode
        if (useGeoref && (this.worldOrigin.x !== 0 || this.worldOrigin.y !== 0)) {
            const targetCRS = this.addLine('IfcProjectedCRS', [
                "'EPSG:25832'", null, null, null, null, null, null
            ]);
            this.addLine('IfcMapConversion', [
                repContext, targetCRS,
                this.worldOrigin.x, this.worldOrigin.y, 0,
                1.0, 0.0, 1.0
            ]);
        }

        // Building
        const buildingPlace3D = this.axisPlacement(this.point3D(0, 0, 0));
        const buildingPlacement = this.localPlacement(sitePlacement, buildingPlace3D);
        const building = this.addLine('IfcBuilding', [
            toIfcGuid(), ownerHistory, "'Building'", null, null, buildingPlacement, null, null, '.ELEMENT.', 0, 0, null
        ]);

        // Hierarchy
        this.addLine('IfcRelAggregates', [toIfcGuid(), ownerHistory, null, null, project, [site]]);
        this.addLine('IfcRelAggregates', [toIfcGuid(), ownerHistory, null, null, site, [building]]);

        // --- ENTITIES ---
        const elements = [];

        // ===================== NODES =====================
        for (const node of this.nodes.values()) {
            if (!node.pos) continue;

            let localX, localY, localZ;
            if (useAbsolute && node.data) {
                // Use real-world coordinates directly (like a CAD drawing)
                localX = node.data.rw || node.pos.x;
                localY = node.data.hw || -node.pos.z;
                localZ = node.geometry.bottomZ;
            } else {
                // Default: local coordinates (offset already applied)
                localX = node.pos.x;
                localY = -node.pos.z;
                localZ = node.geometry.bottomZ;
            }

            const height = node.geometry.height || 2.0;
            const width = node.geometry.width || 1.0;

            // Placement
            const pt = this.point3D(localX, localY, localZ);
            const placement = this.axisPlacement(pt);
            const localPlace = this.localPlacement(buildingPlacement, placement);

            // Shape
            const radius = width / 2;
            let shapeRep;
            if (useTessellation) {
                shapeRep = this.createTessellatedCylinder(repContext, radius, height);
            } else {
                shapeRep = this.createSweptSolidCylinder(repContext, radius, height);
            }

            const productShape = this.addLine('IfcProductDefinitionShape', [null, null, [shapeRep]]);

            // Element
            const product = this.addLine('IfcDistributionChamberElement', [
                toIfcGuid(), ownerHistory, `'${node.id}'`, "'Manhole'", "'Manhole'", localPlace, productShape, toIfcGuid()
            ]);
            elements.push(product);

            // === MANHOLE PSET: Pset_DistributionChamberElementTypeManhole ===
            const nodeAttrs = node.attributes || {};
            this.createPropertySet(ownerHistory, product, 'Pset_DistributionChamberElementTypeManhole', [
                this.createPropertyValue('InvertLevel', node.geometry.bottomZ, 'IfcLengthMeasure'),
                this.createPropertyValue('SoffitLevel', node.geometry.coverZ, 'IfcLengthMeasure'),
                // G301 SchachtFunktion
                this.createPropertyValue('TypeOfShaft', nodeAttrs.schachtFunktion || nodeAttrs.subType, 'IfcLabel'),
                // G302-G303 Deckel
                this.createPropertyValue('AccessCoverMaterial', nodeAttrs.deckelMaterial, 'IfcLabel'),
                this.createPropertyValue('AccessLengthOrRadius', nodeAttrs.deckelLaenge, 'IfcPositiveLengthMeasure'),
                this.createPropertyValue('AccessWidth', nodeAttrs.deckelBreite, 'IfcPositiveLengthMeasure'),
                // G304 Abdeckungsklasse
                this.createPropertyValue('AccessCoverLoadRating', nodeAttrs.abdeckungsklasse, 'IfcLabel'),
                // G102 WallMaterial -> pointer text (upgrade in future)
                this.createPropertyValue('WallMaterial', nodeAttrs.material, 'IfcLabel'),
                this.createPropertyValue('BaseMaterial', nodeAttrs.materialBoden, 'IfcLabel'),
                // Steighilfen
                this.createPropertyValue('HasSteps', nodeAttrs.steighilfen || false, 'IfcBoolean'),
            ]);

            // === CUSTOM PSET: ISYBAU_Schachtdaten ===
            this.createPropertySet(ownerHistory, product, 'ISYBAU_Schachtdaten', [
                this.createPropertyValue('Schachtbreite', width, 'IfcLengthMeasure'),
                this.createPropertyValue('Schachttiefe', height, 'IfcLengthMeasure'),
                this.createPropertyValue('Baujahr', nodeAttrs.year, 'IfcLabel'),
                this.createPropertyValue('Status', nodeAttrs.status, 'IfcLabel'),
                this.createPropertyValue('DeckelForm', nodeAttrs.deckelForm, 'IfcLabel'),
            ]);

            // === CUSTOM PSET: ISYBAU_Stammdaten (G106, G107, G101) ===
            this.createPropertySet(ownerHistory, product, 'ISYBAU_Stammdaten', [
                this.createPropertyValue('Kanalart', nodeAttrs.systemType, 'IfcLabel'),
                this.createPropertyValue('Lage', nodeAttrs.lage, 'IfcLabel'),
                this.createPropertyValue('Abwasserart', nodeAttrs.abwasserart, 'IfcLabel'),
            ]);

            // Material via IfcRelAssociatesMaterial
            if (nodeAttrs.material) {
                this.createMaterial(ownerHistory, product, nodeAttrs.material);
            }
        }

        // ===================== PIPES =====================
        for (const edge of this.edges) {
            if (!edge.geometry || !edge.geometry.startPoint || !edge.geometry.endPoint) continue;

            const s = edge.geometry.startPoint;
            const e = edge.geometry.endPoint;

            let startX, startY, startZ, endX, endY, endZ;
            if (useAbsolute) {
                // Use real-world coordinates from source/target nodes
                const srcNode = this.nodes.get(edge.sourceId);
                const tgtNode = this.nodes.get(edge.targetId);
                if (srcNode?.data && tgtNode?.data) {
                    startX = srcNode.data.rw;
                    startY = srcNode.data.hw;
                    startZ = s.y;
                    endX = tgtNode.data.rw;
                    endY = tgtNode.data.hw;
                    endZ = e.y;
                } else {
                    startX = s.x;
                    startY = -s.z;
                    startZ = s.y;
                    endX = e.x;
                    endY = -e.z;
                    endZ = e.y;
                }
            } else {
                startX = s.x;
                startY = -s.z;
                startZ = s.y;
                endX = e.x;
                endY = -e.z;
                endZ = e.y;
            }

            const dx = endX - startX;
            const dy = endY - startY;
            const dz = endZ - startZ;
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (length < 0.001) continue;

            const pt = this.point3D(startX, startY, startZ);
            const zAxis2 = this.dir3D(dx / length, dy / length, dz / length);

            const placement = this.axisPlacement(pt, zAxis2);
            const localPlace = this.localPlacement(buildingPlacement, placement);

            // Shape
            const pWidth = edge.profile?.width || 0.3;
            const pHeight = edge.profile?.height || pWidth;
            const radius = pWidth / 2;
            let shapeRep;
            if (useTessellation) {
                shapeRep = this.createTessellatedPipe(repContext, radius, length);
            } else {
                shapeRep = this.createSweptSolidCylinder(repContext, radius, length);
            }

            const productShape = this.addLine('IfcProductDefinitionShape', [null, null, [shapeRep]]);

            const product = this.addLine('IfcFlowSegment', [
                toIfcGuid(), ownerHistory, `'${edge.id}'`, "'Pipe'", "'Pipe'", localPlace, productShape, toIfcGuid()
            ]);
            elements.push(product);

            // === PIPE PSET: Pset_PipeSegmentTypeCommon ===
            const edgeAttrs = edge.attributes || {};
            const nominalDiameter = pWidth * 1000; // Convert m -> mm (DN)
            this.createPropertySet(ownerHistory, product, 'Pset_PipeSegmentTypeCommon', [
                this.createPropertyValue('NominalDiameter', nominalDiameter, 'IfcPositiveLengthMeasure'),
                this.createPropertyValue('InnerDiameter', pWidth, 'IfcPositiveLengthMeasure'),
                this.createPropertyValue('OuterDiameter', edgeAttrs.aussenDurchmesser, 'IfcPositiveLengthMeasure'),
                this.createPropertyValue('Length', length, 'IfcPositiveLengthMeasure'),
            ]);

            // === CUSTOM PSET: ISYBAU_Haltungsdaten ===
            const profileType = edge.profile?.type || 'Circle';
            this.createPropertySet(ownerHistory, product, 'ISYBAU_Haltungsdaten', [
                this.createPropertyValue('Profilart', profileType, 'IfcLabel'),
                this.createPropertyValue('Profilbreite', pWidth, 'IfcLengthMeasure'),
                this.createPropertyValue('Profilhoehe', pHeight, 'IfcLengthMeasure'),
                this.createPropertyValue('SohlhoeheZulauf', edge.sohleZulauf, 'IfcLengthMeasure'),
                this.createPropertyValue('SohlhoeheAblauf', edge.sohleAblauf, 'IfcLengthMeasure'),
                this.createPropertyValue('Baujahr', edgeAttrs.year, 'IfcLabel'),
                this.createPropertyValue('Status', edgeAttrs.status, 'IfcLabel'),
                // G208 SDR
                this.createPropertyValue('SDR_Klasse', edgeAttrs.sdrKlasse, 'IfcLabel'),
                // G209 Auflagerart
                this.createPropertyValue('Auflagerart_G209', edgeAttrs.auflagerart, 'IfcLabel'),
                // G103/G104 Innenschutz / Auskleidung
                this.createPropertyValue('Innenschutz', edgeAttrs.innenschutz, 'IfcLabel'),
                this.createPropertyValue('Auskleidung', edgeAttrs.auskleidung, 'IfcLabel'),
            ]);

            // === CUSTOM PSET: ISYBAU_Stammdaten (G101, G106, G107) ===
            this.createPropertySet(ownerHistory, product, 'ISYBAU_Stammdaten', [
                this.createPropertyValue('Kanalart', edgeAttrs.systemType, 'IfcLabel'),
                this.createPropertyValue('Lage', edgeAttrs.lage, 'IfcLabel'),
                this.createPropertyValue('Abwasserart', edgeAttrs.abwasserart, 'IfcLabel'),
            ]);

            // Material via IfcRelAssociatesMaterial
            if (edgeAttrs.material) {
                this.createMaterial(ownerHistory, product, edgeAttrs.material);
            }
        }

        // Containment
        if (elements.length > 0) {
            this.addLine('IfcRelContainedInSpatialStructure', [
                toIfcGuid(), ownerHistory, null, null, elements, building
            ]);
        }

        this.lines.push('ENDSEC;\nEND-ISO-10303-21;');
        return this.lines.join('\n');
    }
}
