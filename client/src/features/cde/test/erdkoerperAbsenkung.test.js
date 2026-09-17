/**
 * Der Erdkörper liegt im RAUM unter der Anzeige — im EXPORT genau dort, wo er
 * gerechnet wurde (Teil XXI, P1b/E2; Fabio 2026-09-17: „zittert und überlappt").
 *
 * DIE LAGE. Seit P1b sind Körperdeckel und Geländeanzeige dieselbe Fläche:
 * dasselbe Ur, dasselbe Gitter, dieselbe Diagonale je Zelle (gemessen:
 * grösster Abstand 0,000 m bei der Auffüllung). Genau deshalb braucht das
 * Bild jetzt einen Abstand — zwei Flächen auf demselben Tiefenwert entscheiden
 * je Bildpunkt neu, welche vorn liegt.
 *
 * DIE REGEL. `baueErzeugte` (Raum) senkt Aushub, Auftrag, Graben und Grube um
 * `ERDKOERPER_ABSENKUNG`; `eigenbauGeometrien` (IFC) senkt nichts. Die
 * Anzeigefläche selbst rührt keiner der beiden an.
 *
 * Gemessen wird an der echten Schnittstelle: derselbe Journalstand durch
 * beide Wege des Autors, Ecke für Ecke verglichen.
 */
import { describe, expect, it, vi } from 'vitest';
import { CDE_MODELL_ID, IfcAutor } from '../services/IfcAutor.js';
import { ERDKOERPER_ABSENKUNG } from '../services/Bauteilfarben.js';
import { ableitungsSchritte } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

/** Welliges Gelände — damit die Absenkung nicht an einer Ebene gemessen wird. */
function gelaende() {
    const h = (x, z) => 300 + 0.3 * Math.sin(x / 8) + 0.2 * Math.cos(z / 6) + 0.02 * x;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = gelaende();
const hNn = (x, z) => 600 + 0.3 * Math.sin(x / 8) + 0.2 * Math.cos(z / 6) + 0.02 * x;

function fakeFragments() {
    let naechsteId = 100;
    const editor = {
        createElements: vi.fn(async (_mid, auftraege) => auftraege.map(() => ({ localId: naechsteId++ }))),
        applyChanges: vi.fn(async () => []),
        deleteElements: vi.fn(),
        getElements: vi.fn(async () => []),
    };
    return { manager: {
        list: new Map([[CDE_MODELL_ID, { modelId: CDE_MODELL_ID, dispose: () => {} }]]),
        core: { editor, update: vi.fn(async () => {}), load: vi.fn(async () => {}), disposeModel: vi.fn(async () => {}) },
    } };
}

function neuerAutor() {
    const autor = new IfcAutor({
        getFragments: () => fakeFragments().manager,
        holeQuellForm: async (gid, form, opts = {}) => (gid === 'DGM1' && form === 'raster'
            ? rasterAusMesh({ mesh: NETZ }, { cell: opts.cell ?? 2, bereich: opts.bereich ?? null,
                                              gitter: opts.gitter ?? null }).ergebnis : null),
        kernel: erzeugeKernel(),
        getHoehenversatz: () => 300,
    });
    autor.verwirfEigenesModell = vi.fn(async () => {});
    autor.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
    autor._neuZeichnen = vi.fn(async () => {});
    return autor;
}

const ecken = [[12, 12], [28, 12], [28, 28], [12, 28]];
const GRUBE = { art: 'grube', parameter: {
    umriss: ecken.map(([x, z]) => ({ x, y: hNn(x, z), z })), sohle: 597.5, neigung: 1.5 } };
const FUELLEN = { art: 'schuettung', parameter: {
    umriss: ecken.map(([x, z]) => ({ x, y: hNn(x, z), z })), ziel: 'ur', hoehe: 0, neigung: 1.5 } };

function journal() {
    const A = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' },
        raster: { cell: 2 }, operationen: [GRUBE], name: 'Ur' });
    const B = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' },
        raster: { cell: 2 }, operationen: [FUELLEN], name: 'Ur' });
    const Z = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 }, name: 'Ur',
        vorgaenge: [{ ableitung: A[0].nachher.ableitung, art: 'erdbau', titel: 'Ausheben' },
                    { ableitung: B[0].nachher.ableitung, art: 'erdbau', titel: 'Auffüllen' }] });
    const schritte = [...A, ...B, ...Z];
    return { schritte, plan: schritte.map(s => ({ globalId: s.globalId, art: 'erzeugt', modell: 'cde', wert: s.nachher })),
             rolleVon: new Map(schritte.map(s => [s.globalId, s.nachher.rolle])) };
}

/** Die Ecken, die `baueErzeugte` in den Raum stellt — je globalId. */
async function imRaum(autor, plan) {
    const gestellt = new Map();
    autor.erzeugeAlle = vi.fn(async (_mid, bauteile) => bauteile.map((b, i) => {
        gestellt.set(b.globalId, b.geometrie.getAttribute('position').array);
        return { ok: true, localId: 100 + i };
    }));
    const r = await autor.baueErzeugte(plan);
    expect(r.misserfolge).toEqual([]);
    return gestellt;
}

/** Die Ecken, die `eigenbauGeometrien` für den Export liefert — je globalId. */
async function imExport(autor, plan) {
    const r = await autor.eigenbauGeometrien(plan);
    expect(r.misserfolge).toEqual([]);
    return new Map(r.bauteile.map(b => [b.globalId, b.positionen]));
}

const hoechstes = (p) => { let m = -Infinity; for (let i = 1; i < p.length; i += 3) m = Math.max(m, p[i]); return m; };

describe('Gelände gewinnt: der Erdkörper sitzt im Raum zwei Zentimeter tiefer', () => {
    it('jede Ecke von Aushub und Auftrag liegt im Raum um genau ERDKOERPER_ABSENKUNG unter der Exportlage', async () => {
        const { plan, rolleVon } = journal();
        const raum = await imRaum(neuerAutor(), plan);
        const aus = await imExport(neuerAutor(), plan);

        const koerper = [...raum.keys()].filter(g => ['aushub', 'auftrag'].includes(rolleVon.get(g)));
        expect(koerper).toHaveLength(2);                     // eine Grube, eine Füllung
        for (const gid of koerper) {
            const a = raum.get(gid), b = aus.get(gid);
            expect(a.length).toBe(b.length);
            expect(a.length).toBeGreaterThan(300);
            let maxDy = -Infinity, minDy = Infinity, maxXZ = 0;
            for (let i = 0; i < a.length; i += 3) {
                maxXZ = Math.max(maxXZ, Math.abs(a[i] - b[i]), Math.abs(a[i + 2] - b[i + 2]));
                const dy = b[i + 1] - a[i + 1];
                maxDy = Math.max(maxDy, dy); minDy = Math.min(minDy, dy);
            }
            expect(maxXZ).toBeLessThan(1e-6);                // nur nach unten, nicht zur Seite
            expect(minDy).toBeCloseTo(ERDKOERPER_ABSENKUNG, 4);
            expect(maxDy).toBeCloseTo(ERDKOERPER_ABSENKUNG, 4);
        }
    });

    it('die Geländeanzeige rührt keiner der beiden Wege an — sie IST das Bild', async () => {
        const { plan, rolleVon } = journal();
        const raum = await imRaum(neuerAutor(), plan);
        const aus = await imExport(neuerAutor(), plan);
        const anzeige = [...raum.keys()].find(g => rolleVon.get(g) === 'anzeige');
        expect(anzeige).toBeTruthy();
        // Im Export ist die Anzeigefläche gar kein Bauteil (Stufe 1) — im Raum ist sie es.
        expect(aus.has(anzeige)).toBe(false);
        const p = raum.get(anzeige);
        // Ihr höchster Punkt ist die Geländehöhe selbst, nicht 2 cm darunter.
        let soll = -Infinity;
        for (let i = 0; i < p.length; i += 3) soll = Math.max(soll, hNn(p[i], p[i + 2]) - 300);
        expect(hoechstes(p)).toBeCloseTo(soll, 2);
    });

    it('der Deckel des Auftrags liegt im Raum UNTER der Anzeige, im Export auf ihr', async () => {
        const { plan, rolleVon } = journal();
        const raum = await imRaum(neuerAutor(), plan);
        const aus = await imExport(neuerAutor(), plan);
        const fuellung = [...aus.keys()].filter(g => rolleVon.get(g) === 'auftrag');
        expect(fuellung).toHaveLength(1);
        const oben = hoechstes(aus.get(fuellung[0]));
        // Genauigkeit 1e-4: die Ecken sind Float32, und bei 300 m Höhe ist das
        // die Auflösung selbst (gemessen 2·10⁻⁵ m).
        expect(hoechstes(raum.get(fuellung[0]))).toBeCloseTo(oben - ERDKOERPER_ABSENKUNG, 4);
        // Und die Exportlage ist die gerechnete: der Deckel der Füllung „bis GOK"
        // trifft das Ur-Gelände (die Kur von P1b, hier als Wächter).
        const anzeige = [...raum.keys()].find(g => rolleVon.get(g) === 'anzeige');
        expect(oben).toBeLessThanOrEqual(hoechstes(raum.get(anzeige)) + 1e-6);
    });
});
