// @vitest-environment jsdom
/**
 * „Ecken ziehen" (Teil XXII, 2026-09-18).
 *
 * Fabio: „das Ziehen von Ecken sollte nur in der Bearbeitung (auch nur als
 * Button!) gehen und wenn, dann an allen Ecken eines Körpers; diese brauchen
 * dann Führungslinien."
 *
 * Geprüft an der ECHTEN Rechnung (`grube`/`schuettung` auf einem feinen
 * Raster), am echten Katalog und an `useGriffe` am echten Store — nicht an
 * hereingereichten Zwischenwerten.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { innenEcken, randFuerInnenecke } from '../services/gelaende/Innenecken.js';
import { grube, schuettung } from '../services/gelaende/Operationen.js';
import { hoeheImRaster } from '../services/geometry/SurfaceOps.js';
import { eckFanglinien, fange, kantenAnEcke } from '../services/Fanglinien.js';
import { griffeFuer, griffZuWerten, hatErdbauEcken } from '../services/Griffe.js';
import { nachId } from '../services/Bearbeitungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useGriffe } from '../composables/useGriffe.js';

/** Ein geneigtes Gelände als feines Raster (0,1 m) — die Rechnung, gegen die gemessen wird. */
function gelaende({ x0 = -5, z0 = -5, n = 451, cell = 0.1, h = (x, z) => 600 + 0.03 * x - 0.02 * z } = {}) {
    const heights = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights[i * n + j] = h(x0 + i * cell, z0 + j * cell);
    return { x0, z0, maxX: x0 + (n - 1) * cell, maxZ: z0 + (n - 1) * cell, cell, nx: n, nz: n, heights, h };
}
const G = gelaende();
/** Ein schiefes Viereck, jede Ecke auf dem Gelände (Höhe wie gezeichnet). */
const RING = [[2, 3], [34, 5], [30, 33], [4, 28]].map(([x, z]) => ({ x, z, y: G.h(x, z) }));
const GRUBE = { art: 'grube', parameter: { umriss: RING, sohle: 597, neigung: 1.5 } };

describe('innenEcken: die Sohlecken sind die Ecken, die die Rechnung gräbt', () => {
    it('an jeder Sohlecke die Sohle, eine Handbreit zur Oberkante hin schon Böschung', () => {
        const r = grube(G, GRUBE.parameter).raster;
        const ecken = innenEcken(GRUBE);
        expect(ecken.every(Boolean)).toBe(true);
        ecken.forEach((e, k) => {
            expect(hoeheImRaster(r, e.x, e.z)).toBeCloseTo(597, 1);
            const a = RING[k], l = Math.hypot(a.x - e.x, a.z - e.z);
            const aussen = { x: e.x + (a.x - e.x) / l * 0.6, z: e.z + (a.z - e.z) / l * 0.6 };
            expect(hoeheImRaster(r, aussen.x, aussen.z)).toBeGreaterThan(597 + 0.2);
            // … und weiter innen bleibt es Sohle.
            const innen = { x: e.x - (a.x - e.x) / l * 0.6, z: e.z - (a.z - e.z) / l * 0.6 };
            expect(hoeheImRaster(r, innen.x, innen.z)).toBeCloseTo(597, 6);
        });
    });

    it('die Krone einer Schüttung ebenso — auf der Zielhöhe', () => {
        const op = { art: 'schuettung', parameter: { umriss: RING, ziel: 'hoehe', hoehe: 603, neigung: 1.5 } };
        const r = schuettung(G, op.parameter).raster;
        for (const e of innenEcken(op)) expect(hoeheImRaster(r, e.x, e.z)).toBeCloseTo(603, 1);
    });

    it('bis GOK hat keine Krone — keine Innenecken', () => {
        expect(innenEcken({ art: 'schuettung', parameter: { umriss: RING, ziel: 'ur', neigung: 1.5 } })).toBeNull();
    });

    it('zu tief für den Umriss: der Ring kippt, keine Ecken statt falscher', () => {
        expect(innenEcken({ ...GRUBE, parameter: { ...GRUBE.parameter, sohle: 570 } }).every(e => e === null)).toBe(true);
    });
});

describe('randFuerInnenecke: die Sohlecke ziehen heisst die Oberkante mitnehmen', () => {
    it('die Sohlecke landet auf dem Millimeter, Neigung, Sohle und die anderen Ecken bleiben', () => {
        const ziel = { x: innenEcken(GRUBE)[2].x + 1.5, z: innenEcken(GRUBE)[2].z - 0.8 };
        const rand = randFuerInnenecke(GRUBE, 2, ziel);
        const neu = { ...GRUBE, parameter: { ...GRUBE.parameter, umriss: RING.map((p, k) => (k === 2 ? { ...p, ...rand } : p)) } };
        const e = innenEcken(neu)[2];
        expect(Math.hypot(e.x - ziel.x, e.z - ziel.z)).toBeLessThan(1e-3);
        expect(innenEcken(neu)[0].x).toBeCloseTo(innenEcken(GRUBE)[0].x, 9);
    });
});

describe('Das Werkzeug: äussere und innere Ecken, Lage und Höhe', () => {
    const PLAN = { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', name: 'Ur · Ausheben · Aushub', kategorie: 'IFCEARTHWORKSCUT',
                   parameter: { quellen: { gelaende: 'DGM1' }, quellBasis: { gelaende: null }, raster: { cell: 1 }, operationen: [GRUBE] } };
    const EL = () => ({ globalId: 'cde-aushub', modelId: 'cde-eigenbau', localId: 7, name: PLAN.name, hoehenversatz: 0,
                        versatz: { x: 0, y: 0, z: 0 }, stand: { bauplan: PLAN,
                        teile: new Map([['aushub', { globalId: 'cde-aushub', bauplan: PLAN }], ['auftrag', { globalId: 'cde-auftrag', bauplan: { ...PLAN, rolle: 'auftrag' } }]]) } });
    const griffe = () => griffeFuer({ subjekt: EL(), subjektHerkunft: 'cde', bauform: 'koerper' });

    it('ALLE Ecken: vier oben, vier an der Sohle — je mit Höhengriff, alle als Eckgriffe markiert', () => {
        const g = griffe();
        expect(g.filter(x => x.key.startsWith('erdbau-stuetz:'))).toHaveLength(4);
        expect(g.filter(x => x.key.startsWith('erdbau-innen:'))).toHaveLength(4);
        expect(g.filter(x => x.achsen === 'Y')).toHaveLength(8);
        expect(g.every(x => x.ecken)).toBe(true);
        expect(g.find(x => x.key === 'erdbau-innen:cde-aushub:0:umriss:1').titel).toBe('Sohle 2');
        expect(hatErdbauEcken(PLAN)).toBe(true);
    });

    it('die Sohlecke gezogen: die Oberkante rückt nach, die Sohle bleibt, beide Teile behalten ihre Kennung', () => {
        const g = griffe().find(x => x.key === 'erdbau-innen:cde-aushub:0:umriss:1' && x.achsen === 'XZ');
        const ziel = { x: g.pos.x + 2, y: g.pos.y, z: g.pos.z + 1 };
        const werte = griffZuWerten(g, ziel, { versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0 });
        const s = nachId('erdbau-stuetzpunkt-verschieben').anwenden(EL(), werte);
        expect(s.map(x => x.globalId).sort()).toEqual(['cde-auftrag', 'cde-aushub']);
        const op = s[0].nachher.parameter.operationen[0];
        expect(op.parameter.sohle).toBe(597);
        const e = innenEcken(op)[1];
        expect(Math.hypot(e.x - ziel.x, e.z - ziel.z)).toBeLessThan(2e-3);
        expect(op.parameter.umriss[0]).toEqual(RING[0]);
    });

    it('nur die Höhe der Sohlecke gezogen: tiefer ausheben — der Rand bleibt, wo er ist', () => {
        const g = griffe().find(x => x.key === 'erdbau-innen-hoch:cde-aushub:0:umriss:1');
        const werte = griffZuWerten(g, { ...g.pos, y: 596 }, { versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0 });
        const op = nachId('erdbau-stuetzpunkt-verschieben').anwenden(EL(), werte)[0].nachher.parameter.operationen[0];
        expect(op.parameter.sohle).toBe(596);
        expect(op.parameter.umriss).toEqual(RING);
    });
});

describe('Führungslinien einer Ecke', () => {
    const RECHTECK = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: -6 }, { x: 0, z: -6 }];

    it('ein Rechteck: nahe der alten Ecke fängt der rechte Winkel an beiden Nachbarn genau', () => {
        const verzogen = RECHTECK.map((p, k) => (k === 2 ? { x: 11.3, z: -7.1 } : p));
        const linien = eckFanglinien(verzogen, 2);
        expect(linien.map(l => l.art)).toEqual(expect.arrayContaining(['kante', 'flucht', 'rechtwinklig', 'achse']));
        const r = fange({ punkt: { ost: 10.2, nord: 6.15 }, linien, radius: 0.6, meide: { ost: 11.3, nord: 7.1 } });
        expect(r.punkt.ost).toBeCloseTo(10, 9);
        expect(r.punkt.nord).toBeCloseTo(6, 9);
        expect(r.aktiv).toHaveLength(2);
    });

    it('die Pille nennt die beiden Kanten an der Ecke', () => {
        expect(kantenAnEcke(RECHTECK, 2, { x: 10, z: -6 })).toEqual([6, 10]);
    });
});

describe('Knopfpflicht: ohne „Ecken ziehen" trägt ein Erdkörper keine Griffe', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

    const PLAN = { rezept: 'erdbau', rolle: 'aushub', ableitung: 'ab-1', name: 'Ur · Ausheben · Aushub', kategorie: 'IFCEARTHWORKSCUT',
                   parameter: { quellen: { gelaende: 'DGM1' }, quellBasis: { gelaende: null }, raster: { cell: 1 }, operationen: [GRUBE] } };

    async function baue() {
        const b = useBearbeitung();
        const ae = useAenderungen();
        await ae.eintragen({ art: 'erzeugt', globalId: 'cde-aushub', nachher: PLAN, modell: 'cde' });
        const e = { schachtGriffe: () => [{ globalId: 'S1', name: 'S1', herkunft: 'geliefert', punkt: { x: 50, y: 0, z: 50 }, modelId: 'm1', localId: 3 }],
                    zeigeGriffe: vi.fn(), griffUnter: vi.fn(), griffHervorheben: vi.fn() };
        const resolver = { forElements: () => ({ async getForm(form) { return { form, data: null, perElement: [], warnings: [] }; } }) };
        await b.einordne({ globalId: 'cde-aushub', modelId: 'cde-eigenbau', localId: 7, hoehenversatz: 0, versatz: { x: 0, y: 0, z: 0 },
                           anker: { x: 18, y: 598, z: 17 }, auswahlpunkt: { x: 18, y: 598, z: 17 }, lageUmkehrbar: true }, resolver);
        const g = useGriffe({ engine: ref(e), bearbeitung: b, aenderungen: ae, getSubjekt: () => b.bauteil,
                              getTypprofil: () => b.typprofil, getBauform: () => 'koerper',
                              getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
                              farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }) });
        return { b, g };
    }

    it('gewählt im Modus E: keine Eckgriffe, kein Bauteil-Griff am Klickpunkt', async () => {
        const { b, g } = await baue();
        // Gegenprobe: `griffeFuer` BIETET beide an — erst der Knopf lässt sie durch.
        const roh = griffeFuer({ subjekt: b.bauteil, subjektHerkunft: 'cde', bauform: 'koerper' });
        expect(roh.some(x => x.art === 'bauteil')).toBe(true);
        expect(roh.some(x => x.ecken)).toBe(true);
        g.neuBauen();
        expect(g.griffe.value.some(x => x.ecken)).toBe(false);
        expect(g.griffe.value.some(x => x.art === 'bauteil')).toBe(false);
    });

    it('„Ecken ziehen": alle Ecken dieses Körpers — und nichts sonst; Fertig räumt sie ab', async () => {
        const { b, g } = await baue();
        expect(b.eckenStarten('cde-aushub')).toBe(true);
        g.neuBauen();
        expect(g.griffe.value).toHaveLength(16);
        expect(g.griffe.value.every(x => x.ecken && x.globalId === 'cde-aushub')).toBe(true);
        b.eckenBeenden();
        g.neuBauen();
        expect(g.griffe.value.some(x => x.ecken)).toBe(false);
    });

    it('eine andere Auswahl oder Bearbeiten aus beendet „Ecken ziehen"', async () => {
        const { b } = await baue();
        b.eckenStarten('cde-aushub');
        await b.einordne({ globalId: 'cde-aushub', modelId: 'cde-eigenbau', localId: 7 }, null);
        expect(b.eckenFuer).toBe('cde-aushub');                 // dasselbe neu eingeordnet (nach jedem Zug)
        await b.einordne(null, null);
        expect(b.eckenFuer).toBe(null);
        b.eckenStarten('cde-aushub');
        b.modusSetzen(false);
        expect(b.eckenFuer).toBe(null);
    });
});
