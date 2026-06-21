import { Rasterizer, maskBuildingsAsNoData, burnModifications } from './Rasterizer.js';
import { Hydraulics } from './Hydraulics.js';
import { BoundaryTools } from './BoundaryTools.js';
import { SgcGenerator } from './SgcGenerator.js';
import { latticeToCells, sampleGridZ } from '../utils/BridgeMeshLattice.js';
import { discretizeWeirPolyline } from '../utils/weirGeometry.js';
import {
    discretizeStructureAxis as _discretizeStructureAxis,
    collectBridgePierCells as _collectBridgePierCells,
    collapseBridgeCellsToChannel as _collapseBridgeCellsToChannel,
} from './structureFiles.js';
import { IssueCollector } from './ScenarioValidator.js';

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

        // ── Building NoData-Masking & Terrain-Modifikationen ───────────────────
        //
        // Strategie:
        //   BUILDING   → NoData-Maske (-9999 = Zero-Flux-Boundary für LISFLOOD-FP)
        //               Verhindert numerische Schockwellen durch 90°-Wände.
        //   Sonstige    → Höhen-Delta (Abgrabungen, Teiche, etc.)
        //
        const buildingMods    = [];
        const nonBuildingMods = [];

        if (scenario.buildings && scenario.buildings.features) {
            scenario.buildings.features.forEach(f => buildingMods.push({
                type: 'BUILDING',
                geometry: f.geometry,
                properties: f.properties || { height: 10.0 }
            }));
        }
        if (scenario.modifications) {
            scenario.modifications.forEach(m => {
                (m.type === 'BUILDING' ? buildingMods : nonBuildingMods).push(m);
            });
        }

        // Pass 1: Gebäude als -9999 (NoData = impermeabler Rand) maskieren.
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

        // Pass 2: Sonstige Höhen-Änderungen (Abgrabungen, Teiche, etc.)
        if (nonBuildingMods.length > 0) {
            data = Rasterizer.burnBuildings(data, header, nonBuildingMods);
        }

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
        const hasWeirData    = scenario.weirs   && scenario.weirs.length   > 0;
        const hasBridgeData  = scenario.bridges && scenario.bridges.length > 0;
        if (hasWeirData || hasBridgeData) {
            const weirContent = this.generateWeirFile(scenario.weirs || [], scenario.bridges || [], header, { engine: scenario.engine || 'v5', sgcWidthGrid, weirLines: scenario.weirLines || [], demGrid: data });
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
     * @param {object} assignments  (vor-prozessierte) Zuordnungen
     * @param {object} ganglinien   (vor-prozessierte) Ganglinien
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

        console.log(`[InputGenerator] Total BCI Entities: ${combinedBoundaries.length} (Boundaries: ${scenario.boundaries?.length || 0}, Manholes: ${scenario.manholes?.length || 0})`);

        let { bciContent, bdyContent } = this.generateBoundaryFiles(
            assignments,
            combinedBoundaries,
            ganglinien,
            header,
            data
        );

        // Globale Domänenkanten-Randbedingung: gilt IMMER für den Domänenrand
        // (zusätzlich zu manuellen Punkt-Boundaries), außer bei CLOSED.
        if (scenario?.globalBoundaryType && scenario.globalBoundaryType !== 'CLOSED') {
            const xll  = header.xll  ?? header.xllcorner ?? 0;
            const yll  = header.yll  ?? header.yllcorner ?? 0;
            const xMax = xll + header.ncols * header.cellsize;
            const yMax = yll + header.nrows * header.cellsize;
            const type = scenario.globalBoundaryType;
            const val  = type === 'HFIX' ? ` ${(scenario.globalBoundaryHfix ?? 0).toFixed(4)}` : '';

            // Kanten-Richtungen, die bereits manuell belegt sind, nicht erneut definieren.
            const existingLines = bciContent ? bciContent.split('\n') : [];
            const dirTaken = (d) => existingLines.some(l => l.trimStart().startsWith(d + ' '));

            // Eine rechteckige Domänenkante nur schreiben, wenn diese Perimeter-Reihe/-Spalte
            // tatsächlich Daten enthält (data ist bottom-up, row 0 = Süden).
            const ND0 = -9990;
            const edgeHasData = (d) => {
                if (d === 'S') { for (let c = 0; c < header.ncols; c++) if (data[c] > ND0) return true; return false; }
                if (d === 'N') { const base = (header.nrows - 1) * header.ncols; for (let c = 0; c < header.ncols; c++) if (data[base + c] > ND0) return true; return false; }
                if (d === 'W') { for (let r = 0; r < header.nrows; r++) if (data[r * header.ncols] > ND0) return true; return false; }
                if (d === 'E') { for (let r = 0; r < header.nrows; r++) if (data[r * header.ncols + (header.ncols - 1)] > ND0) return true; return false; }
                return false;
            };

            let edges = '';
            if (!dirTaken('N') && edgeHasData('N')) edges += `N ${xll.toFixed(2)} ${xMax.toFixed(2)} ${type}${val}\n`;
            if (!dirTaken('S') && edgeHasData('S')) edges += `S ${xll.toFixed(2)} ${xMax.toFixed(2)} ${type}${val}\n`;
            if (!dirTaken('E') && edgeHasData('E')) edges += `E ${yll.toFixed(2)} ${yMax.toFixed(2)} ${type}${val}\n`;
            if (!dirTaken('W') && edgeHasData('W')) edges += `W ${yll.toFixed(2)} ${yMax.toFixed(2)} ${type}${val}\n`;

            if (edges) {
                bciContent = (bciContent || '') + edges;
                console.log(`[InputGenerator] Globale Randbedingung (${type}): freie Domänenkanten ergänzt (zusätzlich zu ${existingLines.filter(Boolean).length} manuellen BCI-Zeilen).`);
            }

            // Zusätzlicher Auslauf an der NoData-Front (DEM füllt das Raster oft nicht komplett):
            // an jeder gültigen Zelle, die an "äußeres" (mit dem Domänenrand verbundenes) NoData grenzt.
            const ncols = header.ncols, nrows = header.nrows, cs = header.cellsize;
            const ND = -9990;
            const total = ncols * nrows;

            // 1) Außen-NoData per Flood-Fill vom Rasterrand markieren
            const exterior = new Uint8Array(total);
            const stack = [];
            const seedExt = (c, r) => {
                if (c < 0 || c >= ncols || r < 0 || r >= nrows) return;
                const k = r * ncols + c;
                if (exterior[k] || data[k] > ND) return; // belegt oder gültige Zelle → kein Außen-NoData
                exterior[k] = 1; stack.push(k);
            };
            for (let c = 0; c < ncols; c++) { seedExt(c, 0); seedExt(c, nrows - 1); }
            for (let r = 0; r < nrows; r++) { seedExt(0, r); seedExt(ncols - 1, r); }
            while (stack.length) {
                const k = stack.pop();
                const c = k % ncols, r = (k - c) / ncols;
                seedExt(c - 1, r); seedExt(c + 1, r); seedExt(c, r - 1); seedExt(c, r + 1);
            }

            // 2) Auslauf an gültigen Innenzellen, die an Außen-NoData grenzen
            const isExt = (c, r) => (c >= 0 && c < ncols && r >= 0 && r < nrows && exterior[r * ncols + c] === 1);
            let frontier = '';
            let frontierCount = 0;
            const FRONTIER_CAP = 50000;
            for (let r = 1; r < nrows - 1 && frontierCount < FRONTIER_CAP; r++) {
                for (let c = 1; c < ncols - 1; c++) {
                    const z = data[r * ncols + c]; // data ist bottom-up
                    if (!(z > ND)) continue;
                    if (!(isExt(c - 1, r) || isExt(c + 1, r) || isExt(c, r - 1) || isExt(c, r + 1))) continue;
                    const wx = xll + (c + 0.5) * cs;
                    const wy = yll + (r + 0.5) * cs;
                    const hfix = type === 'HFIX'
                        ? (scenario.globalBoundaryHfix ?? 0)
                        : (z - FREE_OUTLET_HFIX_OFFSET); // FREE → kritische Tiefe via HFIX am Terrain
                    frontier += `P ${wx.toFixed(4)} ${wy.toFixed(4)} HFIX ${hfix.toFixed(4)}\n`;
                    frontierCount++;
                }
            }
            if (frontier) {
                bciContent = (bciContent || '') + frontier;
                console.log(`[InputGenerator] Globale Randbedingung (${type}): ${frontierCount} Auslauf-Zellen an der NoData-Front ergänzt.`);
            }
        }

        return { bciContent, bdyContent };
    }

    /**
     * Combined BCI + BDY Generation with Flux Splitting.
     *
     * LISFLOOD QVAR expects flow per unit width (m²/s).
     * When a boundary has N cells, each cell independently receives the profile value.
     * So we must divide the user's total Q (m³/s) by (N × cellsize) to get per-unit-width.
     *
     * @returns {{ bciContent: string, bdyContent: string }}
     */
    generateBoundaryFiles(assignments, boundaries, ganglinien, header, gridData) {
        let bciContent = '';
        let bdyContent = 'LISFLOOD boundary conditions\n'; // Required comment line (skipped by parser)
        const bdyProfiles = new Map(); // name -> { data: [{t,v}], ndata } — tracks unique profiles

        console.log(`[InputGenerator] Generating BCI+BDY with Flux Splitting. Boundaries: ${boundaries.length}, Assignments: ${Object.keys(assignments).length}`);

        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const processedCells = new Set(); // Avoid duplicates in BCI
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

            // 6. Write BCI lines
            if (finalCells.length > 0) {
                if (isPointSource && pointWorldCoords) {
                    const key = `${pointWorldCoords[0]},${pointWorldCoords[1]}`;
                    if (!processedCells.has(key)) {
                        processedCells.add(key);
                        let line = `P ${pointWorldCoords[0].toFixed(4)} ${pointWorldCoords[1].toFixed(4)} ${lisfloodType}`;
                        if (lisfloodType !== 'FREE') line += ` ${profileNameForBci}`;
                        bciContent += line + '\n';
                    }
                } else {
                    for (const cell of finalCells) {
                        // cell.x = column index (left-to-right, 0 = west)
                        // cell.y = BOTTOM-UP row index (0 = south/minY, nrows-1 = north/maxY)
                        // Convert to world coordinates (bottom-up → world is direct):
                        const wx = xll + (cell.x + 0.5) * header.cellsize;
                        const wy = yll + (cell.y + 0.5) * header.cellsize;
                        const key = `${cell.x},${cell.y}`;
                        if (processedCells.has(key)) continue;
                        processedCells.add(key);

                        let line = '';
                        if (lisfloodType === 'FREE') {
                            // LISFLOOD-2D natively supports FREE only via N/S/E/W boundary specifiers
                            // on the outer perimeter of the computational domain.
                            // For cells on the absolute domain edge, use the native directional form.
                            // For ALL other cells (internal outlets), fall back to HFIX at terrain
                            // elevation minus a tiny epsilon: this forces the water surface at the
                            // outlet to the terrain level, giving a critical-depth weir condition
                            // that reliably allows water to drain without accumulation.

                            const wx_end = wx + header.cellsize;
                            const wy_end = wy + header.cellsize;
                            let edgeLine = '';

                            if (cell.x === 0) edgeLine += `W ${wy.toFixed(4)} ${wy_end.toFixed(4)} FREE\n`;
                            if (cell.x === header.ncols - 1) edgeLine += `E ${wy.toFixed(4)} ${wy_end.toFixed(4)} FREE\n`;
                            if (cell.y === 0) edgeLine += `S ${wx.toFixed(4)} ${wx_end.toFixed(4)} FREE\n`;
                            if (cell.y === header.nrows - 1) edgeLine += `N ${wx.toFixed(4)} ${wy_end.toFixed(4)} FREE\n`;

                            const useNativeFree = assign.useNativeFree !== false; // defaults to true if undefined

                            if (useNativeFree && edgeLine) {
                                // Pure domain-edge outlet — native LISFLOOD FREE is ideal here
                                line = edgeLine.trimEnd();
                            } else {
                                // Internal outlet OR user unchecked useNativeFree — HFIX at terrain level
                                // acts as critical-depth weir. Use terrain_z - FREE_OUTLET_HFIX_OFFSET so water starts draining
                                // before it completely inundates the outlet cell.
                                const grid_idx = cell.y * header.ncols + cell.x;
                                let z = (grid_idx >= 0 && grid_idx < gridData.length) ? gridData[grid_idx] : -9999;
                                if (z <= -9990) z = 0; // NoData fallback
                                const hfix = (z - FREE_OUTLET_HFIX_OFFSET).toFixed(4);
                                line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} HFIX ${hfix}`;
                                console.log(`[InputGenerator] FREE→HFIX fallback at (${cell.x},${cell.y}): terrain=${z.toFixed(3)}, HFIX=${hfix}`);
                            }
                        } else {
                            line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} ${lisfloodType}`;
                            if (lisfloodType !== 'FREE') line += ` ${profileNameForBci}`;
                            line += '\n';
                        }

                        if (line) {
                            bciContent += line;
                        }
                    }
                }
            }

            boundaryIndex++;
        }

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
     * Generate .bci output (Indices)
     * AND Implements Smart Snapping
     */
    generateBciFile(assignments, boundaries, ganglinien, header, gridData) {
        let content = '';
        console.log(`[InputGenerator] Generating BCI. Poly-Boundaries: ${boundaries.length}, Assignments: ${Object.keys(assignments).length}`);

        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const processedCells = new Set(); // Avoid duplicates in BCI

        for (const b of boundaries) {
            const assign = assignments[b.id];
            if (!assign) continue;

            // 1. Determine LISFLOOD Type & Name
            // Output: P col row <Type> <Name>
            let lisfloodType = 'QVAR';
            let profileName = '';

            if (assign.type === 'OUTFLOW_FREE') {
                lisfloodType = 'FREE';
                // No name needed
            } else {
                // Inflow/Stage
                lisfloodType = (assign.type.includes('WATERLEVEL')) ? 'HVAR' : 'QVAR';

                // Resolve Name
                if (assign.profileId) {
                    const p = ganglinien[assign.profileId];
                    if (p) {
                        profileName = p.name ? p.name.replace(/\s+/g, '_') : assign.profileId;
                    } else {
                        profileName = assign.profileId; // Fallback to ID (synthetic)
                    }
                } else {
                    console.warn(`[InputGenerator] Boundary ${b.id} missing profileId/value`);
                    continue;
                }
            }

            // 2. Discretize Geometry
            let rawCells = [];
            let isPointSource = false; // Point sources use real-world coords in BCI!
            let pointWorldCoords = null;
            if (b.type === 'Feature') {
                if (b.geometry.type === 'Point') {
                    isPointSource = true;
                    pointWorldCoords = b.geometry.coordinates; // [x, y] in world coords
                    const p = b.geometry.coordinates;
                    const c = this.getGridIndex(p[0], p[1], header);
                    rawCells.push({ x: c.col, y: c.row_world }); // For validation only
                } else if (b.geometry.type === 'LineString') {
                    rawCells = BoundaryTools.discretizePolyline(b.geometry.coordinates, header.cellsize, xll, yll);
                } else if (b.geometry.type === 'Polygon') {
                    rawCells = BoundaryTools.getCellsInPolygon(b.geometry.coordinates[0], header.cellsize, xll, yll);
                }
            }

            console.log(`[InputGenerator] Processing ${b.id} (${assign.type}). Raw Cells: ${rawCells.length}`);

            // 3. Smart Snapping & Validation
            // Request: "Wenn Zelle NoData oder Out -> Suche spiralig"
            // We check EACH cell.
            const finalCells = [];

            for (const rc of rawCells) {
                // rc is {x: col, y: row_world} (Bottom-up)
                const col = rc.x;
                const row = rc.y;

                // Check 1: Bounds
                if (col < 0 || col >= header.ncols || row < 0 || row >= header.nrows) {
                    // User Request: "Teile der Polylinie, die außerhalb sind, sollten ignoriert werden"
                    // So we do NOT rescue them. We skip.
                    continue;
                }

                // Check 2: NoData
                const idx = row * header.ncols + col;
                if (gridData[idx] <= -9990) { // NoData Found
                    // Attempt Rescue with Connectivity Check (min 1 neighbor)
                    const valid = BoundaryTools.findNearestValidCell(col, row, gridData, header, snapRadiusCells(header), 1);
                    if (valid) {
                        finalCells.push(valid);
                    } else {
                        // Really invalid
                        console.warn(`[InputGenerator] Cell ${col}, ${row} is NoData (Val: ${gridData[idx]}) and Rescue failed (Radius ${snapRadiusCells(header)}).`);
                    }
                } else {
                    // Valid
                    finalCells.push({ x: col, y: row }); // Stores bottom-up
                }
            }

            // Write to content (deduplicate)
            if (finalCells.length > 0) {
                if (isPointSource && pointWorldCoords) {
                    // For Point Sources, we must SNAP to the cell center to avoid LISFLOOD truncation errors
                    // e.g. 56.9 -> 56, 57.0 -> 57.
                    // We already have the grid index in finalCells[0] (should be only 1 cell for Point)

                    const cell = finalCells[0];
                    const wx_snap = xll + (cell.x + 0.5) * header.cellsize;
                    const wy_snap = yll + (cell.y + 0.5) * header.cellsize;

                    console.log(`[InputGenerator] Point Source Snapped: Raw[${pointWorldCoords[0].toFixed(2)},${pointWorldCoords[1].toFixed(2)}] -> Cell[${cell.x},${cell.y}] -> Snapped[${wx_snap.toFixed(2)},${wy_snap.toFixed(2)}]`);

                    const key = `${wx_snap.toFixed(4)},${wy_snap.toFixed(4)}`;
                    if (!processedCells.has(key)) {
                        processedCells.add(key);

                        let line = '';
                        // FIXED: LISFLOOD ignores 'P ... FREE'. Use 'HFIX <elevation>'
                        if (lisfloodType === 'FREE') {
                            const idx = cell.y * header.ncols + cell.x; // cell.y is bottom-up
                            let z = (gridData && idx < gridData.length) ? gridData[idx] : -9999;
                            if (z <= -9990) z = 0;
                            line = `P ${wx_snap.toFixed(4)} ${wy_snap.toFixed(4)} HFIX ${z.toFixed(4)}`;
                        } else {
                            line = `P ${wx_snap.toFixed(4)} ${wy_snap.toFixed(4)} ${lisfloodType}`;
                            if (lisfloodType !== 'FREE') line += ` ${profileName}`;
                        }
                        content += line + '\n';
                    }
                } else {
                    // Edge/Line boundaries: Snap all cells to center
                    for (const cell of finalCells) {
                        // Convert grid indices back to world coordinates (CENTERED)
                        const wx = xll + (cell.x + 0.5) * header.cellsize;
                        const wy = yll + (cell.y + 0.5) * header.cellsize;
                        const key = `${cell.x},${cell.y}`;
                        if (processedCells.has(key)) continue;
                        processedCells.add(key);

                        let line = '';
                        // FIXED: LISFLOOD ignores 'P ... FREE'. We must use 'HFIX <elevation>' to simulate outflow (weir).
                        if (lisfloodType === 'FREE') {
                            const grid_idx = cell.y * header.ncols + cell.x;
                            let z = -9999;
                            if (grid_idx >= 0 && grid_idx < gridData.length) {
                                z = gridData[grid_idx];
                            }
                            if (z <= -9990) z = 0; // Fallback for NoData

                            line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} HFIX ${z.toFixed(4)}`;
                        } else {
                            line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} ${lisfloodType}`;
                            if (lisfloodType !== 'FREE') { // Redundant check but safe
                                line += ` ${profileName}`;
                            }
                        }
                        content += line + '\n';
                    }
                }
            } else {
                console.warn(`[InputGenerator] Boundary ${b.id} yielded 0 valid cells after snapping (Radius ${snapRadiusCells(header)}).`);
            }
        }

        // Return .bci and .bdy content
        return { bciContent: content, bdyContent };
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
                    const meshCells = latticeToCells(bridge, header, null);
                    if (meshCells.length === 0) {
                        this.warn(`Brücke ${id8}: Footprint ergibt 0 Zellen im Export-Raster — übersprungen.`);
                        continue;
                    }
                    // Pfeilerzellen (Zellzentrum im Pfeilerband) liefern kein
                    // Orifice — die volle Sperrung kommt aus der SGC-Breite 0 dort.
                    const pierSkipped = meshCells.filter(c => c.pier).length;
                    // Soffit-vs-Gelände (Zelle UND Nachbar quer zur Fließachse, wie der Solver):
                    // Öffnung ≤ MIN_BRIDGE_OPENING (Deck unter Grund, z.B. Widerlager) → verwerfen,
                    // sonst Z≤0 → Solver-Orifice-Fail.
                    let buriedCount = 0;
                    const openCells = meshCells.filter(c => {
                        if (c.pier) return false;
                        if (bridgeOpeningGrounded(c.soffit, c.x, c.y, c.direction, demGrid, header)) { buriedCount++; return false; }
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
                    for (const cell of emitCells) {
                        bridgeEntries.push({
                            x: cell.x, y: cell.y, direction: cell.direction + 'B',
                            Cd: bridge.Cd ?? 0.8, hc: cell.soffit, m: bridge.Tz ?? 1.5, w: cs
                        });
                    }
                    if (pierSkipped > 0) {
                        this.info(`Brücke ${id8}: ${pierSkipped} Pfeilerzelle(n) voll gesperrt (SGC-Breite 0, kein Orifice) — kein DGM-Eingriff.`);
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
                            weirEntries.push({ x: cell.x, y: cell.y, direction: cell.direction + 'B', Cd: poly.Cd ?? first.Cd, hc: cell.orifice.soffit, m: poly.Tz ?? 1.5, w: cs });
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
