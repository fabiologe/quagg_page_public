/**
 * Der Beziehungsindex in der ENGINE (Teil XVII, B1) — gegen die echten
 * Methodenkörper (`IfcEngine.prototype.<m>.call`) mit einer Attrappe in der
 * Form der Wirklichkeit: `_quellen` (IfcQuelle: lebt/ids/zeile/kategorieVon),
 * `autor.boxenVon`, wirksame `_achsen`/`_knoten`, der Gelände-Sampler.
 *
 * Geprüft: der Index entsteht aus Quelle + Hüllen + Achsen; ein Journalstand
 * mit bewegter Lage entwertet NUR das Bewegte (Hüllen werden nur dafür
 * geholt); die Kollisionsprüfung holt ihre Kandidaten aus dem Index; ein
 * Modellwechsel entwertet alles; und die Verklebung im Viewer/HUD steht.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IfcEngine } from '../services/IfcEngine.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');
const p = (x, z, y = 0) => ({ x, y, z });
const box = (x0, y0, z0, x1, y1, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

/** Zwei Haltungen an drei Schächten plus ein Fundament, das H1 schneidet. */
function attrappe() {
    const zeilen = new Map([
        [1, { GlobalId: { value: 'S1' }, Name: { value: 'S1' }, typ: 'IFCDISTRIBUTIONCHAMBERELEMENT' }],
        [2, { GlobalId: { value: 'S2' }, Name: { value: 'S2' }, typ: 'IFCDISTRIBUTIONCHAMBERELEMENT' }],
        [3, { GlobalId: { value: 'S3' }, Name: { value: 'S3' }, typ: 'IFCDISTRIBUTIONCHAMBERELEMENT' }],
        [11, { GlobalId: { value: 'H1' }, Name: { value: 'H1' }, typ: 'IFCPIPESEGMENT' }],
        [12, { GlobalId: { value: 'H2' }, Name: { value: 'H2' }, typ: 'IFCPIPESEGMENT' }],
        [20, { GlobalId: { value: 'F1' }, Name: { value: 'Fundament' }, typ: 'IFCFOOTING' }],
        [99, { GlobalId: { value: 'SITE' }, Name: { value: 'Site' }, typ: 'IFCSITE' }],
    ]);
    const boxen = new Map([
        [1, box(-0.5, 9.8, -0.5, 0.5, 12.5, 0.5)], [2, box(49.5, 8.8, -0.5, 50.5, 12.5, 0.5)], [3, box(99.5, 7.8, -0.5, 100.5, 12.5, 0.5)],
        [11, box(0, 8.85, -0.15, 50, 10.15, 0.15)], [12, box(50, 7.85, -0.15, 100, 9.15, 0.15)],
        [20, box(20, 9, -0.1, 24, 12, 0.9)],
    ]);
    const quelle = {
        lebt: () => true,
        ids: () => [...zeilen.keys()],
        zeile: (id) => zeilen.get(id) ?? null,
        kategorieVon: (z) => z.typ,
    };
    const boxenVon = vi.fn(async (modelId, ids) => new Map([...ids].filter(id => boxen.has(id)).map(id => [id, boxen.get(id)])));
    const achse = (gid, a, b) => ({ globalId: gid, name: gid, anfang: a, ende: b, polyline: [a, b], dn: 300, laenge: 50, kategorie: 'IFCPIPESEGMENT' });
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        _quellen: new Map([['m1', quelle]]),
        _achsenRoh: new Map([['m1', new Map([[11, achse('H1', p(0, 0, 10), p(50, 0, 9))], [12, achse('H2', p(50, 0, 9), p(100, 0, 8))]])]]),
        _knotenRoh: new Map([['m1', new Map([
            [1, { globalId: 'S1', name: 'S1', punkt: p(0, 0, 10) }],
            [2, { globalId: 'S2', name: 'S2', punkt: p(50, 0, 9) }],
            [3, { globalId: 'S3', name: 'S3', punkt: p(100, 0, 8) }],
        ])]]),
        _merkmale: new Map([['m1', new Map([[11, { Kanalart: 'KR' }], [12, { Kanalart: 'KR' }]])]]),
        autor: { boxenVon, _kernel: null },
        components: { get: () => ({ list: new Map() }) },
        _gelaendeOrteHolen: async () => [],
        gelaendeSampler: async () => ({ sample: () => 14 }),
        _gelaendeVerwerfen: () => {},
        _beziehungen: null, _beziehungenDirty: true, _beziehungenNr: 0, _huellen: new Map(), _cdeAbleitungen: [],
    });
    IfcEngine.prototype._lagenAnwenden.call(e);
    return { e, boxenVon, boxen };
}

describe('engine.beziehungen()', () => {
    it('baut den Index aus Quelle, Hüllen, Achsen und Knoten — und lässt Bauteile ohne Geometrie weg', async () => {
        const { e, boxenVon } = attrappe();
        const idx = await e.beziehungen();
        expect(boxenVon).toHaveBeenCalledTimes(1);
        expect(boxenVon.mock.calls[0][1]).toContain(99);                  // gefragt wird nach allem …
        expect(idx.objekt('SITE')).toBeNull();                           // … behalten nur, was Geometrie hat
        expect(idx.stand.arten.anschluss).toBe(4);
        expect(idx.partner('S2', 'anschluss').map(x => x.gid).sort()).toEqual(['H1', 'H2']);
        expect(idx.paare('schnitt').map(r => [r.a, r.b].sort().join('|'))).toEqual(['F1|H1']);
        // Überdeckung gegen den Sampler (14 m): H1-Scheitel 10,15 → 3,85.
        expect(idx.partner('H1', 'auflage')[0].mass.ueberdeckung).toBeCloseTo(3.85, 9);
        // Kanalart aus den Merkmalen wird zur Gruppe.
        expect(idx.partner('H1', 'gruppe')[0].name).toBe('KR');
        // Der Ort steht am Objekt — die Kollisionsprüfung braucht ihn.
        expect(idx.objekt('F1').ort).toEqual({ modelId: 'm1', localId: 20 });
        // Der zweite Aufruf ist der Cache.
        expect(await e.beziehungen()).toBe(idx);
        expect(boxenVon).toHaveBeenCalledTimes(1);
    });

    it('ein Journalstand mit bewegter Lage entwertet NUR das Bewegte: Hüllen nur dafür, der Rest bleibt', async () => {
        const { e, boxenVon, boxen } = attrappe();
        const vorher = await e.beziehungen();
        // H2 wandert 5 m nach Süden (+z): der Anschluss an S2/S3 reisst.
        boxen.set(12, box(50, 7.85, 4.85, 100, 9.15, 5.15));
        e.setzeJournalStand({ lagen: new Map([['H2', { x: 0, y: 0, z: 5 }]]) });
        expect(e._beziehungenDirty).toBeInstanceOf(Set);
        expect([...e._beziehungenDirty]).toEqual(['H2']);
        const nachher = await e.beziehungen();
        expect(nachher).not.toBe(vorher);
        expect(boxenVon).toHaveBeenCalledTimes(2);
        expect(boxenVon.mock.calls[1][1]).toEqual([12]);                  // nur H2
        expect(nachher.partner('H2', 'anschluss')).toEqual([]);
        expect(nachher.partner('S2', 'anschluss').map(x => x.gid)).toEqual(['H1']);
        // H2 liegt jetzt neben S2/S3 (0,5 m Hülle → 4,35 m Abstand): keine Nähe, aber auch kein Schnitt.
        expect(nachher.von('H2').filter(r => r.art === 'schnitt')).toEqual([]);
        // Der Schnitt F1–H1 ist DASSELBE Objekt wie vorher — nicht neu gerechnet.
        const alt = vorher.paare('schnitt')[0];
        expect(nachher.paare('schnitt')).toContain(alt);
        // Und die Auflage von H1 blieb stehen (dasselbe Relationsobjekt), die von H2 wurde neu gerechnet.
        const auflage = (idx, gid) => idx.von(gid).find(r => r.art === 'auflage');
        expect(auflage(nachher, 'H1')).toBe(auflage(vorher, 'H1'));
        expect(auflage(nachher, 'H2')).not.toBe(auflage(vorher, 'H2'));
        expect(auflage(nachher, 'H2').mass.ueberdeckung).toBeCloseTo(14 - 9.15, 9);
    });

    it('ein zweiter Stand ohne Änderung kostet nichts Neues — und ein Modellwechsel verwirft alles', async () => {
        const { e, boxenVon } = attrappe();
        await e.beziehungen();
        const idx = await e.beziehungen();
        e.setzeJournalStand({});
        expect(e._beziehungenDirty).toBeNull();          // nichts bewegt → nichts entwertet
        expect(await e.beziehungen()).toBe(idx);
        expect(boxenVon).toHaveBeenCalledTimes(1);
        e._beziehungenVerwerfen(true);
        expect(e._beziehungenDirty).toBe(true);
        expect(e._huellen.size).toBe(0);
        await e.beziehungen();
        expect(boxenVon).toHaveBeenCalledTimes(2);
    });

    it('Ableitungen kommen als Paare herein (die Engine liest kein Journal)', async () => {
        const { e } = attrappe();
        e.setzeJournalStand({ ableitungen: [{ teil: 'GR', quelle: 'H1', teilName: 'Graben' }] });
        const idx = await e.beziehungen();
        expect(idx.partner('H1', 'ableitung')).toEqual([expect.objectContaining({ gid: 'GR', name: 'Graben' })]);
        expect(e.beziehungenVon('H1').some(r => r.art === 'ableitung')).toBe(true);
    });

    it('ein überholter Aufbau schreibt nicht zurück', async () => {
        const { e } = attrappe();
        let frei;
        e._gelaendeOrteHolen = () => new Promise(r => { frei = () => r([]); });
        const lauf = e.beziehungen();
        e._beziehungenVerwerfen(true);            // dazwischen: Modellwechsel
        frei();
        await lauf;
        expect(e._beziehungenDirty).toBe(true);   // der alte Lauf hat den Stand NICHT als frisch markiert
    });
});

describe('Die Leser', () => {
    it('kollisionenPruefen holt seine Kandidaten aus dem Index — die eigene Hüllenschleife ist weg', () => {
        const code = lies('services/IfcEngine.js');
        const start = code.indexOf('async kollisionenPruefen(');
        const rumpf = code.slice(start, code.indexOf('ableitungsBilder()', start));
        expect(rumpf).toContain('await this.beziehungen()');
        expect(rumpf).toContain("paare('schnitt')");
        expect(rumpf).toContain("paare('enthalten')");
        expect(rumpf).not.toMatch(/ueberlappt|groupData\.get\(\)/);
    });

    it('der Viewer hängt die Beziehungen ans Subjekt und reicht die Ableitungspaare an die Engine', () => {
        const code = lies('components/IfcViewer.vue');
        const einordnen = code.slice(code.indexOf('async function _einordnenMitHuelle'), code.indexOf('function bearbeitenSperrgrund'));
        expect(einordnen).toContain('engine.value?.beziehungen?.()');
        expect(einordnen).toContain('beziehungen: idx.von(gid)');
        const entwerten = code.slice(code.indexOf('async function entwerteNach'), code.indexOf('async function wendeEintragAn'));
        expect(entwerten).toContain('quellenVon(plan?.parameter)');
        expect(entwerten).toMatch(/setzeJournalStand\?\.\(\{\s*lagen, ableitungen,/);
    });

    it('die Einordnung friert den Lieferstand ein, BEVOR jemand verschiebt (Headless-Befund 2026-09-08)', () => {
        // `merkeLieferstand` gab es seit Stufe 9.3 — und niemand rief es: das
        // erste Verschieben eines Bauteils, das das Journal noch nicht nannte,
        // bekam keine `basis`, und das Fachmodell sah es am Lieferort weiter.
        const code = lies('components/IfcViewer.vue');
        const einordnen = code.slice(code.indexOf('async function _einordnenMitHuelle'), code.indexOf('function bearbeitenSperrgrund'));
        expect(einordnen).toContain('nachspielen.merkeLieferstand?.(result.globalId');
        const subjekt = code.slice(code.indexOf('function schachtSubjekt('), code.indexOf('function schachtSubjekt(') + 3000);
        expect(subjekt).toContain('merkeLieferstand');
    });

    it('das HUD zeigt die Chips aus dem Subjekt, nicht aus einer zweiten Suche', () => {
        const code = lies('components/CdeHudLayer.vue');
        expect(code).toContain("import { fasseZusammen } from '../services/Beziehungen.js'");
        expect(code).toContain('bearbeitung.bauteil');
        expect(code).toContain('class="hud-beziehungen"');
        expect(code).not.toMatch(/baueBeziehungen|anschluesseVon/);
    });

    it('die Engine ist der EINZIGE Aufrufer von baueBeziehungen ausserhalb der Tests', () => {
        const { readdirSync, statSync } = require('node:fs');
        const dateien = [];
        const lauf = (dir) => { for (const n of readdirSync(dir)) { const q = dir + '/' + n; if (statSync(q).isDirectory()) { if (n !== 'test' && n !== 'node_modules') lauf(q); } else if (/\.(vue|js)$/.test(n)) dateien.push(q); } };
        lauf(WURZEL.replace(/\/$/, ''));
        const aufrufer = dateien.filter(d => !d.endsWith('services/Beziehungen.js') && readFileSync(d, 'utf8').includes('baueBeziehungen('));
        expect(aufrufer.map(d => d.replace(WURZEL, ''))).toEqual(['services/IfcEngine.js']);
    });
});
