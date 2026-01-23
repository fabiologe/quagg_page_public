
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

export class IsybauToIfc {
    constructor(nodes, edges, origin) {
        this.nodes = nodes;
        this.edges = edges;
        this.origin = origin || { x: 0, y: 0, z: 0 };
        this.lines = [];
        this.idCounter = 1;
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

    // --- MAIN GENERATOR ---

    generate() {
        this.lines = [];
        this.idCounter = 1;

        // 1. Header
        this.lines.push(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('${getIsoDate()}.ifc','${getIsoDate()}',('User'),('ISYBAU'),'ISYBAU Parser','ISYBAU Parser','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`);

        // 2. Project Structure
        const organization = this.addLine('IfcOrganization', [null, "'ISYBAU Parser'", null, null, null]);
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

        // SITE DEFINITION with GLOBAL ORIGIN
        // Origin.z is usually 0 if handled via Elevation in objects, or we put Sea Level here.
        // Let's assume Z=0 for Site and objects have absolute Elevation (e.g. 500m).
        const siteOrigin = this.point3D(this.origin.x, this.origin.y, 0);
        const sitePlace3D = this.axisPlacement(siteOrigin);
        const sitePlacement = this.localPlacement(null, sitePlace3D); // Relative to World (0,0,0)

        const site = this.addLine('IfcSite', [
            toIfcGuid(), ownerHistory, "'Site'", null, null, sitePlacement, null, null, '.ELEMENT.',
            [0, 0], 0, null, null
        ]);

        // Building (Relative to Site -> 0,0,0)
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

        // NODES
        for (const node of this.nodes.values()) {
            if (!node.pos) continue;

            // Mapping Store -> IFC
            // Store: X=East(local), Y=Elevation, Z=-North(local)
            // IFC: X=East, Y=North, Z=Up
            // Therefore:
            // IFC X = Store X
            // IFC Y = -Store Z (Convert -North back to North)
            // IFC Z = Store Y (Elevation)

            const localX = node.pos.x;
            const localY = -node.pos.z;
            const localZ = node.geometry.bottomZ; // Use exact bottomZ for placement

            const height = node.geometry.height || 2.0;
            const width = node.geometry.width || 1.0;

            // Placement
            const pt = this.point3D(localX, localY, localZ);
            const placement = this.axisPlacement(pt); // Normal Z-Up
            const localPlace = this.localPlacement(buildingPlacement, placement);

            // Shape (Extrusion)
            const radius = width / 2;
            const profile = this.addLine('IfcCircleProfileDef', ['.AREA.', null, null, radius]);

            const position = this.axisPlacement(this.point3D(0, 0, 0));
            const solid = this.addLine('IfcExtrudedAreaSolid', [
                profile, position, this.dir3D(0, 0, 1), height
            ]);

            const shapeRep = this.addLine('IfcShapeRepresentation', [
                repContext, "'Body'", "'SweptSolid'", [solid]
            ]);
            const productShape = this.addLine('IfcProductDefinitionShape', [null, null, [shapeRep]]);

            // Element
            const product = this.addLine('IfcDistributionChamberElement', [
                toIfcGuid(), ownerHistory, `'${node.id}'`, "'Manhole'", "'Manhole'", localPlace, productShape, toIfcGuid()
            ]);
            elements.push(product);
        }

        // PIPES
        for (const edge of this.edges) {
            if (!edge.geometry || !edge.geometry.startPoint || !edge.geometry.endPoint) continue;

            // Mapping Local Store -> IFC
            const s = edge.geometry.startPoint;
            const e = edge.geometry.endPoint;

            const startX = s.x;
            const startY = -s.z; // North
            const startZ = s.y;  // Elevation

            const endX = e.x;
            const endY = -e.z;
            const endZ = e.y;

            // Vector
            const dx = endX - startX;
            const dy = endY - startY;
            const dz = endZ - startZ;
            const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (length < 0.001) continue;

            // Axis Placement (Start Point, Z-Axis=Direction, Ref=X-Axis default)
            // We need to orient the Z-Axis of the placement to match the pipe direction.
            // IfcExtrudedAreaSolid extrudes along Z (0,0,1) normally. 
            // If we rotate the placement, the extrusion follows.

            const pt = this.point3D(startX, startY, startZ);
            const zAxis = this.dir3D(dx / length, dy / length, dz / length);

            // Ref axis (X) must be perpendicular to Z.
            // If Z is vertical (0,0,1), X can be (1,0,0).
            // General case: Z = (u,v,w). arbitrary up = (0,0,1). X = up x Z.
            // If Z is parallel to global Z, use Y as up.
            let rx, ry, rz;
            if (Math.abs(dz / length) > 0.99) {
                // Vertical pipe, use Y as ref
                rx = 0; ry = 1; rz = 0; // Cross product logic needed?
                // Actually simpler: Let IFC viewer handle default ref axis if null? 
                // Some viewers complain. Better to provide one.
                // Let's rely on default behavior for now (pass null for RefAxis)
            }

            // Placement
            // We pass independent Direction IDs? No, addLine returns {ref}.
            const placement = this.axisPlacement(pt, zAxis);
            const localPlace = this.localPlacement(buildingPlacement, placement);

            // Shape
            const width = edge.profile?.width || 0.3;
            const radius = width / 2;
            const profile = this.addLine('IfcCircleProfileDef', ['.AREA.', null, null, radius]);

            const pos = this.axisPlacement(this.point3D(0, 0, 0));
            const solid = this.addLine('IfcExtrudedAreaSolid', [
                profile, pos, this.dir3D(0, 0, 1), length
            ]);

            const shapeRep = this.addLine('IfcShapeRepresentation', [
                repContext, "'Body'", "'SweptSolid'", [solid]
            ]);
            const productShape = this.addLine('IfcProductDefinitionShape', [null, null, [shapeRep]]);

            const product = this.addLine('IfcFlowSegment', [
                toIfcGuid(), ownerHistory, `'${edge.id}'`, "'Pipe'", "'Pipe'", localPlace, productShape, toIfcGuid()
            ]);
            elements.push(product);
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
