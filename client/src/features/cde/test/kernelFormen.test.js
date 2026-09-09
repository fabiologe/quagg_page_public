/**
 * Der Kernel-Vertrag (Teil XIV, G1): Formen als Datenverträge, der Katalog
 * als Deklaration, und die zwei Sorten von Nein — Vertragsbruch wirft,
 * fachliches Nein kommt als null + Warnung, fehlendes Backend als Grund.
 */
import { describe, expect, it, vi } from 'vitest';
import { FORMEN, pruefeForm } from '../services/geometrie/Formen.js';
import { OPS, erzeugeKernel } from '../services/geometrie/Kernel.js';

function raster(nx = 3, nz = 3, cell = 1, h = 300) {
    return { x0: 0, z0: 0, maxX: (nx - 1) * cell, maxZ: (nz - 1) * cell, cell, nx, nz,
             heights: new Float64Array(nx * nz).fill(h) };
}

describe('pruefeForm', () => {
    it('mesh: Float64 und 9 Zahlen je Dreieck — Float32 fällt durch', () => {
        expect(pruefeForm({ positions: new Float64Array(9), triCount: 1 }, 'mesh')).toEqual([]);
        expect(pruefeForm({ positions: new Float32Array(9), triCount: 1 }, 'mesh').join(' ')).toContain('Float32');
        expect(pruefeForm({ positions: new Float64Array(8), triCount: 1 }, 'mesh').length).toBe(1);
    });

    it('koerper braucht Attest und Volumen; raster braucht Bezug und nx·nz Werte', () => {
        expect(pruefeForm({ positions: new Float64Array(9), triCount: 1, closed: true, volumen: 2 }, 'koerper')).toEqual([]);
        expect(pruefeForm({ positions: new Float64Array(9), triCount: 1 }, 'koerper').length).toBe(2);
        expect(pruefeForm(raster(), 'raster')).toEqual([]);
        const kaputt = { ...raster(), heights: new Float64Array(4) };
        expect(pruefeForm(kaputt, 'raster').join(' ')).toContain('nx·nz');
    });

    it('linie/umriss/profil/Listen — und eine unbekannte Form ist ein Fehler, kein Durchwinken', () => {
        expect(pruefeForm({ punkte: [{ x: 0, z: 0, y: NaN }, { x: 1, z: 0 }] }, 'linie')).toEqual([]);
        expect(pruefeForm({ punkte: [{ x: 0, z: 0 }] }, 'linie').length).toBe(1);
        expect(pruefeForm({ ring: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] }, 'umriss')).toEqual([]);
        expect(pruefeForm({ punkte: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 }] }, 'profil')).toEqual([]);
        expect(pruefeForm([raster(), raster()], 'raster[]')).toEqual([]);
        expect(pruefeForm([raster(), {}], 'raster[]')[0]).toMatch(/^\[1\]/);
        expect(pruefeForm({}, 'quader')).toEqual(['unbekannte Form „quader"']);
    });
});

describe('der Op-Katalog', () => {
    it('jede Op deklariert Schlitze mit bekannten Formen, eine Ausgabeform und einen Ort', () => {
        for (const [name, def] of Object.entries(OPS)) {
            expect(Object.keys(def.eingaben).length, name).toBeGreaterThan(0);
            for (const form of Object.values(def.eingaben)) {
                expect(FORMEN[form.replace('[]', '')], `${name}: ${form}`).toBeTruthy();
            }
            expect(FORMEN[def.ausgabe], name).toBeTruthy();
            expect(['client', 'server']).toContain(def.ort);
        }
    });
});

describe('erzeugeKernel', () => {
    it('rechnet Client-Ops inline und liefert Provenienz', async () => {
        const k = erzeugeKernel();
        const r = await k.op('rasterDifferenz', { a: raster(), b: raster(3, 3, 1, 298) });
        expect(r.ergebnis.heights[4]).toBe(-2);
        expect(r.provenienz).toMatchObject({ op: 'rasterDifferenz', backend: 'client' });
        expect(r.warnungen).toEqual([]);
    });

    it('Vertragsbruch WIRFT: unbekannte Op, falsche Form, fehlender Pflichtparameter', async () => {
        const k = erzeugeKernel();
        await expect(k.op('quader', {})).rejects.toThrow(/op_unbekannt/);
        await expect(k.op('rasterDifferenz', { a: raster(), b: { nix: 1 } })).rejects.toThrow(/form_ungueltig/);
        await expect(k.op('rasterAusMesh', { mesh: { positions: new Float64Array(9), triCount: 1 } }, {}))
            .rejects.toThrow(/parameter_fehlt/);
    });

    it('fehlendes Backend ist KEIN Wurf: kann() nennt den Grund, op() gibt null + Warnung', async () => {
        const k = erzeugeKernel();
        expect(k.kann('booleDifferenz')).toMatchObject({ ok: false, grund: expect.stringContaining('Server') });
        expect(k.kann('cdt')).toMatchObject({ ok: false, grund: expect.stringContaining('G8') });   // sweep ist seit G6 gebaut
        const koerper = { positions: new Float64Array(9), triCount: 1, closed: true, volumen: 1 };
        const r = await k.op('booleDifferenz', { a: koerper, b: koerper });
        expect(r.ergebnis).toBeNull();
        expect(r.provenienz.backend).toBe('keins');
        expect(r.warnungen[0]).toContain('Server');
    });

    it('Server-Ops gehen an den Server-Kernel, grosse Ops an den Worker', async () => {
        const server = { kann: () => ({ ok: true }), op: vi.fn(async () => ({ ergebnis: 'S', warnungen: [] })) };
        const worker = { op: vi.fn(async () => ({ ergebnis: 'W', warnungen: [] })) };
        const k = erzeugeKernel({ server, worker });
        const koerper = { positions: new Float64Array(9), triCount: 1, closed: true, volumen: 1 };
        const s = await k.op('booleSchnitt', { a: koerper, b: koerper });
        expect(s.ergebnis).toBe('S');
        expect(s.provenienz.backend).toBe('server');
        // Der Worker kommt erst mit einer grossen Client-Op (cdt, G8) zum Zug —
        // heute rechnet alles Kleine inline, der Worker bleibt unberührt.
        await k.op('rasterDifferenz', { a: raster(), b: raster() });
        expect(worker.op).not.toHaveBeenCalled();
    });
});
