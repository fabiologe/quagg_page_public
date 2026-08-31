/**
 * FormSchreiber (Stufe 9.2) — was veraltet, wenn sich etwas ändert.
 *
 * Die Fehlerklasse, gegen die diese Datei antritt, ist die unangenehmste, die
 * es gibt: kein Absturz, sondern eine stille Falschaussage. Wird ein Bauteil
 * verschoben und niemand sagt es weiter, zeigt der Plan denselben Wert an
 * einer neuen Stelle — und sieht dabei völlig richtig aus. Genau so verhielt
 * sich die Prozent-Bemaßung vor Stufe 4.
 */
import { describe, expect, it, vi } from 'vitest';
import { VERBRAUCHER, schreibe, veraltet, veraltetDurch } from '../services/bauform/FormSchreiber.js';

describe('veraltet — die Tabelle', () => {
    it('nennt nur Verbraucher, die es gibt', () => {
        for (const art of ['lage', 'parametrik', 'erzeugt', 'geloescht', 'kg', 'din277', 'pset']) {
            for (const v of veraltet(art)) {
                expect(VERBRAUCHER[v], `${art} → ${v}`).toBeTruthy();
            }
        }
    });

    it('erklärt beim Verschieben alles Ortsbezogene für veraltet', () => {
        const v = veraltet('lage');
        expect(v).toEqual(expect.arrayContaining([
            'resolverCache', 'lageplan', 'laengsschnitt', 'bemassung', 'hoehenlinien',
        ]));
    });

    it('lässt beim Verschieben die MENGEN in Ruhe — ein Rohr wird nicht länger', () => {
        expect(veraltet('lage')).not.toContain('mengen');
    });

    it('erklärt bei einem geänderten Maß die Mengen für veraltet, die Bemaßung nicht', () => {
        // Ein anderes DN ändert die Form, nicht den Ort: Maßketten anderer
        // Bauteile bleiben gültig.
        expect(veraltet('parametrik')).toContain('mengen');
        expect(veraltet('parametrik')).not.toContain('bemassung');
    });

    it('rührt bei Merkmalen nur den Plan an — sie färben Linien um', () => {
        expect(veraltet('kg')).toEqual(['lageplan']);
        expect(veraltet('din277')).toEqual(['lageplan']);
    });

    it('gibt bei unbekannter Art eine leere Liste, nicht undefined', () => {
        expect(veraltet('gibtsnicht')).toEqual([]);
        expect(veraltet(undefined)).toEqual([]);
    });

    it('gibt eine Kopie heraus — die Tabelle ist geteilter Zustand', () => {
        const v = veraltet('lage');
        v.push('unsinn');
        expect(veraltet('lage')).not.toContain('unsinn');
    });
});

describe('veraltetDurch — ein Stapel, eine Verwerfung', () => {
    it('fasst mehrere Arten ohne Doppelungen zusammen', () => {
        const v = veraltetDurch(['lage', 'lage', 'parametrik']);
        expect(new Set(v).size).toBe(v.length);
        expect(v).toContain('mengen');       // aus parametrik
        expect(v).toContain('bemassung');    // aus lage
    });

    it('erträgt eine leere Liste', () => {
        expect(veraltetDurch(null)).toEqual([]);
    });
});

describe('schreibe', () => {
    const autorMit = (ergebnis) => ({ setzeAnker: vi.fn(async () => ergebnis) });

    it('meldet nach einem echten Zug, was veraltet ist', async () => {
        const r = await schreibe({
            autor: autorMit({ ok: true, versatz: { dx: 1, dy: 0, dz: 0 } }),
            modelId: 'm1', localId: 1, art: 'lage', wert: { x: 1, y: 0, z: 0 },
        });
        expect(r.ok).toBe(true);
        expect(r.veraltet).toContain('lageplan');
    });

    it('erklärt NICHTS für veraltet, wenn gar nichts bewegt wurde', async () => {
        // Sonst zeichnete jede Rundung unter der Bautoleranz den ganzen Plan neu.
        const r = await schreibe({
            autor: autorMit({ ok: true, versatz: null }),
            modelId: 'm1', localId: 1, art: 'lage', wert: { x: 0, y: 0, z: 0 },
        });
        expect(r).toEqual({ ok: true, veraltet: [] });
    });

    it('erklärt nach einem Misserfolg nichts für veraltet', async () => {
        const r = await schreibe({
            autor: autorMit({ ok: false, grund: 'kein_editor' }),
            modelId: 'm1', localId: 1, art: 'lage', wert: { x: 1, y: 0, z: 0 },
        });
        expect(r.ok).toBe(false);
        expect(r.veraltet).toEqual([]);
    });

    it('sagt bei einer noch nicht schreibbaren Art, welche gemeint war', async () => {
        const r = await schreibe({ autor: autorMit({}), art: 'parametrik' });
        expect(r.grund).toBe('art_nicht_schreibbar:parametrik');
    });

    it('erträgt einen fehlenden Autor', async () => {
        expect((await schreibe({ art: 'lage' })).grund).toBe('kein_autor');
    });
});
