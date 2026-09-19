// @vitest-environment jsdom
/**
 * Die Zeitleiste und ihre Verben (Stufe 9, git-artig).
 *
 * `vorgaenge` ist die Versionsliste (wann · wer · was, neueste zuerst),
 * `zurueckBis` das append-only-Reset (Gegen-Vorgänge bis einschliesslich
 * des Ziels — nie mitten hinein), und die drei Konflikt-Verben sind
 * Übernehmen (Basis heben, PROTOKOLLIERT — die einzige nachträgliche
 * Änderung im Modul), Verwerfen (Gegeneintrag) und Übertragen (wandern +
 * verwerfen, EIN Vorgang).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { repo } from '../services/RepoFacade.js';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

async function fuelle(ae) {
    await ae.eintragen({ art: 'kg', globalId: 'W1', nachher: '330', wer: 'Anna' });
    await ae.eintragen({ art: 'lage', globalId: 'H1', nachher: { x: 1, y: 2, z: 3 },
        basis: { x: 0, y: 2, z: 3 }, modell: 'geliefert', wer: 'Fabio' });
    // Ein mehrteiliger Vorgang:
    await ae.eintragen({ art: 'geloescht', globalId: 'H2', nachher: true, wer: 'Fabio',
        vorgang: 'vg-t', vorgangTitel: 'Haltung geteilt' });
    await ae.eintragen({ art: 'erzeugt', globalId: 'cde-a', modell: 'cde', wer: 'Fabio',
        vorgang: 'vg-t', vorgangTitel: 'Haltung geteilt',
        nachher: { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: '', bauform: 'achse+profil',
                   parameter: { punkte: [[0, 0, 0], [1, 0, 0]], dn: 300 } } });
    // U2: die Schritte werden Historie — erst COMMITTETE Arbeit lässt sich
    // mit Gegeneinträgen zurücknehmen (Sitzungs-Unstage prüft sitzung.test.js).
    await ae.commitSitzung('Testarbeit', { wer: 'Fabio' });
}

describe('vorgaenge — die Versionsliste', () => {
    it('gruppiert je Vorgang, neueste zuerst, mit wer/wann/Bauteilen/Arten', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        const v = ae.vorgaenge;
        expect(v).toHaveLength(3);
        expect(v[0].titel).toBe('Haltung geteilt');
        expect(v[0].zeilen).toHaveLength(2);
        expect(v[0].bauteile).toEqual(['H2', 'cde-a']);
        expect(v[0].arten.sort()).toEqual(['erzeugt', 'geloescht']);
        expect(v[0].wer).toBe('Fabio');
        expect(v[2].titel).toBe('Kostengruppe');
        expect(v[2].wer).toBe('Anna');
    });

    it('eine Rücknahme ist ein EIGENER Vorgang, der alte gilt als zurückgenommen', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        await ae.zurueck('Fabio');
        const v = ae.vorgaenge;
        expect(v[0].ruecknahme).toBe(true);
        const geteilt = v.find(x => x.titel === 'Haltung geteilt');
        expect(geteilt.zurueckgenommen).toBe(true);
        // Die anderen bleiben offen.
        expect(v.find(x => x.titel === 'Kostengruppe').zurueckgenommen).toBe(false);
    });
});

describe('zurueckBis — das append-only-Reset', () => {
    it('nimmt vom neuesten bis EINSCHLIESSLICH des Ziels zurück', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        const lageVorgang = ae.vorgaenge.find(v => v.arten.includes('lage'));
        const gegen = await ae.zurueckBis(lageVorgang.schluessel, 'Fabio');
        // Der Teil-Vorgang (2 Einträge) UND die Lage fallen; die KG bleibt.
        expect(gegen.length).toBe(3);
        expect(standAus(ae.eintraege, 'lage').size).toBe(0);
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(0);
        expect(standAus(ae.eintraege, 'kg').get('W1')).toBe('330');
    });

    it('ein schon zurückgenommenes Ziel: nichts zu tun', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        await ae.zurueck('Fabio');                       // nimmt vg-t
        const geteilt = ae.vorgaenge.find(v => v.titel === 'Haltung geteilt');
        expect(await ae.zurueckBis(geteilt.schluessel, 'Fabio')).toEqual([]);
    });
});

describe('Die drei Konflikt-Verben', () => {
    it('Übernehmen hebt die Basis und PROTOKOLLIERT es', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        const lage = ae.eintraege.find(e => e.art === 'lage');
        const protokoll = await ae.hebeBasisAn(lage.id, { x: 9, y: 9, z: 9 }, 'Fabio');
        expect(lage.basis).toEqual({ x: 9, y: 9, z: 9 });
        expect(protokoll.basisGehoben).toBe(lage.id);
        expect(protokoll.vorgangTitel).toMatch(/Meiner gilt — gegen den neuen Wert des Planers/);
        // Die Faltung bleibt unberührt: der Stand ist derselbe Wert.
        expect(standAus(ae.eintraege, 'lage').get('H1')).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('Verwerfen setzt einen Gegeneintrag — auch mitten in der Historie', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        const lage = ae.eintraege.find(e => e.art === 'lage');
        const gegen = await ae.verwerfeEinen(lage.id, 'Fabio');
        expect(gegen.ruecknahmeVon).toBe(lage.id);
        expect(standAus(ae.eintraege, 'lage').size).toBe(0);
        // Die späteren Einträge (der Teil-Vorgang) bleiben unberührt.
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(1);
    });

    it('Übertragen: neuer Eintrag am Ziel + Gegeneintrag am Alt — EIN Vorgang', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        const lage = ae.eintraege.find(e => e.art === 'lage');
        const beide = await ae.uebertrageAuf(lage.id, 'H1-NEU',
            { wer: 'Fabio', basis: { x: 1, y: 2, z: 3 } });
        expect(beide).toHaveLength(2);
        expect(new Set(beide.map(e => e.vorgang)).size).toBe(1);
        const stand = standAus(ae.eintraege, 'lage');
        expect(stand.has('H1')).toBe(false);
        expect(stand.get('H1-NEU')).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('Übertragen ist EIN Commit, EIN Sichern — und kein Eintrag wird nachträglich umgeschrieben (2026-09-19)', async () => {
        // Bis hierher lief der Gegeneintrag über `verwerfeEinen`: committet und
        // gesichert, danach umgeschrieben (Vorgang, Beleg) und NOCH EINMAL
        // committet — dieselbe Kennung in zwei Commits, drei Mal gesichert.
        const ae = useAenderungen();
        await fuelle(ae);
        const lage = ae.eintraege.find(e => e.art === 'lage');
        const commitsVorher = ae.commits.length;
        const set = vi.spyOn(repo, 'set');
        const beide = await ae.uebertrageAuf(lage.id, 'H1-NEU', { wer: 'Fabio', basis: { x: 1, y: 2, z: 3 } });
        expect(ae.commits.length - commitsVorher).toBe(1);                       // vorher: 2
        expect(ae.commits.at(-1).schrittIds).toEqual(beide.map(e => e.id));
        expect(ae.commits.at(-1).nachricht).toBe('Konflikt übertragen auf H1-NEU');
        const ids = ae.commits.flatMap(c => c.schrittIds);
        expect(ids.length).toBe(new Set(ids).size);                              // keine Kennung in zwei Commits
        expect(set.mock.calls.filter(([k]) => /aenderungen$/.test(k)).length).toBe(1);   // vorher: 3
        expect(beide[0].kommando?.werkzeug).toBe('system:uebertragen');          // der Beleg am ersten Eintrag
        expect(beide[1].kommando).toBeUndefined();
        expect(beide[1].ruecknahmeVon).toBe(lage.id);
        expect(ae.sitzungSchritte.map(e => e.id)).not.toContain(beide[0].id);   // nicht in der offenen Sitzung
        set.mockRestore();
    });

    it('Übertragen auf sich selbst oder ins Leere: nichts', async () => {
        const ae = useAenderungen();
        await fuelle(ae);
        const lage = ae.eintraege.find(e => e.art === 'lage');
        expect(await ae.uebertrageAuf(lage.id, 'H1', { wer: 'x' })).toEqual([]);
        expect(await ae.uebertrageAuf('gibtsnicht', 'Z', { wer: 'x' })).toEqual([]);
    });
});
