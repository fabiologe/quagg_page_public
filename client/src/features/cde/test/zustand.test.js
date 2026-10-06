// @vitest-environment jsdom
/**
 * Der Zustand eines eigenen Bauteils (services/Zustand.js) — Rückbau.
 * Fabio, 2026-10-06: rückgebaute Elemente sollen in der Ansicht erkennbar
 * sein, weil sie für die Massen zählen. Geprüft wird die EINE Regel und dass
 * Plan, Baum, Paket und der Kommandoweg sie fragen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ZUSTAENDE, zustandVon, zustandsbild } from '../services/Zustand.js';
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
});

describe('Zustand · über den Kommandoweg bis ins Paket', () => {
    beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));
    it('ein Straßenablauf als Rückbau: das Bauwerk trägt den Zustand, jedes Teil ist im Paket rot', async () => {
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
