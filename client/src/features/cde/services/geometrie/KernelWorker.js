/**
 * Das Worker-Backend des Kernels (Teil XIV, G5).
 *
 * Eingaben werden per Structured Clone KOPIERT, nicht übertragen: der
 * Ableitungslauf hält das Quellraster für den nächsten Teil, und ein
 * übertragener Puffer wäre im Hauptthread danach leer — die stillste Sorte
 * Fehler. Ergebnisse kommen übertragen zurück (sie gehören nur dem Aufrufer).
 *
 * Ohne `Worker` (Node, Tests) gibt es kein Backend — `erzeugeWorkerBackend`
 * liefert null, der Kernel rechnet inline. Mit einer Attrappe (`WorkerKlasse`)
 * ist das Protokoll ohne Browser prüfbar.
 */
export const WORKER_TIMEOUT_MS = 60000;

/**
 * Der echte Worker — WÖRTLICH in dieser Form, sonst gibt Vite keinen Chunk
 * aus: der Bundler erkennt nur `new Worker(new URL('…', import.meta.url))`,
 * nicht eine Klasse aus einer Variablen. (Deploy 2026-09-03: der Worker fehlte
 * im Bundle, die URL lief auf 404.) Wächter in kernelWorker.test.js.
 */
function _echterWorker() {
    return new Worker(new URL('./kernel.worker.js', import.meta.url), { type: 'module' });
}

export function erzeugeWorkerBackend({ WorkerKlasse = null, url = null, timeoutMs = WORKER_TIMEOUT_MS } = {}) {
    if (!WorkerKlasse && typeof globalThis.Worker !== 'function') return null;
    let worker = null;
    let laufnummer = 0;
    const offen = new Map();     // id → {resolve, reject, timer}

    function _starte() {
        if (worker) return worker;
        worker = WorkerKlasse
            ? new WorkerKlasse(url ?? new URL('./kernel.worker.js', import.meta.url), { type: 'module' })
            : _echterWorker();
        worker.onmessage = (ev) => {
            const { id, ergebnis, warnungen, fehler } = ev.data ?? {};
            const w = offen.get(id);
            if (!w) return;
            offen.delete(id);
            clearTimeout(w.timer);
            if (fehler) w.reject(new Error(fehler));
            else w.resolve({ ergebnis: ergebnis ?? null, warnungen: warnungen ?? [] });
        };
        worker.onerror = (ev) => {
            const grund = ev?.message ?? 'Worker-Fehler';
            for (const [id, w] of offen) { clearTimeout(w.timer); w.reject(new Error(grund)); offen.delete(id); }
            worker.terminate?.();
            worker = null;
        };
        return worker;
    }

    function op(name, eingaben, parameter = {}) {
        const w = _starte();
        const id = ++laufnummer;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                offen.delete(id);
                reject(new Error(`kernel-worker: „${name}" antwortete nicht innerhalb von ${timeoutMs} ms`));
                worker?.terminate?.();
                worker = null;
            }, timeoutMs);
            offen.set(id, { resolve, reject, timer });
            w.postMessage({ id, op: name, eingaben, parameter });
        });
    }

    function beenden() {
        worker?.terminate?.();
        worker = null;
        for (const [id, w] of offen) { clearTimeout(w.timer); w.reject(new Error('beendet')); offen.delete(id); }
    }

    return { op, beenden, kann: () => ({ ok: true }) };
}
