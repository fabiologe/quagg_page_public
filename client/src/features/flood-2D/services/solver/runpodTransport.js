/**
 * runpodTransport — HTTP-Transport für die RUNPOD-Serverless-API.
 *
 * RUNPOD-Async-Muster:
 *   POST {base}/v2/{endpointId}/run        → { id, status: 'IN_QUEUE' }
 *   GET  {base}/v2/{endpointId}/status/:id → { id, status, output?, error? }
 *   GET  {base}/v2/{endpointId}/stream/:id → { status, stream: [{ output }] }
 *   POST {base}/v2/{endpointId}/cancel/:id → { id, status: 'CANCELLED' }
 *
 * Auth: Authorization: Bearer <API-Key>
 * Kein WebSocket — RUNPOD Serverless bietet nur Polling/Streaming via HTTP.
 */

const DEFAULT_BASE_URL = 'https://api.runpod.ai';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

async function fetchWithRetry(url, options = {}, { retries = MAX_RETRIES, timeout = REQUEST_TIMEOUT_MS, retryable = true } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                // 4xx (außer 429) nicht retrien — der Request ist kaputt, nicht das Netz
                if (res.status < 500 && res.status !== 429) {
                    throw Object.assign(new Error(`HTTP ${res.status}: ${body.substring(0, 200)}`), { fatal: true });
                }
                throw new Error(`HTTP ${res.status}: ${body.substring(0, 200)}`);
            }
            return res;
        } catch (e) {
            clearTimeout(timer);
            lastError = e;
            if (e.fatal || !retryable || attempt === retries) throw e;
            // Exponentielles Backoff: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        }
    }
    throw lastError;
}

/**
 * @param {{ apiKey: string, endpointId: string, baseUrl?: string }} config
 * @returns Transport-Objekt für RunpodBackend
 */
export function createRunpodTransport({ apiKey, endpointId, baseUrl = DEFAULT_BASE_URL }) {
    if (!apiKey) throw new Error('RUNPOD: API-Key fehlt (VITE_RUNPOD_API_KEY).');
    if (!endpointId) throw new Error('RUNPOD: Endpoint-ID fehlt (VITE_RUNPOD_ENDPOINT_ID).');

    const base = `${baseUrl}/v2/${endpointId}`;
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };
    const json = (res) => res.json();

    return {
        /** @param {Object} input Job-Input (Dateien, maxTime, ...) → { id, status } */
        async runJob(input) {
            // /run nur einmal senden (Idempotenz via clientJobToken im Input);
            // Netz-Retry würde sonst doppelte Jobs erzeugen.
            const res = await fetchWithRetry(`${base}/run`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ input })
            }, { retryable: false });
            return json(res);
        },

        /** @returns {{ id, status: 'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED'|'FAILED'|'CANCELLED', output?, error? }} */
        async getStatus(jobId) {
            const res = await fetchWithRetry(`${base}/status/${jobId}`, { headers });
            return json(res);
        },

        /**
         * Inkrementelle Chunks eines Generator-Handlers abholen.
         * @returns {{ status, stream: Array<{output: Object}> }}
         */
        async streamChunks(jobId) {
            const res = await fetchWithRetry(`${base}/stream/${jobId}`, { headers });
            return json(res);
        },

        async cancel(jobId) {
            const res = await fetchWithRetry(`${base}/cancel/${jobId}`, { method: 'POST', headers });
            return json(res);
        },

        /**
         * Binär-Frame laden. Presigned URLs (https://…) bleiben unverändert;
         * pfad-absolute URLs vom quagg-Backend ('/flood2dpod/files/…') werden
         * gegen die Base-URL aufgelöst (wichtig im Dev: Vite-Origin ≠ API-Origin).
         */
        async fetchBinary(url) {
            const resolved = /^[a-z]+:/i.test(url)
                ? url
                : new URL(url, new URL(base, window.location.href)).toString();
            const res = await fetchWithRetry(resolved, {}, { timeout: 120000 });
            return res.arrayBuffer();
        }
    };
}
