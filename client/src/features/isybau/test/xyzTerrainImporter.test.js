import { describe, it, expect } from 'vitest';
import {
    parseEsriAsciiGrid,
    parseXyzPoints,
    analyzeGeometry,
    buildHeader,
    buildRegularDem,
    makeTerrainObject,
    importXyzTerrain,
    NODATA,
} from '../utils/xyzTerrainImporter.js';

describe('parseEsriAsciiGrid', () => {
    // 3x2-Grid (ncols=3, nrows=2), Datei-Zeile 0 = Norden (oben):
    //   Datei-Zeile0 (Norden): 10 11 12
    //   Datei-Zeile1 (Süden):   1  2  3
    const gridText = [
        'ncols         3',
        'nrows         2',
        'xllcorner     100.0',
        'yllcorner     200.0',
        'cellsize      1.0',
        'NODATA_value  -9999',
        '10 11 12',
        '1 2 3',
    ].join('\n');

    it('reads header + matrix, flipping file rows (north-first) into bottom-up gridData', () => {
        const result = parseEsriAsciiGrid(gridText);
        expect(result).not.toBeNull();
        const { data, header } = result;
        expect(header).toMatchObject({ ncols: 3, nrows: 2, cellsize: 1 });
        // bottom-up row 0 = Süden = Datei-Zeile1 (1,2,3); row 1 = Norden = Datei-Zeile0 (10,11,12)
        expect(Array.from(data)).toEqual([1, 2, 3, 10, 11, 12]);
    });

    it('derives xll/yll as cell-center from xllcorner/yllcorner', () => {
        const { header } = parseEsriAsciiGrid(gridText);
        expect(header.xll).toBeCloseTo(100.5, 6);
        expect(header.yll).toBeCloseTo(200.5, 6);
    });

    it('supports xllcenter/yllcenter directly', () => {
        const text = gridText
            .replace('xllcorner     100.0', 'xllcenter     100.5')
            .replace('yllcorner     200.0', 'yllcenter     200.5');
        const { header } = parseEsriAsciiGrid(text);
        expect(header.xll).toBeCloseTo(100.5, 6);
        expect(header.yll).toBeCloseTo(200.5, 6);
    });

    it('is case-insensitive on header keys', () => {
        const text = gridText.replace('NODATA_value', 'nodata_value');
        expect(parseEsriAsciiGrid(text)).not.toBeNull();
    });

    it('maps NODATA_value cells to the canonical NODATA sentinel', () => {
        const text = gridText.replace('1 2 3', '1 -9999 3');
        const { data } = parseEsriAsciiGrid(text);
        expect(data[1]).toBe(NODATA);
    });

    it('handles a matrix row wrapped across multiple lines', () => {
        const wrapped = gridText.replace('10 11 12', '10 11\n12');
        const { data } = parseEsriAsciiGrid(wrapped);
        expect(Array.from(data)).toEqual([1, 2, 3, 10, 11, 12]);
    });

    it('returns null for plain XYZ text (no ncols/nrows header)', () => {
        expect(parseEsriAsciiGrid('1 2 3\n4 5 6\n')).toBeNull();
    });

    it('throws on an incomplete matrix body', () => {
        const truncated = gridText.replace('1 2 3', '1 2');
        expect(() => parseEsriAsciiGrid(truncated)).toThrow(/unvollständig/);
    });
});

describe('parseXyzPoints', () => {
    it('parses whitespace-separated XYZ lines, skipping comments and ASC headers', () => {
        const text = '# comment\nncols 10\n0 0 5\n1 0 5.5\n0 1 6\n';
        const pts = parseXyzPoints(text);
        expect(pts.length / 3).toBe(3);
        expect(pts[0]).toBe(0); expect(pts[1]).toBe(0); expect(pts[2]).toBe(5);
    });

    it('throws when no valid points are found', () => {
        expect(() => parseXyzPoints('ncols 10\nnrows 10\n')).toThrow();
    });
});

describe('analyzeGeometry + buildRegularDem (regular grid via TIN path)', () => {
    it('detects a regular grid and interpolates a flat plane correctly', () => {
        const pts = [];
        for (let y = 0; y <= 4; y++) {
            for (let x = 0; x <= 4; x++) {
                pts.push(x, y, 10 + x * 0.5); // linear ramp in x
            }
        }
        const flat = new Float64Array(pts);
        const analysis = analyzeGeometry(flat);
        expect(analysis.isRegular).toBe(true);
        expect(analysis.suggestedCellsize).toBeCloseTo(1, 6);

        const header = buildHeader(analysis.extent, analysis.suggestedCellsize);
        const { data } = buildRegularDem(flat, header, { method: 'tin' });
        const terrain = makeTerrainObject(data, header);
        expect(terrain.ncols).toBe(5);
        expect(terrain.nrows).toBe(5);
        expect(terrain.minZ).toBeCloseTo(10, 3);
        expect(terrain.maxZ).toBeCloseTo(12, 3);
    });
});

describe('importXyzTerrain', () => {
    it('routes ESRI-grid text through the direct grid path (format=esri-ascii-grid)', () => {
        const text = [
            'ncols 2', 'nrows 2', 'xllcorner 0', 'yllcorner 0', 'cellsize 1', 'NODATA_value -9999',
            '5 6', '1 2',
        ].join('\n');
        const { terrain, analysis } = importXyzTerrain(text);
        expect(analysis.format).toBe('esri-ascii-grid');
        expect(terrain.ncols).toBe(2);
        expect(terrain.nrows).toBe(2);
    });

    it('routes plain XYZ text through the point-cloud path (format=xyz-points)', () => {
        const lines = [];
        for (let y = 0; y <= 2; y++) for (let x = 0; x <= 2; x++) lines.push(`${x} ${y} ${x + y}`);
        const { terrain, analysis } = importXyzTerrain(lines.join('\n'));
        expect(analysis.format).toBe('xyz-points');
        expect(terrain.ncols).toBeGreaterThan(0);
    });
});
