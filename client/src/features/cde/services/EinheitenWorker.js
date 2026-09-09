/**
 * Der Worker-Weg der Einheiten-Umrechnung (2026-09-03).
 *
 * Muster und Gesetze übernommen von `geometrie/KernelWorker.js` — dieselbe
 * Bewegung, deshalb dieselbe Form.
 *
 * EINGABE WIRD KOPIERT, ERGEBNIS ÜBERTRAGEN. Die Bytes, die hereinkommen, sind
 * die Lieferung des Planers: sie werden nach dem Laden noch abgelegt und ihre
 * Prüfsumme trägt das Dokumentregister. Ein übertragener Puffer wäre im
 * Hauptthread danach LEER — die stillste Sorte Fehler, und dieselbe, die im
 * Kernel-Worker schon einmal ausdrücklich vermieden wurde.
 *
 * EIN WORKER JE UMRECHNUNG, danach beendet. Anders als der Kernel-Worker, der
 * viele kleine Operationen hintereinander bekommt, läuft dieser hier selten
 * und hält währenddessen eine ganze wasm-Instanz samt Modell im Speicher.
 * Ihn stehen zu lassen hiesse, für einen einmaligen Vorgang dauerhaft zu
 * bezahlen.
 */

/**
 * Grosszügig: die Umrechnung schreibt die ganze Datei neu, und die Dateien im
 * Haus reichen bis 9 MB. Zu knapp bemessen bräche sie mitten im Schreiben ab
 * und meldete „antwortete nicht", obwohl sie nur langsam war.
 */
export const WORKER_TIMEOUT_MS = 300000;

/**
 * Der echte Worker — WÖRTLICH in dieser Form.
 *
 * Vite erkennt nur `new Worker(new URL('…', import.meta.url), {type:'module'})`
 * und gibt nur dafür einen Chunk aus; über eine Variable kommt keiner, und die
 * URL läuft in Produktion auf 404 (so geschehen beim Deploy am 2026-09-03,
 * Kernel-Worker). Wächter in `einheitenWorker.test.js`.
 */
function _echterWorker() {
    return new Worker(new URL('./einheiten.worker.js', import.meta.url), { type: 'module' });
}

/**
 * @param {object} [opts]
 * @param {Function} [opts.WorkerKlasse]  Attrappe für Tests
 * @param {URL|string} [opts.url]
 * @param {number} [opts.timeoutMs]
 * @returns {{umrechnen: Function, beenden: Function}|null}
 *   `null`, wo es keine Worker gibt (Node, Tests) — der Aufrufer rechnet dann
 *   inline weiter. Ein fehlender Worker ist kein Fehler, nur langsamer.
 */
export function erzeugeEinheitenWorker({ WorkerKlasse = null, url = null, timeoutMs = WORKER_TIMEOUT_MS } = {}) {
    if (!WorkerKlasse && typeof globalThis.Worker !== 'function') return null;

    let laufnummer = 0;

    /**
     * @param {{bytes: Uint8Array, faktor: number, wasmPfad?: string, absolut?: boolean}} auftrag
     * @returns {Promise<{bytes: Uint8Array, bericht: object} | {bytes: null, grund: string}>}
     *   Wirft NICHT: ein gescheiterter Worker ist ein Grund, kein Absturz —
     *   der Aufrufer soll darauf inline ausweichen können.
     */
    async function umrechnen({ bytes, faktor, wasmPfad = '/', absolut = true }) {
        const worker = WorkerKlasse
            ? new WorkerKlasse(url ?? new URL('./einheiten.worker.js', import.meta.url), { type: 'module' })
            : _echterWorker();
        const id = ++laufnummer;

        return new Promise((resolve) => {
            let fertig = false;
            const schliesse = (antwort) => {
                if (fertig) return;
                fertig = true;
                clearTimeout(timer);
                worker.terminate?.();
                resolve(antwort);
            };
            const timer = setTimeout(
                () => schliesse({ bytes: null, grund: `Umrechnung antwortete nicht innerhalb von ${timeoutMs} ms` }),
                timeoutMs,
            );
            worker.onmessage = (ev) => {
                const d = ev.data ?? {};
                if (d.id !== id) return;
                schliesse(d.bytes ? { bytes: d.bytes, bericht: d.bericht } : { bytes: null, grund: d.grund ?? 'ohne Grund' });
            };
            worker.onerror = (ev) => schliesse({ bytes: null, grund: ev?.message ?? 'Worker-Fehler' });

            // KOPIE, keine Übertragung: `postMessage` OHNE zweites Argument
            // klont die Bytes. Die Transferliste wegzulassen ist hier also
            // die Entscheidung, nicht das Versäumnis — mit ihr wäre der
            // Puffer des Aufrufers danach leer, und die Ablage legte eine
            // Datei der Länge null an.
            worker.postMessage({ id, bytes, faktor, wasmPfad, absolut });
        });
    }

    return { umrechnen };
}
