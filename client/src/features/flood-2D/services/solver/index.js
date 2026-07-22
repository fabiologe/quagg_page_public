import { WasmWorkerBackend } from './WasmWorkerBackend.js';
import { RunpodBackend } from './RunpodBackend.js';
import { createRunpodTransport } from './runpodTransport.js';
import { createMockRunpodTransport } from './MockRunpodTransport.js';

/**
 * Factory für Solver-Backends.
 *
 * Env-Konfiguration (client/.env.development):
 *   VITE_RUNPOD_BASE_URL     Eigenes Backend statt api.runpod.ai — z.B.
 *                            '/flood2dpod' (Prod, nginx-Proxy auf quagg-api)
 *                            oder 'http://localhost:8001/flood2dpod' (Dev).
 *                            API-Key/Endpoint-ID sind dann optional.
 *   VITE_RUNPOD_API_KEY      RUNPOD-API-Key (Bearer)
 *   VITE_RUNPOD_ENDPOINT_ID  Serverless-Endpoint-ID
 *   VITE_RUNPOD_MOCK=true    Mock erzwingen (auch mit Key/Base-URL)
 *
 * Ohne Base-URL und ohne API-Key fällt 'runpod' automatisch auf den Mock
 * zurück, sodass die Remote-Pipeline auch ohne Backend end-to-end läuft.
 *
 * @param {'wasm'|'runpod'} mode
 * @returns {import('./SolverBackend.js').SolverBackend}
 */
export function createSolverBackend(mode = 'wasm') {
    switch (mode) {
        case 'wasm':
            return new WasmWorkerBackend(mode);

        case 'runpod': {
            const env = import.meta.env || {};
            const baseUrl = env.VITE_RUNPOD_BASE_URL;
            const apiKey = env.VITE_RUNPOD_API_KEY;
            const endpointId = env.VITE_RUNPOD_ENDPOINT_ID;
            const forceMock = env.VITE_RUNPOD_MOCK === 'true';

            // Eigenes Backend (/flood2dpod) braucht weder Key noch Endpoint-ID —
            // das quagg-Backend spricht dasselbe Protokoll und ignoriert beides.
            const useMock = forceMock || (!baseUrl && (!apiKey || !endpointId));
            if (useMock) {
                console.info('[SolverFactory] RUNPOD-Mock aktiv'
                    + (forceMock ? ' (VITE_RUNPOD_MOCK=true)' : ' (keine Base-URL/API-Key konfiguriert)'));
            } else {
                console.info(`[SolverFactory] Remote-Solver: ${baseUrl || 'api.runpod.ai'}`);
            }
            const transport = useMock
                ? createMockRunpodTransport()
                : createRunpodTransport({
                    apiKey: apiKey || 'self-hosted',
                    endpointId: endpointId || 'pod',
                    ...(baseUrl ? { baseUrl } : {})
                });
            return new RunpodBackend({ transport });
        }

        default:
            throw new Error(`Unbekannter Solver-Modus: ${mode}`);
    }
}

export { SolverBackend } from './SolverBackend.js';
export { WasmWorkerBackend } from './WasmWorkerBackend.js';
export { RunpodBackend } from './RunpodBackend.js';
export { createRunpodTransport } from './runpodTransport.js';
export { createMockRunpodTransport } from './MockRunpodTransport.js';
export { encodeFrame, decodeFrame } from './resultCodec.js';
