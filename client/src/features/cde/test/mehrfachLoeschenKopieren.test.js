// @vitest-environment jsdom
/**
 * Teil XXX, B3 — Entf löscht die ganze Auswahl, Strg+V kopiert die ganze Zwischenablage: als EIN Kommando, über den
 * echten Weg (`einordne` mit weiteren, `ausfuehren`). Vorher war „Löschen" nicht `mehrfach` (ein Kommentar im Viewer
 * behauptete es), „Kopieren" auch nicht.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

async function zweiWaende() {
    const b = useBearbeitung(), ae = useAenderungen();
    useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
    b.modusSetzen(true);
    const k = (gid, z) => ({ schema: 1, id: `k-${gid}`, werkzeug: 'wand-zeichnen', ziel: [], neu: [gid], wer: 't', wann: '2026-10-05T00:00:00Z',
        eingaben: { zug: [{ ost: 0, nord: z, hoehe: 100 }, { ost: 10, nord: z, hoehe: 100 }] },
        werte: { name: gid, kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2 } });
    for (const [gid, z] of [['cde-W1', 0], ['cde-W2', 5]]) expect((await b.fuehreAus(k(gid, z))).ausgefuehrt).toBe(true);
    const subjekt = (gid) => ({ modelId: 'cde-eigenbau', localId: gid === 'cde-W1' ? 1 : 2, globalId: gid, category: 'IFCWALL', name: gid,
                                hoehenversatz: 0, eigen: true });
    await b.einordne(subjekt('cde-W1'), null, { weitere: [subjekt('cde-W2')] });
    return { b, ae };
}

describe('Teil XXX, B3 — mehrere auf einmal', () => {
    it('Löschen wirkt auf ALLE gewählten — ein Vorgang, zwei Einträge', async () => {
        const { b, ae } = await zweiWaende();
        expect(b.bauteile).toHaveLength(2);
        b.starte('loeschen');
        const vorher = ae.eintraege.length;
        const e = await b.ausfuehren({ wer: 't' });
        expect(e).toBeTruthy();
        const neu = ae.eintraege.slice(vorher);
        expect(neu.map(x => [x.art, x.globalId])).toEqual([['geloescht', 'cde-W1'], ['geloescht', 'cde-W2']]);
        expect(new Set(neu.map(x => x.vorgang)).size).toBe(1);
    });

    it('Kopieren wirkt auf ALLE gewählten — jede Kopie um denselben Versatz', async () => {
        const { b, ae } = await zweiWaende();
        b.starte('kopieren');
        b.setzeWert('ost', 20); b.setzeWert('nord', 0); b.setzeWert('hoehe', 0);
        const vorher = ae.eintraege.length;
        expect(await b.ausfuehren({ wer: 't' })).toBeTruthy();
        const kopien = ae.eintraege.slice(vorher).filter(x => x.art === 'erzeugt');
        expect(kopien).toHaveLength(2);
        const xs = kopien.map(x => x.nachher.parameter.punkte.map(p => (Array.isArray(p) ? p[0] : p.x)));
        // Die Originale beginnen bei x = 0 (Ost 0); die Kopien bei x = 20.
        expect(xs.map(p => Math.round(Math.min(...p) * 1000) / 1000)).toEqual([20, 20]);
    });
});
