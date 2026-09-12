// @vitest-environment jsdom
/**
 * Zeichnen nur im 3D — der Lageplan ist das Blatt (Abnahme 2026-09-12, B6 → E8).
 *
 * Fabio zu B6 („Zeichnen im Lageplan“): „muss man überhaupt zeichnen können
 * dort?“ Entscheidung E8: gezeichnet wird im 3D, auf dem Gelände in der
 * Draufsicht; der Lageplan behält Beschriften, Bemaßen, Rotstift.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CdeToolbox from '../components/CdeToolbox.vue';
import { provideViewerApi } from '../composables/viewerApi.js';
import { ausGruppe, eingabeArt, nachId } from '../services/Bearbeitungen.js';

vi.mock('../services/Bibliothek.js', () => ({
    ladeVorlagen: vi.fn(async () => [
        { id: 'v1', name: 'Schacht DN 1000', rezept: 'schacht', herkunft: 'eingebaut', vorgaben: { dn: 1000 } },
    ]),
    speichereVorlage: vi.fn(async () => ({ ok: true })),
    loescheVorlage: vi.fn(async () => {}),
}));

const WURZEL = join(process.cwd(), 'src/features/cde/');
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');
const istZug = (b) => ['zug', 'umriss'].includes(eingabeArt(b));

function montiere(api) {
    const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(CdeToolbox); } });
    return mount(Huelle, { global: { stubs: { CdeIcon: { template: '<i />' }, IfcSemanticWindow: { template: '<div />' } } } });
}

describe('der Lageplan ist das Blatt', () => {
    it('die Plan-Leiste hat kein „Zeichnen“ mehr — Setzen, Rotstift und Bemaßen bleiben', () => {
        const view = lies('views/CdeView.vue');
        expect(view).not.toMatch(/planPopover === 'zeichnen'|zeichneMit|ZEICHEN_WERKZEUGE|zeichenWerkzeug|vorlageZeichnen/);
        expect(view).toContain("planPopoverUm('setzen')");
        expect(view).toContain("planPopoverUm('stift')");
        expect(view).toContain('bemassungUmschalten()');
    });

    it('der Plan nimmt keine Züge mehr an — kein Motor im Plan-Canvas', () => {
        const plan = lies('components/IfcPlanCanvas.vue');
        expect(plan).not.toMatch(/useZeichnen\(|useEingabe\(|zeichneMit|zeichnen\.aktiv/);
        // Was gebaut ist, zeigt er weiter — aus dem Verlauf.
        expect(plan).toContain('erzeugtePunkte');
    });

    it('kein Hinweis schickt mehr zum Zeichnen in den Lageplan', () => {
        for (const d of ['components/CdeKontextleiste.vue', 'components/CdeToolbox.vue']) {
            expect(lies(d), d).not.toMatch(/im Lageplan zeichnen|oder im Lageplan|im <strong>Lageplan<\/strong> unter/);
        }
    });
});

describe('Erzeugen in der Tafel „Bauteil“', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('ohne Auswahl: jedes Werkzeug zum Erzeugen als Knopf — der Klick startet im 3D über den Viewer', async () => {
        const api = { zeichnenStarten: vi.fn(() => true), werkzeugStarten: vi.fn(() => true), bearbeitenSperrgrund: () => null };
        const w = montiere(api);
        await flushPromises();
        const erzeugen = ausGruppe('erzeugen');
        expect(erzeugen.length).toBeGreaterThan(0);
        const knoepfe = w.findAll('.tb-liste .tb-btn');
        for (const b of erzeugen) expect(knoepfe.map(k => k.text())).toContain(b.titel);

        const zug = erzeugen.find(istZug);
        await knoepfe.find(k => k.text() === zug.titel).trigger('click');
        expect(api.zeichnenStarten).toHaveBeenCalledWith(zug.id, {});
        w.unmount();
    });

    it('die Vorlagen wohnen jetzt hier und belegen die Felder vor', async () => {
        const api = { zeichnenStarten: vi.fn(() => true), werkzeugStarten: vi.fn(() => true), bearbeitenSperrgrund: () => null };
        const w = montiere(api);
        await flushPromises();
        const vorlage = w.findAll('.tb-vorlage .tb-btn').find(k => k.text() === 'Schacht DN 1000');
        expect(vorlage).toBeTruthy();
        await vorlage.trigger('click');
        if (istZug(nachId('schacht-zeichnen'))) {
            expect(api.zeichnenStarten).toHaveBeenCalledWith('schacht-zeichnen', { vorgaben: { dn: 1000 } });
        } else {
            expect(api.werkzeugStarten).toHaveBeenCalledWith('schacht-zeichnen', {});
        }
        w.unmount();
    });

    it('mit Sperre bleibt jeder Knopf grau — und der Grund steht da', async () => {
        const api = { zeichnenStarten: vi.fn(() => true), bearbeitenSperrgrund: () => 'Kein Modell geladen' };
        const w = montiere(api);
        await flushPromises();
        expect(w.find('.tb-sperre').text()).toContain('Kein Modell geladen');
        expect(w.findAll('.tb-liste .tb-btn').every(k => k.attributes('disabled') !== undefined)).toBe(true);
        w.unmount();
    });
});

describe('der Viewer startet Zeichnen im Raum', () => {
    it('zeichnenStarten: Bearbeitung ein, Motor im Raum, Vorgaben, Draufsicht beim Erzeugen', () => {
        const viewer = lies('components/IfcViewer.vue');
        const a = viewer.indexOf('function zeichnenStarten(');
        const rumpf = viewer.slice(a, viewer.indexOf('\n}\n', a));
        expect(rumpf).toContain('bearbeitenEin()');
        expect(rumpf).toContain('eingabe.starte(id)');
        expect(rumpf).toContain('bearbeitung.setzeWert(feld, wert)');
        expect(rumpf).toMatch(/gruppe === 'erzeugen'\) engine\.value\?\.viewTop\?\.\(\)/);
        expect(viewer).toContain('zeichnenStarten: (id, opts) => zeichnenStarten(id, opts),');
    });
});
