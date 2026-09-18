// @vitest-environment jsdom
/**
 * Die linke Tafel „Modelle“ (Kassensturz H3, mit S3 „Viewer = Satz“).
 *
 * Vorher (Karte 2026-09-12): links nur die Bauwerksstruktur; Pillen, „IFC
 * laden“/„Hinzufügen“, Kategorien und Geschosse schwebten über dem Bild,
 * Lage und Import standen unten in der Tafel „Bauteil“. Fünf Ladewege, drei
 * schwebende Tafeln.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CdeModellTafel from '../components/CdeModellTafel.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { usePanels, PANEL_DEFS } from '../stores/usePanels.js';
import { useCdeStore } from '../stores/useCdeStore.js';

const WURZEL = join(process.cwd(), 'src/features/cde/');
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');

function montiere(api) {
    const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(CdeModellTafel); } });
    return mount(Huelle, { attachTo: document.body, global: { stubs: { CdeIcon: { template: '<i />' }, IfcSpatialWindow: { template: '<div class="sw-stub" />' } } } });
}

describe('die Tafel „Modelle“', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('heisst „Modelle“ und steht links', () => {
        const def = PANEL_DEFS.find(p => p.id === 'struktur');
        expect(def).toMatchObject({ titel: 'Modelle', kurz: 'Modelle', seite: 'left' });
    });

    it('oben der Satz und der EINE Weg hinein; die Ziele für Kategorien und Geschosse meldet sie an und ab', async () => {
        const cde = useCdeStore();
        await cde.ready;
        cde.saetze = [{ id: 's1', name: 'Nord', enthaelt: [] }];
        cde.aktiverSatzId = 's1';
        const ziele = {};
        const api = {
            modellHinzufuegen: vi.fn(), laedtGerade: () => false,
            tafelZielSetzen: (n, el) => { ziele[n] = el; },
            kategorienDa: () => true, geschosseDa: () => true,
            getGeoreferenzen: () => ({ m1: { stufe: { wert: 50, text: 'Kartenbezug' }, nordrichtung: { rad: 0, quelle: 'Norm' }, einheit: { name: 'Meter', faktor: 1 }, befunde: [] } }),
            getImportBefunde: () => ({ 'dgm.ifc': { schema: 'IFC4', bauteile: 3, texte: [] } }),
            getHoehenBefunde: () => ({}),
        };
        const w = montiere(api);
        await nextTick();
        expect(w.find('.mt-satz').text()).toContain('Nord');
        expect(w.find('.mt-hinzu').text()).toContain('Modell hinzufügen');
        await w.find('.mt-hinzu input').trigger('change');
        expect(api.modellHinzufuegen).toHaveBeenCalledTimes(1);
        expect(ziele.kategorien).toBeInstanceOf(HTMLElement);
        expect(ziele.geschosse).toBeInstanceOf(HTMLElement);
        expect(w.text()).toContain('Lage und Import');
        expect(w.text()).toContain('Import · dgm.ifc');
        w.unmount();
        expect(ziele.kategorien).toBe(null);
        expect(ziele.geschosse).toBe(null);
    });

    it('„Ansicht → Kategorien“ öffnet die Tafel an ihrem Abschnitt', async () => {
        const panels = usePanels();
        const api = { tafelZielSetzen: () => {}, kategorienDa: () => true, geschosseDa: () => false, laedtGerade: () => false };
        const w = montiere(api);
        panels.zeigeAbschnitt('kategorien');
        await nextTick(); await nextTick();
        expect(panels.isOpen('struktur')).toBe(true);
        expect(w.findAll('details.mt-abschnitt')[0].attributes('open')).toBeDefined();
        expect(panels.abschnitt).toBe(null);
        w.unmount();
    });
});

describe('über dem Bild schwebt nichts mehr, was eine Tafel ist', () => {
    const viewer = lies('components/IfcViewer.vue');

    it('Kategorien und Geschosse kommen per Teleport in die Tafel — eingebettet, nicht mehr schwebend', () => {
        expect(viewer).toMatch(/<Teleport v-if="tafelZiele\.kategorien" :to="tafelZiele\.kategorien">\s*<IfcLayerPanel\s+eingebettet/);
        expect(viewer).toMatch(/<Teleport v-if="tafelZiele\.geschosse" :to="tafelZiele\.geschosse">\s*<IfcStoreyNav\s+eingebettet/);
        expect(viewer).not.toMatch(/showLayerPanel|showStoreyNav|model-tag-row|class="top-bar"/);
        for (const d of ['components/IfcLayerPanel.vue', 'components/IfcStoreyNav.vue']) {
            expect(lies(d), d).toMatch(/\.eingebettet \{\s*position: static/);
        }
    });

    it('Laden: EIN Weg — jedes Datei-Feld der CDE ruft „Modell hinzufügen“', () => {
        const felder = [];
        for (const d of ['components/IfcViewer.vue', 'components/CdeModellTafel.vue', 'views/CdeView.vue', 'components/CdeToolbox.vue']) {
            for (const m of lies(d).matchAll(/<input type="file" accept="\.ifc"[^>]*>/g)) felder.push(m[0]);
        }
        expect(felder.length).toBe(2);                              // Tafel und Leerzustand
        for (const f of felder) expect(f).toMatch(/@change="(modellHinzufuegen|hinzufuegen)"/);
    });

    it('Lage und Import sind aus der Tafel „Bauteil“ gezogen', () => {
        const toolbox = lies('components/CdeToolbox.vue');
        expect(toolbox).not.toMatch(/Georeferenz|importBefunde|getGeoreferenzen/);
        expect(lies('components/CdeModellTafel.vue')).toContain('api.getGeoreferenzen?.()');
    });
});

describe('Kategorien heissen wie in der Bauwerksstruktur', () => {
    it('aus IFCEARTHWORKSFILL wird „IfcEarthworksFill“ — nicht mehr „E A R T H W O R K S F I L L“', async () => {
        setActivePinia(createPinia());
        const IfcLayerPanel = (await import('../components/IfcLayerPanel.vue')).default;
        const kategorien = [
            { name: 'IFCEARTHWORKSFILL', visible: true, count: 2 },
            { name: 'IFCBUILDINGELEMENTPROXY', visible: true, count: 74 },
        ];
        const Huelle = defineComponent({ setup() { provideViewerApi({}); return () => h(IfcLayerPanel, { eingebettet: true, categories: kategorien }); } });
        const w = mount(Huelle, { global: { stubs: { CdeIcon: { template: '<i />' } } } });
        const namen = w.findAll('.cat-name').map(n => n.text());
        expect(namen).toEqual(expect.arrayContaining(['IfcEarthworksFill', 'IfcBuildingElementProxy']));
        expect(namen.join(' | ')).not.toMatch(/[A-Z] [A-Z] [A-Z]/);
        w.unmount();
    });
});
