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
}
