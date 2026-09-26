/**
 * P1.9: Ein Ergebnis gehört zu dem Lauf, der es erzeugt hat — echter Rechenweg
 * (Store → Worker-Code → WASM-SWMM, wie e2eTutorialnetz.test.js).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { setActivePinia, createPinia } from 'pinia';
import { JSDOM } from 'jsdom';

globalThis.DOMParser ??= new JSDOM('').window.DOMParser;
vi.mock('../core/worker/WorkerController.js', async () => ({
    WorkerController: (await import('./helpers/workerImProzess.js')).WorkerImProzess
}));
const { useIsybauStore } = await import('../store/index.js');
const { parseIsybauXML } = await import('../utils/xmlParser.js');
const { calculateBlockRain } = await import('../utils/RainModelService.js');

const XML = readFileSync(new URL('./9161_IGBWEST_Hydraulik.xml', import.meta.url), 'latin1');
const netz = () => {
    setActivePinia(createPinia());
    const store = useIsybauStore();
    store.loadParsedData(parseIsybauXML(XML));
    store.edges.get('FK001').profile.height = 0.3;
    store.setRainModel({ id: 'r100', type: 'block', series: calculateBlockRain(100, 15, 5), metadata: { duration: 15, interval: 5 } });
    store.rain.duration = 1;
    return store;
};

describe('Ergebnis gehört zum Lauf', () => {
    it('Regen des Laufs steht im Ergebnis; neuer Regen oder Bearbeitung → veraltet', async () => {
        const store = netz();
        await store.runSimulation();
        expect(store.simulation.status).toBe('success');
        expect(store.simulation.results.lauf.regen.id).toBe('r100');
        expect(store.simulation.results.lauf.dauerH).toBe(1);
        expect(store.simulation.veraltet).toBe(false);

        store.setRainModel({ id: 'r200', type: 'block', series: calculateBlockRain(200, 15, 5), metadata: { duration: 15, interval: 5 } });
        expect(store.simulation.veraltet).toBe(true);
        expect(store.simulation.results.lauf.regen.id).toBe('r100'); // Ergebnis bleibt beim gerechneten Regen

        await store.runSimulation();
        expect(store.simulation.veraltet).toBe(false);
        store.updateEdge('FK001', { roughness: 70 });
        expect(store.simulation.veraltet).toBe(true);
    }, 300000);

    it('Netzwechsel während der Rechnung: altes Ergebnis wird verworfen', async () => {
        const store = netz();
        const lauf = store.runSimulation();
        store.loadParsedData({ network: { nodes: new Map([['X', { id: 'X', x: 0, y: 0, z: 1 }]]), edges: new Map() }, hydraulics: { areas: [] } });
        await lauf;
        expect(store.simulation.results).toBeNull();
        expect(store.simulation.status).toBe('idle');
        expect(store.ui.meldungen.at(-1).text).toMatch(/vorher geladenen Netz/);
    }, 300000);

    it('Projekt ohne Regen erbt nicht den Regen des vorigen Projekts', () => {
        const store = netz();
        expect(store.rain.activeModelRain).not.toBeNull();
        store.loadProjectSnapshot({ nodes: [], edges: [], areas: [], rain: { duration: 2 } });
        expect(store.rain.activeModelRain).toBeNull();
        expect(store.rain.duration).toBe(2);
    });
});
