/**
 * Projektkoordinaten (Stufe 13.2) — die Auflösung des Wirrwarrs.
 *
 * Die Zahlen stammen aus Fabios echten Dateien, nicht aus der Luft:
 *
 *   ENQUIER (Saarland)  Platzierungen 2.577.078 … 2.577.544 / 5.465.569 …
 *                       MapConversion 2.577.078 / 5.465.569 / 0
 *                       deklariert EPSG:25832 — ist aber GK2
 *   A64 (Pfalz)         Platzierungen    325.721 …   333.590
 *                       MapConversion    325.721 / 5.515.000 / 0
 *                       deklariert EPSG:25832 — stimmt
 *
 * Beide tragen ABSOLUTE Koordinaten UND eine MapConversion, die deren
 * Bounding-Box-Ecke nennt. Wer die Norm wörtlich befolgt („IfcMapConversion
 * shall take precedence"), zählt doppelt.
 */
import { describe, expect, it } from 'vitest';
import { bestimmeBezug } from '../services/Projektkoordinaten.js';
import { erkenneSystem, pruefeEtikett } from '../services/Koordinatensysteme.js';

/** Ladeversatz, wie ihn die Engine für ENQUIER bildet (Welt + Versatz = roh). */
const ENQUIER = {
    georeferenz: {
        kartenbezug: { ost: 2577078, nord: 5465569, hoehe: 0, drehung: 0, massstab: 1 },
        crs: { name: 'EPSG:25832' },
    },
    versatz: { x: 2577310, y: 318.4, z: -5465727 },
};

describe('Die MapConversion wird NICHT angewandt, wenn die Geometrie schon verortet ist', () => {
    it('erkennt Landeskoordinaten in der Rohgeometrie', () => {
        const b = bestimmeBezug(ENQUIER);
        expect(b.geometrieIstVerortet).toBe(true);
        expect(b.mapAngewandt).toBe(false);
        expect(b.befunde.some(f => /zweite Verschiebung/.test(f.text))).toBe(true);
    });

    it('liefert Werte im Bereich der Datei, nicht das Doppelte', () => {
        // Ohne die Prüfung käme 5.154.156 heraus — ein Wert, den es nirgends gibt.
        const p = bestimmeBezug(ENQUIER).nachProjekt({ x: -139.401, y: -16.4, z: -51.53 });
        expect(p.ost).toBeGreaterThan(2_577_000);
        expect(p.ost).toBeLessThan(2_578_000);
        expect(p.hoehe).toBeCloseTo(302, 3);
    });

    it('wendet sie sehr wohl an, wenn die Geometrie LOKAL ist', () => {
        // Der normkonforme Fall: Bauteile um den Ursprung, Versatz in der
        // MapConversion. Dann MUSS sie gelten.
        const b = bestimmeBezug({
            georeferenz: ENQUIER.georeferenz,
            versatz: { x: 0, y: 0, z: 0 },
        });
        expect(b.geometrieIstVerortet).toBe(false);
        expect(b.mapAngewandt).toBe(true);
        expect(b.nachProjekt({ x: 100, y: 5, z: 0 }).ost).toBeCloseTo(2577178, 3);
    });
});

describe('Das CRS-Etikett wird geprüft, nicht geglaubt', () => {
    it('entlarvt UTM32 als Gauß-Krüger 2', () => {
        const b = bestimmeBezug(ENQUIER);
        expect(b.crs.deklariert).toBe('EPSG:25832');
        expect(b.crs.erkannt).toBe('EPSG:31466');
        expect(b.crs.stimmt).toBe(false);
        expect(b.crs.wirksam).toBe('EPSG:31466');      // gerechnet wird mit dem erkannten
        expect(b.befunde.some(f => /Gauß-Krüger Zone 2/.test(f.text))).toBe(true);
    });

    it('lässt ein stimmiges Etikett in Ruhe', () => {
        const p = pruefeEtikett('EPSG:25832', 325721);
        expect(p.stimmt).toBe(true);
        expect(p.grund).toBe(null);
    });

    it('widerlegt UTM32 gegen UTM33 NICHT — das wäre eine Behauptung', () => {
        // Beide haben denselben Ostwertbereich. Am Rechtswert allein ist das
        // nicht zu entscheiden, also bleibt das Etikett stehen.
        expect(pruefeEtikett('EPSG:25833', 325721).stimmt).toBe(true);
        expect(erkenneSystem(325721).mehrdeutig).toContain('EPSG:25833');
    });

    it('erfindet nichts, wo nichts passt', () => {
        expect(erkenneSystem(12345)).toBe(null);
        expect(erkenneSystem(NaN)).toBe(null);
        expect(pruefeEtikett('EPSG:25832', 12345).erkannt).toBe(null);
    });
});

describe('Ohne jeden Landesbezug wird das gesagt', () => {
    it('meldet modellbezogene Werte statt so zu tun als wären es amtliche', () => {
        const b = bestimmeBezug({ georeferenz: null, versatz: { x: 0, y: 0, z: 0 } });
        expect(b.mapAngewandt).toBe(false);
        expect(b.geometrieIstVerortet).toBe(false);
        expect(b.befunde.some(f => /nicht amtlich/.test(f.text))).toBe(true);
        expect(b.crs.wirksam).toBe(null);
    });

    it('rechnet auch dann, statt null zu liefern', () => {
        // Der Aufrufer soll nicht auf zwei Fälle prüfen müssen.
        const p = bestimmeBezug({ georeferenz: null, versatz: { x: 10, y: 2, z: -3 } })
            .nachProjekt({ x: 1, y: 1, z: 1 });
        expect(p).toEqual({ ost: 11, nord: 2, hoehe: 3 });
    });
});

describe('Die Drehung aus der MapConversion', () => {
    it('dreht nur, wenn die MapConversion überhaupt gilt', () => {
        const gedreht = {
            kartenbezug: { ost: 1000, nord: 2000, hoehe: 0, drehung: Math.PI / 2, massstab: 1 },
            crs: { name: 'EPSG:25832' },
        };
        // Lokale Geometrie ⇒ MapConversion gilt ⇒ Drehung greift.
        const a = bestimmeBezug({ georeferenz: gedreht, versatz: { x: 0, y: 0, z: 0 } });
        expect(a.mapAngewandt).toBe(true);
        const p = a.nachProjekt({ x: 100, y: 0, z: 0 });
        expect(p.ost).toBeCloseTo(1000, 6);          // 100 nach Osten wird 100 nach Norden
        expect(p.nord).toBeCloseTo(2100, 6);

        // Absolute Geometrie ⇒ MapConversion gilt nicht ⇒ auch die Drehung nicht.
        const b = bestimmeBezug({ georeferenz: gedreht, versatz: { x: 325721, y: 0, z: -5515000 } });
        expect(b.mapAngewandt).toBe(false);
        expect(b.nachProjekt({ x: 100, y: 0, z: 0 }).ost).toBeCloseTo(325821, 6);
    });
});
