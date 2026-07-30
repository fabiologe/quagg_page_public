import { describe, it, expect } from 'vitest';
import { lon2tileX, lat2tileY, tileX2lon, tileY2lat, chooseZoomForTileBudget, tileRangeForBounds, lon2tileXFrac, lat2tileYFrac } from '../utils/tileMath.js';

describe('tile <-> lon/lat round trip', () => {
    it('tileX2lon(lon2tileX(lon)) liegt in derselben Kachel', () => {
        const zoom = 15;
        const lon = 7.77; // Kaiserslautern
        const x = lon2tileX(lon, zoom);
        const lonBack = tileX2lon(x, zoom);
        expect(lonBack).toBeLessThanOrEqual(lon);
        expect(lonBack).toBeGreaterThan(lon - 360 / Math.pow(2, zoom));
    });

    it('tileY2lat(lat2tileY(lat)) liegt in derselben Kachel', () => {
        const zoom = 15;
        const lat = 49.44;
        const y = lat2tileY(lat, zoom);
        const latBack = tileY2lat(y, zoom);
        // Y wächst nach Süden -> die Kachel-Obergrenze liegt bei/über lat
        expect(latBack).toBeGreaterThanOrEqual(lat - 0.01);
    });
});

describe('chooseZoomForTileBudget', () => {
    it('wählt den höchsten Zoom, der das Kachel-Budget einhält', () => {
        // Sehr kleine Box -> sollte den maximal erlaubten Zoom bekommen
        const tinyBounds = { minLon: 7.770, minLat: 49.440, maxLon: 7.771, maxLat: 49.441 };
        expect(chooseZoomForTileBudget(tinyBounds, 18, 6)).toBe(18);
    });

    it('reduziert den Zoom für eine große Box, damit das Kachel-Limit nicht überschritten wird', () => {
        const bigBounds = { minLon: 5, minLat: 47, maxLon: 15, maxLat: 55 }; // ganz Deutschland
        const zoom = chooseZoomForTileBudget(bigBounds, 18, 6);
        const range = tileRangeForBounds(bigBounds, zoom);
        expect(range.xMax - range.xMin + 1).toBeLessThanOrEqual(6);
        expect(range.yMax - range.yMin + 1).toBeLessThanOrEqual(6);
    });
});

describe('lon2tileXFrac / lat2tileYFrac', () => {
    it('floor(frac) matches the integer tile index', () => {
        const zoom = 15;
        const lon = 7.77, lat = 49.44;
        expect(Math.floor(lon2tileXFrac(lon, zoom))).toBe(lon2tileX(lon, zoom));
        expect(Math.floor(lat2tileYFrac(lat, zoom))).toBe(lat2tileY(lat, zoom));
    });

    it('is monotonically increasing in lon (x) / non-decreasing tile index as lat drops (y)', () => {
        const zoom = 12;
        expect(lon2tileXFrac(7.0, zoom)).toBeLessThan(lon2tileXFrac(8.0, zoom));
        // Y grows southward
        expect(lat2tileYFrac(50.0, zoom)).toBeLessThan(lat2tileYFrac(49.0, zoom));
    });
});

describe('tileRangeForBounds', () => {
    it('liefert einen validen, nicht-invertierten Kachelbereich', () => {
        const bounds = { minLon: 7.77, minLat: 49.44, maxLon: 7.78, maxLat: 49.45 };
        const range = tileRangeForBounds(bounds, 15);
        expect(range.xMax).toBeGreaterThanOrEqual(range.xMin);
        expect(range.yMax).toBeGreaterThanOrEqual(range.yMin);
    });
});
