/**
 * Farben zurücksetzen nimmt auch Einzelfarben zurück (Abnahme 2026-09-12, P4).
 *
 * Der Herkunft-Schalter färbt per `setColor` — Geändertes warn, Eigenes
 * accent. Beim Ausschalten rief der Viewer `resetCategoryColors`, und das trug
 * nur die Kategoriefarben neu auf: ein Gelände hat keine, also blieb es
 * orange. Geprüft am echten `IfcEngine.resetCategoryColors`; die Bibliothek
 * als Attrappe in ihrer veröffentlichten Form
 * (`FragmentsModel.resetColor(localIds | undefined)`, `fragmentsVertrag.test.js`).
 */
import { describe, expect, it, vi } from 'vitest';
import { IfcEngine } from '../services/IfcEngine.js';

function engineMit(modelle) {
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        components: { get: () => ({ list: new Map(modelle.map(m => [m.modelId, m])) }) },
        _categoryGroups: [],
        _applyDefaultCategoryColors: vi.fn(async () => {}),
    });
    return e;
}

describe('resetCategoryColors', () => {
    it('setzt JEDES Modell erst ganz zurück und trägt dann die Kategoriefarben auf', async () => {
        const m = { modelId: 'gelaende', resetColor: vi.fn(async () => {}) };
        const e = engineMit([m]);
        await e.resetCategoryColors();
        expect(m.resetColor).toHaveBeenCalledWith(undefined);                    // vorher: nie
        expect(m.resetColor.mock.invocationCallOrder[0])
            .toBeLessThan(e._applyDefaultCategoryColors.mock.invocationCallOrder[0]);
    });

    it('ein Modell ohne resetColor hält den Rest nicht auf', async () => {
        const e = engineMit([{ modelId: 'alt' }, { modelId: 'neu', resetColor: vi.fn(async () => {}) }]);
        await e.resetCategoryColors();
        expect(e._applyDefaultCategoryColors).toHaveBeenCalledTimes(2);
    });
});
