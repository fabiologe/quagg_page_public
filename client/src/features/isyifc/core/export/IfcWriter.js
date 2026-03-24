
import { v4 as uuidv4 } from 'uuid';

// Helper: Echte IFC GUID Kompression (Valid characters)
function toIfcGuid(uuid) {
    const b64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
    // First character MUST be 0, 1, 2, or 3
    let res = b64.charAt(Math.floor(Math.random() * 4)); 
    for(let i = 1; i < 22; i++) {
        res += b64.charAt(Math.floor(Math.random() * 64));
    }
    return `'${res}'`;
}

// Date formatter
function getIsoDate() {
    return new Date().toISOString().split('.')[0];
}

// Ensure proper float serialization for IFC
function formatReal(val) {
    let v = Number(val);
    if (isNaN(v)) return { text: '0.' };
    let s = v.toString();
    if (!s.includes('.') && !s.includes('e') && !s.includes('E')) s += '.';
    return { text: s };
}

// --- MVD Options ---
export const MVD_OPTIONS = {
    CoordinationView: 'CoordinationView_V2.0',
    ReferenceView: 'ReferenceView_V1.2',
    DesignTransferView: 'IFC4Precast'
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
        // System cache: systemType -> IfcSystem config
        this._systemCache = {};
    }

    // --- LINE WRITERS ---

    nextId() { return this.idCounter++; }

    addLine(type, params) {
        const id = this.nextId();
        const pStr = params.map(p => {
            if (p === null || p === undefined) return '$';
            if (p.text !== undefined) return p.text;
            if (typeof p === 'string') {
                if (p.startsWith('.') && p.endsWith('.')) return p;
                return p.startsWith('\'') ? p : `'${p}'`;
            }
            if (typeof p === 'number') return p.toString();
            if (Array.isArray(p)) {
                const items = p.map(i => {
                    if (i === null || i === undefined) return '$';
                    if (i.ref) return `#${i.ref}`;
                    if (i.text !== undefined) return i.text;
                    if (typeof i === 'string') {
                        if (i.startsWith('.') && i.endsWith('.')) return i;
                        return i.startsWith('\'') ? i : `'${i}'`;
                    }
                    if (typeof i === 'number') return i.toString();
                    return i;
                });
                return `(${items.join(',')})`;
            }
            if (p.ref) return `#${p.ref}`;
            return p;
        }).join(',');

        this.lines.push(`#${id}= ${type.toUpperCase()}(${pStr});`);
        return { ref: id };
    }

    // --- GEOMETRY HELPERS ---

    point3D(x, y, z) { return this.addLine('IfcCartesianPoint', [[formatReal(x), formatReal(y), formatReal(z)]]); }
    dir3D(x, y, z) { return this.addLine('IfcDirection', [[formatReal(x), formatReal(y), formatReal(z)]]); }
    axisPlacement(originPt, zAxis = null, refAxis = null) {
        return this.addLine('IfcAxis2Placement3D', [originPt, zAxis, refAxis]);
    }
    localPlacement(relTo, axisPlac) {
        return this.addLine('IfcLocalPlacement', [relTo, axisPlac]);
    }

    // --- TESSELLATION ---

    createTessellatedCylinder(repContext, radius, height, segments = 16) {
        const { vertices, indices } = generateCylinderMesh(radius, height, segments);

        const coordStrings = vertices.map(v => `(${formatReal(v[0]).text},${formatReal(v[1]).text},${formatReal(v[2]).text})`);
        const pointListId = this.nextId();
        this.lines.push(`#${pointListId}= IFCCARTESIANPOINTLIST3D((${coordStrings.join(',')}));`);
        const pointList = { ref: pointListId };

        const indexStrings = indices.map(tri => `(${tri[0]},${tri[1]},${tri[2]})`);
        const faceSetId = this.nextId();
        this.lines.push(`#${faceSetId}= IFCTRIANGULATEDFACESET(#${pointList.ref},$,.T.,(${indexStrings.join(',')}),$);`);
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
        const validRadius = Math.max(0.001, radius);
        const validHeight = Math.max(0.001, height);
        const profile = this.addLine('IfcCircleProfileDef', ['.AREA.', null, null, formatReal(validRadius)]);
        const position = this.axisPlacement(this.point3D(0, 0, 0));
        const solid = this.addLine('IfcExtrudedAreaSolid', [
            profile, position, this.dir3D(0, 0, 1), formatReal(validHeight)
        ]);
        return this.addLine('IfcShapeRepresentation', [
            repContext, "'Body'", "'SweptSolid'", [solid]
        ]);
    }

    // --- PROPERTY SET HELPERS (STRICT AIA) ---

    encodeStepString(text) {
        if (text === null || text === undefined) return '-';
        // 1. Remove newlines and escape single quotes
        let str = String(text).replace(/[\r\n]+/g, ' ').replace(/'/g, "''").trim();
        // 2. Encode non-ASCII characters to STEP Unicode
        let encoded = '';
        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i);
            if (code >= 32 && code <= 126) {
                encoded += str[i];
            } else {
                let hex = code.toString(16).toUpperCase().padStart(4, '0');
                encoded += `\\X2\\${hex}\\X0\\`;
            }
        }
        return encoded;
    }

    // Ensure quotes around Name. 
    // For Text: IFCTEXT('Value')
    // For Real: IFCLENGTHMEASURE(Value) -> already formatted with formatReal!
    // For Integer: IFCINTEGER(Value)
    writePropertySingleValue(name, type, value) {
        let ifcValue = '';
        
        if (type === 'TEXT') {
            ifcValue = `IFCTEXT('${this.encodeStepString(value)}')`;
        } 
        else if (type === 'REAL') {
            let cleanReal = formatReal(value).text;
            ifcValue = `IFCLENGTHMEASURE(${cleanReal})`;
        } 
        else if (type === 'INTEGER') {
            let cleanInt = value != null ? Math.floor(Number(value)) : 0;
            ifcValue = `IFCINTEGER(${cleanInt})`;
        }

        // Strict 4 parameters: Name, Description($), NominalValue, Unit($)
        return `IFCPROPERTYSINGLEVALUE('${this.encodeStepString(name)}',$,${ifcValue},$)`;
    }

    /**
     * Create IfcMaterial and attach via IfcRelAssociatesMaterial (cached)
     */
    createMaterial(ownerHistory, element, materialCode) {
        const name = resolveMaterialName(materialCode);
        const encodedName = this.encodeStepString(name);

        // Cache materials to avoid duplicates
        if (!this._materialCache[encodedName]) {
            const matId = this.nextId();
            this.lines.push(`#${matId}= IFCMATERIAL('${encodedName}',$,$);`);
            this._materialCache[encodedName] = { ref: matId };
        }

        const mat = this._materialCache[encodedName];

        // Create association
        this.addLine('IfcRelAssociatesMaterial', [
            toIfcGuid(), ownerHistory, null, null, [element], mat
        ]);

        return mat;
    }

    /**
     * Architectural Cleanup: Centralized property builder for AIA BIM standards
     */
    buildProperties(elementIfcId, data, isManhole) {
        const attributes = data.attributes || {};
        const propIds = [];
        const eRef = elementIfcId.ref ? elementIfcId.ref : elementIfcId;
        
        const addProp = (name, type, val) => {
            let pId = this.idCounter++;
            this.lines.push(`#${pId}= ${this.writePropertySingleValue(name, type, val)};`);
            propIds.push(`#${pId}`);
        };

        // QG_ISYBAU_Data mapping
        addProp('Objektbezeichnung', 'TEXT', data.id || 'Unknown');
        addProp('Kanalart', 'TEXT', attributes.systemType || 'Unknown');
        addProp('Material', 'TEXT', resolveMaterialName(attributes.material));
        addProp('Baujahr', 'INTEGER', attributes.year || 0);

        if (isManhole) {
            addProp('Sohlenhoehe', 'REAL', data.geometry?.bottomZ || 0);
            addProp('Deckelhoehe', 'REAL', data.geometry?.coverZ || 0);
            addProp('Profilbreite', 'REAL', data.geometry?.width || 0);
            addProp('Profilhoehe', 'REAL', data.geometry?.height || 0);
        } else {
            const width = data.profile?.width || 0.3;
            const height = data.profile?.height || width;
            addProp('Profilbreite', 'REAL', width);
            addProp('Profilhoehe', 'REAL', height);
            addProp('Sohlenhoehe', 'REAL', data.sohleZulauf || 0); // mapped bottomZ for edges via sohleZulauf
            addProp('Deckelhoehe', 'REAL', data.sohleAblauf || 0); // mapped coverZ equivalent via sohleAblauf
        }

        // Create the IFCPROPERTYSET
        // Strict 5 parameters: Guid, OwnerHistory($), Name, Description($), (Properties)
        if (propIds.length === 0) return;
        
        let psetId = this.idCounter++;
        let psetGuid = toIfcGuid(); // returns quoted string
        this.lines.push(`#${psetId}= IFCPROPERTYSET(${psetGuid},$,'QG_ISYBAU_Data',$,(${propIds.join(',')}));`);

        // Create the Relation IFCRELDEFINESBYPROPERTIES
        // Strict 6 parameters: Guid, OwnerHistory($), Name($), Description($), RelatedObjects(SET), RelatingPropertyDefinition
        // CRITICAL: RelatedObjects MUST be wrapped in parentheses: (#${elementId})
        let relId = this.idCounter++;
        let relGuid = toIfcGuid();
        this.lines.push(`#${relId}= IFCRELDEFINESBYPROPERTIES(${relGuid},$,$,$,(#${eRef}),#${psetId});`);
    }

    buildSystemAssignment(systemId, elementIdsArray) {
        if (!elementIdsArray || elementIdsArray.length === 0) return;
        
        // Convert array of IDs [100, 105, 110] to string "#100,#105,#110"
        const formattedRefs = elementIdsArray.map(id => {
            let ref = id.ref ? id.ref : id;
            return `#${ref}`;
        }).join(',');
        
        let sRef = systemId.ref ? systemId.ref : systemId;

        // Strict 7 Parameters for IFCRELASSIGNSTOGROUP:
        // Guid, Owner($), Name($), Desc($), RelatedObjects(SET), RelatedObjectsType($), RelatingGroup
        let relId = this.idCounter++;
        let relGuid = toIfcGuid();
        
        // CRITICAL: formattedRefs MUST be wrapped in parentheses!
        this.lines.push(`#${relId}= IFCRELASSIGNSTOGROUP(${relGuid},$,$,$,(${formattedRefs}),$,#${sRef});`);
    }


    // --- MAIN GENERATOR ---

    generate() {
        this.lines = [];
        this.idCounter = 1;
        this._materialCache = {};
        this._systemCache = {};

        const useTessellation = this.geometryType === GEOMETRY_OPTIONS.Tessellation;
        const meta = this.ifcMetadata;

        // 1. Header
        const dateStr = getIsoDate();
        const author = meta.ersteller || 'quagg User';
        const org = 'quagg engineering';
        const preprocessor = 'quagg-IfcWriter 1.0';
        const originatingSystem = 'quagg engineering - ISYBAU to IFC Converter - 1.0.0.0';
        const auth = 'none';

        this.lines.push(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [${this.mvd}]'),'2;1');
FILE_NAME('ISYBAU_${dateStr}.ifc', '${dateStr}', ('${author}'), ('${org}'), '${preprocessor}', '${originatingSystem}', '${auth}');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`);

        // 2. Project Structure (Boilerplate DATA Setup)
        this.lines.push(`#1= IFCORGANIZATION($,'quagg-engineering.org',$,$,$);`);
        this.lines.push(`#2= IFCAPPLICATION(#1,'1.0','ISYBAU Import','ISYBAU');`);
        this.lines.push(`#3= IFCPERSON($,'User',$,$,$,$,$,$);`);
        this.lines.push(`#4= IFCPERSONANDORGANIZATION(#3,#1,$);`);
        
        const timestamp = Math.floor(Date.now() / 1000);
        this.lines.push(`#5= IFCOWNERHISTORY(#4,#2,$,.ADDED.,${timestamp},$,$,${timestamp});`);
        
        this.lines.push(`#6= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
        this.lines.push(`#7= IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
        this.lines.push(`#8= IFCUNITASSIGNMENT((#6,#7));`);
        
        this.lines.push(`#9= IFCCARTESIANPOINT((${formatReal(0).text},${formatReal(0).text},${formatReal(0).text}));`);
        this.lines.push(`#10= IFCDIRECTION((${formatReal(0).text},${formatReal(0).text},${formatReal(1).text}));`);
        this.lines.push(`#11= IFCDIRECTION((${formatReal(1).text},${formatReal(0).text},${formatReal(0).text}));`);
        this.lines.push(`#12= IFCAXIS2PLACEMENT3D(#9,#10,#11);`);
        
        // Main Context
        this.lines.push(`#13= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#12,$);`);
        
        // Sub Context (GEM052)
        this.lines.push(`#14= IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#13,$,.MODEL_VIEW.,$);`);
        
        // Projected CRS & Map Conversion (GRF003)
        this.lines.push(`#15= IFCPROJECTEDCRS('EPSG:25832','UTM Zone 32N','ETRS89',$,'UTM','32N',#6);`);
        this.lines.push(`#16= IFCMAPCONVERSION(#13,#15,${formatReal(this.worldOrigin.x).text},${formatReal(this.worldOrigin.y).text},${formatReal(0).text},1.0,0.0,1.0);`);
        
        // Project
        const projectGuid = toIfcGuid();
        this.lines.push(`#17= IFCPROJECT(${projectGuid},#5,'ISYBAU Project',$,$,$,$,(#13),#8);`);
        
        this.idCounter = 18;
        
        const ownerHistory = { ref: 5 };
        const repContext = { ref: 14 }; // CRITICAL: All shapes use the SubContext
        const project = { ref: 17 };

        // === PROJECT-LEVEL METADATA ===
        // (Skipped creating custom 'ISYBAU_Metadaten' if we strictly use new buildProperties format and only what's required)
        // If needed, we can adapt Project Level PSETs here manually.
        const projectProps = [];
        const addProjProp = (name, type, val) => {
            let pId = this.idCounter++;
            this.lines.push(`#${pId}= ${this.writePropertySingleValue(name, type, val || '-')};`);
            projectProps.push(`#${pId}`);
        };
        addProjProp('Datenstatus', 'TEXT', meta.datenstatus);
        addProjProp('Kollektivart', 'TEXT', meta.kollektivart);
        addProjProp('Stammdatentyp', 'TEXT', meta.stammdatentyp);
        addProjProp('Zustaendigkeit', 'TEXT', meta.zustaendigkeit);
        addProjProp('Regelwerk', 'TEXT', meta.regelwerk);

        let projPsetId, projRelId;
        if (projectProps.length > 0) {
            projPsetId = this.idCounter++;
            this.lines.push(`#${projPsetId}= IFCPROPERTYSET(${toIfcGuid()},$,'ISYBAU_Metadaten',$,(${projectProps.join(',')}));`);
            projRelId = this.idCounter++;
            this.lines.push(`#${projRelId}= IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${project.ref}),#${projPsetId});`);
        }

        // SITE — Coordinate mode logic
        const useAbsolute = this.coordMode === 'absolute';
        const useGeoref = false; // Forced to false locally since global map conv is now handled statically

        // For 'absolute': site at 0,0 (coords are real-world)
        // For 'relative'/'georef': site at origin offset
        const siteX = useAbsolute ? 0 : this.origin.x;
        const siteY = useAbsolute ? 0 : this.origin.y;
        const siteOrigin = this.point3D(siteX, siteY, 0);
        const sitePlace3D = this.axisPlacement(siteOrigin);
        const sitePlacement = this.localPlacement(null, sitePlace3D);

        const site = this.addLine('IfcSite', [
            toIfcGuid(), ownerHistory, "'Site'", null, null, sitePlacement, null, null, '.ELEMENT.',
            null, null, null, null, null
        ]);

        // Building
        const buildingPlace3D = this.axisPlacement(this.point3D(0, 0, 0));
        const buildingPlacement = this.localPlacement(sitePlacement, buildingPlace3D);
        const building = this.addLine('IfcBuilding', [
            toIfcGuid(), ownerHistory, "'Building'", null, null, buildingPlacement, null, null, '.ELEMENT.', formatReal(0), formatReal(0), null
        ]);

        // Hierarchy
        this.addLine('IfcRelAggregates', [toIfcGuid(), ownerHistory, "'Project aggregates Site'", null, project, [site]]);
        this.addLine('IfcRelAggregates', [toIfcGuid(), ownerHistory, "'Site aggregates Building'", null, site, [building]]);

        // Systems
        const assignSystem = (sysType, product) => {
            const safeType = sysType || 'Unbekannt';
            const encodedType = this.encodeStepString(safeType);
            if (!this._systemCache[encodedType]) {
                const sysId = this.addLine('IfcSystem', [
                    toIfcGuid(), ownerHistory, `'${encodedType}'`, null, null
                ]);
                this._systemCache[encodedType] = { ref: sysId, elements: [] };
            }
            this._systemCache[encodedType].elements.push(product);
        };

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

            // Placement (Use exact static vectors for Manholes)
            const pt = this.point3D(localX, localY, localZ);
            const zAxisStatic = this.dir3D(0, 0, 1);
            const xAxisStatic = this.dir3D(1, 0, 0);
            const placement = this.axisPlacement(pt, zAxisStatic, xAxisStatic);
            const localPlace = this.localPlacement(buildingPlacement, placement);

            // Shape
            const validRadius = Math.max(0.001, width / 2);
            const validHeight = Math.max(0.001, height);
            let shapeRep;
            if (useTessellation) {
                shapeRep = this.createTessellatedCylinder(repContext, validRadius, validHeight);
            } else {
                shapeRep = this.createSweptSolidCylinder(repContext, validRadius, validHeight);
            }

            const productShape = this.addLine('IfcProductDefinitionShape', [null, null, [shapeRep]]);

            const encodedNodeId = this.encodeStepString(node.id);
            // Element (9th param is PredefinedType: .MANHOLE.)
            const product = this.addLine('IfcDistributionChamberElement', [
                toIfcGuid(), ownerHistory, `'${encodedNodeId}'`, "'Manhole'", "'Manhole'", localPlace, productShape, toIfcGuid(), '.MANHOLE.'
            ]);
            elements.push(product);

            const nodeAttrs = node.attributes || {};
            
            // Centralized Property Building
            this.buildProperties(product, node, true);

            // Group into IfcSystem
            assignSystem(nodeAttrs.systemType, product);

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
            let length = Math.sqrt(dx * dx + dy * dy + dz * dz);

            length = Math.max(0.001, length);

            const pt = this.point3D(startX, startY, startZ);
            
            let dir = { x: dx/length, y: dy/length, z: dz/length };
            let refDir = { x: 0, y: 1, z: 0 }; 
            // If pipe is perfectly vertical, cross product will fail, so pick Global X
            if (Math.abs(dir.x) < 0.001 && Math.abs(dir.z) < 0.001) {
                refDir = { x: 1, y: 0, z: 0 };
            }
            // Calculate Cross Product to get a perfectly orthogonal vector
            let orthoX = (refDir.y * dir.z) - (refDir.z * dir.y);
            let orthoY = (refDir.z * dir.x) - (refDir.x * dir.z);
            let orthoZ = (refDir.x * dir.y) - (refDir.y * dir.x);

            // Normalize the orthogonal vector
            let lenOrtho = Math.sqrt(orthoX*orthoX + orthoY*orthoY + orthoZ*orthoZ);
            orthoX /= lenOrtho; orthoY /= lenOrtho; orthoZ /= lenOrtho;

            const zAxis2 = this.dir3D(dir.x, dir.y, dir.z);
            const xAxis2 = this.dir3D(orthoX, orthoY, orthoZ);

            // Placement WITH perfectly orthogonal RefDirection (XAxis)
            const placement = this.axisPlacement(pt, zAxis2, xAxis2);
            const localPlace = this.localPlacement(buildingPlacement, placement);

            // Shape
            const pWidth = edge.profile?.width || 0.3;
            const pHeight = edge.profile?.height || pWidth;
            const validRadius = Math.max(0.001, pWidth / 2);
            let shapeRep;
            if (useTessellation) {
                shapeRep = this.createTessellatedPipe(repContext, validRadius, length);
            } else {
                shapeRep = this.createSweptSolidCylinder(repContext, validRadius, length);
            }

            const productShape = this.addLine('IfcProductDefinitionShape', [null, null, [shapeRep]]);

            // Element (9th param is PredefinedType)
            // Profile Type logic
            const profileType = edge.profile?.type || 'Circle';
            const predefinedType = '.RIGIDSEGMENT.';

            const encodedEdgeId = this.encodeStepString(edge.id);
            const product = this.addLine('IfcPipeSegment', [
                toIfcGuid(), ownerHistory, `'${encodedEdgeId}'`, `'${profileType}'`, "'Pipe'", localPlace, productShape, toIfcGuid(), predefinedType
            ]);
            elements.push(product);

            const edgeAttrs = edge.attributes || {};

            // Centralized Property Building
            this.buildProperties(product, edge, false);

            // Group into IfcSystem
            assignSystem(edgeAttrs.systemType, product);

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

        // Link IfcSystems
        for (const sysName in this._systemCache) {
            const sys = this._systemCache[sysName];
            if (sys.elements.length > 0) {
                this.buildSystemAssignment(sys.ref, sys.elements);
            }
        }

        this.lines.push('ENDSEC;\nEND-ISO-10303-21;');
        return this.lines.join('\n');
    }
}
