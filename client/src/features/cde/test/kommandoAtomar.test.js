// @vitest-environment jsdom
/**
 * Ein Kommando ist ein Vorgang, ganz oder gar nicht (Teil XXIV, K2).
 *
 * Geprüft über die echten Stores gegen die echte Ablage (localStorage):
 *   1. Ein mehrteiliger Vorgang wird EINMAL gesichert (vorher je Eintrag).
 *   2. Verweigert der Mehrbenutzer-Wächter, ist der GANZE Vorgang abgelehnt
 *      und nichts davon im Stand (Fabios E5).
 *   3. Scheitert nur das Netz, bleibt der Vorgang ganz im Fenster und der
 *      nächste Schritt schreibt ihn mit (Abnahme 2026-09-12).
 *   4. Der BELEG: das ausgewertete Kommando am ersten Eintrag, die
 *      Vorgangskennung ist die Kommandokennung (E1).
 *   5. Der Beleg überlebt den Leser, der heute ausgeliefert ist — Laden und
 *      Sichern in Schreibstufe 2 und 3 lassen ihn stehen.
 *   6. Eine Journalversion, die diese CDE nicht kennt, wird nur gelesen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { repo } from '../services/RepoFacade.js';
import { setzeSchreibStufeFuerTests } from '../services/JournalFormat.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';

const SCHLUESSEL = 'ifc-repo:global:aenderungen';
const gespeichert = () => JSON.parse(localStorage.getItem(SCHLUESSEL));

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => {
    vi.restoreAllMocks();
    setzeSchreibStufeFuerTests(2);
});

const kg = (gid, wert) => ({ art: 'kg', globalId: gid, nachher: wert, wer: 'fabio' });

/** Ein eigener Schacht als Ausgangslage — und das Subjekt, wie der Viewer es einordnet. */
async function schachtDa() {
    const b = useBearbeitung();
    const erg = await b.fuehreAus({
        schema: KOMMANDO_SCHEMA, id: 'ko-schacht', werkzeug: 'schacht-zeichnen', ziel: [], neu: ['cde-s1'],
        eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 0, nord: -0.001, hoehe: 102 }] },
        werte: { name: 'S', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
        wer: 'fabio', wann: '2026-09-18T21:00:00Z',
    });
    expect(erg.ausgefuehrt).toBe(true);
    // Das Subjekt baut niemand von Hand: ohne Oberfläche kommt es aus dem Stand (K3).
    return { b };
}
const reihe = (neu, id = 'ko-reihe') => ({
    schema: KOMMANDO_SCHEMA, id, werkzeug: 'reihe', ziel: ['cde-s1'], neu,
    werte: { anzahl: neu.length, ost: 5, nord: 0 }, wer: 'fabio', wann: '2026-09-18T21:01:00Z',
});

describe('1 — ein Vorgang, ein Sichern', () => {
    it('drei Kopien sind drei Einträge, EIN Vorgang, EIN Schreibzugriff — mit den Kennungen aus `neu`', async () => {
        const { b } = await schachtDa();
        const set = vi.spyOn(repo, 'set');
        const erg = await b.fuehreAus(reihe(['cde-k1', 'cde-k2', 'cde-k3']));
        expect(erg.ausgefuehrt).toBe(true);
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-k1', 'cde-k2', 'cde-k3']);
        expect(set.mock.calls.filter(([k]) => k === 'aenderungen')).toHaveLength(1);
        expect(new Set(erg.eintraege.map(e => e.vorgang))).toEqual(new Set(['ko-reihe']));
    });
});

describe('2 — der Mehrbenutzer-Wächter lehnt den GANZEN Vorgang ab', () => {
    it('nichts davon im Stand, die Sitzung wie vorher, die fremde Arbeit unberührt', async () => {
        const { b } = await schachtDa();
        const ae = useAenderungen();
        const vorherEintraege = ae.eintraege.length;
        const vorherSitzung = [...ae.sitzung?.schrittIds ?? []];
        const fremd = { version: 2, commits: [], sitzung: null, schreibstand: { zaehler: 99, marke: 'FREMD', wer: 'petra', wann: 5 } };
        localStorage.setItem(SCHLUESSEL, JSON.stringify(fremd));
        const erg = await b.fuehreAus(reihe(['cde-k1', 'cde-k2', 'cde-k3']));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/petra hat den Verlauf inzwischen geändert/);
        expect(ae.eintraege.length).toBe(vorherEintraege);
        for (const gid of ['cde-k1', 'cde-k2', 'cde-k3']) expect(ae.wirksamerStand('erzeugt').has(gid)).toBe(false);
        expect([...ae.sitzung?.schrittIds ?? []]).toEqual(vorherSitzung);
        expect(gespeichert()).toEqual(fremd);
    });
});

describe('3 — scheitert nur das Netz, bleibt der Vorgang ganz im Fenster', () => {
    it('der nächste Schritt schreibt ihn mit', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        const set = vi.spyOn(repo, 'set').mockResolvedValueOnce(false);
        const v = await ae.eintragenVorgang([kg('G1', '410'), kg('G2', '420')], { vorgang: 'vg-netz' });
        expect(v.ok).toBe(true);
        expect(ae.sicherFehler).toBeTruthy();
        expect(new Map(ae.wirksamerStand('kg')).get('G2')).toBe('420');
        set.mockRestore();
        await ae.eintragen(kg('G3', '430'));
        const ids = gespeichert().sitzung.schritte.map(s => s.globalId);
        expect(ids).toEqual(['G1', 'G2', 'G3']);
        expect(ae.sicherFehler).toBeNull();
    });
});

describe('4 — der Beleg: die Absicht am Vorgang', () => {
    it('am ersten Eintrag das ausgewertete Kommando; die Vorgangskennung ist die Kommandokennung', async () => {
        const { b } = await schachtDa();
        const erg = await b.fuehreAus(reihe(['cde-k1', 'cde-k2']));
        const [erster, zweiter] = erg.eintraege;
        expect(erster.kommando).toMatchObject({ schema: 1, id: 'ko-reihe', werkzeug: 'reihe', ziel: ['cde-s1'], neu: ['cde-k1', 'cde-k2'] });
        expect(zweiter.kommando).toBeUndefined();
        expect(erster.vorgang).toBe('ko-reihe');
        expect(erster.vorgangTitel).toBe('Reihe');
    });

    it('auch ein einzelner Eintrag trägt Vorgang und Beleg — sein Titel bleibt der seiner Art', async () => {
        await schachtDa();
        const e = useAenderungen().eintraege.at(-1);
        expect(e).toMatchObject({ globalId: 'cde-s1', vorgang: 'ko-schacht', kommando: { id: 'ko-schacht', neu: ['cde-s1'] } });
        expect(e.vorgangTitel).toBeUndefined();
        expect(useAenderungen().vorgaenge[0].titel).toBe('Erzeugt');
    });

    it('zurück nimmt den ganzen Vorgang zurück — wie vor K2', async () => {
        const { b } = await schachtDa();
        await b.fuehreAus(reihe(['cde-k1', 'cde-k2']));
        const ae = useAenderungen();
        await ae.zurueck('fabio');
        expect(ae.wirksamerStand('erzeugt').has('cde-k1')).toBe(false);
        expect(ae.wirksamerStand('erzeugt').has('cde-k2')).toBe(false);
        expect(ae.wirksamerStand('erzeugt').has('cde-s1')).toBe(true);
    });
});

describe('5 — der Beleg überlebt den ausgelieferten Leser', () => {
    for (const stufe of [2, 3]) {
        it(`Schreibstufe ${stufe}: laden, einen Schritt dazu, sichern — der Beleg steht noch da`, async () => {
            setzeSchreibStufeFuerTests(stufe);
            await schachtDa();
            expect(gespeichert().sitzung.schritte[0].kommando?.id).toBe('ko-schacht');
            // Ein zweites Fenster (neue Pinia) lädt die Datei, trägt ein und sichert.
            setActivePinia(createPinia());
            const ae2 = useAenderungen();
            await ae2.bereit;
            await ae2.eintragen(kg('G1', '410'));
            const schritte = gespeichert().sitzung.schritte;
            expect(schritte[0].kommando).toMatchObject({ id: 'ko-schacht', neu: ['cde-s1'] });
            expect(schritte.at(-1).globalId).toBe('G1');
        });
    }
});

describe('6 — eine unbekannte Journalversion wird nur gelesen', () => {
    it('kein leerer Neuanfang, kein Überschreiben', async () => {
        const kuenftig = { version: 3, commits: [], sitzung: { begonnen: 1, wer: 'x', schritte: [] } };
        localStorage.setItem(SCHLUESSEL, JSON.stringify(kuenftig));
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.nurLesen?.grund).toMatch(/Version 3 — diese CDE kennt 2/);
        expect(await ae.eintragen(kg('G1', '410'))).toBeNull();
        expect(gespeichert()).toEqual(kuenftig);
    });
});
