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
        const block = match[1];
        if (!block.includes('<Knoten>')) continue;

        const idMatch = block.match(/<Objektbezeichnung>(.*?)<\/Objektbezeichnung>/);
        const id = idMatch ? idMatch[1].trim() : `Node_${count++}`;

        // Coords
        const rwMatch = block.match(/<Rechtswert>(.*?)<\/Rechtswert>/);
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
    const origin = GeometryCalculator.calculateOrigin(tempMap);
    console.log('[Headless] Calculated Origin:', origin);

    // 3. Compute Transforms
    for (const rawNode of rawNodes) {
        const transform = GeometryCalculator.computeNodeTransform(rawNode, origin);

        // Store Structure matching User Requirement
        nodes.set(rawNode.id, {
            ...rawNode,
            origin: origin, // Pass reference if needed, or Writer uses it globally
            transform: transform // { pos, rot, scale, shape }
        });
    }

    console.log(`[Headless] Parsed and Calculated ${nodes.size} nodes.`);
    return { nodes, edges, origin }; // EXPLICIT RETURN OF ORIGIN
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
    // Pass Origin to Writer explicitly or let Writer inspect nodes?
    // New Writer should accept Origin in constructor or params.
    const writer = new IsybauToIfc(nodes, edges);
    // Force set origin (Writer might recalculate it, but usually redundant now)
    writer.origin = origin;

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
