import { describe, it, expect } from 'vitest';
import { computeLocalNetworkBounds, padLocalBounds, localBoundsToWGS84, wgs84BoundsToLocal, computeViewportWorldBounds, unionLocalBounds, containsWithMargin } from '../utils/geoBounds.js';

describe('computeLocalNetworkBounds', () => {
    it('berechnet Min/Max aus Nodes', () => {
        const bounds = computeLocalNetworkBounds([
            { x: 10, y: 5 },
            { x: -3, y: 20 },
            { x: 8, y: -1 }
        ]);
        expect(bounds).toEqual({ minX: -3, minY: -1, maxX: 10, maxY: 20 });
    });

    it('ignoriert nicht-endliche Koordinaten', () => {
        const bounds = computeLocalNetworkBounds([
            { x: 10, y: 5 },
            { x: NaN, y: NaN },
            { x: undefined, y: undefined }
        ]);
        expect(bounds).toEqual({ minX: 10, minY: 5, maxX: 10, maxY: 5 });
    });

    it('liefert eine Nullbox bei leerem Netz', () => {
        expect(computeLocalNetworkBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });

    it('bezieht Edge.coords (gebogene Haltungen) mit ein, nicht nur die Endknoten', () => {
        // Zwei Knoten bei x=0..10, aber die Haltung biegt bis x=50 aus —
        // ohne die coords-Punkte würde dieser Kanal aus der Box fallen.
        const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        const edges = [{ coords: [{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 10, y: 0 }] }];

        const bounds = computeLocalNetworkBounds(nodes, edges);
        expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 30 });
    });

    it('funktioniert ohne edgeArray-Argument (Rückwärtskompatibilität)', () => {
        expect(computeLocalNetworkBounds([{ x: 1, y: 2 }])).toEqual({ minX: 1, minY: 2, maxX: 1, maxY: 2 });
    });

    it('ignoriert Edges ohne coords', () => {
        const nodes = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
        const edges = [{}, { coords: [] }, { coords: undefined }];
        expect(computeLocalNetworkBounds(nodes, edges)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    });

    it('"Neu starten": liefert eine Punkt-Box am Anker, wenn das Netz komplett leer ist', () => {
        const anchor = { x: 405000, y: 5477000 };
        expect(computeLocalNetworkBounds([], [], anchor)).toEqual({
            minX: 405000, minY: 5477000, maxX: 405000, maxY: 5477000
        });
    });

    it('ignoriert einen Anker, sobald echte Netzdaten vorhanden sind', () => {
        const anchor = { x: 999999, y: 999999 };
        const bounds = computeLocalNetworkBounds([{ x: 0, y: 0 }, { x: 10, y: 10 }], [], anchor);
        expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    });

    it('fällt ohne Anker weiterhin auf die Nullbox zurück', () => {
        expect(computeLocalNetworkBounds([], [], null)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    });
});

describe('padLocalBounds', () => {
    it('erweitert eine 100x100-Box um 25% auf jeder Seite', () => {
        const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
        const padded = padLocalBounds(bounds, 0.25);
        expect(padded).toEqual({ minX: -25, minY: -25, maxX: 125, maxY: 125 });
    });

    it('nutzt die größere Kantenlänge für ein nicht-quadratisches Netz', () => {
        const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 50 };
        const padded = padLocalBounds(bounds, 0.1);
        // pad = max(200,50,1) * 0.1 = 20, gleich auf allen Seiten
        expect(padded).toEqual({ minX: -20, minY: -20, maxX: 220, maxY: 70 });
    });

    it('vermeidet eine Null-Box beim Einzelknoten-Netz (min. 1m Kante)', () => {
        const bounds = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
        const padded = padLocalBounds(bounds, 0.25);
        expect(padded.maxX - padded.minX).toBeCloseTo(0.5, 5);
    });

    it('nutzt einen größeren minSpan für eine reine Anker-Punkt-Box ("Neu starten")', () => {
        const bounds = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
        const padded = padLocalBounds(bounds, 0.25, 300);
        // pad = max(0,0,300) * 0.25 = 75 -> Kantenlänge 150
        expect(padded.maxX - padded.minX).toBeCloseTo(150, 5);
        expect(padded.maxY - padded.minY).toBeCloseTo(150, 5);
    });
});

describe('localBoundsToWGS84', () => {
    it('transformiert alle vier Ecken einer UTM32N-Box und bildet die umschließende WGS84-Box', () => {
        // Kaiserslautern-Umgebung, grob UTM32N
        const bounds = { minX: 405000, minY: 5477000, maxX: 406000, maxY: 5478000 };
        const wgs84 = localBoundsToWGS84(bounds, 'EPSG:25832');

        expect(wgs84.minLon).toBeLessThan(wgs84.maxLon);
        expect(wgs84.minLat).toBeLessThan(wgs84.maxLat);
        // Grobe Plausibilität: Kaiserslautern liegt bei ca. 7.77°E / 49.44°N
        expect(wgs84.minLon).toBeGreaterThan(7);
        expect(wgs84.maxLon).toBeLessThan(8);
        expect(wgs84.minLat).toBeGreaterThan(49);
        expect(wgs84.maxLat).toBeLessThan(50);
    });
});

describe('wgs84BoundsToLocal', () => {
    it('umschließt nach einem Rundtrip (Hin+Rück durch localBoundsToWGS84) die ursprüngliche Box vollständig', () => {
        // Zwei Enclosing-Box-Schritte hintereinander vergrößern die Box leicht
        // durch die Gitterkonvergenz zwischen UTM und WGS84 — das ist
        // gewollt: die Box darf durch den Rundtrip nie SCHRUMPFEN (sonst
        // fielen Randbereiche des Netzes aus dem späteren Bild-Fetch heraus),
        // aber auch nicht beliebig aufblähen.
        const original = { minX: 405000, minY: 5477000, maxX: 406000, maxY: 5478000 };
        const wgs84 = localBoundsToWGS84(original, 'EPSG:25832');
        const roundTripped = wgs84BoundsToLocal(wgs84, 'EPSG:25832');

        expect(roundTripped.minX).toBeLessThanOrEqual(original.minX);
        expect(roundTripped.minY).toBeLessThanOrEqual(original.minY);
        expect(roundTripped.maxX).toBeGreaterThanOrEqual(original.maxX);
        expect(roundTripped.maxY).toBeGreaterThanOrEqual(original.maxY);

        const originalWidth = original.maxX - original.minX;
        const roundTrippedWidth = roundTripped.maxX - roundTripped.minX;
        expect(roundTrippedWidth - originalWidth).toBeLessThan(originalWidth * 0.05);
    });
});

describe('computeViewportWorldBounds', () => {
    const bounds = { minX: 0, maxY: 100, width: 100, height: 100, centerX: 50, centerY: 50 };

    it('liefert bei Identitäts-Transform (kein Pan/Zoom) genau die volle bounds-Box', () => {
        const viewport = computeViewportWorldBounds(bounds, 0, 0, 1);
        expect(viewport).toEqual({ minX: 0, maxX: 100, minY: 0, maxY: 100 });
    });

    it('schrumpft den sichtbaren Ausschnitt zentriert bei 2x-Zoom', () => {
        const viewport = computeViewportWorldBounds(bounds, 0, 0, 2);
        expect(viewport.minX).toBeCloseTo(25, 5);
        expect(viewport.maxX).toBeCloseTo(75, 5);
        expect(viewport.minY).toBeCloseTo(25, 5);
        expect(viewport.maxY).toBeCloseTo(75, 5);
    });

    it('verschiebt den sichtbaren Ausschnitt bei reinem Pan (kein Zoom), Breite bleibt gleich', () => {
        const viewport = computeViewportWorldBounds(bounds, 10, 0, 1);
        expect(viewport.maxX - viewport.minX).toBeCloseTo(100, 5);
        expect(viewport.minX).not.toBe(0); // hat sich verschoben
    });
});

describe('unionLocalBounds', () => {
    it('bildet die umschließende Box zweier Rechtecke', () => {
        const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
        const b = { minX: 5, minY: -5, maxX: 20, maxY: 8 };
        expect(unionLocalBounds(a, b)).toEqual({ minX: 0, minY: -5, maxX: 20, maxY: 10 });
    });

    it('liefert dieselbe Box, wenn eine die andere vollständig enthält', () => {
        const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
        const inner = { minX: 10, minY: 10, maxX: 20, maxY: 20 };
        expect(unionLocalBounds(outer, inner)).toEqual(outer);
    });
});

describe('containsWithMargin', () => {
    const outer = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    it('liefert true, wenn inner deutlich innerhalb des Sicherheitsabstands liegt', () => {
        const inner = { minX: 40, minY: 40, maxX: 60, maxY: 60 };
        expect(containsWithMargin(outer, inner, 0.15)).toBe(true);
    });

    it('liefert false, wenn inner den Rand samt Sicherheitsabstand berührt', () => {
        // 15% von 100 = 15 -> äußere Grenze der Marge liegt bei 15/85
        const inner = { minX: 10, minY: 40, maxX: 60, maxY: 60 };
        expect(containsWithMargin(outer, inner, 0.15)).toBe(false);
    });

    it('liefert false, wenn inner über outer hinausragt', () => {
        const inner = { minX: -10, minY: 40, maxX: 60, maxY: 60 };
        expect(containsWithMargin(outer, inner, 0.15)).toBe(false);
    });
});
