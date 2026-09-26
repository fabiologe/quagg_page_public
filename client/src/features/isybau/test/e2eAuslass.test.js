/**
 * doc/09 N1 + Nutzerfall: SWMM erlaubt an einem Auslass genau EINE Haltung
 * (flowrout.c:316, ERROR 141). Echter Rechenweg wie e2eTutorialnetz.test.js.
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
const { checkAuslaesse, waehleErsatzAuslass } = await import('../utils/preSolveValidation.js');

const netz = (datei) => {
    setActivePinia(createPinia());
    const store = useIsybauStore();
    store.loadParsedData(parseIsybauXML(readFileSync(new URL(datei, import.meta.url), 'latin1')));
    store.setRainModel({ type: 'block', series: calculateBlockRain(100, 15, 5), metadata: { duration: 15, interval: 5 } });
    store.rain.duration = 1;
    return store;
};

describe('Auslass: genau eine Haltung', () => {
    it('9161_IGBWEST (kein Auslass): Ersatz ist der Endknoten, SWMM rechnet durch', async () => {
        const store = netz('./9161_IGBWEST_Hydraulik.xml');
        store.edges.get('FK001').profile.height = 0.3; // Datei: Durchmesser 0 (eigene Vorab-Meldung)
        await store.runSimulation();
        // vorher: tiefster Knoten 626.31 (z = 0, zwei Haltungen) → ERROR 141 + 145
        expect(store.simulation.error).toBeNull();
        expect(store.simulation.status).toBe('success');
        expect(store.simulation.results.warnings.join(' ')).toContain('686.7a (Endknoten des Netzes)');
        expect(store.simulation.results.report).not.toMatch(/ERROR 14[15]/);
    }, 300000);

    it('Auslaufbauwerk mit zwei Zuläufen: deutsche Vorab-Meldung statt SWMM-Abbruch', async () => {
        const store = netz('./9161_IGBWEST_Hydraulik.xml');
        store.edges.get('FK001').profile.height = 0.3;
        store.updateNode('626.31', { type: 5 }); // Nutzer macht einen Knoten mit 2 Haltungen zum Auslass
        await store.runSimulation();
        expect(store.simulation.status).toBe('error');
        expect(store.simulation.invalidElementId).toBe('626.31');
        expect(store.simulation.error).toMatch(/^Knoten 626\.31: Auslass mit 2 Haltungen/);
        expect(store.simulation.results).toBeNull();
    }, 300000);
});

describe('Auslass-Regeln (Synthetik)', () => {
    const n = (id, z, extra = {}) => ({ id, z, type: 'Schacht', ...extra });
    const h = (id, von, nach) => ({ id, fromNodeId: von, toNodeId: nach });

    it('Ersatz: Endknoten vor tiefstem Knoten; ohne Knoten mit einer Haltung keiner', () => {
        const knoten = [n('A', 10), n('B', 0), n('C', 5), n('D', 20)];
        // A→B, D→B, B→C: B ist am tiefsten, hat aber 3 Haltungen; C ist der Endknoten
        const kanten = [h('1', 'A', 'B'), h('2', 'D', 'B'), h('3', 'B', 'C')];
        expect(waehleErsatzAuslass(knoten, kanten).id).toBe('C');
        const ring = [h('1', 'A', 'B'), h('2', 'B', 'A')];
        expect(waehleErsatzAuslass([n('A', 1), n('B', 2)], ring)).toBeNull();
    });

    it('ERR_141 / ERR_145', () => {
        const aus = n('X', 0, { type: 'Auslaufbauwerk' });
        const f = checkAuslaesse([n('A', 1), n('B', 1), aus], [h('1', 'A', 'X'), h('2', 'B', 'X')]);
        expect(f.map(x => [x.code, x.id])).toEqual([['ERR_141', 'X']]);
        expect(f[0].message).toContain('(1, 2)');
        expect(checkAuslaesse([n('A', 1), n('B', 2)], [h('1', 'A', 'B'), h('2', 'B', 'A')]).map(x => x.code)).toEqual(['ERR_145']);
        expect(checkAuslaesse([n('A', 1), aus], [h('1', 'A', 'X')])).toEqual([]);
    });
});
