
import { SwmmInputGenerator } from './SwmmInputGenerator.js';
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

        // Convert Maps to Maps if they came as Arrays (Worker serialization)
        const nodesMap = (nodes instanceof Map) ? nodes : new Map(nodes);
        const edgesMap = (edges instanceof Map) ? edges : new Map(edges);
        // areas is array already sanitized

        console.log("Generating INP from data... with options", data.options);
        console.log("Generating INP from data... with options", data.options);
        const result = SwmmInputGenerator.generateInp(nodesMap, edgesMap, areas, data.options);

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

        const detailedResults = parseDetailedResults(reportData);

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
            }
        } catch (binErr) {
            console.error("Failed to parse binary output:", binErr);
            warnings.push("Fehler beim Lesen der Zeitreihen (.out Datei). Detailansicht evtl. unvollständig.");
        }

        self.postMessage({
            command: 'COMPLETE',
            results: {
                report: reportData,
                input: inpString, // Added input file content
                warnings: warnings, // Pass warnings to frontend
                massBalance: detailedResults.massBalance, // Updated structure
                nodes: detailedResults.nodes,
                edges: detailedResults.edges,
                subcatchments: detailedResults.subcatchments,
                systemStats: detailedResults.systemStats,
                timeSeries: timeSeries // Full Binary Time Series
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
function parseDetailedResults(report) {
    const nodes = {};
    const edges = {};
    const subcatchments = {};
    const systemStats = {
        runoff: {},
        flow: {}
    };

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

    // --- 1. Subcatchment Runoff Summary ---
    // Col 0: Name, 1: Precip(mm), 7: TotalRunoff(mm), 8: TotalRunoff(10^6 ltr), 9: PeakRunoff(CMS)
    parseTable(/Subcatchment Runoff Summary/, (parts) => {
        const id = parts[0];
        if (!subcatchments[id]) subcatchments[id] = {};
        subcatchments[id].precip = parseFloat(parts[1]);
        subcatchments[id].totalRunoffMm = parseFloat(parts[7]);
        subcatchments[id].totalRunoffVol = parseFloat(parts[8]); // 10^6 ltr
        subcatchments[id].peakRunoff = parseFloat(parts[9]) * 1000; // CMS -> L/s
    });

    // --- 2. Node Depth Summary ---
    // Col 0: Node, 1: Type, 2: Avg Depth, 3: Max Depth, 4: Max HGL, [Day], Time
    parseTable(/Node Depth Summary/, (parts) => {
        const id = parts[0];

        // Offset Logic: Check Cols 5,6 for Day,Time
        // If 5 is Day & 6 is Time -> Offset 1 (Day present)
        // Else Default offset 0
        // Indices not affected because MaxDepth is @ 3 (before Day/Time)
        // Wait, MaxDepth is at 3. The varying columns are AFTER 4.
        // So MaxDepth is Safe?
        // Node Type Avg Max HGL Day Time
        // 0    1    2   3   4   5   6

        // Parse Value
        const maxDepth = parseFloat(parts[3]);
        const avgDepth = parseFloat(parts[2]);

        if (!isNaN(maxDepth)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].maxDepth = maxDepth;
            nodes[id].avgDepth = isNaN(avgDepth) ? 0 : avgDepth;
        }
    });

    // --- 3. Node Inflow Summary ---
    // Col 0: Node, 1: Type, 2: MaxLat, 3: MaxTotal, [Day], Time
    parseTable(/Node Inflow Summary/, (parts) => {
        const id = parts[0];
        // MaxTotal is @ 3. Safe from Offset?
        // Node Type MaxLat MaxTotal Day Time
        // 0    1    2      3        4   5
        const val = parseFloat(parts[3]);
        if (!isNaN(val)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].maxInflow = val * 1000; // CMS -> L/s
        }
    });

    // --- 4. Node Flooding Summary ---
    // Col 0: Node, 1: Hours, 2: MaxRate, [Day], Time, TotalVol, MaxDepth
    parseTable(/Node Flooding Summary/, (parts) => {
        const id = parts[0];

        let offset = 0;
        // Check Day @ 3, Time @ 4
        // If Day Present: 3 is Day, 4 is Time.
        // If Day Absent: 3 is Time.
        const isPart3Day = /^\d+$/.test(parts[3]) && !parts[3].includes(':');
        const isPart4Time = parts[4] && parts[4].includes(':');

        if (isPart3Day && isPart4Time) {
            offset = 1;
        }

        // Indices:
        // TotalVol: 4 + offset
        // MaxDepth: 5 + offset

        const vol = parseFloat(parts[4 + offset]);
        const depth = parseFloat(parts[5 + offset]);

        if (!isNaN(vol)) {
            if (!nodes[id]) nodes[id] = {};
            nodes[id].pondedVolume = vol;
            nodes[id].maxPondedDepth = depth;
            nodes[id].overflow = true;
        }
    });

    // --- 5. Link Flow Summary ---
    // Col 0: Link, 2: Max Flow, 5: Max Vel, 7: Max/Full
    parseTable(/(Link|Conduit) Flow Summary/, (parts) => {
        const id = parts[0];

        // Detect Offset: If part[3] is Day (integer) and part[4] is Time (:), we have an extra Day column.
        let offset = 0;
        const isPart3Day = /^\d+$/.test(parts[3]) && !parts[3].includes(':');
        const isPart4Time = parts[4] && parts[4].includes(':');

        if (isPart3Day && isPart4Time) {
            offset = 1;
        }

        // Columns: 
        // 0: Link, 1: Type, 2: MaxFlow
        // 3(+offset): Time
        // 4(+offset): MaxVel
        // 5(+offset): Max/Full (Ratio)
        // 6(+offset): MaxDepth

        const maxFlowIndex = 2;
        const maxVelIndex = 4 + offset;
        const ratioIndex = 5 + offset;

        const maxFlow = parseFloat(parts[maxFlowIndex]); // CMS
        const maxVel = parseFloat(parts[maxVelIndex]);
        const ratio = parseFloat(parts[ratioIndex]);

        if (!isNaN(maxFlow)) {
            if (!edges[id]) edges[id] = {};
            edges[id].maxFlow = maxFlow * 1000; // CMS -> L/s
            edges[id].maxVelocity = isNaN(maxVel) ? 0 : maxVel;
            edges[id].utilization = isNaN(ratio) ? 0 : (ratio * 100); // Ratio 0-1 -> %

            // Calculate Capacity (Qvoll)
            // Ratio = MaxFlow / Qvoll  => Qvoll = MaxFlow / Ratio
            // If Ratio is 0, we can't determine it (Dry pipe).
            if (ratio > 0.001) {
                // maxFlow is CMS, so result is CMS. Convert to L/s (*1000)
                // edges[id].maxFlow is already L/s.
                edges[id].capacity = edges[id].maxFlow / ratio;
            } else {
                edges[id].capacity = 0; // Unknown/Dry
            }
        }
    });

    // --- 6. Stats Extraction (Regex based for single values) ---
    const extractStat = (label, regex) => {
        const match = report.match(regex);
        return match ? parseFloat(match[1]) : 0;
    };

    // Runoff Quantity Continuity
    systemStats.runoff.precip = extractStat("Total Precipitation", /Total Precipitation \.+ \s+([-\d\.]+)/); // Vol ha-m
    systemStats.runoff.evap = extractStat("Evaporation Loss", /Evaporation Loss \.+ \s+([-\d\.]+)/);
    systemStats.runoff.infil = extractStat("Infiltration Loss", /Infiltration Loss \.+ \s+([-\d\.]+)/);
    systemStats.runoff.runoff = extractStat("Surface Runoff", /Surface Runoff \.+ \s+([-\d\.]+)/);
    systemStats.runoff.error = extractStat("Continuity Error", /Continuity Error \(%\) \.+ \s+([-\d\.]+)/);

    // Flow Routing Continuity
    // Use regex to find the second block or specific labels
    // Note: Regex might match the start of the line.
    // Flow Routing block starts after Runoff Quantity block. 
    // We can split report or just use specific unique context if possible.
    // "Dry Weather Inflow .......         0.000"

    // Helper to find value by Label across the whole file might pick first occurrence.
    // Runoff Quantity and Flow Routing have some unique labels but "Continuity Error" is in both.
    // Let's implement a smarter line seeker for stats.

    const parseStatsBlock = (blockHeader, targetObj) => {
        const index = report.indexOf(blockHeader);
        if (index === -1) return;
        const block = report.substring(index);
        const lines = block.split('\n');

        for (let line of lines) {
            if (line.includes('Total Precipitation')) targetObj.precipVol = parseFloat(line.split(/\s+/).reverse()[1]); // Volume
            if (line.includes('Surface Runoff')) targetObj.runoffVol = parseFloat(line.split(/\s+/).reverse()[1]);

            // Flow Routing specific
            if (line.includes('Wet Weather Inflow')) targetObj.inflowVol = parseFloat(line.split(/\s+/).reverse()[0]); // 10^6 ltr
            if (line.includes('External Outflow')) targetObj.outflowVol = parseFloat(line.split(/\s+/).reverse()[0]);
            if (line.includes('Flooding Loss')) targetObj.floodingVol = parseFloat(line.split(/\s+/).reverse()[0]);
            if (line.includes('Final Stored Volume')) targetObj.storedVol = parseFloat(line.split(/\s+/).reverse()[0]);

            if (line.includes('Continuity Error')) {
                targetObj.error = parseFloat(line.match(/([-\d\.]+)$/)[1]);
                break; // End of block usually
            }
        }
    };

    parseStatsBlock('Runoff Quantity Continuity', systemStats.runoff);
    parseStatsBlock('Flow Routing Continuity', systemStats.flow);

    return { nodes, edges, subcatchments, systemStats, massBalance: systemStats.flow }; // massBalance alias for compat
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
