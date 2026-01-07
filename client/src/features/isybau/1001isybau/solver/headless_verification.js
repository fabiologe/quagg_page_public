
import { SwmmInputGenerator } from '../utils/SwmmInputGenerator.js';
import path from 'path';
import fs from 'fs';

async function runVerification() {
    console.log("Starting Verification of SWMM Translation logic...");

    // 1. Setup Mock Data
    const nodes = [
        ['TEST_SEALED', { id: 'TEST_SEALED', type: 'Standard', z: 10.0, coverZ: 12.0, canOverflow: false, x: 0, y: 0 }],
        ['TEST_OPEN', { id: 'TEST_OPEN', type: 'Standard', z: 10.0, coverZ: 12.0, canOverflow: true, x: 10, y: 0 }], // Default
        ['TEST_OUT', { id: 'TEST_OUT', type: 5, z: 9.0, x: 20, y: 0 }] // Outfall
    ];

    const edges = [
        ['EDGE_OFFSET', {
            id: 'EDGE_OFFSET',
            from: 'TEST_SEALED',
            to: 'TEST_OPEN',
            length: 10,
            roughness: 80,
            z1: 10.5, // Offset 0.5
            z2: 10.2, // Offset 0.2
            profile: { type: 0, height: 0.3 }
        }],
        ['EDGE_NORMAL', {
            id: 'EDGE_NORMAL',
            from: 'TEST_OPEN',
            to: 'TEST_OUT',
            length: 10,
            roughness: 80,
            profile: { type: 0, height: 0.3 }
        }]
    ];

    const areas = [
        {
            id: 'AREA_SPLIT',
            size: 1.0, // 1 ha
            runoffCoeff: 0.5,
            nodeId: 'TEST_OPEN',
            nodeId2: 'TEST_SEALED',
            splitRatio: 30, // 30% to Open, 70% to Sealed
            slope: 1
        }
    ];

    const nodesMap = new Map(nodes);
    const edgesMap = new Map(edges);
    const areasList = areas;

    // 2. Generate INP
    const inp = SwmmInputGenerator.generateInp(nodesMap, edgesMap, areasList, { duration: 1 });

    // 3. Verify Logic
    let errors = [];

    // Check Sealed Node (SurDepth = 100)
    // Line format: Name Elev MaxDepth InitDepth SurDepth Aponded
    const sealedLine = inp.match(/TEST_SEALED\s+\d+\.\d+\s+\d+\.\d+\s+\d+\s+(\d+\.\d+)/);
    if (!sealedLine) errors.push("TEST_SEALED not found in INP.");
    else {
        const surDepth = parseFloat(sealedLine[1]);
        if (surDepth < 99) errors.push(`TEST_SEALED SurDepth expected ~100.0, got ${surDepth}`);
        else console.log("PASS: TEST_SEALED has High SurDepth.");
    }

    // Check Open Node (SurDepth = 0)
    const openLine = inp.match(/TEST_OPEN\s+\d+\.\d+\s+\d+\.\d+\s+\d+\s+(\d+\.\d+)/);
    if (openLine) {
        const surDepth = parseFloat(openLine[1]);
        if (surDepth > 0.1) errors.push(`TEST_OPEN SurDepth expected 0, got ${surDepth}`);
        else console.log("PASS: TEST_OPEN has 0 SurDepth.");
    }

    // Check Offsets
    // CONDUITS: Name Node1 Node2 Length Roughness InOffset OutOffset
    // Regex slightly tricky due to spacing. Look for EDGE_OFFSET
    const edgeLine = inp.split('\n').find(l => l.startsWith('EDGE_OFFSET'));
    if (!edgeLine) errors.push("EDGE_OFFSET not found.");
    else {
        const parts = edgeLine.trim().split(/\s+/);
        // Indices: 0:Name, 1:N1, 2:N2, 3:Len, 4:Rough, 5:InOff, 6:OutOff
        const inOff = parseFloat(parts[5]);
        const outOff = parseFloat(parts[6]);

        if (Math.abs(inOff - 0.5) > 0.01) errors.push(`EDGE_OFFSET InOffset expected 0.5, got ${inOff}`);
        else console.log("PASS: InOffset correct.");

        if (Math.abs(outOff - 0.2) > 0.01) errors.push(`EDGE_OFFSET OutOffset expected 0.2, got ${outOff}`);
        else console.log("PASS: OutOffset correct.");
    }

    // Check Subcatchment Split
    // Expect AREA_SPLIT and AREA_SPLIT_2
    const sub1 = inp.match(/AREA_SPLIT\s+/);
    const sub2 = inp.match(/AREA_SPLIT_2\s+/);

    if (sub1 && sub2) console.log("PASS: Catchment Splitting produced two areas.");
    else errors.push("Catchment Splitting failed. Missing one or both subcatchments.");

    // Check Areas Correctness
    if (sub1) {
        // Area is index 3? Name Gage Outlet Area
        const line = inp.split('\n').find(l => l.startsWith('AREA_SPLIT ')); // Space to avoid matching _2
        const parts = line.trim().split(/\s+/);
        const areaVal = parseFloat(parts[3]);
        // 1.0 * 0.3 = 0.3
        if (Math.abs(areaVal - 0.3) > 0.01) errors.push(`AREA_SPLIT size expected 0.3, got ${areaVal}`);
        else console.log("PASS: Split Area 1 size correct.");
    }
    if (sub2) {
        const line = inp.split('\n').find(l => l.startsWith('AREA_SPLIT_2'));
        const parts = line.trim().split(/\s+/);
        const areaVal = parseFloat(parts[3]);
        // 1.0 * 0.7 = 0.7
        if (Math.abs(areaVal - 0.7) > 0.01) errors.push(`AREA_SPLIT_2 size expected 0.7, got ${areaVal}`);
        else console.log("PASS: Split Area 2 size correct.");
    }


    if (errors.length > 0) {
        console.error("VERIFICATION FAILED:");
        errors.forEach(e => console.error("- " + e));
        process.exit(1);
    } else {
        console.log("ALL CHECKS PASSED!");
    }
}

runVerification().catch(console.error);
