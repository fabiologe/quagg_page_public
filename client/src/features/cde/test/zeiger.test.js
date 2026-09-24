// @vitest-environment jsdom
/**
 * Der Zeiger hat EINEN Besitzer, der Raum EINEN Zeiger-Stapel (Teil XVI, S1).
 *
 * Die Textwächter halten fest, was den Umbau begründet hat:
 *   • die Engine schrieb `style.cursor` inline und schlug damit jede CSS-
 *     Klasse — der Mess-Cursor kam nie an;
 *   • `IfcViewer.vue` hielt einen zweiten Maus-Stapel für Messen/Notiz,
 *     mit eigener Klickschwelle und eigenem Hover-Timer;
 *   • Messen und Notiz setzten den Auswahl-Modus selbst — drei Schreiber
 *     auf einen Zustand.
 * Und sie prüfen `useZeiger` am echten Store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ref, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useZeiger } from '../composables/useZeiger.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');

describe('Ein Cursor-Besitzer (Textwächter)', () => {
    it('die Engine setzt keinen Cursor mehr — sie liefert Daten', () => {
        const engine = lies('services/IfcEngine.js');
        expect(engine).not.toMatch(/style\.cursor/);
        expect(engine).not.toMatch(/CURSOR_(DEFAULT|HOVER)/);
    });

    it('der Viewer trägt die Cursor-Klasse vom einen Besitzer, und jede Klasse hat ihre Regel', () => {
        const viewer = lies('components/IfcViewer.vue');
        expect(viewer).toMatch(/class="canvas-root" :class="zeiger\.klasse\.value"/);
        for (const k of ['zeiger--auswahl', 'zeiger--hover', 'zeiger--werkzeug', 'zeiger--messen']) {
            expect(viewer, `Regel für ${k} fehlt`).toMatch(new RegExp(`\\.canvas-root\\.${k}\\s*\\{`));
        }
        expect(viewer).not.toContain('measure-cursor');
        // Der Ring-Cursor steht genau EINMAL — nicht mehr doppelt (Engine + CSS).
        expect(viewer.match(/circle cx='18' cy='18' r='14' fill='none' stroke='white'/g)).toHaveLength(1);
    });
});

describe('Ein Zeiger-Stapel (Textwächter)', () => {
    const viewer = lies('components/IfcViewer.vue');

    it('der Viewer hört auf keine Maus-Ereignisse mehr — der Handler tut es, mit Pointer-Ereignissen', () => {
        expect(viewer).not.toMatch(/addEventListener\('mouse(down|up|move)'/);
        expect(viewer).not.toMatch(/onMouseMoveForTools|onMouseDown|onMouseUp/);
        const handler = lies('services/IfcSelectionHandler.js');
        for (const e of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave']) {
            expect(handler).toContain(`'${e}'`);
        }
        expect(handler).not.toMatch(/addEventListener\('mouse/);
    });

    it('Messen und Notiz sind Tipp-VERBRAUCHER, kein zweiter Stapel', () => {
        expect(viewer).toMatch(/_selection\.onTipp\(async \(tipp\) => messen\.klick\(/);
        expect(viewer).toMatch(/_selection\.onTipp\(async \(tipp\) => annotationen\.klick\(/);
    });

    it('den Auswahl-Modus leitet EINE Stelle ab — die Verbraucher setzen ihn nicht', () => {
        expect(viewer.match(/_selection\.setMode\(/g)?.length).toBe(3);   // single | gesperrt | werkzeug — in auswahlModusNachziehen
        expect(viewer).toMatch(/function auswahlModusNachziehen\(\)/);
        for (const d of ['composables/useMessen.js', 'composables/useAnnotationen.js']) {
            expect(lies(d), `${d} setzt den Modus selbst`).not.toMatch(/setMode\(/);
        }
    });

    it('der Klick während einer scharfen Bearbeitung sperrt und SAGT es', () => {
        expect(viewer).toMatch(/_selection\.onGesperrt\(/);
        expect(viewer).toMatch(/setMode\('gesperrt', \{ fang: true \}\)/);
    });

    it('Esc geht durch den EINEN Ausgang des Slots', () => {
        expect(viewer).toMatch(/e\.key === 'Escape' && bearbeitung\.werkzeug/);
        expect(viewer).toMatch(/bearbeitung\.slotAus\(\)/);
        // Die alten Einzel-Ausgänge sind weg.
        expect(viewer).not.toMatch(/e\.key === 'Escape' && messen\.aktiv\.value/);
        expect(viewer).not.toMatch(/e\.key === 'Escape' && annotationActive\.value/);
    });

    it('der Mess-Hovermarker nimmt den Treffer des Stapels — kein zweiter Raycast', () => {
        expect(viewer).toMatch(/messen\.bewegungAn\(treffer\?\.point/);
        expect(lies('services/IfcMeasure.js')).toMatch(/updateMeasureHoverAn\(punkt\)/);
    });
});

describe('useZeiger am echten Store', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    function baue() {
        const b = useBearbeitung();
        b.modusSetzen(true);
        const setzeZeiger = vi.fn();
        const engine = ref({ setzeZeiger });
        const messenAktiv = ref(false);
        const notizAktiv = ref(false);
        const z = useZeiger({ engine, bearbeitung: b, messenAktiv, notizAktiv,
                              farben: () => ({ accent: '#0af', warn: '#fa0' }) });
        return { b, z, setzeZeiger, messenAktiv, notizAktiv };
    }

    it('die Klasse folgt der Rangfolge messen > werkzeug > hover > auswahl', async () => {
        const t = baue();
        expect(t.z.klasse.value).toBe('zeiger--auswahl');
        t.z.aufHover({ key: 'm:1', point: { x: 0, y: 0, z: 0 } }, { x: 1, y: 1 });
        expect(t.z.klasse.value).toBe('zeiger--hover');
        // Ein FORMULAR-Werkzeug zeigt auf nichts: kein Fadenkreuz (S6).
        t.b.starte('kg-setzen');
        await nextTick();
        expect(t.z.klasse.value).toBe('zeiger--hover');
        t.b.abbrechen();
        // Ein Werkzeug mit Zug zeigt: Fadenkreuz.
        t.b.starte('trasse-aendern');
        await nextTick();
        expect(t.z.klasse.value).toBe('zeiger--werkzeug');
        t.messenAktiv.value = true;
        expect(t.z.klasse.value).toBe('zeiger--messen');
    });

    it('über dem Gelände kein grüner Ring — es ist nicht anklickbar (K3)', () => {
        const t = baue();
        t.z.aufHover({ key: 'c:1', point: { x: 0, y: 0, z: 0 }, art: 'gelaende' }, { x: 1, y: 1 });
        expect(t.z.klasse.value).toBe('zeiger--auswahl');
        // Gegenprobe: dasselbe Schweben auf einem Bauteil verspricht den Klick.
        t.z.aufHover({ key: 'm:1', point: { x: 0, y: 0, z: 0 }, art: 'bauteil' }, { x: 1, y: 1 });
        expect(t.z.klasse.value).toBe('zeiger--hover');
    });

    it('ohne scharfes Werkzeug gibt es keine Zielmarke und keine Pille', () => {
        const t = baue();
        t.z.aufHover({ key: 'm:1', point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 } }, { x: 5, y: 6 });
        expect(t.setzeZeiger).not.toHaveBeenCalled();
        expect(t.z.marke.value).toBeNull();
    });

    it('ein Formular- oder Griff-Werkzeug (kg, verschieben) bekommt KEINE Zielmarke — die Griffkugel ist die einzige Marke', () => {
        const t = baue();
        for (const id of ['kg-setzen', 'verschieben']) {
            t.b.starte(id);
            t.z.aufHover({ key: 'm:1', point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 } }, { x: 5, y: 6 });
            expect(t.z.zeigt.value, id).toBe(false);
            expect(t.z.marke.value, id).toBeNull();
            t.b.abbrechen();
        }
        expect(t.setzeZeiger.mock.calls.every(([arg]) => arg === null)).toBe(true);
    });

    it('mit scharfem Tipp-Werkzeug: Marke auf dem Treffer, Pille mit Ort — beim Fang auf dem Fangpunkt in Warnfarbe', () => {
        const t = baue();
        t.b.starte('trasse-aendern');
        t.z.aufHover({ key: 'm:1', point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 }, modelId: 'm' }, { x: 5, y: 6 });
        expect(t.setzeZeiger).toHaveBeenLastCalledWith({ punkt: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 }, farbe: '#0af' });
        expect(t.z.marke.value).toMatchObject({ x: 5, y: 6, punkt: { x: 1, y: 2, z: 3 }, modelId: 'm', fang: null });

        t.z.aufHover({ key: 'm:1', point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 },
                       fang: { art: 'ecke', name: 'Ecke', punkt: { x: 1.1, y: 2, z: 3 } } }, { x: 5, y: 6 });
        expect(t.setzeZeiger).toHaveBeenLastCalledWith({ punkt: { x: 1.1, y: 2, z: 3 }, normal: null, farbe: '#fa0' });
        expect(t.z.marke.value.fang).toEqual({ art: 'ecke', name: 'Ecke' });
    });

    it('nichts unter dem Zeiger blendet die Marke aus; Werkzeug-Aus räumt sie', async () => {
        const t = baue();
        t.b.starte('trasse-aendern');
        t.z.aufHover({ key: 'm:1', point: { x: 1, y: 2, z: 3 } }, { x: 5, y: 6 });
        t.z.aufHover(null, { x: 7, y: 8 });
        expect(t.setzeZeiger).toHaveBeenLastCalledWith(null);
        expect(t.z.marke.value).toBeNull();

        t.z.aufHover({ key: 'm:1', point: { x: 1, y: 2, z: 3 } }, { x: 5, y: 6 });
        expect(t.z.marke.value).not.toBeNull();
        t.b.abbrechen();
        await nextTick();
        expect(t.z.marke.value).toBeNull();
        expect(t.setzeZeiger).toHaveBeenLastCalledWith(null);
    });
});

describe('Der Eingabe-Zustand im Store', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('abbrechen() leert ihn; slotAus() ruft den Ausschalter und gibt den Slot frei', () => {
        const b = useBearbeitung();
        b.modusSetzen(true);
        b.starte('kg-setzen');
        b.setzeEingabe({ phase: 'sammeln', punkte: [{ x: 1, z: 2 }] });
        expect(b.eingabe.punkte).toHaveLength(1);
        b.abbrechen();
        expect(b.eingabe).toEqual({ phase: 'aus', punkte: [], zeiger: null, geste: null, zugGeschlossen: false, auto: {} });

        const aus = vi.fn();
        b.belegeWerkzeug('messen', aus);
        expect(b.slotAus()).toBe(true);
        expect(aus).toHaveBeenCalledTimes(1);
        expect(b.werkzeug).toBeNull();
        expect(b.slotAus()).toBe(false);
    });

    it('useZeichnen legt seine Punkte im Store ab — ein Zug, nicht zwei', async () => {
        const { useZeichnen } = await import('../composables/useZeichnen.js');
        const b = useBearbeitung();
        b.modusSetzen(true);
        const z = useZeichnen({ bearbeitung: b, cde: {}, getModellSha: () => null, getHoehenversatz: () => 0 });
        z.starte('linie-zeichnen');
        expect(b.eingabe.phase).toBe('sammeln');
        z.setzePunkt({ x: 1, z: 2 });
        z.bewegeZeiger({ x: 3, z: 4 });
        expect(b.eingabe.punkte).toEqual([{ x: 1, z: 2 }]);
        expect(b.eingabe.zeiger).toEqual({ x: 3, z: 4 });
        expect(z.punkte.value).toBe(b.eingabe.punkte);
        z.abbrechen();
        expect(b.eingabe.phase).toBe('aus');
        expect(b.eingabe.punkte).toEqual([]);
    });
});
