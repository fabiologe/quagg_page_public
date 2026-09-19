// @vitest-environment jsdom
/**
 * Stufe 5 des Aushub-Fachmodells — REBASE: das Journal von R01 auf R02 umhängen.
 *
 * Der Anlass, an 1337 gemessen: TEST-ERDKOERPER R02 trug für dasselbe
 * Gelände eine NEUE GlobalId. Das Journal hing an der alten — `geloescht`
 * fand sein Bauteil nicht (zwei Gelände sichtbar), jede Ableitung verlor ihre
 * Quelle, der Export meldete `fehlende_wirte`.
 *
 * Die Abnahme aus dem Plan, am ECHTEN Szenario (Katalog → Journal), Ur A → B:
 *   schlageVor           → [{A, B, 'name+kategorie'}]
 *   Nachspielen          fehlend 1 → 0; `geloescht` B statt A
 *   Ableitungen          quellen.gelaende === 'B' in JEDEM Teil; CDE-Kennungen bleiben
 *   Commit               trägt rebase {von, nach}
 *   Paket nach Rebase    Wirt jedes Aushubs = B (vorher A: fehlende_wirte)
 *   Wiederholung         0 Schritte;  ohne Zuordnung: nichts
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { planeNachspielen } from '../services/Nachspielen.js';
import { fehlendeAusJournal, schlageVor } from '../services/GlobalIdAbbildung.js';
import { planeRebase } from '../services/JournalRebase.js';
import { revisionsHinweis } from '../services/RevisionHinweis.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { erdbauSzenario } from './hilfen/erdbauSzenario.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const R01 = { sha: 'sha-r01', name: 'Gelaende_R01.ifc', revision: 1 };
const R02 = { sha: 'sha-r02', name: 'Gelaende_R02.ifc', revision: 2 };
/** Im geladenen R02 gibt es B (dasselbe Gelände unter neuer Kennung) und ein zweites Gelände C. */
const KANDIDATEN = [
    { globalId: 'B', name: 'Urgelände', kategorie: 'IFCGEOGRAPHICELEMENT' },
    { globalId: 'C', name: 'Böschung Nord', kategorie: 'IFCGEOGRAPHICELEMENT' },
];
const lese = (gid) => (['B', 'C', 'H1', 'FUND-1'].includes(gid) ? { x: 0, y: 0, z: 0 } : undefined);

async function journalAufA() {
    const S = erdbauSzenario({ ur: 'A' });
    const { ae } = await S.spiele();
    return ae;
}
const nachspielen = (ae) => planeNachspielen(ae.auftragsEintraege, lese, { standEintraege: ae.standEintraege });

describe('Die Zuordnung — ein Vorschlag, keine Entscheidung', () => {
    it('das Journal kennt Name, Kategorie und Prüfmass der verschwundenen Kennung aus sich selbst', async () => {
        const ae = await journalAufA();
        const vorher = nachspielen(ae);
        expect(vorher.zusammenfassung.fehlend).toBe(1);
        const fehlend = fehlendeAusJournal({ konflikte: vorher.konflikte, erzeugtStand: ae.wirksamerStand('erzeugt') });
        expect(fehlend).toEqual([expect.objectContaining({ gid: 'A', name: 'Urgelände', kategorie: 'IFCGEOGRAPHICELEMENT', arten: ['geloescht'] })]);
        expect(fehlend[0].pruefmass).toMatchObject({ triCount: 3200 });
        expect(schlageVor({ fehlend, kandidaten: KANDIDATEN })).toEqual([{ alt: 'A', neu: 'B', grund: 'name+kategorie' }]);
    });

    it('zwei gleich gute Kandidaten sind eine FRAGE, kein Vorschlag — und ohne Namen hilft das Prüfmass', () => {
        const f = [{ gid: 'A', name: 'Urgelände', kategorie: 'IFCGEOGRAPHICELEMENT', pruefmass: { triCount: 3200, spanX: 40, spanY: 1.2, spanZ: 40 } }];
        const doppelt = [...KANDIDATEN, { globalId: 'D', name: 'Urgelände', kategorie: 'IFCGEOGRAPHICELEMENT' }];
        expect(schlageVor({ fehlend: f, kandidaten: doppelt })[0]).toMatchObject({ neu: null, grund: 'mehrdeutig' });
        const nachMass = [{ globalId: 'E', name: 'DGM neu', kategorie: 'IFCGEOGRAPHICELEMENT', pruefmass: { triCount: 3200, spanX: 40, spanY: 1.2, spanZ: 40 } }];
        expect(schlageVor({ fehlend: f, kandidaten: nachMass })[0]).toEqual({ alt: 'A', neu: 'E', grund: 'pruefmass' });
        expect(schlageVor({ fehlend: f, kandidaten: [] })[0]).toMatchObject({ neu: null, grund: 'keiner' });
    });

    it('der Hinweis erkennt den Revisionswechsel am Register, nicht am Namen', () => {
        const register = [{ sha256: 'sha-r01', name: 'Gelaende_R01.ifc', basisname: 'Gelaende', art: 'modell', revision: 1 },
                          { sha256: 'sha-r02', name: 'Gelaende_R02.ifc', basisname: 'Gelaende', art: 'modell', revision: 2 }];
        const h = revisionsHinweis({ fehlend: [{ gid: 'A' }], vorschlaege: [{ alt: 'A', neu: 'B' }], geladen: [{ sha256: 'sha-r02' }], register });
        expect(h).toEqual({ wechsel: { von: R01, nach: R02 }, fehlend: 1, zuordenbar: 1 });
        expect(revisionsHinweis({ fehlend: [], geladen: [{ sha256: 'sha-r02' }], register })).toBeNull();
    });
});

describe('Das Umhängen — ein Commit, revertierbar, wiederholbar', () => {
    it('nach dem Rebase fehlt nichts mehr: B ist ausgeblendet, jede Ableitung fusst auf B, der Commit sagt es', async () => {
        const ae = await journalAufA();
        // Ohne offene Bearbeitung wird das Zuordnen sofort eine Version (S5);
        // mit offener geht es in sie ein (aenderungen.test.js).
        await ae.commitSitzung('Erdbau', { wer: 'fabio' });
        const kennungen = [...ae.wirksamerStand('erzeugt').keys()].sort();
        const { schritte, unaufgeloest } = await ae.rebaseAuf({ abbildung: new Map([['A', 'B']]), wer: 'pruefer', von: R01, nach: R02 });
        expect(unaufgeloest).toEqual([]);
        expect(schritte.length).toBeGreaterThan(2);

        expect(nachspielen(ae).zusammenfassung.fehlend).toBe(0);                  // vorher 1
        const geloescht = ae.wirksamerStand('geloescht');
        expect(geloescht.get('B')).toBe(true);
        expect(geloescht.has('A')).toBe(false);
        const erzeugt = ae.wirksamerStand('erzeugt');
        expect([...erzeugt.keys()].sort()).toEqual(kennungen);                    // die CDE-Kennungen BLEIBEN
        for (const plan of erzeugt.values()) expect(plan.parameter.quellen.gelaende).toBe('B');
        // Was nicht A war, bleibt (die Haltung des Kanalgrabens).
        expect([...erzeugt.values()].find(p => p.rezept === 'kanalgraben').parameter.quellen.rohre).toEqual(['H1']);

        const commit = ae.commits.at(-1);
        expect(commit.rebase).toEqual({ von: R01, nach: R02, abbildung: { A: 'B' } });
        expect(commit.nachricht).toBe('Zugeordnet: R01 → R02');
        expect(commit.modellSha).toBe('sha-r02');                                // Lücke L6: das Modell, an dem es jetzt hängt
    });

    it('die Namen ziehen mit: ein Vorgang, der nach dem alten Gelände hiess, heisst nach dem neuen (A7)', async () => {
        const ae = await journalAufA();
        const vorher = [...ae.wirksamerStand('erzeugt').values()];
        // Das Szenario nennt sein Ur „Urgelände" — R02 heisst „Urgelände R02".
        const alt = vorher.map(p => p.name).filter(n => /^Urgelände/.test(n));
        expect(alt.length).toBeGreaterThan(0);
        await ae.rebaseAuf({ abbildung: new Map([['A', 'B']]), namen: new Map([['B', { alt: 'Urgelände', neu: 'Urgelände R02' }]]),
                             wer: 'pruefer', von: R01, nach: R02 });
        const nachher = [...ae.wirksamerStand('erzeugt').values()];
        for (const p of nachher.filter(q => q.parameter?.quellen?.gelaende === 'B')) {
            if (/^Urgelände/.test(p.name)) expect(p.name, p.name).toMatch(/^Urgelände R02( |$)/);
            for (const v of p.parameter.vorgaenge ?? []) if (/^Urgelände/.test(v.titel)) expect(v.titel).toMatch(/^Urgelände R02 /);
        }
        // Was nicht nach dem Gelände heisst, bleibt (der Kanalgraben heisst nach seiner Haltung).
        const graben = nachher.find(p => p.rezept === 'kanalgraben');
        expect(graben.name).toBe(vorher.find(p => p.rezept === 'kanalgraben').name);
    });

    it('wiederholbar und nie auf Verdacht: ein zweiter Rebase hat 0 Schritte, einer ohne Zuordnung auch', async () => {
        const ae = await journalAufA();
        await ae.rebaseAuf({ abbildung: new Map([['A', 'B']]), von: R01, nach: R02 });
        const commits = ae.commits.length;
        expect((await ae.rebaseAuf({ abbildung: new Map([['A', 'B']]), von: R01, nach: R02 })).schritte).toEqual([]);
        expect((await ae.rebaseAuf({ abbildung: new Map() })).schritte).toEqual([]);
        expect(ae.commits.length).toBe(commits);                                  // kein leerer Commit
    });

    it('der Plan überschreibt nichts: trägt die neue Kennung schon einen eigenen Wert, ist das eine Frage', () => {
        const staende = {
            lage: new Map([['A', { x: 1, y: 2, z: 3 }], ['B', { x: 9, y: 9, z: 9 }]]),
            geloescht: new Map([['A', true]]),
        };
        const { schritte, unaufgeloest } = planeRebase({ staende, abbildung: new Map([['A', 'B']]),
                                                         basisIst: new Map([['B', { x: 0, y: 0, z: 0 }]]) });
        expect(unaufgeloest).toEqual([{ art: 'lage', alt: 'A', neu: 'B', grund: 'ziel_hat_eigenen_wert' }]);
        expect(schritte).toEqual([
            { art: 'geloescht', globalId: 'B', nachher: true, basis: { x: 0, y: 0, z: 0 } },
            { art: 'geloescht', globalId: 'A', nachher: null },
        ]);
    });

    it('das Paket nach dem Rebase nennt B als Wirt — der Export findet sein Gelände wieder', async () => {
        const ae = await journalAufA();
        await ae.rebaseAuf({ abbildung: new Map([['A', 'B']]), von: R01, nach: R02 });
        const S = erdbauSzenario({ ur: 'B' });                                    // R02: dasselbe Gelände unter B
        const s = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: S.holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 300 });
        const g = await autor.eigenbauGeometrien([...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert })),
                                                 { verdeckt: new Set(ae.wirksamerStand('geloescht').keys()) });
        expect(g.misserfolge).toEqual([]);
        const paket = baueEigenbauPaket({ teile: g.bauteile, stand: s, anzeigeformen: g.anzeigeformen, nachProjekt: (p) => ({ ost: p.x, nord: -p.z, hoehe: p.y }) });
        const cuts = paket.bauteile.filter(b => b.klasse === 'IFCEARTHWORKSCUT');
        expect(cuts).toHaveLength(3);
        expect(cuts.every(b => b.wirt === 'B' && b.quellen.gelaende === 'B')).toBe(true);
    });
});
