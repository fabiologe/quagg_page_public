// @vitest-environment jsdom
/**
 * K9 — Fang auf Knoten beim Zeichnen einer Kante, und die Kommando-Konsole
 * als Wegwerf-Oberfläche (Teil XXIV).
 *
 *   1. Das Zeichenwerkzeug einer KANTE erklärt den Fang (aus der Netzrolle des
 *      Rezepts, nicht aus seinem Namen); eine Linie nicht.
 *   2. Beim Zeichnen ist nichts gewählt — der Motor fängt trotzdem, auf die
 *      Knoten, die der Viewer hereinreicht. Bis K9 gab es beim Rohrzeichnen
 *      keinen Fang, und das Netz fiel nur zufällig zusammen.
 *   3. Die Konsole spielt C2 über `fuehreAus`, bringt jedes Ergebnis ans
 *      Modell und zeigt die Markierungen; Rückgängig geht denselben Weg.
 *   4. Sie hängt nur im Entwicklungsmodus im Viewer (Textwächter).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useEingabe } from '../composables/useEingabe.js';
import { nachId } from '../services/Bearbeitungen.js';
import { eingabenFuer } from '../services/Eingaben.js';
import KommandoKonsole from '../components/dev/KommandoKonsole.vue';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

describe('1 — die Kante erklärt den Fang', () => {
    it('Rohr: Fang auf Knoten; Linie: keiner', () => {
        expect(eingabenFuer(nachId('rohr-zeichnen')).schlitze.find(s => s.schlitz === 'zug')?.fang).toBe('knoten');
        expect(eingabenFuer(nachId('linie-zeichnen')).schlitze.find(s => s.schlitz === 'zug')?.fang).toBeUndefined();
    });
});

describe('2 — gezeichnet wird auf den Schacht', () => {
    const KNOTEN = [{ globalId: 'S-B', punkt: { x: 30, y: 99.85, z: 0 }, name: 'B' }];
    const motor = (extra = {}) => useEingabe({ bearbeitung: useBearbeitung(), cde: { bearbeiter: 'Fabio' },
                                               getModellSha: () => null, getHoehenversatz: () => 0, ...extra });

    it('ohne gewähltes Bauteil fängt der Stift auf die Knoten der Auskunft', async () => {
        const b = useBearbeitung();
        const m = motor({ getKnoten: () => KNOTEN });
        expect(b.starte('rohr-zeichnen')).toBe(true);
        b.setzeWert('hoehe', 100);
        m.aufTreffer({ point: { x: 0, y: 0, z: 0 } });
        m.aufTreffer({ point: { x: 29.2, y: 0, z: 0.35 } });        // 0,86 m neben dem Schacht
        expect(m.punkte.value[1]).toMatchObject({ x: 30, z: 0, fang: 'B' });
        await m.enter();
        const plan = useAenderungen().eintraege.at(-1).nachher;
        expect(plan.parameter.punkte[1][0]).toBe(30);
        expect(plan.parameter.punkte[1][2]).toBe(0);
    });

    it('ohne Auskunft und ohne gewähltes Bauteil bleibt der Punkt, wo er war', () => {
        const b = useBearbeitung();
        const m = motor();
        b.starte('rohr-zeichnen');
        m.aufTreffer({ point: { x: 29.2, y: 0, z: 0.35 } });
        expect(m.punkte.value[0]).toMatchObject({ x: 29.2, z: 0.35 });
    });
});

describe('3 — die Konsole spielt C2', () => {
    it('fünf Kommandos, jedes ans Modell gebracht; Rückgängig; die Markierung erscheint', async () => {
        const wendeAn = vi.fn(async () => ({}));
        const w = mount(KommandoKonsole, { props: { wendeAn } });
        w.vm.beispiel();
        const kommandos = JSON.parse(w.vm.text);
        expect(kommandos.map(k => k.werkzeug)).toEqual(['schacht-zeichnen', 'schacht-zeichnen', 'rohr-zeichnen', 'sohlhoehen-setzen', 'sohlhoehen-setzen']);

        await w.vm.absetzen();
        expect(w.vm.ergebnisse.map(e => e.ausgefuehrt)).toEqual([true, true, true, true, true]);
        expect(wendeAn).toHaveBeenCalledTimes(5);
        expect(w.vm.markierungen).toEqual([]);                        // 4,0 ‰

        await w.vm.zurueck();                                          // zurück auf 3,0 ‰
        expect(wendeAn).toHaveBeenCalledTimes(6);
        expect(w.vm.markierungen.map(z => z.befunde.map(b => b.regel))).toEqual([['gefaelle_zu_flach']]);
        await w.vm.$nextTick();
        expect(w.text()).toContain('gefaelle_zu_flach 3.0 ‰');
        w.unmount();
    });

    it('ein abgelehntes Kommando hält die Folge an und nennt den Grund', async () => {
        const w = mount(KommandoKonsole, { props: { wendeAn: vi.fn() } });
        w.vm.text = JSON.stringify([{ schema: 1, id: 'ko-x', werkzeug: 'gibt-es-nicht', ziel: [], wer: 'x', wann: 'x' },
                                    { schema: 1, id: 'ko-y', werkzeug: 'schacht-zeichnen', ziel: [], wer: 'x', wann: 'x' }]);
        await w.vm.absetzen();
        expect(w.vm.ergebnisse).toHaveLength(1);
        expect(w.vm.ergebnisse[0].ausgefuehrt).toBe(false);
        expect(w.vm.ergebnisse[0].grund).toBeTruthy();
        w.unmount();
    });
});

describe('4 — Verklebung (Textwächter)', () => {
    it('die Konsole hängt nur im Entwicklungsmodus im Viewer — im Build fällt der Import weg', () => {
        const viewer = lies('components/IfcViewer.vue');
        expect(viewer).toMatch(/const KommandoKonsole = import\.meta\.env\.DEV \? defineAsyncComponent\(\(\) => import\('\.\/dev\/KommandoKonsole\.vue'\)\) : null;/);
        expect(viewer).toMatch(/getKnoten: \(\) => engine\.value\?\.netzAuskunft\?\.\(\)\?\.knoten \?\? \[\]/);
    });
});
