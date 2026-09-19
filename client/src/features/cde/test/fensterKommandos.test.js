// @vitest-environment jsdom
/**
 * Die Fenster setzen Kommandos ab, statt selbst zu schreiben (Teil XXIV, O6).
 *
 * Bis O6 bauten Merkmalsfenster und Planungs-Cockpit ihre Journaleinträge
 * selbst — ohne Beleg, am Werkzeugkatalog vorbei. Jetzt gehen sie über
 * `useKommandoweg` (Modus-Sperre, Kommando, `fuehreAus`):
 *
 *   1. Merkmalsfenster: „Merkmalssatz setzen" — der Satz aus dem Pset-Browser,
 *      die übrigen Sätze bleiben; Beleg, Modell, EIN Rückgängig.
 *   2. Cockpit: Kostengruppe und DIN-277-Klasse über `kg-setzen`/`din277-setzen`
 *      — dieselben Werkzeuge wie in der Werkzeugleiste; ohne Modus nichts.
 *   3. Cockpit: der Altbestand (vor Stufe 7) kommt als EIN Vorgang mit
 *      Systembeleg herein, statt je Zuweisung ein Eintrag.
 *   4. Die Werkzeugleiste bietet „Merkmalssatz setzen" nicht an — sein
 *      Formular ist das Fenster.
 *
 * Die Fenster sind echt montiert; nur ihre Kinder (Pset-Browser, Tabellen)
 * sind Attrappen, die das Ereignis schicken, das sie im Browser schicken.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { repo } from '../services/RepoFacade.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { provideViewerApi } from '../composables/viewerApi.js';
import IfcSemanticWindow from '../components/IfcSemanticWindow.vue';
import IfcPlanningCockpit from '../components/IfcPlanningCockpit.vue';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => { document.body.innerHTML = ''; });

const bald = () => new Promise(r => setTimeout(r, 30));
const G = '2Gelief0Rohr0000000001';

function montiere(Fenster, api, { stubs = {} } = {}) {
    const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(Fenster); } });
    return mount(Huelle, { attachTo: document.body, global: { stubs } });
}

describe('1 — Merkmalsfenster: „Merkmalssatz setzen"', () => {
    it('der Satz aus dem Pset-Browser wird ein Kommando; der zweite Satz lässt den ersten stehen', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const ifc = useIfcStore();
        ifc.setElement({ globalId: G, modelId: 'netz.ifc', localId: 7, type: 'IFCPIPESEGMENT', name: 'H7', psets: [] });
        const wendeEintragAn = vi.fn(async () => ({}));
        const api = { wendeEintragAn, refreshElement: async () => null, modellShaVon: () => 'sha-netz',
                      bearbeitenEin: () => { b.modusSetzen(true); return true; } };
        const w = montiere(IfcSemanticWindow, api, { stubs: { IfcSidebar: true } });
        await nextTick();
        const sidebar = w.findComponent({ name: 'IfcSidebar' });
        expect(sidebar.exists()).toBe(true);

        // Genau die Nutzlast des Pset-Browsers (`PsetBrowser.confirmAdd`).
        sidebar.vm.$emit('add-pset', { psetName: 'Pset_PipeSegmentTypeCommon', props: [{ name: 'Status', value: 'NEW' }] });
        await bald();
        const e1 = ae.eintraege.at(-1);
        expect(e1).toMatchObject({ art: 'pset', globalId: G, modell: 'geliefert', modellSha: 'sha-netz',
                                   nachher: { Pset_PipeSegmentTypeCommon: [{ name: 'Status', value: 'NEW' }] } });
        expect(e1.kommando).toMatchObject({ werkzeug: 'merkmalssatz-setzen', ziel: [G],
                                            werte: { satz: 'Pset_PipeSegmentTypeCommon', merkmale: [{ name: 'Status', value: 'NEW' }] } });
        expect(wendeEintragAn).toHaveBeenCalledWith(e1);
        expect(b.modusAn).toBe(true);                                // das Fenster schaltete ein (Kassensturz E4)

        sidebar.vm.$emit('add-pset', { psetName: 'Quagg_Pruefung', props: [{ name: 'Geprueft', value: 'ja' }] });
        await bald();
        expect(Object.keys(ae.eintraege.at(-1).nachher)).toEqual(['Pset_PipeSegmentTypeCommon', 'Quagg_Pruefung']);

        // Derselbe Satz noch einmal: nichts einzutragen — und das Fenster sagt es.
        const n = ae.eintraege.length;
        sidebar.vm.$emit('add-pset', { psetName: 'Quagg_Pruefung', props: [{ name: 'Geprueft', value: 'ja' }] });
        await bald();
        expect(ae.eintraege.length).toBe(n);
        expect(ifc.psetError).toMatch(/galt schon/);

        await ae.zurueck('fabio');                                   // EIN Schritt: nur der zweite Satz geht
        expect(Object.keys(ae.wirksamerStand('pset').get(G))).toEqual(['Pset_PipeSegmentTypeCommon']);
        w.unmount();
    });

    it('lässt sich der Modus nicht einschalten, entsteht nichts — mit Grund im Fenster', async () => {
        const ae = useAenderungen();
        const ifc = useIfcStore();
        ifc.setElement({ globalId: G, modelId: 'netz.ifc', localId: 7, type: 'IFCPIPESEGMENT', name: 'H7', psets: [] });
        const w = montiere(IfcSemanticWindow, { wendeEintragAn: vi.fn(), bearbeitenEin: () => false,
                                                bearbeitenSperrgrund: () => 'Nur lesen.' }, { stubs: { IfcSidebar: true } });
        await nextTick();
        w.findComponent({ name: 'IfcSidebar' }).vm.$emit('add-pset', { psetName: 'X', props: [] });
        await bald();
        expect(ae.eintraege).toHaveLength(0);
        expect(ifc.psetError).toBe('Nur lesen.');
        w.unmount();
    });
});

describe('2 + 3 — Cockpit', () => {
    const ATTRAPPEN = { IfcAreaSchedule: true, IfcKgEditor: true, IfcVolumeTab: true, IfcCountTab: true,
                        IfcPauschalTab: true, IfcKostenTab: true, IfcQualityTab: true };
    const api = () => ({ modellShaVon: (gid) => `sha-${gid.slice(0, 4)}` });

    it('Altbestand: EIN Vorgang mit Systembeleg, danach ist der alte Schlüssel weg', async () => {
        await repo.set('din276-overrides', { A1: '411', A2: '412' });
        const ae = useAenderungen();
        const w = montiere(IfcPlanningCockpit, api(), { stubs: ATTRAPPEN });
        await bald(); await bald();
        const neu = ae.eintraege.filter(e => e.art === 'kg');
        expect(neu.map(e => [e.globalId, e.nachher])).toEqual([['A1', '411'], ['A2', '412']]);
        expect(new Set(neu.map(e => e.vorgang)).size).toBe(1);        // vorher: zwei Einträge, zwei Sichern
        expect(neu[0].kommando).toMatchObject({ werkzeug: 'system:uebernahme', ziel: ['A1', 'A2'], werte: { art: 'kg' } });
        // Der Vorgang IST der Beleg (K2) — und er sagt, was er war.
        expect(neu[0].vorgang).toBe(neu[0].kommando.id);
        expect(neu[0].vorgangTitel).toBe('Übernahme Kostengruppen-Zuweisungen');
        expect(await repo.get('din276-overrides')).toBeFalsy();
        w.unmount();
    });

    it('DIN-277-Klasse und Kostengruppe von Hand: dieselben Werkzeuge wie in der Leiste — ohne Modus nichts', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const w = montiere(IfcPlanningCockpit, api(), { stubs: ATTRAPPEN });
        await bald();

        // Ohne Bearbeiten-Modus: nichts (Stufe 12.0d).
        w.findComponent({ name: 'IfcAreaSchedule' }).vm.$emit('override-class', { globalId: G, classCode: 'NUF2' });
        await bald();
        expect(ae.eintraege).toHaveLength(0);

        b.modusSetzen(true);
        w.findComponent({ name: 'IfcAreaSchedule' }).vm.$emit('override-class', { globalId: G, classCode: 'NUF2' });
        await bald();
        expect(ae.eintraege.at(-1)).toMatchObject({ art: 'din277', globalId: G, nachher: 'NUF2', modellSha: 'sha-2Gel' });
        expect(ae.eintraege.at(-1).kommando).toMatchObject({ werkzeug: 'din277-setzen', ziel: [G], werte: { din277: 'NUF2' } });

        await w.findAll('.ck-tab').find(t => t.text().includes('Kostengruppen')).trigger('click');
        w.findComponent({ name: 'IfcKgEditor' }).vm.$emit('override-kg', { globalId: G, kgCode: '411' });
        await bald();
        expect(ae.eintraege.at(-1)).toMatchObject({ art: 'kg', globalId: G, nachher: '411' });
        expect(ae.eintraege.at(-1).kommando.werkzeug).toBe('kg-setzen');
        // Zurück zur Regel („— per Regel —"): leer heisst zurücknehmen.
        w.findComponent({ name: 'IfcKgEditor' }).vm.$emit('override-kg', { globalId: G, kgCode: null });
        await bald();
        expect(ae.wirksamerStand('kg').has(G)).toBe(false);
        w.unmount();
    });
});

describe('4 — die Werkzeugleiste bietet es nicht an', () => {
    it('„Merkmalssatz setzen" steht im Katalog, aber in keiner Auswahl', () => {
        expect(nachId('merkmalssatz-setzen')).toBeTruthy();
        const alle = passende({ bauform: 'achse+profil', guete: 'gemessen' }).map(x => x.id);
        expect(alle).toContain('kg-setzen');
        expect(alle).not.toContain('merkmalssatz-setzen');
    });
});
