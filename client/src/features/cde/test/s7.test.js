// @vitest-environment jsdom
/**
 * S7 — smooth und Nachbarn (Teil XVI, 2026-09-08).
 *
 * (b) Das Fachmodell sieht die LAGE: `setzeJournalStand({lagen})` verschiebt
 *     Achsen und Knoten gelieferter Bauteile um Δ gegen den Lieferstand.
 * (a) GEISTNETZ: beim Griff-Zug folgt das Bauteil selbst (Overlay-Netz), das
 *     Modell bleibt bis zum Loslassen.
 * (c) Kamera: mindestens 20° über der Waagerechten, sonst liegt jede
 *     Ziehebene auf der Kante.
 * (d) Rasterfang im Raum, Δ-Anzeige je Griff.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import * as THREE from 'three';
import { IfcEngine } from '../services/IfcEngine.js';
import { IfcOverlay, EBENEN } from '../services/IfcOverlay.js';
import { positionMitElevation, MINDEST_ELEVATION_GRAD } from '../services/IfcCamera.js';
import { RASTER_M, rasterFang, zugText } from '../services/Achszug.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useGriffe } from '../composables/useGriffe.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

describe('Das Fachmodell sieht die Lage (setzeJournalStand({lagen}))', () => {
    function engine() {
        const e = Object.create(IfcEngine.prototype);
        const achse = { globalId: 'H1', name: 'H1', anfang: { x: 0, y: 5, z: 0 }, ende: { x: 10, y: 4.9, z: 0 },
                        polyline: [{ x: 0, y: 5, z: 0 }, { x: 10, y: 4.9, z: 0 }], laenge: 10, gefaelle: 10, dn: 300, quelle: 'extrusion' };
        const knoten = { globalId: 'S1', name: 'S1', punkt: { x: 0, y: 5, z: 0 } };
        Object.assign(e, {
            _achsenRoh: new Map([['m1', new Map([[7, achse]])]]),
            _knotenRoh: new Map([['m1', new Map([[11, knoten]])]]),
            _gelaendeVerwerfen: () => {},
        });
        return e;
    }
    it('ein verschobenes Rohr steht in Achse und Strang dort, wo es steht — Länge und Gefälle bleiben', () => {
        const e = engine();
        e.setzeJournalStand({ lagen: new Map([['H1', { x: 3, y: 0, z: -2 }]]) });
        const a = e.achsenVon('m1').get(7);
        expect(a.anfang).toEqual({ x: 3, y: 5, z: -2 });
        expect(a.ende).toEqual({ x: 13, y: 4.9, z: -2 });
        expect(a.polyline[1]).toEqual({ x: 13, y: 4.9, z: -2 });
        expect(a.laenge).toBe(10);
        expect(a.gefaelle).toBe(10);
        // der Schacht ohne Lage bleibt DASSELBE Objekt (kein Klon auf Vorrat)
        expect(e.schachtPunkteVon('m1').get('S1')).toMatchObject({ x: 0, y: 5, z: 0 });
        expect(e._knoten.get('m1').get(11)).toBe(e._knotenRoh.get('m1').get(11));
    });
    it('ein verschobener Schacht: der Knoten folgt; Lage zurückgenommen (leer) → wieder der Lieferort', () => {
        const e = engine();
        e.setzeJournalStand({ lagen: new Map([['S1', { x: 0, y: 0, z: 8 }]]) });
        expect(e.schachtPunkteVon('m1').get('S1')).toMatchObject({ x: 0, y: 5, z: 8 });
        e.setzeJournalStand({ lagen: new Map() });
        expect(e.schachtPunkteVon('m1').get('S1')).toMatchObject({ x: 0, y: 5, z: 0 });
        expect(e.achsenVon('m1').get(7).anfang).toEqual({ x: 0, y: 5, z: 0 });
    });
    it('leseAchsen legt die ROHEN Achsen ab und leitet die wirksamen daraus ab (Textwächter)', () => {
        // Seit Teil XXIII A8 im IFC-Leser (`ifcleser/Achsen.js`, Engine-Diät B13).
        const src = lies('services/ifcleser/Achsen.js');
        const ab = src.indexOf('export async function leseAchsen(engine)');
        const rumpf = src.slice(ab, src.indexOf('\n}\n', ab));
        expect(rumpf).toContain('engine._achsenRoh.set(api.fragmentModelId, karte)');
        expect(rumpf).toContain('engine._knotenRoh.set(api.fragmentModelId, knoten)');
        expect(rumpf).toContain('engine._lagenAnwenden()');
        expect(rumpf).not.toMatch(/engine\._achsen\.set\(/);
        // Die Engine leitet weiter.
        expect(lies('services/IfcEngine.js')).toMatch(/leseAchsen\(\.\.\.a\) \{ return _ausgelagert_leseAchsen\(this, \.\.\.a\); \}/);
    });
    it('der Viewer reicht die Lagen als Δ gegen den eingefrorenen Lieferstand (Textwächter)', () => {
        const v = lies('components/IfcViewer.vue');
        const ab = v.indexOf('function entwerteNach');
        const rumpf = v.slice(ab, ab + 2500);
        expect(rumpf).toMatch(/wirksamerStand\('lage'\)/);
        expect(rumpf).toMatch(/nachspielen\.lieferstandVon\?\.\(gid\)/);
        expect(rumpf).toMatch(/setzeJournalStand\?\.\(\{\s*lagen,/);
    });
});

describe('Geistnetz im Overlay', () => {
    function overlay() {
        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera();
        cam.position.set(0, 50, 50);
        const o = new IfcOverlay({ getWorld: () => ({ scene: { three: scene }, camera: { three: cam } }) });
        return { o, scene };
    }
    const dreieck = { positions: new Float64Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), triCount: 1 };
    it('aufstellen, versetzen, leeren — die Ebene geist liegt zwischen Vorschau und Griffen', () => {
        const { o, scene } = overlay();
        expect(EBENEN.geist).toBeGreaterThan(EBENEN.vorschau);
        expect(EBENEN.geist).toBeLessThan(EBENEN.griffe);
        expect(o.zeigeGeist(dreieck, { farbe: '#0af' })).toBe(true);
        expect(o.hatGeist()).toBe(true);
        expect(o.geistVersetzen({ x: 2, y: 0, z: -1 })).toBe(true);
        const ebene = scene.getObjectByName('cde-overlay:geist');
        expect(ebene.children).toHaveLength(1);
        expect(ebene.children[0].position.toArray()).toEqual([2, 0, -1]);
        o.geistLeeren();
        expect(o.hatGeist()).toBe(false);
        expect(ebene.children).toHaveLength(0);
        expect(o.geistVersetzen({ x: 1, y: 1, z: 1 })).toBe(false);
    });
    it('ohne Netz kein Geist; ein zweiter Aufruf ersetzt den ersten', () => {
        const { o, scene } = overlay();
        expect(o.zeigeGeist({ positions: new Float64Array(0), triCount: 0 })).toBe(false);
        o.zeigeGeist(dreieck); o.zeigeGeist(dreieck);
        expect(scene.getObjectByName('cde-overlay:geist').children).toHaveLength(1);
    });
});

describe('Kamera: Mindest-Elevation', () => {
    it('ein waagerechter Blick wird auf 20° gehoben — Abstand und Grundriss-Richtung bleiben', () => {
        const p = positionMitElevation({ x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
        const abstand = Math.hypot(p.x, p.y, p.z);
        expect(abstand).toBeCloseTo(100, 6);
        expect(Math.atan2(p.y, Math.hypot(p.x, p.z)) * 180 / Math.PI).toBeCloseTo(MINDEST_ELEVATION_GRAD, 6);
        expect(p.z).toBeCloseTo(0, 9);
        expect(p.x).toBeGreaterThan(0);
    });
    it('ein Blick von schräg oben bleibt, wie er ist; von genau unten geht es über +x nach oben', () => {
        const oben = positionMitElevation({ x: 30, y: 40, z: 0 }, { x: 0, y: 0, z: 0 });
        expect(oben).toEqual({ x: 30, y: 40, z: 0 });
        const unten = positionMitElevation({ x: 0, y: -10, z: 0 }, { x: 0, y: 0, z: 0 });
        expect(unten.y).toBeGreaterThan(0);
        expect(Math.hypot(unten.x, unten.y, unten.z)).toBeCloseTo(10, 6);
    });
});

describe('Rasterfang und Δ-Text', () => {
    it('rasterFang rundet auf die Rasterweite, 0 tut nichts, und aus 0 wird kein −0', () => {
        expect(rasterFang({ x: 1.24, y: -0.26, z: 0.049 })).toEqual({ x: 1.2, y: -0.3, z: 0 });
        expect(Object.is(rasterFang({ x: -0.01, y: 0, z: 0 }).x, 0)).toBe(true);
        expect(rasterFang({ x: 1.24, y: 0, z: 0 }, 0)).toEqual({ x: 1.24, y: 0, z: 0 });
        expect(RASTER_M).toBe(0.1);
    });
    it('zugText mit Feldauswahl: ein XZ-Griff nennt Ost und Nord, ein Y-Griff die Höhe', () => {
        expect(zugText({ x: 1.2, y: 0.5, z: -3 }, null, { felder: ['ost', 'nord'] })).toBe('Ost +1.20 · Nord +3.00 m');
        expect(zugText({ x: 1.2, y: 0.5, z: -3 }, 'hoehe', { felder: ['hoehe'] })).toBe('▸ Höhe +0.50 m');
    });
});

describe('useGriffe am echten Store — Geist und Raster', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });
    const ROHR = {
        globalId: 'R1', modelId: 'm1', localId: 5, category: 'IFCPIPESEGMENT', name: 'R1',
        anker: { x: 2, y: 3, z: 1 }, auswahlpunkt: { x: 4, y: 3.2, z: 1 },
        lage: { ost: 1002, nord: -2001, hoehe: 303 }, versatz: { x: 1000, y: 0, z: 2000 }, hoehenversatz: 300, lageUmkehrbar: true,
    };
    function baue() {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const netz = { positions: new Float64Array(9), triCount: 1 };
        const e = {
            knotenGriffe: () => [], schachtAnschluesse: () => [],
            zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => 'bauteil:R1:ost'), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
            zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(),
            blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
            projectToScreen: ([x, , z]) => ({ x: x * 10, y: z * 10 }),
            pixelmass: () => 0.5,
            strahl: (x, y) => ({ origin: { x, y: 100, z: y }, direction: { x: 0, y: -1, z: 0 } }),
            geistLaden: vi.fn(async () => netz), zeigeGeist: vi.fn(() => true), geistVersetzen: vi.fn(), geistLeeren: vi.fn(),
        };
        const g = useGriffe({
            engine: ref(e), bearbeitung: b, aenderungen: ae,
            getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil, getBauform: () => b.einordnung?.bauform ?? null,
            getVersatz: () => ROHR.versatz, getHoehenversatz: () => 300, holeKnotenSubjekt: async () => null,
            lieferstandVon: () => ({ x: 2, y: 3, z: 1 }), nachBauen: vi.fn(async () => ({ angewandt: true })),
            farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
        });
        // Seit K5 (2026-09-20) stehen Griffe nur mit scharfem Werkzeug — hier
        // das des Bauteil-Griffs bzw. des Knotengriffs.
        // Knotengriffe sind subjektlos (alle Schächte), der Bauteil-Griff braucht eines.
        const scharf = (id = 'verschieben') => (id === 'schacht-verschieben'
            ? b.starte(id)
            : b.starte(id, b.bauteil ? {} : { subjekt: ROHR }));
        return { b, ae, e, g, scharf };
    }
    it('der Bauteil-Griff stellt beim Aufnehmen das Geistnetz auf, versetzt es je Bewegung und räumt es am Ende', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        t.scharf();
        await nextTick();
        t.g.greifen({ x: 4, y: 1, typ: 'mouse' });
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        await t.g.zug.value.geist;                                   // das Netz kommt asynchron
        expect(t.e.geistLaden).toHaveBeenCalledWith('m1', 5);
        expect(t.e.zeigeGeist).toHaveBeenCalledWith(expect.objectContaining({ triCount: 1 }), expect.objectContaining({ farbe: '#0af' }));
        t.g.zugBewegt({ x: 14.03, y: 1, px: { x: 140.3, y: 10 }, typ: 'mouse' });
        // Raster 0,10 m: 10,03 → 10,0
        expect(t.e.geistVersetzen).toHaveBeenLastCalledWith({ x: 10, y: 0, z: 0 });
        expect(t.b.werte.ost).toBe(1012);
        await t.g.zugEnde({ abbruch: true });
        expect(t.e.geistLeeren).toHaveBeenCalled();
    });
    it('auch der KNOTEN-Griff stellt das Geistnetz auf — die Musterschicht kennt nur „Knoten"', async () => {
        // A3 (Teil XXIII) benannte die Griffart von „schacht" in „knoten" um.
        // Die Liste der Geist-Arten stand dabei noch auf „schacht": der Zug an
        // einem Schacht hätte STILL keinen Geist mehr gezeigt, und kein Test
        // merkte es — gefunden hat es der Architektur-Wächter (W6). Dieser
        // Fall schliesst die Lücke.
        const t = baue();
        t.e.knotenGriffe = () => [{ globalId: 'S1', name: 'S1', modelId: 'm1', localId: 9,
                                    punkt: { x: 20, y: 0, z: 20 }, herkunft: 'geliefert' }];
        t.e.griffUnter = vi.fn(() => 'knoten:S1');
        await t.b.einordne(null, null);
        expect(t.scharf('schacht-verschieben')).toBe(true);
        t.g.neuBauen?.();
        await nextTick();
        expect(t.g.griffe.value.some(g => g.key === 'knoten:S1' && g.art === 'knoten')).toBe(true);
        t.g.greifen({ x: 200, y: 200, typ: 'mouse' });
        t.g.zugStart({ x: 200, y: 200, px: { x: 200, y: 200 }, typ: 'mouse' });
        await t.g.zug.value?.geist;
        expect(t.e.geistLaden).toHaveBeenCalledWith('m1', 9);
        await t.g.zugEnde({ abbruch: true });
    });
    it('Alt lässt das Raster frei', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        t.scharf();
        await nextTick();
        t.g.greifen({ x: 4, y: 1, typ: 'mouse' });
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 14.03, y: 1, px: { x: 140.3, y: 10 }, typ: 'mouse', altKey: true });
        expect(t.e.geistVersetzen).toHaveBeenLastCalledWith(expect.objectContaining({ x: expect.closeTo(10.03, 6) }));
        await t.g.zugEnde({ abbruch: true });
    });
});
