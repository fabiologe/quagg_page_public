import { describe, it, expect } from 'vitest';
import { marchingSquares, segmentsToLocalCoords, groupSegmentsByElevation, stitchSegmentsToPolylines, simplifyPolyline } from '../utils/contourGenerator.js';

function buildRamp(width, height, valueAt) {
    const raster = new Float32Array(width * height);
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            raster[row * width + col] = valueAt(row, col);
        }
    }
    return raster;
}

describe('marchingSquares', () => {
    it('liefert keine Segmente für ein flaches Raster (min === max)', () => {
        const raster = buildRamp(5, 5, () => 42);
        expect(marchingSquares(raster, 5, 5, 1)).toEqual([]);
    });

    it('liefert keine Segmente bei zu kleinem Raster oder ungültigem Intervall', () => {
        expect(marchingSquares(new Float32Array(4), 2, 1, 1)).toEqual([]);
        expect(marchingSquares(new Float32Array(4), 1, 2, 1)).toEqual([]);
        expect(marchingSquares(buildRamp(5, 5, (r) => r), 5, 5, 0)).toEqual([]);
    });

    it('erzeugt horizontale Höhenlinien für eine lineare Rampe (nur von der Zeile abhängig)', () => {
        // Werte hängen NUR von der Zeile ab: value = row*10 + 3 (0-basiert),
        // bewusst NICHT exakt auf die Level-Schwellen ausgerichtet (0,10,20,...),
        // um den degenerierten Fall "Eckwert == Level exakt" zu vermeiden.
        const width = 5, height = 5;
        const raster = buildRamp(width, height, (row) => row * 10 + 3);
        const interval = 10;

        const segments = marchingSquares(raster, width, height, interval);

        // Erwartete Level: ceil(3/10)*10=10, 20, 30, 40 (max ist 43)
        const levels = [...new Set(segments.map((s) => s.elevation))].sort((a, b) => a - b);
        expect(levels).toEqual([10, 20, 30, 40]);

        for (const level of levels) {
            const atLevel = segments.filter((s) => s.elevation === level);
            // Ein Segment pro Spalten-Paar (width-1 = 4 Zellen breit)
            expect(atLevel).toHaveLength(width - 1);

            const expectedY = (level - 3) / 10; // Umkehrung von value = row*10+3
            for (const seg of atLevel) {
                expect(seg.y1).toBeCloseTo(expectedY, 5);
                expect(seg.y2).toBeCloseTo(expectedY, 5);
            }
        }
    });

    it('löst Sattelpunkte (zwei gegenüberliegende Ecken über dem Level) in zwei Liniensegmente auf', () => {
        // 2x2-Zelle: TL und BR hoch, TR und BL niedrig (klassischer Sattel-Fall,
        // Case 10 in der Bit-Kodierung TL=8,TR=4,BR=2,BL=1). min=0 liegt hier
        // exakt auf einer Level-Schwelle und erzeugt selbst schon einen
        // (validen) Rand-Contour bei 0 — die Prüfung fokussiert daher gezielt
        // auf Level 5, das strikt zwischen den Eckwerten liegt.
        const width = 2, height = 2;
        const raster = new Float32Array([
            /* TL */ 10, /* TR */ 0,
            /* BL */ 0, /* BR */ 10
        ]);
        const segments = marchingSquares(raster, width, height, 5).filter((s) => s.elevation === 5);
        expect(segments).toHaveLength(2);

        // Beide Segmente müssen an der TL-Ecke (top+left) bzw. BR-Ecke
        // (right+bottom) anliegen, nicht diagonal quer durch die Zelle.
        const touchesTopLeftCorner = segments.some(
            (s) => (s.x1 === 0 || s.x2 === 0) && (s.y1 === 0 || s.y2 === 0)
        );
        expect(touchesTopLeftCorner).toBe(true);
    });
});

describe('segmentsToLocalCoords', () => {
    it('bildet Pixel-Segmente über die gegebene Funktion in Zielkoordinaten ab', () => {
        const segments = [{ elevation: 10, x1: 0, y1: 0, x2: 2, y2: 3 }];
        const toLocal = (col, row) => [col * 2 + 100, row * 5 + 200];

        const result = segmentsToLocalCoords(segments, toLocal);

        expect(result).toEqual([
            {
                elevation: 10,
                points: [
                    { x: 100, y: 200 },
                    { x: 104, y: 215 }
                ]
            }
        ]);
    });
});

describe('groupSegmentsByElevation', () => {
    it('gruppiert Segmente nach Level und sortiert die Gruppen aufsteigend', () => {
        const segments = [
            { elevation: 20, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
            { elevation: 10, points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] },
            { elevation: 20, points: [{ x: 4, y: 4 }, { x: 5, y: 5 }] }
        ];

        const groups = groupSegmentsByElevation(segments);

        expect(groups.map((g) => g.elevation)).toEqual([10, 20]);
        expect(groups[0].segments).toHaveLength(1);
        expect(groups[1].segments).toHaveLength(2);
        expect(groups[1].segments[0].points[0]).toEqual({ x: 0, y: 0 });
    });

    it('liefert eine leere Liste für leere Eingabe', () => {
        expect(groupSegmentsByElevation([])).toEqual([]);
    });

    it('reduziert tausende Segmente auf eine Handvoll Gruppen (DOM-Node-Sparziel)', () => {
        const segments = [];
        for (let i = 0; i < 5000; i++) {
            segments.push({ elevation: (i % 8) * 2, points: [{ x: i, y: 0 }, { x: i + 1, y: 1 }] });
        }
        const groups = groupSegmentsByElevation(segments);
        expect(groups).toHaveLength(8); // 8 distinkte Level statt 5000 Elemente
    });
});

describe('stitchSegmentsToPolylines', () => {
    it('verkettet zwei Segmente, die einen Endpunkt teilen, zu EINER Punktkette', () => {
        const segments = [
            { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
            { points: [{ x: 1, y: 1 }, { x: 2, y: 0 }] }
        ];
        const polylines = stitchSegmentsToPolylines(segments);
        expect(polylines).toEqual([[{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]]);
    });

    it('verkettet auch, wenn das Start-Segment mitten in der Kette liegt (Rückwärts-Erweiterung)', () => {
        // Eingabereihenfolge bewusst mit dem "mittleren" Segment zuerst.
        const segments = [
            { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }, // Mitte
            { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, // Anfang
            { points: [{ x: 2, y: 2 }, { x: 3, y: 3 }] }  // Ende
        ];
        const polylines = stitchSegmentsToPolylines(segments);
        expect(polylines).toEqual([[
            { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }
        ]]);
    });

    it('lässt unverbundene Segmente als getrennte Polylinien stehen', () => {
        const segments = [
            { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
            { points: [{ x: 10, y: 10 }, { x: 11, y: 10 }] }
        ];
        const polylines = stitchSegmentsToPolylines(segments);
        expect(polylines).toHaveLength(2);
    });

    it('schließt einen geschlossenen Ring korrekt (kehrt zum Startpunkt zurück)', () => {
        const segments = [
            { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
            { points: [{ x: 1, y: 0 }, { x: 1, y: 1 }] },
            { points: [{ x: 1, y: 1 }, { x: 0, y: 1 }] },
            { points: [{ x: 0, y: 1 }, { x: 0, y: 0 }] }
        ];
        const polylines = stitchSegmentsToPolylines(segments);
        expect(polylines).toHaveLength(1);
        expect(polylines[0]).toHaveLength(5); // 4 Kanten -> 5 Punkte, erster == letzter
        expect(polylines[0][0]).toEqual(polylines[0][4]);
    });

    it('reduziert eine lange Kette (500 Segmente) auf EINE Polyline', () => {
        const segments = [];
        for (let i = 0; i < 500; i++) {
            segments.push({ points: [{ x: i, y: 0 }, { x: i + 1, y: 0 }] });
        }
        const polylines = stitchSegmentsToPolylines(segments);
        expect(polylines).toHaveLength(1);
        expect(polylines[0]).toHaveLength(501);
    });
});

describe('simplifyPolyline', () => {
    it('lässt Eingaben mit weniger als 3 Punkten unverändert', () => {
        const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
        expect(simplifyPolyline(two, 5)).toEqual(two);
        expect(simplifyPolyline([], 5)).toEqual([]);
    });

    it('entfernt einen Punkt, der nur minimal von der Verbindungsgeraden abweicht', () => {
        const points = [{ x: 0, y: 0 }, { x: 5, y: 0.1 }, { x: 10, y: 0 }];
        expect(simplifyPolyline(points, 1)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    });

    it('behält einen Punkt, der deutlich von der Verbindungsgeraden abweicht', () => {
        const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }];
        expect(simplifyPolyline(points, 1)).toEqual(points);
    });

    it('behält Start- und Endpunkt immer bei, egal wie stark vereinfacht wird', () => {
        const points = [{ x: 0, y: 0 }, { x: 1, y: 0.01 }, { x: 2, y: -0.01 }, { x: 3, y: 0.02 }, { x: 10, y: 0 }];
        const result = simplifyPolyline(points, 1000); // extremes Epsilon
        expect(result[0]).toEqual(points[0]);
        expect(result[result.length - 1]).toEqual(points[points.length - 1]);
    });

    it('reduziert eine dichte, fast gerade Punktkette drastisch', () => {
        // 100 Punkte entlang einer fast perfekten Geraden mit winzigem Rauschen
        const points = [];
        for (let i = 0; i <= 100; i++) {
            points.push({ x: i, y: Math.sin(i * 0.1) * 0.05 }); // Amplitude 0.05m
        }
        const result = simplifyPolyline(points, 0.5);
        expect(result.length).toBeLessThan(10); // von 101 auf wenige Punkte
        expect(result[0]).toEqual(points[0]);
        expect(result[result.length - 1]).toEqual(points[points.length - 1]);
    });

    it('behält jeden Punkt bei epsilon=0 (keine Vereinfachung, nur Kollinearität exakt Null entfernt)', () => {
        const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        // Alle drei Punkte sind exakt kollinear -> Abstand 0, nicht > epsilon=0
        expect(simplifyPolyline(points, 0)).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }]);
    });
});

