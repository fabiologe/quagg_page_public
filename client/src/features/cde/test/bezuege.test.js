/**
 * Bezüge zwischen Bauplänen (Teil XIV, G4) — rein: die eine Prüfzeile beim
 * Eintragen (Zyklus, Selbstbezug, Ebene) und der abgeleitete Rückwärtsindex.
 * Dazu ein Textwächter: `ausfuehren` prüft VOR `eintragen`.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pruefeBezuege, abhaengige, haengtAn, quellenVon } from '../services/ableitung/Bezuege.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

const stand = new Map([
    ['cde-dgm1',  { rezept: 'erdbau', rolle: 'dgm', parameter: { quellen: { gelaende: 'DGM0' } } }],
    ['cde-cut1',  { rezept: 'erdbau', rolle: 'aushub', parameter: { quellen: { gelaende: 'DGM0' } } }],
    ['cde-dgm2',  { rezept: 'erdbau', rolle: 'dgm', parameter: { quellen: { gelaende: 'cde-dgm1' } } }],
    ['cde-alt',   { rezept: 'gelaende', parameter: { quelle: 'DGM0' } }],   // Altform
]);

describe('quellenVon / haengtAn', () => {
    it('liest neue und alte Form; haengtAn läuft transitiv', () => {
        expect(quellenVon({ quellen: { gelaende: 'A' } })).toEqual({ gelaende: 'A' });
        expect(quellenVon({ quelle: 'A' })).toEqual({ gelaende: 'A' });
        expect(quellenVon({})).toEqual({});
        expect(haengtAn(stand, 'cde-dgm2', 'DGM0')).toBe(true);     // über cde-dgm1
        expect(haengtAn(stand, 'cde-dgm1', 'cde-dgm2')).toBe(false);
    });
});

describe('pruefeBezuege', () => {
    it('geliefertes Ziel ist in Ordnung — die Existenz prüft das Nachspielen', () => {
        expect(pruefeBezuege({ quellen: { gelaende: 'DGM0' }, globalId: 'cde-neu', stand })).toEqual([]);
    });

    it('Selbstbezug und Zyklus werden mit Namen abgewiesen', () => {
        expect(pruefeBezuege({ quellen: { gelaende: 'cde-neu' }, globalId: 'cde-neu', stand })[0]).toMatch(/selbst/);
        // cde-dgm1 soll auf cde-dgm2 zeigen — das hängt aber schon an cde-dgm1
        expect(pruefeBezuege({ quellen: { gelaende: 'cde-dgm2' }, globalId: 'cde-dgm1', stand })[0]).toMatch(/Zyklus/);
    });

    it('die Auftragsebene darf nicht auf ein Variantenbauteil zeigen', () => {
        const ebeneVon = (gid) => (gid === 'cde-dgm1' ? 'stand' : null);
        expect(pruefeBezuege({ quellen: { gelaende: 'cde-dgm1' }, globalId: 'cde-neu', stand, ebeneVon, zielEbene: 'auftrag' })[0])
            .toMatch(/Modellsatz/);
        expect(pruefeBezuege({ quellen: { gelaende: 'cde-dgm1' }, globalId: 'cde-neu', stand, ebeneVon, zielEbene: 'stand' }))
            .toEqual([]);
    });

    it('eine fehlende Quelle im Schlitz ist ein Fehler, kein leerer Verweis', () => {
        expect(pruefeBezuege({ quellen: { gelaende: '' }, globalId: 'x', stand })[0]).toMatch(/fehlt/);
    });
});

describe('abhaengige', () => {
    it('kehrt die Quellen um — je Quelle die Menge, die daran hängt', () => {
        const k = abhaengige(stand);
        expect([...k.get('DGM0')].sort()).toEqual(['cde-alt', 'cde-cut1', 'cde-dgm1']);
        expect([...k.get('cde-dgm1')]).toEqual(['cde-dgm2']);
        expect(k.has('cde-dgm2')).toBe(false);
    });
});

describe('die Prüfung steht VOR dem Eintragen', () => {
    // Seit Teil XXIV (K1) ist `fuehreAus` die EINE Stelle, an der ein Kommando
    // geschrieben wird — für die Oberfläche (`ausfuehren` ruft sie) und ohne.
    it('useBearbeitung.fuehreAus ruft pruefeBezuege, bevor es eintragen ruft — und ausfuehren geht über fuehreAus', () => {
        const q = fs.readFileSync(`${WURZEL}stores/useBearbeitung.js`, 'utf8');
        const start = q.indexOf('async function fuehreAus');
        const pruefung = q.indexOf('pruefeBezuege(', start);
        const eintragen = q.indexOf('aenderungen.eintragenVorgang(', start);
        expect(pruefung).toBeGreaterThan(start);
        expect(pruefung).toBeLessThan(eintragen);
        const aus = q.indexOf('async function ausfuehren');
        const ende = q.indexOf('\n    }\n', aus);
        expect(q.slice(aus, ende)).toContain('await fuehreAus(kommando');
        expect(q.slice(aus, ende)).not.toContain('aenderungen.eintragen');
    });
});
