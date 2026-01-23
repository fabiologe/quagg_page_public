/**
 * debug_pipeline.js
 * 
 * Headless Debug Pipeline for ISYBAU -> IFC
 * 1. Import XML
 * 2. Calculate Geometry (Using Pure Math Calculator)
 * 3. Export IFC
 * 4. Validate IFC
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock Browser Environment for Worker Scripts
global.self = global;
global.postMessage = (msg) => { }; // No-op

// Imports (adjust paths relative to script location)
import { IsybauToIfc } from '../src/features/isyifc/core/export/IfcWriter.js';
import { IfcValidator } from '../src/features/isyifc/core/export/IfcValidator.js';
import { GeometryCalculator } from '../src/features/isyifc/core/logic/GeometryCalculator.js';

const XML_PATH = path.resolve('src/features/isyifc/6178_A64-2BA_0.xml');

function parseXmlHeadless(xmlContent) {
    const nodes = new Map();
    const edges = [];

    // 1. Manholes (Objektart 2)
    const nodeRegex = /<AbwassertechnischeAnlage>(.*?)<\/AbwassertechnischeAnlage>/gs;
    let match;
    let count = 0;

    const rawNodes = [];

    while ((match = nodeRegex.exec(xmlContent)) !== null) {
        // Check for Edge Topology (Haltung)
        // Try multiple standard tags for connections
        const srcMatch = block.match(/<KnotenZulauf>(.*?)<\/KnotenZulauf>/) ||
            block.match(/<Anfangsknoten>(.*?)<\/Anfangsknoten>/) ||
            block.match(/<StartKnoten>(.*?)<\/StartKnoten>/);

        const tgtMatch = block.match(/<KnotenAblauf>(.*?)<\/KnotenAblauf>/) ||
            block.match(/<Endknoten>(.*?)<\/Endknoten>/) ||
            block.match(/<ZielKnoten>(.*?)<\/ZielKnoten>/);

        if (srcMatch && tgtMatch) {
            // It's an Edge!
            const pf = (s) => s ? parseFloat(s.replace(',', '.')) : 0;

            // Profil
            const wMatch = block.match(/<Profilbreite>(.*?)<\/Profilbreite>/);
            const width = wMatch ? pf(wMatch[1]) / 1000 : 0.3; // Assume input in mm usually >9 check? Let's use 0.3 defaults.

            // Sohlen
            const zZulaufMatch = block.match(/<SohleKnotenZulauf>(.*?)<\/SohleKnotenZulauf>/) || block.match(/<SohlhoeheZulauf>(.*?)<\/SohlhoeheZulauf>/);
            const zAblaufMatch = block.match(/<SohleKnotenAblauf>(.*?)<\/SohleKnotenAblauf>/) || block.match(/<SohlhoeheAblauf>(.*?)<\/SohlhoeheAblauf>/);

            edges.push({
                id: id,
                sourceId: srcMatch[1].trim(),
                targetId: tgtMatch[1].trim(),
                // Meta info for FixData emulation
                meta: {
                    sohleZulauf: zZulaufMatch ? pf(zZulaufMatch[1]) : null,
                    sohleAblauf: zAblaufMatch ? pf(zAblaufMatch[1]) : null,
                    kanalart: 'KS',
                    material: 'Beton'
                },
                // Raw Shape for Geometry
                shape: {
                    dim1: width,
                    dim2: width,
                    type: 'Circle'
                }
            });
            continue; // Skip Node processing
        }

        // --- NODE PROCESSING ---
        if (!block.includes('<Knoten>')) continue;

        // ... (Existing Node Logic) ...
        const rwMatch = block.match(/<Rechtswert>(.*?)<\/Rechtswert>/);
        const id = idMatch ? idMatch[1].trim() : `Node_${count++}`;

        // Coords
        // rwMatch already declared above
        const hwMatch = block.match(/<Hochwert>(.*?)<\/Hochwert>/);
        const dmMatch = block.match(/<Deckelhoehe>(.*?)<\/Deckelhoehe>/) || block.match(/<Punkthoehe>(.*?)<\/Punkthoehe>/);
        const smMatch = block.match(/<Sohlhoehe>(.*?)<\/Sohlhoehe>/);

        // Convert German Floats
        const pf = (s) => s ? parseFloat(s.replace(',', '.')) : 0;

        const rw = pf(rwMatch?.[1]);
        const hw = pf(hwMatch?.[1]);
        const cover = pf(dmMatch?.[1]);
        const bottom = pf(smMatch?.[1]);

        rawNodes.push({
            id: id,
            data: { rw, hw, coverZ: cover, bottomZ: bottom },
            geometry: { width: 1.0, shape: 'Cylinder' },
            attributes: { status: 1, material: 'Beton', year: 2020, systemType: 'KS', subType: 'KS' }
        });
    }

    // --- GEOMETRY CALCULATION PHASE ---

    // 1. Convert Array to Map temp for calculator
    const tempMap = new Map(rawNodes.map(n => [n.id, n]));

    // 2. Calculate Origin
    // 2. Calculate Origin
    const origin = GeometryCalculator.calculateWorldOrigin(tempMap);
    console.log('[Headless] Calculated Origin:', origin);

    // 3. Compute Transforms
    for (const rawNode of rawNodes) {
        const transform = GeometryCalculator.calculateNodeTransform(rawNode, origin);

        // Store Structure matching User Requirement
        nodes.set(rawNode.id, {
            ...rawNode,
            origin: origin, // Pass reference if needed, or Writer uses it globally
            transform: transform // { pos, rot, scale, shape }
        });
    }

    // 4. Compute Transforms for Edges
    // NOTE: This mimics FixData logic to provide 'startPoint', 'endPoint' logic etc.
    // GeometryCalculator V3 API: calculateEdgeTransform(edge, nodeA, nodeB, origin) -> Returns { pos, rot, scale, meta... }

    // However, IfcWriter now expects `edge.geometry.startPoint` (Local).
    // calculateEdgeTransform primarily calculates the CENTER pos.
    // We need to construct the explicit start/end points.

    const finalEdges = [];

    for (const e of edges) {
        const nodeA = nodes.get(e.sourceId);
        const nodeB = nodes.get(e.targetId);

        if (!nodeA || !nodeB) continue;

        // Calculate Local Start/End Z
        // If meta sohle exists, use it. Else node bottom.
        const startZ = e.meta.sohleZulauf !== null ? e.meta.sohleZulauf : nodeA.geometry.bottomZ;
        const endZ = e.meta.sohleAblauf !== null ? e.meta.sohleAblauf : nodeB.geometry.bottomZ;

        // Local Points (Using Node's transformed pos)
        // Node.pos is {x, y, z}. (Local)
        // Store: Y is Elevation. Z is -North. 
        // e.meta sohle is Elevation.

        const startPoint = {
            x: nodeA.pos.x,
            y: startZ, // Elevation
            z: nodeA.pos.z // -North
        };

        const endPoint = {
            x: nodeB.pos.x,
            y: endZ,
            z: nodeB.pos.z
        };

        finalEdges.push({
            ...e,
            geometry: {
                startPoint,
                endPoint
            },
            profile: {
                width: e.shape.dim1,
                height: e.shape.dim1
            }
        });
    }

    console.log(`[Headless] Calculated ${finalEdges.length} edges.`);
    return { nodes, edges: finalEdges, origin };
}

async function run() {
    console.log('--- STARTING HEADLESS PIPELINE ---');

    if (!fs.existsSync(XML_PATH)) {
        console.error('XML File not found:', XML_PATH);
        return;
    }
    const xml = fs.readFileSync(XML_PATH, 'utf-8');

    // 2. PARSE & CALCULATE
    const { nodes, edges, origin } = parseXmlHeadless(xml);

    // 3. EXPORT
    // Pass Origin to Writer explicitly (New Signature)
    const writer = new IsybauToIfc(nodes, edges, origin);

    const ifcString = writer.generate();

    const outPath = 'debug_output.ifc';
    fs.writeFileSync(outPath, ifcString);
    console.log(`[Headless] Wrote IFC to ${outPath} (${ifcString.length} bytes)`);

    // 4. VALIDATE
    const validator = new IfcValidator();
    const result = validator.validate(ifcString);
    validator.report(result);
}

run();
