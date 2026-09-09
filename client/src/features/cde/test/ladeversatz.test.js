/**
 * Der Ladeversatz kommt aus der Bibliothek, nicht aus `object.position`
 * (Nachprüfung Teil XVI, 2026-09-08).
 *
 * fragments 3.x lässt `object.position` des ersten Modells auf null und legt
 * den Koordinationspunkt in `core.baseCoordinates` ab. Die Engine las
 * `−object.position` und bekam für X und Z null — die Achsen (roh − 0) lagen
 * bei 2.577.526 / 5.465.712, die Fragment-Welt bei −0,5 / 0. Gesehen im
 * Headless-Lauf am ENQUIER-Netz; die Attrappen hatten immer Versatz 0.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ladeversatzAus } from '../services/IfcEngine.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (rel) => fs.readFileSync(WURZEL + rel, 'utf8');

// Die echten Zahlen vom ENQUIER-Netz (Headless-Lauf 2026-09-08).
const BASE = [-2577527.421, -318.9, 5465712.818, 1, 0, 0, 0, 1, 0];

describe('ladeversatzAus', () => {
    it('nimmt −baseCoordinates — welt = roh − versatz trifft die Fragment-Welt', () => {
        const v = ladeversatzAus({ baseCoordinates: BASE, position: { x: 0, y: 0, z: 0 } });
        expect(v.quelle).toBe('baseCoordinates');
        // FK001-Anfang roh (three-Konvention: z = −Nord): 2577526.921 / 318.4 / −5465712.818
        expect(2577526.921 - v.x).toBeCloseTo(-0.5, 3);
        expect(318.4 - v.y).toBeCloseTo(-0.5, 3);
        expect(-5465712.818 - v.z).toBeCloseTo(0, 3);
    });

    it('fällt ohne Bibliothekswert auf −object.position zurück (spätere Modelle, Attrappen)', () => {
        expect(ladeversatzAus({ baseCoordinates: null, position: { x: 3, y: -2, z: 5 } }))
            .toMatchObject({ x: -3, y: 2, z: -5, quelle: 'position' });
        expect(ladeversatzAus({})).toMatchObject({ x: 0, y: 0, z: 0 });
    });

    it('verwirft eine unbrauchbare Basis, statt NaN in die Welt zu tragen', () => {
        expect(ladeversatzAus({ baseCoordinates: [NaN, 1, 2], position: { x: 1, y: 1, z: 1 } }).quelle).toBe('position');
        expect(ladeversatzAus({ baseCoordinates: [1], position: null }).quelle).toBe('position');
    });

    it('macht aus 0 kein −0', () => {
        const v = ladeversatzAus({ baseCoordinates: [0, 0, 0] });
        expect(Object.is(v.x, 0) && Object.is(v.y, 0) && Object.is(v.z, 0)).toBe(true);
    });
});

describe('Verklebung', () => {
    it('die Engine liest den Versatz über ladeversatzAus und nie mehr aus −object.position', () => {
        const engine = lies('services/IfcEngine.js');
        expect(engine).toMatch(/ladeversatzAus\(\{ baseCoordinates: fragments\.core\.baseCoordinates/);
        expect(engine).not.toMatch(/new THREE\.Vector3\(-objPos\.x/);
    });

    it('die Fragment-Ablage wird am Koordinationspunkt geprüft, nicht an object.position', () => {
        const engine = lies('services/IfcEngine.js');
        expect(engine).toMatch(/await model\.getCoordinates\(\)/);
        expect(engine).toMatch(/const soll = frag\.koordinaten/);
        const ablage = lies('composables/useModellAblage.js');
        expect(ablage).toMatch(/koordinaten: f\.koordinaten \?\? null/);
        expect(ablage).toMatch(/koordinaten: b\.meta\?\.koordinaten \?\? null/);
    });

    it('die Achslese legt Nord auf −z — wie das Netz aus web-ifc und `Projektkoordinaten`', () => {
        const achsen = lies('services/AxisAnnotations.js');
        expect(achsen).toMatch(/z: 0 - a\.y \}, \{ x: b\.x, y: b\.z, z: 0 - b\.y/);
        expect(achsen).toMatch(/out\.push\(\{ x: v\.x, y: v\.z, z: 0 - v\.y \}\)/);
        expect(lies('services/Projektkoordinaten.js')).toMatch(/nord: -roh\.z/);
    });
});
