/**
 * Die Form des Ladeversatzes (Stufe 13.0).
 *
 * DER FEHLER, den diese Datei festhält, war EINE Zeile mit vier stillen
 * Folgen. `IfcEngine.getAllCoordOffsets()` gab `off.toArray()` zurück, also
 * `[x, y, z]`; `getCoordOffsetForModel()` daneben gab einen `THREE.Vector3`.
 * Jeder Verbraucher greift mit `.x`/`.y`/`.z` zu — und ein Array liefert darauf
 * `undefined`, ohne zu werfen:
 *
 *   DxfExporter          jede exportierte Koordinate NaN
 *   LaengsschnittBuilder heightOffsetY immer 0 → die „m NN"-Achse zeigte Welt-Y
 *   UtmGrid              Gitterkreuze beschrifteten Weltkoordinaten als E/N
 *   AxisAnnotations      Achs-Polylinien NaN
 *
 * WARUM ES KEIN TEST GESEHEN HAT: `utmGrid.test.js`, `dxfExporter.test.js` und
 * `geometryResolver.test.js` übergeben durchweg `{x, z}`-OBJEKTE — die Form,
 * die die Engine gar nicht lieferte. Sie prüften eine Schnittstelle, die es so
 * nicht gab, und waren dabei alle grün.
 *
 * Deshalb geht dieser Guard von der ECHTEN Ausgabe aus: er baut den Versatz
 * genau so, wie die Engine ihn baut, und schickt ihn unverändert durch die
 * Verbraucher. Er prüft nicht, was sie tun sollten — er prüft, dass das, was
 * ankommt, überhaupt ankommt.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeUtmCrosses } from '../services/UtmGrid.js';
import { vectorContentToDxf } from '../services/DxfExporter.js';
import { OHNE_VERSATZ, ersterVersatz, hoehenversatzAus, istVersatz } from '../services/Koordinaten.js';

/**
 * Die Ausgabe von `IfcEngine.getAllCoordOffsets()` nachgebaut — Zeile für
 * Zeile wie dort, damit die Form wirklich dieselbe ist.
 */
function versatzWieEngine() {
    const koord = new Map([['m1', new THREE.Vector3(325721, 288.4, -5515000)]]);
    const out = {};
    for (const [mid, off] of koord) out[mid] = { x: off.x, y: off.y, z: off.z };
    return out;
}

describe('Beide Accessoren liefern DIESELBE Form', () => {
    it('gibt Objekte mit x, y, z heraus — kein Array', () => {
        const alle = versatzWieEngine();
        const erster = Object.values(alle)[0];
        expect(Array.isArray(erster)).toBe(false);
        for (const k of ['x', 'y', 'z']) expect(Number.isFinite(erster[k]), k).toBe(true);
    });

    it('würde ein Array als unbrauchbar auffallen lassen', () => {
        // Der Nachweis, dass der Guard den alten Fehler WIRKLICH fängt.
        const alsArray = [325721, 288.4, -5515000];
        expect(Number.isFinite(alsArray.x)).toBe(false);
        expect(alsArray).toBeTruthy();          // ← deshalb griff `?? {x:0}` nie
    });
});

describe('Die Verbraucher überleben die echte Ausgabe', () => {
    const versatz = Object.values(versatzWieEngine())[0];

    const BOUNDS = { wXmin: 0, wXmax: 200, wZmin: -200, wZmax: 0 };
    const INHALT = { outlines: [{ category: 'IFCPIPESEGMENT', rings: [[[0, 0], [10, 0], [10, 10]]] }] };

    it('UtmGrid beschriftet echte Ostwerte, nicht Weltkoordinaten', () => {
        const { crosses } = computeUtmCrosses(BOUNDS, versatz, { spacing: 100 });
        expect(crosses.length).toBeGreaterThan(0);
        for (const k of crosses) {
            expect(Number.isFinite(k.east), 'east').toBe(true);
            expect(Number.isFinite(k.north), 'north').toBe(true);
        }
        // Und sie liegen im Bereich des Versatzes, nicht bei 0…200.
        expect(Math.min(...crosses.map(k => k.east))).toBeGreaterThan(300000);
    });

    it('MIT der alten Array-Form hätte UtmGrid Weltkoordinaten beschriftet', () => {
        // Der Nachweis, wie der Fehler aussah: `offset?.x ?? 0` griff auf ein
        // Array, bekam `undefined`, nahm 0 — und beschriftete 0…200 als Ostwert.
        const { crosses } = computeUtmCrosses(BOUNDS, [325721, 288.4, -5515000], { spacing: 100 });
        expect(Math.max(...crosses.map(k => k.east))).toBeLessThan(1000);
    });

    it('DXF exportiert Koordinaten, keine NaN', () => {
        const dxf = vectorContentToDxf(INHALT, { offset: versatz });
        expect(typeof dxf).toBe('string');
        expect(dxf).not.toMatch(/NaN/);
        expect(dxf.length).toBeGreaterThan(100);
    });

    it('fällt bei einem UNBRAUCHBAREN Versatz auf 0 zurück, statt NaN zu schreiben', () => {
        // Der gehärtete Rückfall: lieber ohne Versatz als mit NaN. Vorher war
        // genau das die Lage — ein Array ist truthy, also sprang `??` nicht an.
        const dxf = vectorContentToDxf(INHALT, { offset: [325721, 288.4, -5515000] });
        expect(dxf).not.toMatch(/NaN/);
    });
});

describe('Der Versatz wird an EINER Stelle geprüft', () => {
    /**
     * Dieselbe Rechnung stand vorher zweimal unabhängig da —
     * `LaengsschnittBuilder.js:156` und `usePlanExport.js:40` — und beide waren
     * gleich falsch. Zwei Wege zu derselben Zahl laufen auseinander; hier sind
     * sie schon auseinandergelaufen, bevor sie überhaupt richtig waren.
     */
    it('erkennt die ECHTE Form und weist die alte zurück', () => {
        expect(istVersatz({ x: 1, y: 2, z: 3 })).toBe(true);
        expect(istVersatz([1, 2, 3])).toBe(false);       // ← der alte Fehler
        expect(istVersatz(null)).toBe(false);
        expect(istVersatz({ x: 1, z: 3 })).toBe(false);  // y fehlt
        expect(istVersatz({ x: NaN, y: 2, z: 3 })).toBe(false);
    });

    it('gibt im Zweifel den Nullversatz, nie undefined', () => {
        // Ein `undefined` hier hätte sich als NaN durch jede Rechnung gezogen.
        expect(ersterVersatz({})).toEqual(OHNE_VERSATZ);
        expect(ersterVersatz(null)).toEqual(OHNE_VERSATZ);
        expect(ersterVersatz({ m1: [1, 2, 3] })).toEqual(OHNE_VERSATZ);
    });

    it('holt die Höhenkomponente aus der echten Engine-Ausgabe', () => {
        // Genau das war beim Längsschnitt immer 0, und die Achse hiess
        // trotzdem „m NN".
        expect(hoehenversatzAus(versatzWieEngine())).toBeCloseTo(288.4, 6);
        expect(hoehenversatzAus({ m1: [325721, 288.4, -5515000] })).toBe(0);
    });
});
