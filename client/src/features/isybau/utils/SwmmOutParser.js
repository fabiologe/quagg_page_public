/**
 * Parses SWMM 5.1/5.2 binary output file (.out)
 * Reference: SWMM 5 Interface Guide (and OpenWaterAnalytics/swmm-js)
 */
export class SwmmOutParser {
    constructor(buffer) {
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.offset = 0;
        this.encoder = new TextDecoder('utf-8');
    }

    readInt32() {
        const val = this.view.getInt32(this.offset, true); // Little Endian
        this.offset += 4;
        return val;
    }

    readFloat32() {
        const val = this.view.getFloat32(this.offset, true);
        this.offset += 4;
        return val;
    }

    readDouble() { // Float64
        const val = this.view.getFloat64(this.offset, true);
        this.offset += 8;
        return val;
    }

    // SWMM binary file starts at end with offset to start
    // But usually we read normally:
    // Header -> ID Names -> Properties -> Results.
    // The Trailer contains the offset to the START of the results. 
    // And number of periods.

    // We will scan sequentially.
    // Magic Number check: 516114522 (at start)

    parse() {
        this.offset = 0;
        const magic1 = this.readInt32();
        if (magic1 !== 516114522) {
            throw new Error("Invalid SWMM Output File: Bad Magic Number");
        }

        const version = this.readInt32();
        const flowUnits = this.readInt32(); // 0=CFS, 1=GPM, 2=MGD, 3=CMS, 4=LPS, 5=MLD
        const numSubcatch = this.readInt32();
        const numNodes = this.readInt32();
        const numLinks = this.readInt32();
        const numPolluts = this.readInt32();

        // Object Counts
        // Subcatchments
        // Nodes
        // Links
        // Pollutants

        // Read IDs
        // IDs are stored as: [Int32 CharCount] [String Bytes] for each.
        // BUT: Wait, documentation says:
        // "SUBCATCH Names... NODE Names... LINK Names... POLLUT Names..."
        // Each ID is fixed length? No, usually length-prefixed.

        const readId = () => {
            const len = this.readInt32();
            const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, len);
            this.offset += len;
            return this.encoder.decode(bytes);
        };

        const subcatchIds = [];
        for (let i = 0; i < numSubcatch; i++) subcatchIds.push(readId());

        const nodeIds = [];
        for (let i = 0; i < numNodes; i++) nodeIds.push(readId());

        const linkIds = [];
        for (let i = 0; i < numLinks; i++) linkIds.push(readId());

        const pollutIds = [];
        for (let i = 0; i < numPolluts; i++) pollutIds.push(readId());

        console.log(`SWMM Parser IDs Read: Subs=${numSubcatch}, Nodes=${numNodes}, Links=${numLinks}`);
        if (nodeIds.length > 0) console.log(`Sample Node ID: ${nodeIds[0]}`);

        // Obj Properties (Codes/Indices)
        // Saved as Int32: 
        // Subcatch props: 1 record per subcatchment. Record size = (numSubcatchProps) * 4?
        // Actually, the structure is:
        // Input Variables specific to type.
        // Subcatch: Area(1)
        // Node: Type(1), Invert(1), MaxDepth(1)
        // Link: Type(1), Z1(1), Z2(1), MaxDepth(1), Length(1)

        // We skip properties to get to Results.
        // How many bytes to skip?
        // Subcatch Properties: numSubcatch * 1 * 4 bytes (Area is float32? No, SWMM floats are usually 4 bytes)
        // Let's assume standard layout.

        // Subcatchment Area (1 Float)
        this.offset += numSubcatch * 4;

        // Node Properties (Type Int32, Invert Float, MaxDepth Float) -> 3 * 4 bytes per node
        this.offset += numNodes * 3 * 4;

        // Alignment Strategy: SCAN for System Variables Signature
        // SysVars (15) is always last block before Results.
        // Signature: [15, 0, 0, 0] followed by [0, 0, 0, 0], [1, 0, 0, 0] ... [14, 0, 0, 0]
        // This is extremely unique sequence of 16 integers.

        let found = false;
        let scanOffset = 28; // Start after Header
        const limit = Math.min(this.view.byteLength - 100, 5000); // Scan first 5KB

        let sysVarsPos = -1;

        for (let p = scanOffset; p < limit; p++) { // Scan byte-by-byte for alignment
            const val = this.view.getInt32(p, true);
            if (val === 15) { // Potential numSysVars
                // Check sequence 0..14
                let match = true;
                for (let k = 0; k < 15; k++) {
                    if (this.view.getInt32(p + 4 + k * 4, true) !== k) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    sysVarsPos = p;
                    break;
                }
            }
        }

        let numSubVars = 1; // Default fallback
        let numNodeVars = 1;
        let numLinkVars = 1;
        let numSysVars = 15;

        if (sysVarsPos !== -1) {
            // Found it!
            console.log(`SWMM Parser: Found SysVars Block at ${sysVarsPos}. Aligning.`);

            // Set Results Offset
            this.offset = sysVarsPos + 4 + 15 * 4; // After SysVars block

            // Backtrack to find counts
            // Structure: 
            // ... [LinkVars Code Block] [SysVars Code Block]
            // LinkVars Block: [N_Link] [0, 1... N-1]
            // We read Int at sysVarsPos - 4. That is Last Link Code (N-1).
            // So N_Link = LastCode + 1.

            // Link Vars
            // sysVarsPos (index of 15) follows Link Block.
            // Link Block: [Count] [C0] [C1] .. [LastCode]
            // sysVarsPos - 4 is [LastCode].

            const lastLinkCode = this.view.getInt32(sysVarsPos - 4, true);
            numLinkVars = lastLinkCode + 1;

            // Link Block Start (Address of Count) = sysVarsPos - (numLinkVars * 4) - 4
            const linkBlockStart = sysVarsPos - (numLinkVars * 4) - 4;

            // Node Vars
            // Precedes Link Block
            // linkBlockStart - 4 is [LastNodeCode]
            const lastNodeCode = this.view.getInt32(linkBlockStart - 4, true);
            numNodeVars = lastNodeCode + 1;

            // Node Block Start
            const nodeBlockStart = linkBlockStart - 4 - (numNodeVars * 4); // Points to Count

            // Sub Vars
            // Precedes Node Block
            const lastSubCode = this.view.getInt32(nodeBlockStart - 4, true);
            numSubVars = lastSubCode + 1;

            // Sanity Check
            // Usually Sub=8, Node=6, Link=5
            console.log(`SWMM Parser: Inferred Counts -> Sub=${numSubVars}, Node=${numNodeVars}, Link=${numLinkVars}`);

            if (numSubVars < 0 || numNodeVars < 0 || numLinkVars < 0 || numSubVars > 50) {
                console.warn("SWMM Parser: Inferred counts look bogus. Scanner might have found false positive.");
                // Fallback to defaults?
                numSubVars = 1; numNodeVars = 1; numLinkVars = 1;
            }

        } else {
            console.warn("SWMM Parser: Could not find SysVars signature. Using fallback/trailer.");
            // Current offset is likely wrong (2839).
            // If trailer said 240, and we failed scanning, maybe file is garbage?
            // Fallback to defaults?
            // Let's try to proceed with sequential or user trailer as unchecked fallback
            // But usually scanning logic is superior.
        }

        const BYTES_PER_FLOAT = 4;
        const subResultSize = numSubcatch * numSubVars * BYTES_PER_FLOAT;
        const nodeResultSize = numNodes * numNodeVars * BYTES_PER_FLOAT;
        const linkResultSize = numLinks * numLinkVars * BYTES_PER_FLOAT;
        const sysResultSize = numSysVars * BYTES_PER_FLOAT;
        const bytesPerStep = 8 + subResultSize + nodeResultSize + linkResultSize + sysResultSize; // 8 for Date Double

        // Jump to Start of Results using Trailer
        // Trailer is last 6*4 = 24 bytes 
        const fileLen = this.view.byteLength;
        const trailerOffset = fileLen - 24;

        if (trailerOffset > 0) {
            const tempOffset = this.offset;
            const magic2 = this.view.getInt32(fileLen - 4, true);
            if (magic2 === 516114522) {
                const outPos = this.view.getInt32(trailerOffset + 8, true); // Output Start
                console.log(`SWMM Parser: Calculated Result Offset: ${tempOffset}, Trailer OutPos: ${outPos}. Jumping to ${outPos}.`);
                if (outPos > 0 && outPos < fileLen) {
                    if (outPos < tempOffset) {
                        console.warn(`SWMM Parser: Trailer OutPos (${outPos}) < Current Offset (${tempOffset}). Ignoring Trailer.`);
                    } else {
                        this.offset = outPos;
                    }
                }
            } else {
                console.warn("SWMM Parser: Invalid Trailer Magic.");
            }
        }

        // Read all steps until failure or End Magic
        const timeSeries = [];

        // Safety Break
        let stepCount = 0;
        const MAX_STEPS = 50000;

        // Need mapping for Variables.
        // Node Vars: 0:Depth, 1:Head, 2:Vol, 3:LatInflow, 4:TotalInflow, 5:Overflow
        // Link Vars: 0:Flow, 1:Depth, 2:Vel, 3:Vol, 4:Cap

        // Identify Indices
        // Standard SWMM 5:
        // Node: 0=Depth, 4=TotalInflow, 5=Flooding(Overflow) ? Need to check codes.
        // If codes are standard [0,1,2,3,4,5...], then mapping is standard.
        // Usually codes match enum: 
        // Node: depth=0, head=1, vol=2, latFlow=3, totalFlow=4, flood=5
        // Link: flow=0, depth=1, velocity=2, volume=3, capacity=4

        while (this.offset < this.view.byteLength - 16 && stepCount < MAX_STEPS) { // -16 for trailer safety
            // Check if next Int32 is StartDate? No, Double.
            // Check for Magic End? 
            // Better to check remaining bytes.
            if (this.view.byteLength - this.offset < bytesPerStep) break;

            const date = this.readDouble(); // JD
            // Convert to relative seconds? Or just index.
            // JD to Seconds? We returned Steps in UI as minutes relative to start.

            const stepData = {
                time: (stepCount) * 1 * 60, // Rough assumption if internal step is unknown. Better use Date diff.
                date: date,
                nodes: {},
                edges: {},
                subcatchments: {}
            };

            // Subs
            for (let i = 0; i < numSubcatch; i++) {
                const subId = subcatchIds[i];
                // Read vars
                // Just skip for now to save memory? Or parse runoff (Var 4?)
                // Standard Sub Vars: 0:Rain, 1:Snow, 2:Loss, 3:Runoff
                const runoffVal = this.view.getFloat32(this.offset + 3 * 4, true);
                stepData.subcatchments[subId] = { runoff: runoffVal };
                this.offset += numSubVars * 4;
            }

            // Nodes
            for (let i = 0; i < numNodes; i++) {
                const nodeId = nodeIds[i];
                // 0:Depth, 1:Head, 2:Vol, 3:Lat, 4:TotalInflow, 5:Flood
                const depth = this.view.getFloat32(this.offset + 0 * 4, true);
                const vol = this.view.getFloat32(this.offset + 2 * 4, true);
                const inflow = this.view.getFloat32(this.offset + 4 * 4, true);
                const flood = this.view.getFloat32(this.offset + 5 * 4, true);

                stepData.nodes[nodeId] = {
                    depth: depth,
                    vol: vol,
                    inflow: inflow * 1000, // CMS -> L/s
                    flooding: flood
                };
                this.offset += numNodeVars * 4;
            }

            // Links
            for (let i = 0; i < numLinks; i++) {
                const linkId = linkIds[i];
                // 0:Flow, 1:Depth, 2:Vel, 3:Vol, 4:Cap
                const flow = this.view.getFloat32(this.offset + 0 * 4, true);
                const vel = this.view.getFloat32(this.offset + 2 * 4, true);
                const vol = this.view.getFloat32(this.offset + 3 * 4, true);
                const cap = this.view.getFloat32(this.offset + 4 * 4, true); // Capacity Ratio (0-1)

                stepData.edges[linkId] = {
                    q: Math.abs(flow) * 1000, // CMS -> L/s
                    signedQ: flow * 1000, // Signed L/s for direction
                    v: vel,
                    vol: vol,
                    utilization: cap // 0-1
                };
                this.offset += numLinkVars * 4;
            }

            // System
            this.offset += numSysVars * 4;

            timeSeries.push(stepData);
            stepCount++;
        }

        // Post-process times
        if (timeSeries.length > 0) {
            const startJD = timeSeries[0].date;
            // 1 JD day = 86400 sec.
            timeSeries.forEach(step => {
                step.time = (step.date - startJD) * 86400;
            });
        }

        return timeSeries;
    }

    /**
     * Parsing of the text report (.rpt)
     * Extracted from worker for centralized logic.
     * @param {string} report - The raw text content of the .rpt file
     * @param {Map} inputNodesMap - Map of input nodes (for geometry/elevation)
     * @param {Map} inputEdgesMap - Map of input edges (for geometry/roughness)
     */
    static parseReport(report, inputNodesMap = new Map(), inputEdgesMap = new Map()) {
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
            let z1 = (edge.z1 !== undefined && edge.z1 !== null) ? edge.z1 : from.z;
            let z2 = (edge.z2 !== undefined && edge.z2 !== null) ? edge.z2 : to.z;

            if (z1 === undefined) z1 = 0;
            if (z2 === undefined) z2 = 0;

            const len = edge.length > 0 ? edge.length : 10;
            let slope = Math.abs(z1 - z2) / len;
            if (slope < 0.001) slope = 0.001; // Minimum slope

            // Roughness: Handle Strickler (Kst) vs Manning (n)
            let val = edge.roughness > 0 ? edge.roughness : 0;
            let n = 0.013; // Default (Concrete n)

            if (val > 1.0) {
                // Assume Strickler (kst) -> Convert to Manning
                n = 1.0 / val;
            } else if (val > 0) {
                n = val;
            }

            // Geometry
            const p = edge.profile || { type: 0, height: 0, width: 0 };
            let h = p.height || 0;
            let w = p.width || 0;
            let type = p.type;

            // Fallback: If geometry is missing/invalid (or tiny < 1cm), assume DN1000 Circle (1.0m)
            if (h < 0.01) {
                h = 1.0;
                w = 1.0;
                type = 0;
            }
            if ((type === 3 || type === 'Rechteckprofil' || type === 8 || type === 4 || type === 'Trapezprofil') && w <= 0) {
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
                const D = 1.0;
                A = Math.PI * Math.pow(D / 2, 2);
                R = D / 4;
            }
            // Manning Equation: Q = (1/n) * A * R^(2/3) * S^(1/2) (m3/s)
            const Q = (1 / n) * A * Math.pow(R, 2 / 3) * Math.pow(slope, 0.5);
            return Q * 1000; // Convert to L/s
        };

        // Helper to parse table
        const parseTable = (headerRegex, rowCallback) => {
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
            const vol = parseFloat(parts[parts.length - 2]); // Total Vol
            const depth = parseFloat(parts[parts.length - 1]); // Max Depth

            if (!isNaN(vol)) {
                if (!nodes[id]) nodes[id] = {};
                nodes[id].floodVolume = vol; // 10^6 ltr
                nodes[id].pondedDepth = depth;
                nodes[id].overflow = true;
            }
        });

        // --- 5. Link Flow Summary ---
        parseTable(/(Link|Conduit) Flow Summary/, (parts) => {
            const id = parts[0];
            let offset = 0;
            // Handle optional Date column in older SWMM versions? 
            // Or just Day/Time columns.
            // Standard: Name, Type, MaxQ, Day, Time, MaxV, Max/Full Flow, Max/Full Depth
            // 0:Name, 1:Type, 2:MaxQ, 3:Day, 4:Time, 5:MaxV, 6:Max/Full Flow, 7:Max/Full Depth
            // Detection Strategy: Reverse Indexing
            // User Strict Mapping Request (Step 1239): "es ist bescheuert ich weiß"
            // 1. Qmax = Maximum [Flow] (Col 2)
            // 2. Qvoll = Max/Full Flow (2nd to Last Col) -> Raw Value (e.g. 0.33)
            // 3. Auslastung = Max/Full Depth (Last Col) * 100 -> Raw Value (e.g. 1.00 -> 100%)

            const len = parts.length;
            const maxDepthRatio = parseFloat(parts[len - 1]); // Last col (Max/Full Depth)
            const maxFullRatio = parseFloat(parts[len - 2]); // 2nd to Last col (Max/Full Flow)
            const maxVel = parseFloat(parts[len - 3]);
            const maxFlow = parseFloat(parts[2]);

            if (!isNaN(maxFlow)) {
                if (!edges[id]) edges[id] = {};
                edges[id].maxFlow = maxFlow * 1000; // Qmax in L/s (System standard)
                edges[id].maxVelocity = isNaN(maxVel) ? 0 : maxVel;

                // Store Raw Ratios for reference
                edges[id].flowCapacityRatio = isNaN(maxFullRatio) ? 0 : maxFullRatio;
                edges[id].depthRatio = isNaN(maxDepthRatio) ? 0 : maxDepthRatio;

                // Qvoll Mapping: DERIVED CONCEPT
                // "Max/Full Flow" (Col N-2) is a RATIO (Qmax/Qvoll), NOT Capacity.
                // We derive Capacity (Qvoll) = Qmax / Ratio.
                // Qmax is already in L/s (maxFlow * 1000).
                if (!isNaN(maxFullRatio) && Math.abs(maxFullRatio) > 0.0001) {
                    // Ratio = Qmax / Qvoll  =>  Qvoll = Qmax / Ratio
                    edges[id].capacity = (maxFlow * 1000) / maxFullRatio;
                } else {
                    edges[id].capacity = 0;
                }

                // Utilization Logic: Strictly Filling Degree (Max/Full Depth) * 100
                if (!isNaN(maxDepthRatio)) {
                    let util = maxDepthRatio * 100;
                    if (util > 100) util = 100; // Cap at 100%
                    edges[id].utilization = util;

                    if (id === 'BE008') {
                        console.log(`[SwmmOutParser] BE008 Strict: Qmax=${edges[id].maxFlow}, Qvoll=${edges[id].capacity}, Util=${util}%`);
                    }
                } else if (!isNaN(maxFullRatio)) {
                    // Fallback
                    let util = maxFullRatio * 100;
                    if (util > 100) util = 100;
                    edges[id].utilization = util;
                } else {
                    edges[id].utilization = 0;
                }
            }
        });

        // --- 6. Stats Extraction ---
        const extractStat = (label, regex) => {
            const match = report.match(regex);
            return match ? parseFloat(match[1]) : 0;
        };
        systemStats.runoff.precip = extractStat("Total Precipitation", /Total Precipitation \.+ \s+([-\d\.]+)/);
        systemStats.runoff.evap = extractStat("Evaporation Loss", /Evaporation Loss \.+ \s+([-\d\.]+)/);
        systemStats.runoff.infil = extractStat("Infiltration Loss", /Infiltration Loss \.+ \s+([-\d\.]+)/);
        systemStats.runoff.runoff = extractStat("Surface Runoff", /Surface Runoff \.+ \s+([-\d\.]+)/);
        systemStats.runoff.error = extractStat("Continuity Error", /Continuity Error \(%\) \.+ \s+([-\d\.]+)/);

        return { nodes, edges, subcatchments, systemStats };
    }
}
