// @vitest-environment jsdom
/**
 * Stufe 1 des Aushub-Fachmodells — die ABNAHME aus dem Plan (2026-09-10):
 * „Ein Gelände, ein Stapel, eine Anzeige." Seit Stufe 2 auch: das Paket v2.
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
 *
 * Das Szenario liegt in `hilfen/erdbauSzenario.js` — derselbe Aufbau, den der
 * Paket-Vertrag der Stufe 2 an den Python-Schreiber übergibt.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId } from '../services/Bearbeitungen.js';
import { erdbauStandVon } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { massenAus } from '../services/gelaende/Operationen.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { erdbauSzenario } from './hilfen/erdbauSzenario.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const S = erdbauSzenario();
const { UR, urRaster, holeQuellForm, anzeigeKandidat, lauf } = S;
const szenario = () => S.spiele();
const plaene = (stand, f) => [...stand.values()].filter(f);

describe('Stufe 1 — Abnahme am Szenario Ur + Gerinne + Kanalgraben + Bauwerksgrube', () => {
    it('im Journal: EIN Gelände (die Anzeige), drei Cuts, EIN geloescht, drei Vorgänge in Reihenfolge', async () => {
        const { ae, stand } = await szenario();
        const s = stand();
        expect(plaene(s, p => p.kategorie === 'IFCGEOGRAPHICELEMENT')).toHaveLength(1);           // vorher 3
        expect(plaene(s, p => p.kategorie === 'IFCEARTHWORKSCUT')).toHaveLength(3);
        expect(ae.wirksamerStand('geloescht').size).toBe(1);                                     // vorher 3
        expect([...ae.wirksamerStand('geloescht').keys()]).toEqual(['DGM1']);
        const [anzeigeGid, anzeige] = [...s].find(([, p]) => p.rezept === 'anzeige');
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
        expect(erdbauStandVon(s, anzeigeGid)).toEqual(eb);
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
        // Kein Vorgang schneidet hier durch einen Auftrag (es gibt keinen).
        expect(k.map(x => x.aushubAusAuffuellung)).toEqual([0, 0, 0]);
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

    it('am Autor und im Paket v2: die Anzeige bleibt draussen, jedes Bauteil trägt Mengen, Vorgang und Fachmodell', async () => {
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
        // Stufe 2: die MENGE ist die Kennzahl, die das Rezept deklariert — DIESELBE Zahl wie im Mengenreiter.
        expect(cuts.map(b => b.mengen.undisturbedVolume)).toEqual(cuts.map(b => b.kennzahlen.aushubRaster));
        const graben = cuts.find(b => b.vorgang.art === 'kanalgraben');
        expect(graben.mengen.length).toBe(graben.kennzahlen.laenge);
        expect(g.bauteile.every(b => b.fachmodell === 'erdbau')).toBe(true);
        expect(cuts.every(b => b.schneidetAuffuellung.length === 0)).toBe(true);
        // Das Paket: keine Anzeigeform (sie steht, mit Grund, unter `uebersprungen`),
        // kein `ersetzt`, Wirt und Quelle = Ur DIREKT.
        const paket = baueEigenbauPaket({ teile: g.bauteile, stand: s, anzeigeformen: g.anzeigeformen,
                                          nachProjekt: (p) => ({ ost: p.x, nord: -p.z, hoehe: p.y }), crs: 'EPSG:25832' });
        expect(paket.version).toBe(2);
        expect(paket.bauteile.map(b => b.klasse)).not.toContain('IFCGEOGRAPHICELEMENT');
        const pc = paket.bauteile.filter(b => b.klasse === 'IFCEARTHWORKSCUT');
        expect(pc.every(b => b.wirt === 'DGM1' && b.quellen.gelaende === 'DGM1')).toBe(true);
        expect(pc.find(b => b.vorgang.art === 'kanalgraben').quellen.rohre).toEqual(['H1']);
        expect(pc.find(b => b.vorgang.art === 'bauwerksgrube').quellen.bauteil).toBe('FUND-1');
        expect(paket.bauteile.some(b => 'ersetzt' in b)).toBe(false);
        expect(paket.uebersprungen.map(u => u.grund)).toEqual([expect.stringMatching(/Anzeigeform/)]);
        expect(JSON.stringify(paket).length).toBeLessThan(1_000_000);
    });
});
