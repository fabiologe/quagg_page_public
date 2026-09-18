// @vitest-environment jsdom
/**
 * Der Ausgeben-Dialog (Fahrplan „Klare Abläufe“, S4 neu; Kassensturz E10) — gemountet,
 * mit dem echten Baum, der echten Bereitschaft und dem echten Draht (AuftragApi, abgehört).
 *
 * Vorher (Template 2026-09-12): bis zu 9 Textblöcke vor dem Start, keine Wahl außer
 * „Eigenbau live mitnehmen“; ein Vorgang, der sich nicht bauen ließ, sperrte die ganze
 * Ausgabe erst nach dem Serverlauf.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const ae = vi.hoisted(() => ({ wert: null }));
const bea = vi.hoisted(() => ({ wert: null }));
vi.mock('../stores/useAenderungen.js', () => ({ useAenderungen: () => ae.wert }));
vi.mock('../stores/useBearbeitung.js', () => ({ useBearbeitung: () => bea.wert }));

import AusgebenDialog from '../components/AusgebenDialog.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { AuftragApi } from '../services/AuftragApi.js';

const NORD = { ableitung: 'ab-nord', titel: 'Kanalgraben Nord' };
const SUED = { ableitung: 'ab-sued', titel: 'Grube Süd' };
const GK2 = [2_540_000, 5_650_000, 100];
const PAKET = {
    version: 2, crs: 'EPSG:31466', crsHerkunft: 'Georeferenz-Erkennung der CDE (EPSG:31466)',
    bauteile: [
        { cdeId: 'cde-cut-s', klasse: 'IFCEARTHWORKSCUT', vorgang: SUED, wirt: 'G1', quellen: { gelaende: 'G1' }, ursprung: GK2 },
        { cdeId: 'cde-fill-n', klasse: 'IFCEARTHWORKSFILL', vorgang: NORD, quellen: { gelaende: 'G1' }, ursprung: GK2 },
        { cdeId: 'cde-cut-n', klasse: 'IFCEARTHWORKSCUT', vorgang: NORD, wirt: 'G1', quellen: { gelaende: 'G1' }, ursprung: GK2 },
    ],
    misserfolge: [{ globalId: 'cde-rohr-n', grund: 'Rohr fehlt', vorgang: NORD }],
    leer: [], verborgen: [],
    quellDokumente: [{ sha256: 'g', datei: 'Gelaende.ifc', revision: 1, globalIds: ['G1'] }],
};

let gesendet;
async function aufbauen({ offeneSchritte = 0 } = {}) {
    ae.wert = reactive({
        sitzungSchritte: Array.from({ length: offeneSchritte }, (_, i) => ({ id: `s${i}` })),
        eintraege: [{ art: 'erzeugt', globalId: 'cde-rohr-n', modellSha: 'enq', wann: 1 }],
        wirksamerStand: () => new Map(), historischerStand: () => new Map(),
    });
    bea.wert = reactive({ commitDialogOffen: false });
    setActivePinia(createPinia());
    const cde = useCdeStore();
    await cde.ready;
    cde.auftrag = { id: 42069, name: 'BlazeIT' };
    cde.dokumente = [
        { sha256: 'g', name: 'Gelaende.ifc', basisname: 'Gelaende', art: 'modell', revision: 1, status: 'WIP' },
        { sha256: 'k', name: 'Kanal.ifc', basisname: 'Kanal', art: 'modell', revision: 2, status: 'Shared' },
        { sha256: 'enq', name: 'ENQUIER.ifc', basisname: 'ENQUIER', art: 'modell', revision: 1, status: 'WIP' },
    ];
    cde.saetze = [{ id: 's1', name: 'Nord', enthaelt: ['g', 'k'] }];
    cde.aktiverSatzId = 's1';
    gesendet = [];
    vi.spyOn(AuftragApi, 'verbundStarten').mockImplementation(async (_id, _satz, o) => {
        gesendet.push(o);
        return { lauf_id: 'v-1', zustand: 'wartet', abgewaehlt: [] };
    });
    vi.spyOn(AuftragApi, 'verbundStatus').mockResolvedValue({ zustand: 'laeuft', schritt: 'rechnet' });
    const api = { eigenbauPaket: vi.fn(async () => structuredClone(PAKET)) };
    const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(AusgebenDialog); } });
    const w = mount(Huelle, { global: { stubs: {
        CdeIcon: { template: '<i />' },
        PruefberichtPanel: { template: '<div />' },
        CdeDialog: { props: ['offen', 'titel', 'icon'], template: '<div v-if="offen" class="dlg"><slot /><footer><slot name="fuss" /></footer></div>' },
    } } });
    return { w, dlg: w.findComponent(AusgebenDialog), api };
}
// Die Textblöcke vor dem Start — dieselbe Größe wie in der Karte: alles, was außerhalb von „Details“ liest.
const textbloecke = (w) => w.findAll('p').filter(p => !p.element.closest('details'));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('der Ausgeben-Dialog', () => {
    it('vor dem Start: EINE Zeile, EIN Satz mit Laden und Weglassen — nach Weglassen bereit und gesendet', async () => {
        const { w, dlg } = await aufbauen();
        await dlg.vm.oeffnen({ art: 'erdbau' });
        await flushPromises();
        expect(textbloecke(w)).toHaveLength(2);
        expect(w.find('.ag-stand').text()).toBe('Nicht bereit · 3 Teile aus 2 Vorgängen');
        expect(w.find('.ag-satz').text()).toContain('Kanalgraben Nord: 1 Teil lässt sich nicht bauen (Rohr fehlt) — ENQUIER.ifc steht nicht im Satz.');
        expect(w.findAll('.ag-knopf').map(b => b.text())).toEqual(['ENQUIER.ifc laden', 'Weglassen']);
        expect(w.find('.ag-start').attributes('disabled')).toBeDefined();

        await w.findAll('.ag-knopf')[1].trigger('click');
        expect(textbloecke(w)).toHaveLength(1);
        expect(w.find('.ag-stand').text()).toBe('Bereit · 1 Teil aus 1 Vorgang · 3 weggelassen');
        await w.find('.ag-start').trigger('click');
        await flushPromises();
        expect(gesendet).toHaveLength(1);
        const { eigenbau, modus, modelle } = gesendet[0];
        expect(modus).toBe('erdbau');
        expect(modelle).toBe(null);
        expect(eigenbau.bauteile.map(b => b.cdeId)).toEqual(['cde-cut-s']);
        expect(eigenbau.ausgelassen.map(a => a.globalId)).toEqual(['cde-fill-n', 'cde-cut-n', 'cde-rohr-n']);
        w.unmount();
    });

    it('„Laden“ reicht das fehlende Modell an die Schale', async () => {
        const { w, dlg } = await aufbauen();
        await dlg.vm.oeffnen({ art: 'erdbau' });
        await flushPromises();
        await w.findAll('.ag-knopf')[0].trigger('click');
        expect(w.findComponent(AusgebenDialog).emitted('laden')).toEqual([['enq']]);
        expect(w.find('.ag-stand').text()).toContain('kommt in den Satz');
        w.unmount();
    });

    it('Verbund: ein Modell abgewählt → nur die angehakten; Autor, Organisation und Bezugssystem reisen mit', async () => {
        const { w, dlg } = await aufbauen();
        await dlg.vm.oeffnen({ art: 'verbund' });
        await flushPromises();
        await w.findAll('.ag-knopf').find(b => b.text() === 'Weglassen').trigger('click');
        await w.findAll('.ag-knoten input[type=checkbox]')[1].trigger('change');     // Kanal.ifc ab
        const [autor, organisation] = w.findAll('.ag-feld input');
        await autor.setValue('Anna Muster');
        await organisation.setValue('Büro Muster');
        await w.find('.ag-feld select').setValue('EPSG:31466');
        expect(w.find('.ag-stand').text()).toBe('Bereit · 1 Modell · Eigenbau 1 Teil · 1 abgewählt · 3 weggelassen');
        await w.find('.ag-start').trigger('click');
        await flushPromises();
        const o = gesendet[0];
        expect([o.modus, o.modelle, o.autor, o.organisation, o.crs]).toEqual(['verbund', ['g'], 'Anna Muster', 'Büro Muster', 'EPSG:31466']);
        // Auch im Paket — der Schreiber liest sie dort, solange der Server die Felder nicht kennt.
        expect([o.eigenbau.autor, o.eigenbau.organisation, o.eigenbau.crs]).toEqual(['Anna Muster', 'Büro Muster', 'EPSG:31466']);
        w.unmount();
    });

    it('ein Bezugssystem, in dem die Koordinaten nicht liegen, sagt der Dialog vorher', async () => {
        const { w, dlg } = await aufbauen();
        await dlg.vm.oeffnen({ art: 'erdbau' });
        await flushPromises();
        await w.findAll('.ag-knopf').find(b => b.text() === 'Weglassen').trigger('click');
        await w.find('.ag-feld select').setValue('EPSG:31467');
        expect(w.find('.ag-satz').text()).toMatch(/^EPSG:31467 passt nicht/);
        await w.findAll('.ag-knopf').find(b => b.text() === 'Wie ermittelt').trigger('click');
        expect(w.find('.ag-stand').text()).toMatch(/^Bereit/);
        w.unmount();
    });

    it('K8: offene Bearbeitung → „Sichern und ausgeben“; nach dem Sichern geht es von selbst weiter', async () => {
        const { w, dlg } = await aufbauen({ offeneSchritte: 2 });
        await dlg.vm.oeffnen({ art: 'erdbau' });
        await flushPromises();
        await w.findAll('.ag-knopf').find(b => b.text() === 'Weglassen').trigger('click');
        expect(w.find('.ag-start').text()).toContain('Sichern und ausgeben');
        await w.find('.ag-start').trigger('click');
        expect(bea.wert.commitDialogOffen).toBe(true);
        expect(gesendet).toHaveLength(0);
        ae.wert.sitzungSchritte = [];            // gesichert
        bea.wert.commitDialogOffen = false;
        await flushPromises();
        await flushPromises();
        expect(gesendet).toHaveLength(1);
        w.unmount();
    });
});
