
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
                        // Allow blank lines before first separator (header spacing)
                        if (separatorCount === 0) continue;

                        inTable = false;
                        continue;
                    }
                    if (line.startsWith('***') || line.startsWith('Analysis begun')) {
                        // Fix: Ignore title underline (if no separators seen yet)
                        if (separatorCount === 0) continue;

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
        // Columns: Node, Type, AvgDepth, MaxDepth, MaxHGL, Day, Time, Reported Max Depth
        // Example:  RW34  JUNCTION  0.33  1.20  340.43  0  00:25  1.20
        // Indices:  [0]   [1]       [2]   [3]   [4]     [5][6]    [7]
        parseTable(/Node Depth Summary/, (parts) => {
            const id = parts[0];
            // Safe parsing helper
            const getVal = (idx) => {
                const v = parseFloat(parts[idx]);
                return isNaN(v) ? 0 : v;
            };

            if (parts.length >= 7) {
                if (!nodes[id]) nodes[id] = {};
                nodes[id].type = parts[1];
                nodes[id].avgDepth = getVal(2);
                nodes[id].maxDepth = getVal(3); // Max Water Depth (Wasserstand)
                nodes[id].maxHGL = getVal(4);
                nodes[id].timeOfMaxDepth = parts[6] || parts[5]; // Try index 6 (Time), fallback 5 if short
                // Reported Max Depth (Einstautiefe) is usually absolute depth or Depth above invert? 
                // SWMM Docs: "Reported Max Depth" is the maximum depth recorded.
                nodes[id].reportedMaxDepth = getVal(7);
            }
        });

        // --- 3. Node Inflow Summary ---
        // Columns: Node, Type, MaxLatInflow, MaxTotalInflow, Day, Time, LatInflowVol, TotalInflowVol, Error
        // Example:  RW34  JUNCTION  0.137  0.185  0  00:20  0.0918  0.141  -2.764
        parseTable(/Node Inflow Summary/, (parts) => {
            const id = parts[0];
            const getVal = (idx) => parseFloat(parts[idx]);

            if (parts.length >= 7) {
                if (!nodes[id]) nodes[id] = {};
                // [0]Name [1]Type [2]MaxLat [3]MaxTotal [4]Day [5]Time [6]LatVol [7]TotalVol
                nodes[id].maxLatInflow = getVal(2) * 1000; // CMS -> L/s
                nodes[id].maxTotalInflow = getVal(3) * 1000; // CMS -> L/s
                nodes[id].timeOfMaxInflow = parts[5];
                nodes[id].totalLatInflowVol = getVal(6); // 10^6 Ltr ? (Vol units depend on header, usually 10^6 ltr or m3)
                // Header says 10^6 ltr. 10^6 ltr = 1000 m3.
                // We want m3 for UI? 10^6 ltr * 1000 = liters. / 1000 = m3.
                // So value * 1000 = m3.
                nodes[id].totalInflowVolume = getVal(7) * 1000; // Convert 10^6 ltr -> m3

                if (parts.length >= 9) {
                    nodes[id].flowBalanceError = getVal(8);
                }
            }
        });

        // --- 4. Node Flooding Summary ---
        // Columns: Node, Hours Flooded, MaxRate, Day, Time, TotalFloodVol, MaxPondDepth
        parseTable(/Node Flooding Summary/, (parts) => {
            const id = parts[0];
            // [0]Name [1]Hours [2]MaxRate [3]Day [4]Time [5]Vol [6]Depth
            const vol = parseFloat(parts[5]);
            const depth = parseFloat(parts[6]);

            if (!isNaN(vol)) {
                if (!nodes[id]) nodes[id] = {};
                nodes[id].floodingVolume = vol * 1000; // 10^6 Ltr -> m3
                nodes[id].pondedDepth = depth;
                nodes[id].overflow = true;
            }
        });

        // --- 5. Node Surcharge Summary (NEW) ---
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
        // Columns: Link, Type, MaxFlow, Day, Time, MaxVel, Max/Full Flow, Max/Full Depth
        // Example: RW34  CONDUIT  0.112  0  00:20  1.58  1.30  1.00
        // Indices: [0]   [1]      [2]    [3][4]    [5]   [6]   [7]
        parseTable(/(Link|Conduit) Flow Summary/, (parts) => {
            const id = parts[0];
            const getVal = (idx) => parseFloat(parts[idx]);
            const len = parts.length;

            // Robust check: sometimes Type has space? rare.
            // Check if last element is number
            if (len >= 8) {
                if (!edges[id]) edges[id] = {};
                edges[id].type = parts[1];
                edges[id].maxFlow = getVal(2) * 1000; // CMS -> L/s
                edges[id].timeOfMaxFlow = parts[4];
                edges[id].maxVelocity = getVal(5); // m/s
                edges[id].flowCapacityRatio = getVal(6); // Max/Full Flow
                edges[id].depthRatio = getVal(7); // Max/Full Depth

                // Calculate Capacity (Qvoll)
                // Qvoll = Qmax / Ratio
                // If Ratio > 0.01
                if (Math.abs(edges[id].flowCapacityRatio) > 0.01) {
                    edges[id].capacity = edges[id].maxFlow / edges[id].flowCapacityRatio;
                } else {
                    edges[id].capacity = calculateCapacity(id);
                }

                edges[id].utilization = edges[id].depthRatio * 100;
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
                    hoursFullBoth: hoursFull,
                    hoursFullUp: hoursUp,
                    hoursFullDown: hoursDown,
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
        // --- 12. Storage Volume Summary ---
        parseTable(/(?:Node Storage|Storage Volume) Summary/, (parts) => {
            // [0]Name [1]AvgVol [2]AvgPcntFull [3]EvapPcnt [4]ExfilPcnt [5]MaxVol [6]MaxPcntFull [7]Days [8]Hr:Min [9]MaxOutflow

            systemStats.storageSummary.push({
                id: parts[0],
                avgVol: parseFloat(parts[1]) * 1000,
                avgPcntFull: parseFloat(parts[2]),
                maxVol: parseFloat(parts[5]) * 1000,
                maxPcntFull: parseFloat(parts[6]),
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
        const extractStat = (label, regex) => {
            const match = report.match(regex);
            return match ? parseFloat(match[1]) : 0;
        };

        // Extracts both columns from "Runoff Quantity Continuity" rows:
        // Format: "Label ......    [Volume hectare-m]    [Depth mm]"
        // The depth (mm) is the volume referenced to total catchment area — the primary engineering value.
        const extractRunoffRow = (label) => {
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`${escaped}\\s*\\.+\\s+([-\\d\\.]+)(?:\\s+([-\\d\\.]+))?`);
            const match = report.match(regex);
            if (!match) return { vol: 0, depthMm: 0 };
            return {
                vol: parseFloat(match[1]) || 0,      // hectare-m  (1 ha·m = 10 000 m³)
                depthMm: parseFloat(match[2]) || 0   // mm over total catchment area
            };
        };

        // Runoff Continuity — extract volume (ha·m) AND area-referenced depth (mm)
        const precipRow   = extractRunoffRow('Total Precipitation');
        const evapRow     = extractRunoffRow('Evaporation Loss');
        const infilRow    = extractRunoffRow('Infiltration Loss');
        const runoffRow   = extractRunoffRow('Surface Runoff');
        const runonRow    = extractRunoffRow('Surface Runon');
        const storageRow  = extractRunoffRow('Final Storage'); // SWMM outputs "Final Storage", NOT "Final Surface Storage"

        systemStats.runoff.precip         = precipRow.vol;
        systemStats.runoff.precipMm       = precipRow.depthMm;
        systemStats.runoff.evap           = evapRow.vol;
        systemStats.runoff.evapMm         = evapRow.depthMm;
        systemStats.runoff.infil          = infilRow.vol;
        systemStats.runoff.infilMm        = infilRow.depthMm;
        systemStats.runoff.runoff         = runoffRow.vol;
        systemStats.runoff.runoffMm       = runoffRow.depthMm;
        systemStats.runoff.runon          = runonRow.vol;
        systemStats.runoff.finalStorage   = storageRow.vol;
        systemStats.runoff.finalStorageMm = storageRow.depthMm;
        systemStats.runoff.error          = extractStat("Continuity Error", /Continuity Error \(%\)\s*\.+\s+([-\d\.]+)/);

        // Flow Routing Continuity
        // All values are in hectare-m (first column). 1 ha·m = 10 000 m³.
        // The second column (10^6 ltr) is redundant: 1×10^6 ltr = 1 000 m³ → same volume, different unit.
        // Consumer code must multiply by 10 000 to get m³.
        const flowRoutingIdx = report.indexOf('Flow Routing Continuity');
        const flowRoutingSection = flowRoutingIdx !== -1
            ? report.slice(flowRoutingIdx, report.indexOf('\n  *', flowRoutingIdx + 1) >>> 0 || report.length)
            : report;
        const extractFlowStat = (regex) => {
            const match = flowRoutingSection.match(regex);
            return match ? parseFloat(match[1]) : 0;
        };
        systemStats.flow.dryWeatherInflow  = extractFlowStat(/Dry Weather Inflow\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.wetWeatherInflow  = extractFlowStat(/Wet Weather Inflow\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.groundwaterInflow = extractFlowStat(/Groundwater Inflow\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.rdiiInflow        = extractFlowStat(/RDII Inflow\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.externalInflow    = extractFlowStat(/External Inflow\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.externalOutflow   = extractFlowStat(/External Outflow\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.floodingLoss      = extractFlowStat(/Flooding Loss\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.evapLoss          = extractFlowStat(/Evaporation Loss\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.exfilLoss         = extractFlowStat(/Exfiltration Loss\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.initialStoredVol  = extractFlowStat(/Initial Stored Volume\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.finalStoredVol    = extractFlowStat(/Final Stored Volume\s*\.+\s+([-\d\.]+)/);
        const flowErrMatch = flowRoutingSection.match(/Continuity Error \(%\)\s*\.+\s+([-\d\.]+)/);
        systemStats.flow.error = flowErrMatch ? parseFloat(flowErrMatch[1]) : 0;
        systemStats.flow.inflowVol = systemStats.flow.externalInflow;
        // We'll trust the mass balance section if parsed, or regex these specific lines


        return { nodes, edges, subcatchments, systemStats };
    }
}
