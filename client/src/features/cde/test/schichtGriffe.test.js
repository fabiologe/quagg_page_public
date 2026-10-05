// @vitest-environment jsdom
/**
 * Teil XXX, B7 — Schichten und Räume in der Mulde lassen sich an den Ecken ziehen.
 *
 * Am Retentionsteich P11 (70 Kommandos, Teil XXIX): seine Schichten und Räume hatten KEINEN Eckgriff — „Ecken ziehen"
 * kannte nur Erdbau-Vorgänge, und eine Schicht ändern hiess: löschen und neu zeichnen. Jetzt nennen sie ihren Umriss
 * als Lageliste; gezogen wird über dasselbe Werkzeug wie die Achse eines Gerinnes (nur Ost/Nord, die Höhe kommt aus
 * dem Gelände). Geprüft über die echte Kette: Kommandos → Journal → Lauf → Griffe → Kommando des Zugs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { griffeFuer, griffZuWerten, hatErdbauEcken } from '../services/Griffe.js';
import { nachId } from '../services/Bearbeitungen.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { useGriffe } from '../composables/useGriffe.js';
import { mengenLive } from '../services/Mengenzeile.js';
import { p11Kommandos } from './hilfen/p11Kommandos.js';

beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

function ebene() {
    const t = [];
    for (let x = -20; x < 120; x += 4) for (let z = -20; z < 120; z += 4) {
        t.push(x, 100, z, x + 4, 100, z, x + 4, 100, z + 4, x, 100, z, x + 4, 100, z + 4, x, 100, z + 4);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = ebene();
const holeQuellForm = async (gid, form, { cell, bereich = null, gitter = null } = {}) =>
    (gid === 'UR' && form === 'raster' ? rasterAusMesh({ mesh: NETZ }, { cell: cell ?? 2, bereich, gitter }).ergebnis : null);
const URSUBJEKT = { modelId: 'm1', localId: 1, globalId: 'UR', name: 'Urgelände', category: 'IFCGEOGRAPHICELEMENT', hoehenversatz: 0,
                    quellmass: { pruefmass: { triCount: NETZ.triCount, spanX: 140, spanY: 0, spanZ: 140 }, cell: 2 } };
const subjektVon = (gid) => (gid === 'UR' ? URSUBJEKT : null);

async function teich() {
    const b = useBearbeitung(), ae = useAenderungen();
    b.modusSetzen(true);
    const { kommandos } = p11Kommandos();
    let i = 0;
    const kennungsgeber = (art) => (art === 'operation' ? `op-g${++i}` : `cde-g${++i}`);
    for (const kom of kommandos) {
        const r = await b.fuehreAus(kom, { subjektVon, kennungsgeber });
        expect(r.ausgefuehrt, `${kom.id}: ${r.grund}`).toBe(true);
    }
    return { b, ae, kennungsgeber };
}
async function gebaut(ae) {
    const stand = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
    return { stand, kz: (gid) => g.bauteile.find(t => t.globalId === gid)?.kennzahlen ?? null };
}
const istSchicht = (plan) => ['gelaendeschicht', 'muldenraum'].includes(plan?.rezept);
const eckgriffe = (gid, plan, kennzahlen) => griffeFuer({
    subjekt: { globalId: gid, name: plan.name, stand: { bauplan: plan }, hoehenversatz: 0, anker: { x: 0, y: 0, z: 0 } },
    subjektHerkunft: 'cde', vorgang: { kennzahlen },
}).filter(g => g.ecken);

describe('B7 — Ecken an Schichten und Räumen (P11)', () => {
    it('jede Schicht und jeder Raum des Teichs hat Eckgriffe — je Umrisspunkt einer, auf der Oberkante', async () => {
        const { ae } = await teich();
        const { stand, kz } = await gebaut(ae);
        const schichten = [...stand].filter(([, p]) => istSchicht(p));
        expect(schichten.length).toBeGreaterThanOrEqual(9);
        const ohne = [];
        for (const [gid, plan] of schichten) {
            expect(hatErdbauEcken(plan), gid).toBe(true);           // der Knopf „Ecken ziehen" steht da
            const alle = eckgriffe(gid, plan, kz(gid));
            // Seit Teil XXXI (T6) steht daneben EIN Massgriff (Dicke bzw. Spiegel) — gezählt werden hier die Ecken.
            // Seit Teil XXXII (K1) dazu „+" je Kante und „−" je Ecke — auch die nicht.
            const g = alle.filter(x => x.art !== 'mass' && !/^knickpunkt-/.test(x.art));
            const op = plan.parameter.operationen[0].parameter;
            const n = (op.umriss ?? op.achse ?? []).length;
            if (g.length !== n) ohne.push(`${gid}: ${g.length} von ${n}`);
            const lotrecht = plan.rezept === 'muldenraum' || (op.richtung ?? 'lot') === 'lot';
            expect(alle.filter(x => x.art === 'mass'), gid).toHaveLength(lotrecht ? 1 : 0);
            for (const x of alle) expect(Number.isFinite(x.pos.y), gid).toBe(true);
        }
        expect(ohne).toEqual([]);                                   // vorher: alle 9+ ohne einen Griff
        // Die Griffe des Wasserkörpers sitzen auf dem Spiegel, die der Tondichtung auf ihrer Oberkante.
        const [rgid, rplan] = schichten.find(([, p]) => p.rezept === 'muldenraum');
        for (const x of eckgriffe(rgid, rplan, kz(rgid))) expect(x.pos.y).toBeCloseTo(Number(rplan.parameter.operationen[0].parameter.oben), 6);
    }, 60000);                                                      // der ganze Teich

    it('ein Eckzug an einer Schicht: nur der Punkt wandert — Kennung, Klasse, Vorlage und Unterlage bleiben', async () => {
        const { b, ae, kennungsgeber } = await teich();
        const [gid, vorher] = [...ae.wirksamerStand('erzeugt')].find(([, p]) => p.rezept === 'gelaendeschicht' && p.parameter.operationen[0].parameter.umriss);
        const op = vorher.parameter.operationen[0].parameter;
        const alt = op.umriss[1];
        const r = await b.fuehreAus({ schema: 1, id: 'eck-1', werkzeug: 'erdbau-stuetzpunkt-verschieben', ziel: [gid], wer: 'test',
                                      wann: '2026-10-05T10:00:00Z',
                                      // Adressen (E3): die Operation über ihre Kennung, der Punkt über seine alte Lage.
                                      werte: { op: { operation: vorher.parameter.operationen[0].id }, feld: 'umriss',
                                               index: { ost: alt.x, nord: -alt.z }, ost: alt.x + 1.5, nord: -(alt.z - 0.5), hoehe: 0 } },
                                    { subjektVon, kennungsgeber });
        expect(r.ausgefuehrt, r.grund).toBe(true);
        const nachher = ae.wirksamerStand('erzeugt').get(gid);
        const neu = nachher.parameter.operationen[0].parameter;
        expect(neu.umriss[1].x).toBeCloseTo(alt.x + 1.5, 9);
        expect(neu.umriss[1].z).toBeCloseTo(alt.z - 0.5, 9);
        expect(neu.umriss.filter((_, k) => k !== 1)).toEqual(op.umriss.filter((_, k) => k !== 1));
        expect(neu.dicke).toBe(op.dicke);
        expect(neu.auf ?? null).toBe(op.auf ?? null);
        expect(nachher.kategorie).toBe(vorher.kategorie);
        for (const feld of ['kategorie', 'vorlage', 'gewerk', 'objektTyp', 'predefinedType']) {
            expect(nachher.parameter[feld], feld).toEqual(vorher.parameter[feld]);
        }
        // Und es baut — mit anderem Volumen.
        const { kz } = await gebaut(ae);
        expect(kz(gid)?.volumen).toBeGreaterThan(0);
    }, 60000);                                                      // der ganze Teich

    it('T6 (Teil XXXI): Dicke und Spiegel am Griff — 0,20 m höher gezogen, über „Mass am Vorgang setzen" ins Journal', async () => {
        const { b, ae, kennungsgeber } = await teich();
        const { stand, kz } = await gebaut(ae);
        const [sgid, splan] = [...stand].find(([, p]) => p.rezept === 'gelaendeschicht' && (p.parameter.operationen[0].parameter.richtung ?? 'lot') === 'lot');
        const [rgid, rplan] = [...stand].find(([, p]) => p.rezept === 'muldenraum');
        const ziehe = async (gid, plan, hoeher) => {
            const g = eckgriffe(gid, plan, kz(gid)).find(x => x.art === 'mass');
            expect(g, gid).toMatchObject({ werkzeug: 'erdbau-mass-setzen', achsen: 'Y' });
            const w = griffZuWerten(g, { ...g.pos, y: g.pos.y + hoeher });
            const r = await b.fuehreAus({ schema: 1, id: `mass-${gid}`, werkzeug: 'erdbau-mass-setzen', ziel: [gid], wer: 'test',
                                          wann: '2026-10-05T10:00:00Z',
                                          werte: { op: { operation: plan.parameter.operationen[w.op].id }, feld: w.feld, wert: w.wert } },
                                        { subjektVon, kennungsgeber });
            expect(r.ausgefuehrt, r.grund).toBe(true);
            return ae.wirksamerStand('erzeugt').get(gid).parameter.operationen[0].parameter;
        };
        const dicke = Number(splan.parameter.operationen[0].parameter.dicke);
        expect((await ziehe(sgid, splan, 0.2)).dicke).toBeCloseTo(dicke + 0.2, 9);
        const oben = Number(rplan.parameter.operationen[0].parameter.oben);
        expect((await ziehe(rgid, rplan, 0.2)).oben).toBeCloseTo(oben + 0.2, 9);        // absolut in m NN
        // Und es baut — die dickere Schicht hat mehr Volumen.
        const neu = await gebaut(ae);
        expect(neu.kz(sgid).volumen).toBeGreaterThan(kz(sgid).volumen);
    }, 90000);

    it('„Mass am Vorgang setzen" gilt an Erdbau, Schicht und Raum in der Mulde — nicht an Rohr, Wand, Platte, Raum einer Kammer', () => {
        const w = nachId('erdbau-mass-setzen');
        for (const r of ['gelaendeschicht', 'muldenraum', 'erdbau']) expect(w.gilt(null, { rezept: rezeptNach(r) }), r).toBe(true);
        for (const r of ['rohr', 'wand', 'platte', 'raum']) expect(w.gilt(null, { rezept: rezeptNach(r) }), r).toBe(false);
    });

    it('das Werkzeug gilt an Schicht und Raum, nicht an einem Rohr oder einer Wand', () => {
        const w = nachId('erdbau-stuetzpunkt-verschieben');
        for (const r of ['gelaendeschicht', 'muldenraum', 'erdbau']) expect(w.gilt(null, { rezept: rezeptNach(r) }), r).toBe(true);
        for (const r of ['rohr', 'wand', 'platte']) expect(w.gilt(null, { rezept: rezeptNach(r) }), r).toBe(false);
    });
});

describe('Teil XXXII, K1 — Knickpunkte einfügen und entfernen an Grube, Schicht, Raum', () => {
    const kom = (id, werkzeug, gid, werte) => ({ schema: 1, id, werkzeug, ziel: [gid], wer: 'test', wann: '2026-10-05T18:00:00Z', werte });
    const adresse = (p, mitHoehe) => (mitHoehe ? { ost: p.x, nord: -p.z, hoehe: p.y } : { ost: p.x, nord: -p.z });

    it('je Kante ein „+" (Abstand = halbe Kante), je Ecke ein „−" — an der Grube und an jeder Schicht', async () => {
        const { ae } = await teich();
        const { stand, kz } = await gebaut(ae);
        const [ggid, gplan] = [...stand].find(([, p]) => p.rezept === 'erdbau' && p.parameter.operationen.some(o => Array.isArray(o.parameter?.umriss)));
        const [sgid, splan] = [...stand].find(([, p]) => p.rezept === 'gelaendeschicht' && p.parameter.operationen[0].parameter.umriss);
        for (const [gid, plan] of [[ggid, gplan], [sgid, splan]]) {
            const alle = eckgriffe(gid, plan, kz(gid));
            const ecken = alle.filter(x => x.art === 'stuetzpunkt' && !x.rolle && x.werte?.bezug !== 'innen');
            const plus = alle.filter(x => x.art === 'knickpunkt-plus');
            expect(plus.length, gid).toBe(ecken.length);                       // ein Ring: so viele Kanten wie Ecken
            expect(alle.filter(x => x.art === 'knickpunkt-weg').length, gid).toBe(ecken.length > 3 ? ecken.length : 0);
            const p0 = plus.find(x => x.werte.index === 0);
            const [a, b] = [ecken.find(x => x.index === 0), ecken.find(x => x.index === 1)];
            expect(p0.werte.abstand).toBeCloseTo(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) / 2, 3);
            expect(p0).toMatchObject({ wirkung: 'tipp', werkzeug: 'erdbau-stuetzpunkt-einfuegen' });
        }
    }, 90000);

    it('Grube: ein Knick in der Kantenmitte — die Liste wird länger, der Punkt liegt AUF der Kante (Höhe gemittelt), Aushub bleibt', async () => {
        const { b, ae, kennungsgeber } = await teich();
        const { kz } = await gebaut(ae);
        const [gid, plan] = [...ae.wirksamerStand('erzeugt')].find(([, p]) => p.rezept === 'erdbau' && p.parameter.operationen.some(o => Array.isArray(o.parameter?.umriss)));
        const j = plan.parameter.operationen.findIndex(o => Array.isArray(o.parameter?.umriss));
        const op = plan.parameter.operationen[j];
        const [a, c] = op.parameter.umriss;
        const halb = Math.hypot(c.x - a.x, c.z - a.z) / 2;
        const vorher = kz(gid);
        const r = await b.fuehreAus(kom('k1-1', 'erdbau-stuetzpunkt-einfuegen', gid,
            { op: { operation: op.id }, feld: 'umriss', index: adresse(a, true), abstand: halb }), { subjektVon, kennungsgeber });
        expect(r.ausgefuehrt, r.grund).toBe(true);
        const neu = ae.wirksamerStand('erzeugt').get(gid).parameter.operationen[j].parameter.umriss;
        expect(neu).toHaveLength(op.parameter.umriss.length + 1);
        expect(neu[1].x).toBeCloseTo((a.x + c.x) / 2, 9);
        expect(neu[1].z).toBeCloseTo((a.z + c.z) / 2, 9);
        expect(neu[1].y).toBeCloseTo((a.y + c.y) / 2, 9);
        expect(neu.filter((_, k) => k !== 1)).toEqual(op.parameter.umriss);
        // Ein Punkt AUF der Kante ändert den Körper nicht.
        const nachher = (await gebaut(ae)).kz(gid);
        expect(nachher.aushubRaster ?? nachher.volumen).toBeCloseTo(vorher.aushubRaster ?? vorher.volumen, 1);
    }, 90000);

    it('Schicht: Ecke entfernen — vier werden drei; ein Dreieck gibt keine mehr her (mit Grund)', async () => {
        const { b, ae, kennungsgeber } = await teich();
        const [gid, plan] = [...ae.wirksamerStand('erzeugt')].find(([, p]) => p.rezept === 'gelaendeschicht' && p.parameter.operationen[0].parameter.umriss?.length === 4);
        const op = plan.parameter.operationen[0];
        const r = await b.fuehreAus(kom('k1-2', 'erdbau-stuetzpunkt-entfernen', gid,
            { op: { operation: op.id }, feld: 'umriss', index: adresse(op.parameter.umriss[2], false) }), { subjektVon, kennungsgeber });
        expect(r.ausgefuehrt, r.grund).toBe(true);
        const drei = ae.wirksamerStand('erzeugt').get(gid).parameter.operationen[0].parameter.umriss;
        expect(drei).toEqual(op.parameter.umriss.filter((_, k) => k !== 2));
        const r2 = await b.fuehreAus(kom('k1-3', 'erdbau-stuetzpunkt-entfernen', gid,
            { op: { operation: op.id }, feld: 'umriss', index: adresse(drei[0], false) }), { subjektVon, kennungsgeber });
        expect(r2.ausgefuehrt).toBe(false);
    }, 90000);

    it('die beiden Werkzeuge gelten an Erdbau, Schicht und Raum — nicht an Rohr, Wand, Platte; ihr Formular ist der Griff', () => {
        for (const id of ['erdbau-stuetzpunkt-einfuegen', 'erdbau-stuetzpunkt-entfernen']) {
            const w = nachId(id);
            for (const r of ['gelaendeschicht', 'muldenraum', 'erdbau']) expect(w.gilt(null, { rezept: rezeptNach(r) }), `${id} ${r}`).toBe(true);
            for (const r of ['rohr', 'wand', 'platte']) expect(w.gilt(null, { rezept: rezeptNach(r) }), `${id} ${r}`).toBe(false);
            expect(w.eigeneOberflaeche).toBe('griffe');
        }
    });
});

/** Ein Autor mit echtem Lauf; nur der fragments-Teil ist Attrappe. */
function autorFuerRaum() {
    const a = new IfcAutor({ getFragments: () => null, holeQuellForm, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
    a.verwirfEigenesModell = vi.fn(async () => {});
    a.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
    a._neuZeichnen = vi.fn(async () => {});
    a.erzeugeAlle = vi.fn(async (_m, bauteile) => bauteile.map((_, i) => ({ ok: true, localId: 100 + i })));
    return a;
}
const alsSchritte = (stand) => [...stand].map(([globalId, wert]) => ({ globalId, art: 'erzeugt', modell: 'cde', wert }));

describe('B7 — die Massen, bevor geschrieben wird', () => {
    it('die Probe am gezogenen Punkt ist DIESELBE Zahl, die der Aufbau nach dem Schreiben rechnet', async () => {
        const { b, ae, kennungsgeber } = await teich();
        const autor = autorFuerRaum();
        await autor.baueErzeugte(alsSchritte(ae.wirksamerStand('erzeugt')));
        const [gid, plan] = [...ae.wirksamerStand('erzeugt')].find(([, p]) => p.rezept === 'gelaendeschicht' && p.parameter.operationen[0].parameter.umriss);
        const vorher = autor.ableitungen.get(plan.ableitung).kennzahlen.volumen;
        const alt = plan.parameter.operationen[0].parameter.umriss[1];
        const werte = { op: 0, feld: 'umriss', index: 1, ost: alt.x + 2, nord: -(alt.z - 1), hoehe: 0 };
        const el = { ...subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), hoehenversatz: 0, versatz: { x: 0, y: 0, z: 0 } };
        const schritte = nachId('erdbau-stuetzpunkt-verschieben').anwenden(el, werte);
        const probe = await autor.probeKennzahlen(schritte, plan.ableitung);
        expect(probe.volumen).not.toBeCloseTo(vorher, 3);
        expect(mengenLive(probe, { volumen: vorher })).toMatch(/^Volumen [\d.,]+ m³ \([+−][\d.,]+\)$/);
        // Der Probelauf hat nichts gemerkt: der Autor kennt weiter den alten Stand.
        expect(autor.ableitungen.get(plan.ableitung).kennzahlen.volumen).toBe(vorher);

        const r = await b.fuehreAus({ schema: 1, id: 'eck-2', werkzeug: 'erdbau-stuetzpunkt-verschieben', ziel: [gid], wer: 'test',
                                      wann: '2026-10-05T10:00:00Z',
                                      werte: { ...werte, op: { operation: plan.parameter.operationen[0].id }, index: { ost: alt.x, nord: -alt.z } } },
                                    { subjektVon, kennungsgeber });
        expect(r.ausgefuehrt, r.grund).toBe(true);
        await autor.baueErzeugte(alsSchritte(ae.wirksamerStand('erzeugt')));
        expect(autor.ableitungen.get(plan.ableitung).kennzahlen.volumen).toBeCloseTo(probe.volumen, 9);
    }, 60000);                                                      // der ganze Teich, zweimal gebaut

    it('die Pille zeigt „Massen …", dann die Zahl — höchstens eine Rechnung zugleich, die jüngste Lage gewinnt', async () => {
        const { b, ae } = await teich();
        const autor = autorFuerRaum();
        await autor.baueErzeugte(alsSchritte(ae.wirksamerStand('erzeugt')));
        const [gid, plan] = [...ae.wirksamerStand('erzeugt')].find(([, p]) => p.rezept === 'gelaendeschicht' && p.parameter.operationen[0].parameter.umriss);
        const el = { ...subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand }), hoehenversatz: 0, versatz: { x: 0, y: 0, z: 0 } };
        const e = {
            knotenGriffe: () => [], zeigeGriffe: vi.fn(), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(), zeigeZugbild: vi.fn(),
            overlayZeige: vi.fn(), overlayLeere: vi.fn(), geistLeeren: vi.fn(), blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
            strahl: (x, y) => ({ origin: { x, y: 300, z: y }, direction: { x: 0, y: -1, z: 0 } }),
            autor, griffUnter: vi.fn(), geistVersetzen: vi.fn(),
        };
        let loesen = [];
        const probeMengen = vi.fn(() => new Promise(r => loesen.push(r)));
        const g = useGriffe({ engine: ref(e), bearbeitung: b, aenderungen: ae, getSubjekt: () => el, getTypprofil: () => null,
                              getBauform: () => 'flaeche+dicke', getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
                              nachBauen: vi.fn(async () => ({})), getWer: () => 't', melde: vi.fn(), probeMengen,
                              farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }) });
        expect(b.eckenStarten(gid)).toBe(true);
        g.neuBauen();
        const ecke = g.griffe.value.find(x => x.ecken && x.globalId === gid && x.achsen === 'XZ');
        expect(ecke).toBeTruthy();
        e.griffUnter.mockReturnValue(ecke.key);
        g.greifen({ x: ecke.pos.x, y: ecke.pos.z, typ: 'mouse' });
        g.zugStart({ x: ecke.pos.x, y: ecke.pos.z, px: { x: 0, y: 0 }, typ: 'mouse' });
        for (const d of [1, 2, 3]) g.zugBewegt({ x: ecke.pos.x + d, y: ecke.pos.z, px: { x: 10 * d, y: 0 }, typ: 'mouse', altKey: true });
        expect(g.pille.value.text).toMatch(/Massen …$/);
        expect(probeMengen).toHaveBeenCalledTimes(1);               // die zweite und dritte Lage warten
        loesen.shift()('Volumen 400 m³ (+5)');
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        expect(g.pille.value.text).toMatch(/Volumen 400 m³ \(\+5\)$/);
        expect(probeMengen).toHaveBeenCalledTimes(2);               // genau eine Nachrechnung für die jüngste Lage
        await g.zugEnde({ abbruch: true });
        expect(g.mengen.value).toBe(null);
    }, 60000);                                                      // der ganze Teich
});
