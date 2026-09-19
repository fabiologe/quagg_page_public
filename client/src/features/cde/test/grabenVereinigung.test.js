/**
 * Strang und Schachtbaugruben als EIN exakter Körper (Teil XXI, P6-Rest —
 * 2026-09-19).
 *
 * Bis hierher baute der Kanalgraben seinen Körper nur dann aus Querprofilen,
 * wenn der Vorgang aus genau EINEM Graben bestand. Ein Strang (zwei Haltungen)
 * oder ein Graben mit Schachtbaugruben fiel auf den Rasterkörper zurück — bei
 * senkrechten Wänden (der Vorgabe) mit rund einer halben Sohlbreite
 * Massenfehler (+39 % gemessen). Jetzt: jede Operation, die ihre Bahn nennt,
 * wird ein Profilkörper — auch die Baugrube —, und EINE Vereinigung auf dem
 * Server macht daraus den Körper. Ohne Server bleibt es beim Raster (siehe
 * `b3.test.js`), mit Grund.
 *
 * Die Vereinigung rechnet der Server (manifold, `core/geometrie.py`, dort
 * getestet); hier ist er nachgebildet und prüft, WAS er bekommt. Gemessen am
 * 2026-09-19 mit dem Server-Code selbst, am Strang unten (eben, Verbau): die
 * Vereinigung der fünf Körper 231,313 m³ gegen eine unabhängige Integration
 * der Entwurfsgeometrie auf 1 cm 231,313 m³ (0,00 %); das Raster 249,275 m³
 * (+7,8 %), die Summe der Einzelkörper 245,824 m³ (+6,3 %, Überlappungen
 * doppelt). Im Browser (42069, eigene Schächte, echtes Gelände): Strang →
 * `koerperArt: profil` aus 5 Körpern, Verfüllungskörper 351,874 m³ = Rechnung.
 *
 * Unterwegs gefunden: der Profilkörper kam beim Server OFFEN an — seine
 * Stirnseiten hatten Dreiecke der Fläche null, die der Server beim Aufräumen
 * wegwirft. Bis hierher betraf das nur Gräben ohne Schachtbaugrube (sonst gab
 * es gar keinen Profilkörper): deren Verfüllungskörper (Graben minus Rohre)
 * konnte nie entstehen. Und bei Quergefälle schloss er nicht (die Endrampe
 * endete, wo die ACHSE noch 5 cm Tiefe hatte, die tiefere Sohlkante keine).
 */
import { describe, expect, it, vi } from 'vitest';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { GELAENDE_OPS } from '../services/gelaende/Operationen.js';
import { profilkoerper } from '../services/geometrie/ops/Profilkoerper.js';

/** Ebenes Gelände auf 300 m, 80 × 40 m. */
function gelaende(h0 = 300) {
    const t = [];
    for (let x = 0; x < 80; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h0, z], b = [x + 1, h0, z], c = [x + 1, h0, z + 1], d = [x, h0, z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const RASTER = rasterAusMesh({ mesh: gelaende() }, { cell: 0.5 }).ergebnis;

/** Dreiecke mit Fläche null — der Server wirft sie beim Aufräumen weg, und dann ist der Körper offen. */
function nullflaechen(positions) {
    let n = 0;
    for (let i = 0; i < positions.length; i += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-9) n++;
    }
    return n;
}

describe('Der Profilkörper hat keine Nullflächen (2026-09-19)', () => {
    // Gemessen vor der Kur: 2 (DN 300, senkrecht), 4 (DN 400), 8 je Baugrube —
    // der Fächer der Stirnseite lief über gerade Sohle, gerade Wand, ebenen
    // Deckel. Roh war der Körper dicht; der Server (`als_trimesh`) warf diese
    // Dreiecke weg und nahm ihn als offen an: keine Vereinigung, und seit P6
    // keine Verfüllung (Graben minus Rohre) einer einzelnen Haltung.
    const gelaendeMit = (h) => {
        const t = [];
        for (let x = 0; x < 60; x++) for (let z = 0; z < 40; z++) {
            const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z], c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
            t.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        return rasterAusMesh({ mesh: { positions: new Float64Array(t), triCount: t.length / 9 } }, { cell: 0.5 }).ergebnis;
    };
    const FAELLE = {
        'senkrecht, eben': [gelaendeMit(() => 300), 0],
        'geböscht 1 : 1,5, eben': [gelaendeMit(() => 300), 1.5],
        'geböscht, quer geneigt': [gelaendeMit((x, z) => 300 + 0.1 * z), 1.5],
        'geböscht, wellig': [gelaendeMit((x, z) => 300 + 0.4 * Math.sin(x / 3) + 0.3 * Math.cos(z / 4)), 1],
    };
    for (const [name, [raster, n]] of Object.entries(FAELLE)) {
        it(`${name}: Graben und Baugrube geschlossen, ohne ein Dreieck der Fläche null`, () => {
            const graben = profilkoerper({ raster }, { bahn: [{ x: 10, y: 297, z: 20, breite: 1.1 }, { x: 40, y: 296.5, z: 20, breite: 1.1 }], neigung: n });
            const bg = GELAENDE_OPS.baugrube.profilbahn({ mitte: { x: 25, z: 20 }, laenge: 2.2, breite: 2.2, richtung: { x: 1, z: 0 }, sohle: 296.2, neigung: n });
            const grube = profilkoerper({ raster }, bg);
            for (const k of [graben, grube]) {
                expect(k.ergebnis.closed).toBe(true);
                expect(nullflaechen(k.ergebnis.positions)).toBe(0);
            }
        });
    }
});

describe('Die Baugrube als Profilkörper', () => {
    const BG = (neigung) => ({ mitte: { x: 40, z: 20 }, laenge: 2.2, breite: 2.2, richtung: { x: 1, z: 0 }, sohle: 296, neigung });

    it('senkrecht: Länge × Breite × Tiefe — auf den Millimeter', () => {
        const { bahn, neigung } = GELAENDE_OPS.baugrube.profilbahn(BG(0));
        const r = profilkoerper({ raster: RASTER }, { bahn, neigung });
        expect(r.ergebnis.closed).toBe(true);
        expect(r.ergebnis.volumen).toBeCloseTo(2.2 * 2.2 * 4, 3);                 // 19,36 m³
    });

    it('geböscht 1 : 1: Rechteck + Böschungen + gerundete Ecken (Kegelviertel) — wie die Baugrube im Raster', () => {
        const { bahn, neigung } = GELAENDE_OPS.baugrube.profilbahn(BG(1));
        const r = profilkoerper({ raster: RASTER }, { bahn, neigung });
        const L = 2.2, B = 2.2, t = 4, n = 1;
        const hand = L * B * t + (L + B) * n * t * t + Math.PI / 3 * n * n * t ** 3;
        expect(Math.abs(r.ergebnis.volumen - hand) / hand).toBeLessThan(0.005);
    });

    it('eine runde Baugrube (nur Radius) hat keine Bahn — sie bleibt beim Raster', () => {
        expect(GELAENDE_OPS.baugrube.profilbahn({ mitte: { x: 0, z: 0 }, radius: 1, sohle: 296 })).toBeNull();
    });
});

// ── Der Strang: zwei Haltungen, drei Schächte (Szenario aus b3) ─────────────
const P = (x, y, z) => ({ x, y, z });
const H1 = { anfang: P(5, 297.5, 20), ende: P(35, 297.0, 20) };
const H2 = { anfang: P(35, 297.0, 20), ende: P(65, 296.5, 20) };
const KNOTEN = [{ globalId: 'S1', punkt: P(5, 297.5, 20) }, { globalId: 'S2', punkt: P(35, 297.0, 20) }, { globalId: 'S3', punkt: P(65, 296.5, 20) }];
const holeQuellForm = async (gid, form, { cell, bereich = null } = {}) => {
    if (gid === 'DGM1' && form === 'raster') return rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1, bereich }).ergebnis;
    if (gid === 'H1' && form === 'linie') return { punkte: [H1.anfang, H1.ende], dn: 300 };
    if (gid === 'H2' && form === 'linie') return { punkte: [H2.anfang, H2.ende], dn: 400 };
    const s = KNOTEN.find(k => k.globalId === gid);
    if (s && form === 'knoten') return { ...s.punkt, name: gid };
    return null;
};

/** Ein Server, der vereinigen kann — nachgebildet: er meldet, was er bekam, und gibt einen Körper zurück. */
function nachgebildeterServer(volumen = 777) {
    const aufrufe = [];
    return {
        aufrufe,
        bereit: async () => true,
        kann: (name) => (name === 'booleVereinigung' || name === 'booleDifferenz' ? { ok: true } : { ok: false, grund: 'nicht nachgebildet' }),
        op: vi.fn(async (name, eingaben) => {
            aufrufe.push({ name, eingaben });
            if (name === 'booleVereinigung') return { ergebnis: { ...eingaben.a, volumen, closed: true }, warnungen: [] };
            return { ergebnis: null, warnungen: ['nicht nachgebildet'] };
        }),
    };
}

async function strang(kernel) {
    const op = [{ art: 'kanalgraben', parameter: { umfang: 'strang', wandform: 'verbau', boden: 'nichtbindig', winkelGrad: null, wanddickeMm: 0,
                                                    breite: null, bettung: 0.1, schachtMass: 1.0, dn: null } }];
    const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohre: ['H1', 'H2'], schaechte: ['S1', 'S2', 'S3'], gelaende: 'DGM1' },
                                          raster: { cell: 0.5 }, operationen: op, name: 'Strang' });
    const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
    const l = neuerAbleitungslauf({ stand: new Map([...schritte, ...anzeige].map(s => [s.globalId, s.nachher])), rezeptNach, holeQuellForm, kernel });
    const rg = await l.baue(schritte[0].globalId);
    return { rg, a: l.ableitungen.get(schritte[0].nachher.ableitung) };
}

describe('Der Strang mit Schachtbaugruben: fünf Profilkörper, EINE Vereinigung', () => {
    it('der Server bekommt alle fünf geschlossenen Körper in einem Aufruf — und sein Körper trägt die Masse', async () => {
        const server = nachgebildeterServer(777);
        const { rg, a } = await strang(erzeugeKernel({ server }));
        const v = server.aufrufe.filter(x => x.name === 'booleVereinigung');
        expect(v).toHaveLength(1);                                                   // vorher: keiner — Raster
        expect(v[0].eingaben.b).toHaveLength(4);
        expect([v[0].eingaben.a, ...v[0].eingaben.b].every(k => k.closed && k.volumen > 0)).toBe(true);
        expect(a.kennzahlen).toMatchObject({ koerperArt: 'profil', koerperTeile: 5, massenQuelle: 'Querprofile', aushubMasse: 777 });
        expect(rg.ok).toBe(true);
        // Die Summe der Einzelkörper ist GRÖSSER als die Vereinigung wäre (sie
        // überlappen an den Schächten) — deshalb die Vereinigung, nicht die Summe.
        const summe = [v[0].eingaben.a, ...v[0].eingaben.b].reduce((s, k) => s + k.volumen, 0);
        const grabenAllein = v[0].eingaben.a.volumen + v[0].eingaben.b[0].volumen;
        expect(summe).toBeGreaterThan(grabenAllein);
    });

    it('scheitert die Vereinigung, bleibt es beim Raster — mit Grund', async () => {
        const server = nachgebildeterServer();
        server.op = vi.fn(async () => ({ ergebnis: null, warnungen: ['server_422: kein geschlossener Koerper'] }));
        const { a } = await strang(erzeugeKernel({ server }));
        expect(a.kennzahlen.koerperArt).toBe('raster');
        expect(a.kennzahlen.koerperGrund).toMatch(/durchdringen einander und liessen sich nicht vereinigen: server_422/);
        expect(a.warnungen.some(w => /grabenkoerper_raster/.test(w))).toBe(true);
    });
});
