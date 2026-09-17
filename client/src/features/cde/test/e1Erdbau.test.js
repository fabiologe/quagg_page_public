/**
 * E1 — Einschneiden, Auffüllen, Ausgraben als eigene Werkzeuge (Teil XIX).
 *
 * FABIOS VORGABE, und sie ist der erste Test hier: **es gehen keine Daten
 * verloren.** Das gelieferte Gelände wird weder verändert noch gelöscht,
 * sondern ausgeblendet — und die Subtraktion entsteht als EIGENES
 * IFC-Element (`IfcEarthworksCut`), der Körper zwischen altem und neuem
 * Gelände. Dazu ein neues TERRAIN als Oberfläche. Was der Planer geliefert
 * hat, bleibt Bit für Bit erhalten (Gesetz 8, ISO 19650).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { weltAusNn } from '../services/Hoehenbezug.js';

const b = (id) => nachId(id);
const wurzel = new URL('..', import.meta.url);
const lies = (p) => readFileSync(new URL(p, wurzel), 'utf8');

/** Ein geliefertes Gelände, wie der Viewer es ans Subjekt hängt. */
const GELAENDE = (extra = {}) => ({
    globalId: 'DGM-1', modelId: 'netz.ifc', localId: 42, name: 'Urgelände',
    hoehenversatz: 300, quellmass: { pruefmass: { triCount: 900, spanX: 200, spanY: 12, spanZ: 200 }, cell: 0.5 },
    ...extra,
});
/** Ein gezeichneter Umriss AUF dem Gelände — y kommt aus dem Sampler (Welt). */
const UMRISS = (y = 4) => [
    { x: 0, y, z: 0 }, { x: 20, y, z: 0 }, { x: 20, y, z: 20 }, { x: 0, y, z: 20 },
];

describe('Keine Daten verlieren — die Vorgabe als Vertrag', () => {
    it('das gelieferte Gelände wird AUSGEBLENDET, nicht gelöscht', () => {
        const schritte = b('graben-ausheben').anwenden(GELAENDE(), { mass: 2, neigung: 1.5 }, { zug: UMRISS() });
        const weg = schritte.filter(s => s.art === 'geloescht');
        expect(weg).toHaveLength(1);
        expect(weg[0]).toMatchObject({ globalId: 'DGM-1', nachher: true });
        // KEIN `modell: 'cde'` — das hiesse „aus dem Neuaufbau nehmen". Ein
        // geliefertes Bauteil wird nur verborgen, und der Autor macht daraus
        // ausdrücklich ein Ausblenden statt eines `deleteElements`.
        expect(weg[0].modell).toBeUndefined();
        expect(lies('services/IfcAutor.js')).toMatch(/deleteElements` ist NICHT zurücknehmbar/);
    });

    it('die Subtraktion wird ein EIGENES IFC-Element — Cut und Fill; das TERRAIN ist die eine Anzeige, kein Export', () => {
        const teile = ABLEITUNGEN.erdbau.teile;
        // Stufe 1: KEIN dgm-Teil mehr je Vorgang — die geformte Fläche ist die
        // Anzeige des Ur-Geländes (Rezept `anzeige`, export: false).
        expect(teile.map(t => t.rolle)).toEqual(['aushub', 'auftrag']);
        expect(teile.map(t => t.kategorie)).toEqual(['IFCEARTHWORKSCUT', 'IFCEARTHWORKSFILL']);
        // Ein Aushub mit Planum ist eine EXCAVATION, ein reines Gerinne ein TRENCH.
        const art = teile[0].predefinedType;
        expect(art({ operationen: [{ art: 'planum' }] })).toBe('EXCAVATION');
        expect(art({ operationen: [{ art: 'gerinne' }] })).toBe('TRENCH');
        expect(ABLEITUNGEN.anzeige.teile).toEqual([expect.objectContaining({ rolle: 'anzeige', kategorie: 'IFCGEOGRAPHICELEMENT', predefinedType: 'TERRAIN', export: false })]);
    });

    it('zwei neue Bauteile mit eigenen GlobalIds in EINER Klammer, dazu die Anzeige — EIN Vorgang', () => {
        const schritte = b('graben-ausheben').anwenden(GELAENDE(), { mass: 2 }, { zug: UMRISS() });
        const neu = schritte.filter(s => s.art === 'erzeugt');
        expect(neu).toHaveLength(3);
        expect(new Set(neu.map(s => s.globalId)).size).toBe(3);
        expect(neu.every(s => s.globalId !== 'DGM-1')).toBe(true);
        expect(neu.every(s => s.modell === 'cde')).toBe(true);
        // Alle nennen dieselbe Quelle — das Ur-Gelände bleibt der Bezug.
        expect(neu.every(s => s.nachher.parameter.quellen.gelaende === 'DGM-1')).toBe(true);
        const bauteile = neu.filter(s => s.nachher.rezept === 'erdbau');
        expect(bauteile.map(s => s.nachher.rolle)).toEqual(['aushub', 'auftrag']);
        expect(new Set(bauteile.map(s => s.nachher.ableitung)).size).toBe(1);
        const anzeige = neu.find(s => s.nachher.rezept === 'anzeige');
        expect(anzeige.nachher.parameter.vorgaenge).toEqual([{ ableitung: bauteile[0].nachher.ableitung, art: 'erdbau', titel: 'Urgelände · Ausheben' }]);
    });

    it('gespeichert wird die QUELLE samt Operationsliste, nie ein gerechnetes Raster', () => {
        const schritte = b('graben-ausheben').anwenden(GELAENDE(), { mass: 2, neigung: 1.5 }, { zug: UMRISS() });
        const neu = schritte.filter(s => s.art === 'erzeugt' && s.nachher.rezept === 'erdbau');
        const p = neu[0].nachher.parameter;
        // `auflockerung` gehört dem VORGANG (Teil XXI, P4) — sie ändert keine
        // Geometrie, nur die Menge, die abgefahren wird.
        expect(Object.keys(p).sort()).toEqual(['auflockerung', 'operationen', 'quellBasis', 'quellen', 'raster']);
        expect(p.operationen.map(o => o.art)).toEqual(['grube']);   // Teil XX: EINE Op, Böschung nach innen
        // Kein Netz, kein Höhenfeld, kein Volumen — nur die Anweisung (Gesetz 5).
        expect(JSON.stringify(p)).not.toMatch(/heights|positions|volumen/);
        // EINE Klammer hält die Teile zusammen, und jedes trägt die volle Liste.
        expect(new Set(neu.map(s => s.nachher.ableitung)).size).toBe(1);
        expect(neu.every(s => s.nachher.parameter.operationen.length === 1)).toBe(true);
        // Die Anzeige trägt keine Operationen — nur die Reihenfolge der Vorgänge.
        const anzeige = schritte.find(s => s.nachher?.rezept === 'anzeige').nachher.parameter;
        expect(anzeige.operationen).toEqual([]);
        expect(JSON.stringify(anzeige)).not.toMatch(/heights|positions|volumen/);
    });
});

describe('Ausheben und Auffüllen — der Umriss liegt AUF dem Gelände (Teil XX)', () => {
    const opsVon = (id, werte, zug = UMRISS(4)) => {
        const s = b(id).anwenden(GELAENDE(), werte, { zug });
        return s.find(x => x.nachher?.rezept === 'erdbau').nachher.parameter.operationen;
    };

    it('Ausheben: der Umriss ist die Oberkante mit Höhe je Punkt, die Sohle zählt gegen die mittlere Randhöhe (m NN, absolut)', () => {
        // Gelände bei Welt-y 4, Höhenversatz 300 ⇒ Rand 304 m NN. Zwei Meter tiefer: Sohle 302.
        const [op] = opsVon('graben-ausheben', { mass: 2, neigung: 1.5 });
        expect(op.art).toBe('grube');
        expect(op.parameter.umriss.map(q => q.y)).toEqual([304, 304, 304, 304]);   // der gezeichnete Rand, AUF dem Gelände
        expect(op.parameter.sohle).toBeCloseTo(302, 6);
        expect(op.parameter.neigung).toBe(1.5);
        expect(weltAusNn(op.parameter.sohle, 300)).toBeCloseTo(2, 6);
    });

    it('am Hang: die Sohle liegt die Tiefe unter der MITTLEREN Randhöhe, jede Ecke behält ihre eigene', () => {
        const hang = [{ x: 0, y: 2, z: 0 }, { x: 20, y: 6, z: 0 }, { x: 20, y: 6, z: 20 }, { x: 0, y: 2, z: 20 }];
        const [op] = opsVon('graben-ausheben', { mass: 1 }, hang);
        expect(op.parameter.umriss.map(q => q.y)).toEqual([302, 306, 306, 302]);
        expect(op.parameter.sohle).toBeCloseTo(303, 6);
        expect(op.parameter.neigung).toBeNull();                                      // leer = senkrecht
    });

    it('Auffüllen: der Umriss ist der Fuss, Ziel die Höhe über dem Rand — oder bis GOK', () => {
        const [op] = opsVon('auffuellen', { mass: 1.5 });
        expect(op).toMatchObject({ art: 'schuettung', parameter: { ziel: 'hoehe' } });
        expect(op.parameter.hoehe).toBeCloseTo(305.5, 6);
        const [gok] = opsVon('auffuellen', { ziel: 'ur' });
        expect(gok.parameter).toMatchObject({ ziel: 'ur' });
        expect(gok.parameter.hoehe).toBeUndefined();
        const s = b('auffuellen').anwenden(GELAENDE(), { ziel: 'ur' }, { zug: UMRISS(4) });
        expect(s.find(x => x.nachher?.rolle === 'auftrag').nachher.predefinedType).toBe('BACKFILL');
        expect(b('auffuellen').anwenden(GELAENDE(), { mass: 1 }, { zug: UMRISS(4) })
            .find(x => x.nachher?.rolle === 'auftrag').nachher.predefinedType).toBe('EMBANKMENT');
    });

    it('ohne Geländetreffer wird NICHT geraten — schon EIN Punkt ohne Höhe ergibt nichts', () => {
        const ohneY = [{ x: 0, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 9 }];
        expect(b('graben-ausheben').anwenden(GELAENDE(), { mass: 2 }, { zug: ohneY })).toBeNull();
        expect(b('auffuellen').anwenden(GELAENDE(), { mass: 2 }, { zug: ohneY })).toBeNull();
        const einer = [...UMRISS(4).slice(0, 3), { x: 0, z: 20 }];
        expect(b('graben-ausheben').anwenden(GELAENDE(), { mass: 2 }, { zug: einer })).toBeNull();
    });

    it('unsinnige Masse und zu wenige Punkte ergeben nichts', () => {
        expect(b('graben-ausheben').anwenden(GELAENDE(), { mass: 0 }, { zug: UMRISS() })).toBeNull();
        expect(b('graben-ausheben').anwenden(GELAENDE(), { mass: -2 }, { zug: UMRISS() })).toBeNull();
        expect(b('graben-ausheben').anwenden(GELAENDE(), { mass: 2 }, { zug: UMRISS().slice(0, 2) })).toBeNull();
    });
});

describe('Böschung an Kante — eine offene Linie mit Seite (Teil XX)', () => {
    const LINIE = [{ x: 0, y: 4, z: 0 }, { x: 20, y: 5, z: 0 }];

    it('schreibt EINE boeschungLinie: je Knick Gelände + Kantenhöhe, die gewählte Seite, die Neigung', () => {
        const s = b('boeschung-anschliessen').anwenden(GELAENDE(), { kante: 1, seite: 'links', neigung: 2 }, { zug: LINIE });
        const ops = s.find(x => x.nachher?.rezept === 'erdbau').nachher.parameter.operationen;
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ art: 'boeschungLinie', parameter: { seite: 'links', neigung: 2 } });
        expect(ops[0].parameter.linie.map(q => q.y)).toEqual([305, 306]);
        expect(s.find(x => x.nachher?.rolle === 'auftrag').nachher.predefinedType).toBe('SLOPEFILL');
    });

    it('rechts ist die Vorgabe; zwei Punkte genügen, einer nicht', () => {
        const s = b('boeschung-anschliessen').anwenden(GELAENDE(), { kante: 0, neigung: 1.5 }, { zug: LINIE });
        expect(s.find(x => x.nachher?.rezept === 'erdbau').nachher.parameter.operationen[0].parameter.seite).toBe('rechts');
        expect(b('boeschung-anschliessen').anwenden(GELAENDE(), { kante: 1, neigung: 1.5 }, { zug: LINIE.slice(0, 1) })).toBeNull();
    });

    it('ohne Neigung ergibt sie nichts — eine Böschung 1:0 ist keine', () => {
        expect(b('boeschung-anschliessen').anwenden(GELAENDE(), { kante: 1, neigung: 0 }, { zug: LINIE })).toBeNull();
    });
});

describe('Der Katalog nennt jetzt die Handlungen', () => {
    it('alle drei stehen am Höhenfeld, in der Gruppe Gelände', () => {
        const ids = passende({ bauform: 'hoehenfeld', guete: 'geschaetzt' }).map(x => x.id);
        expect(ids).toEqual(expect.arrayContaining([
            'gerinne-einschneiden', 'planum-herstellen', 'graben-ausheben', 'auffuellen', 'boeschung-anschliessen',
        ]));
        for (const id of ['graben-ausheben', 'auffuellen', 'boeschung-anschliessen']) {
            expect(b(id).gruppe, id).toBe('gelaende');
            expect(b(id).hoehenAus, id).toBe('gelaende');
        }
        // Umriss für die Flächen, OFFENE Linie für die Böschung (Teil XX).
        expect(['graben-ausheben', 'auffuellen'].map(id => b(id).eingabe)).toEqual(['umriss', 'umriss']);
        expect(b('boeschung-anschliessen').eingabe).toBe('zug');
    });

    it('Ausheben und Auffüllen tragen VERSCHIEDENE Zeichen — sie sind entgegengesetzt', () => {
        expect(b('graben-ausheben').icon).not.toBe(b('auffuellen').icon);
        const icons = lies('components/ui/CdeIcon.vue');
        expect(icons).toMatch(/'ausheben':\s+Shovel/);
        expect(icons).toMatch(/'auffuellen':\s+Layers2/);
    });

    it('an einem Rohr oder Schacht wird nichts davon angeboten', () => {
        const ids = passende({ bauform: 'achse+profil', guete: 'gemessen' }).map(x => x.id);
        expect(ids).not.toContain('graben-ausheben');
        expect(ids).not.toContain('auffuellen');
    });
});
