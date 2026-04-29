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

    try {
        const files = FS.readdir('/results');
        sendLog(`[Result Check] Files in /results: ${files.join(', ')}`);

        const resultPattern = /^res-\d+\.wd$/; // LISFLOOD writes res-0000.wd, res-0001.wd, etc.

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            if (resultPattern.test(file) && !processedFiles.has(file)) {

                const path = '/results/' + file;
                const content = FS.readFile(path, { encoding: 'binary' });

                // 2. Parse & Validate
                const result = OutputProcessor.parseAsync(content);

                // 3. Cleanup
                FS.unlink(path);

                if (result.isValid) {
                    if (result.hasNegativeDepth) {
                        console.warn(`[Solver Check] Detected instability (negative depth < -0.1m) in frame ${file}`);
                        postMessage({ type: 'WARNING', message: 'Solver Instability Detected' });
                    }

                    const frameMatch = file.match(/(\d+)/);
                    const frameId = frameMatch ? parseInt(frameMatch[1], 10) : 0;

                    postMessage({
                        type: 'RESULT',
                        frame: frameId,
                        payload: result.data,
                        header: result.header,
                        min: result.min,
                        max: result.max
                    }, [result.data.buffer]);

                } else {
                    console.error(`Parsed invalid output file: ${file}: ${result.error}`);
                }
            }
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
