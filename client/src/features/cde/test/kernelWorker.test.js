/**
 * Das Worker-Backend (Teil XIV, G5) — ohne Browser, mit einer Worker-
 * Attrappe, die das Protokoll des echten `kernel.worker.js` nachstellt.
 * Die zwei Zusagen: Eingaben werden NICHT übertragen (der Lauf braucht das
 * Quellraster weiter), und ein Worker, der nicht antwortet, blockiert nichts.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { erzeugeWorkerBackend } from '../services/geometrie/KernelWorker.js';
import { erzeugeKernel, WORKER_SCHWELLE } from '../services/geometrie/Kernel.js';

const WORKER_QUELLE = readFileSync(new URL('../services/geometrie/KernelWorker.js', import.meta.url), 'utf8');

/** Attrappe: rechnet mit dem echten Kernel, antwortet asynchron wie ein Worker. */
class FakeWorker {
    constructor() { this.onmessage = null; this.onerror = null; this.terminate = vi.fn(); FakeWorker.instanzen++; }
    postMessage(msg) {
        const kernel = erzeugeKernel();
        setTimeout(async () => {
            try {
                const r = await kernel.op(msg.op, msg.eingaben, msg.parameter);
                this.onmessage?.({ data: { id: msg.id, ergebnis: r.ergebnis, warnungen: r.warnungen } });
            } catch (e) {
                this.onmessage?.({ data: { id: msg.id, fehler: e.message } });
            }
        }, 0);
    }
}
FakeWorker.instanzen = 0;
class StummerWorker { constructor() { this.terminate = vi.fn(); } postMessage() {} }

function raster(nx = 4, nz = 4) {
    return { x0: 0, z0: 0, maxX: nx - 1, maxZ: nz - 1, cell: 1, nx, nz, heights: new Float64Array(nx * nz).fill(300) };
}

describe('erzeugeWorkerBackend', () => {
    it('gibt ohne Worker-Klasse null — der Kernel rechnet dann inline', () => {
        expect(erzeugeWorkerBackend({ WorkerKlasse: undefined })).toBeNull();
    });

    it('rechnet über den Worker, lässt die Eingaben unversehrt und startet ihn genau einmal', async () => {
        FakeWorker.instanzen = 0;
        const backend = erzeugeWorkerBackend({ WorkerKlasse: FakeWorker, url: 'x' });
        const a = raster(), b = raster();
        b.heights.fill(298);
        const r1 = await backend.op('rasterDifferenz', { a, b }, {});
        const r2 = await backend.op('rasterDifferenz', { a, b }, {});
        expect(r1.ergebnis.heights[0]).toBe(-2);
        expect(r2.ergebnis.heights[5]).toBe(-2);
        expect(a.heights.length).toBe(16);           // nicht übertragen, nicht geleert
        expect(FakeWorker.instanzen).toBe(1);
    });

    it('ein stummer Worker läuft in den Timeout und wird beendet', async () => {
        const backend = erzeugeWorkerBackend({ WorkerKlasse: StummerWorker, url: 'x', timeoutMs: 20 });
        await expect(backend.op('rasterDifferenz', { a: raster(), b: raster() }, {})).rejects.toThrow(/antwortete nicht/);
    });

    it('WÄCHTER: der echte Worker steht WÖRTLICH als `new Worker(new URL(…, import.meta.url))` — sonst gibt Vite keinen Chunk aus', () => {
        // Deploy 2026-09-03: `new WorkerKlasse(new URL(…))` — Vite erkannte es
        // nicht, kein Chunk im Bundle, die URL lief in PROD auf 404.
        expect(WORKER_QUELLE).toMatch(/new Worker\(\s*new URL\(\s*'\.\/kernel\.worker\.js'\s*,\s*import\.meta\.url\s*\)\s*,\s*\{\s*type:\s*'module'\s*\}\s*\)/);
    });

    it('fällt der Worker aus, rechnet der Kernel inline weiter, sagt es und fragt den Worker nicht mehr', async () => {
        const worker = { op: vi.fn(async () => { throw new Error('404 kernel.worker.js'); }), beenden: vi.fn() };
        const k = erzeugeKernel({ worker });
        // Mittlere Op oberhalb der Schwelle — ginge in den Worker; auf dem
        // flachen Raster schneidet die Isolinie nichts und ist inline billig.
        const n = Math.ceil(Math.sqrt(WORKER_SCHWELLE)) + 1;
        const a = raster(n, n);
        const r1 = await k.op('isolinie', { raster: a }, { wert: 299.5 });
        expect(r1.provenienz.backend).toBe('client');
        expect(Array.isArray(r1.ergebnis)).toBe(true);
        expect(r1.warnungen.some(w => w.startsWith('worker_ausgefallen'))).toBe(true);
        expect(worker.beenden).toHaveBeenCalledTimes(1);
        const r2 = await k.op('isolinie', { raster: a }, { wert: 299.5 });
        expect(r2.provenienz.backend).toBe('client');
        expect(worker.op).toHaveBeenCalledTimes(1);          // kein zweiter Anlauf
    });

    it('der Kernel schickt Mittleres erst ab der Schwelle in den Worker', async () => {
        const worker = { op: vi.fn(async () => ({ ergebnis: 'W', warnungen: [] })) };
        const k = erzeugeKernel({ worker });
        const klein = await k.op('rasterDifferenz', { a: raster(), b: raster() });
        expect(klein.provenienz.backend).toBe('client');
        const n = Math.ceil(Math.sqrt(WORKER_SCHWELLE)) + 1;
        const gross = raster(n, n);
        const g = await k.op('koerperZwischenRastern', { oben: gross, unten: gross });
        expect(g.provenienz.backend).toBe('worker');
        expect(worker.op).toHaveBeenCalledTimes(1);
    });
});
