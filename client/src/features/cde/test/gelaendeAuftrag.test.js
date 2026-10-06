// @vitest-environment jsdom
/**
 * Fahrplan BIMFY XYZ, X3 — der Weg aus BIMFY: Rohdatei ins Register, Auftrag starten,
 * abholen. Und der gepackte Transport des Journals (die 4-MB-Grenze), mit Rückfall
 * auf ungepackt, solange der Server ihn nicht kennt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { GZIP_AB, RemoteBackend } from '../services/RepoFacade.js';

vi.mock('../services/AuftragApi.js', () => ({
    AuftragApi: {
        hochladen: vi.fn(async () => ({ sha256: 'a'.repeat(64), datei: 'dgm.asc' })),
        gelaendeStarten: vi.fn(async () => ({ lauf_id: 'g-1', zustand: 'wartet', modus: 'gelaende' })),
        verbundStatus: vi.fn(async () => ({ zustand: 'geprueft', dokument: { datei: 'Gelaende_dgm_R01.ifc', sha256: 'b'.repeat(64) } })),
        register: vi.fn(async () => ({ dokumente: [] })),
    },
}));

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const fakeApi = (antworten) => {
    const aufrufe = [];
    return { aufrufe, put: vi.fn(async (url, body, opt) => { aufrufe.push({ url, body, opt }); const a = antworten.shift(); if (a) throw a; return { data: { ok: true } }; }),
             get: vi.fn(async () => ({ data: {} })) };
};

describe('RemoteBackend · gepackt speichern', () => {
    it('ab GZIP_AB gzip mit Content-Encoding; klein bleibt roh', async () => {
        const api = fakeApi([]);
        const b = new RemoteBackend(7, api);
        await b.set('ifc-repo:global:aenderungen', { x: 'y'.repeat(GZIP_AB) });
        expect(api.aufrufe[0].opt.headers['Content-Encoding']).toBe('gzip');
        expect(api.aufrufe[0].body.byteLength).toBeLessThan(GZIP_AB / 10);
        await b.set('ifc-repo:global:klein', { x: 1 });
        expect(api.aufrufe[1].opt).toBeUndefined();
    });
    it('ein alter Server lehnt gepackt ab: einmal roh nach, danach packt der Tab nicht mehr', async () => {
        const api = fakeApi([{ response: { status: 500 } }]);
        const b = new RemoteBackend(7, api);
        expect(await b.set('ifc-repo:global:aenderungen', { x: 'y'.repeat(GZIP_AB) })).toBe(true);
        expect(api.aufrufe.map(a => !!a.opt?.headers)).toEqual([true, false]);
        await b.set('ifc-repo:global:aenderungen', { x: 'z'.repeat(GZIP_AB) });
        expect(api.aufrufe.at(-1).opt).toBeUndefined();
    });
    it('der Journal-Wächter (409) ist kein Packfehler: kein zweiter Versuch, Grund zurück', async () => {
        const api = fakeApi([{ response: { status: 409, data: { detail: 'Stufe' } } }]);
        const b = new RemoteBackend(7, api);
        expect(await b.set('ifc-repo:global:aenderungen', { x: 'y'.repeat(GZIP_AB) })).toEqual({ abgelehnt: 'Stufe' });
        expect(api.aufrufe).toHaveLength(1);
    });
});

describe('BIMFY · Als Gelände anlegen', () => {
    it('lädt die Rohdatei hoch, startet mit dem vorgeschlagenen System und meldet das Modell', async () => {
        vi.useFakeTimers();
        setActivePinia(createPinia());
        const { useCdeStore } = await import('../stores/useCdeStore.js');
        const cde = useCdeStore();
        cde.auftrag = { id: 7, name: 'Test' };
        cde.uebernehmeRegister = vi.fn(async () => {});
        const { AuftragApi } = await import('../services/AuftragApi.js');
        const { mount } = await import('@vue/test-utils');
        const BimfyPanel = (await import('../components/BimfyPanel.vue')).default;
        const w = mount(BimfyPanel, { global: { stubs: { CdeIcon: { template: '<i />' } } } });
        const text = 'ncols 3\nnrows 3\nxllcenter 410000\nyllcenter 5460000\ncellsize 1\n1 2 3\n4 5 6\n7 8 9\n';
        const datei = Object.assign(new File([text], 'dgm.asc'), { arrayBuffer: async () => new TextEncoder().encode(text).buffer });
        const input = w.find('input[type="file"]');
        Object.defineProperty(input.element, 'files', { value: [datei] });
        await input.trigger('change');
        await vi.runOnlyPendingTimersAsync();
        await w.vm.$nextTick();
        expect(w.find('.bf-gelaende').text()).toContain('Gelände erkannt');
        expect(w.find('.bf-crs').element.value).toBe('EPSG:25832');
        await w.find('.bf-gelaende .bf-knopf').trigger('click');
        await vi.runOnlyPendingTimersAsync();
        await vi.advanceTimersByTimeAsync(2100);
        await w.vm.$nextTick();
        expect(AuftragApi.hochladen).toHaveBeenCalledWith(7, expect.any(Blob), 'dgm.asc');
        expect(AuftragApi.gelaendeStarten).toHaveBeenCalledWith(7, 'a'.repeat(64), { crs: 'EPSG:25832' });
        expect(w.find('.bf-gelaende .bf-meldung').text()).toContain('Gelaende_dgm_R01.ifc liegt im Register');
        w.unmount();
    });
});
