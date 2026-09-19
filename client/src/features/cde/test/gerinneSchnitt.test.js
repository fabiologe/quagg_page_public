// @vitest-environment jsdom
/**
 * Der Gerinne-Schnitt (Teil XX, Stufe D — 2026-09-19).
 *
 * Fabio (2026-09-10): „später ein Gerinne-Schnitt wie in SaintV-2D." Zwei
 * Teile: das Querprofil als Skizze im Formular (aus der Vorschau, mit den
 * Zahlen, mit denen die Operation rechnet) und der Schnitt an einer Station
 * eines fertigen Gerinnes/Grabens — Urgelände, Gelände jetzt, Soll-Trapez.
 *
 * Gemessen an der echten Rechnung: Soll gegen die Handrechnung (eben und mit
 * Querneigung), „Gelände jetzt" gegen das Raster des echten Laufs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { hoeheImRaster } from '../services/geometrie/SurfaceOps.js';
import { querschnittBei } from '../services/gelaende/Querschnitt.js';
import { schnittachseVon, schnittSicht } from '../services/QuerschnittSicht.js';
import { vorschauFuer } from '../services/Vorschau.js';
import { nachId } from '../services/Bearbeitungen.js';
import { provideViewerApi } from '../composables/viewerApi.js';
import CdeQuerschnitt from '../components/CdeQuerschnitt.vue';
import CdeQuerprofilSkizze from '../components/CdeQuerprofilSkizze.vue';
import * as THREE from 'three';
import { IfcOverlay } from '../services/IfcOverlay.js';

afterEach(() => { document.body.innerHTML = ''; });

const MM = 1e-3;
const eben = (h0) => () => h0;
/** Gerade Achse von (0|0) nach (40|0), Sohle 98 → 97 (Welt), b = 2, 1 : 1,5. */
const GERADE = { achse: [{ x: 0, y: 98, z: 0 }, { x: 40, y: 97, z: 0 }], sohlbreite: 2, neigung: 1.5 };

describe('querschnittBei — die Rechnung', () => {
    it('eben: das Soll-Trapez trifft das Urgelände bei ± (b/2 + Tiefe · n), die Sohle liegt nach der Weglänge', () => {
        const s = querschnittBei(GERADE, 20, { urAn: eben(100) });
        expect(s.sohle).toBeCloseTo(97.5, 12);                               // halbe Weglänge
        expect(s.tiefe).toBeCloseTo(2.5, 12);
        const oben = 1 + 2.5 * 1.5;
        expect(s.soll.map(p => [p.d, p.y])).toEqual([
            [expect.closeTo(-oben, 3), expect.closeTo(100, 3)], [-1, 97.5], [1, 97.5], [expect.closeTo(oben, 3), expect.closeTo(100, 3)]]);
        expect(s.obenBreite).toBeCloseTo(2 * oben, 3);
        // Die Querlinie steht senkrecht zur Achse — links ist Norden (−z).
        expect(s.richtung).toEqual({ x: 0, z: -1 });
    });

    it('mit Querneigung: jede Seite trifft IHR Gelände — die höhere weiter aussen', () => {
        // Gelände steigt nach Süden (+z): h = 100 + 0,1 · z. Rechts der Achse (Ost-Lauf) ist Süden.
        const urAn = (x, z) => 100 + 0.1 * z;
        const s = querschnittBei(GERADE, 20, { urAn });
        const [l, , , r] = s.soll;
        expect(r.d).toBeGreaterThan(-l.d);                                   // rechts (höher) weiter aussen
        // Der Schnittpunkt liegt AUF dem Gelände — auf den Millimeter.
        expect(Math.abs(l.y - urAn(0, l.d))).toBeLessThan(MM);               // +d = rechts = Süden (+z), −d = Norden
        expect(Math.abs(r.y - urAn(0, r.d))).toBeLessThan(MM);
        // Handrechnung rechts: 97,5 + (d − 1)/1,5 = 100 + 0,1 d ⇒ d = (2,5 + 0,667)/(0,667 − 0,1)
        expect(r.d).toBeCloseTo((2.5 + 1 / 1.5) / (1 / 1.5 - 0.1), 2);
    });

    it('senkrechte Wände: oben = Sohlbreite; ohne Urgelände kein Schnitt', () => {
        const s = querschnittBei({ ...GERADE, neigung: 0 }, 10, { urAn: eben(100) });
        expect(s.obenBreite).toBeCloseTo(2, 12);
        expect(s.soll[0]).toEqual({ d: -1, y: 100 });
        expect(querschnittBei(GERADE, 10, {})).toBeNull();
    });

    it('die Station wird auf die Achse geklemmt', () => {
        expect(querschnittBei(GERADE, 99, { urAn: eben(100) }).station).toBe(40);
        expect(querschnittBei(GERADE, -5, { urAn: eben(100) }).station).toBe(0);
    });
});

// ── Am echten Lauf ───────────────────────────────────────────────────────────
function netz(n = 80) {
    const t = [];
    for (let x = 0; x < n; x += 2) for (let z = 0; z < n; z += 2) {
        const a = [x, 100, z], b = [x + 2, 100, z], c = [x + 2, 100, z + 2], d = [x, 100, z + 2];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = netz();
const holeQuellForm = async (gid, form, o = {}) => {
    if (gid === 'DGM1' && form === 'raster') return rasterAusMesh({ mesh: NETZ }, { cell: o.cell ?? 0.5, bereich: o.bereich ?? null, gitter: o.gitter ?? null }).ergebnis;
    if (gid === 'H1' && form === 'linie') return { punkte: [{ x: 10, y: 97.5, z: 60 }, { x: 50, y: 97.5, z: 60 }], dn: 400, achsbezug: 'sohle', quelle: 'axisRep' };
    return null;
};
async function laufe(rezept, quellen, operationen) {
    const schritte = ableitungsSchritte({ rezept, quellen, raster: { cell: 0.5 }, operationen, name: 'Probe' });
    const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 },
                                         vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
    const l = neuerAbleitungslauf({ stand: new Map([...schritte, ...anzeige].map(s => [s.globalId, s.nachher])), rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
    await l.baue(schritte[0].globalId);
    const rd = await l.baue(anzeige[0].globalId);
    return { plan: schritte[0].nachher, lauf: l.ableitungen.get(schritte[0].nachher.ableitung), anzeige: rd.teil.daten };
}
const GERINNE = { art: 'gerinne', parameter: { achse: [{ x: 10, z: 20 }, { x: 40, z: 20 }], sohlbreite: 2, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 97 } };

describe('Das Rezept nennt die Achse — Gerinne und Kanalgraben', () => {
    it('Gerinne: Sohle linear über die Weglänge (Höhen in NN → Welt), Breite, Neigung', async () => {
        const { plan, lauf } = await laufe('erdbau', { gelaende: 'DGM1' }, [GERINNE]);
        const a = schnittachseVon(plan, { lauf, hoehenversatz: 0 });
        expect(a).toMatchObject({ sohlbreite: 2, neigung: 1.5, titel: 'Gerinne einschneiden' });
        expect(a.achse.map(p => p.y)).toEqual([98, 97]);
        expect(schnittachseVon(plan, { lauf, hoehenversatz: 300 }).achse[0].y).toBe(-202);    // 98 m NN − 300
    });

    it('Gelände jetzt = das Raster des Laufs; das Soll deckt sich mit ihm im Graben', async () => {
        const { plan, lauf, anzeige } = await laufe('erdbau', { gelaende: 'DGM1' }, [GERINNE]);
        const s = schnittSicht(schnittachseVon(plan, { lauf }), 15, {
            urAn: eben(100), istAn: (x, z) => hoeheImRaster(anzeige, x, z) });
        expect(s.sohle).toBeCloseTo(97.5, 9);
        const ist = (d) => s.ist.find(p => Math.abs(p.d - d) < 1e-9)?.y;
        expect(ist(0)).toBeCloseTo(97.5, 1);                                      // Sohle
        expect(ist(2.5)).toBeCloseTo(97.5 + 1.5 / 1.5, 1);                        // Böschung
        expect(ist(s.halb - 0.5)).toBeCloseTo(100, 6);                            // draussen: Gelände
        expect(s.linie).toHaveLength(2);
    });

    it('Kanalgraben: die Stationen des Laufs — Grabensohle und Sohlbreite der Norm; eine Grube hat keinen Schnitt', async () => {
        const KG = [{ art: 'kanalgraben', parameter: { umfang: 'haltung', achsbezug: 'quelle', wandform: 'boeschung', boden: 'nichtbindig',
                                                        winkelGrad: 45, wanddickeMm: 0, breite: null, bettung: 0.1, schachtMass: 1.0, dn: null } }];
        const { plan, lauf } = await laufe('kanalgraben', { rohre: ['H1'], schaechte: [], gelaende: 'DGM1' }, KG);
        const a = schnittachseVon(plan, { lauf });
        expect(a.titel).toBe('Kanalgraben');
        expect(a.neigung).toBeCloseTo(1, 12);
        expect(a.achse[0].y).toBeCloseTo(97.4, 9);                                // Rohrsohle − Bettung
        const s = schnittSicht(a, 20, { urAn: eben(100) });
        expect(s.obenBreite).toBeCloseTo(a.sohlbreiten[0] + 2 * 2.6, 3);
        expect(schnittachseVon(plan, { lauf: null })).toBeNull();                 // ohne Lauf keine Stationen
        const GRUBE = { art: 'grube', parameter: { umriss: [{ x: 5, y: 100, z: 5 }, { x: 15, y: 100, z: 5 }, { x: 15, y: 100, z: 15 }], sohle: 98, neigung: 1 } };
        const g = await laufe('erdbau', { gelaende: 'DGM1' }, [GRUBE]);
        expect(schnittachseVon(g.plan, { lauf: g.lauf })).toBeNull();
    });
});

describe('Die Skizze im Formular', () => {
    it('die Vorschau des Gerinnes liefert das Profil mit den Zahlen der Operation', () => {
        const w = nachId('gerinne-einschneiden');
        expect(w).toBeTruthy();
        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: [GERINNE], name: 'Ur' });
        const v = vorschauFuer(schritte, { hoeheAn: () => 100, hoehenversatz: 0 });
        expect(v.profile).toEqual([{ titel: 'Gerinne', sohlbreite: 2, neigung: 1.5, tiefe: expect.any(Number) }]);
        expect(v.profile[0].tiefe).toBeGreaterThanOrEqual(2);                     // bis 3 m tief (Sohle 97 am Ende)
    });

    it('die Skizze zeigt Sohle, oben, Tiefe und 1 : n', () => {
        const w = mount(CdeQuerprofilSkizze, { props: { profil: { titel: 'Gerinne', sohlbreite: 2, neigung: 1.5, tiefe: 2 } } });
        expect(w.text()).toContain('Sohle 2,00 m');
        expect(w.text()).toContain('oben 8,00 m');
        expect(w.text()).toContain('Tiefe 2,00 m');
        expect(w.text()).toContain('1 : 1,5');
        expect(w.find('polyline').attributes('points')).toBe('-4,0 -1,2 1,2 4,0');
    });
});

describe('Nebenbefund der Browserprobe: ein Gerinne ohne Länge', () => {
    it('zweimal dieselbe Stelle getippt: abgelehnt, mit Grund — vorher entstand ein Gerinne der Länge 0', () => {
        const w = nachId('gerinne-einschneiden');
        const el = { globalId: 'DGM1', name: 'Ur', hoehenversatz: 0, quellmass: { pruefmass: null, cell: 1 } };
        const werte = { sohleAnfang: 98, sohleEnde: 98, sohlbreite: 1, boeschung: 1.5 };
        const gleich = [{ x: 5, y: 100, z: 5 }, { x: 5, y: 100, z: 5 }];
        expect(w.warumNicht(el, werte, { zug: gleich })).toMatch(/keine Länge/);
        expect(w.anwenden(el, werte, { zug: gleich })).toBeNull();
        const gut = [{ x: 5, y: 100, z: 5 }, { x: 25, y: 100, z: 5 }];
        expect(w.warumNicht(el, werte, { zug: gut })).toBeNull();
        expect(w.anwenden(el, werte, { zug: gut })?.length).toBeGreaterThan(0);
    });
});

describe('Die Querlinie im Raum', () => {
    it('das Overlay kennt die Ebene — im Browser warf die erste Fassung „unbekannte Ebene"', () => {
        const scene = new THREE.Scene();
        const overlay = new IfcOverlay({ getWorld: () => ({ scene: { three: scene }, camera: { three: new THREE.PerspectiveCamera() } }) });
        const s = querschnittBei(GERADE, 20, { urAn: eben(100) });
        expect(() => overlay.zeige('querschnitt', [{ art: 'linie', punkte: [s.punkt, { ...s.punkt, x: s.punkt.x + 1 }], farbe: '#0af' }])).not.toThrow();
        expect(() => overlay.leere('querschnitt')).not.toThrow();
    });
});

describe('Der Schnitt in der Tafel', () => {
    it('Station ziehen: Zahlen und Querlinie folgen; beim Schliessen geht die Linie', async () => {
        setActivePinia(createPinia());
        const { plan, lauf, anzeige } = await laufe('erdbau', { gelaende: 'DGM1' }, [GERINNE]);
        const zeigeQuerlinie = vi.fn();
        const api = {
            laufVon: () => lauf, urSampler: vi.fn(async () => ({ sample: () => 100 })), bereiteGelaendeVor: async () => null,
            hoeheAn: (x, z) => hoeheImRaster(anzeige, x, z), zeigeQuerlinie,
        };
        const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(CdeQuerschnitt, { subjekt: { stand: { bauplan: plan }, hoehenversatz: 0 } }); } });
        const w = mount(Huelle, { attachTo: document.body });
        await new Promise(r => setTimeout(r, 20)); await nextTick();
        expect(api.urSampler).toHaveBeenCalledWith('DGM1');
        expect(w.text()).toContain('97,50 m NN');                                 // Mitte der 30-m-Achse
        expect(w.text()).toContain('oben9,50 m');                                 // oben: 2 + 2 · 2,5 · 1,5
        const linie1 = zeigeQuerlinie.mock.calls.at(-1)[0];
        expect(linie1[0].x).toBeCloseTo(25, 9);
        await w.find('input[type=number]').setValue(5);
        await nextTick();
        expect(w.text()).toContain('97,83 m NN');
        expect(zeigeQuerlinie.mock.calls.at(-1)[0][0].x).toBeCloseTo(15, 9);
        w.unmount();
        expect(zeigeQuerlinie).toHaveBeenLastCalledWith(null);
    });
});
