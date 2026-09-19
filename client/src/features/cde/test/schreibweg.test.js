// @vitest-environment jsdom
/**
 * Kassensturz S5 — der Verlauf (Fahrplan vom 2026-09-12, gebaut 2026-09-19).
 *
 *   K4 EIN Schreibweg: Basis heben, Verwerfen, Übertragen, Zuordnen (Rebase)
 *      und Revert gehen in die OFFENE Bearbeitung — ohne offene werden sie
 *      sofort eine Version. Bis hierher wurde jede davon ihre eigene Version,
 *      auch mitten in einer Bearbeitung.
 *   K2 „+ Satz" als Kopie: der Verlauf eines Satzes wird der Anfang eines
 *      neuen, mit Geschichte; ein Satzwechsel kopiert weiter nichts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const kg = (gid, wert, extra = {}) => ({ art: 'kg', globalId: gid, nachher: wert, wer: 'fabio', ...extra });
const lage = (gid, x) => ({ art: 'lage', globalId: gid, nachher: { x, y: 0, z: 0 }, basis: { x: 0, y: 0, z: 0 }, modell: 'geliefert', wer: 'fabio' });

/** Eine Version mit drei Einträgen, danach: offen (eine laufende Bearbeitung) oder nicht. */
async function verlauf({ offen }) {
    const ae = useAenderungen();
    await ae.bereit;
    const a = await ae.eintragen(kg('A', '310'));
    const b = await ae.eintragen(kg('B', '320'));
    const l = await ae.eintragen(lage('L', 5));
    const c = await ae.commitSitzung('Erste Arbeit', { wer: 'fabio' });
    if (offen) await ae.eintragen(kg('W', '410'));
    return { ae, a, b, l, c };
}

const ENTSCHEIDUNGEN = {
    'Basis heben': ({ ae, l }) => ae.hebeBasisAn(l.id, { x: 1, y: 0, z: 0 }, 'fabio'),
    Verwerfen: ({ ae, a }) => ae.verwerfeEinen(a.id, 'fabio'),
    Übertragen: ({ ae, b }) => ae.uebertrageAuf(b.id, 'B2', { wer: 'fabio' }),
    Zuordnen: ({ ae }) => ae.rebaseAuf({ abbildung: new Map([['A', 'A2']]), wer: 'fabio', von: { revision: 1 }, nach: { revision: 2 } }),
    Revert: ({ ae, c }) => ae.revertiereCommit(c.id, 'fabio'),
};

describe('K4 — ein Schreibweg in den Verlauf', () => {
    for (const [name, tu] of Object.entries(ENTSCHEIDUNGEN)) {
        it(`${name} bei offener Bearbeitung: keine neue Version, die Schritte stehen in der Bearbeitung`, async () => {
            const v = await verlauf({ offen: true });
            const versionen = v.ae.commits.length;
            const schritte = v.ae.sitzungSchritte.length;
            await tu(v);
            expect(v.ae.commits.length).toBe(versionen);                          // vorher: +1
            expect(v.ae.sitzungSchritte.length).toBeGreaterThan(schritte);
            // … und mit der Bearbeitung versioniert, unter der Beschreibung des Nutzers.
            const commit = await v.ae.commitSitzung('Meine Arbeit', { wer: 'fabio' });
            expect(commit.nachricht).toBe('Meine Arbeit');
            expect(commit.schrittIds.length).toBe(v.ae.eintraege.filter(e => commit.schrittIds.includes(e.id)).length);
        });

        it(`${name} ohne offene Bearbeitung: sofort eine Version`, async () => {
            const v = await verlauf({ offen: false });
            const versionen = v.ae.commits.length;
            await tu(v);
            expect(v.ae.commits.length).toBe(versionen + 1);
            expect(v.ae.sitzungSchritte).toEqual([]);
        });
    }
});

describe('K2 — ein Satz als Kopie', () => {
    it('„Kopie von S1": der neue Satz beginnt mit dem Verlauf von S1 — mit seiner Geschichte', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        await ae.setzeSatz('s1');
        await ae.eintragen(kg('A', '310'));
        await ae.commitSitzung('Variante Nord', { wer: 'fabio' });
        await ae.eintragen(kg('B', '320'));                                  // ein offener Entwurf kommt mit

        expect(await ae.kopiereSatz('s1', 's2')).toBe(2);
        await ae.setzeSatz('s2');
        expect(ae.wirksamerStand('kg').get('A')).toBe('310');
        expect(ae.wirksamerStand('kg').get('B')).toBe('320');
        expect(ae.commits.map(c => c.nachricht)).toEqual(['Variante Nord']);
        // Ab jetzt eigene Wege: ein Schritt in s2 ändert s1 nicht.
        await ae.eintragen(kg('A', '330'));
        await ae.setzeSatz('s1');
        expect(ae.wirksamerStand('kg').get('A')).toBe('310');
    });

    it('nie über einen vorhandenen Verlauf, nie aus dem Leeren, nie auf sich selbst', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        await ae.setzeSatz('s1');
        await ae.eintragen(kg('A', '310'));
        await ae.setzeSatz('s2');
        await ae.eintragen(kg('Z', '999'));
        expect(await ae.kopiereSatz('s1', 's2')).toBe(0);
        expect(await ae.kopiereSatz('leer', 's3')).toBe(0);
        expect(await ae.kopiereSatz('s1', 's1')).toBe(0);
        await ae.setzeSatz('s2');
        expect(ae.wirksamerStand('kg').get('A')).toBeUndefined();
    });

    it('ein Satzwechsel allein kopiert nichts (wie bisher)', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        await ae.setzeSatz('s1');
        await ae.eintragen(kg('A', '310'));
        await ae.setzeSatz('s3');
        expect(ae.wirksamerStand('kg').has('A')).toBe(false);
    });
});
