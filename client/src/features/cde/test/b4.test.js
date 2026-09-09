/**
 * B4 — Befunde aus dem Beziehungsindex (Teil XVII, 2026-09-08).
 *
 * Die Familien „Raum" und „Nachbarschaft" aus Teil IX §4, jetzt mit Daten:
 * Überdeckung für ALLE Läufe, lichter Abstand an Kreuzungen und in
 * Parallellage, Durchdringung, Schacht auf der Haltung (mit Kur + Station).
 * Grenzen sind Daten im REGELWERK; nur Form-Güte trägt Befunde; die Zeilen
 * der Prüfliste bekommen sie angehängt oder neu. Je Regel eine Szene.
 */
import { describe, expect, it } from 'vitest';
import { baueBeziehungen } from '../services/Beziehungen.js';
import { befundeAusBeziehungen, REGELWERK, KUREN } from '../services/Befunde.js';
import { IfcEngine } from '../services/IfcEngine.js';

const p = (x, z, y = 0) => ({ x, y, z });
const box = (x0, y0, z0, x1, y1, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });
const rohr = (id, a, b, dn = 300) => ({
    globalId: id, name: id, kategorie: 'IFCPIPESEGMENT', achse: { punkte: [a, b], dn },
    huelle: box(Math.min(a.x, b.x) - 0.15, Math.min(a.y, b.y) - 0.15, Math.min(a.z, b.z) - 0.15, Math.max(a.x, b.x) + 0.15, Math.max(a.y, b.y) + 0.15, Math.max(a.z, b.z) + 0.15),
    ort: { modelId: 'm1', localId: id.charCodeAt(0) * 10 + id.charCodeAt(1) },
});
const schacht = (id, pt) => ({ globalId: id, name: id, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', knoten: pt,
    huelle: box(pt.x - 0.5, pt.y - 0.2, pt.z - 0.5, pt.x + 0.5, pt.y + 2.5, pt.z + 0.5), ort: { modelId: 'm1', localId: 100 + id.charCodeAt(1) } });
const H1 = () => rohr('H1', p(0, 0, 10), p(50, 0, 9));                    // Sohle 10 → 9, Scheitel bis 10,15
const index = (objekte, h = 20) => baueBeziehungen({ objekte, gelaende: { globalId: 'DGM', name: 'DGM', hoeheAn: () => h } });
const regeln = (je, gid) => (je.get(gid) ?? []).map(b => b.regel).sort();

describe('befundeAusBeziehungen — je Regel eine Szene', () => {
    it('das Regelwerk trägt die drei Grenzen als Daten, jede neue Regel hat eine Kur', () => {
        expect(REGELWERK).toMatchObject({ ueberdeckungMindestM: 0.8, kreuzungMindestabstandM: 0.2, mindestabstandParallelM: 0.4 });
        for (const r of ['ueberdeckung_gering', 'kreuzung_abstand', 'mindestabstand', 'durchdringung', 'schacht_auf_haltung']) expect(KUREN[r]).toBeTruthy();
    });
    it('ÜBERDECKUNG: Scheitel 10,15 unter Gelände 10,6 = 0,45 m < 0,80 — nur am Lauf, nie am Schacht', () => {
        const je = befundeAusBeziehungen(index([schacht('S1', p(0, 0, 10)), schacht('S2', p(50, 0, 9)), H1()], 10.6));
        expect(regeln(je, 'H1')).toEqual(['ueberdeckung_gering']);
        const u = je.get('H1')[0];
        expect(u.text).toMatch(/Überdeckung 0\.45 m unter 0\.80 m \(Rohrscheitel gegen DGM\)/);
        expect(u).toMatchObject({ schwere: 'warnung', grenze: 'mindestens 0.80 m', kur: { bearbeitung: 'sohlhoehen-setzen' } });
        expect(je.has('S1')).toBe(false);
        expect(je.has('S2')).toBe(false);
    });
    it('KREUZUNG: W2 kreuzt H1 mit 0,10 m lichtem Abstand (Δh 0,30 − 0,15 − 0,05) — W1 mit 0,70 m nicht', () => {
        const je = befundeAusBeziehungen(index([H1(), rohr('W1', p(25, -10, 10.4), p(25, 10, 10.4), 100), rohr('W2', p(30, -10, 9.7), p(30, 10, 9.7), 100)]));
        expect(regeln(je, 'H1')).toEqual(['kreuzung_abstand']);
        expect(regeln(je, 'W2')).toEqual(['kreuzung_abstand']);
        expect(je.has('W1')).toBe(false);
        expect(je.get('H1')[0].text).toMatch(/Kreuzt W2 mit 0\.10 m lichtem Abstand — mindestens 0\.20 m/);
        expect(je.get('W2')[0].text).toMatch(/Kreuzt H1/);
    });
    it('PARALLEL: G1 läuft 0,55 m neben H1 — 0,25 m Körperabstand < 0,40', () => {
        const je = befundeAusBeziehungen(index([H1(), rohr('G1', p(0, 0.55, 10), p(50, 0.55, 9))]));
        expect(regeln(je, 'H1')).toEqual(['mindestabstand']);
        expect(regeln(je, 'G1')).toEqual(['mindestabstand']);
        expect(je.get('H1')[0]).toMatchObject({ wert: '0.25 m', grenze: 'mindestens 0.40 m', kur: { bearbeitung: 'verschieben' } });
    });
    it('DURCHDRINGUNG: H1 läuft durch das Fundament — beide bekommen den Befund', () => {
        const je = befundeAusBeziehungen(index([H1(), { globalId: 'F1', name: 'Fundament', kategorie: 'IFCFOOTING', huelle: box(40, 8, -1, 44, 12, 1), ort: { modelId: 'm1', localId: 77 } }]));
        expect(regeln(je, 'H1')).toEqual(['durchdringung']);
        expect(je.get('H1')[0].text).toBe('Durchdringt Fundament');
        expect(regeln(je, 'F1')).toEqual(['durchdringung']);
    });
    it('SCHACHT AUF DER HALTUNG: SX bei St. 10 ohne Anschluss — Hinweis am Schacht, an der Haltung die Kur „teilen" mit Station', () => {
        const je = befundeAusBeziehungen(index([H1(), schacht('SX', p(10, 0.45, 9.8))]));
        // Der Schacht sitzt mit seiner Hülle auf dem Rohr — das ist zugleich eine Durchdringung, und das ist richtig.
        expect(regeln(je, 'SX')).toEqual(['durchdringung', 'schacht_auf_haltung']);
        expect(je.get('SX').find(b => b.regel === 'schacht_auf_haltung')).toMatchObject({ schwere: 'hinweis', kur: null });
        const st = je.get('H1').find(b => b.regel === 'schacht_auf_haltung');
        expect(st.text).toMatch(/SX liegt bei St\. 10\.00 m auf der Haltung, ohne Anschluss — hier teilen\?/);
        expect(st.kur).toEqual({ bearbeitung: 'haltung-teilen', werte: { station: 10 } });
    });
    it('Grenzen sind Daten: mit 0,3 m Überdeckung und 0,05 m Kreuzungsabstand fällt beides', () => {
        const idx = index([schacht('S1', p(0, 0, 10)), H1(), rohr('W2', p(30, -10, 9.7), p(30, 10, 9.7), 100)], 10.6);
        expect(regeln(befundeAusBeziehungen(idx), 'H1')).toEqual(['kreuzung_abstand', 'ueberdeckung_gering']);
        expect(regeln(befundeAusBeziehungen(idx, { ...REGELWERK, ueberdeckungMindestM: 0.3, kreuzungMindestabstandM: 0.05 }), 'H1')).toEqual([]);
    });
    it('im OFFENEN AUSHUB schweigt der Index zur Überdeckung — die meldet die Ableitung gegen das Fertiggelände', () => {
        // H1 liegt im Graben-Körper (IfcEarthworksCut); der Sampler sähe die Grabensohle.
        const graben = { globalId: 'GR', name: 'Graben', kategorie: 'IFCEARTHWORKSCUT', herkunft: 'cde', huelle: box(-1, 7, -1, 51, 13, 1), ort: { modelId: 'cde-eigenbau', localId: 5 } };
        const je = befundeAusBeziehungen(index([H1(), graben], 9.9));
        expect(je.has('H1')).toBe(false);
        // Ohne Graben wäre es ein Befund (Scheitel 10,15 über Gelände 9,9 → sogar negativ).
        expect(regeln(befundeAusBeziehungen(index([H1()], 9.9)), 'H1')).toEqual(['ueberdeckung_gering']);
    });
    it('Hüllen-Kandidaten (Körper zu Körper) tragen keinen Befund — das ist die Serverprüfung', () => {
        const i2 = baueBeziehungen({ objekte: [{ globalId: 'A', huelle: box(0, 0, 0, 2, 2, 2) }, { globalId: 'B', huelle: box(1, 1, 1, 3, 3, 3) }] });
        expect(i2.paare('schnitt')[0].guete).toBe('huelle');
        expect(befundeAusBeziehungen(i2).size).toBe(0);
    });
});

describe('pruefeAlles hängt die Index-Befunde an die Zeilen', () => {
    it('vorhandene Zeile bekommt sie dazu, unbekannte Bauteile bekommen eine neue Zeile mit Ort aus dem Index; Verdecktes fällt', () => {
        const idx = index([H1(), rohr('W2', p(30, -10, 9.7), p(30, 10, 9.7), 100), rohr('G1', p(0, 0.55, 10), p(50, 0.55, 9))]);
        const e = Object.create(IfcEngine.prototype);
        Object.assign(e, {
            _achsen: new Map([['m1', new Map([[72, { globalId: 'H1', name: 'H1', kategorie: 'IFCPIPESEGMENT',
                anfang: p(0, 0, 10), ende: p(50, 0, 9), polyline: [p(0, 0, 10), p(50, 0, 9)], laenge: 50.01, gefaelle: 20, dn: 300 }]])]]),
            _knoten: new Map([['m1', new Map()]]), _cdeKanten: new Map(), _cdeKnoten: new Map(),
            _verdeckt: new Set(['G1']),
            _beziehungen: idx,
            quelleVon: () => ({ zeile: (id) => (id === 72 ? { GlobalId: { value: 'H1' }, Name: { value: 'H1' } } : null) }),
            netzVon: () => ({ knoten: new Map(), kanten: new Map(), loseEnden: [], ohneAnschluss: [] }),
            autor: { ableitungen: new Map() }, _kollisionen: [],
        });
        const out = e.pruefeAlles();
        const h1 = out.find(z => z.globalId === 'H1');
        expect(h1).toBeTruthy();
        expect(h1.befunde.map(b => b.regel)).toEqual(expect.arrayContaining(['kreuzung_abstand', 'mindestabstand']));
        const w2 = out.find(z => z.globalId === 'W2');
        expect(w2).toMatchObject({ modelId: 'm1', localId: 'W'.charCodeAt(0) * 10 + '2'.charCodeAt(0), name: 'W2', kategorie: 'IFCPIPESEGMENT' });
        expect(w2.befunde.map(b => b.regel)).toContain('kreuzung_abstand');
        expect(out.find(z => z.globalId === 'G1')).toBeUndefined();                       // verdeckt
        expect(out[0].befunde.some(b => b.schwere === 'warnung')).toBe(true);
    });

    it('Ableitungs-Befunde mit GlobalId stehen an der Zeile des Rohrs, der Rest am DGM-Teil', () => {
        const idx = index([H1(), rohr('W2', p(30, -10, 9.7), p(30, 10, 9.7), 100)]);
        const e = Object.create(IfcEngine.prototype);
        Object.assign(e, {
            _achsen: new Map([['m1', new Map()]]), _knoten: new Map([['m1', new Map()]]), _cdeKanten: new Map(), _cdeKnoten: new Map(),
            _verdeckt: new Set(), _beziehungen: idx, quelleVon: () => null,
            netzVon: () => ({ knoten: new Map(), kanten: new Map(), loseEnden: [], ohneAnschluss: [] }),
            autor: { ableitungen: new Map([['ab-1', { rezept: 'kanalgraben', teile: { dgm: 'DGMX' }, befunde: [
                { regel: 'ueberdeckung_gering', schwere: 'warnung', globalId: 'H1', text: 'Überdeckung 0.30 m …' },
                { regel: 'ueberdeckung_gering', schwere: 'warnung', globalId: 'W2', text: 'Überdeckung 0.20 m …' },
                { regel: 'aushub_gegenprobe', schwere: 'hinweis', text: 'Körper ≠ Raster' },
            ] }]]) }, _kollisionen: [],
        });
        const out = e.pruefeAlles();
        expect(out.find(z => z.globalId === 'H1').befunde.map(b => b.regel)).toContain('ueberdeckung_gering');
        const w2 = out.find(z => z.globalId === 'W2');
        expect(w2).toMatchObject({ modelId: 'm1', name: 'W2' });
        expect(w2.befunde.filter(b => b.regel === 'ueberdeckung_gering')).toHaveLength(1);
        const dgm = out.find(z => z.globalId === 'DGMX');
        expect(dgm.befunde.map(b => b.regel)).toEqual(['aushub_gegenprobe']);
    });
});
