
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { SwmmOutParser } from './SwmmOutParser.js';
import createSwmmModule from './swmm_solver.js';

let Module = null;
let isInitialized = false;

// Initialize Module
async function initModule() {
    if (Module) return;
    try {
        console.log("Initializing SWMM Wasm Module in Worker...");
        Module = await createSwmmModule({
            print: (text) => console.log("[SWMM_OUT]", text),
            printErr: (text) => console.error("[SWMM_ERR]", text)
        });
        isInitialized = true;
        console.log("SWMM Module Initialized.");
        self.postMessage({ command: 'INIT_SUCCESS' });
    } catch (err) {
        console.error("Failed to initialize SWMM Module:", err);
        self.postMessage({ command: 'ERROR', message: err.message });
    }
}

self.onmessage = async (e) => {
    const { command, data } = e.data;

    if (command === 'INIT') {
        await initModule();
    } else if (command === 'RUN') {
        if (!Module) {
            self.postMessage({ command: 'ERROR', message: 'SWMM Module not initialized' });
            return;
        }
        runSimulation(data);
    }
};

// Helper to run simulation
async function runSimulation(data) {
    if (!isInitialized || !Module) {
        await initModule();
    }

    try {
        const { nodes, edges, areas } = data;

        // Create a Store Adapter for SwmmBuilder
        // SwmmBuilder expects 'getAllNodes' and 'getAllEdges' methods
        const storeAdapter = {
            get getAllNodes() {
                if (Array.isArray(nodes)) return nodes;
                if (nodes instanceof Map) return Array.from(nodes.values());
                return Object.values(nodes);
            },
            get getAllEdges() {
                if (Array.isArray(edges)) return edges;
                if (edges instanceof Map) return Array.from(edges.values());
                return Object.values(edges);
            },
            areas: areas || []
        };

        console.log("Generating INP from data... with options", data.options);

        const builder = new SwmmBuilder(storeAdapter);
        if (data.options) builder.setOptions(data.options);

        const result = builder.build();

        // Handle new signature ({ inpContent, warnings }) or old (string)
        let inpString = "";
        let warnings = [];

        if (typeof result === 'object' && result.inpContent) {
            inpString = result.inpContent;
            warnings = result.warnings || [];
        } else {
            inpString = result;
        }

        // Write input
        const inputPath = '/input.inp';
        const reportPath = '/report.rpt';
        const outPath = '/out.out';

        Module.FS.writeFile(inputPath, inpString);

        console.log("Starting SWMM Run...");
        const runFn = Module.cwrap('swmm_run', 'number', ['string', 'string', 'string']);
        const res = runFn(inputPath, reportPath, outPath);

        console.log(`SWMM finished with code ${res} `);

        // Parse Results
        // 1. Text Report (Summary Tables)
        let reportData = "";
        if (Module.FS.analyzePath(reportPath).exists) {
            reportData = Module.FS.readFile(reportPath, { encoding: 'utf8' });
        } else {
            console.error("No report file found!");
        }

        // Parse detailed results, passing input data for geometry calculations
        // Convert arrays/maps to Map for lookup if needed
        let nodesMap = new Map();
        let edgesMap = new Map();

        if (nodes instanceof Map) nodesMap = nodes;
        else if (Array.isArray(nodes)) nodes.forEach(n => nodesMap.set(n.id, n));
        else Object.values(nodes).forEach(n => nodesMap.set(n.id, n));

        if (edges instanceof Map) edgesMap = edges;
        else if (Array.isArray(edges)) edges.forEach(e => edgesMap.set(e.id, e));
        else Object.values(edges).forEach(e => edgesMap.set(e.id, e));

        const detailedResults = parseDetailedResults(reportData, nodesMap, edgesMap);

        // 2. Binary Output (Time Series)
        let timeSeries = [];
        try {
            if (Module.FS.analyzePath(outPath).exists) {
                const outBuffer = Module.FS.readFile(outPath); // Uint8Array
                const parser = new SwmmOutParser(outBuffer);
                timeSeries = parser.parse();
                console.log(`Parsed ${timeSeries.length} time steps from binary output.`);

                // Post-process: Calculate Node Outflow (not provided by SWMM binary)
                // Iterate through all steps and sum outgoing flow from connected edges
                if (timeSeries.length > 0) {
                    timeSeries.forEach(step => {
                        // Initialize outflow
                        for (const nodeId in step.nodes) {
                            step.nodes[nodeId].outflow = 0;
                        }

                        // Add Edge Flows
                        edgesMap.forEach(edge => {
                            const resEdge = step.edges[edge.id];
                            if (resEdge && resEdge.signedQ !== undefined) {
                                const flow = resEdge.signedQ;
                                const fromId = edge.fromNodeId || edge.from;
                                const toId = edge.toNodeId || edge.to;

                                if (flow > 0) {
                                    // Normal direction: Leaves From
                                    if (step.nodes[fromId]) step.nodes[fromId].outflow += flow;
                                } else if (flow < 0) {
                                    // Reverse direction: Leaves To
                                    if (step.nodes[toId]) step.nodes[toId].outflow += Math.abs(flow);
                                }
                            }
                        });
                    });
                }
            } else {
                console.warn("No binary output file found for Time Series.");
            }
        } catch (binErr) {
            console.error("Failed to parse binary output:", binErr);
            warnings.push("Fehler beim Lesen der Zeitreihen (.out Datei). Detailansicht evtl. unvollständig.");
        }

        self.postMessage({
            command: 'COMPLETE',
            results: {
                report: reportData,
                input: inpString,
                warnings: warnings,
                massBalance: detailedResults.massBalance,
                nodes: detailedResults.nodes,
                edges: detailedResults.edges,
                subcatchments: detailedResults.subcatchments,
                systemStats: detailedResults.systemStats,
                timeSeries: timeSeries
            }
        });

    } catch (err) {
        console.error("Simulation Error:", err);
        self.postMessage({ command: 'ERROR', message: err.message });
    }
}
/**
 * Parses summary tables from SWMM report (.rpt).
 */
function parseDetailedResults(report, inputNodesMap, inputEdgesMap) {
    const nodes = {};
    const edges = {};
    const subcatchments = {};
    const systemStats = {
        runoff: {},
        flow: {}
    };

    // Helper: Calculate Full Flow Capacity (Manning)
    const calculateCapacity = (id) => {
        const edge = inputEdgesMap.get(id);
        if (!edge) return 0;

        const fromId = edge.fromNodeId || edge.from;
        const toId = edge.toNodeId || edge.to;
        const from = inputNodesMap.get(fromId);
        const to = inputNodesMap.get(toId);
        if (!from || !to) return 0;

        // Slope Calculation
        // Use edge.z1/z2 if available, else node.z
        let z1 = (edge.z1 !== undefined && edge.z1 !== null) ? edge.z1 : from.z;
        let z2 = (edge.z2 !== undefined && edge.z2 !== null) ? edge.z2 : to.z;
        // Default to 0 if missing
        if (z1 === undefined) z1 = 0;
        if (z2 === undefined) z2 = 0;

        const len = edge.length > 0 ? edge.length : 10;
        let slope = Math.abs(z1 - z2) / len;
        if (slope < 0.001) slope = 0.001; // Minimum slope

        // Roughness: Handle Strickler (Kst) vs Manning (n)
        // Store often has Kst (~50-100), but Manning formula needs n (~0.01)
        let val = edge.roughness > 0 ? edge.roughness : 0;
        let n = 0.013; // Default (Concrete n)

        if (val > 1.0) {
            // Assume Strickler (kst) -> Convert to Manning
            n = 1.0 / val;
        } else if (val > 0) {
            // Assume Manning (n)
            n = val;
        }

        // Geometry
        const p = edge.profile || { type: 0, height: 0, width: 0 };
        let h = p.height || 0;
        let w = p.width || 0;
        let type = p.type;

        // Fallback: If geometry is missing/invalid (or tiny < 1cm), assume DN1000 Circle (1.0m)
        // This matches user preference to show a "standard" large capacity rather than 0 or error
        if (h < 0.01) {
            h = 1.0;
            w = 1.0;
            type = 0; // Force Circular
        }
        // Specific check for Rect/Trapez missing width
        if ((type === 3 || type === 'Rechteckprofil' || type === 8 || type === 4 || type === 'Trapezprofil') && w <= 0) {
            // Fallback to DN1000 Circle logic if specific profile is broken
            h = 1.0;
            type = 0;
        }

        let A = 0;
        let R = 0;

        if (type == 0 || type === 'Circular' || type === 'Kreisprofil') {
            const D = h;
            A = Math.PI * Math.pow(D / 2, 2);
            const P = Math.PI * D;
            R = D / 4;
        } else if (type == 3 || type === 'Rechteckprofil') {
            A = w * h;
            const P = 2 * w + 2 * h;
            R = A / P;
        } else if (type == 1 || type === 'Egg' || type === 'Eiprofil') {
            // ATV A110 Standard Egg Approximation
            A = 0.5105 * Math.pow(h, 2);
            R = 0.1931 * h;
        } else if (type == 8 || type == 4 || type === 'Trapezprofil') {
            // Trapez Open
            const s = 1.5; // Slope 1:1.5
            const topW = w + 2 * (s * h);
            A = ((w + topW) / 2) * h;
            const side = Math.sqrt(Math.pow(h, 2) + Math.pow(s * h, 2));
            const P = w + 2 * side;
            R = A / P;
        } else {
            // Default Circle DN1000 for unknown types
            const D = 1.0;
            A = Math.PI * Math.pow(D / 2, 2);
            R = D / 4;
        }   // Manning Equation: Q = (1/n) * A * R^(2/3) * S^(1/2)
        const Q = (1 / n) * A * Math.pow(R, 2 / 3) * Math.pow(slope, 0.5);
        return Q * 1000; // Convert m³/s to L/s
    };

    // Copy existing parseTable helper here or assume it's kept? 
    // I must preserve the existing parseTable helper since I'm replacing the block containing it.
    // The previous tool call view showed parseTable inside parseDetailedResults.

    // Helper to parse table
    const parseTable = (headerRegex, rowCallback, maxCols) => {
        const lines = report.split('\n');
        let inTable = false;
        let separatorCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (!inTable) {
                if (headerRegex.test(line)) {
                    inTable = true;
                    separatorCount = 0;
                }
            } else {
                if (line.startsWith('---')) {
                    separatorCount++;
                    continue;
                }
                if (separatorCount < 2) continue;
                if (line === '') {
                    inTable = false;
                    continue;
                }
                if (line.startsWith('***') || line.startsWith('Analysis begun')) {
                    inTable = false;
                    continue;
                }
                const parts = line.split(/\s+/);
                if (parts.length > 2) {
                    rowCallback(parts);
                }
            }
        }
    };

    // Subcatchment, Node Depth, Node Inflow, Node Flooding parsers...
    // (I will keep them brief in this replacement to avoid huge diff, 
    // but I must include them or the file will be truncated. 
    // Actually, I can target just the Link Flow Summary block if I am careful with Start/End lines.
    // But I modified the Function Signature of `parseDetailedResults`.
    // So I must replace the FUNCTION START and the CALL SITE.

    // Strategy: Replace `runSimulation` call site and `parseDetailedResults` definition header.
    // And Replace Link Flow Summary Logic.

    // I will do two edits to be safe and clean.
    // Edit 1: Update runSimulation and parseDetailedResults signature + Link Logic.
    // Actually `parseDetailedResults` is fully contained in lines 148-377.
    // I should replace the whole function to perform the inclusion of calculateCapacity.

    // ... [Content of Subcatchment/Node parsers preserved] ...

    // RE-INJECTING PREVIOUS PARSERS to ensure validity.

    // --- 1. Subcatchment Runoff Summary ---
    parseTable(/Subcatchment Runoff Summary/, (parts) => {
        const id = parts[0];
        if (!subcatchments[id]) subcatchments[id] = {};
        subcatchments[id].precip = parseFloat(parts[1]);
        subcatchments[id].totalRunoffMm = parseFloat(parts[7]);
        subcatchments[id].totalRunoffVol = parseFloat(parts[8]);
        subcatchments[id].peakRunoff = parseFloat(parts[9]) * 1000;
    });

    // --- 2. Node Depth Summary ---
    parseTable(/Node Depth Summary/, (parts) => {
        const id = parts[0];
        const maxDepth = parseFloat(parts[3]);
        const avgDepth = parseFloat(parts[2]);
        if (!isNaN(maxDepth)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].maxDepth = maxDepth;
            nodes[id].avgDepth = isNaN(avgDepth) ? 0 : avgDepth;
        }
    });

    // --- 3. Node Inflow Summary ---
    parseTable(/Node Inflow Summary/, (parts) => {
        const id = parts[0];
        const val = parseFloat(parts[3]);
        if (!isNaN(val)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].maxInflow = val * 1000;
        }
    });

    // --- 4. Node Flooding Summary ---
    parseTable(/Node Flooding Summary/, (parts) => {
        const id = parts[0];
        let offset = 0;
        const isPart3Day = /^\d+$/.test(parts[3]) && !parts[3].includes(':');
        const isPart4Time = parts[4] && parts[4].includes(':');
        if (isPart3Day && isPart4Time) offset = 1;

        const vol = parseFloat(parts[4 + offset]);
        const depth = parseFloat(parts[5 + offset]);
        if (!isNaN(vol)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].pondedVolume = vol;
            nodes[id].maxPondedDepth = depth;
            nodes[id].overflow = true;
        }
    });

    // --- 5. Link Flow Summary (UPDATED) ---
    parseTable(/(Link|Conduit) Flow Summary/, (parts) => {
        const id = parts[0];

        let offset = 0;
        const isPart3Day = /^\d+$/.test(parts[3]) && !parts[3].includes(':');
        const isPart4Time = parts[4] && parts[4].includes(':');
        if (isPart3Day && isPart4Time) offset = 1;

        const maxFlowIndex = 2;
        const maxVelIndex = 4 + offset;
        const ratioIndex = 5 + offset;

        const maxFlow = parseFloat(parts[maxFlowIndex]); // CMS
        const maxVel = parseFloat(parts[maxVelIndex]);

        // Calculated Capacity handling
        const calculatedCap = calculateCapacity(id);
        const maxFlowLs = maxFlow * 1000;

        if (!isNaN(maxFlow)) {
            if (!edges[id]) edges[id] = {};
            edges[id].maxFlow = maxFlowLs;
            edges[id].maxVelocity = isNaN(maxVel) ? 0 : maxVel;

            // Allow override of '0' capacity if we calculated it
            edges[id].capacity = calculatedCap;

            // Recalculate utilization
            if (calculatedCap > 0.01) {
                edges[id].utilization = (maxFlowLs / calculatedCap) * 100;
            } else {
                edges[id].utilization = 0;
            }
        }
    });

    // --- 5.1 Outfall Loading Summary ---
    // Parses Total Outflow for Outfall Nodes
    parseTable(/Outfall Loading Summary/, (parts) => {
        const id = parts[0];
        // Col 1: Flow Freq, Col 2: Avg Flow, Col 3: Max Flow, Col 4: Total Volume
        // Indices might vary if Date is present? Outfall table usually standard.
        // Standard: Name, Flow Pcnt, Avg Flow, Max Flow, Total Vol
        // indices: 0, 1, 2, 3, 4
        // Volume is usually in 10^6 ltr or m^3 depending on units. 
        // With CMS, Vol is m^3.
        const vol = parseFloat(parts[4]);

        if (!isNaN(vol)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].isOutfall = true;
            nodes[id].totalOutflowVolume = vol;
        }
    });

    // --- 6. Stats Extraction ---
    // (Preserve existing logic for stats)
    const extractStat = (label, regex) => {
        const match = report.match(regex);
        return match ? parseFloat(match[1]) : 0;
    };
    systemStats.runoff.precip = extractStat("Total Precipitation", /Total Precipitation \.+ \s+([-\d\.]+)/);
    systemStats.runoff.evap = extractStat("Evaporation Loss", /Evaporation Loss \.+ \s+([-\d\.]+)/);
    systemStats.runoff.infil = extractStat("Infiltration Loss", /Infiltration Loss \.+ \s+([-\d\.]+)/);
    systemStats.runoff.runoff = extractStat("Surface Runoff", /Surface Runoff \.+ \s+([-\d\.]+)/);
    systemStats.runoff.error = extractStat("Continuity Error", /Continuity Error \(%\) \.+ \s+([-\d\.]+)/);

    // Flow Routing parser helper
    const parseStatsBlock = (blockHeader, targetObj) => {
        const index = report.indexOf(blockHeader);
        if (index === -1) return;
        const block = report.substring(index);
        const lines = block.split('\n');
        for (let line of lines) {
            if (line.includes('Total Precipitation')) targetObj.precipVol = parseFloat(line.split(/\s+/).reverse()[1]);
            if (line.includes('Surface Runoff')) targetObj.runoffVol = parseFloat(line.split(/\s+/).reverse()[1]);
            if (line.includes('Wet Weather Inflow')) targetObj.inflowVol = parseFloat(line.split(/\s+/).reverse()[0]);
            if (line.includes('External Outflow')) targetObj.outflowVol = parseFloat(line.split(/\s+/).reverse()[0]);
            if (line.includes('Flooding Loss')) targetObj.floodingVol = parseFloat(line.split(/\s+/).reverse()[0]);
            if (line.includes('Final Stored Volume')) targetObj.storedVol = parseFloat(line.split(/\s+/).reverse()[0]);
            if (line.includes('Continuity Error')) {
                targetObj.error = parseFloat(line.match(/([-\d\.]+)$/)[1]);
                break;
            }
        }
    };
    parseStatsBlock('Runoff Quantity Continuity', systemStats.runoff);
    parseStatsBlock('Flow Routing Continuity', systemStats.flow);

    return { nodes, edges, subcatchments, systemStats, massBalance: systemStats.flow };
}

self.onmessage = async (e) => {
    const { command, data } = e.data;
    if (command === 'INIT') {
        await initModule();
    } else if (command === 'START' || command === 'RUN') {
        await runSimulation(data);
    }
};

initModule();
