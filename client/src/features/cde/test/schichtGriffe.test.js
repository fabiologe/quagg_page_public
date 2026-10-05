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
import { griffeFuer, hatErdbauEcken } from '../services/Griffe.js';
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
            const g = eckgriffe(gid, plan, kz(gid));
            const op = plan.parameter.operationen[0].parameter;
            const n = (op.umriss ?? op.achse ?? []).length;
            if (g.length !== n) ohne.push(`${gid}: ${g.length} von ${n}`);
            for (const x of g) expect(Number.isFinite(x.pos.y), gid).toBe(true);
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

    it('das Werkzeug gilt an Schicht und Raum, nicht an einem Rohr oder einer Wand', () => {
        const w = nachId('erdbau-stuetzpunkt-verschieben');
        for (const r of ['gelaendeschicht', 'muldenraum', 'erdbau']) expect(w.gilt(null, { rezept: rezeptNach(r) }), r).toBe(true);
        for (const r of ['rohr', 'wand', 'platte']) expect(w.gilt(null, { rezept: rezeptNach(r) }), r).toBe(false);
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
