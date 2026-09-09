/**
 * Grabenregeln nach Norm (Teil XVII, B3) — die Zahlen aus der Fachbibliothek
 * (DIN EN 1610:2015-12 Tab. 1/2, 7.2 · DIN 4124:2012-01 4.2), als Datensatz
 * mit Herkunft; die Funktionen darauf: Sohlbreite (grösserer Wert beider
 * Tabellen), Wand nach Bodenklasse, Baugrube, Befunde (beraten, nicht
 * verbieten).
 */
import { describe, expect, it } from 'vitest';
import { GRABENREGELN, WANDFORMEN, BODENKLASSEN, wandFuer, grabenbreite, baugrubenmass, rechteckUmriss, baugrubenRichtung, pruefeGraben, schaechteAnKanten } from '../services/gelaende/Grabenregeln.js';
import { baugrube, formeNach, gerinne } from '../services/gelaende/Operationen.js';

describe('Der Datensatz', () => {
    it('trägt seine Herkunft und die fünf DN-Zeilen der Tabelle 1', () => {
        expect(GRABENREGELN.quelle).toMatch(/DIN EN 1610:2015-12/);
        expect(GRABENREGELN.quelle).toMatch(/DIN 4124:2012-01/);
        expect(GRABENREGELN.breiteNachDn.map(z => [z.bisDn, z.verbaut, z.steil, z.flach])).toEqual([
            [225, 0.40, 0.40, 0.40], [350, 0.50, 0.50, 0.40], [700, 0.70, 0.70, 0.40], [1200, 0.85, 0.85, 0.40], [Infinity, 1.00, 1.00, 0.40],
        ]);
        expect(GRABENREGELN.breiteNachTiefe.map(z => [z.bisTiefe, z.breite])).toEqual([[1.00, 0], [1.75, 0.80], [4.00, 0.90], [Infinity, 1.00]]);
        expect(GRABENREGELN.bettung).toEqual({ ueblich: 0.10, fels: 0.15 });
        expect(GRABENREGELN.senkrechtOhneVerbauBisM).toBe(1.25);
        expect(GRABENREGELN.boeschungswinkel).toEqual({ nichtbindig: 45, bindigSteif: 60, fels: 80 });
        expect(GRABENREGELN.arbeitsraumBaugrube).toEqual({ geboescht: 0.50, verbaut: 0.60 });
        expect(Object.keys(WANDFORMEN)).toEqual(['verbau', 'boeschung', 'senkrecht']);
        expect(Object.keys(BODENKLASSEN)).toEqual(['nichtbindig', 'bindigSteif', 'fels']);
    });
});

describe('wandFuer', () => {
    it('verbaut und senkrecht: n = 0, 90°', () => {
        expect(wandFuer({ wandform: 'verbau' })).toMatchObject({ n: 0, winkelGrad: 90 });
        expect(wandFuer({ wandform: 'senkrecht' })).toMatchObject({ n: 0, winkelGrad: 90 });
    });
    it('Böschung aus der Bodenklasse: 45° ⇒ 1:1, 60° ⇒ 1:0,577, 80° ⇒ 1:0,176', () => {
        expect(wandFuer({ wandform: 'boeschung', boden: 'nichtbindig' })).toMatchObject({ n: 1, winkelGrad: 45, zulaessigGrad: 45 });
        expect(wandFuer({ wandform: 'boeschung', boden: 'bindigSteif' }).n).toBeCloseTo(0.577, 3);
        expect(wandFuer({ wandform: 'boeschung', boden: 'fels' }).n).toBeCloseTo(0.176, 3);
    });
    it('ein eigener Winkel überstimmt die Bodenklasse — und wird als eigener Wert benannt', () => {
        const w = wandFuer({ wandform: 'boeschung', boden: 'nichtbindig', winkelGrad: 70 });
        expect(w.winkelGrad).toBe(70);
        expect(w.n).toBeCloseTo(0.364, 3);
        expect(w.grund).toMatch(/eigener Wert/);
        expect(w.zulaessigGrad).toBe(45);
    });
});

describe('grabenbreite — der grössere Wert aus Tabelle 1 und Tabelle 2', () => {
    const verbaut = wandFuer({ wandform: 'verbau' });
    it('DN 300 verbaut, flach (< 1 m): OD 0,30 + 0,50 = 0,80 (Tab. 1)', () => {
        const g = grabenbreite({ dn: 300, tiefe: 0.9, wand: verbaut });
        expect(g.sohlbreite).toBeCloseTo(0.80, 9);
        expect(g).toMatchObject({ spalte: 'verbaut', ausDn: 0.80, ausTiefe: 0 });
        expect(g.hinweise).toContain('OD = DN (Wanddicke unbekannt)');
    });
    it('DN 200 verbaut in 2 m Tiefe: Tab. 1 gäbe 0,60, Tab. 2 verlangt 0,90', () => {
        const g = grabenbreite({ dn: 200, tiefe: 2.0, wand: verbaut });
        expect(g.sohlbreite).toBeCloseTo(0.90, 9);
        expect(g.grund).toMatch(/nach Tiefe/);
    });
    it('DN 500 unverbaut: steil (> 60°) wie verbaut 1,20; flach (≤ 60°) nur OD + 0,40 = 0,90', () => {
        expect(grabenbreite({ dn: 500, wand: wandFuer({ wandform: 'boeschung', boden: 'fels' }) })).toMatchObject({ spalte: 'steil', sohlbreite: 1.20 });
        expect(grabenbreite({ dn: 500, wand: wandFuer({ wandform: 'boeschung', boden: 'nichtbindig' }) })).toMatchObject({ spalte: 'flach', sohlbreite: 0.90 });
    });
    it('die Wanddicke macht aus DN den OD: DN 300, s = 10 mm ⇒ OD 0,32 ⇒ 0,82', () => {
        const g = grabenbreite({ dn: 300, wanddickeMm: 10, wand: verbaut });
        expect(g.od).toBeCloseTo(0.32, 9);
        expect(g.sohlbreite).toBeCloseTo(0.82, 9);
        expect(g.hinweise).toEqual([]);
    });
    it('DN 1500 verbaut: OD + 1,00; über 4 m Tiefe mindestens 1,00 — hier gewinnt der DN (2,50)', () => {
        expect(grabenbreite({ dn: 1500, tiefe: 4.5, wand: verbaut }).sohlbreite).toBeCloseTo(2.50, 9);
    });
    it('eine eigene Sohlbreite gilt — unter der Norm wird sie gemeldet, nicht verboten', () => {
        const g = grabenbreite({ dn: 300, tiefe: 2, wand: verbaut, eigene: 0.6 });
        expect(g.sohlbreite).toBe(0.6);
        expect(g.hinweise.some(h => /unter der Mindestbreite 0\.90 m/.test(h))).toBe(true);
        expect(grabenbreite({ dn: 300, wand: verbaut, eigene: 1.5 }).hinweise.filter(h => /Mindestbreite/.test(h))).toEqual([]);
    });
});

describe('Baugrube und Befunde', () => {
    it('Schacht 1,00 m: ECKIG — verbaut Kantenlänge 1,00 + 2 · 0,60 = 2,20; geböscht 2,00', () => {
        expect(baugrubenmass({ aussenmass: 1.0, wand: wandFuer({ wandform: 'verbau' }) })).toMatchObject({ arbeitsraum: 0.6, seite: 2.2, laenge: 2.2, breite: 2.2, halb: 1.1 });
        expect(baugrubenmass({ aussenmass: 1.0, wand: wandFuer({ wandform: 'boeschung' }) })).toMatchObject({ arbeitsraum: 0.5, seite: 2.0 });
        expect(baugrubenmass({ aussenDm: 1.5 }).seite).toBeCloseTo(2.7, 9);     // alter Name bleibt lesbar
        // Der Umriss: vier Ecken, Länge entlang der Richtung.
        const r = rechteckUmriss({ x: 10, z: 20 }, 4, 2, { x: 0, z: 1 });
        expect(r).toHaveLength(4);
        expect(r.map(p => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100])).toEqual([[11, 18], [11, 22], [9, 22], [9, 18]]);
        expect(rechteckUmriss({ x: 0, z: 0 }, 2, 2)[0]).toEqual({ x: -1, z: -1 });
        // Die Richtung: entlang der Haltung, die am Knoten hängt.
        const kanten = [{ anfang: { x: 0, y: 1, z: 0 }, ende: { x: 30, y: 0, z: 40 } }];
        expect(baugrubenRichtung({ x: 30, z: 40 }, kanten)).toEqual({ x: 30, z: 40 });
        expect(baugrubenRichtung({ x: 0, z: 0 }, kanten)).toEqual({ x: 30, z: 40 });
        expect(baugrubenRichtung({ x: 5, z: 5 }, kanten)).toBeNull();
    });
    it('senkrecht ohne Verbau tiefer als 1,25 m ist ein Befund; verbaut nicht; eine zu steile Böschung auch', () => {
        expect(pruefeGraben({ wand: wandFuer({ wandform: 'senkrecht' }), tiefeMax: 1.8 }).map(b => b.regel)).toEqual(['graben_senkrecht_ohne_verbau']);
        expect(pruefeGraben({ wand: wandFuer({ wandform: 'senkrecht' }), tiefeMax: 1.2 })).toEqual([]);
        expect(pruefeGraben({ wand: wandFuer({ wandform: 'verbau' }), tiefeMax: 5 })).toEqual([]);
        expect(pruefeGraben({ wand: wandFuer({ wandform: 'boeschung', boden: 'nichtbindig', winkelGrad: 70 }), tiefeMax: 2 }).map(b => b.regel)).toEqual(['boeschung_zu_steil']);
        expect(pruefeGraben({ wand: wandFuer({ wandform: 'boeschung', boden: 'fels', winkelGrad: 70 }), tiefeMax: 2 })).toEqual([]);
    });
    it('schaechteAnKanten: nur Knoten auf einem Rohrende', () => {
        const kanten = [{ anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 } }, { anfang: { x: 50, y: 9, z: 0 }, ende: { x: 100, y: 8, z: 0 } }];
        const knoten = [{ globalId: 'S1', punkt: { x: 0, y: 10, z: 0 } }, { globalId: 'S2', punkt: { x: 50, y: 9, z: 0 } }, { globalId: 'SX', punkt: { x: 70, y: 9, z: 0 } }, { globalId: 'S3', punkt: { x: 100, y: 8, z: 0.0005 } }];
        expect(schaechteAnKanten(kanten, knoten).map(s => s.globalId)).toEqual(['S1', 'S2', 'S3']);
    });
});

describe('Die Operation baugrube — eckig und schneidend', () => {
    function raster(h = 12) {
        const nx = 21, nz = 21, cell = 1;
        return { x0: 0, z0: 0, maxX: 20, maxZ: 20, cell, nx, nz, heights: Float64Array.from({ length: nx * nz }, () => h) };
    }
    it('senkrecht: das Quadrat 2,2 m auf die Sohle — auch die ECKE; aussen unberührt; zweimal angewandt ändert nichts', () => {
        const r1 = baugrube(raster(), { mitte: { x: 10, z: 10 }, laenge: 2.2, breite: 2.2, sohle: 9, neigung: 0 });
        const h = (r, x, z) => r.heights[x * 21 + z];
        expect(h(r1.raster, 10, 10)).toBe(9);
        expect(h(r1.raster, 11, 10)).toBe(9);
        expect(h(r1.raster, 11, 11)).toBe(9);          // die Ecke — rund läge sie bei 1,41 m draussen
        expect(h(r1.raster, 12, 10)).toBe(12);
        expect(r1.warnungen).toEqual([]);
        const r2 = baugrube(r1.raster, { mitte: { x: 10, z: 10 }, laenge: 2.2, breite: 2.2, sohle: 9, neigung: 0 });
        expect([...r2.raster.heights]).toEqual([...r1.raster.heights]);
    });
    it('gedreht: Länge 6 entlang der Diagonale — der Punkt auf der Diagonale liegt drin, der achsparallele nicht', () => {
        const r = baugrube(raster(), { mitte: { x: 10, z: 10 }, laenge: 6, breite: 1, richtung: { x: 1, z: 1 }, sohle: 9, neigung: 0 });
        const h = (x, z) => r.raster.heights[x * 21 + z];
        expect(h(12, 12)).toBe(9);      // 2,83 m entlang der Diagonale (< 3)
        expect(h(12, 10)).toBe(12);     // quer 1,41 m > 0,5
    });
    it('geböscht 1:1: aussen steigt die Sohle je Meter um einen Meter, bis sie das Gelände erreicht', () => {
        const r = baugrube(raster(), { mitte: { x: 10, z: 10 }, laenge: 2, breite: 2, sohle: 9, neigung: 1 });
        const h = (x, z) => r.raster.heights[x * 21 + z];
        expect(h(10, 10)).toBe(9);
        expect(h(12, 10)).toBe(10);       // 1 m ausserhalb des Radius
        expect(h(13, 10)).toBe(11);
        expect(h(14, 10)).toBe(12);       // erreicht das Gelände
        expect(h(15, 10)).toBe(12);
    });
    it('füllt nie auf: ein tieferes Gerinne daneben bleibt tiefer', () => {
        const mitGerinne = gerinne(raster(), { achse: [{ x: 0, z: 10 }, { x: 20, z: 10 }], sohlbreite: 1, boeschung: 0, sohleAnfang: 8, sohleEnde: 8 }).raster;
        const r = formeNach(mitGerinne, [{ art: 'baugrube', parameter: { mitte: { x: 10, z: 10 }, laenge: 2.2, breite: 2.2, sohle: 9, neigung: 0 } }]);
        expect(r.raster.heights[10 * 21 + 10]).toBe(8);
        expect(r.warnungen).toEqual([]);
    });
    it('ohne Mitte, Mass oder Sohle: gemeldet, unverändert — ein alter `radius` wird als Quadrat gelesen', () => {
        expect(baugrube(raster(), { laenge: 2, sohle: 9 }).warnungen).toEqual(['baugrube_ohne_mitte']);
        expect(baugrube(raster(), { mitte: { x: 1, z: 1 }, sohle: 9 }).warnungen).toEqual(['baugrube_ohne_mass']);
        expect(baugrube(raster(), { mitte: { x: 1, z: 1 }, laenge: 2 }).warnungen).toEqual(['baugrube_ohne_sohle']);
        const alt = baugrube(raster(), { mitte: { x: 10, z: 10 }, radius: 1.1, sohle: 9 });
        expect(alt.raster.heights[11 * 21 + 11]).toBe(9);
    });
});
