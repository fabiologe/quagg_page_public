// @vitest-environment jsdom
/**
 * Stufe 1 des Aushub-Fachmodells — die ABNAHME aus dem Plan (2026-09-10):
 * „Ein Gelände, ein Stapel, eine Anzeige."
 *
 * Das Szenario, das der Befund nannte: ein geliefertes Gelände, darauf ein
 * Gerinne, ein Kanalgraben und eine Bauwerksgrube — über den ECHTEN Weg
 * (Katalog → Journal → Ableitungslauf mit echtem Kernel → Autor → Paket).
 * Vorher: drei TERRAIN im Raum (zwei verborgen), drei `geloescht`, 6,5 MB
 * Paket fast nur Gelände, und die Massen der Vorgänge liessen sich nicht
 * addieren, weil jeder auf einer anderen Kopie rechnete.
 *
 * Die Zahlen, die der Plan behauptet:
 *     TERRAIN im Journal          = 1   (die Anzeige)      — vorher 3
 *     IfcEarthworksCut            = 3   (je Vorgang einer)
 *     geloescht                   = 1   (das Ur, einmal)   — vorher 3
 *     Σ aushubRaster der Vorgänge = massenAus(ur, anzeige).aushub   (1e-6)
 *     Folgeformung nach der Grube = NEUER Vorgang (+1), nie rückwirkend
 *     Paket: keine Anzeigeform, jedes Bauteil mit Mengen und Vorgang
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';
import { erdbauStandVon, rezeptNach } from '../services/Bauteilrezepte.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { grundrissAusMesh } from '../services/geometrie/ops/Umriss.js';
import { massenAus } from '../services/gelaende/Operationen.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

// ── Fixtures: ein Gelände 40 × 40 m um 300 m NN, ein Rohr, ein Fundament ──
function gelaende() {
    const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
function quader(x0, z0, x1, z1, u, o) {
    const p = [];
    const ecke = (x, y, z) => p.push(x, y, z);
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
        ecke(ax, u, az); ecke(bx, u, bz); ecke(bx, o, bz);
        ecke(ax, u, az); ecke(bx, o, bz); ecke(ax, o, az);
    }
    return { positions: Float64Array.from(p), triCount: p.length / 9 };
}
const ROHR_ACHSE = { anfang: { x: 5, y: 297.5, z: 30 }, ende: { x: 35, y: 297.2, z: 30 } };
const FUNDAMENT = quader(20, 18, 28, 24, 296, 302);
const CELL = 0.5;
const urRaster = (cell = CELL, bereich = null) => rasterAusMesh({ mesh: gelaende() }, { cell, bereich }).ergebnis;
const holeQuellForm = async (gid, form, { cell, bereich = null } = {}) => {
    if (gid === 'DGM1' && form === 'raster') return urRaster(cell ?? CELL, bereich);
    if (gid === 'H1' && form === 'linie') return { punkte: [ROHR_ACHSE.anfang, ROHR_ACHSE.ende], dn: 300 };
    if (gid === 'FUND-1' && form === 'umriss') return grundrissAusMesh({ mesh: FUNDAMENT }).ergebnis;
    return null;
};

const UR = {
    modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT', globalId: 'DGM1', name: 'Urgelände', hoehenversatz: 300,
    quellmass: { pruefmass: { triCount: 3200, spanX: 40, spanY: 1.2, spanZ: 40 }, cell: CELL },
};
/** Der Kandidat, wie der Viewer ihn ans Subjekt hängt: die ANZEIGE, angereichert mit dem Erdbau-Stand. */
function anzeigeKandidat(stand) {
    const gid = [...stand].find(([, p]) => p.rezept === 'anzeige')?.[0];
    return { globalId: gid, name: stand.get(gid).name, herkunft: 'cde', pruefmass: null, cell: CELL, erdbau: erdbauStandVon(stand, gid) };
}
const ROHR = (stand) => ({
    modelId: 'm1', localId: 3, globalId: 'H1', name: 'H-001', hoehenversatz: 300,
    achse: { dn: 300, ...ROHR_ACHSE }, quellmass: { pruefmass: { triCount: 48 } },
    gelaendeQuellen: [anzeigeKandidat(stand)],
});
const BAUWERK = (stand) => ({
    globalId: 'FUND-1', modelId: 'm1', localId: 9, name: 'Fundament A', hoehenversatz: 300,
    quellmass: { pruefmass: { triCount: 24 } }, gelaendeQuellen: [anzeigeKandidat(stand)],
});

async function szenario() {
    const ae = useAenderungen();
    const trage = async (schritte, titel) => {
        expect(schritte, titel).not.toBeNull();
        const vg = ae.neueVorgangsId();
        for (const s of schritte) await ae.eintragen({ ...s, wer: 'Fabio', vorgang: vg, vorgangTitel: titel });
    };
    const stand = () => ae.wirksamerStand('erzeugt');
    // 1 · Gerinne am Ur
    await trage(nachId('gerinne-einschneiden').anwenden(UR,
        { sohleAnfang: 598, sohleEnde: 597.5, sohlbreite: 2, boeschung: 1.5 }, { zug: [{ x: 5, z: 10 }, { x: 35, z: 10 }] }), 'Gerinne');
    // 2 · Kanalgraben — der Planer wählt das, was er sieht: die Anzeige
    await trage(nachId('kanalgraben-ableiten').anwenden(ROHR(stand()),
        { gelaende: anzeigeKandidat(stand()).globalId, dn: 300, umfang: 'haltung', wandform: 'verbau', bettung: 0.1 }), 'Kanalgraben');
    // 3 · Bauwerksgrube, ebenso auf der Anzeige
    await trage(nachId('bauwerksgrube-ableiten').anwenden(BAUWERK(stand()),
        { gelaende: anzeigeKandidat(stand()).globalId, wandform: 'boeschung', boden: 'nichtbindig' }), 'Baugrube');
    return { ae, stand, trage };
}

const plaene = (stand, f) => [...stand.values()].filter(f);
const lauf = (stand) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });

describe('Stufe 1 — Abnahme am Szenario Ur + Gerinne + Kanalgraben + Bauwerksgrube', () => {
    it('im Journal: EIN Gelände (die Anzeige), drei Cuts, EIN geloescht, drei Vorgänge in Reihenfolge', async () => {
        const { ae, stand } = await szenario();
        const s = stand();
        expect(plaene(s, p => p.kategorie === 'IFCGEOGRAPHICELEMENT')).toHaveLength(1);           // vorher 3
        expect(plaene(s, p => p.kategorie === 'IFCEARTHWORKSCUT')).toHaveLength(3);
        expect(ae.wirksamerStand('geloescht').size).toBe(1);                                     // vorher 3
        expect([...ae.wirksamerStand('geloescht').keys()]).toEqual(['DGM1']);
        const anzeige = plaene(s, p => p.rezept === 'anzeige')[0];
        expect(anzeige.rolle).toBe('anzeige');
        expect(anzeige.parameter.quellen).toEqual({ gelaende: 'DGM1' });
        expect(anzeige.parameter.vorgaenge.map(v => v.art)).toEqual(['erdbau', 'kanalgraben', 'bauwerksgrube']);
        expect(anzeige.parameter.vorgaenge.map(v => v.titel)).toEqual(['Urgelände · Gelände formen', 'H-001 · Kanalgraben', 'Fundament A · Bauwerksgrube']);
        // JEDER Vorgang fusst auf dem Ur — keine Kette über Kopien.
        for (const p of plaene(s, p => p.rezept !== 'anzeige')) expect(p.parameter.quellen.gelaende).toBe('DGM1');
        // Der Erdbau-Stand, von jedem Punkt aus gleich.
        const eb = erdbauStandVon(s, 'DGM1');
        expect(eb.vorgaenge).toHaveLength(3);
        expect(eb.letzter.art).toBe('bauwerksgrube');
        expect(erdbauStandVon(s, anzeige.parameter ? [...s].find(([, p]) => p === anzeige)[0] : null)).toEqual(eb);
    });

    it('im Lauf: die Summe der Vorgänge IST die Gesamtmasse der Anzeige (1e-6), jeder Cut kennt seine Reihe', async () => {
        const { stand } = await szenario();
        const s = stand();
        const l = lauf(s);
        const cuts = [...s].filter(([, p]) => p.kategorie === 'IFCEARTHWORKSCUT');
        for (const [gid] of cuts) {
            const r = await l.baue(gid);
            expect(r.ok, gid).toBe(true);
            expect(r.teil.form).toBe('koerper');
        }
        const anzeigeGid = [...s].find(([, p]) => p.rezept === 'anzeige')[0];
        const rz = await l.baue(anzeigeGid);
        expect(rz.ok && rz.teil.form === 'raster').toBe(true);
        expect(l.misserfolge).toEqual([]);
        const k = cuts.map(([, p]) => l.ableitungen.get(p.ableitung).kennzahlen);
        expect(k.map(x => x.reihe)).toEqual([0, 1, 2]);
        expect(k.every(x => x.aushubRaster > 5)).toBe(true);
        const gesamt = massenAus(urRaster(), rz.teil.daten);
        const summe = k.reduce((a, x) => a + x.aushubRaster, 0);
        expect(summe).toBeCloseTo(gesamt.aushub, 6);
        expect(l.ableitungen.get(s.get(anzeigeGid).ableitung).kennzahlen).toMatchObject({ aushubGesamt: gesamt.aushub, vorgaenge: 3 });
        // Zelle für Zelle: die Anzeige liegt nirgends ÜBER dem Ur (drei Cuts, kein Auftrag)
        const ur = urRaster();
        let ueber = 0;
        for (let i = 0; i < ur.heights.length; i++) if (rz.teil.daten.heights[i] > ur.heights[i] + 1e-9) ueber++;
        expect(ueber).toBe(0);
    });

    it('Folgeformung NACH der Grube ist ein neuer Vorgang — der Graben wird nicht rückwirkend geändert', async () => {
        const { stand, trage } = await szenario();
        const vorher = stand();
        const anzeige = anzeigeKandidat(vorher);
        const subjekt = { ...UR, globalId: anzeige.globalId, name: anzeige.name, stand: { bauplan: vorher.get(anzeige.globalId) }, erdbau: anzeige.erdbau };
        await trage(nachId('planum-herstellen').anwenden(subjekt, { hoehe: 599 },
            { zug: [{ x: 2, z: 34 }, { x: 8, z: 34 }, { x: 8, z: 38 }, { x: 2, z: 38 }] }), 'Planum');
        const s = stand();
        const erdbau = plaene(s, p => p.rezept === 'erdbau');
        expect(new Set(erdbau.map(p => p.ableitung)).size).toBe(2);                              // +1
        expect(plaene(s, p => p.kategorie === 'IFCGEOGRAPHICELEMENT')).toHaveLength(1);           // immer noch EINE Anzeige
        expect(s.get(anzeige.globalId).parameter.vorgaenge.map(v => v.art)).toEqual(['erdbau', 'kanalgraben', 'bauwerksgrube', 'erdbau']);
        // Der erste Erdbau-Vorgang blieb, wie er war.
        const erster = erdbau.find(p => p.ableitung === anzeige.erdbau.vorgaenge[0].ableitung);
        expect(erster.parameter.operationen.map(o => o.art)).toEqual(['gerinne']);
        // Und noch einmal formen: jetzt ist der LETZTE ein Erdbau — die Liste wächst, keine dritte Klammer.
        const nochmal = anzeigeKandidat(s);
        await trage(nachId('planum-herstellen').anwenden({ ...subjekt, erdbau: nochmal.erdbau }, { hoehe: 598.5 },
            { zug: [{ x: 12, z: 34 }, { x: 18, z: 34 }, { x: 18, z: 38 }, { x: 12, z: 38 }] }), 'Planum 2');
        const s2 = stand();
        expect(new Set(plaene(s2, p => p.rezept === 'erdbau').map(p => p.ableitung)).size).toBe(2);
        expect(s2.get(anzeige.globalId).parameter.vorgaenge).toHaveLength(4);
        const letzter = erdbauStandVon(s2, 'DGM1').letzter;
        expect(letzter.art).toBe('erdbau');
        expect(letzter.operationen.map(o => o.art)).toEqual(['planum', 'planum']);
    });

    it('am Autor: die Anzeige bleibt draussen, jedes Bauteil trägt Mengen und Vorgang — das Paket kennt kein TERRAIN', async () => {
        const { ae, stand } = await szenario();
        const s = stand();
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 300 });
        const schritte = [...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert }));
        const g = await autor.eigenbauGeometrien(schritte, { verdeckt: new Set(ae.wirksamerStand('geloescht').keys()) });
        expect(g.misserfolge).toEqual([]);
        expect(g.anzeigeformen).toHaveLength(1);
        expect(g.bauteile.map(b => b.kategorie)).not.toContain('IFCGEOGRAPHICELEMENT');
        const cuts = g.bauteile.filter(b => b.kategorie === 'IFCEARTHWORKSCUT');
        expect(cuts).toHaveLength(3);
        expect(cuts.map(b => b.vorgang.reihe)).toEqual([0, 1, 2]);
        expect(cuts.map(b => b.vorgang.art)).toEqual(['erdbau', 'kanalgraben', 'bauwerksgrube']);
        expect(cuts.map(b => b.vorgang.titel)).toEqual(['Urgelände · Gelände formen', 'H-001 · Kanalgraben', 'Fundament A · Bauwerksgrube']);
        expect(cuts.every(b => b.kennzahlen.aushubRaster > 5)).toBe(true);
        // Das Paket (Nachbarsitzung, Vertrag v1): keine Anzeigeform, kein zweites Gelände, Wirt = Ur DIREKT.
        const paket = baueEigenbauPaket({ teile: g.bauteile, stand: s, nachProjekt: (p) => ({ ost: p.x, nord: -p.z, hoehe: p.y }), crs: 'EPSG:25832' });
        expect(paket.bauteile.map(b => b.klasse)).not.toContain('IFCGEOGRAPHICELEMENT');
        expect(paket.bauteile.filter(b => b.klasse === 'IFCEARTHWORKSCUT').every(b => b.wirt === 'DGM1')).toBe(true);
        expect(paket.bauteile.every(b => (b.ersetzt ?? []).length === 0)).toBe(true);
        expect(JSON.stringify(paket).length).toBeLessThan(1_000_000);
    });
});
