// @vitest-environment jsdom
/**
 * Planinhalt und Rotstift bekommen einen Beleg (Teil XXIV, Fahrplan R2).
 *
 * Seit K4b (Schreibstufe 4, live 2026-09-19 15:42 UTC) schreiben Planinhalte
 * und Rotstift ins Journal — über `eintragenVorgang` direkt, OHNE Beleg. Damit
 * galt „jeder Vorgang hat genau einen Beleg" in Produktion nicht mehr. Jetzt
 * sind beide Katalogwerkzeuge (`planinhalt-setzen`, `rotstift-zeichnen`, E4
 * wörtlich), und der Plan setzt ein Kommando ab (`fuehreAus`). Ein Radierzug
 * bleibt EIN Vorgang.
 *
 * Geprüft über die echten Stores (`usePlanInhalt`, `useRotstift`), wie der
 * Lageplan sie ruft.
 */
import fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { setzeSchreibStufeFuerTests } from '../services/JournalFormat.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { ausGruppe, nachId, passende } from '../services/Bearbeitungen.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { usePlanInhalt } from '../stores/usePlanInhalt.js';
import { useRotstift } from '../stores/useRotstift.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => setzeSchreibStufeFuerTests(null));

const letzte = (art) => useAenderungen().eintraege.filter(e => e.art === art);

describe('Planinhalt: ein Kommando mit Beleg', () => {
    it('eine Beschriftung setzen: ein Eintrag, der Beleg daran, der Vorgang IST das Kommando — ohne Bearbeiten-Modus', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        const pi = usePlanInhalt();
        await pi.bereit;
        expect(useBearbeitung().modusAn).toBe(false);                    // Blattinhalt stand nie unter dem Modus
        const e = pi.addText({ x: 12, z: -4 }, 'Hier Leitung prüfen');
        await vi.waitFor(() => expect(letzte('planinhalt')).toHaveLength(1));
        const [eintrag] = letzte('planinhalt');
        expect(eintrag).toMatchObject({ globalId: e.id, nachher: { art: 'text', x: 12, z: -4, text: 'Hier Leitung prüfen' } });
        expect(eintrag.nachher.id).toBeUndefined();                      // die Kennung steht nur als globalId
        expect(eintrag.kommando).toMatchObject({                          // vorher: kein Beleg
            schema: KOMMANDO_SCHEMA, werkzeug: 'planinhalt-setzen', ziel: [],
            werte: { inhalte: [{ id: e.id, wert: expect.objectContaining({ text: 'Hier Leitung prüfen' }) }] },
        });
        expect(eintrag.vorgang).toBe(eintrag.kommando.id);
        expect(pi.inhalte.map(i => i.text)).toEqual(['Hier Leitung prüfen']);
        // Rückgängig: ein Schritt.
        await ae.zurueck('fabio');
        expect(pi.inhalte).toEqual([]);
    });

    it('in der Datei trägt der Eintrag sein Kommando (Schema 1)', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        const pi = usePlanInhalt();
        await pi.bereit;
        expect(pi.addSymbol({ x: 1, z: 2 }, 'schacht')).toBeTruthy();
        await vi.waitFor(() => expect(letzte('planinhalt')).toHaveLength(1));
        // Gesichert wird nach dem Eintragen — auf die Datei warten, nicht auf den Speicher.
        const planSchritte = async () => {
            const datei = await repo.get('aenderungen');
            return [...(datei?.sitzung?.schritte ?? []), ...(datei?.commits ?? []).flatMap(c => c.schritte ?? [])].filter(s => s.art === 'planinhalt');
        };
        await vi.waitFor(async () => expect(await planSchritte()).toHaveLength(1));
        const [schritt] = await planSchritte();
        expect(schritt.kommando?.werkzeug).toBe('planinhalt-setzen');
        expect(schritt.kommando?.schema).toBe(1);
    });
});

describe('Rotstift: ein Radierzug ist EIN Kommando', () => {
    it('ein Strich in zwei Teile radiert: drei Einträge, ein Vorgang „Radieren", ein Beleg — und ein Schritt zurück', async () => {
        const ae = useAenderungen();
        await ae.bereit;
        const rs = useRotstift();
        await rs.bereit;
        const punkte = Array.from({ length: 21 }, (_, i) => [i, 0, 0.5]);
        const s = rs.addStrich(punkte);
        await vi.waitFor(() => expect(letzte('rotstift')).toHaveLength(1));
        expect(rs.radiere(10, 0, 1.2)).toBe(true);
        await vi.waitFor(() => expect(letzte('rotstift')).toHaveLength(4));
        const zug = letzte('rotstift').slice(1);
        expect(new Set(zug.map(e => e.vorgang)).size).toBe(1);
        expect(zug[0].vorgangTitel).toBe('Radieren');
        expect(zug.filter(e => e.kommando)).toHaveLength(1);
        expect(zug[0].kommando).toMatchObject({ werkzeug: 'rotstift-zeichnen', werte: { titel: 'Radieren' } });
        expect(zug[0].kommando.werte.striche).toHaveLength(3);
        expect(rs.striche.map(x => x.id)).not.toContain(s.id);
        expect(rs.striche).toHaveLength(2);
        await ae.zurueck('fabio');
        expect(rs.striche.map(x => x.id)).toEqual([s.id]);
    });
});

describe('Schreibstufe 2 bleibt, wie sie war', () => {
    it('unter Stufe 3 geht der Planinhalt in die alte Liste, nicht ins Journal', async () => {
        setzeSchreibStufeFuerTests(2);
        const ae = useAenderungen();
        await ae.bereit;
        const pi = usePlanInhalt();
        await pi.bereit;
        pi.addText({ x: 0, z: 0 }, 'alt');
        await new Promise(r => setTimeout(r, 30));
        expect(letzte('planinhalt')).toEqual([]);
        expect(pi.inhalte.map(i => i.text)).toEqual(['alt']);
    });
});

describe('Der Katalog', () => {
    it('beide Werkzeuge sind da — aber in keiner Leiste und in keiner Auswahl: ihr Formular ist der Lageplan', () => {
        for (const id of ['planinhalt-setzen', 'rotstift-zeichnen']) {
            expect(nachId(id)).toBeTruthy();
            expect(nachId(id).gruppe).toBe('blatt');                       // kein Erzeugen: ein Zug baut hier kein Rezept
            expect(ausGruppe('erzeugen').map(b => b.id)).not.toContain(id);
            expect(ausGruppe('blatt').map(b => b.id)).not.toContain(id);
            expect(passende({ bauform: 'linie', guete: 'gemessen' }).map(b => b.id)).not.toContain(id);
        }
        // Dieselbe Regel galt schon für Merkmalsfenster und Eckgriffe.
        expect(ausGruppe('merkmale').map(b => b.id)).not.toContain('merkmalssatz-setzen');
    });

    it('technisch Unmögliches wird abgelehnt: fremde Kennung, leere Liste, doppelte Kennung', async () => {
        const b = useBearbeitung();
        const k = (werte) => ({ schema: KOMMANDO_SCHEMA, id: `ko-${Math.random().toString(36).slice(2)}`, werkzeug: 'planinhalt-setzen',
                                ziel: [], werte, wer: 'fabio', wann: '2026-09-19T20:00:00Z' });
        expect((await b.fuehreAus(k({ inhalte: [{ id: 'cde-X', wert: { art: 'text', x: 0, z: 0, text: 'a' } }] }))).grund).toMatch(/kein Planinhalt/);
        expect((await b.fuehreAus(k({ inhalte: [] }))).grund).toMatch(/Nichts einzutragen/);
        expect((await b.fuehreAus(k({ inhalte: [{ id: 'pi-1', wert: null }, { id: 'pi-1', wert: null }] }))).grund).toMatch(/steht doppelt/);
        expect(useAenderungen().eintraege).toEqual([]);
    });
});

describe('Ratsche: kein Schreibweg ins Journal ohne Beleg', () => {
    const WURZEL = join(process.cwd(), 'src/features/cde/');
    /** Alle Aufrufe von `eintragenVorgang(` ausserhalb der Tests — mit dem Text bis zur schliessenden Klammer. */
    function aufrufe() {
        const aus = [];
        const suche = (verz) => {
            for (const e of fs.readdirSync(verz, { withFileTypes: true })) {
                const pfad = join(verz, e.name);
                if (e.isDirectory()) { if (e.name !== 'test') suche(pfad); continue; }
                if (!/\.(js|vue)$/.test(e.name)) continue;
                const text = fs.readFileSync(pfad, 'utf8');
                for (const m of text.matchAll(/(?<!function )\beintragenVorgang\(/g)) {
                    let tiefe = 0, i = m.index + m[0].length - 1;
                    for (; i < text.length; i++) {
                        if (text[i] === '(') tiefe++;
                        else if (text[i] === ')' && --tiefe === 0) break;
                    }
                    aus.push({ datei: pfad.replace(WURZEL, ''), text: text.slice(m.index, i + 1) });
                }
            }
        };
        suche(WURZEL);
        return aus;
    }

    it('jeder Aufruf von `eintragenVorgang` nennt ein Kommando — bis auf `eintragen`, den Helfer der Tests', () => {
        const ohne = aufrufe().filter(a => !/\bkommando\b/.test(a.text)).map(a => `${a.datei}: ${a.text.slice(0, 60)}`);
        // Vorher: planJournal.js (Planinhalt, Rotstift) und der Test-Helfer.
        expect(ohne).toEqual([expect.stringMatching(/^stores\/useAenderungen\.js: eintragenVorgang\(\[schritt\], \{ ebene \}\)/)]);
    });

    it('… und `eintragen` ruft kein Produktionscode', () => {
        const funde = [];
        const suche = (verz) => {
            for (const e of fs.readdirSync(verz, { withFileTypes: true })) {
                const pfad = join(verz, e.name);
                if (e.isDirectory()) { if (e.name !== 'test') suche(pfad); continue; }
                if (!/\.(js|vue)$/.test(e.name)) continue;
                fs.readFileSync(pfad, 'utf8').split('\n').forEach((z, i) => {
                    if (/\.eintragen\(/.test(z) && !/^\s*(\*|\/\/)/.test(z)) funde.push(`${pfad.replace(WURZEL, '')}:${i + 1}`);
                });
            }
        };
        suche(WURZEL);
        expect(funde).toEqual([]);
    });
});
