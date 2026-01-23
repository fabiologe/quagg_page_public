/**
 * debug_pipeline.js
 * 
 * Headless Debug Pipeline for ISYBAU -> IFC
 * 1. Import XML
 * 2. Generate Logic Graph
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

// Minimal XML Parser Mock (since DOMParser is browser-only)
// We need to parse the XML file to Objects. 
// Options:
// A. Use a node library like 'xml2js' or 'fast-xml-parser' (if available?)
// B. Use regex (since IsybauParser uses simple structure)
// C. Copy IsybauParser logic and patch DOMParser.

// APPROACH: Load the specific test file content and MANUALLY construct the data structure
// matching what IsybauParser produces. This is safer for a headless debug script
// than trying to polyfill DOMParser completely.

// Actually, better: We just load the XML text and use Regex to extract Nodes/Edges.
// This duplicates IsybauParser.worker.js logic but stripped down.

const XML_PATH = path.resolve('src/features/isyifc/6178_A64-2BA_0.xml');

function parseXmlHeadless(xmlContent) {
    const nodes = new Map();
    const edges = [];

    // 1. Manholes (Objektart 2)
    const nodeRegex = /<AbwassertechnischeAnlage>(.*?)<\/AbwassertechnischeAnlage>/gs;
    let match;
    let count = 0;

    while ((match = nodeRegex.exec(xmlContent)) !== null) {
        const block = match[1];
        // Only Nodes (Objektart 2) usually, but wait. Isybau XML structure varies.
        // Let's look for <Knoten> block.
        if (!block.includes('<Knoten>')) continue;

        const idMatch = block.match(/<Objektbezeichnung>(.*?)<\/Objektbezeichnung>/);
        const id = idMatch ? idMatch[1].trim() : `Node_${count++}`;

        // Coords
        const rwMatch = block.match(/<Rechtswert>(.*?)<\/Rechtswert>/);
        const hwMatch = block.match(/<Hochwert>(.*?)<\/Hochwert>/);
        const dmMatch = block.match(/<Deckelhoehe>(.*?)<\/Deckelhoehe>/) || block.match(/<Punkthoehe>(.*?)<\/Punkthoehe>/); // DMP
        const smMatch = block.match(/<Sohlhoehe>(.*?)<\/Sohlhoehe>/);

        // Convert German Floats
        const pf = (s) => s ? parseFloat(s.replace(',', '.')) : 0;

        const rw = pf(rwMatch?.[1]);
        const hw = pf(hwMatch?.[1]);
        const cover = pf(dmMatch?.[1]);
        const bottom = pf(smMatch?.[1]);

        // Geometry (Simplified)
        nodes.set(id, {
            id: id,
            type: 'Manhole',
            // Data passed to Writer
            data: { rw: rw, hw: hw, coverZ: cover, bottomZ: bottom },
            // MOCKED THREE.JS POS (Since Writer needs node.pos for compatibility)
            // Writer calculates local offset from this.
            // Let's set pos = {x: rw, y: cover, z: -hw}
            pos: { x: rw, y: cover, z: -hw },
            geometry: {
                shape: 'Cylinder',
                dimensions: { width: 1.0, length: 1.0 },
                width: 1.0
            },
            attributes: {
                status: 1, // Planned
                material: 'Beton',
                year: 2020,
                systemType: 'KS',
                subType: 'KS'
            }
        });
    }

    // 2. Pipes (not parsing in this quick mock, focusing on Nodes first for Coordinate Verification)
    // If user needs pipes, we can add edge parsing.
    console.log(`[Headless] Parsed ${nodes.size} nodes.`);
    return { nodes, edges };
}

async function run() {
    console.log('--- STARTING HEADLESS PIPELINE ---');

    // 1. READ
    if (!fs.existsSync(XML_PATH)) {
        console.error('XML File not found:', XML_PATH);
        // Fallback to mock data if file missing
        return;
    }
    const xml = fs.readFileSync(XML_PATH, 'utf-8');

    // 2. PARSE
    const { nodes, edges } = parseXmlHeadless(xml);

    // 3. EXPORT
    const writer = new IsybauToIfc(nodes, edges);
    const ifcString = writer.generate();

    const outPath = 'debug_output.ifc';
    fs.writeFileSync(outPath, ifcString);
    console.log(`[Headless] Wrote IFC to ${outPath} (${ifcString.length} bytes)`);

    // 4. VALIDATE
    const validator = new IfcValidator();
    const result = validator.validate(ifcString);
    validator.report(result);

    // 5. CHECK COORDINATES (Manual Audit)
    console.log('\n--- COORDINATE AUDIT ---');
    // Check if map conversion or offsets are reasonable
    // Writer logs origin
}

run();
