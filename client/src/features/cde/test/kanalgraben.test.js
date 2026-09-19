/**
 * Der Kanalgraben (Teil XIV, G6) — die zweite Pipeline, die erste mit ZWEI
 * Quellen (Rohr + Gelände).
 *
 * Journalseite: vier Einträge, ein Vorgang, Quellen und Prüfmasse als
 * Parameter. Rechenseite am echten Rezept und echten Kernel: Sohle =
 * Rohrsohle − Bettung, geschlossener Graben, Rohr aus dem BAUPLAN eines
 * eigenen Rohrs (formAus) oder aus der Quelle (holeQuellForm), Verfüllung
 * als Kennzahl, Überdeckung als Befund.
 */
import { describe, expect, it } from 'vitest';
import { nachId, passende, felderFuer } from '../services/Bearbeitungen.js';
import { ABLEITUNGEN } from '../services/ableitung/Ableitungen.js';
import { regelwert } from '../services/regeln/Regelwerk.js';
// Die Mindestüberdeckung steht seit AR im Regelwerk — eine Stelle für Graben und Befunde.
const MINDEST_UEBERDECKUNG = regelwert('ueberdeckungMindestM');
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, erzeugtEintrag, rezeptNach } from '../services/Bauteilrezepte.js';
import { rezepteOhneDeklaration } from '../services/JournalVersatz.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh, rasterAbtasten } from '../services/geometrie/ops/Raster.js';

function gelaende() {
    const h = (x) => 300 + 0.01 * x;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x), z], b = [x + 1, h(x + 1), z], c = [x + 1, h(x + 1), z + 1], d = [x, h(x), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const holeQuellForm = async (gid, form, { cell } = {}) => {
    if (gid === 'DGM1' && form === 'raster') return rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1 }).ergebnis;
    if (gid === 'ROHR-A' && form === 'linie') return { punkte: [{ x: 5, y: 297.5, z: 20 }, { x: 35, y: 297.2, z: 20 }], dn: 400 };
    return null;
};
const standAus = (eintraege) => new Map(eintraege.map(e => [e.globalId, e.nachher]));
const OP = [{ art: 'kanalgraben', parameter: { dn: 300, arbeitsraum: 0.4, bettung: 0.15, boeschung: 0.5 } }];

const ROHR = {
    modelId: 'm1', localId: 3, globalId: 'H1', name: 'H-001', hoehenversatz: 300,
    achse: { dn: 300, anfang: { x: 5, y: 297.5, z: 20 }, ende: { x: 35, y: 297.2, z: 20 } },
    quellmass: { pruefmass: { triCount: 48, spanX: 3000, spanY: 60, spanZ: 30 } },
    gelaendeQuellen: [
        { globalId: 'DGM1', name: 'Urgelände', herkunft: 'geliefert', pruefmass: { triCount: 3200, spanX: 4000, spanY: 40, spanZ: 4000 }, cell: 0.5 },
        { globalId: 'cde-dgm', name: 'Gerinne (geformt)', herkunft: 'cde', pruefmass: null, cell: 0.5 },
    ],
};

describe('Der Katalog', () => {
    it('„Kanalgraben ableiten" hängt am Rohr (achse+profil), nicht am Gelände', () => {
        const amRohr = passende({ bauform: 'achse+profil', guete: 'geschaetzt' }).map(b => b.id);
        expect(amRohr).toContain('kanalgraben-ableiten');
        expect(passende({ bauform: 'hoehenfeld', guete: 'gemessen' }).map(b => b.id)).not.toContain('kanalgraben-ableiten');
    });

    it('die Gelände-Auswahl kommt vom SUBJEKT — eigene DGMs sind gekennzeichnet, ohne Subjekt ist sie leer', () => {
        const b = nachId('kanalgraben-ableiten');
        const [gelaendeFeld] = felderFuer(b, null, ROHR);
        expect(gelaendeFeld.optionen.map(o => o.wert)).toEqual(['DGM1', 'cde-dgm']);
        expect(gelaendeFeld.optionen[1].titel).toMatch(/eigenes DGM/);
        expect(felderFuer(b, null, null)[0].optionen).toEqual([]);
        expect(b.vorbelegung(ROHR)).toMatchObject({ gelaende: 'DGM1', dn: 300, umfang: 'haltung', wandform: 'verbau', bettung: 0.1 });
        expect(b.vorbelegung({ ...ROHR, stand: { profilGroesse: 500 } }).dn).toBe(500);
    });

    it('vier Einträge: Gelände ausblenden + Anzeige (TERRAIN) + Graben (TRENCH), Verfüllung (BACKFILL) — Quellen und Prüfmasse als Parameter', () => {
        const s = nachId('kanalgraben-ableiten').anwenden(ROHR, { gelaende: 'DGM1', dn: 300, umfang: 'haltung', wandform: 'boeschung', boden: 'nichtbindig', bettung: 0.15 });
        expect(s).toHaveLength(4);
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'DGM1', nachher: true });
        // Stufe 1: die Anzeige des Ur-Geländes (eigene Klammer) statt eines DGM-Teils je Graben.
        expect(s[1].nachher).toMatchObject({ rezept: 'anzeige', rolle: 'anzeige', kategorie: 'IFCGEOGRAPHICELEMENT', predefinedType: 'TERRAIN', bauform: 'hoehenfeld', name: 'Urgelände (Anzeige)' });
        expect(s[1].nachher.parameter.vorgaenge).toEqual([{ ableitung: s[2].nachher.ableitung, art: 'kanalgraben', titel: 'H-001 · Kanalgraben' }]);
        const teile = s.slice(2);
        expect(teile.map(t => t.nachher.rolle)).toEqual(['graben', 'verfuellung']);
        expect(teile[0].nachher).toMatchObject({ kategorie: 'IFCEARTHWORKSCUT', predefinedType: 'TRENCH', bauform: 'koerper' });
        expect(teile[1].nachher).toMatchObject({ kategorie: 'IFCEARTHWORKSFILL', predefinedType: 'BACKFILL' });
        expect(new Set(teile.map(t => t.nachher.ableitung)).size).toBe(1);
        const p = teile[0].nachher.parameter;
        // B3: Rohre und Schächte sind LISTEN; die Rohre tragen ein Achsmass.
        expect(p.quellen).toEqual({ rohre: ['H1'], schaechte: [], gelaende: 'DGM1' });
        expect(p.quellBasis.gelaende.triCount).toBe(3200);
        expect(p.quellBasis.rohre).toEqual([{ achse: true, laenge: 30, dn: 300, dy: -0.3 }]);
        expect(p.raster.cell).toBe(0.5);
        // `achsbezug` steht seit Teil XXI im Bauplan: wo die Achshöhe liegt,
        // verschiebt jede Höhe des Grabens um DN/2 — das gehört ins Journal,
        // nicht in eine Annahme im Code (E4).
        // Seit Teil XXIV (K2b) trägt jede Operation eine Kennung (`op-…`).
        expect(p.operationen[0].id).toMatch(/^op-/);
        expect(p.operationen.map(({ id, ...o }) => o)).toEqual([{ art: 'kanalgraben', parameter: {
            umfang: 'haltung', achsbezug: 'quelle', wandform: 'boeschung', boden: 'nichtbindig', winkelGrad: null, wanddickeMm: 0,
            breite: null, bettung: 0.15, schachtMass: 1, dn: 300 } }]);
        expect(JSON.stringify(p)).not.toMatch(/heights|positions/);
    });

    it('ein EIGENES DGM als Quelle (Alt-Journal): der Graben fusst auf dem UR-Gelände, das Alt-DGM wird verborgen — mit modell cde', () => {
        // Die Anreicherung (Stufe 1) kennt das Ur hinter dem Alt-DGM.
        const erdbau = { ur: 'DGM1', anzeige: null, vorgaenge: [{ ableitung: 'ab-alt', art: 'erdbau', titel: 'Urgelände · Gelände formen' }],
                         letzter: null, altDgm: ['cde-dgm'], quellBasis: { triCount: 3200 }, cell: 0.5 };
        const rohr = { ...ROHR, gelaendeQuellen: ROHR.gelaendeQuellen.map(q => (q.globalId === 'cde-dgm' ? { ...q, erdbau } : q)) };
        const s = nachId('kanalgraben-ableiten').anwenden(rohr, { gelaende: 'cde-dgm', dn: 300, wandform: 'verbau', bettung: 0.15 });
        expect(s.slice(0, 2)).toEqual([
            { art: 'geloescht', globalId: 'DGM1', nachher: true },
            { art: 'geloescht', globalId: 'cde-dgm', nachher: true, modell: 'cde' },
        ]);
        expect(s[2].nachher.rezept).toBe('anzeige');
        expect(s[2].nachher.parameter.vorgaenge.map(v => v.art)).toEqual(['erdbau', 'kanalgraben']);   // hinten angehängt
        expect(s[3].nachher.parameter.quellen.gelaende).toBe('DGM1');                                   // nie das Alt-DGM
        expect(s[3].nachher.parameter.quellBasis.gelaende).toEqual({ triCount: 3200 });
        // Ohne Anreicherung (headless) bleibt die Quelle, wie sie genannt wurde — der Lauf löst die Wurzel selbst auf.
        const roh = nachId('kanalgraben-ableiten').anwenden(ROHR, { gelaende: 'cde-dgm', dn: 300, wandform: 'verbau', bettung: 0.15 });
        expect(roh[0]).toEqual({ art: 'geloescht', globalId: 'cde-dgm', nachher: true, modell: 'cde' });
    });

    it('ohne bekanntes Gelände entsteht nichts — kein halber Vorgang', () => {
        expect(nachId('kanalgraben-ableiten').anwenden(ROHR, { gelaende: 'GIBTSNICHT' })).toBeNull();
    });

    it('WÄCHTER: das Rezept deklariert verschiebe, fachmodell und beschreibe', () => {
        for (const feld of ['verschiebe', 'fachmodell', 'beschreibe']) {
            expect(rezepteOhneDeklaration(feld)).not.toContain('kanalgraben');
        }
        expect(ABLEITUNGEN.kanalgraben.beschreibe({ rolle: 'graben', parameter: { operationen: OP } })).toMatch(/Kanalgraben · Graben · DN 300/);
    });
});

describe('Der Lauf am echten Rezept', () => {
    it('Graben geschlossen, Sohle = Rohrsohle − Bettung, Rohr aus dem BAUPLAN, Verfüllung als Kennzahl', async () => {
        const rohr = erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H-001',
                                      parameter: { punkte: [[5, 297.5, 20], [35, 297.2, 20]], dn: 300 } });
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: rohr.globalId, gelaende: 'DGM1' },
                                              raster: { cell: 0.5 }, operationen: OP, name: 'H-001' });
        // Die ANZEIGE (Stufe 1) zeigt das Gelände nach dem Graben — das frühere DGM-Teil.
        const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
        const lauf = neuerAbleitungslauf({ stand: standAus([rohr, ...schritte, ...anzeige]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const [graben, verfuellung] = schritte;
        const rg = await lauf.baue(graben.globalId);
        const rv = await lauf.baue(verfuellung.globalId);
        const rd = await lauf.baue(anzeige[0].globalId);
        expect(lauf.misserfolge).toEqual([]);
        expect(rg.ok && rg.teil.form === 'koerper' && rg.teil.daten.closed).toBe(true);
        expect(rv).toMatchObject({ ok: true, leer: true });
        expect(rd.ok && rd.teil.form === 'raster').toBe(true);
        // Auf der Achse bei x = 20: Rohrmitte 297,35 − Radius 0,15 − Bettung 0,15 = 297,05
        expect(rasterAbtasten(rd.teil.daten, 20, 20)).toBeCloseTo(297.05, 2);
        // Weit daneben: unberührt
        expect(rasterAbtasten(rd.teil.daten, 20, 5)).toBeCloseTo(300.2, 6);
        const a = lauf.ableitungen.get(graben.nachher.ableitung);
        const k = a.kennzahlen;
        expect(k.dn).toBe(300);
        expect(k.sohlbreite).toBeCloseTo(1.1, 9);
        expect(k.laenge).toBeCloseTo(30.0015, 3);
        expect(k.rohrVolumen).toBeGreaterThan(1.9);           // 12-Eck ≈ 2,03 m³ (π wäre 2,12)
        expect(k.rohrVolumen).toBeLessThan(2.2);
        // Die Verfüllung geht von der GELTENDEN Masse aus (Teil XXI, P6) —
        // hier der Profilkörper, denn dieser Vorgang ist genau ein Graben.
        expect(k.koerperArt).toBe('profil');
        expect(k.massenQuelle).toBe('Querprofile');
        expect(k.aushubMasse).toBe(k.aushubKoerper);
        expect(k.verfuellung).toBeCloseTo(k.aushubMasse - k.rohrVolumen, 6);
        expect(k.aushubRaster).toBeGreaterThan(50);
        // Geböscht: beide Wege MÜSSEN übereinstimmen.
        expect(Math.abs(k.aushubKoerper - k.aushubRaster) / k.aushubRaster).toBeLessThan(0.02);
        expect(k.ueberdeckungMin).toBeGreaterThan(MINDEST_UEBERDECKUNG);
        // B3: das Alt-Journal trägt Böschung 1:0,5 (63°) — steiler als die 45° der
        // Bodenklasse „nichtbindig" ohne Nachweis (DIN 4124). Beraten, nicht
        // verbieten: der Graben entsteht, der Befund steht daneben.
        expect(a.befunde.map(b => b.regel)).toEqual(['boeschung_zu_steil']);
        expect(a.warnungen.some(w => w.startsWith('verfuellung_koerper_fehlt') && /Server/.test(w))).toBe(true);   // ohne Server-Kernel
        expect(a.bild.length).toBeGreaterThan(0);              // Grabenrand im Plan
    });

    it('ein flach liegendes Rohr bekommt den Befund ueberdeckung_gering — und wird trotzdem gebaut', async () => {
        const rohr = erzeugtEintrag({ rezept: 'rohr', kategorie: 'IFCPIPESEGMENT',
                                      parameter: { punkte: [[5, 299.6, 20], [35, 299.6, 20]], dn: 300 } });
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: rohr.globalId, gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: OP });
        const lauf = neuerAbleitungslauf({ stand: standAus([rohr, ...schritte]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const rg = await lauf.baue(schritte[0].globalId);
        expect(rg.ok).toBe(true);
        const a = lauf.ableitungen.get(schritte[0].nachher.ableitung);
        expect(a.befunde.map(b => b.regel)).toContain('ueberdeckung_gering');
        expect(a.kennzahlen.ueberdeckungMin).toBeLessThan(MINDEST_UEBERDECKUNG);
    });

    it('ein GELIEFERTES Rohr kommt über holeQuellForm als Linie mit DN — der DN gilt, wenn das Formular keinen nennt', async () => {
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: 'ROHR-A', gelaende: 'DGM1' }, raster: { cell: 0.5 },
                                              operationen: [{ art: 'kanalgraben', parameter: { dn: null, arbeitsraum: 0.5, bettung: 0.1, boeschung: 0 } }] });
        const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
        const lauf = neuerAbleitungslauf({ stand: standAus([...schritte, ...anzeige]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const r = await lauf.baue(anzeige[0].globalId);
        expect(r.ok).toBe(true);
        const k = lauf.ableitungen.get(schritte[0].nachher.ableitung).kennzahlen;
        expect(k.dn).toBe(400);
        expect(k.sohlbreite).toBeCloseTo(1.4, 9);
        // Sohle: 297,35 − 0,2 (r) − 0,1 = 297,05
        expect(rasterAbtasten(r.teil.daten, 20, 20)).toBeCloseTo(297.05, 2);
    });

    it('ein Rohr ohne Achse (eine gezeichnete Linie ist kein Rohr) macht KEIN halbes Ding', async () => {
        const linie = erzeugtEintrag({ rezept: 'linie', kategorie: 'IFCANNOTATION', parameter: { punkte: [[0, 300, 0], [10, 300, 0]] } });
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohr: linie.globalId, gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: OP });
        const lauf = neuerAbleitungslauf({ stand: standAus([linie, ...schritte]), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
        const r = await Promise.all(schritte.map(s => lauf.baue(s.globalId)));
        expect(r.every(x => x.ok === false)).toBe(true);
        // Seit dem Formpaar-Gate (2026-09-03) scheitert das FRÜHER und mit
        // besserem Grund: nicht mehr „liefert keine Form", sondern die Ansage,
        // welche Bauform hier gebraucht wird. Der Unterschied ist der zwischen
        // „geht nicht" und „nimm ein Rohr statt einer Linie".
        expect(r[0].fehler[0]).toMatch(/ist linie/);
        expect(r[0].fehler[0]).toMatch(/achse\+profil/);
    });
});
