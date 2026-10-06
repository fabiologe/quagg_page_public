// @vitest-environment jsdom
/**
 * Der Zustand eines eigenen Bauteils (services/Zustand.js) — Bestand, Neubau, Rückbau,
 * und die Massen nach Zustand (services/Zustandsmengen.js).
 * Fabio, 2026-10-06: rückgebaute Elemente sollen in der Ansicht erkennbar
 * sein, weil sie für die Massen zählen. Geprüft wird die EINE Regel und dass
 * Plan, Baum, Paket und der Kommandoweg sie fragen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ZUSTAENDE, zustandAusIsybau, zustandVon, zustandsbild, zustandsfarbe } from '../services/Zustand.js';
import { mengenNachZustand, zuglaenge } from '../services/Zustandsmengen.js';
import { planbildVon } from '../services/Bauteilrezepte.js';
import { eigenbauBaum } from '../services/Bauwerksstruktur.js';
import { drawPlanSymbol } from '../services/PlanSymbols.js';
import { pruefeKommando } from '../services/kommando/Kommando.js';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { paketAus, Speicher } from './hilfen/vorlagenKommandos.js';
import { k, e } from './hilfen/kammerKommandos.js';

const bauwerk = { rezept: 'bauwerk', name: 'S9', parameter: { art: 'schacht', zustand: 'rueckbau' } };
const teil = { rezept: 'rohr', name: 'Ring', kategorie: 'IFCBUILDINGELEMENTPART', parameter: { teilVon: 'cde-S9', punkte: [[0, 0, 0], [0, 1, 0]] } };

describe('Zustand · die Regel', () => {
    it('eigener Zustand, sonst der des Bauwerks; Unbekanntes zählt nicht', () => {
        const stand = new Map([['cde-S9', bauwerk]]);
        expect(zustandVon(bauwerk)).toBe('rueckbau');
        expect(zustandVon(teil, (g) => stand.get(g))).toBe('rueckbau');
        expect(zustandVon(teil)).toBeNull();
        expect(zustandVon({ parameter: { zustand: 'abgerissen' } })).toBeNull();
        expect(zustandsbild('rueckbau')).toBe(ZUSTAENDE.rueckbau);
    });
    it('ISYBAU-Status (G105): 0/3/4 Bestand, 1 Neubau, 6 Rückbau, 2/5 und Fehlendes ohne', () => {
        expect([0, 1, 2, 3, 4, 5, 6, null, undefined, '', 'x'].map(zustandAusIsybau))
            .toEqual(['bestand', 'neubau', null, 'bestand', 'bestand', null, 'rueckbau', null, null, null, null]);
    });
    it('Bestand färbt nicht um, Neubau rot, Rückbau gelb und durchscheinend', () => {
        expect(zustandsfarbe('bestand')).toBeNull();
        expect(zustandsfarbe(null)).toBeNull();
        expect(zustandsfarbe('neubau')).toEqual({ farbe: 0xc62828, deckkraft: 1 });
        expect(zustandsfarbe('rueckbau')).toEqual({ farbe: 0xf9a825, deckkraft: 0.45 });
        // Plan: Bestand grau ohne Strich, Rückbau gestrichelt.
        expect(ZUSTAENDE.bestand.plan.strich).toBeNull();
        expect(ZUSTAENDE.rueckbau.plan.strich).toEqual([1.2, 0.8]);
    });
    it('das Kommando nimmt nur bekannte Zustände', () => {
        const ko = (zustand) => pruefeKommando({ schema: 1, id: 'ko-z', ziel: [], wer: 't', wann: '2026-10-06T12:00:00Z',
                                                   werkzeug: 'rohr-zeichnen', eingaben: { zug: [e(0, 0, 0), e(5, 0, 0)] }, werte: { name: 'R', zustand } });
        expect(ko('rueckbau').filter(f => /zustand/.test(f))).toEqual([]);
        expect(ko('weg').filter(f => /zustand/.test(f))[0]).toMatch(/gibt es nicht/);
    });
});

describe('Zustand · in den Ansichten', () => {
    it('Lageplan: das Planbild trägt den Zustand, auch geerbt', () => {
        const stand = new Map([['cde-S9', bauwerk]]);
        expect(planbildVon(teil, (g) => stand.get(g))).toMatchObject({ zustand: 'rueckbau' });
        expect(planbildVon(teil)).not.toHaveProperty('zustand');
    });
    it('Plansymbol: gestrichelt nur, wenn verlangt', () => {
        const striche = [];
        const doc = new Proxy({}, { get: (_, n) => (n === 'setLineDashPattern' ? (m) => striche.push(m) : () => {}) });
        drawPlanSymbol(doc, 'schacht', 0, 0, 3, ZUSTAENDE.rueckbau.plan, { strich: ZUSTAENDE.rueckbau.plan.strich });
        drawPlanSymbol(doc, 'schacht', 0, 0, 3, { r: 0, g: 0, b: 0 });
        expect(striche).toEqual([[1.2, 0.8], []]);
    });
    it('Strukturbaum: Bauwerk und Teil tragen den Zustand mit Titel', () => {
        const stand = new Map([['cde-S9', bauwerk], ['cde-R1', teil]]);
        const baum = eigenbauBaum({ stand, modelId: 'm', istBehaelter: (w) => w?.rezept === 'bauwerk' });
        const alle = []; const lauf = (n) => { alle.push(n); (n.children ?? []).forEach(lauf); };
        lauf(baum.wurzel);
        expect(alle.filter(n => n.zustand === 'rueckbau').map(n => n.zustandTitel)).toEqual(['Rückbau', 'Rückbau']);
    });
    it('Strukturbaum: Neubau mit Abzeichen, Bestand als Normalfall ohne', () => {
        const stand = new Map([['cde-N', { ...bauwerk, parameter: { art: 'schacht', zustand: 'neubau' } }],
                               ['cde-B', { ...bauwerk, name: 'B', parameter: { art: 'schacht', zustand: 'bestand' } }]]);
        const baum = eigenbauBaum({ stand, modelId: 'm', istBehaelter: (w) => w?.rezept === 'bauwerk' });
        const alle = []; const lauf = (n) => { alle.push(n); (n.children ?? []).forEach(lauf); };
        lauf(baum.wurzel);
        expect(alle.filter(n => n.zustand).map(n => n.zustandTitel)).toEqual(['Neubau']);
    });
});

describe('Zustand · über den Kommandoweg bis ins Paket', () => {
    beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));
    it('ein Straßenablauf als Rückbau: das Bauwerk trägt den Zustand, jedes Teil ist im Paket gelb', async () => {
        const erg = await useBearbeitung().fuehreAus(k('bauwerk-aus-vorlage-strassenablauf', {
            neu: ['cde-SE1', 'cde-SEB', 'cde-SES', 'cde-SEA', 'cde-SEU', 'cde-SEE'], eingaben: { zug: [e(5, -5, 100)] },
            werte: { name: 'SE1', hoehe: '', tiefe: 1.25, schlamm: 1, richtung: 0, zustand: 'rueckbau' } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const stand = useAenderungen().wirksamerStand('erzeugt');
        expect(stand.get('cde-SE1').parameter.zustand).toBe('rueckbau');
        expect([...stand.values()].filter(w => w.parameter?.teilVon && w.parameter?.zustand)).toEqual([]);
        const p = await paketAus(useAenderungen());
        expect(p.bauteile).toHaveLength(5);
        expect(p.bauteile.every(t => t.farbe === ZUSTAENDE.rueckbau.farbe && t.deckkraft === ZUSTAENDE.rueckbau.deckkraft)).toBe(true);
    });
});

describe('Zustand · Massen getrennt nach Bestand, Neubau, Rückbau', () => {
    const haltung = (zustand, x, dn = 300, material = 'B') => ({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT',
        parameter: { punkte: [[0, 0, 0], [x, 0, 0]], dn, zustand, stammdaten: { 'Kante/Material': material } } });
    it('Leitungen in m je DN und Material, Bauwerke je Stück, Teile eines Bauwerks nicht einzeln', () => {
        const stand = new Map([
            ['H1', haltung('bestand', 10)], ['H2', haltung('bestand', 5)], ['H3', haltung('neubau', 7.25)],
            ['H4', haltung('rueckbau', 4, 200, 'PVC')],
            ['S1', { rezept: 'bauwerk', parameter: { art: 'schacht', zustand: 'neubau' } }],
            ['S1R', { rezept: 'schachtring', parameter: { teilVon: 'S1', punkte: [[0, 0, 0], [0, 1, 0]] } }],
            ['S2', { rezept: 'bauwerk', parameter: { art: 'schacht', zustand: 'rueckbau' } }],
            // Eine Leitung mit Knick: die Baugruppe trägt Zustand und Sachdaten, die Stücke und der Bogen erben.
            ['L', { rezept: 'bauwerk', parameter: { art: 'baugruppe', zustand: 'neubau', stammdaten: { 'Kante/Material': 'PVC' } } }],
            ['L1', { rezept: 'rohr', parameter: { teilVon: 'L', dn: 200, punkte: [[0, 0, 0], [3, 0, 4]] } }],
            ['LB', { rezept: 'bogen', parameter: { teilVon: 'L', dn: 200, punkte: [[0, 0, 0], [0.1, 0, 0]] } }],
            ['L2', { rezept: 'rohr', parameter: { teilVon: 'L', dn: 200, punkte: [[3, 0, 4], [3, 0, 6]] } }],
            ['X', { rezept: 'rohr', parameter: { dn: 150, punkte: [[0, 0, 0], [1, 0, 0]] } }],
        ]);
        const m = mengenNachZustand(stand);
        expect(m.zustaende).toEqual(['bestand', 'neubau', 'rueckbau', 'ohne']);
        const zeile = (gruppe, dn) => m.zeilen.find(z => z.gruppe === gruppe && (dn === undefined || z.dn === dn));
        const mat = (k) => m.zeilen.find(z => z.gruppe === 'leitung' && z.dn === 300).material;
        expect(zeile('leitung', 300).werte).toEqual({ bestand: 15, neubau: 7.25 });
        expect(m.zeilen.filter(z => z.gruppe === 'leitung' && z.dn === 200).map(z => z.werte)).toEqual([{ neubau: 7, rueckbau: 4 }]);
        expect(zeile('formstueck').werte).toEqual({ neubau: 1 });
        expect(zeile('bauwerk').werte).toEqual({ neubau: 1, rueckbau: 1 });
        expect(zeile('leitung', 150).werte).toEqual({ ohne: 1 });
        expect(m.summe).toEqual({ bestand: { laenge: 15, stueck: 0 }, neubau: { laenge: 14.25, stueck: 2 },
                                  rueckbau: { laenge: 4, stueck: 1 }, ohne: { laenge: 1, stueck: 0 } });
        expect(typeof mat()).toBe('string');
        expect(zuglaenge([[0, 0, 0], [3, 0, 4], [3, 12, 4]])).toBe(17);
    });
});
