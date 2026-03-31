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

import { OutputProcessor } from './OutputProcessor.js';
import { InputGenerator } from './InputGenerator.js';
import LisfloodBMI from './lisflood_bmi.js';

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
    const { cmd, payload, type } = e.data;

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
                            return new URL('./lisflood_bmi.wasm', import.meta.url).href;
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

                    // Geländehöhe aus dem DGM-Grid (Float32Array) lesen.
                    // Das gridData-Array liegt bereits im scenarioData-Payload.
                    // LISFLOOD und get1DIndex nutzen dasselbe top-down-Layout
                    // (row 0 = Norden) → direkter Index-Zugriff ohne Umrechnung.
                    const dem = payload.scenarioData?.grid?.gridData ?? null;

                    activeCulverts = rawCulverts.map((c, i) => {
                        const inIndex  = get1DIndex(c.inX,  c.inY,  dmgHeader);
                        const outIndex = get1DIndex(c.outX, c.outY, dmgHeader);

                        // Geländehöhe [mNN] — NODATA (-9999) → 0 als Fallback
                        const zIn  = (dem && dem[inIndex]  > -9000) ? dem[inIndex]  : 0;
                        const zOut = (dem && dem[outIndex] > -9000) ? dem[outIndex] : 0;

                        sendLog(`🔌 Culvert ${i}: in[${c.inX.toFixed(1)}, ${c.inY.toFixed(1)}]→idx=${inIndex} z=${zIn.toFixed(2)}m  out[${c.outX.toFixed(1)}, ${c.outY.toFixed(1)}]→idx=${outIndex} z=${zOut.toFixed(2)}m  maxQ=${c.maxQ} m³/s`);
                        return { inIndex, outIndex, maxQ: c.maxQ, zIn, zOut };
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
                        // WSE = H (Wassertiefe) + z (Geländehöhe aus DEM-Grid)
                        const hIn  = Module._bmi_get_water_depth(culvert.inIndex);
                        const hOut = Module._bmi_get_water_depth(culvert.outIndex);
                        const wseIn  = hIn  + culvert.zIn;
                        const wseOut = hOut + culvert.zOut;

                        // ─ 2. Druckdifferenz & Richtung ──────────────────
                        const dh = wseIn - wseOut;

                        // Numerische Schwelle: < 1 cm Differenz → kein Fluss
                        if (Math.abs(dh) < 0.01) continue;

                        // Positiv: Fluss von In→Out; Negativ: Rückstau Out→In
                        const direction = Math.sign(dh);

                        // ─ 3. Torricelli-Durchfluss ──────────────────────
                        // Q = maxQ × sqrt(|dh|)  [m³/s]
                        // → Bei dh=1 m entspricht Q = maxQ (Nennkapazität)
                        // → Bei dh=0.25 m entspricht Q = 0.5 × maxQ
                        // → Begrenzt automatisch bei geringem Druckgefälle
                        const currentQ = culvert.maxQ * Math.min(1.0, Math.sqrt(Math.abs(dh)));
                        const desiredV = currentQ * dt;

                        // ─ 4. Massensicherer Transfer ────────────────────
                        // Gebende Zelle bestimmen (direction: +1 → In gibt, -1 → Out gibt)
                        const srcIndex  = direction > 0 ? culvert.inIndex  : culvert.outIndex;
                        const dstIndex  = direction > 0 ? culvert.outIndex : culvert.inIndex;
                        const srcDepth  = direction > 0 ? hIn : hOut;

                        // 1 mm Restwasser-Puffer verhindert negative Tiefe im C++-Heap
                        const availableV = Math.max(0, (srcDepth - 0.001)) * cellArea;
                        const transferV  = Math.min(desiredV, availableV);

                        // ─ 5. Injektion in den C++-Speicher ──────────────
                        if (transferV > 1e-9) { // Float-Epsilon-Guard
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
 * Konvertiert Welt-Koordinaten (X/Y in Metern) in einen linearen 1D-Index
 * für das LISFLOOD-Raster (row-major, top-down).
 *
 * @param {number} x  Welt-X (Rechtswert / Easting)
 * @param {number} y  Welt-Y (Hochwert  / Northing)
 * @param {{ xllcorner: number, yllcorner: number, cellsize: number, nrows: number, ncols: number }} header
 * @returns {number} Linearer Index: row * ncols + col
 */
function get1DIndex(x, y, header) {
    const { xllcorner, yllcorner, cellsize, nrows, ncols } = header;

    // Spalte: von links nach rechts
    const rawCol = Math.floor((x - xllcorner) / cellsize);
    // Zeile: LISFLOOD speichert top-down → row 0 = Norden (maximales Y)
    const rawRow = nrows - 1 - Math.floor((y - yllcorner) / cellsize);

    // Clampen — schützt vor Out-of-Bounds bei Koordinaten am Rasterrand
    const col = Math.max(0, Math.min(ncols - 1, rawCol));
    const row = Math.max(0, Math.min(nrows - 1, rawRow));

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
