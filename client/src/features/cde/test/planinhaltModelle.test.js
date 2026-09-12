// @vitest-environment jsdom
/**
 * Planinhalt: je Modell ein Häkchen, der Eigenbau als eigenes (Abnahme 2026-09-12, T3).
 *
 * Fabio: „Planinhalt mit Häkchen je Inhalt (auch Eigenbau)“. Vorher gab es
 * Häkchen nur je Darstellungsart (Umrisse, Beschriftung …) — was von WELCHEM
 * Modell aufs Blatt kommt, ließ sich nicht wählen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const gesammelt = [];
vi.mock('../services/IfcPdfExporter.js', async (original) => ({
    ...(await original()),
    sammleUmrisseRoh: vi.fn(async (basis) => { gesammelt.push([...basis.fragmentsList.keys()]); return []; }),
    sammleFootprints: vi.fn(async () => ['fuss']),
}));

import { erstellePlanInhalt } from '../services/PlanContent.js';
import { usePlan, PLAN_VORGABEN } from '../stores/usePlan.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import IfcPlanPanel from '../components/IfcPlanPanel.vue';
import { provideViewerApi } from '../composables/viewerApi.js';

const WURZEL = join(process.cwd(), 'src/features/cde/');

describe('das Blatt nimmt nur die gewählten Modelle', () => {
    it('ein abgewähltes Modell (samt Delta) fällt aus der Sammlung — und web-ifc liest es nicht mehr', async () => {
        const liste = new Map([['dgm.ifc', {}], ['kanal.ifc', {}], ['kanal.ifc-DELTA-MODEL-1', {}]]);
        const api = {
            getFragmentsList: () => liste, getCategoryGroups: () => [],
            getWebIfcAPI: () => ({ webIfc: {}, modelID: 0, fragmentModelId: 'kanal.ifc' }),
        };
        const inhalt = erstellePlanInhalt(api);
        const ohne = await inhalt.hole({ modelleAus: ['kanal.ifc'] });
        expect(gesammelt.at(-1)).toEqual(['dgm.ifc']);
        expect(ohne.footprintProducts).toBe(null);

        const mit = await inhalt.hole({});
        expect(gesammelt.at(-1)).toEqual(['dgm.ifc', 'kanal.ifc', 'kanal.ifc-DELTA-MODEL-1']);   // neuer Schlüssel, neu gesammelt
        expect(mit.footprintProducts).toEqual(['fuss']);
    });

    it('der Eigenbau geht als Modell mit hinaus, und seine Linien aus dem Verlauf fallen weg', () => {
        const plan = readFileSync(join(WURZEL, 'components/IfcPlanCanvas.vue'), 'utf8');
        expect(plan).toContain("modelleAus: [...(o.modelleAus ?? []), ...(o.eigenbau === false ? [CDE_MODELL_ID] : [])],");
        expect(plan).toContain('erzeugte: o.eigenbau === false ? [] :');
    });
});

describe('die Tafel „Planinhalt“', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    function montiere() {
        const api = { getCategoryGroups: () => [], getLoadedModelShas: () => [] };
        const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(IfcPlanPanel); } });
        return mount(Huelle, { global: { stubs: { CdeIcon: { template: '<i />' } } } });
    }

    it('neue Optionen mit Vorgabe: kein Modell ausgelassen, Eigenbau drauf', () => {
        expect(PLAN_VORGABEN.modelleAus).toEqual([]);
        expect(PLAN_VORGABEN.eigenbau).toBe(true);
    });

    it('je geladenem Modell ein Häkchen, der Eigenbau einmal und eigens — abwählen schreibt die Option', async () => {
        useIfcStore().setModelList([
            { modelId: 'dgm.ifc', name: 'DGM.ifc' }, { modelId: 'kanal.ifc', name: 'Kanal.ifc' },
            { modelId: 'cde-eigenbau', name: 'cde-eigenbau' },
        ]);
        const w = montiere();
        const zeilen = () => w.findAll('.pp-check').map(z => z.text());
        expect(zeilen().slice(0, 3)).toEqual(['DGM.ifc', 'Kanal.ifc', 'Eigenbau']);
        expect(zeilen().filter(t => t === 'cde-eigenbau')).toEqual([]);

        const plan = usePlan();
        await w.findAll('.pp-check').find(z => z.text() === 'Kanal.ifc').find('input').setValue(false);
        expect(plan.optionen.modelleAus).toEqual(['kanal.ifc']);
        await w.findAll('.pp-check').find(z => z.text() === 'Eigenbau').find('input').setValue(false);
        expect(plan.optionen.eigenbau).toBe(false);
        await w.findAll('.pp-check').find(z => z.text() === 'Kanal.ifc').find('input').setValue(true);
        expect(plan.optionen.modelleAus).toEqual([]);
        w.unmount();
    });
});
