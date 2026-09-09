// @vitest-environment jsdom
/**
 * Die Pille an der Auswahl (Teil XVI, S6).
 *
 * Fabio, PROD-Test 2026-09-08: das Banner am Bauteil verdeckte die Szene, und
 * das Formular der scharfen Bearbeitung stand DREIMAL im Bild (HUD, Toolbox,
 * Leiste). Jetzt: zu ist die Pille nur Typ + Name; ein Tipp klappt Aktionen
 * und Werkzeugliste auf; ein Werkzeug scharf schalten klappt sie zu; das
 * Formular wohnt allein in der Kontextleiste.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CdeHudLayer from '../components/CdeHudLayer.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';

const ROHR = {
    modelId: 'm1', localId: 42, type: 'IFCPIPESEGMENT', category: 'IFCPIPESEGMENT', globalId: 'H1', name: 'H1',
    anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15, hoehenversatz: 0,
    lage: { ost: 10, nord: 0, hoehe: 300 }, versatz: { x: 0, y: 0, z: 0 }, lageUmkehrbar: true,
};

function montiert() {
    return mount(CdeHudLayer, {
        props: { element: ROHR, elementAnker: [10, 300, 0], projectToScreen: () => ({ x: 100, y: 100 }) },
        global: { stubs: { CdeIcon: { template: '<i />' } } },
    });
}

describe('CdeHudLayer — die Pille', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('zu: nur Typ und Name, keine Tasten, keine Werkzeugliste', () => {
        const w = montiert();
        expect(w.find('.hud-menu').classes()).toContain('hud-menu--zu');
        expect(w.find('.hud-pille').text()).toContain('PIPESEGMENT');
        expect(w.find('.hud-pille').text()).toContain('H1');
        expect(w.find('.hud-menu-tasten').exists()).toBe(false);
        expect(w.find('.hud-bearb').exists()).toBe(false);
        w.unmount();
    });

    it('ein Tipp klappt auf: Aktionen und — im Modus — die Werkzeugliste; ein Werkzeug klappt wieder zu', async () => {
        const b = useBearbeitung();
        useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
        b.modusSetzen(true);
        await b.einordne(ROHR, null);
        const w = montiert();
        await w.find('.hud-pille').trigger('click');
        expect(w.find('.hud-menu').classes()).not.toContain('hud-menu--zu');
        expect(w.findAll('.hud-menu-btn').length).toBeGreaterThan(0);
        const knoepfe = w.findAll('.hud-bearb-btn');
        expect(knoepfe.length).toBeGreaterThan(0);
        const kg = knoepfe.find(k => k.text().includes('Kostengruppe'));
        expect(kg).toBeTruthy();
        await kg.trigger('click');
        expect(b.scharfId).toBe('kg-setzen');
        expect(w.find('.hud-menu').classes()).toContain('hud-menu--zu');
        expect(w.find('.hud-menu').classes()).toContain('hud-menu--scharf');
        // KEIN Formular hier — die Leiste hat es.
        expect(w.find('.bearb-form').exists()).toBe(false);
        await w.find('.hud-pille').trigger('click');
        expect(w.find('.hud-bearb-hinweis').text()).toContain('Kostengruppe');
        expect(w.find('.bearb-form').exists()).toBe(false);
        w.unmount();
    });

    it('aufgeklappt zeigt sie, was das Bauteil berührt — die Chips aus dem Beziehungsindex (Teil XVII)', async () => {
        const b = useBearbeitung();
        useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
        b.modusSetzen(true);
        const beziehungen = [
            { art: 'anschluss', a: 'H1', b: 'S1', an: 'H1', bn: 'S1', mass: { ende: 'anfang', dz: 0 }, guete: 'form' },
            { art: 'anschluss', a: 'H1', b: 'S2', an: 'H1', bn: 'S2', mass: { ende: 'ende', dz: 0 }, guete: 'form' },
            { art: 'auflage', a: 'H1', b: 'gelaende', an: 'H1', bn: 'Gelände', mass: { ueberdeckung: 1.2, lage: 'unter' }, guete: 'form' },
            { art: 'schnitt', a: 'F1', b: 'H1', an: 'Fundament', bn: 'H1', mass: { abstand: 0 }, guete: 'form' },
            { art: 'schnitt', a: 'K9', b: 'H1', an: 'Kammer', bn: 'H1', mass: { volumenHuelle: 0.4 }, guete: 'huelle' },
        ];
        await b.einordne({ ...ROHR, beziehungen }, null);
        const w = montiert();
        expect(w.find('.hud-pille').attributes('title')).toContain('2 Anschlüsse (S1, S2)');
        expect(w.find('.hud-beziehungen').exists()).toBe(false);          // zu: nur im Title
        await w.find('.hud-pille').trigger('click');
        const chips = w.findAll('.hud-beziehung').map(c => c.text());
        // Form-Güte ist eine Warnung („schneidet"), Hüllen-Güte nur ein Kandidat („Hülle berührt").
        expect(chips).toEqual(['2 Anschlüsse (S1, S2)', 'Überdeckung 1,20 m', 'schneidet Fundament', 'Hülle berührt Kammer']);
        expect(w.findAll('.hud-beziehung--warnung').map(c => c.text())).toEqual(['schneidet Fundament']);
        w.unmount();
    });

    it('ein anderes Bauteil klappt die Pille zu', async () => {
        const w = montiert();
        await w.find('.hud-pille').trigger('click');
        expect(w.find('.hud-menu-tasten').exists()).toBe(true);
        await w.setProps({ element: { ...ROHR, globalId: 'H2', name: 'H2', localId: 43 } });
        expect(w.find('.hud-menu-tasten').exists()).toBe(false);
        w.unmount();
    });
});
