// @vitest-environment jsdom
/**
 * „Ecken ziehen" an den übrigen Körpern (Teil XXII, Rest — 2026-09-19).
 *
 * Fabio (2026-09-18): „… dann an ALLEN Ecken eines Körpers." Bis hierher
 * hatten nur Grube, Schüttung und die Knicke einer Böschungskante Ecken; ein
 * Gerinne, ein Kanalgraben und eine Baugrube ums Bauwerk hatten KEINE (der
 * Knopf fehlte), und der Fuss einer Böschung an einer Kante auch nicht. Ihre
 * Ecken sind kein Punkt im Journal, sondern die Folge eines Masses — wer
 * sie zieht, zieht das Mass (`gelaende/Eckmasse.js`).
 *
 * Gemessen am ECHTEN Lauf (Rezept, Kernel, Böschungskanten) auf ebenem
 * Gelände (100 m), damit die Sollwerte nachrechenbar sind: die Ecke landet
 * dort, wo sie abgelegt wurde — gemessen an der Ecke, die der NEUE Lauf
 * zeigt. Die Oberkante ist eine Isolinie des Rasters; ihre Lage stimmt auf
 * eine Rasterzelle (0,5 m).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { grundrissAusMesh } from '../services/geometrie/ops/Umriss.js';
import { hoeheImRaster } from '../services/geometrie/SurfaceOps.js';
import { griffeFuer, griffZuWerten, hatErdbauEcken } from '../services/Griffe.js';
import { massWert, querlage, querrichtung } from '../services/gelaende/Eckmasse.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useGriffe } from '../composables/useGriffe.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';

const FLACH = 100;
const ZELLE = 0.5;
const RASTERFEHLER = ZELLE;

/** Ebenes Gelände 0 … 80 m auf 100 m. */
function netz(n = 80) {
    const t = [];
    for (let x = 0; x < n; x += 2) for (let z = 0; z < n; z += 2) {
        const a = [x, FLACH, z], b = [x + 2, FLACH, z], c = [x + 2, FLACH, z + 2], d = [x, FLACH, z + 2];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = netz();

/** Ein Quader (Fundament) von (x0,z0) bis (x1,z1), Unterkante u, Oberkante o. */
function quader(x0, z0, x1, z1, u, o) {
    const p = [];
    const ecke = (x, y, z) => p.push(x, y, z);
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
        ecke(ax, u, az); ecke(bx, u, bz); ecke(bx, o, bz);
        ecke(ax, u, az); ecke(bx, o, bz); ecke(ax, o, az);
    }
    return { positions: Float64Array.from(p), triCount: p.length / 9 };
}

const HALTUNG = [{ x: 10, y: 97.5, z: 60 }, { x: 50, y: 97.5, z: 60 }];       // Sohle (Achs-Repräsentation), DN 400
const holeQuellForm = async (gid, form, o = {}) => {
    if (gid === 'DGM1' && form === 'raster') {
        return rasterAusMesh({ mesh: NETZ }, { cell: o.cell ?? ZELLE, bereich: o.bereich ?? null, gitter: o.gitter ?? null }).ergebnis;
    }
    if (gid === 'H1' && form === 'linie') return { punkte: HALTUNG, dn: 400, achsbezug: 'sohle', quelle: 'axisRep' };
    if (gid === 'FUND-1' && form === 'umriss') return grundrissAusMesh({ mesh: quader(20, 20, 30, 28, 96, 102) }).ergebnis;
    return null;
};

/** Den Vorgang rechnen wie der Autor: Rezept, Kernel, Kanten — und was der Lauf dazu weiss. */
async function laufe(schritte) {
    const ab = schritte[0].nachher.ableitung;
    const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: ZELLE },
                                         vorgaenge: [{ ableitung: ab }] });
    const l = neuerAbleitungslauf({ stand: new Map([...schritte, ...anzeige].map(s => [s.globalId, s.nachher])),
                                    rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
    const r = await l.baue(schritte[0].globalId);
    expect(r.ok).toBe(true);
    const rd = await l.baue(anzeige[0].globalId);
    return { schritte, vorgang: l.ableitungen.get(ab), anzeige: rd.teil?.daten ?? null };
}
const vorgang = (rezept, quellen, operationen) => laufe(ableitungsSchritte({ rezept, quellen, raster: { cell: ZELLE }, operationen, name: 'Probe' }));

/** Das Subjekt, wie der Store es für einen eigenen Vorgang anlegt (Teile samt Kennungen). */
const subjekt = (schritte) => ({
    globalId: schritte[0].globalId, name: schritte[0].nachher.name, modelId: 'cde-eigenbau', hoehenversatz: 0,
    versatz: { x: 0, y: 0, z: 0 },
    stand: { bauplan: schritte[0].nachher, teile: new Map(schritte.map(s => [s.nachher.rolle, { globalId: s.globalId, bauplan: s.nachher }])) },
});
const griffe = ({ schritte, vorgang: v }) => griffeFuer({ subjekt: subjekt(schritte), subjektHerkunft: 'cde', bauform: 'koerper', vorgang: v });
const griff = (g, schluessel, achsen = 'XZ') => g.find(x => x.key.endsWith(`:${schluessel}`) && x.achsen === achsen)
    ?? g.find(x => x.key.endsWith(`:${schluessel}:hoch`) && x.achsen === achsen);
/** Die Ecke um `um` Meter weiter nach aussen auf ihrer Linie — dorthin wird sie gezogen. */
const weiter = (g, um) => ({ x: g.pos.x + g.mass.richtung.x * um, y: g.pos.y, z: g.pos.z + g.mass.richtung.z * um });
/** Einen Griff ziehen und mit dem Werkzeug ablegen — die Schritte, die er schreibt. */
function ziehe(t, g, ziel) {
    const werte = griffZuWerten(g, ziel, { versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0 });
    return nachId(g.werkzeug).anwenden(subjekt(t.schritte), werte);
}
const opVon = (schritte) => schritte[0].nachher.parameter.operationen[0].parameter;

describe('Eckmasse: aus der Lage das Mass', () => {
    it('linear, Neigung und Winkel — und nie eine Böschung, die vor ihrem Anfang begänne', () => {
        const u = { x: 0, z: 0 }, r = { x: 1, z: 0 };
        expect(massWert({ art: 'linear', ursprung: u, richtung: r, t0: 1, w0: 2, k: 2 }, 1.6)).toBeCloseTo(3.2, 12);
        expect(massWert({ art: 'neigung', t0: 4, s: 1, w0: 1.5 }, 7)).toBeCloseTo(3, 12);
        expect(massWert({ art: 'neigung', t0: 4, s: 1, w0: 1.5 }, 0.5)).toBeNaN();
        // 45° (1 : 1) auf der doppelten Weite: 1 : 2 ⇒ 26,57°
        expect(massWert({ art: 'winkel', t0: 3, s: 1, w0: 45 }, 5)).toBeCloseTo(Math.atan(0.5) * 180 / Math.PI, 9);
        expect(querlage({ ursprung: u, richtung: r }, { x: 2.5, z: 9 })).toBe(2.5);
    });

    it('„links" ist dieselbe Seite wie in der Rechnung der Böschung (Ost = x, Nord = −z)', () => {
        const r = querrichtung([{ x: 0, z: 0 }, { x: 10, z: 0 }], 0, 1);           // nach Osten
        expect([r.x, r.z]).toEqual([0, -1]);                                      // links = Norden = −z
    });
});

describe('Gerinne: Achse, Sohlkanten, Oberkanten', () => {
    // 30 m nach Osten, dann nach Nordosten; Sohle 98,00 → 97,50 über die Weglänge.
    const GERINNE = { art: 'gerinne', parameter: { achse: [{ x: 10, z: 20 }, { x: 40, z: 20 }, { x: 55, z: 10 }],
                                                    sohlbreite: 2, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 97.5 } };
    const gerinne = () => vorgang('erdbau', { gelaende: 'DGM1' }, [GERINNE]);

    it('ein Gerinne-Vorgang hat Ecken (vorher: keine, der Knopf fehlte) — Achse mit Sohlhöhe, je Ende zwei Sohl- und zwei Oberkanten', async () => {
        const t = await gerinne();
        expect(hatErdbauEcken(t.schritte[0].nachher)).toBe(true);
        const g = griffe(t);
        expect(g.every(x => x.ecken)).toBe(true);
        expect(g.filter(x => /:achse:\d$/.test(x.key))).toHaveLength(3);
        expect(g.filter(x => /:achse:\d:hoch$/.test(x.key))).toHaveLength(2);       // Anfang und Ende
        expect(g.filter(x => x.key.includes(':sohlkante:'))).toHaveLength(4);
        expect(g.filter(x => x.key.includes(':oberkante:'))).toHaveLength(4);
        // Die Achse sitzt auf der Sohle; die Sohle der Mitte liegt nach der Weglänge (30 von 48 m).
        expect(griff(g, 'achse:1').pos.y).toBeCloseTo(98 - 0.5 * 30 / (30 + Math.hypot(15, 10)), 9);
        // Oberkante: halbe Sohlbreite + Tiefe · n = 1 + 2 · 1,5 = 4 m neben der Achse.
        const ok = griff(g, 'oberkante:0:1');
        expect(Math.abs(querlage(ok.mass, ok.pos) - 4)).toBeLessThanOrEqual(RASTERFEHLER);
    });

    it('die Sohlkante gezogen: die Sohlbreite folgt — und die Sohle liegt dort', async () => {
        const t = await gerinne();
        const g = griff(griffe(t), 'sohlkante:0:1');
        const s = ziehe(t, g, weiter(g, 0.6));
        expect(s.map(x => x.globalId).sort()).toEqual(t.schritte.map(x => x.globalId).sort());   // Kennungen bleiben
        expect(opVon(s).sohlbreite).toBe(3.2);
        const neu = await laufe(s);
        const g2 = griff(griffe(neu), 'sohlkante:0:1');
        expect(Math.hypot(g2.pos.x - weiter(g, 0.6).x, g2.pos.z - weiter(g, 0.6).z)).toBeLessThan(1e-9);
        // Im gerechneten Gelände: 1,5 m neben der Achse am Anfang ist jetzt Sohle (vorher Böschung, 99,25).
        const p = { x: 12, z: 20 - 1.5 };
        expect(hoeheImRaster(neu.anzeige, p.x, p.z)).toBeCloseTo(98 - 0.5 * 2 / 48.03, 1);
    });

    it('die Oberkante gezogen: die Böschung wird flacher, die Oberkante liegt am Ziel', async () => {
        const t = await gerinne();
        const g = griff(griffe(t), 'oberkante:0:1');
        const ziel = { x: 10, y: g.pos.y, z: 20 - 6 };           // 6 m links der Achse
        const s = ziehe(t, g, ziel);
        expect(opVon(s).boeschung).toBeGreaterThan(2);
        const g2 = griff(griffe(await laufe(s)), 'oberkante:0:1');
        expect(Math.abs(querlage(g2.mass, g2.pos) - 6)).toBeLessThanOrEqual(RASTERFEHLER);
    });

    it('ein Achspunkt gezogen: nur seine Lage; Anfang und Ende tragen den Höhengriff der Sohle', async () => {
        const t = await gerinne();
        const g = griffe(t);
        const p = griff(g, 'achse:1');
        const s = ziehe(t, p, { x: 40, y: p.pos.y, z: 23 });
        expect(opVon(s).achse).toEqual([{ x: 10, z: 20 }, { x: 40, z: 23 }, { x: 55, z: 10 }]);
        expect(opVon(s).sohleAnfang).toBe(98);
        const h = griff(g, 'achse:0', 'Y');
        expect(opVon(ziehe(t, h, { ...h.pos, y: 97.2 })).sohleAnfang).toBe(97.2);
    });
});

describe('Böschung an einer Kante: der Fuss', () => {
    // Eine Kante 1 m über dem Gelände, Böschung rechts (Süden, +z) 1 : 1,5 ⇒ Fuss 1,5 m daneben.
    const KANTE = { art: 'boeschungLinie', parameter: { linie: [{ x: 10, y: 101, z: 40 }, { x: 30, y: 101, z: 40 }, { x: 40, y: 101, z: 50 }],
                                                         seite: 'rechts', neigung: 1.5 } };
    const boeschung = () => vorgang('erdbau', { gelaende: 'DGM1' }, [KANTE]);

    it('je Knick ein Fuss — auf der Seite, auf der die Böschung liegt, 1,5 m neben der Kante', async () => {
        const t = await boeschung();
        const g = griffe(t).filter(x => x.key.includes(':fuss:'));
        expect(g).toHaveLength(3);
        const f = g[0];
        expect(Math.abs(querlage(f.mass, f.pos) - 1.5)).toBeLessThanOrEqual(RASTERFEHLER);
        expect(f.pos.z).toBeGreaterThan(40);                                         // rechts = Süden
        // Die Rechnung schüttet dort — und auf der anderen Seite nichts.
        expect(hoeheImRaster(t.anzeige, 15, 40.75)).toBeGreaterThan(FLACH + 0.3);
        expect(hoeheImRaster(t.anzeige, 15, 39)).toBeCloseTo(FLACH, 9);
    });

    it('den Fuss gezogen: die Neigung folgt, der neue Fuss liegt am Ziel', async () => {
        const t = await boeschung();
        const f = griffe(t).find(x => x.key.endsWith(':fuss:0'));
        const s = ziehe(t, f, { x: 10, y: f.pos.y, z: 43 });
        expect(opVon(s).neigung).toBeGreaterThan(2.5);
        const f2 = griffe(await laufe(s)).find(x => x.key.endsWith(':fuss:0'));
        expect(Math.abs(querlage(f2.mass, f2.pos) - 3)).toBeLessThanOrEqual(RASTERFEHLER);
    });
});

describe('Kanalgraben: er folgt der Haltung — gezogen werden seine Masse', () => {
    const KG = [{ art: 'kanalgraben', parameter: { umfang: 'haltung', achsbezug: 'quelle', wandform: 'boeschung', boden: 'nichtbindig',
                                                    winkelGrad: 45, wanddickeMm: 0, breite: null, bettung: 0.1, schachtMass: 1.0, dn: null } }];
    const graben = () => vorgang('kanalgraben', { rohre: ['H1'], schaechte: [], gelaende: 'DGM1' }, KG);

    it('Sohlkanten und Oberkanten an Anfang und Ende (vorher: keine Ecken)', async () => {
        const t = await graben();
        expect(hatErdbauEcken(t.schritte[0].nachher)).toBe(true);
        const g = griffe(t);
        expect(g.filter(x => x.key.includes(':sohlkante:'))).toHaveLength(4);
        expect(g.filter(x => x.key.includes(':oberkante:'))).toHaveLength(4);
        // Grabensohle 97,40 (Rohrsohle − Bettung), 2,60 m tief, 45° ⇒ Oberkante sb/2 + 2,60.
        const sk = griff(g, 'sohlkante:0:0:1'), ok = griff(g, 'oberkante:0:0:1');
        expect(sk.pos.y).toBeCloseTo(97.4, 9);
        const sb2 = querlage(sk.mass, sk.pos);
        expect(Math.abs(querlage(ok.mass, ok.pos) - (sb2 + 2.6))).toBeLessThanOrEqual(RASTERFEHLER);
    });

    it('die Sohlkante gezogen: eine eigene Sohlbreite statt der Mindestbreite — die Kante liegt am Ziel', async () => {
        const t = await graben();
        const g = griff(griffe(t), 'sohlkante:0:0:1');
        const vorher = t.vorgang.ops[0].parameter.stationen[0].sohlbreite;
        const s = ziehe(t, g, weiter(g, 0.4));
        expect(opVon(s).breite).toBeCloseTo(vorher + 0.8, 3);
        const neu = await laufe(s);
        const g2 = griff(griffe(neu), 'sohlkante:0:0:1');
        expect(Math.hypot(g2.pos.x - weiter(g, 0.4).x, g2.pos.z - weiter(g, 0.4).z)).toBeLessThan(1e-3);
    });

    it('die Oberkante gezogen: flacherer Winkel, die Oberkante liegt am Ziel', async () => {
        const t = await graben();
        const g = griff(griffe(t), 'oberkante:0:0:1');
        const t0 = querlage(g.mass, g.pos);
        const s = ziehe(t, g, weiter(g, 1.5));
        expect(opVon(s).winkelGrad).toBeLessThan(45);
        const g2 = griff(griffe(await laufe(s)), 'oberkante:0:0:1');
        expect(Math.abs(querlage(g2.mass, g2.pos) - (t0 + 1.5))).toBeLessThanOrEqual(RASTERFEHLER);
    });

    it('ein Alt-Journal (vor B3, ohne `wandform`) bekommt beim Ziehen die heutige Form — das Mass überstimmt nichts', () => {
        const alt = { art: 'kanalgraben', parameter: { boeschung: 1, arbeitsraum: 0.3 } };
        const neu = rezeptNach('kanalgraben').setzeMass(alt, 'breite', 1.8);
        expect(neu.parameter).toMatchObject({ wandform: 'boeschung', breite: 1.8 });
        expect(neu.parameter.boeschung).toBeUndefined();
    });
});

describe('Baugrube ums Bauwerk: Arbeitsraum, Sohle, Böschung', () => {
    const BG = [{ art: 'bauwerksgrube', parameter: { wandform: 'boeschung', boden: 'nichtbindig' } }];
    const grube = () => vorgang('bauwerksgrube', { bauteil: 'FUND-1', gelaende: 'DGM1' }, BG);

    it('vier Sohlecken (mit Höhengriff) und vier Oberkanten', async () => {
        const t = await grube();
        expect(hatErdbauEcken(t.schritte[0].nachher)).toBe(true);
        const g = griffe(t);
        expect(g.filter(x => /:sohlecke:\d$/.test(x.key) && x.achsen === 'XZ')).toHaveLength(4);
        expect(g.filter(x => /:sohlecke:\d:hoch$/.test(x.key))).toHaveLength(4);
        expect(g.filter(x => x.key.includes(':oberkante:'))).toHaveLength(4);
        const s0 = griff(g, 'sohlecke:0');
        expect(s0.pos.y).toBeCloseTo(96, 9);                                          // Unterkante des Bauwerks
    });

    it('eine Sohlecke gezogen: der Arbeitsraum wächst für alle Seiten, die Ecke liegt am Ziel', async () => {
        const t = await grube();
        const g = griff(griffe(t), 'sohlecke:2');
        const ziel = weiter(g, 0.5 * Math.SQRT2);                  // 0,5 m mehr Arbeitsraum an einer rechten Ecke
        const s = ziehe(t, g, ziel);
        expect(opVon(s).arbeitsraum).toBeCloseTo(1.0, 3);
        const g2 = griff(griffe(await laufe(s)), 'sohlecke:2');
        expect(Math.hypot(g2.pos.x - ziel.x, g2.pos.z - ziel.z)).toBeLessThan(2e-3);
    });

    it('die Höhe einer Sohlecke setzt die Sohle', async () => {
        const t = await grube();
        const h = griff(griffe(t), 'sohlecke:1', 'Y');
        expect(opVon(ziehe(t, h, { ...h.pos, y: 95.5 })).sohle).toBe(95.5);
    });
});

describe('Der Weg durch die Oberfläche: Griff → Werkzeug → Kommando', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('Ecken ziehen am Gerinne, Sohlkante per Zug: ein Kommando mit Operationskennung und absolutem Wert', async () => {
        const b = useBearbeitung();
        const ae = useAenderungen();
        b.modusSetzen(true);
        const GERINNE = { art: 'gerinne', parameter: { achse: [{ x: 10, z: 20 }, { x: 40, z: 20 }], sohlbreite: 2, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 98 } };
        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: ZELLE }, operationen: [GERINNE], name: 'Probe' });
        for (const s of schritte) await ae.eintragen({ art: 'erzeugt', globalId: s.globalId, nachher: s.nachher, modell: 'cde' });
        const { vorgang: v } = await laufe(schritte);
        const gid = schritte[0].globalId;
        const el = { ...subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), hoehenversatz: 0, versatz: { x: 0, y: 0, z: 0 } };
        const e = {
            knotenGriffe: () => [], zeigeGriffe: vi.fn(), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(), zeigeZugbild: vi.fn(),
            overlayZeige: vi.fn(), overlayLeere: vi.fn(), geistLeeren: vi.fn(), blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
            strahl: (x, y) => ({ origin: { x, y: 200, z: y }, direction: { x: 0, y: -1, z: 0 } }),
            autor: { ableitungen: new Map([[schritte[0].nachher.ableitung, v]]) },
            griffUnter: vi.fn(),
        };
        const nachBauen = vi.fn(async () => ({}));
        const g = useGriffe({ engine: ref(e), bearbeitung: b, aenderungen: ae, getSubjekt: () => el, getTypprofil: () => null,
                              getBauform: () => 'koerper', getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
                              nachBauen, getWer: () => 'fabio', melde: vi.fn(),
                              farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }) });
        expect(b.eckenStarten(gid)).toBe(true);
        g.neuBauen();
        const sk = g.griffe.value.find(x => x.key.endsWith(':sohlkante:0:1'));
        expect(sk).toBeTruthy();
        // Die Oberkanten kennt nur der Lauf — das Composable reicht ihn durch.
        expect(g.griffe.value.filter(x => x.key.includes(':oberkante:'))).toHaveLength(4);
        e.griffUnter.mockReturnValue(sk.key);
        expect(g.greifen({ x: sk.pos.x, y: sk.pos.z, typ: 'mouse' })).toBe(true);
        g.zugStart({ x: sk.pos.x, y: sk.pos.z, px: { x: 0, y: 0 }, typ: 'mouse' });
        // Seitlich UND schräg gezogen — die Ecke bleibt auf ihrer Linie (quer zur Achse).
        g.zugBewegt({ x: sk.pos.x + 3, y: sk.pos.z - 0.5, px: { x: 30, y: 5 }, typ: 'mouse' });
        expect(g.zug.value.pos.x).toBeCloseTo(sk.pos.x, 9);
        expect(g.pille.value.text).toMatch(/^Sohlbreite 3,00 m/);
        const eintraege = await g.zugEnde({});
        expect(eintraege?.length).toBe(2);                                          // Aushub + Auftrag, dieselben Kennungen
        const plan = ae.wirksamerStand('erzeugt').get(gid);
        expect(plan.parameter.operationen[0].parameter.sohlbreite).toBe(3);
        const k = eintraege[0].kommando;
        expect(k).toMatchObject({ werkzeug: 'erdbau-mass-setzen', ziel: [gid], werte: { feld: 'sohlbreite', wert: 3 } });
        expect(k.werte.op).toEqual({ operation: plan.parameter.operationen[0].id });   // die Kennung, keine Nummer (E3)
        expect(nachBauen).toHaveBeenCalled();
    });

    it('die Werkzeugleiste bietet „Mass am Vorgang setzen" nicht an — sein Formular ist der Griff', () => {
        expect(passende({ bauform: 'koerper', guete: 'gemessen' }, { eigenes: true }).map(x => x.id)).not.toContain('erdbau-mass-setzen');
        expect(nachId('erdbau-mass-setzen')).toBeTruthy();
    });
});
