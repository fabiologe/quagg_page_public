/**
 * IfcWriterCard1.js — CARD/1 Compatible IFC Export
 *
 * Erzeugt IFC-Dateien im proprietären CARD/1-Format von IB&T GmbH:
 * - IfcBuildingElementProxy statt IfcDistributionChamberElement/IfcFlowSegment
 * - .PROVISIONFORVOID. als PredefinedType
 * - Hierarchie: Project → Site → Building → BuildingStorey (Schächte + Haltungen)
 * - Elemente via IfcRelAggregates an BuildingStorey gehängt
 * - Psets: "Einzelattribute {Name}" + "C_Attribute" mit Dot-Path Keys
 * - Tessellation-Geometrie mit IfcTriangulatedFaceSet
 * - Shared IfcMaterial via IfcRelAssociatesMaterial
 * - IfcSurfaceStyle pro Element
 */

import { v4 as uuidv4 } from 'uuid';

// --- IFC GUID ---
const b64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function toIfcGuid() {
    let res = "";
    for (let i = 0; i < 22; i++) res += b64.charAt(Math.floor(Math.random() * 64));
    return `'${res}'`;
}

function getIsoDate() {
    return new Date().toISOString().split('.')[0];
}

function getCardDateTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
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

// --- Profil resolving ---
const PROFILE_NAMES = {
    0: 'KREIS', 1: 'EI', 2: 'MAUL', 3: 'RECHTECK',
    5: 'TRAPEZ', 10: 'SONDER'
};
function resolveProfileName(code) {
    if (code === null || code === undefined) return 'KREIS';
    return PROFILE_NAMES[Number(code)] || 'KREIS';
}


// --- Cylinder Mesh generator (24 segments like CARD/1) ---
function generateCylinderMesh(radius, height, segments = 24) {
    const vertices = [];
    const indices = [];

    // Bottom ring
    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        vertices.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
    }
    // Top ring
    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        vertices.push([radius * Math.cos(angle), radius * Math.sin(angle), height]);
    }
    // Bottom center
    vertices.push([0, 0, 0]);
    // Top center
    vertices.push([0, 0, height]);

    const botCenter = segments * 2; // 1-indexed: botCenter + 1
    const topCenter = segments * 2 + 1;

    // Bottom cap (fan from center)
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push([i + 1, botCenter + 1, next + 1]);
    }
    // Top cap
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push([topCenter + 1, segments + i + 1, segments + next + 1]);
    }
    // Sides
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const b0 = i + 1;
        const b1 = next + 1;
        const t0 = segments + i + 1;
        const t1 = segments + next + 1;
        indices.push([b1, b0, t0]);
        indices.push([b1, t0, t1]);
    }

    return { vertices, indices };
}

// Generate tessellation mesh for a pipe along a vector
function generatePipeMesh(radius, startPt, endPt, segments = 24) {
    const dx = endPt[0] - startPt[0];
    const dy = endPt[1] - startPt[1];
    const dz = endPt[2] - startPt[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (length < 0.001) return null;

    // Normalize direction
    const dir = [dx / length, dy / length, dz / length];

    // Find perpendicular vectors
    let up = [0, 0, 1];
    if (Math.abs(dir[2]) > 0.9) up = [1, 0, 0];
    // Cross product: perp1 = dir × up
    let perp1 = [
        dir[1] * up[2] - dir[2] * up[1],
        dir[2] * up[0] - dir[0] * up[2],
        dir[0] * up[1] - dir[1] * up[0]
    ];
    const len1 = Math.sqrt(perp1[0] ** 2 + perp1[1] ** 2 + perp1[2] ** 2);
    perp1 = [perp1[0] / len1, perp1[1] / len1, perp1[2] / len1];

    // perp2 = dir × perp1
    const perp2 = [
        dir[1] * perp1[2] - dir[2] * perp1[1],
        dir[2] * perp1[0] - dir[0] * perp1[2],
        dir[0] * perp1[1] - dir[1] * perp1[0]
    ];

    const vertices = [];
    // Start ring
    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        vertices.push([
            startPt[0] + radius * (cos * perp1[0] + sin * perp2[0]),
            startPt[1] + radius * (cos * perp1[1] + sin * perp2[1]),
            startPt[2] + radius * (cos * perp1[2] + sin * perp2[2])
        ]);
    }
    // End ring
    for (let i = 0; i < segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        vertices.push([
            endPt[0] + radius * (cos * perp1[0] + sin * perp2[0]),
            endPt[1] + radius * (cos * perp1[1] + sin * perp2[1]),
            endPt[2] + radius * (cos * perp1[2] + sin * perp2[2])
        ]);
    }
    // Start center + End center
    vertices.push([...startPt]);
    vertices.push([...endPt]);

    const indices = [];
    const startCenter = segments * 2; // 1-indexed: +1
    const endCenter = segments * 2 + 1;

    // Start cap
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push([i + 1, startCenter + 1, next + 1]);
    }
    // End cap
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push([endCenter + 1, segments + i + 1, segments + next + 1]);
    }
    // Barrel
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const b0 = i + 1, b1 = next + 1;
        const t0 = segments + i + 1, t1 = segments + next + 1;
        indices.push([b1, b0, t0]);
        indices.push([b1, t0, t1]);
    }

    return { vertices, indices };
}


export class IsybauToIfcCard1 {
    constructor(nodes, edges, origin, options = {}) {
        this.nodes = nodes;
        this.edges = edges;
        this.origin = origin || { x: 0, y: 0, z: 0 };
        this.lines = [];
        this.idCounter = 1;
        this.ifcMetadata = options.ifcMetadata || {};
        this.coordMode = options.coordMode || 'relative'; // 'relative' | 'absolute' | 'georef'
        this.worldOrigin = options.worldOrigin || this.origin;
        this._materialCache = {};
        this._nodeMap = {};
        // Build node lookup (handles both Map and Array)
        const nodeIterable = nodes instanceof Map ? nodes.values() : nodes;
        for (const n of nodeIterable) {
            this._nodeMap[n.id] = n;
        }
    }

    nextId() { return this.idCounter++; }

    raw(line) { this.lines.push(line); }

    // ======= GENERATE =======

    generate() {
        const now = getIsoDate();
        const dateTime = getCardDateTime();

        // Header
        this.raw('ISO-10303-21;');
        this.raw('HEADER;');
        this.raw(`FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');`);
        this.raw(`FILE_NAME('ISYBAU_CARD1_Export','${now}',('quagg-engineering'),('quagg-engineering'),'','ISYBAU-to-IFC (quagg)','');`);
        this.raw(`FILE_SCHEMA(('IFC4'));`);
        this.raw('ENDSEC;');
        this.raw('DATA;');

        // --- Boilerplate entities ---
        const personId = this.nextId();
        this.raw(`#${personId}=IFCPERSON($,$,'quagg-engineering',$,$,$,$,$);`);

        const orgId = this.nextId();
        this.raw(`#${orgId}=IFCORGANIZATION($,'quagg-engineering','ISYBAU Export',$,$);`);

        const personOrgId = this.nextId();
        this.raw(`#${personOrgId}=IFCPERSONANDORGANIZATION(#${personId},#${orgId},$);`);

        const appId = this.nextId();
        this.raw(`#${appId}=IFCAPPLICATION(#${orgId},'1.0','quagg ISY-IFC','CARD1_EXPORT');`);

        const ownerHistId = this.nextId();
        const timestamp = Math.floor(Date.now() / 1000);
        this.raw(`#${ownerHistId}=IFCOWNERHISTORY(#${personOrgId},#${appId},$,.NOCHANGE.,$,#${personOrgId},#${appId},${timestamp});`);

        // --- Units ---
        const unitIds = this._writeUnits();
        const unitAssignId = this.nextId();
        this.raw(`#${unitAssignId}=IFCUNITASSIGNMENT((${unitIds.map(u => `#${u}`).join(',')}));`);

        // --- GeometricRepresentationContext ---
        const originPt = this.nextId();
        this.raw(`#${originPt}=IFCCARTESIANPOINT((0.,0.,0.));`);
        const zDir = this.nextId();
        this.raw(`#${zDir}=IFCDIRECTION((0.,0.,1.));`);
        const xDir = this.nextId();
        this.raw(`#${xDir}=IFCDIRECTION((1.,0.,0.));`);
        const worldCS = this.nextId();
        this.raw(`#${worldCS}=IFCAXIS2PLACEMENT3D(#${originPt},#${zDir},#${xDir});`);
        const repContextId = this.nextId();
        this.raw(`#${repContextId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-005,#${worldCS},$);`);

        // --- IfcProject ---
        const projectId = this.nextId();
        const projectName = this.ifcMetadata?.projektName || 'ISYBAU Kanalnetz';
        this.raw(`#${projectId}=IFCPROJECT(${toIfcGuid()},#${ownerHistId},'${this._escIfc(projectName)}',$,$,$,$,(#${repContextId}),#${unitAssignId});`);

        // --- Site Placement ---
        const sitePlacOrigin = this.nextId();
        this.raw(`#${sitePlacOrigin}=IFCCARTESIANPOINT((0.,0.,0.));`);
        const siteAxis = this.nextId();
        this.raw(`#${siteAxis}=IFCAXIS2PLACEMENT3D(#${sitePlacOrigin},$,$);`);
        const sitePlacement = this.nextId();
        this.raw(`#${sitePlacement}=IFCLOCALPLACEMENT($,#${siteAxis});`);

        // --- IfcSite ---
        const siteId = this.nextId();
        this.raw(`#${siteId}=IFCSITE(${toIfcGuid()},#${ownerHistId},'Site',$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$);`);

        // Site → Project
        const aggSiteId = this.nextId();
        this.raw(`#${aggSiteId}=IFCRELAGGREGATES(${toIfcGuid()},#${ownerHistId},$,$,#${projectId},(#${siteId}));`);

        // IfcMapConversion for geo-referenced mode
        if (this.coordMode === 'georef' && (this.worldOrigin.x !== 0 || this.worldOrigin.y !== 0)) {
            const targetCRS = this.nextId();
            this.raw(`#${targetCRS}=IFCPROJECTEDCRS('EPSG:25832',$,$,$,$,$,$);`);
            const mapConv = this.nextId();
            this.raw(`#${mapConv}=IFCMAPCONVERSION(#${repContextId},#${targetCRS},${this.worldOrigin.x},${this.worldOrigin.y},0.,1.0,0.0,1.0);`);
        }

        // --- Shared Material ---
        const defaultMat = this._getOrCreateMaterial(ownerHistId, 'Stahlbeton');

        // Store refs for later
        this._ownerHistId = ownerHistId;
        this._repContextId = repContextId;
        this._sitePlacement = sitePlacement;
        this._siteId = siteId;
        this._defaultMatRef = defaultMat;
        this._dateTime = dateTime;

        // ======= ELEMENTS =======
        const manholeRefs = [];
        const pipeRefs = [];

        // --- Process Nodes (Schächte → OT_D Deckel-Elemente) ---
        const nodeIterable = this.nodes instanceof Map ? this.nodes.values() : this.nodes;
        for (const node of nodeIterable) {
            const ref = this._writeManhole(node);
            if (ref) manholeRefs.push(ref);
        }

        // --- Process Edges (Haltungen → _R Rohr-Elemente) ---
        for (const edge of this.edges) {
            const ref = this._writePipe(edge);
            if (ref) pipeRefs.push(ref);
        }

        // ======= CONTAINER HIERARCHY =======
        // BuildingStorey for Schächte
        let schachtStoreyId = null;
        if (manholeRefs.length > 0) {
            schachtStoreyId = this.nextId();
            this.raw(`#${schachtStoreyId}=IFCBUILDINGSTOREY(${toIfcGuid()},#${ownerHistId},'Schächte','',$,#${sitePlacement},$,$,.COMPLEX.,$);`);

            // Einzelattribute for storey
            const stType = this.nextId();
            this.raw(`#${stType}=IFCPROPERTYSINGLEVALUE('Type',$,IFCTEXT('SchaechteAlle'),$);`);
            const stPset = this.nextId();
            this.raw(`#${stPset}=IFCPROPERTYSET(${toIfcGuid()},$,'Einzelattribute Schächte',$,(#${stType}));`);
            const stRel = this.nextId();
            this.raw(`#${stRel}=IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${schachtStoreyId}),#${stPset});`);

            // Aggregate manholes to storey
            const aggMh = this.nextId();
            this.raw(`#${aggMh}=IFCRELAGGREGATES(${toIfcGuid()},#${ownerHistId},'zu Fachobjekt Schächte',$,#${schachtStoreyId},(${manholeRefs.map(r => `#${r}`).join(',')}));`);
        }

        // BuildingStorey for Haltungen
        let haltungStoreyId = null;
        if (pipeRefs.length > 0) {
            haltungStoreyId = this.nextId();
            this.raw(`#${haltungStoreyId}=IFCBUILDINGSTOREY(${toIfcGuid()},#${ownerHistId},'Haltungen','',$,#${sitePlacement},$,$,.COMPLEX.,$);`);

            const htType = this.nextId();
            this.raw(`#${htType}=IFCPROPERTYSINGLEVALUE('Type',$,IFCTEXT('HaltungenAlle'),$);`);
            const htPset = this.nextId();
            this.raw(`#${htPset}=IFCPROPERTYSET(${toIfcGuid()},$,'Einzelattribute Haltungen',$,(#${htType}));`);
            const htRel = this.nextId();
            this.raw(`#${htRel}=IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${haltungStoreyId}),#${htPset});`);

            const aggHt = this.nextId();
            this.raw(`#${aggHt}=IFCRELAGGREGATES(${toIfcGuid()},#${ownerHistId},'zu Fachobjekt Haltungen',$,#${haltungStoreyId},(${pipeRefs.map(r => `#${r}`).join(',')}));`);
        }

        // IfcBuilding
        const buildingId = this.nextId();
        this.raw(`#${buildingId}=IFCBUILDING(${toIfcGuid()},#${ownerHistId},'KanalNetz','',$,#${sitePlacement},$,$,$,$,$,$);`);

        // Building → Site
        const aggBldg = this.nextId();
        this.raw(`#${aggBldg}=IFCRELAGGREGATES(${toIfcGuid()},#${ownerHistId},$,$,#${siteId},(#${buildingId}));`);

        // BuildingStoreys → Building
        const storeyList = [];
        if (schachtStoreyId) storeyList.push(`#${schachtStoreyId}`);
        if (haltungStoreyId) storeyList.push(`#${haltungStoreyId}`);
        if (storeyList.length > 0) {
            const aggStoreys = this.nextId();
            this.raw(`#${aggStoreys}=IFCRELAGGREGATES(${toIfcGuid()},#${ownerHistId},'zu Fachobjekt KanalNetz',$,#${buildingId},(${storeyList.join(',')}));`);
        }

        // --- FOOTER ---
        this.raw('ENDSEC;');
        this.raw('END-ISO-10303-21;');

        return this.lines.join('\n');
    }

    // ======= UNITS =======
    _writeUnits() {
        const ids = [];
        // Length (METRE)
        let id = this.nextId();
        this.raw(`#${id}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
        ids.push(id);
        // Area
        id = this.nextId();
        this.raw(`#${id}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
        ids.push(id);
        // Volume
        id = this.nextId();
        this.raw(`#${id}=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);`);
        ids.push(id);
        // Angle (RADIAN)
        id = this.nextId();
        this.raw(`#${id}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
        ids.push(id);
        // Time
        id = this.nextId();
        this.raw(`#${id}=IFCSIUNIT(*,.TIMEUNIT.,$,.SECOND.);`);
        ids.push(id);
        // Mass
        id = this.nextId();
        this.raw(`#${id}=IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.);`);
        ids.push(id);
        return ids;
    }

    // ======= MATERIAL =======
    _getOrCreateMaterial(ownerHistId, name) {
        if (this._materialCache[name]) return this._materialCache[name];
        const matId = this.nextId();
        this.raw(`#${matId}=IFCMATERIAL('${this._escIfc(name)}',$,$);`);
        this._materialCache[name] = matId;
        return matId;
    }

    // ======= IFC STRING ESCAPE =======
    _escIfc(str) {
        if (!str) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "''");
    }

    // ======= WRITE MANHOLE (Schacht → OT_D element) =======
    _writeManhole(node) {
        const name = `${node.id}-OT_D`;
        const typeName = 'SchachtBTDeckel';
        const attrs = node.attributes || {};
        const matName = resolveMaterialName(attrs.material);
        const matRef = this._getOrCreateMaterial(this._ownerHistId, matName);

        // Geometry: cylinder at world or local position
        const useAbsolute = this.coordMode === 'absolute';
        let x, y;
        if (useAbsolute && node.data) {
            x = node.data.rw || 0;
            y = node.data.hw || 0;
        } else {
            // Local coords: use pos (Three.js mapped) → IFC (swap Y/Z)
            x = node.pos ? node.pos.x : ((node.data?.rw || 0) - this.origin.x);
            y = node.pos ? -node.pos.z : ((node.data?.hw || 0) - this.origin.y);
        }
        const zTop = node.geometry?.coverZ || node.data?.coverZ || 0;
        const zBot = node.geometry?.bottomZ || node.data?.bottomZ || (zTop - 1.5);
        const height = Math.max(zTop - zBot, 0.3);
        const radius = (node.geometry?.width || 1.0) / 2;

        // Build tessellated mesh in world coordinates
        const mesh = generateCylinderMesh(radius, height, 24);
        // Transform vertices to world position
        const worldVerts = mesh.vertices.map(v => [
            x + v[0],
            y + v[1],
            zBot + v[2]
        ]);

        // Write geometry
        const coordStr = worldVerts.map(v => `(${v[0].toFixed(6)},${v[1].toFixed(6)},${v[2].toFixed(6)})`).join(',');
        const ptListId = this.nextId();
        this.raw(`#${ptListId}=IFCCARTESIANPOINTLIST3D((${coordStr}));`);

        const idxStr = mesh.indices.map(t => `(${t[0]},${t[1]},${t[2]})`).join(',');
        const faceSetId = this.nextId();
        this.raw(`#${faceSetId}=IFCTRIANGULATEDFACESET(#${ptListId},$,.T.,(${idxStr}));`);

        // Surface style (grey like CARD/1)
        this._writeSurfaceStyle(faceSetId, 0.6, 0.6, 0.6);

        const shapeRepId = this.nextId();
        this.raw(`#${shapeRepId}=IFCSHAPEREPRESENTATION(#${this._repContextId},'Body','Tessellation',(#${faceSetId}));`);

        const prodDefId = this.nextId();
        this.raw(`#${prodDefId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`);

        // IfcBuildingElementProxy
        const elemId = this.nextId();
        this.raw(`#${elemId}=IFCBUILDINGELEMENTPROXY(${toIfcGuid()},$,'${this._escIfc(name)}','',\$,#${this._sitePlacement},#${prodDefId},\$,.PROVISIONFORVOID.);`);

        // Material association
        const matAssocId = this.nextId();
        this.raw(`#${matAssocId}=IFCRELASSOCIATESMATERIAL(${toIfcGuid()},$,$,$,(#${elemId}),#${matRef});`);

        // Einzelattribute Pset
        const eaTypeId = this.nextId();
        this.raw(`#${eaTypeId}=IFCPROPERTYSINGLEVALUE('Type',$,IFCTEXT('${typeName}'),$);`);
        const eaPsetId = this.nextId();
        this.raw(`#${eaPsetId}=IFCPROPERTYSET(${toIfcGuid()},$,'Einzelattribute ${this._escIfc(name)}',$,(#${eaTypeId}));`);
        const eaRelId = this.nextId();
        this.raw(`#${eaRelId}=IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${elemId}),#${eaPsetId});`);

        // C_Attribute Pset
        const cProps = [];
        cProps.push(this._cProp('PartBase', `IFCTEXT('${typeName}: ${this._escIfc(name)}')`));
        cProps.push(this._cProp('PartBase.General.Name', `IFCTEXT('${this._escIfc(name)}')`));
        cProps.push(this._cProp('PartBase.General.Description', `IFCTEXT('')`));
        cProps.push(this._cProp('PartBase.General.State', `IFCTEXT('')`));
        cProps.push(this._cProp('PartBase.General.Type', `IFCTEXT('${typeName}')`));
        cProps.push(this._cProp('PartBase.General.CreateHistory.User', `IFCTEXT('quagg')`));
        cProps.push(this._cProp('PartBase.General.CreateHistory.DateTime', `IFCDATETIME('${this._dateTime}')`));
        cProps.push(this._cProp('PartBase.General.ChangeHistory.User', `IFCTEXT('quagg')`));
        cProps.push(this._cProp('PartBase.General.ChangeHistory.DateTime', `IFCDATETIME('${this._dateTime}')`));

        // Deckel-specific props
        cProps.push(this._cProp('PartBase.SchachtBTDeckel.Belastungsklasse_Deckel',
            `IFCTEXT('${this._escIfc(attrs.abdeckungsklasse || '-')}')`));
        cProps.push(this._cProp('PartBase.SchachtBTDeckel.Deckelform',
            `IFCTEXT('${this._escIfc(attrs.deckelForm || 'R')}')`));
        cProps.push(this._cPropReal('PartBase.SchachtBTDeckel.Laenge_Deckel', attrs.deckelLaenge || 0));
        cProps.push(this._cPropReal('PartBase.SchachtBTDeckel.Breite_Deckel', attrs.deckelBreite || 0));
        cProps.push(this._cPropInt('PartBase.SchachtBTDeckel.Einstieghilfe', attrs.steighilfen ? 1 : 0));

        const cPsetId = this.nextId();
        this.raw(`#${cPsetId}=IFCPROPERTYSET(${toIfcGuid()},$,'C_Attribute',$,(${cProps.map(p => `#${p}`).join(',')}));`);
        const cRelId = this.nextId();
        this.raw(`#${cRelId}=IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${elemId}),#${cPsetId});`);

        return elemId;
    }

    // ======= WRITE PIPE (Haltung → _R element) =======
    _writePipe(edge) {
        const name = `${edge.id}-A_R`;
        const typeName = 'HaltungBTRohr';
        const attrs = edge.attributes || {};
        const matName = resolveMaterialName(attrs.material);
        const matRef = this._getOrCreateMaterial(this._ownerHistId, matName);

        // Get source and target positions
        const srcNode = this._nodeMap[edge.sourceId || edge.source];
        const tgtNode = this._nodeMap[edge.targetId || edge.target];
        if (!srcNode || !tgtNode) return null;

        const useAbsolute = this.coordMode === 'absolute';
        let x1, y1, x2, y2;
        if (useAbsolute && srcNode.data && tgtNode.data) {
            x1 = srcNode.data.rw;
            y1 = srcNode.data.hw;
            x2 = tgtNode.data.rw;
            y2 = tgtNode.data.hw;
        } else if (srcNode.pos && tgtNode.pos) {
            x1 = srcNode.pos.x;
            y1 = -srcNode.pos.z;
            x2 = tgtNode.pos.x;
            y2 = -tgtNode.pos.z;
        } else {
            x1 = ((srcNode.data?.rw || 0) - this.origin.x);
            y1 = ((srcNode.data?.hw || 0) - this.origin.y);
            x2 = ((tgtNode.data?.rw || 0) - this.origin.x);
            y2 = ((tgtNode.data?.hw || 0) - this.origin.y);
        }

        const z1 = edge.sohleZulauf != null ? edge.sohleZulauf :
            (srcNode.geometry?.bottomZ || srcNode.data?.bottomZ || 0);
        const z2 = edge.sohleAblauf != null ? edge.sohleAblauf :
            (tgtNode.geometry?.bottomZ || tgtNode.data?.bottomZ || 0);

        const pWidth = edge.profile?.width || 0.3;
        const radius = pWidth / 2;
        const pipeLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
        if (pipeLength < 0.001) return null;

        // Build tessellated mesh in world coordinates
        const mesh = generatePipeMesh(radius, [x1, y1, z1], [x2, y2, z2], 24);
        if (!mesh) return null;

        const coordStr = mesh.vertices.map(v => `(${v[0].toFixed(6)},${v[1].toFixed(6)},${v[2].toFixed(6)})`).join(',');
        const ptListId = this.nextId();
        this.raw(`#${ptListId}=IFCCARTESIANPOINTLIST3D((${coordStr}));`);

        const idxStr = mesh.indices.map(t => `(${t[0]},${t[1]},${t[2]})`).join(',');
        const faceSetId = this.nextId();
        this.raw(`#${faceSetId}=IFCTRIANGULATEDFACESET(#${ptListId},$,.T.,(${idxStr}));`);

        // Surface style (light grey like CARD/1: 0.863)
        this._writeSurfaceStyle(faceSetId, 0.863, 0.863, 0.863);

        const shapeRepId = this.nextId();
        this.raw(`#${shapeRepId}=IFCSHAPEREPRESENTATION(#${this._repContextId},'Body','Tessellation',(#${faceSetId}));`);

        const prodDefId = this.nextId();
        this.raw(`#${prodDefId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`);

        // IfcBuildingElementProxy
        const elemId = this.nextId();
        this.raw(`#${elemId}=IFCBUILDINGELEMENTPROXY(${toIfcGuid()},$,'${this._escIfc(name)}','${this._escIfc(name)}',$,#${this._sitePlacement},#${prodDefId},$,.PROVISIONFORVOID.);`);

        // Material
        const matAssocId = this.nextId();
        this.raw(`#${matAssocId}=IFCRELASSOCIATESMATERIAL(${toIfcGuid()},$,$,$,(#${elemId}),#${matRef});`);

        // Einzelattribute
        const eaTypeId = this.nextId();
        this.raw(`#${eaTypeId}=IFCPROPERTYSINGLEVALUE('Type',$,IFCTEXT('${typeName}'),$);`);
        const eaPsetId = this.nextId();
        this.raw(`#${eaPsetId}=IFCPROPERTYSET(${toIfcGuid()},$,'Einzelattribute ${this._escIfc(name)}',$,(#${eaTypeId}));`);
        const eaRelId = this.nextId();
        this.raw(`#${eaRelId}=IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${elemId}),#${eaPsetId});`);

        // C_Attribute Pset
        const cProps = [];
        cProps.push(this._cProp('PartBase', `IFCTEXT('${typeName}: ${this._escIfc(name)}')`));
        cProps.push(this._cProp('PartBase.General.Name', `IFCTEXT('${this._escIfc(name)}')`));
        cProps.push(this._cProp('PartBase.General.Description', `IFCTEXT('${this._escIfc(name)}')`));
        cProps.push(this._cProp('PartBase.General.State', `IFCTEXT('')`));
        cProps.push(this._cProp('PartBase.General.Type', `IFCTEXT('${typeName}')`));
        cProps.push(this._cProp('PartBase.General.CreateHistory.User', `IFCTEXT('quagg')`));
        cProps.push(this._cProp('PartBase.General.CreateHistory.DateTime', `IFCDATETIME('${this._dateTime}')`));
        cProps.push(this._cProp('PartBase.General.ChangeHistory.User', `IFCTEXT('quagg')`));
        cProps.push(this._cProp('PartBase.General.ChangeHistory.DateTime', `IFCDATETIME('${this._dateTime}')`));

        // HaltungBTRohr properties
        const profileHeight = pWidth;  // already in meters from FixData
        const profileWidth = edge.profile?.height || pWidth;
        const innerDiam = profileHeight; // For circular, same as height
        const wallThickness = attrs.aussenDurchmesser ? (attrs.aussenDurchmesser - pWidth) / 2 : 0;
        const roughness = 1.5; // default
        const profileName = resolveProfileName(edge.profile?.type);

        cProps.push(this._cPropReal('PartBase.HaltungBTRohr.Profilhoehe', profileHeight));
        cProps.push(this._cPropReal('PartBase.HaltungBTRohr.Profilbreite', profileWidth));
        cProps.push(this._cPropReal('PartBase.HaltungBTRohr.Innendurchmesser', innerDiam));
        cProps.push(this._cPropReal('PartBase.HaltungBTRohr.Rohrwanddicke', wallThickness));
        cProps.push(this._cProp('PartBase.HaltungBTRohr.Material', `IFCTEXT('${this._escIfc(matName)}')`));
        cProps.push(this._cPropReal('PartBase.HaltungBTRohr.Rauheit', roughness));
        cProps.push(this._cProp('PartBase.HaltungBTRohr.Profil', `IFCTEXT('${profileName}')`));
        cProps.push(this._cPropReal('PartBase.HaltungBTRohr.Rohrlaenge', pipeLength));
        cProps.push(this._cProp('PartBase.HaltungBTRohr.Innenschutz',
            `IFCTEXT('${this._escIfc(attrs.innenschutz || '')}')`));

        const cPsetId = this.nextId();
        this.raw(`#${cPsetId}=IFCPROPERTYSET(${toIfcGuid()},$,'C_Attribute',$,(${cProps.map(p => `#${p}`).join(',')}));`);
        const cRelId = this.nextId();
        this.raw(`#${cRelId}=IFCRELDEFINESBYPROPERTIES(${toIfcGuid()},$,$,$,(#${elemId}),#${cPsetId});`);

        return elemId;
    }

    // --- PROPERTY HELPERS ---
    _cProp(name, ifcVal) {
        const id = this.nextId();
        this.raw(`#${id}=IFCPROPERTYSINGLEVALUE('${name}',$,${ifcVal},$);`);
        return id;
    }

    _cPropReal(name, value) {
        const id = this.nextId();
        const v = (value === null || value === undefined) ? '$' : `IFCREAL(${Number(value)})`;
        this.raw(`#${id}=IFCPROPERTYSINGLEVALUE('${name}',$,${v},$);`);
        return id;
    }

    _cPropInt(name, value) {
        const id = this.nextId();
        const v = (value === null || value === undefined) ? '$' : `IFCINTEGER(${Math.round(Number(value))})`;
        this.raw(`#${id}=IFCPROPERTYSINGLEVALUE('${name}',$,${v},$);`);
        return id;
    }

    // --- SURFACE STYLE ---
    _writeSurfaceStyle(faceSetRef, r, g, b) {
        const colorId = this.nextId();
        this.raw(`#${colorId}=IFCCOLOURRGB($,${r},${g},${b});`);
        const renderingId = this.nextId();
        this.raw(`#${renderingId}=IFCSURFACESTYLERENDERING(#${colorId},0.,$,$,$,$,$,$,.NOTDEFINED.);`);
        const surfStyleId = this.nextId();
        this.raw(`#${surfStyleId}=IFCSURFACESTYLE($,.BOTH.,(#${renderingId}));`);
        const assignId = this.nextId();
        this.raw(`#${assignId}=IFCPRESENTATIONSTYLEASSIGNMENT((#${surfStyleId}));`);
        const styledItemId = this.nextId();
        this.raw(`#${styledItemId}=IFCSTYLEDITEM(#${faceSetRef},(#${assignId}),$);`);
    }
}
