// @vitest-environment jsdom
/**
 * Die Zoom-Sperre (2026-09-03) — der Bug, den Fabio am Surface gefunden hat:
 * zwei Finger, und die ganze Oberfläche war weg, der Browser meldete 100 %.
 *
 * Was hier geprüft wird, ist genau das, was den Fall ausmacht:
 *   - der Trackpad-Pinch (Strg+Rad) wird gesperrt, normales Rollen nicht;
 *   - Strg+0 wird NICHT gesperrt — es ist der einzige Ausweg, wenn der
 *     Browser den Zoom je Herkunft gemerkt hat (die beiden anderen Fassungen
 *     im Haus sperren es, und das wäre hier eine Falle);
 *   - die Notleiste sitzt am SICHTBAREN Ausschnitt und rechnet die
 *     Vergrösserung heraus — im Layout wäre sie so unerreichbar wie die
 *     Leisten, über die sie berichtet;
 *   - `.cde-view` nimmt dem Browser den Zwei-Finger-Zoom, lässt aber das
 *     Ein-Finger-Scrollen der Panels in Ruhe.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rettungsleistenStil, useZoomSperre, ZOOM_SCHWELLE } from '../composables/useZoomSperre.js';

// Unter jsdom ist `import.meta.url` eine http-URL — `readFileSync` kann damit
// nichts anfangen. Die Wächter lesen deshalb vom Arbeitsverzeichnis aus
// (vitest läuft laut Verifikationsanweisung immer aus `client/`).
const lies = (p) => readFileSync(resolve(process.cwd(), 'src/features/cde', p), 'utf8');
const CDE_VIEW = lies('views/CdeView.vue');

/** Ein Fenster-Doppel, das seine Handler herausgibt. */
function fensterDoppel(vv = { scale: 1, offsetLeft: 0, offsetTop: 0, width: 1200, height: 800 }) {
    const handler = new Map();
    const vvHandler = new Map();
    const doppel = {
        addEventListener: (typ, fn, opts) => handler.set(typ, { fn, opts }),
        removeEventListener: (typ) => handler.delete(typ),
        visualViewport: vv && {
            ...vv,
            addEventListener: (typ, fn) => vvHandler.set(typ, fn),
            removeEventListener: (typ) => vvHandler.delete(typ),
        },
        handler, vvHandler,
    };
    return doppel;
}

/** Composable in einer echten Instanz laufen lassen — sonst greift kein onMounted. */
function inKomponente(fabrik) {
    let ergebnis;
    const app = createApp({ setup() { ergebnis = fabrik(); return () => h('div'); } });
    app.mount(document.createElement('div'));
    return { ergebnis, abbauen: () => app.unmount() };
}

describe('rettungsleistenStil', () => {
    it('gibt null, solange nichts vergrössert ist', () => {
        expect(rettungsleistenStil(null)).toBeNull();
        expect(rettungsleistenStil({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 1200 })).toBeNull();
        expect(rettungsleistenStil({ scale: ZOOM_SCHWELLE, offsetLeft: 0, offsetTop: 0, width: 1200 })).toBeNull();
    });

    it('klebt am Ausschnitt und rechnet die Vergrösserung heraus', () => {
        const stil = rettungsleistenStil({ scale: 2.5, offsetLeft: 300, offsetTop: 120, width: 480 });
        expect(stil).toEqual({
            left: '300px', top: '120px',
            // 480 sichtbare CSS-Pixel · 2,5 — durch die Gegenskalierung füllt
            // die Leiste danach exakt den Ausschnitt.
            width: '1200px',
            transform: 'scale(0.4)',
            transformOrigin: 'top left',
        });
    });
});

describe('useZoomSperre', () => {
    it('sperrt Strg+Rad, lässt normales Rollen durch — und meldet sich als nicht passiv an', () => {
        const fenster = fensterDoppel();
        const { abbauen } = inKomponente(() => useZoomSperre({ fenster }));
        const rad = fenster.handler.get('wheel');
        expect(rad.opts).toEqual({ passive: false });     // sonst wirkt preventDefault nicht

        const mitStrg = { ctrlKey: true, preventDefault: vi.fn() };
        const ohne = { ctrlKey: false, preventDefault: vi.fn() };
        rad.fn(mitStrg);
        rad.fn(ohne);
        expect(mitStrg.preventDefault).toHaveBeenCalledTimes(1);
        expect(ohne.preventDefault).not.toHaveBeenCalled();
        abbauen();
    });

    it('sperrt den Zwei-Finger-Griff — auch auf teleportierten Ebenen, die das CSS nicht erreicht', () => {
        const fenster = fensterDoppel();
        const { abbauen } = inKomponente(() => useZoomSperre({ fenster }));
        const griff = fenster.handler.get('touchmove');
        expect(griff.opts).toEqual({ passive: false });

        const zwei = { touches: { length: 2 }, preventDefault: vi.fn() };
        const einer = { touches: { length: 1 }, preventDefault: vi.fn() };
        griff.fn(zwei);
        griff.fn(einer);
        expect(zwei.preventDefault).toHaveBeenCalledTimes(1);
        // Ein Finger scrollt weiter — sonst stünden die Panels still.
        expect(einer.preventDefault).not.toHaveBeenCalled();
        abbauen();
    });

    it('SPERRT STRG+0 NICHT — der Ausweg muss offen bleiben', () => {
        // Die Fassungen in flood-3D und im PDF-Editor fangen Strg+0/± mit ab.
        // Hier wäre das eine Falle: Chrome merkt sich den Seitenzoom je
        // Herkunft, und wer gezoomt lädt, käme nie wieder heraus.
        const fenster = fensterDoppel();
        const { abbauen } = inKomponente(() => useZoomSperre({ fenster }));
        expect(fenster.handler.has('keydown')).toBe(false);
        abbauen();
    });

    it('folgt dem sichtbaren Ausschnitt und meldet erst über der Schwelle', () => {
        const vv = { scale: 1, offsetLeft: 0, offsetTop: 0, width: 1200, height: 800 };
        const fenster = fensterDoppel(vv);
        const { ergebnis, abbauen } = inKomponente(() => useZoomSperre({ fenster }));
        expect(ergebnis.vergroessert.value).toBe(false);
        expect(ergebnis.leistenStil.value).toBeNull();

        // Zwei Finger: der Ausschnitt wächst, die Leisten wandern hinaus.
        Object.assign(fenster.visualViewport, { scale: 3, offsetLeft: 400, offsetTop: 250, width: 640 });
        fenster.vvHandler.get('resize')();
        expect(ergebnis.vergroessert.value).toBe(true);
        expect(ergebnis.skala.value).toBe(3);
        expect(ergebnis.leistenStil.value).toMatchObject({ left: '400px', top: '250px', width: '1920px' });
        abbauen();
    });

    it('ohne visualViewport (alter Browser, Node) läuft alles weiter — nur ohne Notleiste', () => {
        const fenster = fensterDoppel(null);
        const { ergebnis, abbauen } = inKomponente(() => useZoomSperre({ fenster }));
        expect(ergebnis.vergroessert.value).toBe(false);
        expect(fenster.handler.has('wheel')).toBe(true);
        abbauen();
    });

    it('räumt beim Abbauen alles ab — auch am Ausschnitt', () => {
        const fenster = fensterDoppel();
        const { abbauen } = inKomponente(() => useZoomSperre({ fenster }));
        expect([...fenster.handler.keys()].sort()).toEqual(['gesturechange', 'gesturestart', 'touchmove', 'wheel']);
        expect([...fenster.vvHandler.keys()].sort()).toEqual(['resize', 'scroll']);
        abbauen();
        expect(fenster.handler.size).toBe(0);
        expect(fenster.vvHandler.size).toBe(0);
    });
});

describe('WÄCHTER: die Sperre steht im Stylesheet, die Leiste am Ausschnitt', () => {
    it('`.cde-view` nimmt dem Browser den Zwei-Finger-Zoom, nicht das Scrollen', () => {
        const ab = CDE_VIEW.indexOf('.cde-view {');
        // Nur die Deklarationen des Blocks — die Begründung im Kommentar nennt
        // `none` als das, was der CANVAS trägt, und würde sonst mitzählen.
        const block = CDE_VIEW.slice(ab, CDE_VIEW.indexOf('}', ab)).replace(/\/\*[\s\S]*?\*\//g, '');
        expect(block).toMatch(/touch-action:\s*pan-x pan-y/);
        // `none` wäre zu viel: die Panels müssen mit einem Finger scrollen.
        expect(block).not.toMatch(/touch-action:\s*none/);
    });

    it('der Canvas bleibt strenger als sein Vorfahr — sonst verlöre die Kamera ihre Gesten', () => {
        const viewer = lies('components/IfcViewer.vue');
        expect(viewer).toMatch(/\.canvas-root\s*\{\s*touch-action:\s*none/);
    });

    it('die Notleiste hängt am Ausschnitt-Stil und bietet das Neuladen an', () => {
        expect(CDE_VIEW).toMatch(/class="cde-zoom-notleiste"\s+:style="zoomStil"/);
        expect(CDE_VIEW).toMatch(/v-if="zoomVergroessert"/);
        expect(CDE_VIEW).toContain('ansichtZuruecksetzen');
        expect(CDE_VIEW).toMatch(/function ansichtZuruecksetzen\(\)\s*\{\s*window\.location\.reload\(\);?\s*\}/);
    });
});
