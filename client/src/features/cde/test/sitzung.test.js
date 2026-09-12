// @vitest-environment jsdom
/**
 * DIE SITZUNG (Teil XI, U2) — der Kernvertrag des Commit-Modells.
 *
 * Schritte stapeln sich im ENTWURF (sofort wirksam, einzeln entfernbar,
 * ohne Gegeneintrag — git verwirft eine Arbeitskopie auch), der Commit
 * macht sie HISTORIE (Nachricht · wer · wann), und die Faltung ändert sich
 * durch das Committen um exakt NICHTS. Der Entwurf überlebt den Neustart;
 * ein v1-Journal wird verworfen und gemeldet, nie still.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen, standAus } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

async function arbeite(ae) {
    await ae.eintragen({ art: 'kg', globalId: 'W1', nachher: '330', wer: 'Fabio' });
    await ae.eintragen({ art: 'geloescht', globalId: 'H2', nachher: true, wer: 'Fabio',
        vorgang: 'vg-t', vorgangTitel: 'Haltung geteilt' });
    await ae.eintragen({ art: 'erzeugt', globalId: 'cde-a', modell: 'cde', wer: 'Fabio',
        vorgang: 'vg-t', vorgangTitel: 'Haltung geteilt',
        nachher: { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: '', bauform: 'achse+profil',
                   parameter: { punkte: [[0, 0, 0], [1, 0, 0]], dn: 300 } } });
}

describe('Der Entwurf', () => {
    it('Schritte stapeln sich in der Sitzung — als Vorgänge, sofort wirksam', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        expect(ae.sitzungOffen).toBe(true);
        expect(ae.sitzungSchritte).toHaveLength(3);
        expect(ae.sitzungVorgaenge).toHaveLength(2);
        expect(ae.sitzungVorgaenge[1].titel).toBe('Haltung geteilt');
        expect(standAus(ae.eintraege, 'kg').get('W1')).toBe('330');
    });

    it('der Nachricht-Vorschlag fasst die Vorgänge zusammen', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        expect(ae.nachrichtVorschlag()).toBe('Kostengruppe · Haltung geteilt');
    });

    it('einen Vorgang entfernen: Schritte WEG, Rückfahrkarten synthetisch und rückwärts', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        const gegen = await ae.entferneSitzungsVorgang('vg-t');
        expect(gegen.map(g => g.globalId)).toEqual(['cde-a', 'H2']);  // zuletzt zuerst
        expect(gegen.every(g => g.synthetisch)).toBe(true);
        expect(ae.sitzungSchritte).toHaveLength(1);
        expect(standAus(ae.eintraege, 'geloescht').size).toBe(0);
        // KEIN Gegeneintrag in der Liste — der Entwurf wurde geleert.
        expect(ae.eintraege.some(e => e.ruecknahmeVon)).toBe(false);
    });

    it('„zurück" während der Sitzung ist genau dieses Unstaging', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        const gegen = await ae.zurueck('Fabio');
        expect(gegen.every(g => g.synthetisch)).toBe(true);
        expect(ae.sitzungSchritte).toHaveLength(1);        // die KG blieb
        expect(ae.anzahl).toBe(1);
    });

    it('die ganze Sitzung verwerfen räumt alles und liefert alle Rückfahrkarten', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        const gegen = await ae.verwerfeSitzung();
        expect(gegen).toHaveLength(3);
        expect(ae.sitzungOffen).toBe(false);
        expect(ae.anzahl).toBe(0);
        expect(standAus(ae.eintraege, 'kg').size).toBe(0);
    });
});

describe('Der Commit', () => {
    it('macht den Entwurf zur Historie — die Faltung ändert sich um NICHTS', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        const vorher = standAus(ae.eintraege, 'kg').get('W1');
        const c = await ae.commitSitzung('Kanal Süd nachgezogen', { wer: 'Fabio', modellSha: 'sha1' });
        expect(c.nachricht).toBe('Kanal Süd nachgezogen');
        expect(c.wer).toBe('Fabio');
        expect(c.schrittIds).toHaveLength(3);
        expect(ae.sitzungOffen).toBe(false);
        expect(ae.commits).toHaveLength(1);
        expect(standAus(ae.eintraege, 'kg').get('W1')).toBe(vorher);
    });

    it('ohne Nachricht gilt der Vorschlag — nie ein leerer Titel', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        const c = await ae.commitSitzung('   ');
        expect(c.nachricht).toBe('Kostengruppe · Haltung geteilt');
    });

    it('eine LEERE Sitzung wird kein Commit', async () => {
        const ae = useAenderungen();
        ae.beginneSitzung({ wer: 'Fabio' });
        expect(await ae.commitSitzung('nichts')).toBeNull();
        expect(ae.commits).toHaveLength(0);
        expect(ae.sitzungOffen).toBe(false);
    });

    it('„zurück" NACH dem Commit ist ein Revert-COMMIT mit Gegeneinträgen', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        await ae.commitSitzung('Arbeit', { wer: 'Fabio' });
        const gegen = await ae.zurueck('Fabio');
        expect(gegen.every(g => g.ruecknahmeVon)).toBe(true);
        expect(ae.commits).toHaveLength(2);
        expect(ae.commits[1].nachricht).toMatch(/^Rückgängig:/);
    });

    it('Konflikt-Entscheidungen werden ihr EIGENER Commit — auch bei offener Sitzung', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        await ae.commitSitzung('Arbeit', { wer: 'Fabio' });
        // Neue Sitzung läuft …
        await ae.eintragen({ art: 'kg', globalId: 'W9', nachher: '410', wer: 'Fabio' });
        const kgEintrag = ae.eintraege.find(e => e.globalId === 'W1');
        await ae.verwerfeEinen(kgEintrag.id, 'Fabio');
        const konfliktCommit = ae.commits.find(c => /Konflikt verworfen/.test(c.nachricht));
        expect(konfliktCommit).toBeTruthy();
        // … und die offene Sitzung des Nutzers blieb unangetastet.
        expect(ae.sitzungSchritte.map(e => e.globalId)).toEqual(['W9']);
    });
});

describe('Persistenz v2', () => {
    it('der Entwurf überlebt den Neustart — Commits sowieso', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        await arbeite(ae);
        await ae.commitSitzung('Erste Arbeit', { wer: 'Fabio' });
        await ae.eintragen({ art: 'kg', globalId: 'W2', nachher: '340', wer: 'Fabio' });

        setActivePinia(createPinia());                    // „F5"
        const ae2 = useAenderungen();
        await ae2.bereit;
        expect(ae2.commits).toHaveLength(1);
        expect(ae2.commits[0].nachricht).toBe('Erste Arbeit');
        expect(ae2.sitzungOffen).toBe(true);
        expect(ae2.sitzungSchritte.map(e => e.globalId)).toEqual(['W2']);
        expect(standAus(ae2.eintraege, 'kg').get('W1')).toBe('330');
    });

    it('ein v1-Journal (rohes Array) wird VERWORFEN und gemeldet — nie still', async () => {
        localStorage.setItem('ifc-repo:global:aenderungen',
            JSON.stringify([{ id: 'ae-alt', art: 'kg', globalId: 'X', nachher: '300' }]));
        const meldung = vi.spyOn(console, 'info').mockImplementation(() => {});
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.anzahl).toBe(0);
        expect(meldung.mock.calls.flat().join(' ')).toMatch(/v1-Journal verworfen/);
        meldung.mockRestore();
    });
});

describe('Die Commit-Zeitleiste (U3)', () => {
    it('offene Sitzung obenauf, Commits darunter — neueste zuerst', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        await ae.commitSitzung('Erste Arbeit', { wer: 'Fabio' });
        await ae.eintragen({ art: 'kg', globalId: 'W2', nachher: '340', wer: 'Anna' });
        const z = ae.commitZeitleiste;
        expect(z[0].typ).toBe('sitzung');
        expect(z[0].bauteile).toEqual(['W2']);
        expect(z[1].typ).toBe('commit');
        expect(z[1].titel).toBe('Erste Arbeit');
        expect(z[1].vorgaenge).toHaveLength(2);
    });

    it('ein Commit-Revert ist EIN Revert-Commit — und markiert den alten', async () => {
        const ae = useAenderungen();
        await arbeite(ae);
        await ae.commitSitzung('Arbeit', { wer: 'Fabio' });
        const gegen = await ae.revertiereCommit(ae.commits[0].id, 'Fabio');
        expect(gegen).toHaveLength(3);
        expect(ae.commits).toHaveLength(2);
        const z = ae.commitZeitleiste;
        expect(z[0].typ).toBe('revert');
        expect(z[0].titel).toBe('Rückgängig: Arbeit');
        expect(z[1].zurueckgenommen).toBe(true);
        expect(standAus(ae.eintraege, 'kg').size).toBe(0);
    });

    it('zurueckBisCommit hangelt sich vom neuesten abwärts — je Commit EIN Revert', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '100', wer: 'F' });
        await ae.commitSitzung('Eins');
        await ae.eintragen({ art: 'kg', globalId: 'B', nachher: '200', wer: 'F' });
        await ae.commitSitzung('Zwei');
        await ae.eintragen({ art: 'kg', globalId: 'C', nachher: '300', wer: 'F' });
        await ae.commitSitzung('Drei');

        const erster = ae.commits.find(c => c.nachricht === 'Zwei');
        await ae.zurueckBisCommit(erster.id, 'F');
        expect(standAus(ae.eintraege, 'kg').get('A')).toBe('100');   // Eins bleibt
        expect(standAus(ae.eintraege, 'kg').has('B')).toBe(false);
        expect(standAus(ae.eintraege, 'kg').has('C')).toBe(false);
        // Drei + Zwei je ein Revert = 5 Commits gesamt.
        expect(ae.commits).toHaveLength(5);
    });

    it('ein bereits zurückgenommener Commit revertiert nicht doppelt', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'A', nachher: '100', wer: 'F' });
        await ae.commitSitzung('Eins');
        await ae.revertiereCommit(ae.commits[0].id, 'F');
        expect(await ae.revertiereCommit(ae.commits[0].id, 'F')).toEqual([]);
        expect(ae.commits).toHaveLength(2);
    });
});

