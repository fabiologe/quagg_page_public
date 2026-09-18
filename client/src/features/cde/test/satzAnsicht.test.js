/**
 * Viewer = Satz (Fahrplan „Klare Abläufe", S3, D1) — der reine Teil.
 *
 * Leitsatz: was du siehst, ist der Satz, und was du ausgibst, ist, was du
 * siehst. Vorher lud ein Satzwechsel NICHTS; nachgespielt wurde erst beim
 * nächsten Modell, einmal je Modell.
 */
import { describe, expect, it } from 'vitest';
import { ausgelasseneErdbau, bestandAus, satzAbgleich, satzModelle, satzUmsetzen } from '../services/SatzAnsicht.js';

const DOKS = [
    { sha256: 'k1', name: 'Kanal_R01.ifc', basisname: 'Kanal', art: 'modell', revision: 1 },
    { sha256: 'k2', name: 'Kanal_R02.ifc', basisname: 'Kanal', art: 'modell', revision: 2 },
    { sha256: 'g', name: 'Gelaende.ifc', basisname: 'Gelaende', art: 'modell', revision: 1 },
    { sha256: 'v', name: 'Verbund_R01.ifc', basisname: 'Verbund', art: 'modell', herkunft: { art: 'verbund' } },
    { sha256: 'e', name: 'Erdbau_Nord_R01.ifc', basisname: 'Erdbau_Nord', art: 'modell', herkunft: { art: 'erdbau', satz_id: 's-nord' } },
    { sha256: 'p', name: 'Lageplan.pdf', basisname: 'Lageplan', art: 'plan' },
];

describe('welche Modelle ein Satz zeigt', () => {
    it('in Satz-Reihenfolge — ohne Verbund, ohne Plan, ohne das eigene Erdbau-Dokument (K3)', () => {
        const nord = { id: 's-nord', enthaelt: ['g', 'k2', 'v', 'e', 'p'] };
        expect(satzModelle(nord, DOKS).map(d => d.sha256)).toEqual(['g', 'k2']);
        expect(ausgelasseneErdbau(nord, DOKS)).toEqual(['Erdbau_Nord_R01.ifc']);
        // In einem ANDEREN Satz ist das Erdbau-Dokument ein normales Modell.
        const sued = { id: 's-sued', enthaelt: ['e', 'g'] };
        expect(satzModelle(sued, DOKS).map(d => d.sha256)).toEqual(['e', 'g']);
        expect(ausgelasseneErdbau(sued, DOKS)).toEqual([]);
        expect(satzModelle(null, DOKS)).toEqual([]);
    });

    it('K1 „Bestand“: jede Lieferung, je Linie die jüngste Revision — nichts Erzeugtes', () => {
        expect(bestandAus(DOKS).map(d => d.sha256)).toEqual(['k2', 'g']);
    });
});

describe('der Ladeplan beim Wechsel', () => {
    it('A → B, eins gemeinsam: das Gemeinsame bleibt, der Rest wird getauscht', () => {
        expect(satzAbgleich({ geladen: ['g', 'k1'], soll: ['g', 'k2', 'x'] }))
            .toEqual({ entladen: ['k1'], laden: ['k2', 'x'], allesNeu: false });
    });

    it('wechselt das ERSTE Modell, wird alles neu geladen — es setzt den Weltrahmen', () => {
        expect(satzAbgleich({ geladen: ['g', 'k1'], soll: ['k1', 'g'] }))
            .toEqual({ entladen: ['g', 'k1'], laden: ['k1', 'g'], allesNeu: true });
    });

    it('ein leerer Satz entlädt alles; aus dem Leeren wird nur geladen', () => {
        expect(satzAbgleich({ geladen: ['g'], soll: [] })).toEqual({ entladen: ['g'], laden: [], allesNeu: false });
        expect(satzAbgleich({ geladen: [], soll: ['g', 'k2'] })).toEqual({ entladen: [], laden: ['g', 'k2'], allesNeu: false });
    });

    it('ausgeführt wird erst entladen, dann geladen — eins nach dem anderen; Fehlschläge werden gezählt', async () => {
        const protokoll = [];
        const r = await satzUmsetzen({
            plan: { entladen: ['k1'], laden: ['k2', 'x'] },
            entlade: async (s) => { protokoll.push(`-${s}`); },
            lade: async (s) => { protokoll.push(`+${s}`); return s !== 'x'; },
        });
        expect(protokoll).toEqual(['-k1', '+k2', '+x']);
        expect(r).toEqual({ entladen: 1, geladen: 1, fehlend: ['x'], abgebrochen: false });
    });

    it('ein neuerer Wechsel bricht einen älteren ab', async () => {
        let gueltig = true;
        const geladen = [];
        const r = await satzUmsetzen({
            plan: { entladen: [], laden: ['a', 'b', 'c'] },
            entlade: async () => {},
            lade: async (s) => { geladen.push(s); if (s === 'a') gueltig = false; return true; },
            aktuell: () => gueltig,
        });
        expect(geladen).toEqual(['a']);
        expect(r.abgebrochen).toBe(true);
    });
});
