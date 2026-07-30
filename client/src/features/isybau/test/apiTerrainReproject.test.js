import { describe, it, expect } from 'vitest';
import { sampleWgs84Grids, buildLocalTerrainFromWgs84Grids } from '../utils/apiTerrainReproject.js';
import { tileX2lon, tileY2lat } from '../utils/tileMath.js';

describe('sampleWgs84Grids', () => {
    const z = 10, xMin = 100, yMin = 200, tileSize = 4;
    // 4x4 raster, values 0..15 row-major.
    const grid = {
        raster: new Float32Array([
            0, 1, 2, 3,
            4, 5, 6, 7,
            8, 9, 10, 11,
            12, 13, 14, 15,
        ]),
        width: 4, height: 4,
        tileParams: { z, xMin, yMin, tileSize },
    };

    function lonLatForPixel(col, row) {
        const fracX = xMin + col / tileSize;
        const fracY = yMin + row / tileSize;
        return [tileX2lon(fracX, z), tileY2lat(fracY, z)];
    }

    it('returns the exact raster value at an exact pixel corner', () => {
        const [lon, lat] = lonLatForPixel(2, 1);
        expect(sampleWgs84Grids([grid], lon, lat)).toBeCloseTo(6, 3); // row1,col2 = 6
    });

    it('bilinearly interpolates at the midpoint between four pixels', () => {
        const [lon0, lat0] = lonLatForPixel(0, 0);
        const [lon1, lat1] = lonLatForPixel(1, 1);
        const lon = (lon0 + lon1) / 2;
        const lat = (lat0 + lat1) / 2;
        expect(sampleWgs84Grids([grid], lon, lat)).toBeCloseTo(2.5, 1); // avg(0,1,4,5)
    });

    it('returns null when the coordinate falls outside all grids', () => {
        expect(sampleWgs84Grids([grid], -50, 10)).toBeNull();
    });

    it('falls through to a later grid if an earlier one does not cover the point', () => {
        const [lon, lat] = lonLatForPixel(2, 1);
        const elsewhereGrid = {
            raster: new Float32Array(16).fill(-1),
            width: 4, height: 4,
            tileParams: { z, xMin: 9000, yMin: 9000, tileSize },
        };
        expect(sampleWgs84Grids([elsewhereGrid, grid], lon, lat)).toBeCloseTo(6, 3);
    });
});

describe('buildLocalTerrainFromWgs84Grids', () => {
    // epsg='EPSG:4326' makes proj4(epsg,'EPSG:4326',...) an identity transform,
    // so "local x/y" below can be treated directly as lon/lat — keeps the test
    // independent of any UTM/GK proj4.defs() registration.
    const z = 10, xMin = 100, yMin = 200, tileSize = 100;
    const width = 50, height = 50;
    const values = new Float32Array(width * height);
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) values[row * width + col] = 10 + row * 0.1 + col * 0.1;
    }
    const grid = { raster: values, width, height, tileParams: { z, xMin, yMin, tileSize } };

    function pixelLonLat(col, row) {
        const fracX = xMin + col / tileSize;
        const fracY = yMin + row / tileSize;
        return [tileX2lon(fracX, z), tileY2lat(fracY, z)];
    }

    it('returns null when no grids are given', () => {
        expect(buildLocalTerrainFromWgs84Grids([], 'EPSG:4326', { minX: 0, minY: 0, maxX: 1, maxY: 1 })).toBeNull();
    });

    it('returns null when localBounds has zero/negative extent', () => {
        expect(buildLocalTerrainFromWgs84Grids([grid], 'EPSG:4326', { minX: 5, minY: 5, maxX: 5, maxY: 5 })).toBeNull();
    });

    it('builds a terrain object covering a bounds window inside the grid, with sane min/max', () => {
        const [lonA, latA] = pixelLonLat(5, 5);
        const [lonB, latB] = pixelLonLat(40, 40);
        const localBounds = {
            minX: Math.min(lonA, lonB), minY: Math.min(latA, latB),
            maxX: Math.max(lonA, lonB), maxY: Math.max(latA, latB),
        };
        const terrain = buildLocalTerrainFromWgs84Grids([grid], 'EPSG:4326', localBounds, { maxCells: 400 });
        expect(terrain).not.toBeNull();
        expect(terrain.ncols).toBeGreaterThan(1);
        expect(terrain.nrows).toBeGreaterThan(1);
        expect(terrain.ncols * terrain.nrows).toBeLessThanOrEqual(400);
        expect(terrain.minZ).toBeGreaterThanOrEqual(9.9);
        expect(terrain.maxZ).toBeLessThanOrEqual(19.9);
        expect(terrain.source).toBe('api');
    });

    it('returns null when localBounds falls entirely outside any cached grid', () => {
        const terrain = buildLocalTerrainFromWgs84Grids([grid], 'EPSG:4326', { minX: -170, minY: -80, maxX: -169, maxY: -79 });
        expect(terrain).toBeNull();
    });
});
