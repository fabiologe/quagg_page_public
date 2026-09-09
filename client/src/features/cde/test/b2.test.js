// @vitest-environment jsdom
/**
 * B2 — Mitführen über die GlobalId, „Verbundenes wählen", Gummibänder
 * (Teil XVII, 2026-09-08).
 *
 * (a) Die Vorschau eines verschobenen Laufs zeigt je gerissenem Anschluss
 *     ein Band vom Knoten zum verschobenen Ende — aus `subjekt.beziehungen`,
 *     ohne Nachschlag.
 * (b) `anschluesseFuer(gid)` findet die Anschlüsse gelieferter UND eigener
 *     Schächte (ein Weg: dasselbe Netz).
 * (c) `waehleOrte` setzt die Mehrfachauswahl je Modell wie der Rahmen.
 * (d) Die Pille bietet nur die Verbund-Wege an, die es gibt, und meldet
 *     Art und Tiefe.
 * (e) Der Viewer verklebt: HUD → waehleVerbund → waehleOrte → _mehrfachEinordnen;
 *     entwerteNach zieht den Index nach.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { vorschauFuer } from '../services/Vorschau.js';
import { IfcEngine } from '../services/IfcEngine.js';
import CdeHudLayer from '../components/CdeHudLayer.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');
const p = (x, z, y = 0) => ({ x, y, z });

describe('(a) Gummibänder zu den Partnern', () => {
    const rohr = {
        globalId: 'H1', name: 'H1', modelId: 'm1', localId: 11,
        anker: { x: 25, y: 9.5, z: 0 }, box: { min: { x: 0, y: 8.85, z: -0.15 }, max: { x: 50, y: 10.15, z: 0.15 } },
        beziehungen: [
            { art: 'anschluss', a: 'H1', b: 'S1', an: 'H1', bn: 'S1', mass: { ende: 'anfang', dz: 0, punkt: p(0, 0, 10) } },
            { art: 'anschluss', a: 'H1', b: 'S2', an: 'H1', bn: 'S2', mass: { ende: 'ende', dz: 0, punkt: p(50, 0, 9) } },
            { art: 'gruppe', a: 'H1', b: 'gruppe:KR', an: 'H1', bn: 'KR', mass: {} },
        ],
    };
    it('verschoben: zwei gestrichelte Bänder vom Knoten zum neuen Ende und ein Warn-Chip', () => {
        const v = vorschauFuer([{ art: 'lage', globalId: 'H1', nachher: { x: 25, y: 9.5, z: 30 } }], { subjekt: rohr });
        const baender = v.primitive.filter(x => x.art === 'linie' && x.gestrichelt);
        expect(baender).toHaveLength(2);
        expect(baender[0].punkte[0]).toEqual(p(0, 0, 10));
        expect(baender[0].punkte[1]).toEqual({ x: 0, y: 10, z: 30 });
        expect(baender[1].punkte[1]).toEqual({ x: 50, y: 9, z: 30 });
        expect(v.chips.map(c => c.text)).toContain('2 Anschlüsse gelöst (S1, S2)');
    });
    it('unverändert: keine Bänder, kein Chip', () => {
        const v = vorschauFuer([{ art: 'lage', globalId: 'H1', nachher: { x: 25, y: 9.5, z: 0 } }], { subjekt: rohr });
        expect(v.primitive.filter(x => x.art === 'linie')).toEqual([]);
        expect(v.chips.some(c => /gelöst/.test(c.text))).toBe(false);
    });
    it('ein Schacht als Subjekt (Rolle b) bekommt keine Bänder — seine Rohre führt das Werkzeug nach', () => {
        const schacht = { globalId: 'S1', anker: p(0, 0, 10), box: { min: p(-0.5, -0.5, 9.8), max: p(0.5, 0.5, 12.5) },
                          beziehungen: [{ art: 'anschluss', a: 'H1', b: 'S1', an: 'H1', bn: 'S1', mass: { ende: 'anfang', punkt: p(0, 0, 10) } }] };
        const v = vorschauFuer([{ art: 'lage', globalId: 'S1', nachher: p(3, 0, 10) }], { subjekt: schacht });
        expect(v.primitive.filter(x => x.art === 'linie' && x.gestrichelt)).toEqual([]);
    });
});

describe('(b) anschluesseFuer — geliefert und eigen, ein Netz', () => {
    function engine() {
        const e = Object.create(IfcEngine.prototype);
        const achse = (gid, a, b) => ({ globalId: gid, name: gid, anfang: a, ende: b, polyline: [a, b], dn: 300, laenge: 50, kategorie: 'IFCPIPESEGMENT' });
        Object.assign(e, {
            _achsenRoh: new Map([['m1', new Map([[11, achse('H1', p(0, 0, 10), p(50, 0, 9))]])]]),
            _knotenRoh: new Map([['m1', new Map([[1, { globalId: 'S1', name: 'S1', punkt: p(0, 0, 10) }]])]]),
            // Ein eigener Schacht am Ende von H1 und ein eigenes Rohr, das dort weitergeht.
            _cdeKnoten: new Map([['cdeS', { globalId: 'cdeS', name: 'Neu-S', punkt: p(50, 0, 9) }]]),
            _cdeKanten: new Map([['cdeH', { globalId: 'cdeH', name: 'Neu-H', kategorie: 'IFCPIPESEGMENT', anfang: p(50, 0, 9), ende: p(90, 0, 8), punkte: [p(50, 0, 9), p(90, 0, 8)], laenge: 40, dn: 300 }]]),
            _verdeckt: new Set(), _gelaendeVerwerfen: () => {},
        });
        IfcEngine.prototype._lagenAnwenden.call(e);
        return e;
    }
    it('gelieferter Schacht: über seinen Ort', () => {
        const a = engine().anschluesseFuer('S1');
        expect(a.map(k => `${k.globalId}:${k.ende}`)).toEqual(['H1:anfang']);
    });
    it('eigener Schacht: über `cde:<gid>` im selben Netz — gelieferte UND eigene Rohre', () => {
        const a = engine().anschluesseFuer('cdeS');
        expect(a.map(k => `${k.globalId}:${k.ende}`).sort()).toEqual(['H1:ende', 'cdeH:anfang']);
        // und schachtAnschluesse liest DIESELBE Liste (nah/fern)
        const s = engine().schachtAnschluesse('cdeS');
        expect(s.map(k => k.globalId).sort()).toEqual(['H1', 'cdeH']);
        expect(s.find(k => k.globalId === 'H1').nah).toEqual(p(50, 0, 9));
    });
    it('unbekannt oder verdeckt: leer, kein Wurf', () => {
        const e = engine();
        expect(e.anschluesseFuer('GIBTSNICHT')).toEqual([]);
        expect(e.anschluesseFuer(null)).toEqual([]);
        e._verdeckt = new Set(['cdeS']);
        expect(e.anschluesseFuer('cdeS')).toEqual([]);
    });
});

describe('(c) waehleOrte — die Mehrfachauswahl der Rahmenauswahl', () => {
    it('gruppiert je Modell, hebt hervor, löscht den Einzelschlüssel, lässt Unbekanntes weg', async () => {
        const e = Object.create(IfcEngine.prototype);
        const highlight = vi.fn(async () => {}); const reset = vi.fn(async () => {});
        Object.assign(e, {
            components: { get: () => ({ list: new Map([['m1', {}], ['m2', {}]]) }) },
            _selectedItems: { m1: [3] }, _selectedKey: 'm1:3',
            _highlight: highlight, _resetHighlight: reset,
        });
        const r = await e.waehleOrte([{ modelId: 'm1', localId: 11 }, { modelId: 'm2', localId: '7' }, { modelId: 'm1', localId: 12 }, { modelId: 'weg', localId: 1 }, { modelId: 'm1', localId: 'x' }]);
        expect(r).toEqual({ items: { m1: [11, 12], m2: [7] }, count: 3 });
        expect(reset).toHaveBeenCalledWith({ m1: [3] });
        expect(highlight).toHaveBeenCalledTimes(1);
        expect(e._selectedItems).toEqual({ m1: [11, 12], m2: [7] });
        expect(e._selectedKey).toBeNull();
        // leer: Auswahl weg, kein Highlight
        const r2 = await e.waehleOrte([]);
        expect(r2.count).toBe(0);
        expect(e._selectedItems).toBeNull();
    });
});

describe('(d) Die Pille bietet nur vorhandene Verbund-Wege', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
    const ROHR = { modelId: 'm1', localId: 42, type: 'IFCPIPESEGMENT', globalId: 'H1', name: 'H1', anker: { x: 10, y: 300, z: 0 } };
    function montiert() {
        return mount(CdeHudLayer, {
            props: { element: ROHR, elementAnker: [10, 300, 0], projectToScreen: () => ({ x: 100, y: 100 }) },
            global: { stubs: { CdeIcon: { template: '<i />' } } },
        });
    }
    it('mit Anschlüssen und Gruppe: Nachbarn, Verbund, Gruppe — ohne Beziehungen nichts', async () => {
        const b = useBearbeitung();
        useIfcStore().modelList.push({ modelId: 'm1', name: 'test.ifc' });
        await b.einordne({ ...ROHR, beziehungen: [
            { art: 'anschluss', a: 'H1', b: 'S1', an: 'H1', bn: 'S1', mass: { ende: 'anfang' } },
            { art: 'gruppe', a: 'H1', b: 'gruppe:KR', an: 'H1', bn: 'KR', mass: {} },
        ] }, null);
        const w = montiert();
        await w.find('.hud-pille').trigger('click');
        expect(w.findAll('.hud-verbund-btn').map(k => k.text())).toEqual(['Nachbarn', 'Verbund', 'Gruppe']);
        await w.findAll('.hud-verbund-btn')[1].trigger('click');
        expect(w.emitted('waehle-verbund')[0][0]).toEqual({ arten: ['anschluss'], tiefe: Infinity, titel: 'Verbund' });
        await w.findAll('.hud-verbund-btn')[0].trigger('click');
        expect(w.emitted('waehle-verbund')[1][0]).toMatchObject({ arten: ['anschluss'], tiefe: 1 });
        w.unmount();
        await b.einordne({ ...ROHR, beziehungen: [] }, null);
        const w2 = montiert();
        await w2.find('.hud-pille').trigger('click');
        expect(w2.find('.hud-verbund').exists()).toBe(false);
        w2.unmount();
    });
});

describe('(e) Verklebung', () => {
    it('HUD → waehleVerbund → waehleOrte → _mehrfachEinordnen; Anschlüsse über die GlobalId; der Index zieht nach', () => {
        const code = lies('components/IfcViewer.vue');
        expect(code).toContain('@waehle-verbund="waehleVerbund"');
        const fn = code.slice(code.indexOf('async function waehleVerbund'), code.indexOf('async function baueErzeugteNeu'));
        expect(fn).toContain('engine.value.beziehungen?.()');
        expect(fn).toContain('idx.verbund(gid, arten)');
        expect(fn).toContain('engine.value.waehleOrte(orte)');
        expect(fn).toContain('await _mehrfachEinordnen(sortiert)');
        const einordnen = code.slice(code.indexOf('async function _einordnenMitHuelle'), code.indexOf('function bearbeitenSperrgrund'));
        expect(einordnen).toContain('anschluesseFuer?.(result.globalId)');
        expect(einordnen).not.toContain('anschluesseVon?.(result.modelId');
        const entwerten = code.slice(code.indexOf('async function entwerteNach'), code.indexOf('async function wendeEintragAn'));
        expect(entwerten).toContain('await engine.value?.beziehungen?.()');
        const hud = lies('components/CdeHudLayer.vue');
        expect(hud).toContain("'waehle-verbund'");
    });
});
