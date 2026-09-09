/**
 * Der Einheiten-Worker (2026-09-03).
 *
 * Anlass: die Umrechnung schreibt mit `SaveModel` die ganze Datei neu. Im
 * Hauptthread friert dabei das Bild ein — bei der 9-MB-Datei lange genug, dass
 * es wie ein Absturz aussieht.
 *
 * Zwei Eigenschaften tragen alles und werden hier festgehalten:
 *
 *  1. Die EINGABE wird kopiert, nicht übertragen. Die Bytes sind die Lieferung
 *     des Planers; sie werden danach abgelegt und ihre Prüfsumme trägt das
 *     Dokumentregister. Ein übertragener Puffer wäre im Hauptthread leer, und
 *     die Ablage legte eine Datei der Länge null an — lautlos.
 *  2. Der echte Worker steht WÖRTLICH als `new Worker(new URL(…))`. Über eine
 *     Variable gibt Vite keinen Chunk aus, und die URL läuft in Produktion auf
 *     404. Genau so passiert, beim Kernel-Worker, am 2026-09-03.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { erzeugeEinheitenWorker } from '../services/EinheitenWorker.js';

const QUELLE = readFileSync(new URL('../services/EinheitenWorker.js', import.meta.url), 'utf8');
const WORKER = readFileSync(new URL('../services/einheiten.worker.js', import.meta.url), 'utf8');
/**
 * Kommentare raus, bevor über CODE geurteilt wird.
 *
 * Der erste Anlauf dieses Wächters fiel über meinen eigenen Kommentar: dort
 * stand das Wort `SaveModel`, um zu erklären, warum es den Worker gibt. Ein
 * Wächter, der Prosa für Logik hält, zwingt dazu, Erklärungen wegzulassen —
 * und die sind hier das Wertvollste.
 */
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const WORKER_CODE = ohneKommentare(WORKER);

/** Attrappe: antwortet asynchron wie ein Worker, merkt sich die Transferliste. */
function attrappe({ antwort = null, werfen = false, stumm = false } = {}) {
    const gesehen = [];
    class FakeWorker {
        constructor() { this.onmessage = null; this.onerror = null; this.terminate = vi.fn(); }
        postMessage(msg, transfer) {
            gesehen.push({ msg, transfer });
            if (stumm) return;
            setTimeout(() => {
                if (werfen) { this.onerror?.({ message: '404 einheiten.worker.js' }); return; }
                this.onmessage?.({ data: { id: msg.id, ...(antwort ?? { grund: 'nichts' }) } });
            }, 0);
        }
    }
    return { FakeWorker, gesehen };
}

const BYTES = () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

describe('Das Protokoll', () => {
    it('reicht Bytes und Faktor durch und gibt das Ergebnis zurück', async () => {
        const ergebnis = new Uint8Array([9, 9]);
        const { FakeWorker, gesehen } = attrappe({ antwort: { bytes: ergebnis, bericht: { zeilen: 7 } } });
        const w = erzeugeEinheitenWorker({ WorkerKlasse: FakeWorker, url: 'x' });

        const r = await w.umrechnen({ bytes: BYTES(), faktor: 0.001 });
        expect(r.bytes).toBe(ergebnis);
        expect(r.bericht).toEqual({ zeilen: 7 });
        expect(gesehen[0].msg).toMatchObject({ faktor: 0.001, wasmPfad: '/', absolut: true });
        expect(gesehen[0].msg.bytes).toHaveLength(8);
    });

    it('KOPIERT die Eingabe — keine Transferliste', async () => {
        // Der Kern. Mit Transferliste wäre der Puffer des Aufrufers danach
        // leer, `_ablegen` schriebe eine 0-Byte-Datei und die Prüfsumme des
        // Registers zeigte auf nichts. Kein Fehler, keine Meldung.
        const { FakeWorker, gesehen } = attrappe({ antwort: { bytes: new Uint8Array([1]) } });
        const w = erzeugeEinheitenWorker({ WorkerKlasse: FakeWorker, url: 'x' });
        const eingabe = BYTES();

        await w.umrechnen({ bytes: eingabe, faktor: 0.001 });
        expect(gesehen[0].transfer, 'keine Transferliste für die Eingabe').toBeUndefined();
        expect(eingabe.byteLength, 'der Puffer des Aufrufers lebt weiter').toBe(8);
    });

    it('gibt einen GRUND zurück, statt zu werfen — der Aufrufer weicht aus', async () => {
        // Ein gescheiterter Worker darf die Umrechnung nicht unmöglich machen,
        // nur langsamer. Deshalb kein Wurf: der Aufrufer soll inline weiter.
        const { FakeWorker } = attrappe({ werfen: true });
        const w = erzeugeEinheitenWorker({ WorkerKlasse: FakeWorker, url: 'x' });
        const r = await w.umrechnen({ bytes: BYTES(), faktor: 0.001 });
        expect(r.bytes).toBe(null);
        expect(r.grund).toMatch(/404/);
    });

    it('reicht den Grund des Workers durch, wenn dort die Gegenprobe fiel', async () => {
        const { FakeWorker } = attrappe({ antwort: { grund: 'Gegenprobe: Achse X …' } });
        const w = erzeugeEinheitenWorker({ WorkerKlasse: FakeWorker, url: 'x' });
        const r = await w.umrechnen({ bytes: BYTES(), faktor: 0.001 });
        expect(r).toMatchObject({ bytes: null, grund: expect.stringMatching(/Gegenprobe/) });
    });

    it('läuft in eine Frist, statt ewig zu hängen — und beendet den Worker', async () => {
        vi.useFakeTimers();
        try {
            const { FakeWorker } = attrappe({ stumm: true });
            const w = erzeugeEinheitenWorker({ WorkerKlasse: FakeWorker, url: 'x', timeoutMs: 50 });
            const p = w.umrechnen({ bytes: BYTES(), faktor: 0.001 });
            await vi.advanceTimersByTimeAsync(60);
            await expect(p).resolves.toMatchObject({ bytes: null, grund: expect.stringMatching(/antwortete nicht/) });
        } finally { vi.useRealTimers(); }
    });

    it('beendet den Worker nach JEDEM Ausgang — er hält eine wasm-Instanz', async () => {
        // Anders als der Kernel-Worker läuft dieser selten und teuer. Ihn
        // stehen zu lassen hiesse, für einen einmaligen Vorgang dauerhaft zu
        // bezahlen.
        let letzte = null;
        const { FakeWorker } = attrappe({ antwort: { bytes: new Uint8Array([1]) } });
        class Merkend extends FakeWorker { constructor(...a) { super(...a); letzte = this; } }
        const w = erzeugeEinheitenWorker({ WorkerKlasse: Merkend, url: 'x' });
        await w.umrechnen({ bytes: BYTES(), faktor: 0.001 });
        expect(letzte.terminate).toHaveBeenCalled();
    });

    it('ohne Worker im Umfeld gibt es kein Backend — kein Fehler, nur inline', () => {
        // Node und Tests haben keinen `Worker`. Das ist der Normalfall dort
        // und darf nichts kaputt machen.
        const vorher = globalThis.Worker;
        // eslint-disable-next-line no-undef
        delete globalThis.Worker;
        try { expect(erzeugeEinheitenWorker()).toBe(null); }
        finally { if (vorher) globalThis.Worker = vorher; }
    });
});

describe('WÄCHTER gegen die Vite-Landmine', () => {
    it('der echte Worker steht WÖRTLICH als `new Worker(new URL(…, import.meta.url))`', () => {
        expect(QUELLE).toMatch(
            /new Worker\(\s*new URL\(\s*'\.\/einheiten\.worker\.js'\s*,\s*import\.meta\.url\s*\)\s*,\s*\{\s*type:\s*'module'\s*\}\s*\)/,
        );
    });

    it('der Worker hat KEINE eigene Umrechnungslogik — er ruft dieselbe Funktion', () => {
        // Ein zweiter Konverter wäre die zweite Antwort auf dieselbe Frage.
        // Die laufen in diesem Haus zuverlässig auseinander.
        expect(WORKER_CODE).toContain("import { inMeterUmrechnen } from './Einheiten.js'");
        expect(WORKER_CODE).not.toMatch(/LENGTHMEASURE/);
        expect(WORKER_CODE).not.toMatch(/SaveModel|GetAllLines|WriteLine/);
    });

    it('das ERGEBNIS geht übertragen zurück — es gehört ab dann dem Hauptthread', () => {
        expect(WORKER_CODE).toMatch(/postMessage\([^)]*\{\s*id[^)]*\},\s*\[r\.bytes\.buffer\]\s*\)/s);
    });

    it('web-ifc wird DYNAMISCH geladen, nicht statisch importiert', () => {
        expect(WORKER_CODE).toMatch(/await import\('web-ifc'\)/);
        expect(WORKER_CODE).not.toMatch(/^import .*'web-ifc'/m);
    });
});

describe('Die Verklebung in der Engine', () => {
    const ENGINE = readFileSync(new URL('../services/IfcEngine.js', import.meta.url), 'utf8');
    const fn = ENGINE.slice(ENGINE.indexOf('async _inMeter(data)'), ENGINE.indexOf('einheitsUmrechnung(modelId)'));

    it('fragt ZUERST den Worker', () => {
        expect(fn.indexOf('erzeugeEinheitenWorker')).toBeGreaterThan(-1);
        expect(fn.indexOf('erzeugeEinheitenWorker'), 'Worker vor dem Inline-Weg')
            .toBeLessThan(fn.indexOf('inMeterUmrechnen'));
    });

    it('weicht bei Ausfall inline aus — und SAGT es', () => {
        expect(fn).toContain('console.warn');
        expect(fn).toContain('inMeterUmrechnen');
        // Der Bericht trägt den Weg, damit die Meldung nicht behaupten muss,
        // was sie nicht weiss.
        expect(fn).toMatch(/weg: 'worker'/);
        expect(fn).toMatch(/weg: 'inline'/);
    });

    it('der Inline-Rückfall benutzt die GEMEINSAME wasm-Instanz', () => {
        // Ein eigenes `Init()` kostete im Test 51 s statt 8 s.
        expect(fn).toMatch(/api: geteilt\?\.api/);
    });
});
