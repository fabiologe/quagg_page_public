import { OutputProcessor } from './OutputProcessor.js';

// ... (Existing Imports)

// ...

// ...

function checkFSForResults() {
    if (!FS) return;

    try {
        const files = FS.readdir('/results');
        const resultPattern = /res-.*\.wd\.asc$/; // Focus on Water Depth for now

        for (const file of files) {
            if (file === '.' || file === '..') continue;

            if (resultPattern.test(file) && !processedFiles.has(file)) {
                // processedFiles.add(file); // Don't track history, we delete immediately!

                const path = '/results/' + file;
                // KEY CHANGE: Read as Binary (Uint8Array)
                const content = FS.readFile(path, { encoding: 'binary' });

                // 2. Parse & Validate (Byte-Crawler Logic)
                const result = OutputProcessor.parseAsync(content);

                // 3. Cleanup IMMEDIATELY to free MEMFS memory
                FS.unlink(path);

                if (result.isValid) {
                    // Validation Check
                    if (result.hasNegativeDepth) {
                        console.warn(`[Solver Check] Detected instability (negative depth < -0.1m) in frame ${file}`);
                        postMessage({ type: 'WARNING', message: 'Solver Instability Detected' });
                    }

                    // 4. Zero-Copy Transfer
                    const frameMatch = file.match(/(\d+)/);
                    const frameId = frameMatch ? parseInt(frameMatch[1], 10) : 0;

                    postMessage({
                        type: 'RESULT',
                        frame: frameId,
                        payload: result.data,
                        header: result.header,
                        min: result.min,
                        max: result.max
                    }, [result.data.buffer]); // Transfer ownership

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

function handleError(err, context) {
    console.error(`[${context}]`, err);
    currentState = 'ERROR';
    sendError(`${context}: ${err.message}`);
}
