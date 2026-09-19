// @vitest-environment jsdom
/**
 * Planinhalte und Rotstift im Journal (Teil XXIII, A7, Befund B16).
 *
 * Stufe 2 (A7a, ausgeliefert): geschrieben wird wie bisher unter den alten
 * Schlüsseln; GELESEN werden Journal UND Liste. Stufe 3 (A7b): geschrieben
 * wird ins Journal — mit Undo, Commit, Ebene —, und was nur in der Liste lag,
 * wird beim Laden EIN Commit „Übernahme …".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlanInhalt } from '../stores/usePlanInhalt.js';
import { useRotstift } from '../stores/useRotstift.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { setzeSchreibStufeFuerTests } from '../services/JournalFormat.js';
import { baueBericht } from '../services/Aenderungsbericht.js';

const warte = (ms = 350) => new Promise(r => setTimeout(r, ms));
const liste = (k) => JSON.parse(localStorage.getItem(`ifc-repo:global:${k}`) ?? 'null');

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
afterEach(() => setzeSchreibStufeFuerTests());

describe('Stufe 2 (A7a, bis 2026-09-19): wie bisher — und das Journal wird mitgelesen', () => {
    beforeEach(() => setzeSchreibStufeFuerTests(2));             // seit 2026-09-19 schreibt der Client 4
    it('schreibt unter „plan-inhalte", nicht ins Journal', async () => {
        const p = usePlanInhalt(); await p.bereit;
        p.addText({ x: 1, z: 2 }, 'Bestand');
        await warte();
        expect(liste('plan-inhalte')).toHaveLength(1);
        expect(useAenderungen().eintraege).toHaveLength(0);
    });
    it('ein Eintrag im Journal (von einem A7b-Tab) gewinnt je Kennung', async () => {
        localStorage.setItem('ifc-repo:global:plan-inhalte', JSON.stringify([
            { id: 'pi-a', art: 'text', x: 0, z: 0, text: 'alt', groesse: 2.5, winkel: 0 },
            { id: 'pi-b', art: 'text', x: 5, z: 5, text: 'nur Liste', groesse: 2.5, winkel: 0 },
        ]));
        const ae = useAenderungen(); await ae.bereit;
        await ae.eintragen({ art: 'planinhalt', globalId: 'pi-a', nachher: { art: 'text', x: 0, z: 0, text: 'neu', groesse: 2.5, winkel: 0 } });
        const p = usePlanInhalt(); await p.bereit;
        expect(p.inhalte.map(i => [i.id, i.text]).sort()).toEqual([['pi-a', 'neu'], ['pi-b', 'nur Liste']]);
    });
});

describe('Stufe 3 (A7b): im Journal', () => {
    beforeEach(() => setzeSchreibStufeFuerTests(3));

    it('Setzen, Verschieben, Entfernen sind Journalschritte — und Undo nimmt sie zurück', async () => {
        const p = usePlanInhalt(); await p.bereit;
        const ae = useAenderungen();
        const t = p.addText({ x: 1, z: 2 }, 'Schacht 12');
        await warte(10);
        p.verschiebe(t.id, { x: 4, z: 5 });
        await warte(10);
        expect(ae.eintraege.map(e => e.art)).toEqual(['planinhalt', 'planinhalt']);
        expect(p.inhalte[0]).toMatchObject({ id: t.id, x: 4, z: 5, text: 'Schacht 12' });
        await ae.zurueck('fabio');
        expect(p.inhalte[0]).toMatchObject({ x: 1, z: 2 });
        await ae.zurueck('fabio');
        expect(p.inhalte).toHaveLength(0);
        expect(liste('plan-inhalte')).toBeNull();                      // der alte Schlüssel bleibt unberührt
    });

    it('ein Radierzug, der einen Strich teilt, ist EIN Vorgang', async () => {
        const r = useRotstift(); await r.bereit;
        const ae = useAenderungen();
        r.addStrich([[0, 0], [10, 0]]);
        await warte(10);
        expect(r.radiere(5, 0, 1)).toBe(true);
        await warte(10);
        expect(r.striche).toHaveLength(2);
        const vorgaenge = new Set(ae.eintraege.slice(1).map(e => e.vorgang));
        expect(vorgaenge.size).toBe(1);
        await ae.zurueck('fabio');
        expect(r.striche).toHaveLength(1);
        expect(r.striche[0].points).toHaveLength(2);
    });

    it('was nur in der alten Liste lag, wird beim Laden EIN Commit „Übernahme Planinhalte"', async () => {
        localStorage.setItem('ifc-repo:global:plan-inhalte', JSON.stringify([
            { id: 'pi-a', art: 'text', x: 0, z: 0, text: 'A', groesse: 2.5, winkel: 0 },
            { id: 'pi-b', art: 'symbol', x: 5, z: 5, symbol: 'schacht', groesse: 3, winkel: 0 },
        ]));
        const p = usePlanInhalt(); await p.bereit;
        const ae = useAenderungen();
        expect(ae.commits.map(c => c.nachricht)).toEqual(['Übernahme Planinhalte']);
        expect([...ae.wirksamerStand('planinhalt').keys()].sort()).toEqual(['pi-a', 'pi-b']);
        expect(p.inhalte).toHaveLength(2);
        // Ein zweites Laden übernimmt nichts doppelt.
        setActivePinia(createPinia());
        const p2 = usePlanInhalt(); await p2.bereit;
        expect(useAenderungen().commits).toHaveLength(1);
        expect(liste('plan-inhalte')).toHaveLength(2);                 // Rückweg bleibt liegen
    });

    it('Planinhalte stehen nicht im Änderungsbericht — sie sind keine Forderung an den Planer', async () => {
        const p = usePlanInhalt(); await p.bereit;
        p.addText({ x: 1, z: 2 }, 'Hinweis');
        await warte(10);
        const ae = useAenderungen();
        expect(ae.eintraege).toHaveLength(1);
        const b = baueBericht({ eintraege: ae.eintraege });
        expect(JSON.stringify(b.stand ?? b)).not.toMatch(/Hinweis/);
    });
});
