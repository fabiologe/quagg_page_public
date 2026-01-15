
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
        // Parse detailed results, passing input data for geometry calculations
        // Convert arrays/maps to Plain Objects for lookup (Parser expects Objects, not Maps)
        let nodesMap = {};
        let edgesMap = {};

        if (nodes instanceof Map) {
            nodes.forEach((n, id) => nodesMap[id] = n);
        } else if (Array.isArray(nodes)) {
            nodes.forEach(n => nodesMap[n.id] = n);
        } else {
            // Already object
            nodesMap = { ...nodes };
        }

        if (edges instanceof Map) {
            edges.forEach((e, id) => edgesMap[id] = e);
        } else if (Array.isArray(edges)) {
            edges.forEach(e => edgesMap[e.id] = e);
        } else {
            edgesMap = { ...edges };
        }

        const detailedResults = SwmmOutParser.parseReport(reportData, nodesMap, edgesMap);

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


self.onmessage = async (e) => {
    const { command, data } = e.data;
    if (command === 'INIT') {
        await initModule();
    } else if (command === 'START' || command === 'RUN') {
        await runSimulation(data);
    }
};

initModule();
