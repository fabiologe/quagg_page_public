// @vitest-environment jsdom
/**
 * Die Bauteilbibliothek (Lücke ⑨ / Stufe 9.8).
 *
 * Zwei Landminen aus dem Plan, hier festgenagelt:
 *  - REZEPT IST CODE, EINTRAG SIND DATEN: eine Vorlage nennt das Rezept beim
 *    Namen; alles mit Funktionen oder unbekanntem Rezept wird abgewiesen —
 *    sonst läge ausführbarer Code in der RepoFacade.
 *  - VEREINIGUNG je Id statt Ganz-Ersatz (die ladeSatz-Landmine): ein
 *    Bürosatz mit EINER Vorlage darf die eingebauten nicht löschen.
 */
import { describe, expect, it } from 'vitest';
import {
    EINGEBAUTE_VORLAGEN, ladeVorlagen, loescheVorlage, pruefeVorlage,
    speichereVorlage,
} from '../services/Bibliothek.js';

function fakeRepo({ projekt = null, buero = null } = {}) {
    const ablage = { projekt, buero };
    const mach = (ebene) => ({
        get: async () => ablage[ebene],
        set: async (_k, v) => { ablage[ebene] = v; return true; },
    });
    return { ...mach('projekt'), buero: buero !== undefined ? mach('buero') : null, _ablage: ablage };
}

describe('pruefeVorlage', () => {
    it('nur Daten mit bekanntem Rezept — Funktionen und Fremdes fallen', () => {
        expect(pruefeVorlage({ name: 'S', rezept: 'schacht', vorgaben: { dn: 1000 } }).ok).toBe(true);
        expect(pruefeVorlage({ name: 'S', rezept: 'gibtsnicht' }).ok).toBe(false);
        expect(pruefeVorlage({ name: '', rezept: 'rohr' }).ok).toBe(false);
        expect(pruefeVorlage({ name: 'S', rezept: 'rohr', vorgaben: { baue: () => {} } }).ok).toBe(false);
        expect(pruefeVorlage({ name: 'S', rezept: 'rohr', vorgaben: { p: { tief: 1 } } }).ok).toBe(false);
    });
});

describe('ladeVorlagen — Vereinigung je Id', () => {
    it('Büro ERGÄNZT die eingebauten, Projekt überstimmt beide', async () => {
        const repo = fakeRepo({
            buero: [{ id: 'rohr-dn300', name: 'Rohr DN 300 (Büro-Norm)', rezept: 'rohr', vorgaben: { dn: 315 } },
                    { id: 'buero-x', name: 'Bordstein', rezept: 'linie', vorgaben: {} }],
            projekt: [{ id: 'rohr-dn300', name: 'Rohr DN 300 (hier: PE)', rezept: 'rohr', vorgaben: { dn: 300 } }],
        });
        const alle = await ladeVorlagen(repo);
        const je = new Map(alle.map(v => [v.id, v]));
        // Eingebaute bleiben da — kein Ganz-Ersatz.
        expect(je.size).toBe(EINGEBAUTE_VORLAGEN.length + 1);
        expect(je.get('schacht-dn1000').herkunft).toBe('eingebaut');
        expect(je.get('buero-x').herkunft).toBe('buero');
        // Projekt schlägt Büro schlägt eingebaut — je EINTRAG.
        expect(je.get('rohr-dn300')).toMatchObject({ herkunft: 'projekt', name: 'Rohr DN 300 (hier: PE)' });
    });

    it('kaputte gespeicherte Einträge fallen still heraus statt die Liste zu reissen', async () => {
        const repo = fakeRepo({ projekt: [{ id: 'x', name: 'kaputt', rezept: 'gibtsnicht' }, 'unsinn'] });
        const alle = await ladeVorlagen(repo);
        expect(alle.map(v => v.id)).not.toContain('x');
        expect(alle.length).toBe(EINGEBAUTE_VORLAGEN.length);
    });
});

describe('speichern und löschen', () => {
    it('sichert je Ebene, ersetzt je Id, und meldet Gründe statt zu werfen', async () => {
        const repo = fakeRepo({ buero: [] });
        const r1 = await speichereVorlage(repo, { name: 'Schacht DN 800', rezept: 'schacht', vorgaben: { dn: 800 } });
        expect(r1.ok).toBe(true);
        expect(repo._ablage.projekt).toHaveLength(1);

        const r2 = await speichereVorlage(repo, { id: r1.id, name: 'Schacht DN 800 (neu)', rezept: 'schacht', vorgaben: { dn: 800 } });
        expect(r2.ok).toBe(true);
        expect(repo._ablage.projekt).toHaveLength(1);
        expect(repo._ablage.projekt[0].name).toBe('Schacht DN 800 (neu)');

        const r3 = await speichereVorlage(repo, { name: 'B', rezept: 'rohr', vorgaben: { dn: 250 } }, { ebene: 'buero' });
        expect(r3.ok).toBe(true);
        expect(repo._ablage.buero).toHaveLength(1);

        expect((await speichereVorlage(repo, { name: 'X', rezept: 'gibtsnicht' })).ok).toBe(false);

        expect(await loescheVorlage(repo, r1.id)).toBe(true);
        expect(repo._ablage.projekt).toHaveLength(0);
        expect(await loescheVorlage(repo, 'gibtsnicht')).toBe(false);
    });

    it('ohne Büro-Backend: ehrlicher Grund statt stillem Nichts', async () => {
        const repo = fakeRepo();
        repo.buero = null;
        const r = await speichereVorlage(repo, { name: 'B', rezept: 'rohr', vorgaben: {} }, { ebene: 'buero' });
        expect(r.ok).toBe(false);
        expect(r.grund).toContain('Büroablage');
    });
});
