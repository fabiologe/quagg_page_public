
/**
 * specialized Parser for SWMM .rpt files (Text Report)
 * Extracts Summary Tables and detailed Node/Link results.
 */
export class RptParser {

    /**
     * Parsing of the text report (.rpt)
     * @param {string} report - The raw text content of the .rpt file
     * @param {Map|Object} inputNodesMap - Map of input nodes (for geometry/elevation)
     * @param {Map|Object} inputEdgesMap - Map of input edges (for geometry/roughness)
     */
    static parse(report, inputNodesMap = {}, inputEdgesMap = {}) {
        // Ensure Maps are Objects for easier lookup if passed as Maps
        const nodesIn = (inputNodesMap instanceof Map) ? Object.fromEntries(inputNodesMap) : inputNodesMap;
        const edgesIn = (inputEdgesMap instanceof Map) ? Object.fromEntries(inputEdgesMap) : inputEdgesMap;

        const nodes = {};
        const edges = {};
        const subcatchments = {};
        const systemStats = {
            analysisOptions: {}, // New
            runoff: {},
            flow: {},
            routingTimeStep: {},
            outfallLoading: [],
            flowClassification: [],
            criticalElements: [],
            nonConvergingNodes: [],
            storageSummary: [],
            pumpingSummary: []
        };

        // --- Helper: Parsing Logic for Capacity (Manning) ---
        // Duplicate logic from original parser or import shared helper? 
        // Keeping it self-contained here to avoid circular dependencies.
        const calculateCapacity = (id) => {
            const edge = edgesIn[id];
            if (!edge) return 0;

            // ... (Logic stripped for brevity, assuming we calculate it or extract it? 
            // Actually, we need it to calculate Qvoll if SWMM doesn't give it directly.
            // Let's implement the basic Manning calculation here again or rely on what was there.
            // The original parser did it inline.

            const fromId = edge.fromNodeId || edge.from;
            const toId = edge.toNodeId || edge.to;
            const from = nodesIn[fromId];
            const to = nodesIn[toId];

            // Basic geometry fallback
            let h = (edge.profile && edge.profile.height) || 1.0;
            let w = (edge.profile && edge.profile.width) || 1.0;
            let type = (edge.profile && edge.profile.type) || 0;

            if (h < 0.01) { h = 1.0; w = 1.0; type = 0; }

            // Slope
            let z1 = (edge.z1 !== undefined) ? edge.z1 : (from ? from.z : 0);
            let z2 = (edge.z2 !== undefined) ? edge.z2 : (to ? to.z : 0);
            let len = edge.length > 0 ? edge.length : 10;
            let slope = Math.abs(z1 - z2) / len;
            if (slope < 0.001) slope = 0.001;

            // Roughness
            let n = 0.013;
            if (edge.roughness > 0) {
                if (edge.roughness > 1.0) n = 1.0 / edge.roughness; // Strickler
                else n = edge.roughness;
            }

            // Area/Radius Calculation (Simplified for Circular/Rect)
            let A = 0, R = 0;
            if (type == 0 || type === 'Circular' || type === 'Kreisprofil') {
                const D = h;
                A = Math.PI * Math.pow(D / 2, 2);
                const P = Math.PI * D;
                R = D / 4;
            } else if (type == 3 || type === 'Rechteckprofil') {
                A = w * h;
                const P = 2 * w + 2 * h;
                R = A / P;
            } else {
                // Fallback Circular
                const D = 1.0;
                A = Math.PI * Math.pow(D / 2, 2);
                R = D / 4;
            }

            // Manning: Q = (1/n) * A * R^(2/3) * S^(1/2)
            const Q = (1 / n) * A * Math.pow(R, 2 / 3) * Math.pow(slope, 0.5);
            return Q * 1000; // L/s
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

        // --- 0. Analysis Options (NEW) ---
        const extractOption = (label) => {
            const regex = new RegExp(`${label}\\s+\\.+\\s+(.+)`);
            const match = report.match(regex);
            return match ? match[1].trim() : null;
        };
        systemStats.analysisOptions = {
            flowUnits: extractOption("Flow Units"),
            processModels: {
                rainfall: extractOption("Rainfall/Runoff"),
                rdii: extractOption("RDII"),
                snow: extractOption("Snowmelt"),
                groundwater: extractOption("Groundwater"),
                flowRouting: extractOption("Flow Routing"),
                ponding: extractOption("Ponding Allowed"),
                waterQuality: extractOption("Water Quality")
            },
            infiltrationMethod: extractOption("Infiltration Method"),
            flowRoutingMethod: extractOption("Flow Routing Method"),
            startDate: extractOption("Starting Date"),
            endDate: extractOption("Ending Date"),
            anteMoisture: extractOption("Antecedent Dry Days"),
            reportTimeStep: extractOption("Report Time Step"),
            wetTimeStep: extractOption("Wet Time Step"),
            dryTimeStep: extractOption("Dry Time Step"),
            routingTimeStep: extractOption("Routing Time Step")
        };

        // --- 1. Subcatchment Runoff Summary ---
        parseTable(/Subcatchment Runoff Summary/, (parts) => {
            const id = parts[0];
            if (!subcatchments[id]) subcatchments[id] = {};
            // [0]ID [1]Precip [2]Runon [3]Evap [4]Infil [5]ImpervRunoff [6]PervRunoff [7]TotalRunoff [8]TotalVol [9]PeakRunoff [10]Coeff
            subcatchments[id].precip = parseFloat(parts[1]);
            subcatchments[id].totalRunon = parseFloat(parts[2]); // New
            subcatchments[id].totalEvap = parseFloat(parts[3]); // New
            subcatchments[id].totalInfil = parseFloat(parts[4]); // New
            subcatchments[id].impervRunoffMm = parseFloat(parts[5]); // New
            subcatchments[id].pervRunoffMm = parseFloat(parts[6]); // New
            subcatchments[id].totalRunoffMm = parseFloat(parts[7]);
            subcatchments[id].totalRunoffVol = parseFloat(parts[8]);
            subcatchments[id].peakRunoff = parseFloat(parts[9]) * 1000;
            subcatchments[id].runoffCoeff = parseFloat(parts[10]);
        });

        // --- 2. Node Depth Summary ---
        // Columns: Node, Type, AvgDepth, MaxDepth, MaxHGL, Time, Reported Max Depth
        parseTable(/Node Depth Summary/, (parts) => {
            const id = parts[0];
            const avgDepth = parseFloat(parts[2]);
            const maxDepth = parseFloat(parts[3]);
            const maxHGL = parseFloat(parts[4]);

            if (!isNaN(maxDepth)) {
                if (!nodes[id]) nodes[id] = {};
                nodes[id].type = parts[1]; // Capture Type (Junction, Outfall, Storage)
                nodes[id].avgDepth = avgDepth;
                nodes[id].maxDepth = maxDepth;
                nodes[id].maxHGL = maxHGL;
                nodes[id].timeOfMaxDepth = parts[5]; // Capture Time of Max
            }
        });

        // --- 3. Node Inflow Summary ---
        // Columns: Node, Type, MaxLatInflow, MaxTotalInflow, Day, Time, LatInflowVol, TotalInflowVol
        parseTable(/Node Inflow Summary/, (parts) => {
            const id = parts[0];
            // Identify columns by length or position. usually standard.
            // [0]Name [1]Type [2]MaxLat [3]MaxTotal [4]Day [5]Time [6]LatVol [7]TotalVol
            const maxInflow = parseFloat(parts[3]);
            const totalInflowVol = parseFloat(parts[7]); // 10^6 Ltr ? 

            if (!isNaN(maxInflow)) {
                if (!nodes[id]) nodes[id] = {};
                nodes[id].maxInflow = maxInflow * 1000; // CMS -> L/s
                nodes[id].totalInflowVolume = totalInflowVol; // 10^6 Ltr

                // Extract Flow Balance Error if present (parts[8])
                if (parts.length >= 9) {
                    const error = parseFloat(parts[8]);
                    if (!isNaN(error)) nodes[id].flowBalanceError = error;
                }
            }
        });

        // --- 4. Node Flooding Summary ---
        // Columns: Node, Hours Flooded, MaxRate, Day, Time, TotalFloodVol, MaxPondDepth
        parseTable(/Node Flooding Summary/, (parts) => {
            const id = parts[0];
            const vol = parseFloat(parts[5]); // Total Flood Vol (10^6 ltr)
            const depth = parseFloat(parts[6]); // Max Pond Depth

            if (!isNaN(vol)) {
                if (!nodes[id]) nodes[id] = {};
                nodes[id].floodingVolume = vol;
                nodes[id].pondedDepth = depth;
                nodes[id].overflow = true; // Confirmed overflow by SWMM
            }
        });

        // --- 5. Node Surcharge Summary (NEW) ---
        // Columns: Node, Type, Hours Surcharged, Max Height Above Crown, Min Depth Below Rim
        parseTable(/Node Surcharge Summary/, (parts) => {
            const id = parts[0];
            const maxAboveCrown = parseFloat(parts[3]);
            const minBelowRim = parseFloat(parts[4]);

            if (!nodes[id]) nodes[id] = {};
            nodes[id].surcharged = true;
            nodes[id].maxHeightAboveCrown = maxAboveCrown;
            nodes[id].minDepthBelowRim = minBelowRim;
        });

        // --- 6. Link Flow Summary ---
        parseTable(/(Link|Conduit) Flow Summary/, (parts) => {
            const id = parts[0];
            // [0]Name [1]Type [2]MaxQ [3]Day [4]Time [5]MaxV [6]Max/Full(Flow) [7]Max/Full(Depth)

            const len = parts.length;
            const maxDepthRatio = parseFloat(parts[len - 1]);
            const maxFullRatio = parseFloat(parts[len - 2]);
            const maxVel = parseFloat(parts[len - 3]);
            const maxFlow = parseFloat(parts[2]);

            if (!isNaN(maxFlow)) {
                if (!edges[id]) edges[id] = {};
                edges[id].type = parts[1]; // Capture Type (Conduit, Pump, Weirs)
                edges[id].maxFlow = maxFlow * 1000; // L/s
                edges[id].timeOfMaxFlow = parts[4]; // Capture Time of Max Flow
                edges[id].maxVelocity = isNaN(maxVel) ? 0 : maxVel;
                edges[id].flowCapacityRatio = isNaN(maxFullRatio) ? 0 : maxFullRatio;
                edges[id].depthRatio = isNaN(maxDepthRatio) ? 0 : maxDepthRatio;

                // Capacity Calculation
                if (!isNaN(maxFullRatio) && Math.abs(maxFullRatio) > 0.0001) {
                    edges[id].capacity = (maxFlow * 1000) / maxFullRatio;
                } else {
                    // Try manual calculation if missing
                    edges[id].capacity = calculateCapacity(id);
                }

                edges[id].utilization = (!isNaN(maxDepthRatio)) ? Math.min(maxDepthRatio * 100, 100) : 0;
            }
        });

        // --- Post-Process: Calculate Vmax (Volume Stored) for Nodes ---
        // SWMM Report doesn't explicitly give "Max Volume Stored" in summary for all nodes, 
        // only "Ponded Volume" (Overflow).
        // Use MaxDepth * Area? Or Approximation?
        // Actually, best we can do is MaxDepth * CrossSection (if simple) or 
        // use the TimeSeries binary for accurate Vmax. 
        // BUT user asked for "Vmax also was möglich ist an Volumen" -> This implies Capacity vs Current Volume.
        // "was möglich ist" = Max Possible Volume (Storage Capacity)
        // "Vmax" = Max Stored Volume during sim.

        // Let's iterate nodes and calculate 'MaxPossibleVolume' based on geometry.
        Object.keys(nodes).forEach(id => {
            const nodeInput = nodesIn[id];
            if (nodeInput) {
                // Calculate Max Storage Volume
                // If Cylinder: PI * r^2 * MaxDepth
                const depth = parseFloat(nodeInput.maxDepth) || 0; // Physical depth
                // Or use z_cover - z_invert

                // Simplification for now
                // We will populate 'maxAvailableVolume'
                nodes[id].maxAvailableVolume = 0; // TODO: Calculate if geometry known
            }

            // Check for Overflow based on Rim Elevation (User Request)
            const input = nodesIn[id];
            if (input && nodes[id].maxHGL !== undefined) {
                const rim = input.coverZ !== undefined ? Number(input.coverZ) : (Number(input.z) + Number(input.maxDepth || 3));
                const maxHGL = nodes[id].maxHGL;

                // Precision tolerance
                if (maxHGL > (rim + 0.01)) {
                    nodes[id].overflow = true;
                    nodes[id].overflowReason = "HGL > Rim";
                }
            }
        });




        // --- 7. Highest Continuity Errors ---
        // Format: Node RW31 (-69.41%)
        const continuityErrors = [];
        let inContinuityBlock = false;
        report.split('\n').forEach(line => {
            line = line.trim();
            if (line.includes("Highest Continuity Errors")) {
                inContinuityBlock = true;
                return;
            }
            if (inContinuityBlock) {
                if (line.startsWith('*') || line === '') {
                    if (line.startsWith('*')) inContinuityBlock = false;
                    return;
                }
                if (line.startsWith('Node')) {
                    const match = line.match(/Node\s+(\S+)\s+\(([-\d\.]+)%\)/);
                    if (match) {
                        continuityErrors.push({ id: match[1], error: parseFloat(match[2]) });
                    }
                }
            }
        });

        // --- 7b. Highest Flow Instability Indexes ---
        const instabilityIndexes = [];
        let inInstabilityBlock = false;
        report.split('\n').forEach(line => {
            line = line.trim();
            if (line.includes("Highest Flow Instability Indexes")) {
                inInstabilityBlock = true;
                return;
            }
            if (inInstabilityBlock) {
                if (line.startsWith('*') || line === '') {
                    if (line.startsWith('*')) inInstabilityBlock = false;
                    return;
                }
                if (line.startsWith('Link')) {
                    const match = line.match(/Link\s+(\S+)\s+\((\d+)\)/);
                    if (match) {
                        instabilityIndexes.push({ id: match[1], index: parseInt(match[2], 10) });
                    }
                }
            }
        });

        // --- 8. Conduit Surcharge Summary ---
        parseTable(/Conduit Surcharge Summary/, (parts) => {
            const id = parts[0];
            const hoursFull = parseFloat(parts[1]);
            const hoursUp = parseFloat(parts[2]);
            const hoursDown = parseFloat(parts[3]);
            const hoursAboveFull = parseFloat(parts[4]);
            const hoursCapLimited = parseFloat(parts[5]);

            if (!isNaN(hoursFull)) {
                if (!edges[id]) edges[id] = {};
                edges[id].surcharge = {
                    hoursFull,
                    hoursUp,
                    hoursDown,
                    hoursAboveFull,
                    hoursCapLimited
                };
            }
        });

        // Append diagnostics to systemStats
        systemStats.continuityErrors = continuityErrors;
        systemStats.instabilityIndexes = instabilityIndexes;

        // --- 7c. Time-Step Critical Elements ---
        const criticalElements = [];
        let inCriticalBlock = false;
        report.split('\n').forEach(line => {
            line = line.trim();
            if (line.includes("Time-Step Critical Elements")) {
                inCriticalBlock = true;
                return;
            }
            if (inCriticalBlock) {
                if (line.startsWith('*') || line === 'None' || line === '') {
                    if (line.startsWith('*') || line === '') inCriticalBlock = false;
                    return;
                }
                // Line: "Link FK007 (55.00%)" or "Node..."
                const match = line.match(/(Link|Node)\s+(\S+)\s+\(([-\d\.]+)%\)/);
                if (match) {
                    criticalElements.push({ type: match[1], id: match[2], value: parseFloat(match[3]) });
                }
            }
        });
        systemStats.criticalElements = criticalElements;

        // --- 7d. Most Frequent Nonconverging Nodes ---
        const nonConvergingNodes = [];
        let inNonConvBlock = false;
        report.split('\n').forEach(line => {
            line = line.trim();
            if (line.includes("Most Frequent Nonconverging Nodes")) {
                inNonConvBlock = true;
                return;
            }
            if (inNonConvBlock) {
                if (line.startsWith('*') || line === 'None' || line === '') {
                    if (line.startsWith('*') || line === '') inNonConvBlock = false;
                    return;
                }
                // Line: "Node AL001 (0.21%)"
                const match = line.match(/Node\s+(\S+)\s+\(([-\d\.]+)%\)/);
                if (match) {
                    nonConvergingNodes.push({ id: match[1], value: parseFloat(match[2]) });
                }
            }
        });
        systemStats.nonConvergingNodes = nonConvergingNodes;


        // --- 9. Outfall Loading Summary ---
        parseTable(/Outfall Loading Summary/, (parts) => {
            // [0]OutfallNode [1]FlowFreq [2]AvgFlow [3]MaxFlow [4]TotalVol
            const id = parts[0];
            if (id === 'System') return; // Skip System Summary line here

            systemStats.outfallLoading.push({
                id: parts[0],
                freq: parseFloat(parts[1]),
                avgFlow: parseFloat(parts[2]),
                maxFlow: parseFloat(parts[3]),
                totalVol: parseFloat(parts[4])
            });
        });

        // --- 10. Flow Classification Summary ---
        parseTable(/Flow Classification Summary/, (parts) => {
            // [0]Conduit [1]AdjLen [2]Dry [3]UpDry [4]DwnDry [5]SubCrit [6]SupCrit [7]UpCrit [8]DwnCrit [9]NormLtd [10]InletCtrl
            const id = parts[0];

            systemStats.flowClassification.push({
                id: parts[0],
                adjustedLength: parseFloat(parts[1]),
                fractions: {
                    dry: parseFloat(parts[2]),
                    upDry: parseFloat(parts[3]),
                    downDry: parseFloat(parts[4]),
                    subCrit: parseFloat(parts[5]),
                    supCrit: parseFloat(parts[6]),
                    upCrit: parseFloat(parts[7]),
                    downCrit: parseFloat(parts[8]),
                    normLtd: parseFloat(parts[9]),
                    inletCtrl: parseFloat(parts[10])
                }
            });
        });

        // --- 12. Node Storage Summary ---
        parseTable(/Node Storage Summary/, (parts) => {
            // [0]Name [1]Type [2]AvgVol [3]AvgPcntFull [4]EvapPcnt [5]ExfilPcnt [6]MaxVol [7]MaxPcntFull [8]TimeOfMax [9]MaxOutflow
            // Columns can vary slightly by version, assuming standard SWMM 5.1/5.2
            // check parts length or header roughly?
            // Standard: Name, Type, Average Volume, Avg % Full, Evap %, Exfil %, Max Volume, Max % Full, Time of Max, Max Outflow

            systemStats.storageSummary.push({
                id: parts[0],
                type: parts[1],
                avgVol: parseFloat(parts[2]),
                avgPcntFull: parseFloat(parts[3]),
                maxVol: parseFloat(parts[6]),
                maxPcntFull: parseFloat(parts[7]),
                maxOutflow: parseFloat(parts[9])
            });
        });

        // --- 13. Pumping Summary ---
        parseTable(/Pumping Summary/, (parts) => {
            // [0]Name [1]PcntUtilized [2]StartUps [3]MinFlow [4]AvgFlow [5]MaxFlow [6]TotalVol [7]Power(Kw) [8]TotalEnergy
            systemStats.pumpingSummary.push({
                id: parts[0],
                percentUtilized: parseFloat(parts[1]),
                startUps: parseFloat(parts[2]),
                maxFlow: parseFloat(parts[5]),
                totalVol: parseFloat(parts[6]),
                totalEnergy: parseFloat(parts[8])
            });
        });

        // --- 11. Routing Time Step Summary (Simple Key-Value Extraction) ---
        const extractTimeStepStat = (label) => {
            // Regex for "Label : Value Units"
            const regex = new RegExp(`${label}\\s+:\\s+([\\d\\.]+)\\s+`);
            const match = report.match(regex);
            return match ? parseFloat(match[1]) : 0;
        };
        systemStats.routingTimeStep = {
            min: extractTimeStepStat("Minimum Time Step"),
            avg: extractTimeStepStat("Average Time Step"),
            max: extractTimeStepStat("Maximum Time Step"),
            steadyState: extractTimeStepStat("% of Time in Steady State"),
            avgIterations: extractTimeStepStat("Average Iterations per Step"),
            notConverging: extractTimeStepStat("% of Steps Not Converging")
        };

        // --- Starts Extraction ---
        // --- Starts Extraction ---
        const extractStat = (label, regex) => {
            const match = report.match(regex);
            return match ? parseFloat(match[1]) : 0;
        };
        // Runoff Continuity
        systemStats.runoff.precip = extractStat("Total Precipitation", /Total Precipitation \.+ \s+([-\d\.]+)/);
        systemStats.runoff.evap = extractStat("Evaporation Loss", /Evaporation Loss \.+ \s+([-\d\.]+)/);
        systemStats.runoff.infil = extractStat("Infiltration Loss", /Infiltration Loss \.+ \s+([-\d\.]+)/);
        systemStats.runoff.runoff = extractStat("Surface Runoff", /Surface Runoff \.+ \s+([-\d\.]+)/);
        systemStats.runoff.runon = extractStat("Surface Runon", /Surface Runon \.+ \s+([-\d\.]+)/); // New
        systemStats.runoff.finalStorage = extractStat("Final Surface Storage", /Final Surface Storage \.+ \s+([-\d\.]+)/); // New
        systemStats.runoff.error = extractStat("Continuity Error", /Continuity Error \(%\) \.+ \s+([-\d\.]+)/);

        // Flow Routing Continuity
        // Try regex for specific lines first
        systemStats.flow.dryWeatherInflow = extractStat("Dry Weather Inflow", /Dry Weather Inflow \.+ \s+([-\d\.]+)/);
        systemStats.flow.wetWeatherInflow = extractStat("Wet Weather Inflow", /Wet Weather Inflow \.+ \s+([-\d\.]+)/);
        systemStats.flow.groundwaterInflow = extractStat("Groundwater Inflow", /Groundwater Inflow \.+ \s+([-\d\.]+)/);
        systemStats.flow.rdiiInflow = extractStat("RDII Inflow", /RDII Inflow \.+ \s+([-\d\.]+)/);
        systemStats.flow.externalInflow = extractStat("External Inflow", /External Inflow \.+ \s+([-\d\.]+)/);
        systemStats.flow.externalOutflow = extractStat("External Outflow", /External Outflow \.+ \s+([-\d\.]+)/);
        systemStats.flow.floodingLoss = extractStat("Flooding Loss", /Flooding Loss \.+ \s+([-\d\.]+)/);
        systemStats.flow.evapLoss = extractStat("Evaporation Loss", /Evaporation Loss \.+ \s+([-\d\.]+)/); // Context sensitive? usually Routing uses same label
        systemStats.flow.exfilLoss = extractStat("Exfiltration Loss", /Exfiltration Loss \.+ \s+([-\d\.]+)/);
        systemStats.flow.initialStoredVol = extractStat("Initial Stored Volume", /Initial Stored Volume \.+ \s+([-\d\.]+)/);
        systemStats.flow.finalStoredVol = extractStat("Final Stored Volume", /Final Stored Volume \.+ \s+([-\d\.]+)/);
        systemStats.flow.error = extractStat("Continuity Error", /Continuity Error \(%\) \.+ \s+([-\d\.]+)/);

        // Flow stats
        systemStats.flow.inflowVol = extractStat("External Inflow", /External Inflow \.+ \s+([-\d\.]+)/); // usually mass balance
        // We'll trust the mass balance section if parsed, or regex these specific lines


        return { nodes, edges, subcatchments, systemStats };
    }
}
