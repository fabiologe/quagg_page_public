
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { SwmmOutParser } from './SwmmOutParser.js';
import { RptParser } from './swmm/RptParser.js';
import { ResultsAssembler } from './swmm/ResultsAssembler.js';
import createSwmmModule from './swmm_solver.js';

let Module = null;
let initPromise = null;

// Initialize Module (guarded against concurrent calls: module-load auto-init + INIT command)
function initModule() {
    if (!initPromise) {
        initPromise = (async () => {
            console.log("Initializing SWMM Wasm Module in Worker...");
            Module = await createSwmmModule({
                print: (text) => console.log("[SWMM_OUT]", text),
                printErr: (text) => console.error("[SWMM_ERR]", text)
            });
            console.log("SWMM Module Initialized.");
            self.postMessage({ command: 'INIT_SUCCESS' });
        })().catch(err => {
            console.error("Failed to initialize SWMM Module:", err);
            initPromise = null; // allow retry
            self.postMessage({ command: 'ERROR', message: err.message });
            throw err;
        });
    }
    return initPromise;
}

// Helper to run simulation
async function runSimulation(data) {
    try {
        await initModule();

        const { nodes, edges, areas } = data;

        // Create a Store Adapter for SwmmBuilder
        // SwmmBuilder expects 'getAllNodes' and 'getAllEdges' getters
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

        // 1. Text Report (Summary Tables)
        let reportData = "";
        if (Module.FS.analyzePath(reportPath).exists) {
            reportData = Module.FS.readFile(reportPath, { encoding: 'utf8' });
        } else {
            console.error("No report file found!");
        }

        // Lookup maps of the input network (parsers/assembler expect plain objects)
        let nodesMap = {};
        let edgesMap = {};

        if (nodes instanceof Map) {
            nodes.forEach((n, id) => nodesMap[id] = n);
        } else if (Array.isArray(nodes)) {
            nodes.forEach(n => nodesMap[n.id] = n);
        } else {
            nodesMap = { ...nodes };
        }

        if (edges instanceof Map) {
            edges.forEach((e, id) => edgesMap[id] = e);
        } else if (Array.isArray(edges)) {
            edges.forEach(e => edgesMap[e.id] = e);
        } else {
            edgesMap = { ...edges };
        }

        const rptResult = RptParser.parse(reportData, nodesMap, edgesMap);

        // 2. Binary Output (Time Series)
        let timeSeries = [];
        try {
            if (Module.FS.analyzePath(outPath).exists) {
                const outBuffer = Module.FS.readFile(outPath); // Uint8Array
                const parser = new SwmmOutParser(outBuffer);
                timeSeries = parser.parse();
                console.log(`Parsed ${timeSeries.length} time steps from binary output.`);
            } else {
                console.warn("No binary output file found for Time Series.");
                warnings.push("Keine Zeitreihen-Datei (.out) vorhanden — Ganglinien nicht verfügbar.");
            }
        } catch (binErr) {
            console.error("Failed to parse binary output:", binErr);
            timeSeries = [];
            warnings.push("Fehler beim Lesen der Zeitreihen (.out Datei): " + binErr.message + " — Ganglinien werden nicht angezeigt.");
        }

        // 3. Merge into the single results contract
        const assembled = ResultsAssembler.assemble({
            rptResult,
            timeSeries,
            inputNodes: nodesMap,
            inputEdges: edgesMap
        });

        self.postMessage({
            command: 'COMPLETE',
            results: {
                report: reportData,
                input: inpString,
                warnings: [...warnings, ...assembled.warnings],
                nodes: assembled.nodes,
                edges: assembled.edges,
                subcatchments: assembled.subcatchments,
                systemStats: assembled.systemStats,
                timeSeries: assembled.timeSeries
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
        initModule().catch(() => { /* ERROR already posted */ });
    } else if (command === 'START' || command === 'RUN') {
        await runSimulation(data);
    }
};

initModule().catch(() => { /* ERROR already posted */ });
