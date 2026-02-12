import { OutputProcessor } from './OutputProcessor.js';
import { InputGenerator } from './InputGenerator.js';
import Lisflood from './lisflood.js';

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
    const { cmd, payload } = e.data;

    try {
        if (cmd === 'CMD_INIT') {
            if (Module) return; // Already initialized

            sendLog("Initializing Lisflood WASM...");

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
                        return new URL('./lisflood.wasm', import.meta.url).href;
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
                sendLog("Generating Input Files in Worker...");
                try {
                    const generator = new InputGenerator();
                    files = generator.processScenario(payload.scenarioData);
                    sendLog(`Generated ${Object.keys(files).length} files.`);
                } catch (err) {
                    throw new Error(`Input Generation Failed: ${err.message}`);
                }
            }

            if (!files) throw new Error("No Input Files provided or generated!");

            // 1b. Write Input Files to MEMFS
            // Payload contains all file contents as strings or byte arrays

            // Unpack files
            for (const [filename, content] of Object.entries(files)) {
                FS.writeFile('/' + filename, content);
                sendLog(`Written ${filename} to MEMFS.`);
            }

            // Ensure results directory exists
            try { FS.mkdir('/results'); } catch (e) { }
            try { FS.mkdir('/res'); } catch (e) { }

            // 2. Start Polling for Results
            if (checkInterval) clearInterval(checkInterval);
            checkInterval = setInterval(checkFSForResults, 1000); // Check every second

            // 3. Run Solver (Async or Sync depending on build)
            // LISFLOOD usually runs via main(). passing run.par as arg?
            sendLog("Starting Lisflood Solver...");

            // Using setTimeout to allow UI to update before blocking (if sync)
            setTimeout(() => {
                try {
                    // Hook into run.par
                    Module.callMain(['run.par']);
                    sendLog("Solver Finished.");
                    postMessage({ type: 'STATUS', status: 'FINISHED' }); // Use consistent status
                    currentState = 'FINISHED';
                } catch (e) {
                    if (e && e.name === 'ExitStatus') {
                        // Normal exit?
                        if (e.status === 0) {
                            sendLog("Solver Finished (Exit 0).");
                            postMessage({ type: 'STATUS', status: 'FINISHED' });
                            currentState = 'FINISHED';
                            return;
                        }
                    }
                    if (e.message && e.message.includes('SimulateInfiniteLoop')) {
                        return;
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
        const resultPattern = /res-.*\.wd\.asc$/; // Focus on Water Depth for now

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
