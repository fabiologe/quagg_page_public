/**
 * B3 — der Kanalgraben für den STRANG, nach Norm (Teil XVII, 2026-09-08).
 *
 * (a) `anwenden` mit Umfang „strang": die Kette stromab wird `rohre`, die
 *     Schächte an den Enden `schaechte` — Listen in den Quellen, Achsmasse
 *     als Prüfmass der Rohre, kein Mass für Schächte.
 * (b) Der Lauf: zwei Rohre + zwei Schächte → Gerinne je Segment mit der
 *     Sohlbreite nach DIN EN 1610, Baugruben an den Knoten (schneidend),
 *     Befund bei senkrechter Wand ohne Verbau, Kennzahlen; Alt-Journale mit
 *     `arbeitsraum`/`boeschung` bauen weiter.
 * (c) Listen laufen durch Bezüge, Rückwärtsindex und Nachspielen (Achsmass).
 */
import { describe, expect, it } from 'vitest';
import { nachId } from '../services/Bearbeitungen.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { pruefeBezuege, abhaengige, quellenFlach } from '../services/ableitung/Bezuege.js';
import { planeNachspielen } from '../services/Nachspielen.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh, rasterAbtasten, achsmassAus, pruefmassGleich } from '../services/geometrie/ops/Raster.js';
import { pruefeForm } from '../services/geometrie/Formen.js';

function gelaende(h0 = 300) {
    const t = [];
    for (let x = 0; x < 80; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h0, z], b = [x + 1, h0, z], c = [x + 1, h0, z + 1], d = [x, h0, z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const P = (x, y, z) => ({ x, y, z });
// Zwei Haltungen an drei Schächten auf z = 20, Sohle 297,5 → 297,0 → 296,5 (Gelände 300).
const H1 = { globalId: 'H1', name: 'H-001', anfang: P(5, 297.5, 20), ende: P(35, 297.0, 20), laenge: 30.0042, dn: 300 };
const H2 = { globalId: 'H2', name: 'H-002', anfang: P(35, 297.0, 20), ende: P(65, 296.5, 20), laenge: 30.0042, dn: 400 };
const KNOTEN = [
    { globalId: 'S1', name: 'S1', punkt: P(5, 297.5, 20) }, { globalId: 'S2', name: 'S2', punkt: P(35, 297.0, 20) },
    { globalId: 'S3', name: 'S3', punkt: P(65, 296.5, 20) }, { globalId: 'SX', name: 'weit weg', punkt: P(5, 297, 5) },
];
const ROHR = {
    modelId: 'm1', localId: 3, globalId: 'H1', name: 'H-001', hoehenversatz: 300,
    achse: { dn: 300, anfang: H1.anfang, ende: H1.ende, polyline: [H1.anfang, H1.ende], laenge: H1.laenge },
    strang: [H1, H2], schachtKnoten: KNOTEN,
    quellmass: { pruefmass: { triCount: 48, spanX: 30, spanY: 0.6, spanZ: 0.3 } },
    gelaendeQuellen: [{ globalId: 'DGM1', name: 'Urgelände', herkunft: 'geliefert', pruefmass: { triCount: 6400 }, cell: 0.5 }],
};
const holeQuellForm = async (gid, form, { cell, bereich = null } = {}) => {
    if (gid === 'DGM1' && form === 'raster') return rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1, bereich }).ergebnis;
    if (gid === 'H1' && form === 'linie') return { punkte: [H1.anfang, H1.ende], dn: 300 };
    if (gid === 'H2' && form === 'linie') return { punkte: [H2.anfang, H2.ende], dn: 400 };
    const s = KNOTEN.find(k => k.globalId === gid);
    if (s && form === 'knoten') return { ...s.punkt, name: s.name };
    return null;
};
const standAus = (eintraege) => new Map(eintraege.map(e => [e.globalId, e.nachher]));

describe('(a) anwenden — Umfang Strang', () => {
    it('Rohre und Schächte der Kette werden Listen; Achsmasse als Prüfmass; der ferne Schacht bleibt draussen', () => {
        const s = nachId('kanalgraben-ableiten').anwenden(ROHR, { gelaende: 'DGM1', umfang: 'strang', wandform: 'verbau', bettung: 0.1, schachtMass: 1.0 });
        expect(s).toHaveLength(4);                       // geloescht + Anzeige + Graben + Verfüllung (Stufe 1)
        expect(s[1].nachher.rezept).toBe('anzeige');
        const p = s[2].nachher.parameter;
        expect(p.quellen).toEqual({ rohre: ['H1', 'H2'], schaechte: ['S1', 'S2', 'S3'], gelaende: 'DGM1' });
        expect(p.quellBasis.rohre.map(m => [m.laenge, m.dn, m.dy])).toEqual([[30, 300, -0.5], [30, 400, -0.5]]);
        expect(p.quellBasis.schaechte).toEqual([null, null, null]);
        expect(p.operationen[0].parameter).toMatchObject({ umfang: 'strang', wandform: 'verbau', schachtMass: 1, dn: null });
        expect(s[2].nachher.name).toBe('H-001 · Strang · Graben');
        // Die Beschreibung nennt den Umfang und die Norm.
        expect(ABLEITUNGEN.kanalgraben.beschreibe(s[2].nachher)).toBe('Kanalgraben · Graben · DN aus Rohr · Strang (2 Haltungen, 3 Schächte) · Senkrecht mit Verbau · Sohlbreite nach DIN EN 1610');
    });
    it('„nur diese Haltung": eine Quelle, ihre zwei Schächte', () => {
        const s = nachId('kanalgraben-ableiten').anwenden(ROHR, { gelaende: 'DGM1', umfang: 'haltung', wandform: 'boeschung', boden: 'bindigSteif', winkel: '', breite: '' });
        const p = s[2].nachher.parameter;
        expect(p.quellen).toEqual({ rohre: ['H1'], schaechte: ['S1', 'S2'], gelaende: 'DGM1' });
        expect(p.operationen[0].parameter).toMatchObject({ wandform: 'boeschung', boden: 'bindigSteif', winkelGrad: null, breite: null });
    });
});

describe('(b) der Lauf am Strang', () => {
    const werte = (extra = {}) => [{ art: 'kanalgraben', parameter: { umfang: 'strang', wandform: 'verbau', boden: 'nichtbindig', winkelGrad: null, wanddickeMm: 0, breite: null, bettung: 0.1, schachtMass: 1.0, dn: null, ...extra } }];
    async function lauf(op, quellen = { rohre: ['H1', 'H2'], schaechte: ['S1', 'S2', 'S3'], gelaende: 'DGM1' }) {
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen, raster: { cell: 0.5 }, operationen: op, name: 'Strang' });
        // Stufe 1: das Gelände nach dem Graben ist die ANZEIGE des Ur, kein Teil des Grabens.
        const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
        const l = neuerAbleitungslauf({ stand: standAus([...schritte, ...anzeige]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const [graben] = schritte;
        const rg = await l.baue(graben.globalId);
        const rd = await l.baue(anzeige[0].globalId);
        return { l, rg, rd, a: l.ableitungen.get(graben.nachher.ableitung) };
    }

    it('verbaut: Sohlbreite nach DIN EN 1610 je DN und Tiefe, Baugruben an den drei Knoten, DGM geschnitten — gerechnet im FEINEN Korridor, gezeigt im vollen DGM', async () => {
        const { l, rg, rd, a } = await lauf(werte());
        expect(l.misserfolge).toEqual([]);
        expect(rg.ok && rg.teil.daten.closed).toBe(true);
        const k = a.kennzahlen;
        expect(k).toMatchObject({ rohre: 2, schaechte: 3, wandform: 'verbau', neigung: 0, operationen: 5, korridor: true, zellweite: 0.5, zellweiteDgm: 0.5 });
        // Das sichtbare DGM-Teil hat weiter die VOLLE Ausdehnung (80 × 40 m), nicht nur den Korridor.
        expect(rd.teil.daten.x0).toBe(0); expect(rd.teil.daten.maxX).toBe(80); expect(rd.teil.daten.maxZ).toBe(40);
        // Der Korridor: Rohre x 5…65, z 20 → ±12 m Rand.
        const z = ABLEITUNGEN.kanalgraben.zusatzQuellen({ raster: { cell: 2 } }, { rohre: [{ punkte: [H1.anfang, H1.ende] }, { punkte: [H2.anfang, H2.ende] }], schaechte: KNOTEN.slice(0, 3).map(s => s.punkt) }, { gelaende: 'DGM1' });
        expect(z.gelaendeFein).toMatchObject({ gid: 'DGM1', form: 'raster', opts: { cell: 0.5, bereich: { minX: -7, maxX: 77, minZ: 8, maxZ: 32 } } });
        // Tiefe ≈ 300 − (297,0 − 0,15 − 0,1) ≈ 3,25 m → Tab. 2: 0,90; nach DN: DN 300 → 0,80, DN 400 → 1,10 (gewinnt)
        expect(k.sohlbreiteMin).toBeCloseTo(0.90, 9);
        expect(k.sohlbreite).toBeCloseTo(1.10, 9);
        expect(k.tiefeMax).toBeGreaterThan(3.4);
        expect(k.regel).toMatch(/DIN EN 1610/);
        expect(k.gruende.some(g => /Baugrube/.test(g))).toBe(true);
        expect(a.befunde.map(b => b.regel)).toEqual([]);
        // Auf der Achse bei x=20 (H1): Sohle = 297,25 − 0,15 − 0,1 = 297,0
        expect(rasterAbtasten(rd.teil.daten, 20, 20)).toBeCloseTo(297.0, 2);
        // Die Baugrube an S2 (35/20): ECKIG, 1,0 + 2·0,6 = 2,2 m Kante (halb 1,1); bei (35, 21) UND in der Ecke (36, 21)
        // liegt sie auf Schachtsohle − Bettung = 296,9 — rund läge die Ecke draussen.
        expect(rasterAbtasten(rd.teil.daten, 35, 21)).toBeCloseTo(296.9, 2);
        expect(rasterAbtasten(rd.teil.daten, 36, 21)).toBeCloseTo(296.9, 2);
        // Neben der Baugrube (35, 22,5) — senkrecht: unberührt vom Schacht, aber im Graben (H2 Sohlbreite 1,1 → nur bis z 20,55)
        expect(rasterAbtasten(rd.teil.daten, 35, 22.5)).toBeCloseTo(300, 6);
        expect(k.ueberdeckungMin).toBeGreaterThan(2);
    });

    it('ein flaches Rohr bekommt seinen Überdeckungs-Befund MIT seiner GlobalId — an seiner Zeile, nicht am DGM', async () => {
        const flach = { ...H1 };    // Sohle 297,5/297,0 unter Gelände 300 → Scheitel 297,65: Überdeckung 2,35 → ok; also tiefer legen: Gelände 297,8
        const hole = async (gid, form, o = {}) => (gid === 'DGM1' && form === 'raster' ? rasterAusMesh({ mesh: gelaende(297.8) }, { cell: o.cell ?? 1, bereich: o.bereich ?? null }).ergebnis : holeQuellForm(gid, form, o));
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohre: ['H1', 'H2'], schaechte: [], gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: werte(), name: 'S' });
        const l = neuerAbleitungslauf({ stand: standAus(schritte), rezeptNach, holeQuellForm: hole, kernel: erzeugeKernel() });
        await l.baue(schritte[0].globalId);
        const a = l.ableitungen.get(schritte[0].nachher.ableitung);
        const u = a.befunde.filter(b => b.regel === 'ueberdeckung_gering');
        expect(u.map(b => b.globalId)).toEqual(['H1', 'H2']);
        expect(u[0].text).toMatch(/Rohr 1 von 2/);
        expect(u[0].quelle).toMatch(/Ur-Gelände/);
        void flach;
    });

    it('senkrecht ohne Verbau in 3 m Tiefe: gebaut, aber mit dem Befund aus DIN 4124 4.2.2', async () => {
        const { a } = await lauf(werte({ wandform: 'senkrecht' }));
        expect(a.befunde.map(b => b.regel)).toEqual(['graben_senkrecht_ohne_verbau']);
        expect(a.befunde[0].text).toMatch(/zulässig nur bis 1\.25 m/);
    });

    it('abgeböscht 45°: die Baugrube läuft mit 1:1 aus; ein eigener Winkel über der Bodenklasse ist ein Befund', async () => {
        const { rd, a } = await lauf(werte({ wandform: 'boeschung', boden: 'nichtbindig' }));
        expect(a.kennzahlen).toMatchObject({ neigung: 1, winkelGrad: 45 });
        // 2 m ausserhalb der Kante (geböscht: 1 + 2·0,5 = 2,0 m, halb 1,0) bei S1 (5/20): Sohle 297,4 + 2 = 299,4
        expect(rasterAbtasten(rd.teil.daten, 5, 23)).toBeCloseTo(299.4, 1);
        const { a: a2 } = await lauf(werte({ wandform: 'boeschung', boden: 'nichtbindig', winkelGrad: 70 }));
        expect(a2.befunde.map(b => b.regel)).toEqual(['boeschung_zu_steil']);
    });

    it('ALT-JOURNAL: `arbeitsraum` + `boeschung` bauen weiter — als eigene Sohlbreite und Böschungswinkel', async () => {
        const alt = [{ art: 'kanalgraben', parameter: { dn: 300, arbeitsraum: 0.4, bettung: 0.15, boeschung: 0.5 } }];
        const { a } = await lauf(alt, { rohr: 'H1', gelaende: 'DGM1' });
        expect(a.kennzahlen).toMatchObject({ rohre: 1, schaechte: 0, wandform: 'boeschung', sohlbreite: 1.1 });
        expect(a.kennzahlen.winkelGrad).toBeCloseTo(63.4, 1);
        expect(ABLEITUNGEN.kanalgraben.beschreibe({ rolle: 'graben', parameter: { operationen: alt, quellen: { rohr: 'H1' } } }))
            .toBe('Kanalgraben · Graben · DN 300 · Haltung · Abgeböscht · Sohlbreite 1.10 m');
    });

    it('die Vorschau zeichnet beim Strang jede Haltung und je Schacht einen eckigen Kasten — abgeböscht wachsen Deckel UND Stirnseiten', () => {
        const v = ABLEITUNGEN.kanalgraben.vorschau({ operationen: werte() }, { subjekt: ROHR, hoeheAn: () => 300 });
        const geister = v.primitive.filter(x => x.art === 'geist');
        expect(geister).toHaveLength(5);     // 2 Gräben + 3 Baugruben
        expect(geister.every(g => g.triCount === 12)).toBe(true);
        expect(v.chips[0].text).toMatch(/Senkrecht mit Verbau · Sohlbreite bis 1\.10 m \(DIN EN 1610\) · Strang: 2 Haltungen · 3 Baugruben/);
        // Verbaut: Deckel = Boden im Grundriss (Prisma). Abgeböscht 45°: der Deckel ragt um die Tiefe über den Boden hinaus — auch längs.
        const spann = (g) => { let minX = Infinity, maxX = -Infinity; for (let i = 0; i < g.positions.length; i += 3) { minX = Math.min(minX, g.positions[i]); maxX = Math.max(maxX, g.positions[i]); } return maxX - minX; };
        const laengster = (gs) => gs.reduce((b, g) => (spann(g) > spann(b) ? g : b));
        const graben = laengster(geister);                     // ein Graben (5 → 35 bzw. 35 → 65: 30 m), keine Baugrube (2,2 m)
        expect(spann(graben)).toBeCloseTo(30, 6);
        const vb = ABLEITUNGEN.kanalgraben.vorschau({ operationen: werte({ wandform: 'boeschung', boden: 'nichtbindig', umfang: 'haltung' }) }, { subjekt: ROHR, hoeheAn: () => 300 });
        const gb = vb.primitive.filter(x => x.art === 'geist');
        const tiefe = 300 - (297.0 - 0.15 - 0.1);            // am tiefen Ende ≈ 3,25
        expect(spann(laengster(gb))).toBeGreaterThan(30 + 2 * 3);       // je Ende ≥ tiefe·n hinaus (Stirnböschung)
        expect(vb.chips[0].text).toMatch(/Abgeböscht 45° \(auch Stirnseiten\)/);
    });
});

describe('(c) Listen in Bezügen, Rückwärtsindex, Nachspielen', () => {
    it('quellenFlach, pruefeBezuege und abhaengige verstehen Listen', () => {
        const plan = { parameter: { quellen: { rohre: ['H1', 'H2'], schaechte: ['S1'], gelaende: 'DGM1' } } };
        expect(quellenFlach(plan.parameter)).toEqual(['H1', 'H2', 'S1', 'DGM1']);
        const stand = new Map([['GR', plan]]);
        expect(abhaengige(stand).get('H2').has('GR')).toBe(true);
        expect(pruefeBezuege({ quellen: plan.parameter.quellen, globalId: 'GR', stand })).toEqual([]);
        expect(pruefeBezuege({ quellen: { rohre: [], gelaende: 'DGM1' }, globalId: 'GR', stand })).toEqual(['Quelle „rohre" fehlt']);
        expect(pruefeBezuege({ quellen: { rohre: ['GR'], gelaende: 'DGM1' }, globalId: 'GR', stand })).toEqual(['„rohre" zeigt auf das Bauteil selbst']);
    });
    it('Achsmass: cm-gerundet, translationsinvariant; pruefmassGleich vergleicht Achsmasse nur mit Achsmassen', () => {
        const m1 = achsmassAus({ punkte: [P(0, 10, 0), P(30, 9.5, 0)], dn: 300 });
        const m2 = achsmassAus({ punkte: [P(100, 10, 50), P(130, 9.5, 50)], dn: 300 });
        expect(m1).toEqual({ achse: true, laenge: 30, dn: 300, dy: -0.5 });
        expect(pruefmassGleich(m1, m2)).toBe(true);
        expect(pruefmassGleich(m1, { ...m1, dn: 400 })).toBe(false);
        expect(pruefmassGleich(m1, { triCount: 4, spanX: 30, spanY: 0.5, spanZ: 0 })).toBe(false);
    });
    it('planeNachspielen meldet eine geänderte Haltung des Strangs als quelle_geaendert — je Index', () => {
        const eintrag = { id: 'e1', art: 'erzeugt', globalId: 'GR', modell: 'cde', nachher: { rezept: 'kanalgraben', parameter: {
            quellen: { rohre: ['H1', 'H2'], gelaende: 'DGM1' },
            quellBasis: { rohre: [achsmassAus({ punkte: [H1.anfang, H1.ende], dn: 300 }), achsmassAus({ punkte: [H2.anfang, H2.ende], dn: 400 })], gelaende: null },
        } } };
        const heute = { H1: achsmassAus({ punkte: [H1.anfang, H1.ende], dn: 300 }), H2: achsmassAus({ punkte: [H2.anfang, P(65, 295.5, 20)], dn: 400 }) };
        const plan = planeNachspielen([eintrag], () => undefined, { leseQuellmass: (gid, mass) => (mass?.achse ? heute[gid] : null) });
        expect(plan.anzuwenden.some(a => a.globalId === 'GR')).toBe(true);
        expect(plan.hinweise.some(h => /quelle_geaendert|Quelle/.test(JSON.stringify(h)))).toBe(true);
    });
    it('die Form knoten ist bekannt', () => {
        expect(pruefeForm({ x: 1, y: 2, z: 3 }, 'knoten')).toEqual([]);
        expect(pruefeForm({ x: 1 }, 'knoten')).toHaveLength(1);
    });
});
