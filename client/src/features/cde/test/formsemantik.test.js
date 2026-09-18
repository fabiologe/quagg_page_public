/**
 * Formsemantik (Teil XXIII, A9a — Befund B19): die Formen sagen, was ihre
 * Zahlen bedeuten.
 *
 * Vorher musste jeder Leser raten: ist das y eines Knotens die Sohle oder die
 * Platzierung? Misst dieser Körper gewachsenen oder verdichteten Boden? Ist
 * das Raster das Gelände vor dem Vorgang oder danach? Jetzt steht es an der
 * Form, gesetzt dort, wo die Form entsteht, und `pruefeForm` kennt die Werte.
 *
 * Geprüft wird über die ECHTEN Wege: das Rezept (`formAus`), die Engine
 * (`_knotenMitUnterkante`), der Ableitungslauf (`baue`) und der Kanalgraben,
 * der die Knotensohle liest.
 */
import { describe, expect, it, vi } from 'vitest';
import { BEDEUTUNGEN, pruefeForm } from '../services/geometrie/Formen.js';
import { kreisProfil, rechteckProfil, trapezProfil } from '../services/geometrie/hilfen.js';
import { REZEPTE, ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { IfcEngine } from '../services/IfcEngine.js';
import { knotensohle } from '../services/Achsbezug.js';
import { neuerAbleitungslauf, mengenartVon } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

function engineMit({ knoten = new Map(), huelle = null } = {}) {
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        _achsen: new Map(), _knoten: knoten, _cdeKnoten: new Map(),
        autor: { huellenVon: vi.fn(async (_m, ids) => new Map(huelle ? ids.map(id => [id, huelle]) : [])) },
    });
    return e;
}

function gelaende(h = (x, z) => 300 + 0.02 * x - 0.01 * z, n = 40) {
    const t = [];
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const standAus = (...listen) => new Map(listen.flat().map(s => [s.globalId, s.nachher]));

describe('1 — der Vertrag kennt die Werte, und nur sie', () => {
    it('ein unbekannter Wert wird mit Feld und erlaubten Werten gemeldet; ein fehlendes Feld nicht', () => {
        const proben = {
            knoten: { x: 1, y: 2, z: 3 },
            koerper: { positions: new Float64Array(9), triCount: 1, closed: true, volumen: 1 },
            raster: { x0: 0, z0: 0, maxX: 1, maxZ: 1, cell: 1, nx: 2, nz: 2, heights: new Float64Array(4) },
            linie: { punkte: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
            profil: { punkte: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }] },
            platte: { umriss: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], dicke: 0.2 },
        };
        for (const [form, felder] of Object.entries(BEDEUTUNGEN)) {
            expect(pruefeForm(proben[form], form), `${form} ohne Bedeutung`).toEqual([]);
            for (const [feld, werte] of Object.entries(felder)) {
                for (const w of werte) expect(pruefeForm({ ...proben[form], [feld]: w }, form), `${form}.${feld}=${w}`).toEqual([]);
                const fehler = pruefeForm({ ...proben[form], [feld]: 'erfunden' }, form);
                expect(fehler, `${form}.${feld}`).toHaveLength(1);
                expect(fehler[0]).toContain(`${form}.${feld}`);
                expect(fehler[0]).toContain(werte[0]);
            }
        }
    });

    it('die Platte ist eine Form: Umriss ≥ 3 Punkte mit Höhe, Dicke > 0', () => {
        expect(pruefeForm({ umriss: [{ x: 0, y: 0, z: 0 }], dicke: 0.2 }, 'platte')[0]).toContain('≥ 3');
        expect(pruefeForm({ umriss: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: NaN, z: 1 }], dicke: 0.2 }, 'platte')[0]).toContain('x/y/z');
        expect(pruefeForm({ umriss: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }], dicke: 0 }, 'platte')[0]).toContain('dicke');
    });

    it('Unter- und Oberkante eines Knotens müssen Zahlen sein', () => {
        expect(pruefeForm({ x: 1, y: 2, z: 3, oberkante: 'hoch' }, 'knoten')[0]).toContain('oberkante');
    });
});

describe('2 — der Knoten sagt, was sein y ist', () => {
    it('ein EIGENER Schacht steht mit y auf seiner Sohle, der Deckel ist die Oberkante', () => {
        const k = REZEPTE.schacht.formAus({ punkte: [[5, 102, 7], [5, 98.5, 7]], dn: 1000, name: 'S9' }, 'knoten');
        expect(k).toMatchObject({ y: 98.5, unterkante: 98.5, oberkante: 102, hoehenbezug: 'sohle' });
        expect(pruefeForm(k, 'knoten')).toEqual([]);
        expect(knotensohle(k)).toEqual({ y: 98.5, belegt: true });
    });

    it('ein GELIEFERTER Schacht steht mit y auf seiner Platzierung — ohne Hülle ist die Sohle nicht belegt', async () => {
        const knoten = new Map([['m1', new Map([[1, { globalId: 'S2', name: 'S2', punkt: { x: 5, y: 100, z: 7 } }]])]]);
        const k = await engineMit({ knoten })._knotenMitUnterkante('S2');
        expect(k).toMatchObject({ y: 100, hoehenbezug: 'platzierung' });
        expect(k.unterkante).toBeUndefined();
        expect(pruefeForm(k, 'knoten')).toEqual([]);
        expect(knotensohle(k)).toEqual({ y: 100, belegt: false });
        // Dieselbe Zahl ohne Angabe: auch nicht belegt (vorher war das der stumme Normalfall).
        expect(knotensohle({ x: 5, y: 100, z: 7 }).belegt).toBe(false);
    });

    it('mit Hülle belegen Unter- und Oberkante die Sohle und den Deckel', async () => {
        const knoten = new Map([['m1', new Map([[1, { globalId: 'S2', name: 'S2', punkt: { x: 5, y: 100, z: 7 } }]])]]);
        const e = engineMit({ knoten, huelle: { unterkante: 97.2, oberkante: 100.4 } });
        // Ein geladenes Modell, das die Kennung kennt — der echte Weg über die Kennungskarte.
        const modell = { modelId: 'm1', getLocalIdsByGuids: async (g) => g.map(x => (x === 'S2' ? 1 : null)) };
        e.components = { get: () => ({ list: new Map([['m1', modell]]) }) };
        const k = await e._knotenMitUnterkante('S2');
        expect(e.autor.huellenVon).toHaveBeenCalledWith('m1', [1]);
        expect(k).toMatchObject({ y: 100, hoehenbezug: 'platzierung', unterkante: 97.2, oberkante: 100.4 });
        expect(pruefeForm(k, 'knoten')).toEqual([]);
        expect(knotensohle(k)).toEqual({ y: 97.2, belegt: true });
    });
});

describe('3 — Profile und Platten sagen, was sie sind', () => {
    it('Kreis mit Nennmass, Rechteck, Trapez — und sie bleiben gültige Profile', () => {
        expect(kreisProfil(0.2)).toMatchObject({ art: 'kreis', nennmass: 400 });
        expect(rechteckProfil(1, 0.5).art).toBe('rechteck');
        expect(trapezProfil({ sohlbreite: 1, hoehe: 1, boeschung: 1 }).art).toBe('trapez');
        for (const p of [kreisProfil(0.2), rechteckProfil(1, 0.5), trapezProfil()]) expect(pruefeForm(p, 'profil')).toEqual([]);
    });

    it('das Plattenrezept liefert die Form platte: Umriss, Dicke (sonst die Vorgabe), Richtung', () => {
        const punkte = [[0, 10, 0], [4, 10, 0], [4, 10, 3], [0, 10, 3]];
        const p = REZEPTE.platte.formAus({ punkte, dicke: 0.3 }, 'platte');
        expect(p).toMatchObject({ dicke: 0.3, richtung: 'unten' });
        expect(p.umriss).toHaveLength(4);
        expect(pruefeForm(p, 'platte')).toEqual([]);
        expect(REZEPTE.platte.formAus({ punkte }, 'platte').dicke).toBe(0.2);
        // Ein Rohr ist keine Platte.
        expect(REZEPTE.rohr.formAus({ punkte: [[0, 0, 0], [5, 0, 0]], dn: 300 }, 'platte')).toBeNull();
    });
});

describe('4 — Körper und Raster aus dem Ableitungslauf', () => {
    const urRaster = (cell = 1) => rasterAusMesh({ mesh: gelaende() }, { cell }).ergebnis;
    const holeQuellForm = async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster' ? urRaster(cell ?? 1) : null);
    const GERINNE = { art: 'gerinne', parameter: { achse: [{ x: 5, z: 10 }, { x: 35, z: 10 }], sohlbreite: 2, boeschung: 1.5, sohleAnfang: 598, sohleEnde: 597.5 } };
    const AUFTRAG = { art: 'planum', parameter: { umriss: [{ x: 15, z: 5 }, { x: 25, z: 5 }, { x: 25, z: 15 }, { x: 15, z: 15 }], hoehe: 602 } };
    const vorgang = (ops) => ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: ops, name: 'Ur' });
    const anzeige = (vorgaenge) => ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: [] })
        .map(s => ({ ...s, nachher: { ...s.nachher, parameter: { ...s.nachher.parameter, vorgaenge } } }));

    it('die Mengenart kommt aus der Mengen-Deklaration des Teils, nicht aus dem Rezeptnamen', () => {
        expect(mengenartVon({ menge: { undisturbedVolume: 'a', looseVolume: 'b' } })).toBe('gewachsen');
        expect(mengenartVon({ menge: { compactedVolume: 'a' } })).toBe('verdichtet');
        expect(mengenartVon({ menge: { looseVolume: 'a' } })).toBe('lose');
        expect(mengenartVon({ menge: { length: 'l' } })).toBeNull();
        expect(mengenartVon(null)).toBeNull();
    });

    it('Aushub misst gewachsen, Auftrag verdichtet — am gebauten Körper, geprüft', async () => {
        const A = vorgang([GERINNE]), B = vorgang([AUFTRAG]);
        const Z = anzeige([{ ableitung: A[0].nachher.ableitung, titel: 'A', art: 'erdbau' }, { ableitung: B[0].nachher.ableitung, titel: 'B', art: 'erdbau' }]);
        const l = neuerAbleitungslauf({ stand: standAus(A, B, Z), rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        const cut = await l.baue(A.find(s => s.nachher.rolle === 'aushub').globalId);
        const fill = await l.baue(B.find(s => s.nachher.rolle === 'auftrag').globalId);
        expect(cut.teil.daten).toMatchObject({ mengenart: 'gewachsen', rolle: 'aushub', closed: true });
        expect(fill.teil.daten).toMatchObject({ mengenart: 'verdichtet', rolle: 'auftrag' });
        expect(pruefeForm(cut.teil.daten, 'koerper')).toEqual([]);
        // Wer die Form später holt, bekommt dieselbe Aussage.
        const wieder = await l.formVon(A.find(s => s.nachher.rolle === 'aushub').globalId, 'koerper');
        expect(wieder?.daten?.mengenart ?? wieder?.mengenart).toBe('gewachsen');
        // Die Anzeige ist das Gelände nach ALLEN Vorgängen und sagt es.
        const anz = await l.baue(Z[0].globalId);
        expect(anz.teil.daten.stand).toBe('anzeige');
        expect(pruefeForm(anz.teil.daten, 'raster')).toEqual([]);
    });

    it('ein Vorgang sieht das Gelände VOR sich, das Ur als Ur — die Präfix-Caches bleiben unberührt', async () => {
        const gesehen = [];
        const spion = (id) => {
            const r = rezeptNach(id);
            if (id !== 'erdbau') return r;
            return { ...r, leite: async (p, q, ctx) => {
                gesehen.push({ vorher: q.gelaende?.stand, ur: ctx?.stapel?.urRaster?.stand });
                return r.leite(p, q, ctx);
            } };
        };
        const A = vorgang([GERINNE]), B = vorgang([AUFTRAG]);
        const Z = anzeige([{ ableitung: A[0].nachher.ableitung, titel: 'A', art: 'erdbau' }, { ableitung: B[0].nachher.ableitung, titel: 'B', art: 'erdbau' }]);
        const l = neuerAbleitungslauf({ stand: standAus(A, B, Z), rezeptNach: spion, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
        await l.baue(B[0].globalId);
        // B faltet A als Vorgänger mit — jeder Aufruf sieht „vorher" und „ur".
        expect(gesehen.length).toBeGreaterThanOrEqual(1);
        for (const g of gesehen) expect(g).toEqual({ vorher: 'vorher', ur: 'ur' });
    });
});

describe('5 — der Kanalgraben liest die Knotensohle und sagt, wenn sie nicht belegt ist', () => {
    const P = (x, y, z) => ({ x, y, z });
    const H1 = { anfang: P(5, 297.5, 20), ende: P(35, 297.0, 20) };
    function holeMit(hoehenbezug) {
        return async (gid, form, { cell, bereich = null } = {}) => {
            if (gid === 'DGM1' && form === 'raster') return rasterAusMesh({ mesh: gelaende(() => 300, 80) }, { cell: cell ?? 1, bereich }).ergebnis;
            if (gid === 'H1' && form === 'linie') return { punkte: [H1.anfang, H1.ende], dn: 300 };
            // S1 am Rohranfang, SX fern jeder Haltung (keine Anschlusssohle).
            if (gid === 'S1' && form === 'knoten') return { ...P(5, 297.5, 20), name: 'S1', hoehenbezug };
            if (gid === 'SX' && form === 'knoten') return { ...P(60, 297, 5), name: 'SX', hoehenbezug };
            return null;
        };
    }
    async function lauf(hoehenbezug) {
        const op = [{ art: 'kanalgraben', parameter: { umfang: 'strang', wandform: 'verbau', boden: 'nichtbindig', winkelGrad: null, wanddickeMm: 0, breite: null, bettung: 0.1, schachtMass: 1.0, dn: null } }];
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohre: ['H1'], schaechte: ['S1', 'SX'], gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: op, name: 'G' });
        const Z = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
        const l = neuerAbleitungslauf({ stand: standAus(schritte, Z), rezeptNach, holeQuellForm: holeMit(hoehenbezug), kernel: erzeugeKernel() });
        const r = await l.baue(schritte[0].globalId);
        expect(l.misserfolge).toEqual([]);
        return { r, a: l.ableitungen.get(schritte[0].nachher.ableitung) };
    }

    it('geliefert (Platzierung) und fern jeder Haltung → Hinweis mit dem Schachtnamen; der Schacht am Rohr braucht keinen', async () => {
        const { a } = await lauf('platzierung');
        const h = a.befunde.filter(b => b.regel === 'schachtsohle_unbelegt');
        expect(h).toHaveLength(1);
        expect(h[0].text).toContain('SX');
        expect(h[0].schwere).toBe('hinweis');
    });

    it('ein Knoten, der seine Sohle nennt, bleibt ohne Hinweis — und die Baugrube rechnet gleich', async () => {
        const mit = await lauf('platzierung');
        const ohne = await lauf('sohle');
        expect(ohne.a.befunde.filter(b => b.regel === 'schachtsohle_unbelegt')).toEqual([]);
        // Dieselbe Zahl, nur ehrlicher gesagt: die Massen ändern sich nicht.
        expect(ohne.a.kennzahlen.aushubRaster).toBeCloseTo(mit.a.kennzahlen.aushubRaster, 9);
    });
});
