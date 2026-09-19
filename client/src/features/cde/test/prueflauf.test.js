// @vitest-environment jsdom
/**
 * Markierung ohne Engine (Teil XXIV, K6).
 *
 * Bis K6 prüfte nur die Prüfliste der Engine, und die eigenen Kanten liefen
 * INNERHALB der Schleife über die gelieferten Modelle: ohne geliefertes
 * Modell gar nicht, mit zweien doppelt. Ohne Engine gab es keine Markierung.
 *
 *   1. Ohne Engine, aus dem Journal: der Abnahmefall C2, Schritte 4–6 —
 *      markiert bei 3,0 ‰, frei bei 4,0 ‰, wieder markiert mit einem
 *      Büro-Regelwerk (Mindestgefälle aus dem Katalog, nicht aus dem Code).
 *   2. Netzbefunde an eigenen Teilen: loses Ende, Schacht ohne Anschluss.
 *   3. Über die Engine (echter Prototyp): ohne Lieferung werden die eigenen
 *      Teile geprüft, mit zwei Lieferungen steht jede eigene Haltung EINMAL
 *      in der Liste — und mit denselben Befunden wie ohne Engine.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';
import { setzeRegelwerk } from '../services/regeln/Regelwerk.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => setzeRegelwerk([]));                  // das Register ist Modulzustand

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T10:00:00Z', ...rest });
const schacht = (id, gid, ost, sohle) => kommando(id, 'schacht-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
    eingaben: { zug: [{ ost, nord: 0, hoehe: sohle }, { ost, nord: -0.001, hoehe: sohle + 2.5 }] } });

/** C2, Schritte 1–3: Schacht A, Schacht B, Haltung A → B (5,0 ‰, DN 300). */
async function achseGezogen() {
    const b = useBearbeitung();
    for (const k of [
        schacht('ko-a', 'cde-A', 0, 100), schacht('ko-b', 'cde-B', 30, 99.85),
        kommando('ko-h', 'rohr-zeichnen', { neu: ['cde-H'], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }] } }),
    ]) expect((await b.fuehreAus(k)).grund).toBe(null);
    return { b, ae: useAenderungen() };
}
const sohleEnde = (b, ende) => b.fuehreAus(kommando(`ko-${ende}`, 'sohlhoehen-setzen', { ziel: ['cde-H'], werte: { anfang: 100, ende } }));
const regeln = (befunde) => befunde.map(x => x.regel).sort();

/** Die echte Engine-Logik über den Prototyp, mit demselben Journalstand; `modelle` gelieferte Modelle mit je einer Haltung. */
function engineMit(ae, modelle = 0) {
    const achsen = new Map(), knoten = new Map();
    for (let m = 0; m < modelle; m++) {
        const x0 = 100 + m * 100;
        achsen.set(`m${m}`, new Map([[1, { globalId: `G${m}`, name: `G${m}`, kategorie: 'IFCPIPESEGMENT', quelle: 'axisRep', dn: 300, laenge: 40,
            anfang: { x: x0, y: 99, z: 0 }, ende: { x: x0 + 40, y: 98.8, z: 0 },
            polyline: [{ x: x0, y: 99, z: 0 }, { x: x0 + 40, y: 98.8, z: 0 }] }]]));
        knoten.set(`m${m}`, new Map());
    }
    const dies = Object.assign(Object.create(IfcEngine.prototype), {
        _achsen: achsen, _knoten: knoten, _merkmale: new Map(),
        quelleVon: () => null, merkmaleAlle: () => new Map(),
    });
    IfcEngine.prototype.setzeJournalStand.call(dies, {
        ...cdeAchsenAus(ae.wirksamerStand('erzeugt')),
        verdeckt: verdeckteAus(ae.wirksamerStand('geloescht')),
    });
    return dies;
}

describe('1 — ohne Engine: der Abnahmefall C2, Schritte 4 bis 6', () => {
    it('5,0 ‰ frei · 3,0 ‰ markiert · 4,0 ‰ frei · Büro-Regelwerk 5 ‰ wieder markiert', async () => {
        const { b } = await achseGezogen();
        expect(b.befundeVon('cde-H')).toEqual([]);

        await sohleEnde(b, 99.91);                                     // 0,09 m auf 30 m
        const [flach, ...rest] = b.befundeVon('cde-H');
        expect(rest).toEqual([]);
        expect(flach).toMatchObject({ regel: 'gefaelle_zu_flach', schwere: 'warnung', quelle: 'Faustregel 1:DN' });
        expect(flach.wert).toMatch(/^3[.,]0 ‰$/);
        expect(flach.grenze).toMatch(/^mindestens 3[.,]3 ‰$/);

        await sohleEnde(b, 99.88);                                     // 4,0 ‰
        expect(b.befundeVon('cde-H')).toEqual([]);

        // Das Mindestgefälle steht im KATALOG: ein Büro-Regelwerk schlägt die Faustregel.
        setzeRegelwerk([{ id: 'gefaelleMindestPromille', wert: 5, herkunft: 'buero' }]);
        const buero = b.befundeVon('cde-H');
        expect(buero).toHaveLength(1);
        expect(buero[0]).toMatchObject({ regel: 'gefaelle_zu_flach', quelle: 'Büro-Regelwerk' });
        expect(buero[0].grenze).toMatch(/^mindestens 5[.,]0 ‰$/);
    });

    it('ausgeführt, nicht abgelehnt: der Eintrag steht im Journal, die Markierung daneben', async () => {
        const { b, ae } = await achseGezogen();
        const erg = await sohleEnde(b, 99.91);
        expect(erg.ausgefuehrt).toBe(true);
        expect(ae.eintraege.at(-1).globalId).toBe('cde-H');
        expect(b.befundeVon('cde-H')).toHaveLength(1);
    });

    it('eine festgelegte Fliessrichtung gilt auch hier: umgekehrt läuft die Haltung bergauf', async () => {
        const { b } = await achseGezogen();
        expect((await b.fuehreAus(kommando('ko-f', 'fliessrichtung-setzen', { ziel: ['cde-H'], werte: { richtung: 'umgekehrt' } }))).grund).toBe(null);
        expect(regeln(b.befundeVon('cde-H'))).toEqual(['gefaelle_gegen']);
    });

    it('ein verdecktes Bauteil hat keine Befunde mehr', async () => {
        const { b } = await achseGezogen();
        await sohleEnde(b, 99.91);
        await b.fuehreAus(kommando('ko-l', 'loeschen', { ziel: ['cde-H'], werte: {} }));
        expect(b.befundeVon('cde-H')).toEqual([]);
        // … und seine Schächte haben jetzt keinen Anschluss mehr.
        expect(regeln(b.befundeVon('cde-A'))).toEqual(['schacht_ohne_anschluss']);
    });
});

describe('2 — Netzbefunde an eigenen Teilen', () => {
    it('eine Haltung ohne Schacht am Ende: loses Ende; ein Schacht allein: ohne Anschluss', async () => {
        const b = useBearbeitung();
        for (const k of [
            schacht('ko-a', 'cde-A', 0, 100), schacht('ko-c', 'cde-C', 80, 99),
            kommando('ko-h', 'rohr-zeichnen', { neu: ['cde-H'], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
                eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 30, nord: 0, hoehe: 99.85 }] } }),
        ]) expect((await b.fuehreAus(k)).grund).toBe(null);
        expect(regeln(b.befundeVon('cde-H'))).toEqual(['loses_ende']);
        expect(regeln(b.befundeVon('cde-C'))).toEqual(['schacht_ohne_anschluss']);
        expect(b.befundeVon('cde-A')).toEqual([]);
    });
});

describe('3 — über die Engine: einmal, ohne und mit Lieferungen', () => {
    it('ohne geliefertes Modell wird das eigene Netz geprüft (vorher: gar nicht)', async () => {
        const { b, ae } = await achseGezogen();
        await sohleEnde(b, 99.91);
        const liste = engineMit(ae, 0).pruefeAlles();
        const zeilen = liste.filter(z => z.globalId === 'cde-H');
        expect(zeilen).toHaveLength(1);
        expect(regeln(zeilen[0].befunde)).toEqual(['gefaelle_zu_flach']);
    });

    it('mit zwei gelieferten Modellen steht jede eigene Haltung EINMAL in der Liste (vorher: zweimal)', async () => {
        const { b, ae } = await achseGezogen();
        await sohleEnde(b, 99.91);
        const liste = engineMit(ae, 2).pruefeAlles();
        expect(liste.filter(z => z.globalId === 'cde-H')).toHaveLength(1);
        // Die gelieferten stehen weiter je Modell da (lose Enden: ohne Schächte).
        expect(liste.filter(z => /^G\d$/.test(z.globalId ?? '') || z.localId === 1).length).toBeGreaterThan(0);
    });

    it('mit und ohne Engine: dieselben Befunde an den eigenen Teilen', async () => {
        const { b, ae } = await achseGezogen();
        await sohleEnde(b, 99.91);
        const ohne = b.pruefeEigenes().map(({ globalId, befunde }) => ({ globalId, befunde })).sort((x, y) => x.globalId.localeCompare(y.globalId));
        const mit = engineMit(ae, 1).pruefeAlles().filter(z => String(z.globalId).startsWith('cde-'))
            .map(({ globalId, befunde }) => ({ globalId, befunde })).sort((x, y) => x.globalId.localeCompare(y.globalId));
        expect(mit).toEqual(ohne);
    });
});
