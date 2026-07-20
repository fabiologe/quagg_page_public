import { Rasterizer, maskBuildingsAsNoData } from './Rasterizer.js';
import { Hydraulics } from './Hydraulics.js';
import { BoundaryTools } from './BoundaryTools.js';
import { SgcGenerator } from './SgcGenerator.js';
import { latticeToCells, sampleGridZ } from '../utils/BridgeMeshLattice.js';
import { discretizeWeirPolyline } from '../utils/weirGeometry.js';
import { cellEdge, mergeCellsToIntervals, edgeCells } from '../utils/boundarySegments.js';
import {
    discretizeStructureAxis as _discretizeStructureAxis,
    collectBridgePierCells as _collectBridgePierCells,
    collapseBridgeCellsToChannel as _collapseBridgeCellsToChannel,
} from './structureFiles.js';
import { IssueCollector, validateBoundaryHydraulics, validateInflowNozzles, validateBoundaryProfiles, validateWeirOpenings } from './ScenarioValidator.js';

// Mindest-Brückenöffnung [m]: Soffit muss um mind. so viel ÜBER dem lokalen Gelände liegen,
// sonst ist Z=min(Soffit−z0,Soffit−z1) ≤ 0 → der Solver-Orifice (weir_flow.cpp) rechnet sich
// in den „Unexpected Bridge flow calc fail"-Zweig und wird instabil. Zellen darunter (Deck unter
// Grund = Widerlager/ansteigendes Terrain) werden am Export verworfen.
const MIN_BRIDGE_OPENING = 0.05;

/**
 * Ist die Brückenöffnung an dieser Kante degeneriert (Soffit ≤ Gelände+MIN)? Der Solver bildet
 * Z = min(Soffit−z0, Soffit−z1) aus Zelle UND Nachbar quer zur Fließachse → wir prüfen BEIDE.
 * Orientierungs-agnostisch: beide Achsen-Nachbarn (±cs) werden geprüft (konservativ).
 * @returns {boolean} true = Öffnung ≤ 0 → Zelle am Export verwerfen (verhindert „Bridge flow calc fail").
 */
function bridgeOpeningGrounded(soffit, x, y, direction, demGrid, header) {
    if (!demGrid) return false;
    const cs = header.cellsize;
    const tooLow = (px, py) => {
        const dz = sampleGridZ(header, demGrid, px, py);
        return dz != null && soffit <= dz + MIN_BRIDGE_OPENING;
    };
    if (tooLow(x, y)) return true;                       // eigenes Bett (z0)
    const axisY = (direction === 'S' || direction === 'N'); // blockt N-S → Nachbar in y, sonst x
    return axisY ? (tooLow(x, y - cs) || tooLow(x, y + cs))
                 : (tooLow(x - cs, y) || tooLow(x + cs, y)); // Nachbar-Bett (z1)
}

// Suchradius (Zellen) beim NoData-Rescue: nächste gültige Zelle innerhalb dieser Distanz suchen.
// 15 Zellen entspricht bei typischer 1m-Auflösung einem 15m-Suchbereich.
// NoData-Snap-Radius: 15 m (ursprünglich 15 Zellen, kalibriert bei 1m-Auflösung).
// Meter-basiert, damit der Radius bei Export-Resampling konstant bleibt.
const NODATA_SNAP_METERS = 15;
const snapRadiusCells = (header) => Math.max(2, Math.round(NODATA_SNAP_METERS / (header?.cellsize || 1)));

// FREE-Outlet-Fallback: HFIX wird um diesen Betrag [m] unter Geländehöhe gesetzt,
// damit Wasser bereits abfließt bevor die Zelle vollständig überstaut ist.
const FREE_OUTLET_HFIX_OFFSET = 0.01;

/**
 * InputGenerator.js
 * The Orchestrator Module.
 * Coordinates Geometry, Rasterization, and Hydraulics to produce simulation files.
 */
export class InputGenerator {
    constructor() {
        this.reset();
    }

    reset() {
        this.terrainHeader = null;
        this.files = {};
        // Zentraler Fehlercatcher (Schweregrad-getaggt). `this.warnings` bleibt als
        // String[]-Getter für Alt-Konsumenten (Log-Ausgabe) erhalten.
        this.issues = new IssueCollector();
    }

    /** Rückwärtskompatibel: nur die Nachrichten (alle Schweregrade) als String[]. */
    get warnings() { return this.issues.messages; }

    /**
     * Strukturierte Pipeline-Meldung → landet im IssueCollector (für Pre-Run-Gate
     * & UI) und zusätzlich in der Konsole. Standard-Schweregrad: WARN.
     */
    warn(message)  { this.issues.warn(message);  console.warn(`[InputGenerator] ⚠️ ${message}`); }
    info(message)  { this.issues.info(message);  console.info(`[InputGenerator] ℹ️ ${message}`); }
    error(message) { this.issues.error(message); console.error(`[InputGenerator] ⛔ ${message}`); }

    /**
     * Main entry point to process a full scenario input.
     * @param {object} scenario input data
     */
    /**
     * Main entry point to process a full scenario input.
     * @param {object} scenario input data
     * @param {object} fs - Optional Emscripten FS object for direct writing (Streaming)
     */
    processScenario(scenario, fs = null) {
        console.log("[InputGenerator] v2.1 - Connectivity Check ENABLED ✅");
        this.reset();

        // 1. Terrain & Rasterization
        let header, data;
        // ... (existing logic)

        if (scenario.grid) {
            header = scenario.grid.header || scenario.grid;
            data = scenario.grid.data || scenario.grid.gridData;
        } else if (scenario.xyz) {
            const res = Rasterizer.createDemFromXYZ(scenario.xyz);
            header = res.header;
            data = res.data;
        } else {
            throw new Error("InputGenerator: No Terrain Grid or XYZ provided.");
        }

        // Solver rechnet IMMER in nativer DEM-Auflösung. Das frühere Export-Resampling auf eine
        // einstellbare Ziel-Zellweite wurde entfernt (schmaler Nutzen, breite Bug-/Komplexitätsfläche:
        // Halbzellen-Ursprung, Viewer-Mismatch, Editor-vs-Export-Konsistenz). Wer gröber/schneller
        // rechnen will, importiert ein gröberes DEM.
        const editorHeader = header; // surfaceGrid-Lookup nutzt denselben (nativen) Header

        this.terrainHeader = header;

        // ── CFL-Warnung (programmatischer Spiegel zum UI-Gate) ─────────────────
        // dt > dt_max = cs/√(g·h) → Trägheitsschema wird instabil (negative Tiefen/NaN).
        // Der harte Block sitzt in Flood2DSolverRunner.vue; hier nur eine Warnung für
        // programmatische/Test-Pfade, die das UI umgehen.
        {
            const dt = parseFloat(scenario.config?.initial_tstep);
            const terr = scenario.grid || {};
            const maxDepth = Math.max((terr.maxZ ?? 1) - (terr.minZ ?? 0), 0.5);
            const dtMax = header.cellsize / Math.sqrt(9.81 * maxDepth);
            if (Number.isFinite(dt) && dt > dtMax) {
                this.warn(`Zeitschritt dt=${dt}s überschreitet das CFL-Limit dt_max≈${dtMax.toFixed(2)}s (cs=${header.cellsize}m, h≈${maxDepth.toFixed(1)}m) — Risiko negativer Tiefen/NaN. dt ≤ ${(0.8 * dtMax).toFixed(2)}s wählen.`);
            }
        }

        console.log(`[InputGenerator] Terrain Header: ncols=${header.ncols}, nrows=${header.nrows}, cellsize=${header.cellsize}, xll=${header.xll}, yll=${header.yll}`);

        // ── Building NoData-Masking ─────────────────────────────────────────────
        //
        // BUILDING → NoData-Maske (-9999 = Zero-Flux-Boundary für LISFLOOD-FP)
        //            Verhindert numerische Schockwellen durch 90°-Wände.
        //
        const buildingMods = [];

        if (scenario.buildings && scenario.buildings.features) {
            scenario.buildings.features.forEach(f => buildingMods.push({
                type: 'BUILDING',
                geometry: f.geometry,
                properties: f.properties || { height: 10.0 }
            }));
        }
        if (scenario.modifications) {
            scenario.modifications.forEach(m => {
                if (m.type === 'BUILDING') buildingMods.push(m);
            });
        }

        // Gebäude als -9999 (NoData = impermeabler Rand) maskieren.
        // LISFLOOD-FP behandelt -9999-Zellen nativ als Zero-Flux-Boundary →
        // Wasser prallt physikalisch ab ohne +10m-Sloshing-Artefakte.
        if (buildingMods.length > 0) {
            data = maskBuildingsAsNoData(data, header, buildingMods);
            console.log(`[InputGenerator] NoData-Masking: ${buildingMods.length} Gebäude gestempelt.`);
        }

        // Pfeiler werden NICHT mehr ins DGM gebrannt. Eine Brücke wirkt
        // ausschließlich über die Orifice-Geometrie (Querschnittsverengung); ein
        // Pfeiler ist eine lokale volle Sperrung, die weiter unten aus dem SGC-
        // Gerinne (Breite 0) und der .weir-Datei entfernt wird — ohne Geländeeingriff.

        // CRITICAL FIX: The UI expects terrain data to be untouched.
        // We do NOT mutate the global `scenario.grid` pointer here. 
        // `data` is a local modified Float32Array which is correctly passed to `terrain.asc` below via the Rasterizer.
        // Therefore, the Solver receives the masked array, but the Vue global state remains pure.

        // STREAMING WRITE or BUFFERED
        if (fs) {
            console.log("[InputGenerator] Streaming Terrain to MEMFS...");
            Rasterizer.writeGridToFS(fs, '/terrain.asc', data, header);
        } else {
            const ascContent = Rasterizer.gridToASC(data, header);
            this.files['terrain.asc'] = ascContent;
        }


        // 2. Friction
        let useFrictionFile = false;
        let frictionFilename = 'friction.asc';

        // 2a. Surface Grid (Texture Pipeline) — takes priority over polygon roughness
        if (scenario.surfaceGrid && scenario.surfaceMaterials) {
            console.log("[InputGenerator] Surface Grid detected — generating terrain.n (Texture Pipeline)");
            const manningData = this.generateManningFile(scenario.surfaceGrid, scenario.surfaceMaterials, editorHeader, header);
            if (manningData) {
                if (fs) {
                    console.log("[InputGenerator] Streaming terrain.n to MEMFS...");
                    Rasterizer.writeGridToFS(fs, '/terrain.n', manningData.data, manningData.header);
                } else {
                    this.files['terrain.n'] = Rasterizer.gridToASC(manningData.data, manningData.header);
                }
                useFrictionFile = true;
                frictionFilename = 'terrain.n';
            }
        } else if (scenario.roughness) {
            // Legacy: polygon-based roughness map
            const frictionRes = Rasterizer.generateRoughnessMap(header, scenario.roughness);
            if (frictionRes) {
                if (fs) {
                    console.log("[InputGenerator] Streaming Friction to MEMFS...");
                    Rasterizer.writeGridToFS(fs, '/friction.asc', frictionRes.data, frictionRes.header);
                } else {
                    this.files['friction.asc'] = Rasterizer.gridToASC(frictionRes.data, frictionRes.header);
                }
                useFrictionFile = true;
            }
        }

        // 2b. Infiltration (scalar, area-weighted average from surface materials)
        // scenario.infiltration [m/s] — set by Flood2DSolverRunner from surfaceStore.computeWeightedInfiltration()
        if (scenario.infiltration && scenario.infiltration > 0) {
            console.log(`[InputGenerator] Infiltration: ${(scenario.infiltration * 3.6e6).toFixed(2)} mm/h`);
        }

        // 3. Hydraulics - Rain
        let hasRain = false;
        if (scenario.rainSeries && Array.isArray(scenario.rainSeries) && scenario.rainSeries.length > 0) {
            console.log("[InputGenerator] 🌧️ Euler-Regenreihe (rainSeries) in Szenario gefunden, erstelle LISFLOOD .rain");
            const rainContent = this.generateRainFile(scenario.rainSeries);
            if (fs) {
                fs.writeFile('/rain.txt', rainContent);
            } else {
                this.files['rain.txt'] = rainContent;
            }
            hasRain = true;
        } else if (scenario.rain) {
            if (typeof scenario.rain === 'object' && scenario.rain.intensity) {
                const rainContent = Hydraulics.prepareRain(scenario.rain.intensity, scenario.rain.duration || 3600);
                if (fs) fs.writeFile('/rain.txt', rainContent);
                else this.files['rain.txt'] = rainContent;
                hasRain = true;
            }
        }

        // 4. Boundaries (with Flux Splitting) — BCI + BDY (manuelle Boundaries/Manholes + globale
        // Domänen-Randbedingung). Gemeinsame Quelle für Solver UND Editor-Pfeilvorschau (buildBci)
        // → Pre/Post-Processing-Pfeile divergieren nicht.
        const { bciContent, bdyContent } = this.buildBci(scenario, header, data);

        let hasBdy = false;
        if (bdyContent) {
            if (fs) fs.writeFile('/profiles.bdy', bdyContent);
            else this.files['profiles.bdy'] = bdyContent;
            hasBdy = true;
        }

        let hasBci = false;
        if (bciContent) {
            if (fs) fs.writeFile('/flow.bci', bciContent);
            else this.files['flow.bci'] = bciContent;
            hasBci = true;
        }

        // 5a. SGC Sub-Grid-Gerinne (optional, High-End-Pfad) — gezeichnete
        // Kanal-Mittellinie wird als eingebettetes Gerinne (schmaler als eine
        // Zelle möglich) in drei Raster gestempelt. MUSS vor der Wehr-Datei
        // laufen: v8-Brücken (<dir>B) sind nur über SGC-Zellen gültig, daher
        // wird das Breitenraster zum Clippen der Brückenzellen gebraucht.
        //
        // Pfeiler: nach dem Stempeln wird die SGC-Breite an allen Pfeilerzellen
        // auf 0 gesetzt (collectBridgePierCells, rein geometrisch). So sperrt ein
        // Pfeiler den Sub-Grid-Fluss auch UNTER der Soffitte — ohne DGM-Eingriff.
        let hasSgc = false;
        let sgcWidthGrid = null;
        const hasBridges = (scenario.bridges || []).length > 0;
        // SGC = Sub-Grid-CHANNEL, NUR aus einer gezeichneten Bathymetrie-Mittellinie
        // (echtes schmales Flussgerinne). BRÜCKEN brauchen KEIN SGC: der quagg-Patch
        // (weir_flow.cpp) lässt EWeir_Bridge ohne Sub-Grid auf der Floodplain laufen
        // (test_bridge_no_sgc.py). Würden wir SGC für Brücken erzeugen, triggerte das die
        // fragile SGC-Wehr-Validierung in lisflood_processing.cpp (fehlerhafte Face-
        // Indexierung) → „Invalid bridge cell ... either side" → Absturz. Also: kein
        // Auto-SGC unter Brücken.
        if (scenario.sgc && scenario.sgc.polyline?.length >= 2) {
            if ((scenario.sgc.width ?? 0) > 4 * header.cellsize) {
                this.info(`SGC-Gerinne ${scenario.sgc.width} m breit > 4 Zellen (${(4 * header.cellsize).toFixed(1)} m) — besser direkt im DGM auflösen statt Sub-Grid.`);
            }
            if (scenario.sgc.bedMode !== 'absolute' && !((scenario.sgc.bedDepth ?? 0) > 0)) {
                this.warn(`SGC-Sohltiefe ${scenario.sgc.bedDepth} m ungültig (muss > 0 sein) — Gerinne wird trotzdem gestempelt.`);
            }
            const sgcRasters = SgcGenerator.generateSgcRasters(scenario.sgc, data, header);
            if (sgcRasters.cellCount === 0) {
                this.warn('SGC-Gerinne ergibt 0 Zellen im Export-Raster (Polyline außerhalb?) — SGC deaktiviert.');
            } else {
                // Pfeilerzellen aus dem Gerinne stanzen (Breite 0 = volle Sperrung).
                const pierKeys = this.collectBridgePierCells(scenario.bridges || [], header);
                if (pierKeys.size > 0) {
                    const { ncols } = header;
                    let punched = 0;
                    for (const key of pierKeys) {
                        const [col, row] = key.split(',').map(Number);
                        const idx = row * ncols + col;
                        if (sgcRasters.width[idx] > 0) { sgcRasters.width[idx] = 0; punched++; }
                    }
                    if (punched > 0) console.log(`[InputGenerator] Pfeiler: SGC-Breite an ${punched} Zelle(n) auf 0 gesetzt (volle Sperrung, kein DGM-Eingriff).`);
                }
                for (const [name, raster] of [['sgc.width.asc', sgcRasters.width], ['sgc.bed.asc', sgcRasters.bed], ['sgc.bank.asc', sgcRasters.bank]]) {
                    if (fs) Rasterizer.writeGridToFS(fs, '/' + name, raster, header);
                    else this.files[name] = Rasterizer.gridToASC(raster, header);
                }
                hasSgc = true;
                sgcWidthGrid = sgcRasters.width;
                console.log(`[InputGenerator] ✅ SGC: ${sgcRasters.cellCount} Gerinne-Zellen gestempelt (Bathymetrie-Kanal, Breite ${scenario.sgc.width} m).`);
            }
        }

        // 5b. Wehr-Datei (optional) — Wehre + Brücken-Zellen. Im v8-Pfad werden
        // Brücken gegen das SGC-Breitenraster geclippt (Brückenzellen ohne
        // Gerinne darunter sind in LISFLOOD-FP 8 ungültig → würden den Solver
        // mit "Bridge must have sub grid flows on either side" abbrechen).
        let hasWeir = false;
        // Auto-Rück-Barrieren hinter gerichteten Zuläufen (Rückfluss-Sperre, einseitiges Flap-Wehr).
        const inflowBarriers = this.buildInflowBackBarriers(scenario.boundaries || [], scenario.assignments || {}, header, data);
        const allWeirs = [...(scenario.weirs || []), ...inflowBarriers];
        const hasWeirData    = allWeirs.length > 0;
        const hasBridgeData  = scenario.bridges && scenario.bridges.length > 0;
        if (hasWeirData || hasBridgeData) {
            const weirContent = this.generateWeirFile(allWeirs, scenario.bridges || [], header, { engine: scenario.engine || 'v5', sgcWidthGrid, weirLines: scenario.weirLines || [], demGrid: data });
            if (weirContent) {
                if (fs) fs.writeFile('/flow.weir', weirContent);
                else this.files['flow.weir'] = weirContent;
                hasWeir = true;
                // TATSÄCHLICH geschriebene Zeilen melden (v8 re-diskretisiert → Zellzahl ≠ Eingabe-
                // Objektzahl). Die erste Zeile der Datei ist der Eintragszähler von generateWeirFile().
                const writtenLines = parseInt(weirContent.split('\n', 1)[0], 10) || 0;
                const wInput = (scenario.weirs || []).length;
                const bInput = (scenario.bridges || []).length;
                console.log(`[InputGenerator] ✅ flow.weir: ${writtenLines} Struktur-Zeilen geschrieben (aus ${wInput} Wehr- + ${bInput} Brücken-Objekten, engine=${scenario.engine || 'v5'}).`);
            } else {
                this.warn('flow.weir leer (keine gültigen Wehr-/Brückenzeilen, z. B. nach SGC-Clipping) — Strukturdatei wird nicht geschrieben.');
            }
        }

        // 5. Parameter File
        const parContent = this.generateParFile(scenario.config, {
            hasFrictionMap: useFrictionFile,
            hasRain,
            globalRoughness: scenario.globalRoughness,
            hasBci,
            hasBdy,
            frictionFilename,
            hasWeir,
            infiltration: scenario.infiltration ?? 0,
            antecedentMoisture: scenario.antecedentMoisture ?? 0,
            engine: scenario.engine || 'v5',
            scheme: scenario.numericalScheme || 'acceleration',
            hasSgc,
            sgcManningN: scenario.sgc?.manningN ?? 0.03,
            useGpu: scenario.useGpu ?? false
        });

        if (fs) fs.writeFile('/run.par', parContent);
        else this.files['run.par'] = parContent;

        return this.files;
    }

    getVirtualFiles() {
        return this.files;
    }

    /**
     * Helper: Get Grid Index from World Coordinates
     */
    getGridIndex(x, y, header) {
        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const col = Math.round((x - xll) / header.cellsize);
        const row_world = Math.round((y - yll) / header.cellsize);
        const row = (header.nrows - 1) - row_world;
        return { col, row, row_world };
    }

    /**
     * Helper: Rasterize Polyline
     */
    rasterizePolyline(coordinates, header) {
        // Use BoundaryTools for robust discretization
        // Check if coordinates is flat array or array of arrays?
        // GeoJSON LineString is [[x,y], [x,y]]
        // BoundaryTools.discretizePolyline expects [[x,y]...]
        // We need to pass the "Origin" correct for BoundaryTools (it returns x, y_bottom_up)
        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;

        // BoundaryTools returns {x, y} where y is bottom-up index
        const rawCells = BoundaryTools.discretizePolyline(coordinates, header.cellsize, xll, yll);

        // Convert to Top-Down for LISFLOOD
        return rawCells.map(c => ({
            col: c.x,
            row: (header.nrows - 1) - c.y
        }));
    }

    /**
     * Baut den vollständigen BCI-Inhalt (manuelle Boundaries/Manholes + globale Domänen-Randbedingung
     * inkl. NoData-Frontier-Auslässen) sowie den BDY-Inhalt. EINZIGE Quelle der BCI-Wahrheit:
     * wird vom Solver-Pfad (processScenario) UND von der Editor-Pfeil-Vorschau verwendet, damit
     * Pre-/Post-Processing-Pfeile identisch sind.
     *
     * @param {object} scenario
     * @param {object} header  Raster-Header (ncols/nrows/cellsize/xll[corner]/yll[corner])
     * @param {Float32Array} data  Höhen, bottom-up (row 0 = Süden), Gebäude ggf. als NoData maskiert
     * @returns {{ bciContent: string, bdyContent: string }}
     */
    buildBci(scenario, header, data) {
        // Pre-process Assignments: statische Werte → synthetische Ganglinien (sonst kein BDY-Profil).
        const ganglinien = { ...scenario.ganglinien };
        const assignments = { ...scenario.assignments };
        for (const [id, assign] of Object.entries(assignments)) {
            if (assign.type === 'INFLOW_CONSTANT' || assign.type === 'INFLOW_FIX' || assign.type === 'WATERLEVEL_FIX') {
                if (assign.value !== undefined && assign.value !== null) {
                    const val = parseFloat(assign.value);
                    const shortId = id.split('-')[0] || id.substring(0, 8);
                    const synthName = `const_${shortId}`;
                    if (!ganglinien[synthName]) {
                        ganglinien[synthName] = {
                            name: synthName,
                            data: [
                                { t: 0, v: val },
                                { t: (scenario.config?.sim_time || 3600) * 2, v: val }
                            ]
                        };
                    }
                    assignments[id] = { ...assign, profileId: synthName };
                }
            }
        }

        const combinedBoundaries = [
            ...(scenario.boundaries || []),
            ...(scenario.manholes || [])
        ];

        // Hydraulik-Plausibilität (Kanten-Segmente / Innen-Auslauf / Sohlgefälle /
        // Boundary außerhalb Raster) + Nozzle-Tauglichkeit gerichteter Zuläufe in den
        // Pipeline-IssueCollector mergen → erscheint im Pre-Run-Gate.
        this.issues.merge(validateBoundaryHydraulics(scenario.assignments || {}, scenario.boundaries || [], header));
        this.issues.merge(validateInflowNozzles(scenario.assignments || {}, scenario.boundaries || [], header));
        // Aktive Zu-/Wasserstand-Ränder ohne Datenquelle (würden still verworfen)
        // → ERROR ins Pre-Run-Gate. `assignments`/`ganglinien` sind die bereits um
        // synthetische Konstant-Ganglinien angereicherten Kopien (s. o.).
        this.issues.merge(validateBoundaryProfiles(assignments, scenario.boundaries || [], ganglinien));
        // Wehr-Öffnungen (Durchlässe) gegen Krone/Gelände prüfen.
        this.issues.merge(validateWeirOpenings(scenario.weirLines || [], header, data));

        console.log(`[InputGenerator] Total BCI Entities: ${combinedBoundaries.length} (Boundaries: ${scenario.boundaries?.length || 0}, Manholes: ${scenario.manholes?.length || 0})`);

        // EINE Ownership-Map-Pass erzeugt das gesamte BCI: explizite Boundaries
        // claimen ihre Zellen zuerst (explizit gewinnt), danach füllt die globale
        // Randbedingung nur die UNBELEGTEN Rand-/NoData-Front-Zellen. Dadurch kann
        // keine Zelle gleichzeitig Zu- und Ablauf bekommen.
        const { bciContent, bdyContent } = this.generateBoundaryFiles(
            assignments,
            combinedBoundaries,
            ganglinien,
            header,
            data,
            {
                globalBoundaryType: scenario?.globalBoundaryType,
                globalBoundaryHfix: scenario?.globalBoundaryHfix,
            }
        );

        return { bciContent, bdyContent };
    }

    /**
     * Combined BCI + BDY Generation (Ownership-Map). Diskretisierung + Flux-Splitting
     * bleiben; die Zell→BCI-Abbildung läuft über die claimed-Map (explizit gewinnt,
     * globale Füllung nur auf unbelegten Zellen).
     *
     * LISFLOOD QVAR expects flow per unit width (m²/s): user's total Q (m³/s) / (N × cellsize).
     * @returns {{ bciContent: string, bdyContent: string }}
     */
    generateBoundaryFiles(assignments, boundaries, ganglinien, header, gridData, globalOpts = {}) {
        let bdyContent = 'LISFLOOD boundary conditions\n'; // Required comment line (skipped by parser)
        const bdyProfiles = new Map(); // name -> { data: [{t,v}], ndata } — tracks unique profiles

        console.log(`[InputGenerator] Generating BCI+BDY (Ownership-Map). Boundaries: ${boundaries.length}, Assignments: ${Object.keys(assignments).length}`);

        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;

        // ── Ownership-Map ──────────────────────────────────────────────────────
        // Jede Perimeter-/NoData-Front-Zelle gehört GENAU einer Bedingung.
        // claimed: cellKey "col,row" → { role:'inflow'|'outflow'|'stage'|'global' }
        // Explizite Boundaries claimen zuerst; die globale Füllung überspringt belegte Zellen.
        const claimed = new Map();
        const edgeLines = [];   // native N/S/E/W-Zeilen (explizit + global)
        const pointLines = [];  // P-Zeilen (Innenquellen + NoData-Front)
        let boundaryIndex = 0;

        for (const b of boundaries) {
            const assign = assignments[b.id];
            if (!assign) continue;

            // 1. Determine LISFLOOD Type
            let lisfloodType = 'QVAR';
            if (assign.type === 'OUTFLOW_FREE') {
                lisfloodType = 'FREE';
            } else {
                lisfloodType = (assign.type.includes('WATERLEVEL')) ? 'HVAR' : 'QVAR';
            }
            const role = lisfloodType === 'FREE' ? 'outflow' : (lisfloodType === 'HVAR' ? 'stage' : 'inflow');

            // 2. Resolve source profile data
            let sourceProfileData = null;
            let sourceProfileName = '';

            if (lisfloodType !== 'FREE') {
                if (assign.profileId) {
                    const p = ganglinien[assign.profileId];
                    if (p) {
                        sourceProfileName = p.name ? p.name.replace(/\s+/g, '_') : assign.profileId;
                        sourceProfileData = p.data || [];
                    } else {
                        sourceProfileName = assign.profileId;
                    }
                }
                if (!sourceProfileData || sourceProfileData.length === 0) {
                    this.warn(`Boundary ${String(b.id).substring(0, 8)} (${assign.type}): keine Ganglinie zugewiesen — wird NICHT simuliert.`);
                    continue;
                }
            }

            // 3. Discretize Geometry → get cells
            let rawCells = [];
            let isPointSource = false;
            let pointWorldCoords = null;

            if (b.type === 'Feature') {
                if (b.geometry.type === 'Point') {
                    isPointSource = true;
                    pointWorldCoords = b.geometry.coordinates;
                    const c = this.getGridIndex(b.geometry.coordinates[0], b.geometry.coordinates[1], header);
                    rawCells.push({ x: c.col, y: c.row_world });
                } else if (b.geometry.type === 'LineString') {
                    console.log(`[InputGenerator] DIAG Boundary ${b.id}: Input coords =`, JSON.stringify(b.geometry.coordinates));
                    console.log(`[InputGenerator] DIAG Header: xll=${xll}, yll=${yll}, cellsize=${header.cellsize}, ncols=${header.ncols}, nrows=${header.nrows}`);
                    rawCells = BoundaryTools.discretizePolyline(b.geometry.coordinates, header.cellsize, xll, yll);
                    console.log(`[InputGenerator] DIAG Boundary ${b.id}: rawCells (bottom-up) =`, JSON.stringify(rawCells.slice(0, 5)), `... (${rawCells.length} total)`);
                } else if (b.geometry.type === 'Polygon') {
                    rawCells = BoundaryTools.getCellsInPolygon(b.geometry.coordinates[0], header.cellsize, xll, yll);
                }
            }

            // 4. Smart Snapping & Validation
            // IMPORTANT: gridData from parseXYZ is stored in BOTTOM-UP row order
            //   (row 0 = south/minY). row_world from discretizePolyline is also bottom-up.
            //   So we use row_world DIRECTLY for gridData indexing — no flip needed.
            //   finalCells stores {x: col, y: row_world} in bottom-up convention.
            const finalCells = [];
            let noDataCount = 0;
            let rescueFailed = 0;
            for (const rc of rawCells) {
                const col = rc.x;
                const row_world = rc.y; // bottom-up (0 = south)

                if (col < 0 || col >= header.ncols || row_world < 0 || row_world >= header.nrows) {
                    console.warn(`[InputGenerator] Cell out of bounds: col=${col}, row_world=${row_world}`);
                    continue;
                }

                // gridData is bottom-up, row_world is bottom-up → direct index
                const idx = row_world * header.ncols + col;
                if (gridData[idx] <= -9990) {
                    noDataCount++;
                    // findNearestValidCell uses gridData[r * ncols + c], so pass bottom-up row
                    const valid = BoundaryTools.findNearestValidCell(col, row_world, gridData, header, snapRadiusCells(header), 1);
                    if (valid) {
                        if (noDataCount <= 3) console.warn(`[InputGenerator] NoData rescue: (${col},${row_world}) → (${valid.x},${valid.y})`);
                        finalCells.push(valid); // valid is {x: col, y: row} in bottom-up
                    }
                    else {
                        rescueFailed++;
                        console.warn(`[InputGenerator] Cell col=${col}, row_world=${row_world} NoData, rescue failed.`);
                    }
                } else {
                    finalCells.push({ x: col, y: row_world }); // store bottom-up
                }
            }
            if (noDataCount > 0) {
                this.warn(`Boundary ${String(b.id).substring(0, 8)}: ${noDataCount}/${rawCells.length} Zellen lagen auf NoData — ` +
                    `${noDataCount - rescueFailed} verschoben (Snap-Radius ${snapRadiusCells(header)} Zellen), ${rescueFailed} verworfen. Lage prüfen!`);
            }
            console.log(`[InputGenerator] Boundary ${b.id}: ${finalCells.length} valid cells, first:`, JSON.stringify(finalCells.slice(0, 3)));

            if (finalCells.length === 0) {
                console.warn(`[InputGenerator] Boundary ${b.id} yielded 0 valid cells. Skipping.`);
                continue;
            }

            // 5. FLUX SPLITTING — Create scaled profile for this boundary
            let profileNameForBci = '';

            if (lisfloodType !== 'FREE') {
                const cellCount = finalCells.length;
                const isFlow = lisfloodType === 'QVAR';

                // QVAR: LISFLOOD .bci QVAR expects flux per unit width (m²/s).
                // LISFLOOD internally multiplies by cell width for point sources.
                // So: user's total Q (m³/s) / (N_cells × cellsize) = m²/s per cell
                // HVAR: no scaling (elevation-based)
                const scaleFactor = isFlow ? (cellCount * header.cellsize) : 1;

                console.log(`[InputGenerator] Boundary ${b.id}: Type=${lisfloodType}, Cells=${cellCount}, ScaleFactor=${scaleFactor} (isFlow=${isFlow}, Point=${isPointSource})`);

                // Sanitize and truncate profile name to prevent buffer overflow in LISFLOOD
                // LISFLOOD has char[80] buffers. We limit to 50 to leave room for _bXX suffix.
                const safeProfileName = sourceProfileName.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 50);
                profileNameForBci = `${safeProfileName}_b${boundaryIndex}`;

                // Scale the profile data
                const scaledData = sourceProfileData.map(pt => {
                    const scaledValue = pt.v / scaleFactor;
                    if (isFlow && pt === sourceProfileData[0]) { // Log only the first point for QVAR
                        console.log(`[InputGenerator] QVAR: Original=${pt.v}, Scaled=${scaledValue}`);
                    }
                    return { t: pt.t, v: scaledValue };
                });

                // Store for BDY output
                bdyProfiles.set(profileNameForBci, scaledData);

                console.log(`[InputGenerator] Boundary ${b.id}: ${cellCount} cells, cellsize=${header.cellsize}m, scaleFactor=${scaleFactor.toFixed(2)} (${isFlow ? 'QVAR' : 'HVAR'}). Profile: ${profileNameForBci}`);
            }

            // 6. Claim cells in the Ownership-Map.
            //    Eine Zelle, die bereits explizit belegt ist, wird NICHT doppelt
            //    belegt (erstes Explizit gewinnt) → nie Zu- UND Ablauf auf einer Zelle.
            const claimCell = (col, row) => {
                const key = `${col},${row}`;
                if (claimed.has(key)) return false; // bereits belegt (Überlappung)
                claimed.set(key, { role, boundaryId: b.id });
                return true;
            };

            const declaredEdge = b.properties?.edge; // 'N'|'S'|'E'|'W'|null/undefined
            const sf = assign.outflowSlope;
            const sfStr = (Number.isFinite(sf) && sf > 0 && sf <= 0.999) ? ` ${sf.toFixed(6)}` : '';
            const useNativeFree = assign.useNativeFree !== false;

            // Gerichteter INNEN-Zufluss: optionaler Winkel-Token (Welt-Azimut in Grad,
            // 0=Ost, 90=Nord) an der P-QVAR-Zeile → der gepatchte Solver rechnet die
            // Innenzelle mit Impuls. NUR für Zuflüsse (role 'inflow'); nie Auslauf/Pegel.
            // Legacy: fehlt flowAngleDeg, wird flowDir (N/S/E/W) gemappt.
            const dirToken = (role === 'inflow') ? this._inflowAngleToken(assign) : null;

            if (isPointSource && pointWorldCoords) {
                // Reine Punktquelle (Innen): mit optionaler Fließrichtung.
                const cell = finalCells[0];
                if (claimCell(cell.x, cell.y)) {
                    if (lisfloodType === 'FREE') {
                        pointLines.push(this._interiorFreeLine(pointWorldCoords[0], pointWorldCoords[1], cell, header, gridData));
                    } else {
                        const dirSuffix = dirToken ? ` ${dirToken}` : '';
                        pointLines.push(`P ${pointWorldCoords[0].toFixed(4)} ${pointWorldCoords[1].toFixed(4)} ${lisfloodType} ${profileNameForBci}${dirSuffix}`);
                    }
                }
            } else if (declaredEdge && (lisfloodType !== 'FREE' || useNativeFree)) {
                // KANTEN-SEGMENT: Zellen, die wirklich auf der deklarierten Kante liegen,
                // → native N/S/E/W-Zeile mit Impuls. Off-Edge-Zellen (z. B. nach NoData-Rescue
                // verschoben) fallen auf Innenquelle/HFIX zurück.
                const onEdge = [], offEdge = [];
                for (const c of finalCells) {
                    (cellEdge(header, c.x, c.y) === declaredEdge ? onEdge : offEdge).push(c);
                }
                const claimedOnEdge = onEdge.filter(c => claimCell(c.x, c.y));
                if (claimedOnEdge.length > 0) {
                    const intervals = mergeCellsToIntervals(claimedOnEdge, declaredEdge, header);
                    const lisType = lisfloodType === 'FREE' ? `FREE${sfStr}` : `${lisfloodType} ${profileNameForBci}`;
                    for (const iv of intervals) edgeLines.push(`${declaredEdge} ${iv.a.toFixed(4)} ${iv.b.toFixed(4)} ${lisType}`);
                }
                if (offEdge.length > 0) {
                    this.warn(`Boundary ${String(b.id).substring(0, 8)}: ${offEdge.length} Zelle(n) liegen nicht auf der Kante '${declaredEdge}' — als interne Quelle behandelt.`);
                    for (const c of offEdge) this._claimInteriorCell(c, lisfloodType, profileNameForBci, header, gridData, claimCell, pointLines, dirToken);
                }
            } else {
                // INNEN-Linie/-Polygon: Punktquellen je Zelle, mit optionaler Fließrichtung.
                for (const c of finalCells) this._claimInteriorCell(c, lisfloodType, profileNameForBci, header, gridData, claimCell, pointLines, dirToken);
            }

            boundaryIndex++;
        }

        // ── Globale Randbedingung: füllt NUR unbelegte Zellen ──────────────────
        this._fillGlobalBoundary(header, gridData, claimed, edgeLines, pointLines, globalOpts);

        // ── Finale Emission ────────────────────────────────────────────────────
        const bciContent = [...edgeLines, ...pointLines].join('\n') + (edgeLines.length + pointLines.length ? '\n' : '');

        // 7. Write BDY profiles
        for (const [name, data] of bdyProfiles) {
            bdyContent += `${name}\n`;
            bdyContent += `${data.length} seconds\n`;
            for (const pt of data) {
                bdyContent += `${pt.v.toFixed(6)} ${pt.t}\n`;
            }
        }

        return { bciContent, bdyContent };
    }

    /**
     * Winkel-Token (Welt-Azimut in Grad) für einen gerichteten Zufluss bilden.
     * Bevorzugt assign.flowAngleDeg; Legacy-Fallback assign.flowDir (N=90,E=0,S=270,W=180).
     * Gibt einen String (z. B. "135.0") oder null (richtungslos) zurück.
     */
    _inflowAngleToken(assign) {
        const a = assign.flowAngleDeg;
        if (Number.isFinite(a)) {
            const norm = ((a % 360) + 360) % 360; // auf [0,360) normalisieren
            return norm.toFixed(1);
        }
        const LEGACY = { E: 0, N: 90, W: 180, S: 270 };
        if (assign.flowDir in LEGACY) return LEGACY[assign.flowDir].toFixed(1);
        return null;
    }

    /**
     * Gerichteten Zufluss zur echten NOZZLE machen: jede Mündungszelle dreiseitig
     * umschließen (Rückseite + beide Flanken als hohe Wand), nur die Vorderkante(n)
     * in Fließrichtung offen lassen. So MUSS das Wasser gerichtet austreten statt
     * radial zu streuen (LISFLOOD-Punktquelle = ungekappte Massenquelle → sonst
     * Ausbreitung in alle Richtungen).
     *
     * Eine Kante wird gemauert, wenn ihre Außennormale NICHT in Fließrichtung zeigt
     * (n·flow ≤ 0). Kardinal ⇒ 3 Wände/1 offen; Diagonal ⇒ 2 Wände/2 offen.
     * Interne Kanten zwischen zwei benachbarten Zufluss-Zellen bleiben offen (sonst
     * würde eine breite Mündung intern zugemauert).
     *
     * WICHTIG (empirisch im Solver verifiziert, Mikro-Test): das LISFLOOD-Wehr-Tag ist
     * INVERS zur gesperrten Weltrichtung — Tag `N` sperrt den Süd-Nachbarn, `S`→Nord,
     * `E`→West, `W`→Ost. Also Tag = Gegenrichtung der zu sperrenden Kante.
     *
     * Hoher Crest (`z + WALL_FREEBOARD`) ⇒ Fluss=0 in beide Richtungen (solide Wand),
     * da das Wehr nur rechnet, wenn der Wasserspiegel den Crest übersteigt. Synthetische
     * Einträge (ohne lineId) → laufen unverändert durch generateWeirFile (singles).
     * @returns {Array<{x,y,direction,Cd,hc,m,w}>} Wehr-Einträge (Welt-Koordinaten)
     */
    buildInflowBackBarriers(boundaries, assignments, header, gridData) {
        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const cs = header.cellsize;
        const WALL_FREEBOARD = 50.0; // Crest weit über jeder realistischen Stauhöhe ⇒ echte Wand
        const EPS = 1e-6;

        // Kardinalkanten: Außennormale in (col,row)-Raster (Nord = +row, bottom-up).
        // tag = INVERSES LISFLOOD-Wehr-Tag der physischen Sperrrichtung (s. Doc oben).
        const EDGES = [
            { d: 'E', nCol:  1, nRow:  0, tag: 'W' },
            { d: 'W', nCol: -1, nRow:  0, tag: 'E' },
            { d: 'N', nCol:  0, nRow:  1, tag: 'S' },
            { d: 'S', nCol:  0, nRow: -1, tag: 'N' },
        ];

        // Mündungszellen einer Boundary diskretisieren (gleiche Logik wie Emission).
        const mouthCells = (b) => {
            if (b.geometry?.type === 'LineString') {
                return BoundaryTools.discretizePolyline(b.geometry.coordinates, cs, xll, yll);
            } else if (b.geometry?.type === 'Point') {
                const c = this.getGridIndex(b.geometry.coordinates[0], b.geometry.coordinates[1], header);
                return [{ x: c.col, y: c.row_world }];
            }
            return null;
        };

        // ── Pass 1: alle gerichteten Zufluss-Zellen sammeln (für interne-Kanten-Dedup) ──
        const inflowSet = new Set();        // "col,row"
        const directed = [];                // { cells, dCol, dRow }
        for (const b of (boundaries || [])) {
            const assign = assignments[b.id];
            if (!assign) continue;
            if (assign.type !== 'INFLOW_CONSTANT' && assign.type !== 'INFLOW_DYNAMIC') continue;
            const tok = this._inflowAngleToken(assign);
            if (tok === null) continue; // richtungslos ⇒ keine Wand
            const theta = parseFloat(tok) * Math.PI / 180; // Welt-Azimut: 0=Ost, 90=Nord
            const cells = mouthCells(b);
            if (!cells) continue;
            const valid = cells.filter(c => c.x >= 0 && c.x < header.ncols && c.y >= 0 && c.y < header.nrows);
            for (const c of valid) inflowSet.add(`${c.x},${c.y}`);
            directed.push({ cells: valid, dCol: Math.cos(theta), dRow: Math.sin(theta) });
        }
        if (directed.length === 0) return [];

        // ── Pass 2: pro Zelle die Nicht-Vorwärts-Kanten mauern, interne Kanten offen ──
        const out = [];
        const seen = new Set();
        for (const { cells, dCol, dRow } of directed) {
            for (const cell of cells) {
                const idx = cell.y * header.ncols + cell.x;
                let z = (idx >= 0 && idx < gridData.length) ? gridData[idx] : 0;
                if (z <= -9990) z = 0;
                const wx = xll + (cell.x + 0.5) * cs;
                const wy = yll + (cell.y + 0.5) * cs;
                for (const e of EDGES) {
                    const dot = e.nCol * dCol + e.nRow * dRow;
                    if (dot > EPS) continue;                       // Vorderkante ⇒ offen
                    if (inflowSet.has(`${cell.x + e.nCol},${cell.y + e.nRow}`)) continue; // interne Kante
                    const key = `${cell.x},${cell.y},${e.tag}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({ x: wx, y: wy, direction: e.tag, Cd: 1.7, hc: z + WALL_FREEBOARD, m: 0.667, w: cs });
                }
            }
        }
        if (out.length > 0) {
            this.info(`Nozzle-Wand: ${out.length} Kanten-Sperre(n) um gerichtete Zufluss-Zellen (Rückseite + Flanken, Vorderkante offen).`);
        }
        return out;
    }

    /** P-Zeile für eine Innenzelle; optionaler Richtungs-Token (Impuls); FREE → HFIX am Gelände. */
    _claimInteriorCell(cell, lisfloodType, profileName, header, gridData, claimCell, pointLines, dirToken = null) {
        if (!claimCell(cell.x, cell.y)) return;
        const wx = (header.xll !== undefined ? header.xll : header.xllcorner) + (cell.x + 0.5) * header.cellsize;
        const wy = (header.yll !== undefined ? header.yll : header.yllcorner) + (cell.y + 0.5) * header.cellsize;
        if (lisfloodType === 'FREE') {
            pointLines.push(this._interiorFreeLine(wx, wy, cell, header, gridData));
        } else {
            const dirSuffix = dirToken ? ` ${dirToken}` : '';
            pointLines.push(`P ${wx.toFixed(4)} ${wy.toFixed(4)} ${lisfloodType} ${profileName}${dirSuffix}`);
        }
    }

    /** Innenliegender freier Auslauf → HFIX knapp unter Gelände (kritische Tiefe). */
    _interiorFreeLine(wx, wy, cell, header, gridData) {
        const grid_idx = cell.y * header.ncols + cell.x;
        let z = (grid_idx >= 0 && grid_idx < gridData.length) ? gridData[grid_idx] : -9999;
        if (z <= -9990) z = 0;
        const hfix = (z - FREE_OUTLET_HFIX_OFFSET).toFixed(4);
        return `P ${wx.toFixed(4)} ${wy.toFixed(4)} HFIX ${hfix}`;
    }

    /**
     * Globale Randbedingung füllt NUR unbelegte Zellen:
     *  (a) echte Rasterkanten (N/S/E/W) als zusammenhängende native Intervalle,
     *  (b) die NoData-Front (irreguläres Einzugsgebiet) als P-HFIX-Auslauf.
     * CLOSED ⇒ es wird nichts ergänzt.
     */
    _fillGlobalBoundary(header, gridData, claimed, edgeLines, pointLines, { globalBoundaryType, globalBoundaryHfix } = {}) {
        if (!globalBoundaryType || globalBoundaryType === 'CLOSED') return;
        const { ncols, nrows, cellsize: cs } = header;
        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const ND = -9990;
        const type = globalBoundaryType; // 'FREE' | 'HFIX'
        const val = type === 'HFIX' ? ` ${(globalBoundaryHfix ?? 0).toFixed(4)}` : '';

        // (a) Rasterkanten: pro Kante unbelegte, gültige Zellen sammeln → Intervalle
        for (const edge of ['N', 'S', 'E', 'W']) {
            const free = [];
            for (const c of edgeCells(header, edge)) {
                const key = `${c.col},${c.row}`;
                if (claimed.has(key)) continue;
                if (gridData[c.row * ncols + c.col] <= ND) continue; // NoData-Kante überspringen
                claimed.set(key, { role: 'global' });
                free.push(c);
            }
            if (free.length === 0) continue;
            for (const iv of mergeCellsToIntervals(free, edge, header)) {
                edgeLines.push(`${edge} ${iv.a.toFixed(4)} ${iv.b.toFixed(4)} ${type}${val}`);
            }
        }

        // (b) NoData-Front: Außen-NoData per Flood-Fill vom Rasterrand markieren …
        const total = ncols * nrows;
        const exterior = new Uint8Array(total);
        const stack = [];
        const seedExt = (c, r) => {
            if (c < 0 || c >= ncols || r < 0 || r >= nrows) return;
            const k = r * ncols + c;
            if (exterior[k] || gridData[k] > ND) return;
            exterior[k] = 1; stack.push(k);
        };
        for (let c = 0; c < ncols; c++) { seedExt(c, 0); seedExt(c, nrows - 1); }
        for (let r = 0; r < nrows; r++) { seedExt(0, r); seedExt(ncols - 1, r); }
        while (stack.length) {
            const k = stack.pop();
            const c = k % ncols, r = (k - c) / ncols;
            seedExt(c - 1, r); seedExt(c + 1, r); seedExt(c, r - 1); seedExt(c, r + 1);
        }
        // … gültige Innenzellen an Außen-NoData, die NICHT belegt sind → P-HFIX-Auslauf
        const isExt = (c, r) => (c >= 0 && c < ncols && r >= 0 && r < nrows && exterior[r * ncols + c] === 1);
        let frontierCount = 0, capped = false;
        const FRONTIER_CAP = 50000;
        for (let r = 1; r < nrows - 1; r++) {
            for (let c = 1; c < ncols - 1; c++) {
                if (frontierCount >= FRONTIER_CAP) { capped = true; break; }
                const z = gridData[r * ncols + c];
                if (!(z > ND)) continue;
                if (claimed.has(`${c},${r}`)) continue; // explizit/global belegt → kein Front-Auslauf
                if (!(isExt(c - 1, r) || isExt(c + 1, r) || isExt(c, r - 1) || isExt(c, r + 1))) continue;
                const wx = xll + (c + 0.5) * cs;
                const wy = yll + (r + 0.5) * cs;
                const hfix = type === 'HFIX' ? (globalBoundaryHfix ?? 0) : (z - FREE_OUTLET_HFIX_OFFSET);
                claimed.set(`${c},${r}`, { role: 'global' });
                pointLines.push(`P ${wx.toFixed(4)} ${wy.toFixed(4)} HFIX ${hfix.toFixed(4)}`);
                frontierCount++;
            }
            if (capped) break;
        }
        if (capped) this.warn(`NoData-Front-Auslauf bei ${FRONTIER_CAP} Zellen gekappt — Teile der irregulären Küste bekommen keinen Auslauf (Wasser kann dort anstauen).`);
        if (frontierCount > 0) console.log(`[InputGenerator] Globale Randbedingung (${type}): ${frontierCount} NoData-Front-Auslauf-Zellen (unbelegt) ergänzt.`);
    }

    /**
     * Generate .bdy output (Time Series) — Legacy, kept for compatibility
     */
    generateBdyFile(ganglinien) {
        // LISFLOOD BDY format (input.cpp:1599-1685):
        //   Comment line (SKIPPED by parser)
        //   profileName
        //   ndata units
        //   v1 t1      <-- VALUE first, then TIME!
        //   v2 t2
        //   ...
        //   (repeat for each profile)
        let content = 'LISFLOOD boundary conditions\n'; // Required comment line (skipped)
        const visited = new Set();

        for (const [key, profile] of Object.entries(ganglinien)) {
            if (!profile.data || profile.data.length === 0) continue;

            // Name must correspond to what we write in BCI
            const name = profile.name ? profile.name.replace(/\s+/g, '_') : key;

            if (visited.has(name)) continue;
            visited.add(name);

            content += `${name}\n`;
            content += `${profile.data.length} seconds\n`;

            for (const pt of profile.data) {
                content += `${pt.v.toFixed(6)} ${pt.t}\n`;
            }
        }
        return content;
    }

    /**
     * Generate a Manning roughness grid from a surface material grid.
     * Maps each cell's integer material ID to its Manning coefficient.
     * @param {Int8Array} surfaceGrid - Flat grid of material IDs (in EDITOR-Auflösung, srcHeader-Form)
     * @param {Array<{id: number, manning: number}>} materials - Material library
     * @param {object} srcHeader - Header des surfaceGrid (Editor-Auflösung)
     * @param {object} [dstHeader] - Ziel-Header (Export-Auflösung); default = srcHeader
     * @returns {{ header: object, data: Float32Array }|null}
     */
    generateManningFile(surfaceGrid, materials, srcHeader, dstHeader = srcHeader) {
        if (!surfaceGrid || !materials || !srcHeader) return null;

        // Dimensions-Guard: surfaceGrid wird über srcHeader (ncols×nrows) indiziert. Stimmt die
        // Länge nicht (typisch nach Crop/DEM-Wechsel ohne Neu-Malen), würde der NN-Lookup falsche
        // Zellen treffen → räumlich versetzte Reibung. Dann lieber sicher auf globale fpfric fallen.
        const srcSize = srcHeader.ncols * srcHeader.nrows;
        if (surfaceGrid.length !== srcSize) {
            this.warn(`Manning-Raster übersprungen: surfaceGrid (${surfaceGrid.length} Zellen) passt nicht zum `
                + `Terrain (${srcHeader.ncols}×${srcHeader.nrows}=${srcSize}) — vermutlich nach Crop/DEM-Wechsel `
                + `nicht neu bemalt. Fallback auf globale Reibung (fpfric).`);
            return null;
        }

        const ncols = dstHeader.ncols;
        const nrows = dstHeader.nrows;
        const size = ncols * nrows;

        // Build fast lookup: materialId → manning value
        const manningLookup = {};
        for (const m of materials) {
            manningLookup[m.id] = m.manning;
        }
        const defaultManning = 0.035;

        // Quell-Lookup: bei abweichender Auflösung Nearest-Neighbor via Welt-Koordinaten
        // (Material-IDs sind kategorial — bilinear wäre falsch).
        const sameGrid = dstHeader === srcHeader
            || (srcHeader.ncols === ncols && srcHeader.nrows === nrows
                && Math.abs(srcHeader.cellsize - dstHeader.cellsize) < 1e-9);
        const srcCx = srcHeader.xll !== undefined ? srcHeader.xll : srcHeader.xllcorner;
        const srcCy = srcHeader.yll !== undefined ? srcHeader.yll : srcHeader.yllcorner;
        const dstCx = dstHeader.xll !== undefined ? dstHeader.xll : dstHeader.xllcorner;
        const dstCy = dstHeader.yll !== undefined ? dstHeader.yll : dstHeader.yllcorner;

        const data = new Float32Array(size);
        let unknownMatCells = 0;
        for (let r = 0; r < nrows; r++) {
            for (let c = 0; c < ncols; c++) {
                let srcIdx;
                if (sameGrid) {
                    srcIdx = r * ncols + c;
                } else {
                    const wx = dstCx + c * dstHeader.cellsize;
                    const wy = dstCy + r * dstHeader.cellsize;
                    const sc = Math.min(srcHeader.ncols - 1, Math.max(0, Math.round((wx - srcCx) / srcHeader.cellsize)));
                    const sr = Math.min(srcHeader.nrows - 1, Math.max(0, Math.round((wy - srcCy) / srcHeader.cellsize)));
                    srcIdx = sr * srcHeader.ncols + sc;
                }
                const matId = surfaceGrid[srcIdx] || 1;
                const i = r * ncols + c;
                if (manningLookup[matId] !== undefined) {
                    data[i] = manningLookup[matId];
                } else {
                    data[i] = defaultManning;
                    unknownMatCells++;
                }
            }
        }
        if (unknownMatCells > 0) {
            this.warn(`Manning-Raster: ${unknownMatCells} Zellen mit unbekannter Material-ID — Default n=${defaultManning} verwendet.`);
        }

        const outHeader = {
            ncols,
            nrows,
            cellsize: dstHeader.cellsize,
            xllcorner: dstHeader.xllcorner,
            yllcorner: dstHeader.yllcorner,
            xll: dstCx,
            yll: dstCy,
            NODATA_value: -9999
        };

        console.log(`[InputGenerator] Generated Manning file: ${ncols}x${nrows}, materials: ${materials.length}${sameGrid ? '' : ' (resampled NN)'}`);
        return { header: outHeader, data };
    }

    /**
     * Erstellt die .rain Input-Datei für LISFLOOD aus der KOSTRA Zeitreihe.
     *
     * Erwartetes C++ Format (LoadTimeSeries, skipFirstLine=ON):
     *   [Kommentar]                     ← wird übersprungen
     *   [Anzahl_Datenpunkte] [Zeiteinheit]
     *   [Intensität_mm_h] [Zeit_in_s]   ← Spalte 1 = Rate (mm/h), Spalte 2 = Zeit (s)
     *
     * PHYSIK (war die "Sintflut"-Falle):
     *   LISFLOOD interpoliert linear zwischen den Stützstellen und HÄLT den
     *   letzten Wert für alle t ≥ letzter Zeitpunkt KONSTANT (InterpolateTimeSeries
     *   in boundary.cpp: "for values greater than the end of the array – use last
     *   value"). Da sim_time unabhängig von der Regendauer gesetzt wird, regnete
     *   die letzte (kleine, aber ≠ 0) Euler-Block-Intensität bis Simulationsende
     *   weiter → unendlicher Regen.
     *
     *   `rainSeries[i].value_mm` ist die NIEDERSCHLAGSHÖHE (mm) im Intervall, das
     *   BEI time_sec[i] BEGINNT. Um den rechteckigen Euler-Hyetographen massentreu
     *   abzubilden (statt der linearen Rampen, die eine reine Start-Stützstelle
     *   erzeugt), schreiben wir jeden Block als Treppenstufe: konstante Rate von
     *   Blockbeginn bis kurz vor Blockende. Abschließend 0 mm/h → Regen stoppt.
     */
    generateRainFile(rainSeries) {
        const pts = []; // [intensität_mm_h, zeit_s]

        for (let i = 0; i < rainSeries.length; i++) {
            const t_start = Math.round(rainSeries[i].time_sec);

            // Intervalllänge: Differenz zum nächsten Block (bzw. zum vorherigen
            // für den letzten Block, da KOSTRA-Schritte äquidistant sind).
            let dt_sec = 300;
            if (i < rainSeries.length - 1) {
                dt_sec = Math.round(rainSeries[i + 1].time_sec) - t_start;
            } else if (i > 0) {
                dt_sec = t_start - Math.round(rainSeries[i - 1].time_sec);
            }
            if (!Number.isFinite(dt_sec) || dt_sec <= 0) dt_sec = 300;

            const value_mm = Number(rainSeries[i].value_mm) || 0;
            // Höhe (mm) im Intervall → Rate (mm/h): mm / (dt in Stunden)
            const intensity_mmh = value_mm / (dt_sec / 3600);

            // Treppenstufe: konstant über den ganzen Block (Rechteck, massentreu).
            pts.push([intensity_mmh, t_start]);
            if (dt_sec > 1) {
                // 1 s vor Blockende halten; die nächste Stützstelle (Blockbeginn
                // des Folgeblocks) liegt bei t_start+dt → Zeiten bleiben strikt
                // steigend (LoadTimeSeries verlangt das, sonst exit(-1)).
                pts.push([intensity_mmh, t_start + dt_sec - 1]);
            }

            // Regenende sauber auf 0 ziehen, sonst hält LISFLOOD die letzte Rate
            // bis sim_time → Dauerregen ("Sintflut").
            if (i === rainSeries.length - 1) {
                pts.push([0, t_start + dt_sec]);
            }
        }

        // Fallback für leere/degenerierte Reihe: definierter "kein Regen".
        if (pts.length === 0) {
            pts.push([0, 0], [0, 1]);
        }

        let content = 'KOSTRA_Euler_Rain_Profile\n';
        // ZWINGEND: Anzahl der Datenpunkte als Integer vor der Einheit!
        content += `${pts.length} seconds\n`;
        for (const [rate, t] of pts) {
            content += `${rate.toFixed(6)}\t${t.toFixed(0)}\n`;
        }
        return content;
    }

    /**
     * Generiert run.par. Engine-bewusst:
     *   engine 'v5' (WASM/BMI): exakt das bisherige Keyword-Set (Regressions-Gate).
     *   engine 'v8' (RUNPOD):   zusätzlich Schema-Keyword (acceleration|fv1) und
     *                           SGC-Keywords; SGC erzwingt acceleration (sgc.cpp).
     *   porfile (Porosität): bewusst noch nicht angebunden — Platzhalter.
     *
     * @param {object} configOverride  Direkte par-Keywords (sim_time, initial_tstep, ...)
     * @param {object} opts { hasFrictionMap, hasRain, globalRoughness, hasBci, hasBdy,
     *                        frictionFilename, hasWeir, infiltration, antecedentMoisture,
     *                        engine:'v5'|'v8', scheme:'acceleration'|'fv1', hasSgc, sgcManningN }
     */
    generateParFile(configOverride, opts = {}) {
        const {
            hasFrictionMap = false,
            hasRain = false,
            globalRoughness,
            hasBci = false,
            hasBdy = false,
            frictionFilename = 'friction.asc',
            hasWeir = false,
            infiltration = 0,
            antecedentMoisture = 0,
            engine = 'v5',
            scheme = 'acceleration',
            hasSgc = false,
            sgcManningN = 0.03,
            useGpu = false
        } = opts;
        // CRITICAL: Keywords MUST match pars.cpp exactly (strcmp is case-sensitive!)
        // Source: solverHydro/src/lisflood-fp-bmi-v5.9/pars.cpp
        const config = {
            DEMfile: 'terrain.asc',             // Line 37: strcmp(buffer,"DEMfile")
            resroot: 'res',                     // Line 56: strcmp(buffer,"resroot")
            dirroot: 'results',                 // Line 57: strcmp(buffer,"dirroot")
            sim_time: '3600.0',                 // Line 70: strcmp(buffer,"sim_time")
            initial_tstep: '1.0',               // Line 72: strcmp(buffer,"initial_tstep")
            massint: '60.0',                    // Line 73: strcmp(buffer,"massint")
            saveint: '60.0',                    // Line 74: strcmp(buffer,"saveint")
            fpfric: typeof globalRoughness === 'number' ? globalRoughness.toFixed(4) : '0.0350', // Line 62: strcmp(buffer,"fpfric")
            ...configOverride
        };

        if (hasFrictionMap) config.manningfile = frictionFilename; // Line 99: strcmp(buffer,"manningfile")
        if (hasRain)        config.rainfall    = 'rain.txt';       // Line 228: strcmp(buffer,"rainfall")
        if (hasBci)         config.bcifile     = 'flow.bci';       // Line 106: strcmp(buffer,"bcifile")
        if (hasBdy)         config.bdyfile     = 'profiles.bdy';   // Line 107: strcmp(buffer,"bdyfile")
        if (hasWeir)        config.weirfile    = 'flow.weir';      // Line 108: strcmp(buffer,"weirfile")
        config.voutput = '';  // Line 144: enables res-NNNN.Vx/.Vy + res.maxVc/.maxHaz
        if (infiltration > 0) {
            // Vorfeuchte hart auf 0–100 % begrenzen: >100 % würde die Infiltration
            // negativ machen (Wasser aus dem Nichts), <0 % sie überhöhen.
            let moisture = antecedentMoisture ?? 0;
            if (!Number.isFinite(moisture)) moisture = 0;
            if (moisture < 0 || moisture > 100) {
                this.warn(`Vorfeuchte ${moisture} % außerhalb 0–100 % — auf gültigen Bereich begrenzt.`);
                moisture = Math.min(100, Math.max(0, moisture));
            }
            const scaled = infiltration * (1 - moisture / 100);
            if (scaled > 0) config.infiltration = scaled.toFixed(8);
        } // Line 216: strcmp(buffer,"infiltration")

        // ── v8-Keywords (RUNPOD / LISFLOOD-FP 8) ────────────────────────────
        if (engine === 'v8') {
            // SGC erzwingt acceleration (LISFLOOD-FP: pars.cpp setzt bei SGC
            // acceleration=ON; fv1/dg2 sind mit SGC inkompatibel).
            const effectiveScheme = hasSgc ? 'acceleration' : scheme;
            if (hasSgc && scheme !== 'acceleration') {
                this.warn(`Schema '${scheme}' ist mit SGC inkompatibel — acceleration wird erzwungen.`);
            }
            if (effectiveScheme === 'fv1') {
                delete config.acceleration;
                config.fv1 = '';                 // pars.cpp: strcmp(buffer,"fv1")
            } else if (effectiveScheme === 'dg2') {
                delete config.acceleration;
                config.dg2 = '';                 // pars.cpp: strcmp(buffer,"dg2") (CFL 0.33)
            } else {
                config.acceleration = '';
            }
            // GPU: LISFLOOD-FP nutzt CUDA NUR für fv1/dg2 (acceleration + SGC laufen CPU).
            // Das `cuda`-Keyword setzt den GPU-Solver — das Binary muss mit nvcc gebaut sein
            // (build-cuda.sh) und der Container mit --gpus all laufen.
            if (useGpu && (effectiveScheme === 'fv1' || effectiveScheme === 'dg2')) {
                config.cuda = '';                // pars.cpp:884 — GPU-Solver aktivieren
            } else if (useGpu) {
                this.warn(`GPU angefordert, aber Schema '${effectiveScheme}' läuft nur auf CPU (CUDA nur für fv1/dg2).`);
            }
            if (hasSgc) {
                config.SGCwidth = 'sgc.width.asc';   // Kanal-Breitenraster (0 = kein Gerinne)
                config.SGCbed   = 'sgc.bed.asc';     // Sohlhöhenraster
                config.SGCbank  = 'sgc.bank.asc';    // Böschungsoberkante (= DEM)
                config.SGCn     = Number(sgcManningN).toFixed(4); // Gerinne-Manning (skalar)
                config.SGCchan  = '1';               // Rechteck-Querschnitt
            }
            // porfile (Porositätsraster, partielle Zellblockade): bewusst deferred.
        }

        // Acceleration solver: Kompatibel mit Wehren!
        // In fp_flow.cpp prüft FloodplainQ(): weirs ZUERST (Zeile 47/89),
        // Acceleration nur für Nicht-Wehr-Zellen (Zeile 49/91).
        if (config.acceleration !== undefined) {
            console.log("[InputGenerator] ✅ Acceleration solver ENABLED for faster computation.");
        }

        console.log("[InputGenerator] Generating run.par with config:", config);

        let content = '';
        for (const [key, val] of Object.entries(config)) {
            content += `${key.padEnd(20)} ${val}\n`;
        }
        return content;
    }

    /**
     * Diskretisiert eine Struktur-Achse (Welt-Koordinaten) bei der Zellweite
     * des übergebenen Headers — für den Export-Pfad, damit Wehre/Brücken bei
     * feinerem Export-Raster lückenlos bleiben (precomputed Editor-cells[]
     * gelten nur für die native Zellweite).
     *
     * @param {Array<[number,number]>} axisCoords  [[x,y], …] Welt-Koordinaten
     * @param {object} header  Ziel-Raster-Header
     * @returns {Array<{x:number, y:number, col:number, rowBottomUp:number, direction:'E'|'S'}>}
     *          x/y = Zellzentren in Welt-Koordinaten
     */
    // Bauwerks-Diskretisierung → middleware/structureFiles.js (dünne Delegatoren, damit
    // bestehende Aufrufer `this.X(...)` und die Tests unverändert weiterlaufen).
    discretizeStructureAxis(axisCoords, header) {
        return _discretizeStructureAxis(axisCoords, header);
    }

    /**
     * Sammelt die Pfeilerzellen aller MESH3D-Brücken — Zellzentren, die in einem
     * Pfeilerband (lattice.piers) liegen. Rein geometrisch, kein Terrain nötig.
     * Diese Zellen liefern KEINE Orifice-Zeile und werden aus dem SGC-Gerinne
     * gestanzt (Breite 0) — volle Sperrung ohne DGM-Eingriff.
     *
     * @param {Array} bridges  scenario.bridges
     * @param {object} header   Export-Raster-Header
     * @returns {Set<string>}  Schlüssel "col,row" der Pfeilerzellen
     */
    collectBridgePierCells(bridges, header) {
        return _collectBridgePierCells(bridges, header);
    }

    /**
     * Kollabiert die Zellen EINER mesh3d-Brücke in Fließrichtung auf eine
     * einzige Zellreihe: pro Spannposition (quer zur Fließrichtung) bleibt genau
     * EINE Orifice-Zelle übrig — die mit der niedrigsten (restriktivsten)
     * Soffitte über dem SGC-Gerinne.
     *
     * Grund: LISFLOOD-FP 8 unterdrückt den Sub-Grid-Fluss auf JEDER Wehr-/
     * Brückenkante (lisflood_processing.cpp: "don't add the sub-grid calculation
     * where there is a weir"). Zwei in Fließrichtung benachbarte Brückenzellen
     * entziehen sich damit gegenseitig den verlangten Sub-Grid-Fluss und der
     * Solver bricht mit "Invalid bridge cell. Bridge must have sub grid flows on
     * either side." ab. Eine Brücke darf also nur 1 Zelle tief sein; die
     * Stromaufwärts-/-abwärts-Ausdehnung des Decks bildet die Orifice-Physik ab.
     *
     * @param {Array<{col,row,x,y,soffit,direction}>} cells  offene (Nicht-Pfeiler) Zellen
     * @param {object} header
     * @param {Float32Array|null} sgcWidthGrid  bottom-up (0 = kein Gerinne) ODER null
     *        (Floodplain-Brücke ohne SGC) → dann rein geometrischer Collapse.
     * @returns {Array} eine Zelle je Spannposition (1 Zelle tief in Fließrichtung)
     */
    collapseBridgeCellsToChannel(cells, header, sgcWidthGrid) {
        return _collapseBridgeCellsToChannel(cells, header, sgcWidthGrid);
    }

    /**
     * Generiert den Inhalt der LISFLOOD `.weir`-Datei aus dem GeoStore-Wehr-Array.
     *
     * Format:
     *   <n>
     *   <x> <y> <Richtung> <Cd> <hc> <m> <w>
     *   ...
     *
     * Richtungs-Tags:
     *   N/S/E/W            → bidirektionales Poleni-Wehr
     *   NF/SF/EF/WF        → unidirektional (Rückstauklappe)
     *   NB/SB/EB/WB        → Brücke (Orifice-/Druckabfluss, v8-Pfad)
     *
     * Engine-Pfade:
     *   v5 (WASM):  exakt das Legacy-Verhalten — Wehre wie gespeichert, Brücken
     *               als 2-Zeilen-Näherung (Soffit+Deck) aus precomputed cells[].
     *               Byte-identisch zu vorher (Regressions-Gate).
     *   v8 (RUNPOD): Strukturen werden aus ihren Welt-Achsen bei header.cellsize
     *               NEU diskretisiert (lückenlos bei feinem Export-Raster);
     *               Brücken als einzeilige <dir>B-Einträge mit Orifice-Physik.
     *
     * @param {Array<{x,y,direction,Cd,hc,m,w,lineId}>} weirs
     * @param {Array} bridges
     * @param {object} [header]  Export-Raster-Header (nur v8 nötig)
     * @param {{engine?: 'v5'|'v8'}} [opts]
     * @returns {string}
     */
    generateWeirFile(weirs, bridges = [], header = null, { engine = 'v5', sgcWidthGrid = null, weirLines = null, demGrid = null } = {}) {
        const bridgeEntries = [];
        let weirEntries = [...(weirs || [])];

        if (engine === 'v8' && header) {
            // ── v8: Re-Diskretisierung bei Export-Zellweite ──────────────────
            const cs = header.cellsize;

            // Brücken: eine <dir>B-Zeile pro Zelle (Orifice), hc = Soffit, m = Tz
            for (const bridge of (bridges || [])) {
                // 3D-Brückenkörper: Footprint bei Export-Zellweite neu rastern,
                // Soffitte pro Zelle bilinear vom Lattice (Bogen/Voute → per-Zelle-hc).
                if (bridge.kind === 'mesh3d') {
                    const id8 = String(bridge.id).substring(0, 8);
                    // openWidth: reale offene Breite pro Zelle (sub-grid w) statt Zellweite.
                    const meshCells = latticeToCells(bridge, header, null, { openWidth: true });
                    if (meshCells.length === 0) {
                        this.warn(`Brücke ${id8}: Footprint ergibt 0 Zellen im Export-Raster — übersprungen.`);
                        continue;
                    }
                    // Pfeiler wirken SUB-GRID über die offene Breite pro Zelle: cellOpenWidth
                    // (in latticeToCells) zieht den Pfeiler-Anteil quer zur Strömung bereits ab.
                    // Eine Zelle wird daher nur dann ganz verworfen, wenn fast nichts offen bleibt
                    // (W_MIN ≈ voll verbaut); sonst geht ihre REDUZIERTE Breite als w in den Orifice
                    // (Area = w·Z). So sperrt ein Pfeiler kontinuierlich seinen echten Anteil, statt
                    // positionsabhängig 0/100 % einer ganzen Zelle (kein Ganzzellen-Schnapp mehr).
                    const W_MIN = Math.max(0.1, 0.05 * cs);
                    // Soffit-vs-Gelände (Zelle UND Nachbar quer zur Fließachse, wie der Solver):
                    // Öffnung ≤ MIN_BRIDGE_OPENING (Deck unter Grund, z.B. Widerlager) → verwerfen,
                    // sonst Z≤0 → Solver-Orifice-Fail.
                    let buriedCount = 0;
                    let fullyBlocked = 0;
                    let partiallyBlocked = 0;
                    const openCells = meshCells.filter(c => {
                        const wc = c.width ?? cs;
                        if (wc < W_MIN) { fullyBlocked++; return false; }   // voll verbaut (Pfeiler/Rand)
                        if (bridgeOpeningGrounded(c.soffit, c.x, c.y, c.direction, demGrid, header)) { buriedCount++; return false; }
                        if (wc < cs - 1e-6) partiallyBlocked++;             // teilverbaut → reduziertes w
                        return true;
                    });
                    if (buriedCount > 0) {
                        this.warn(`Brücke ${id8}: ${buriedCount} Zelle(n) mit Soffit ≤ Gelände+${MIN_BRIDGE_OPENING}m verworfen (Deck unter Grund — Widerlager/ansteigendes Terrain). Verhindert instabile Orifice-Berechnung ("Bridge flow calc fail").`);
                    }
                    // IMMER auf EINE Zellreihe je Spannposition kollabieren (1 Zelle tief
                    // in Fließrichtung): saubere Brücken-Öffnung statt eines dicken
                    // Orifice-Blocks. Mit SGC zusätzlich gegen das Gerinne gefiltert; ohne
                    // SGC (Floodplain-Brücke, gepatchter Solver) rein geometrisch.
                    const before = openCells.length;
                    const emitCells = this.collapseBridgeCellsToChannel(openCells, header, sgcWidthGrid);
                    if (emitCells.length !== before) {
                        this.info(`Brücke ${id8}: ${before} Zellen → ${emitCells.length} Orifice-Zeile(n) (eine Reihe je Spannposition; Brücke ist in Fließrichtung 1 Zelle tief${sgcWidthGrid ? '' : ', Floodplain ohne SGC'}).`);
                    }
                    // A.3: ohne SGC-Gerinne sitzt die Öffnung auf Floodplain-Höhe → Z = Soffitte − Gelände
                    // statt über der echten Gerinnesohle. Hinweis (kein Auto-Eingriff).
                    if (!sgcWidthGrid && emitCells.length > 0) {
                        this.warn(`Brücke ${id8}: kein SGC-Gerinne darunter — Öffnung rechnet auf Floodplain-Höhe; für genaueres Z ein Gerinne unter der Brücke zeichnen.`);
                    }
                    for (const cell of emitCells) {
                        // w = reale offene Breite der Zelle (sub-grid), Floor knapp > 0; Fallback Zellweite.
                        const wOpen = Math.max(0.05, cell.width ?? cs);
                        bridgeEntries.push({
                            x: cell.x, y: cell.y, direction: cell.direction + 'B',
                            Cd: bridge.Cd ?? 0.8, hc: cell.soffit, m: bridge.Tz ?? 1.5, w: wOpen
                        });
                    }
                    if (fullyBlocked > 0 || partiallyBlocked > 0) {
                        this.info(`Brücke ${id8}: Pfeiler-Verbauung sub-grid — ${partiallyBlocked} Zelle(n) teilverbaut (reduzierte Öffnungsbreite), ${fullyBlocked} Zelle(n) voll gesperrt (< ${W_MIN.toFixed(2)} m offen). Kein DGM-Eingriff.`);
                    }
                    continue;
                }
                const axis = (bridge.axis || []).map(p => [p.x, p.y]);
                let cells;
                if (axis.length >= 2) {
                    cells = this.discretizeStructureAxis(axis, header);
                } else {
                    // Fallback: Legacy-Zellen (alte Projekte ohne axis)
                    cells = (bridge.cells || []).map(c => ({ x: c.x, y: c.y, direction: c.direction || 'S' }));
                }
                if (cells.length === 0) {
                    this.warn(`Brücke ${String(bridge.id).substring(0, 8)}: Achse ergibt 0 Zellen im Export-Raster — übersprungen.`);
                    continue;
                }
                const soffit = bridge.soffit ?? ((bridge.z_sohle ?? 0) + 2.0);
                const width  = bridge.width ?? 5.0;
                const Cd     = bridge.Cd ?? 1.0;
                const Tz     = bridge.Tz ?? 1.5;
                // Soffit-vs-Gelände-Validierung (wie mesh3d): degenerierte Öffnungen verwerfen.
                let buriedLegacy = 0;
                const okCells = !demGrid ? cells : cells.filter(cell => {
                    if (bridgeOpeningGrounded(soffit, cell.x, cell.y, cell.direction, demGrid, header)) { buriedLegacy++; return false; }
                    return true;
                });
                if (buriedLegacy > 0) this.warn(`Brücke ${String(bridge.id).substring(0, 8)}: ${buriedLegacy} Zelle(n) mit Soffit ≤ Gelände verworfen (Deck unter Grund — Orifice-Instabilität vermieden).`);
                if (okCells.length === 0) continue;
                // Öffnungsbreite auf (gültige) Zellen aufteilen: bridge.width pro Zelle zu
                // wiederholen würde die Öffnung N-fach überzählen.
                const wPerCell = Math.min(cs, width / okCells.length);
                if (width > okCells.length * cs) {
                    this.warn(`Brücke ${String(bridge.id).substring(0, 8)}: Öffnungsbreite ${width} m > Strukturlänge ${(okCells.length * cs).toFixed(1)} m — Breite wird gekappt.`);
                }
                for (const cell of okCells) {
                    bridgeEntries.push({ x: cell.x, y: cell.y, direction: cell.direction + 'B', Cd, hc: soffit, m: Tz, w: wPerCell });
                }
            }

            // Brücken gegen SGC clippen: LISFLOOD-FP 8 verlangt für jede <dir>B-
            // Zelle Sub-Grid-Fluss auf BEIDEN Seiten der Fließachse (sgc.cpp:
            // "Bridge must have sub grid flows on either side"). Zellen, die über
            // die Ufer hinausragen oder das Gerinne nicht treffen, werden entfernt.
            if (sgcWidthGrid && bridgeEntries.length) {
                const xll = header.xll !== undefined ? header.xll : header.xllcorner;
                const yll = header.yll !== undefined ? header.yll : header.yllcorner;
                const { ncols, nrows } = header;
                const sgcAt = (col, row) =>
                    (col < 0 || col >= ncols || row < 0 || row >= nrows) ? 0 : (sgcWidthGrid[row * ncols + col] || 0);
                const valid = (e) => {
                    const col = Math.round((e.x - xll) / cs);
                    const row = Math.round((e.y - yll) / cs);   // SGC-Raster ist bottom-up
                    if (sgcAt(col, row) <= 0) return false;
                    const d = e.direction[0];
                    if (d === 'S' || d === 'N') return sgcAt(col, row - 1) > 0 && sgcAt(col, row + 1) > 0;
                    return sgcAt(col - 1, row) > 0 && sgcAt(col + 1, row) > 0; // E/W
                };
                const before = bridgeEntries.length;
                const kept = bridgeEntries.filter(valid);
                const dropped = before - kept.length;
                if (dropped > 0) {
                    if (kept.length === 0) {
                        this.error(`Alle ${before} Brückenzellen liegen nicht über dem SGC-Gerinne — Brücke(n) werden ignoriert. Die Kanal-Mittellinie muss unter der Brücke hindurch verlaufen.`);
                    } else {
                        this.warn(`${dropped} von ${before} Brückenzellen liegen außerhalb des SGC-Gerinnes (über den Ufern) und wurden entfernt — nur Zellen über dem Gerinne bleiben als Brücke wirksam.`);
                    }
                }
                bridgeEntries.length = 0;
                bridgeEntries.push(...kept);
            }

            // Wehre: nach lineId gruppieren, Achse aus erster/letzter Zelle
            // rekonstruieren (Editor zeichnet gerade Segmente), neu diskretisieren.
            const groups = new Map();
            const singles = [];
            for (const w of (weirs || [])) {
                if (w.lineId) {
                    if (!groups.has(w.lineId)) groups.set(w.lineId, []);
                    groups.get(w.lineId).push(w);
                } else {
                    singles.push(w); // Alt-Zellen ohne Linie: unverändert übernehmen
                }
            }
            const weirLineMap = new Map((weirLines || []).map(l => [l.id, l]));
            weirEntries = [...singles];
            for (const [lineId, group] of groups) {
                const first = group[0];
                // Editierbare Polylinie: ALLE Segmente bei Export-Zellweite neu rastern
                // (Knicke bleiben erhalten — nicht nur erste→letzte Zelle).
                const poly = weirLineMap.get(lineId);
                if (poly?.points?.length >= 2) {
                    const cells = discretizeWeirPolyline(poly.points, header, null, { openings: poly.openings || [] });
                    let orificeCount = 0;
                    for (const cell of cells) {
                        if (cell.orifice) {
                            // Rohr/Durchlass → Orifice (<dir>B). Auf dem gepatchten v8-Solver
                            // ohne SGC lauffähig (Floodplain-Fallback). Landet in weirEntries,
                            // umgeht damit das SGC-Bridge-Clipping.
                            // Die durchflusswirksame Breite ist die ECHTE Öffnungsbreite (auf
                            // die Zellweite gekappt) statt pauschal die volle Zelle — ein
                            // schmales Rohr (width < cellsize) bekommt so seinen realen
                            // Querschnitt. Lichte Höhe/Länge/Manning passen nicht in das
                            // 7-Spalten-.weir-Format und erfordern einen Solver-Patch
                            // (quagg-weir-flow.patch) → bewusst nicht hier kodiert.
                            const oW = Math.min(cs, cell.orifice.width ?? cs);
                            weirEntries.push({ x: cell.x, y: cell.y, direction: cell.direction + 'B', Cd: poly.Cd ?? first.Cd, hc: cell.orifice.soffit, m: poly.Tz ?? 1.5, w: oW });
                            orificeCount++;
                        } else {
                            weirEntries.push({ x: cell.x, y: cell.y, direction: cell.direction, Cd: poly.Cd ?? first.Cd, hc: cell.hc ?? poly.hc ?? first.hc, m: poly.m ?? first.m, w: cs });
                        }
                    }
                    if (orificeCount > 0) this.info(`Wehr-Polylinie ${String(lineId).substring(0, 8)}: ${orificeCount} Öffnung(en) als Orifice (<dir>B) exportiert (setzt gepatchten v8-Solver voraus).`);
                    continue;
                }
                if (group.length === 1) { weirEntries.push(group[0]); continue; }
                const last = group[group.length - 1];
                const hcs = group.map(g => g.hc);
                if (Math.max(...hcs) - Math.min(...hcs) > 0.01) {
                    this.warn(`Wehr-Linie ${String(lineId).substring(0, 8)}: Kronenhöhe variiert um ${(Math.max(...hcs) - Math.min(...hcs)).toFixed(2)} m — erste Höhe wird für alle Zellen verwendet.`);
                }
                const cells = this.discretizeStructureAxis([[first.x, first.y], [last.x, last.y]], header);
                for (const cell of cells) {
                    weirEntries.push({
                        x: cell.x, y: cell.y, direction: cell.direction,
                        Cd: first.Cd, hc: first.hc, m: first.m,
                        w: cs // vollflächiges Wehr über die Zellbreite
                    });
                }
            }
        } else {
            // ── v5 (Legacy, byte-identisch): Brücken als 2-Zeilen-Näherung ───
            // soffit-line: hc = z_sohle,  w = bridge.width   (Öffnung unter Brücke)
            // deck-line:   hc = soffit,   w = bridge.width   (Überströmen)
            for (const bridge of (bridges || [])) {
                const cells = bridge.cells || [];
                for (const cell of cells) {
                    const z  = cell.z_sohle ?? cell.z ?? bridge.z_sohle ?? 0;
                    const sf = cell.soffit  ?? bridge.soffit ?? (z + 2.0);
                    const w  = cell.width   ?? bridge.width  ?? 5.0;
                    const Cd = cell.Cd      ?? bridge.Cd     ?? 1.704;
                    const dir = cell.direction || 'S';
                    const x   = cell.x;
                    const y   = cell.y;
                    // soffit-line (opening beneath bridge)
                    bridgeEntries.push({ x, y, direction: dir, Cd, hc: z,  m: 0.667, w });
                    // deck-line (overtopping above soffit)
                    bridgeEntries.push({ x, y, direction: dir, Cd, hc: sf, m: 0.667, w });
                }
            }
        }

        const allEntries = [...weirEntries, ...bridgeEntries];
        if (allEntries.length === 0) return '';

        let out = `${allEntries.length}\n`;
        for (const w of allEntries) {
            out += `${w.x.toFixed(2)} ${w.y.toFixed(2)}  ${w.direction}  ${w.Cd.toFixed(4)}  ${w.hc.toFixed(4)}  ${w.m.toFixed(4)}  ${w.w.toFixed(4)}\n`;
        }
        console.log(`[InputGenerator] Generated flow.weir [${engine}] (${weirEntries.length} weir lines + ${bridgeEntries.length} bridge lines)`);
        return out;
    }
}
