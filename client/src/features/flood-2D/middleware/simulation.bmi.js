/**
 * simulation.bmi.js
 * ==================
 * BMI WebWorker — Das "Gehirn" der eng gekoppelten 1D/2D Hydrodynamik.
 *
 * Architektur:
 *  - Importiert lisflood_bmi.js (separates WASM-Artefakt mit BMI-Interface)
 *  - Baut das virtuelle MEMFS auf (genau wie simulation.main.js)
 *  - Startet den Solver via _bmi_init() (alloziert RAM, tritt noch NICHT in die Loop)
 *  - Taktet den Solver Frame-für-Frame via _bmi_update() in einer asynchronen
 *    Chunk-Schleife (~50 ms pro Chunk), damit der Worker auf abort-Befehle
 *    des User reagieren kann und regelmäßige Fortschritts-Updates postet.
 *  - MUSS _bmi_finalize() aufrufen (C++-Heap freigeben), egal wie die
 *    Simulation endet (fertig, fehler, user-abort).
 *
 * Exported BMI-Funktionen (aus build_wasm.sh):
 *   _bmi_init(parFilePath)       → int   (0 = OK)
 *   _bmi_update()                → int   (rechnet exakt 1x iterateq_step())
 *   _bmi_get_time()              → double
 *   _bmi_get_dt()                → double
 *   _bmi_get_water_depth(index)  → double  (Arrptr->H[index])
 *   _bmi_add_water(index, vol)   → void    (H[i] += vol / (dx*dy))
 *   _bmi_finalize()              → void    (ruft final() auf)
 */

// Berechne die Basis-URL des Workers aus import.meta.url.
const _workerBaseUrl = new URL('.', import.meta.url).href;

let LisfloodBMI = null;
import { OutputProcessor as OP } from './OutputProcessor.js';
let OutputProcessor = OP;
import { culvertFlow } from './culvertHydraulics.js';

/**
 * Lädt ein JS-Modul aus einer URL über fetch → Blob → import().
 * Umgeht Vite's Import-Analyse und Browser-CORS für Cross-Origin Worker.
 */
async function loadModuleFromUrl(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch module: ${url} (${resp.status})`);
    const src  = await resp.text();
    const blob = new Blob([src], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const mod  = await import(blobUrl);
    URL.revokeObjectURL(blobUrl);
    return mod;
}

// ─── Global Error Handler ────────────────────────────────────────────────────

self.onerror = function (msg, url, line, col, error) {
    console.error(`[BMI Worker Global Error] ${msg} at ${line}:${col}`, error);
    postMessage({ type: 'ERROR', error: `Global Worker Error: ${msg} (${line}:${col})` });
};

self.onunhandledrejection = function (e) {
    console.error('[BMI Worker Unhandled Rejection]', e.reason);
    postMessage({ type: 'ERROR', error: `Unhandled Rejection: ${e.reason}` });
};

// ─── Worker State ────────────────────────────────────────────────────────────

/** @type {object|null}  Emscripten Module nach Initialisierung */
let Module = null;
/** @type {object|null}  Emscripten FS-Handle */
let FS = null;
/** @type {'IDLE'|'INITIALIZING'|'RUNNING'|'FINISHED'|'ABORTED'|'ERROR'} */
let currentState = 'IDLE';
/** Abort-Flag — wird auf true gesetzt wenn der Main-Thread 'abort' sendet */
let abortRequested = false;
/** Menge bereits gesendeter Ergebnisdateien (verhindert doppelte Übertragung) */
let processedFiles = new Set();

/**
 * Aktive Culvert-Liste — wird vor dem Start der Simulation befüllt.
 * Jedes Objekt hat nach dem Index-Mapping:
 * { inIndex, outIndex, maxQ, zIn, zOut }
 * wobei zIn/zOut die Geländehöhe [mNN] aus dem DGM-Grid sind.
 * @type {Array<{inIndex: number, outIndex: number, maxQ: number, zIn: number, zOut: number}>}
 */
let activeCulverts = [];

/**
 * Zellfläche [m²] = cellsize²
 * @type {number}
 */
let cellArea = 1;

console.log('[BMI Worker] Script loaded.');

// ─── Message Handler ─────────────────────────────────────────────────────────

self.onmessage = async (e) => {
    const { cmd, payload, type } = e.data || {};

    // ── Vite HMR Guard ────────────────────────────────────────────────────────
    // In Dev-Mode injiziert Vite HMR-Events (z.B. { type: 'connected' }) in
    // Module-Worker. Diese haben kein 'cmd' Feld und dürfen nicht verarbeitet werden.
    if (!cmd && type !== 'abort') {
        return;
    }

    // ── Abort-Signal (kann jederzeit ankommen) ────────────────────────────────
    if (type === 'abort' || cmd === 'CMD_ABORT') {
        sendLog('⛔ Abort requested by user.');
        abortRequested = true;
        // _bmi_finalize() wird am Ende von simulateChunk() aufgerufen,
        // sobald die laufende Iteration fertig ist.
        return;
    }

    try {
        switch (cmd) {

            // ── CMD_INIT: WASM-Modul laden ────────────────────────────────────
            case 'CMD_INIT': {
                if (Module) {
                    sendLog('Module already initialized.');
                    postMessage({ type: 'STATUS', status: 'READY' });
                    return;
                }

                currentState = 'INITIALIZING';
                sendLog('Initializing LISFLOOD BMI WASM...');

                // OutputProcessor wird nun statisch importiert
                if (!OutputProcessor) {
                    sendLog('OutputProcessor loaded.');
                }

                // Emscripten-Modul aus public/ laden
                if (!LisfloodBMI) {
                    sendLog('Loading Emscripten module via fetch...');
                    const resp = await fetch('/flood-engine/lisflood_bmi.js');
                    const src  = await resp.text();
                    const blob = new Blob([src], { type: 'application/javascript' });
                    const url  = URL.createObjectURL(blob);
                    const mod  = await import(url);
                    URL.revokeObjectURL(url);
                    LisfloodBMI = mod.default;
                }

                Module = await LisfloodBMI({
                    // stdout → Progress-Parsing + UI-Log
                    print: (text) => {
                        if (!text) return;
                        if (!text.startsWith('t=') && !text.startsWith('BMI:') && !text.startsWith('Status:')) {
                            sendLog(`[SOLVER] ${text}`);
                        }
                    },
                    // stderr → Fehler & Instabilitäts-Warnung
                    printErr: (text) => {
                        if (!text?.trim()) return;
                        sendLog(`[SOLVER ERR] ${text}`);
                        if (text.includes('CFL') || text.includes('Mass Balance')) {
                            postMessage({ type: 'ERROR', error: text });
                        }
                        if (text.includes('h <') || text.includes('Depth negative')) {
                            postMessage({
                                type: 'WARNING',
                                code: 'INSTABILITY',
                                message: 'Numerical Instability detected (Negative Depth). Check Time Step.'
                            });
                        }
                    },
                    // WASM-Datei-URL (muss auf lisflood_bmi.wasm zeigen)
                    locateFile: (path) => {
                        if (path.endsWith('.wasm')) {
                            return '/flood-engine/lisflood_bmi.wasm';
                        }
                        return path;
                    },
                    setStatus: (text) => {
                        if (text) sendLog(`[WASM STATUS] ${text}`);
                    },
                    monitorRunDependencies: (left) => {
                        if (left > 0) sendLog(`[WASM] Loading... (${left} dependencies left)`);
                    }
                });

                FS = Module.FS;
                sendLog('LISFLOOD BMI WASM ready.');
                currentState = 'IDLE';
                postMessage({ type: 'STATUS', status: 'READY' });
                break;
            }

            // ── CMD_RUN: Simulation starten ───────────────────────────────────
            case 'CMD_RUN': {
                if (!Module) {
                    throw new Error('Module not initialized. Send CMD_INIT first.');
                }
                if (currentState === 'RUNNING') {
                    sendLog('Simulation already running.');
                    return;
                }

                abortRequested = false;
                processedFiles = new Set();
                currentState = 'RUNNING';
                sendLog('Preparing simulation files...');

                // 1. Input-Dateien vorbereiten ─────────────────────────────────
                let files = payload.files;

                if (!files && payload.scenarioData) {
                    sendLog('Generating input files in worker (streaming mode)...');
                    try {
                        const generator = new InputGenerator();
                        files = generator.processScenario(payload.scenarioData, FS);
                        sendLog('Input generation complete.');
                    } catch (err) {
                        throw new Error(`Input Generation Failed: ${err.message}`);
                    }
                }

                // Legacy-Pfad: Dateien als Payload überliefert
                if (files && Object.keys(files).length > 0) {
                    for (const [filename, content] of Object.entries(files)) {
                        FS.writeFile('/' + filename, content);
                        sendLog(`Written ${filename} to MEMFS.`);
                    }
                }

                // MEMFS-Verzeichnisse + CWD einrichten
                FS.chdir('/');
                try { FS.mkdir('/results'); } catch (_) {}
                try { FS.mkdir('/res');     } catch (_) {}

                // Alle geschriebenen Dateien loggen (Debugging)
                try {
                    const rootFiles = FS.readdir('/');
                    sendLog(`MEMFS Root: ${rootFiles.join(', ')}`);
                } catch (_) {}

                // 2. BMI initialisieren ────────────────────────────────────────
                //    bmi_init() = init() + init_iterateq(); tritt NICHT in Loop ein.
                sendLog('Calling _bmi_init("run.par")...');
                const initCode = Module.ccall(
                    'bmi_init',
                    'number',
                    ['string'],
                    ['run.par']
                );

                if (initCode !== 0) {
                    throw new Error(`bmi_init failed with exit code ${initCode}.`);
                }
                sendLog('BMI init successful. Entering simulation loop...');

                // 3. Culvert-Index-Mapping (einmalig vor der Schleife) ─────────
                //    Konvertiert Welt-Koordinaten (X/Y) in 1D-Array-Indices
                //    des LISFLOOD-Grids. Muss nach bmi_init() passieren,
                //    da erst dann der Grid-Header bekannt ist.
                const rawCulverts = payload.culverts ?? [];
                const dmgHeader   = payload.header   ?? null;

                if (rawCulverts.length > 0 && dmgHeader) {
                    cellArea = dmgHeader.cellsize * dmgHeader.cellsize;

                    // Zwei getrennte Koordinatensysteme:
                    //   get1DIndex()  → TOP-DOWN  (row 0 = Norden) für LISFLOOD Arrptr->H
                    //   getDemIndex() → BOTTOM-UP (row 0 = Süden)  für Vue gridData
                    const dem = payload.scenarioData?.grid?.gridData ?? null;

                    activeCulverts = rawCulverts.map((culvert, i) => {
                        // LISFLOOD-Index (top-down) für _bmi_get_water_depth / _bmi_add_water
                        const inIndex  = get1DIndex(culvert.inX,  culvert.inY,  dmgHeader);
                        const outIndex = get1DIndex(culvert.outX, culvert.outY, dmgHeader);

                        // gridData-Index (bottom-up) für Geländehöhe aus Vue-Store
                        const demInIdx  = getDemIndex(culvert.inX,  culvert.inY,  dmgHeader);
                        const demOutIdx = getDemIndex(culvert.outX, culvert.outY, dmgHeader);

                        // Geländehöhe [mNN] — NODATA (-9999) → 0 als Fallback
                        const zIn  = (dem && dem[demInIdx]  > -9000) ? dem[demInIdx]  : 0;
                        const zOut = (dem && dem[demOutIdx] > -9000) ? dem[demOutIdx] : 0;

                        sendLog(`🔌 Culvert ${i}: in[${culvert.inX.toFixed(1)}, ${culvert.inY.toFixed(1)}]→idx=${inIndex} z=${zIn.toFixed(2)}m  out[${culvert.outX.toFixed(1)}, ${culvert.outY.toFixed(1)}]→idx=${outIndex} z=${zOut.toFixed(2)}m  D=${culvert.diameter ?? '?'}m`);
                        return {
                            inIndex, outIndex,
                            // hydraulic parameters (fall back to legacy maxQ if not provided)
                            z_in:      culvert.z_in      ?? zIn,
                            z_out:     culvert.z_out     ?? zOut,
                            diameter:  culvert.diameter  ?? 1.0,
                            length:    culvert.length    ?? 10.0,
                            manning_n: culvert.manning_n ?? 0.013,
                            Cd:        culvert.Cd        ?? 0.6,
                            // legacy fallback
                            maxQ: culvert.maxQ ?? null,
                            zIn, zOut,
                        };
                    });
                    sendLog(`🔌 ${activeCulverts.length} Culvert(s) mapped. cellArea = ${cellArea.toFixed(2)} m²`);
                } else {
                    activeCulverts = [];
                    if (rawCulverts.length > 0 && !dmgHeader) {
                        sendLog('⚠️ Culverts provided but no DGM header — index mapping skipped!');
                    }
                }


                // 4. Chunk-Schleife starten ───────────────────────────────────
                const maxTime = payload.maxTime ?? getMaxTimeFromPar();
                sendLog(`Simulation target: t_max = ${maxTime.toFixed(1)} s`);
                kickoffChunkLoop(maxTime);

                break;
            }

            default:
                sendLog(`Unknown command: "${cmd}"`);
        }

    } catch (err) {
        handleError(err, 'WorkerMessageHandler');
    }
};

// ─── Chunk-Loop ───────────────────────────────────────────────────────────────

/**
 * Startet die asynchrone Chunk-Schleife über setTimeout.
 * Jeder Chunk läuft maximal CHUNK_BUDGET_MS, dann gibt er den
 * JS-Thread frei, damit der Worker abort-Nachrichten verarbeiten kann.
 *
 * @param {number} maxTime  Simulationsendzeit in Sekunden
 */
function kickoffChunkLoop(maxTime) {
    const CHUNK_BUDGET_MS = 50; // Budget pro Chunk — hält Worker reaktionsfähig

    function simulateChunk() {
        // ── Abbruch durch User ────────────────────────────────────────────────
        if (abortRequested) {
            sendLog('⛔ Simulation aborted by user. Finalizing...');
            safeFinalize();
            currentState = 'ABORTED';
            postMessage({ type: 'STATUS', status: 'ABORTED' });
            return;
        }

        let currentTime;
        let dt;
        const chunkStart = performance.now();

        try {
            // ── Inner Tight Loop: rechnet bis Budget aufgebraucht ─────────────
            while (true) {
                // a) Aktuellen Zeitschritt auslesen
                currentTime = Module._bmi_get_time();
                dt          = Module._bmi_get_dt();

                // Simulationsende erreicht?
                if (currentTime >= maxTime) break;

                // ── 1D/2D Torricelli-Rohrhydraulik ────────────────────────────
                // Physikalische Druckabfluss-Berechnung VOR dem 2D-Zeitschritt.
                // Nutzt Wasserspiegelhöhe (WSE = H + z_Gelände) beider Zellen
                // für bidirektionalen Fluss und Torricelli-throttling.
                if (activeCulverts.length > 0) {
                    for (const culvert of activeCulverts) {

                        // ─ 1. Wasserspiegellage (WSE) beider Zellen ───────────
                        const hIn  = Module._bmi_get_water_depth(culvert.inIndex);
                        const hOut = Module._bmi_get_water_depth(culvert.outIndex);
                        const wseIn  = hIn  + culvert.zIn;
                        const wseOut = hOut + culvert.zOut;

                        // ─ 2. Hydraulischer Durchfluss (4-Zustands-Modell) ───
                        // culvertFlow: DRY / FREE_FLOW / PRESSURE / BACKWATER
                        // Positiv = In→Out, Negativ = Rückstau Out→In
                        const currentQ = culvert.maxQ != null
                            // Legacy-Pfad: kein Rohrdurchmesser → altes Torricelli
                            ? culvert.maxQ * Math.min(1.0, Math.sqrt(Math.abs(wseIn - wseOut)))
                            : culvertFlow(wseIn, wseOut, culvert);

                        if (Math.abs(currentQ) < 1e-9) continue;

                        const desiredV  = Math.abs(currentQ) * dt;
                        const direction = Math.sign(currentQ); // +1 = vorwärts, -1 = rückwärts

                        // ─ 3. Massensicherer Transfer ────────────────────────
                        const srcIndex = direction > 0 ? culvert.inIndex  : culvert.outIndex;
                        const dstIndex = direction > 0 ? culvert.outIndex : culvert.inIndex;
                        const srcDepth = direction > 0 ? hIn : hOut;

                        const availableV = Math.max(0, (srcDepth - 0.001)) * cellArea;
                        const transferV  = Math.min(desiredV, availableV);

                        // ─ 4. Injektion in den C++-Speicher ──────────────────
                        if (transferV > 1e-9) {
                            Module._bmi_add_water(srcIndex, -transferV);
                            Module._bmi_add_water(dstIndex,  transferV);
                        }
                    }
                }
                // ─────────────────────────────────────────────────────────────

                // b) Einen 2D-Zeitschritt berechnen
                Module._bmi_update();

                // Chunk-Budget abgelaufen? → Schleife unterbrechen
                if (performance.now() - chunkStart >= CHUNK_BUDGET_MS) break;
            }

        } catch (err) {
            // ExitStatus(0) bedeutet planmäßiges Solver-Ende (kein Fehler)
            if (err?.name === 'ExitStatus' && err?.status === 0) {
                currentTime = maxTime; // Erzwingt Abschluss-Branch unten
            } else {
                handleError(err, 'simulateChunk');
                safeFinalize();
                return;
            }
        }

        // ── Fortschritt-Update an Frontend ───────────────────────────────────
        const progress = maxTime > 0 ? Math.min(currentTime / maxTime, 1.0) : 0;
        postMessage({
            type: 'PROGRESS_UPDATE',
            time: currentTime,
            dt:   dt,
            progress // 0.0 – 1.0
        });

        // ── Simulation abgeschlossen ──────────────────────────────────────────
        if (currentTime >= maxTime) {
            sendLog(`✅ Simulation complete at t=${currentTime.toFixed(2)} s`);
            collectAndSendResults();
            safeFinalize();
            currentState = 'FINISHED';
            postMessage({ type: 'STATUS', status: 'FINISHED' });
            return;
        }

        // ── Nächsten Chunk einplanen ──────────────────────────────────────────
        // setTimeout(fn, 0) gibt Kontrolle an die Event-Queue zurück,
        // damit async onmessage (z.B. 'abort') verarbeitet werden kann.
        setTimeout(simulateChunk, 0);
    }

    // Ersten Chunk über setTimeout starten (nicht blockierend)
    setTimeout(simulateChunk, 0);
}

// ─── Ergebnisse sammeln und senden ───────────────────────────────────────────

/**
 * Lies alle Raster-Ergebnisse aus dem MEMFS /results-Verzeichnis
 * und sende sie als transferable RESULT-Messages an den Main-Thread.
 */
function collectAndSendResults() {
    if (!FS) return;

    try {
        const files = FS.readdir('/results');
        sendLog(`[Results] Files in /results: ${files.join(', ')}`);

        // res-0001.wd, res-0002.wd, …
        const resultPattern = /^res-\d+\.wd$/;

        for (const file of files) {
            if (file === '.' || file === '..') continue;
            if (!resultPattern.test(file)) continue;
            if (processedFiles.has(file)) continue;

            const path = '/results/' + file;

            try {
                const content = FS.readFile(path, { encoding: 'binary' });
                const result  = OutputProcessor.parseAsync(content);

                // Datei nach Lesen sofort entfernen (MEMFS entlasten)
                try { FS.unlink(path); } catch (_) {}

                if (!result.isValid) {
                    console.error(`[BMI Worker] Invalid output file ${file}: ${result.error}`);
                    continue;
                }

                processedFiles.add(file);

                if (result.hasNegativeDepth) {
                    postMessage({ type: 'WARNING', message: 'Solver Instability Detected' });
                }

                const frameMatch = file.match(/(\d+)/);
                const frameId    = frameMatch ? parseInt(frameMatch[1], 10) : 0;

                postMessage(
                    {
                        type:    'RESULT',
                        frame:   frameId,
                        payload: result.data,
                        header:  result.header,
                        min:     result.min,
                        max:     result.max
                    },
                    // Transferable: übergibt den Buffer ohne Kopie an den Main-Thread
                    [result.data.buffer]
                );

            } catch (fileErr) {
                sendLog(`⚠️ Could not process ${file}: ${fileErr.message}`);
            }
        }

    } catch (e) {
        sendLog(`❌ Error reading /results: ${e.message}`);
    }
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Welt-Koordinaten → linearer Index für LISFLOOD Arrptr->H (TOP-DOWN, row 0 = Norden).
 * Math.floor ist zwingend damit der Index mit dem C++ ESRI Reader übereinstimmt.
 */
function get1DIndex(x, y, header) {
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;
    const { cellsize, nrows, ncols } = header;
    const rawCol    = Math.floor((x - xll) / cellsize);
    const row_world = Math.floor((y - yll) / cellsize);
    const rawRow    = (nrows - 1) - row_world; // bottom-up → top-down
    const col = Math.max(0, Math.min(ncols - 1, rawCol));
    const row = Math.max(0, Math.min(nrows - 1, rawRow));
    return row * ncols + col;
}

/**
 * Welt-Koordinaten → linearer Index für Vue gridData (BOTTOM-UP, row 0 = Süden).
 * Gegenstück zu get1DIndex() — kein Invertieren nötig da gridData bottom-up gespeichert ist.
 */
function getDemIndex(x, y, header) {
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;
    const { cellsize, nrows, ncols } = header;
    const col = Math.max(0, Math.min(ncols - 1, Math.floor((x - xll) / cellsize)));
    const row = Math.max(0, Math.min(nrows - 1, Math.floor((y - yll) / cellsize)));
    return row * ncols + col;
}

/**
 * Lies sim_time aus der run.par im MEMFS aus — Fallback wenn maxTime
 * nicht im CMD_RUN-Payload übergeben wurde.
 * @returns {number} Simulationsendzeit in Sekunden (default 3600)
 */
function getMaxTimeFromPar() {
    try {
        const parContent = FS.readFile('/run.par', { encoding: 'utf8' });
        const match = parContent.match(/sim_time\s+([\d.]+)/);
        if (match) return parseFloat(match[1]);
    } catch (_) {}
    sendLog('⚠️ Could not read sim_time from run.par — defaulting to 3600 s');
    return 3600;
}

/**
 * Ruft _bmi_finalize() auf und gibt den C++-Heap frei.
 * Idempotent: mehrfacher Aufruf ist sicher (Guard via Module-Check).
 */
function safeFinalize() {
    if (!Module) return;
    try {
        Module._bmi_finalize();
        sendLog('🧹 _bmi_finalize() called — C++ heap released.');
    } catch (err) {
        console.error('[BMI Worker] Error during finalize:', err);
    }
}

function sendLog(msg) {
    postMessage({ type: 'LOG', text: msg });
}

function handleError(err, context) {
    console.error(`[BMI Worker][${context}]`, err);
    currentState = 'ERROR';
    postMessage({ type: 'ERROR', error: `${context}: ${err?.message ?? err}` });
}
