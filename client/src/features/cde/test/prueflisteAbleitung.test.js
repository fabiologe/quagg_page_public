/**
 * Die Gegenprobe erreicht die Prüfliste (Teil XIV, G3): Befunde einer
 * Ableitung stehen im Ergebnis von `pruefeAlles` — am echten Methodenkörper,
 * mit einer Engine-Attrappe ohne Achsen (ein reines Geländemodell).
 */
import { describe, expect, it } from 'vitest';
import { IfcEngine } from '../services/IfcEngine.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';

describe('IfcEngine.pruefeAlles mit Ableitungs-Befunden', () => {
    it('hängt die Befunde der Ableitung am DGM-Teil an — ohne Achsen im Modell', () => {
        const dieses = Object.assign(Object.create(IfcEngine.prototype), {
            _achsen: new Map(),
            autor: { ableitungen: new Map([
                ['ab-1', { rezept: 'erdbau', teile: { aushub: 'cde-a', dgm: 'cde-d' },
                           befunde: [{ regel: 'aushub_gegenprobe', schwere: 'warnung', text: '7 % Abweichung' }] }],
                ['ab-2', { rezept: 'erdbau', teile: { dgm: 'cde-x' }, befunde: [] }],
            ]) },
        });
        const out = IfcEngine.prototype.pruefeAlles.call(dieses, {});
        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            modelId: CDE_MODELL_ID, localId: 'cde:cde-d', globalId: 'cde-d',
            befunde: [{ regel: 'aushub_gegenprobe' }],
        });
    });
});
