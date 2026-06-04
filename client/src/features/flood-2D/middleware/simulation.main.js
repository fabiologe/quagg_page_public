import { OutputProcessor } from './OutputProcessor.js';
import { InputGenerator } from './InputGenerator.js';
// Emscripten-Modul wird dynamisch geladen (Vite blockiert statische Imports aus public/)
let Lisflood = null;

// Debugging: Global Error Handler
self.onerror = function (msg, url, line, col, error) {
    console.error(`[Worker Global Error] ${msg} at ${line}:${col}`, error);
    postMessage({ type: 'ERROR', error: `Global Worker Error: ${msg} (${line}:${col})` });
};

self.onunhandledrejection = function (e) {
    console.error("[Worker Unhandled Rejection]", e.reason);
    postMessage({ type: 'ERROR', error: `Unhandled Rejection: ${e.reason}` });
};

let Module = null;
let FS = null;
let processedFiles = new Set();
let checkInterval = null;
let currentState = 'IDLE';

console.log("[Simulation] Worker script loaded."); // Critical Startup Log

self.onmessage = async (e) => {
    const { cmd, payload } = e.data || {};

    // Vite HMR Guard: Ignore non-command messages (e.g. { type: 'connected' })
    if (!cmd) return;

    try {
        if (cmd === 'CMD_INIT') {
            if (Module) return; // Already initialized

            sendLog("Initializing Lisflood WASM...");

            // Emscripten-Modul aus public/ laden — Vite blockiert imports aus public/.
            // Workaround: fetch() + Blob-URL umgeht Vite's import-analysis komplett.
            if (!Lisflood) {
                sendLog('Loading Emscripten module via fetch...');
                const resp = await fetch('/flood-engine/lisflood.js');
                const src  = await resp.text();
                const blob = new Blob([src], { type: 'application/javascript' });
                const url  = URL.createObjectURL(blob);
                const mod  = await import(url);
                URL.revokeObjectURL(url);
                Lisflood = mod.default;
            }

            // Initialize WASM Module
            Module = await Lisflood({
                // Hook stdout/stderr
                print: (text) => {
                    // Filter noisy lines
                    if (!text) return;

                    // 1. Log to UI
                    // Only log if not a pure progress update to avoid spam
                    if (!text.startsWith('t=')) {
                        sendLog(`[SOLVER] ${text}`);
                    }

                    // 2. Parse Progress: "t= 120.00  dt= 1.00"
                    if (text.includes('t=')) {
                        const match = text.match(/t=\s*([\d\.]+)/);
                        if (match && match[1]) {
                            const t = parseFloat(match[1]);
                            postMessage({ type: 'PROGRESS_UPDATE', time: t });
                        }
                    }
                },
                printErr: (text) => {
                    if (text.trim()) {
                        sendLog(`[SOLVER ERR] ${text}`);

                        // Detect Critical Errors & Instability
                        if (text.includes("CFL") || text.includes("Mass Balance")) {
                            sendError(text);
                        }
                        if (text.includes('h <') || text.includes('Depth negative')) {
                            postMessage({
                                type: 'WARNING',
                                code: 'INSTABILITY',
                                message: 'Numerical Instability detected (Negative Depth). Check Time Step.'
                            });
                        }
                    }
                },
                locateFile: (path) => {
                    // Check if path is absolute or relative
                    if (path.endsWith('.wasm')) {
                        return '/flood-engine/lisflood.wasm';
                    }
                    return path;
                },
                setStatus: (text) => {
                    if (text) sendLog(`[WASM STATUS] ${text}`);
                },
                monitorRunDependencies: (left) => {
                    if (left > 0) sendLog(`[WASM] Preparing... (${left} dependencies left)`);
                }
            });

            FS = Module.FS;
            sendLog("Lisflood WASM Initialized.");
            // DEBUG: Check available methods
            sendLog(`Module Keys: ${Object.keys(Module).join(', ')}`);
            postMessage({ type: 'STATUS', status: 'READY' });

        } else if (cmd === 'CMD_RUN') {
            if (!Module) throw new Error("Module not initialized");

            sendLog("Preparing Simulation Files...");
            currentState = 'RUNNING';

            // 1. Prepare Files (either from payload or generate locally)
            let files = payload.files;

            if (!files && payload.scenarioData) {
                sendLog("Generating Input Files in Worker (Streaming Mode)...");
                try {
                    const generator = new InputGenerator();
                    // PASS FS for Direct Writing!
                    files = generator.processScenario(payload.scenarioData, FS);
                    sendLog(`Input Generation Configured.`);
                    // files will be empty object because everything was written to FS directly
                } catch (err) {
                    throw new Error(`Input Generation Failed: ${err.message}`);
                }
            }

            // If files were passed via payload (legacy), write them
            if (files && Object.keys(files).length > 0) {
                for (const [filename, content] of Object.entries(files)) {
                    FS.writeFile('/' + filename, content);
                    sendLog(`Written ${filename} to MEMFS.`);
                }
            }

            // Set CWD to root — LISFLOOD resolves paths relative to CWD!
            FS.chdir('/');

            // Ensure results directory exists
            try { FS.mkdir('/results'); } catch (e) { }
            try { FS.mkdir('/res'); } catch (e) { }

            // 2. Run Solver (Blocking/Sync)
            // No setInterval polling because JS thread is blocked!
            sendLog("Starting Lisflood Solver...");

            // Read all input files from MEMFS and send to main thread for inspection
            try {
                const rootFiles = FS.readdir('/');
                sendLog(`MEMFS Root: ${rootFiles.join(', ')}`);

                const inputFileNames = ['run.par', 'terrain.asc', 'friction.asc', 'terrain.n', 'flow.bci', 'profiles.bdy', 'rain.txt', 'flow.weir'];
                const inputFiles = {};

                for (const fname of inputFileNames) {
                    if (rootFiles.includes(fname)) {
                        try {
                            const content = FS.readFile('/' + fname, { encoding: 'utf8' });
                            inputFiles[fname] = content;
                            sendLog(`📄 ${fname} (${content.length} bytes)`);
                        } catch (readErr) {
                            sendLog(`⚠️ Could not read ${fname}: ${readErr.message}`);
                        }
                    }
                }

                // Send input files to main thread
                postMessage({ type: 'INPUT_FILES', files: inputFiles });

            } catch (e) {
                sendLog(`❌ Error reading input files: ${e.message}`);
            }

            setTimeout(() => {
                try {
                    // Method: Use ccall to invoke the exported '_run_lisflood'
                    // The logs showed '_run_lisflood' exists.
                    // ccall handles string allocation/deallocation automatically.

                    sendLog("Invoking run_lisflood via ccall...");

                    // Assumption: int run_lisflood(char* parameter_file);
                    const exitCode = Module.ccall(
                        'run_lisflood', // name of C function
                        'number',       // return type
                        ['string'],     // argument types
                        ['run.par']     // arguments
                    );

                    sendLog(`Solver Finished (Exit ${exitCode}).`);

                    // 3. Process Results AFTER run
                    checkFSForResults();

                    postMessage({ type: 'STATUS', status: 'FINISHED' });
                    currentState = 'FINISHED';

                } catch (e) {
                    if (e && e.name === 'ExitStatus') {
                        if (e.status === 0) {
                            sendLog("Solver Finished (Exit 0).");
                            checkFSForResults();
                            postMessage({ type: 'STATUS', status: 'FINISHED' });
                            currentState = 'FINISHED';
                            return;
                        }
                    }
                    handleError(e, "Execution");
                }
            }, 100);

        }
    } catch (err) {
        handleError(err, "WorkerMessageHandler");
    }
};

// --- HELPER FUNCTIONS ---

function checkFSForResults() {
    if (!FS) return;

    // Read .mass file first (written by LISFLOOD on each massint interval + at end)
    try {
        const massBytes = FS.readFile('/results/res.mass');
        if (massBytes && massBytes.length > 0) {
            const massReport = OutputProcessor.parseMassFile(massBytes);
            postMessage({ type: 'MASS_REPORT', data: massReport });
            sendLog(`[Mass Balance] Verror=${massReport.summary['Verror']?.toExponential(2) ?? '?'}`);
        }
    } catch (_) { /* .mass file may not exist for very short runs */ }

    try {
        const files = FS.readdir('/results');
        sendLog(`[Result Check] Files in /results: ${files.join(', ')}`);

        const resultPattern = /^res-\d+\.wd$/;
        const vxFiles = new Set(files.filter(f => /^res-\d+\.Vx$/.test(f)));

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            if (resultPattern.test(file) && !processedFiles.has(file)) {
                const path    = '/results/' + file;
                const content = FS.readFile(path, { encoding: 'binary' });
                const result  = OutputProcessor.parseAsync(content);
                FS.unlink(path);

                if (result.isValid) {
                    if (result.hasNegativeDepth) {
                        console.warn(`[Solver Check] Detected instability (negative depth < -0.1m) in frame ${file}`);
                        postMessage({ type: 'WARNING', message: 'Solver Instability Detected' });
                    }

                    const frameId = parseInt(file.match(/(\d+)/)[1], 10);

                    // Read matching velocity files if voutput was enabled
                    const vxFile = file.replace('.wd', '.Vx');
                    const vyFile = file.replace('.wd', '.Vy');
                    let velMagnitude = null;
                    let velVx = null;
                    let velVy = null;

                    if (vxFiles.has(vxFile)) {
                        try {
                            const vxContent = FS.readFile('/results/' + vxFile, { encoding: 'binary' });
                            const vyContent = FS.readFile('/results/' + vyFile, { encoding: 'binary' });
                            const vxResult  = OutputProcessor.parseAsync(vxContent);
                            const vyResult  = OutputProcessor.parseAsync(vyContent);
                            FS.unlink('/results/' + vxFile);
                            FS.unlink('/results/' + vyFile);

                            if (vxResult.isValid && vyResult.isValid) {
                                // LISFLOOD schreibt Vx/Vy STAGGERED an Zellkanten:
                                //   .Vx: (ncols+1) x nrows  (Ost-Kanten, +Vx = Ost)
                                //   .Vy: ncols x (nrows+1)   (Süd-Kanten, +Vy = Süd)
                                // → auf Zellmittelpunkte des Tiefen-Grids (ncols x nrows, top-down)
                                //   entstaggern, damit Betrag/Richtung mit der Tiefe deckungsgleich sind.
                                const ncols = result.header.ncols;
                                const nrows = result.header.nrows;
                                const VX = vxResult.data;     // Länge (ncols+1)*nrows
                                const VY = vyResult.data;     // Länge ncols*(nrows+1)
                                const strideX = ncols + 1;    // Spalten in der Vx-Datei
                                const valid = (v) => v > -9000;
                                const face = (v) => (valid(v) ? v : 0);

                                const vxC = new Float32Array(ncols * nrows);
                                const vyC = new Float32Array(ncols * nrows);
                                const mag = new Float32Array(ncols * nrows);

                                for (let j = 0; j < nrows; j++) {
                                    for (let i = 0; i < ncols; i++) {
                                        const idx = j * ncols + i;
                                        // Ost-/West-Kante der Zelle aus der Vx-Datei mitteln
                                        const wFace = VX[j * strideX + i];
                                        const eFace = VX[j * strideX + (i + 1)];
                                        // Nord-/Süd-Kante der Zelle aus der Vy-Datei mitteln
                                        const nFace = VY[j * ncols + i];
                                        const sFace = VY[(j + 1) * ncols + i];
                                        const vx = 0.5 * (face(wFace) + face(eFace));
                                        const vy = 0.5 * (face(nFace) + face(sFace));
                                        vxC[idx] = vx;
                                        vyC[idx] = vy;
                                        mag[idx] = Math.sqrt(vx * vx + vy * vy);
                                    }
                                }
                                velMagnitude = mag;
                                velVx = vxC; // zell-zentriert, +Ost
                                velVy = vyC; // zell-zentriert, +Süd
                            }
                        } catch (_) { /* velocity optional */ }
                    }

                    const transfers = [result.data.buffer];
                    if (velMagnitude) transfers.push(velMagnitude.buffer);
                    if (velVx) transfers.push(velVx.buffer);
                    if (velVy) transfers.push(velVy.buffer);

                    postMessage({
                        type: 'RESULT',
                        frame: frameId,
                        payload: result.data,
                        velocity: velMagnitude ?? null,
                        vx: velVx ?? null,
                        vy: velVy ?? null,
                        header: result.header,
                        min: result.min,
                        max: result.max
                    }, transfers);

                } else {
                    console.error(`Parsed invalid output file: ${file}: ${result.error}`);
                }
            }
        }

        // End-of-simulation summary grids (appear once, not per-frame)
        for (const [suffix, msgType] of [
            ['res.max',    'MAX_DEPTH_GRID'],
            ['res.maxHaz', 'MAX_HAZARD_GRID'],
        ]) {
            try {
                const content = FS.readFile('/results/' + suffix, { encoding: 'binary' });
                const result  = OutputProcessor.parseAsync(content);
                if (result.isValid) {
                    postMessage({ type: msgType, payload: result.data, header: result.header }, [result.data.buffer]);
                    sendLog(`[Result] ${suffix} captured.`);
                }
            } catch (_) { /* summary grids appear only at end */ }
        }

    } catch (e) {
        // console.warn("FS Check Error", e);
    }
}

function sendError(msg) {
    postMessage({ type: 'ERROR', error: msg });
}

function sendLog(msg) {
    postMessage({ type: 'LOG', text: msg });
}

function handleError(err, context) {
    console.error(`[${context}]`, err);
    currentState = 'ERROR';
    sendError(`${context}: ${err.message}`);
}
