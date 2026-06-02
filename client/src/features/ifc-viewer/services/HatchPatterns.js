/**
 * Hatch Patterns Library
 *
 * Each pattern is a function that fills a polygon (multi-ring, paper-mm space)
 * with a line/dot drawing. All patterns share a common scanline helper so they
 * stay consistent and reasonably fast at PDF scale.
 *
 * Pattern signature:
 *   render(doc, ringsPaperMm, bbox, opts?)
 *     - doc:    jsPDF instance
 *     - rings:  Array<Array<[x_mm, y_mm]>>  -- outer + holes, closed rings
 *     - bbox:   { minX, maxX, minY, maxY }  in mm (paper)
 *     - opts:   optional { spacing, color }
 *
 * The caller (the plotter) prepares the rings in paper coordinates via the
 * world→paper transform — this module is pure 2D-mm geometry.
 */

// ── Common helpers ──────────────────────────────────────────────────────────

/**
 * Walk scanlines at the given angle (degrees, 0 = horizontal, 45 = NE).
 * For each scanline, find polygon-edge intersections and call cb(p0, p1) for
 * each in/out interval pair. Handles convex + concave + holes (even-odd rule).
 */
function _scanlines(rings, bbox, angle, spacing, cb) {
    // angle = angle of the LINES themselves vs. X-axis (in degrees).
    // 0 → horizontal lines, 90 → vertical lines, 45 → diagonal /
    const rad = angle * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = cos, dy = sin;          // line direction
    const nx = -sin, ny = cos;         // scanline normal (perpendicular, 90° CCW)

    // Project all polygon vertices onto the scanline normal to find the n-range
    let nMin = Infinity, nMax = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) {
        const t = x * nx + y * ny;
        if (t < nMin) nMin = t;
        if (t > nMax) nMax = t;
    }
    if (!isFinite(nMin)) return;

    // For each scanline offset n in [nMin..nMax], intersect with polygon edges
    for (let n = Math.floor(nMin / spacing) * spacing; n <= nMax; n += spacing) {
        const hits = [];
        for (const ring of rings) {
            for (let i = 0; i < ring.length - 1; i++) {
                const a = ring[i], b = ring[i + 1];
                // Project endpoints onto normal axis
                const aN = a[0] * nx + a[1] * ny;
                const bN = b[0] * nx + b[1] * ny;
                // Does the scanline (n = const) cross this edge?
                if ((aN < n && bN < n) || (aN > n && bN > n)) continue;
                if (aN === bN) continue;
                const t = (n - aN) / (bN - aN);
                if (t < 0 || t > 1) continue;
                const ix = a[0] + (b[0] - a[0]) * t;
                const iy = a[1] + (b[1] - a[1]) * t;
                // Project the intersection onto the LINE direction to sort by along-axis position
                const tAlong = ix * dx + iy * dy;
                hits.push({ tAlong, x: ix, y: iy });
            }
        }
        if (hits.length < 2) continue;
        hits.sort((a, b) => a.tAlong - b.tAlong);
        for (let i = 0; i + 1 < hits.length; i += 2) {
            cb([hits[i].x, hits[i].y], [hits[i + 1].x, hits[i + 1].y]);
        }
    }
}

/** Quick "is this point inside the polygon" test using even-odd rule. */
function _pointInside(x, y, rings) {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) {
                inside = !inside;
            }
        }
    }
    return inside;
}

// ── Pattern implementations ─────────────────────────────────────────────────

/** 45° diagonal fill — classic concrete look. */
function concrete(doc, rings, bbox, opts = {}) {
    const spacing = opts.spacing ?? 1.6;
    _scanlines(rings, bbox, 45, spacing, (a, b) => doc.line(a[0], a[1], b[0], b[1]));
}

/** Double crosshatch at 45° + 135° — typical steel hatch. */
function steel(doc, rings, bbox, opts = {}) {
    const spacing = opts.spacing ?? 1.2;
    _scanlines(rings, bbox, 45,  spacing, (a, b) => doc.line(a[0], a[1], b[0], b[1]));
    _scanlines(rings, bbox, 135, spacing, (a, b) => doc.line(a[0], a[1], b[0], b[1]));
}

/** Brick pattern — alternating horizontal courses with vertical separators. */
function masonry(doc, rings, bbox, opts = {}) {
    const brickH = opts.brickHeight ?? 2;
    const brickW = opts.brickWidth  ?? 4;
    // Horizontal lines = mortar courses
    _scanlines(rings, bbox, 0, brickH, (a, b) => doc.line(a[0], a[1], b[0], b[1]));
    // Vertical separators with row-offset
    let row = 0;
    for (let y = Math.floor(bbox.minY / brickH) * brickH; y <= bbox.maxY; y += brickH) {
        const offset = (row++ % 2) * (brickW / 2);
        for (let x = Math.floor((bbox.minX - offset) / brickW) * brickW + offset; x <= bbox.maxX; x += brickW) {
            const y1 = y, y2 = y + brickH;
            // Only draw the segment if both endpoints sit inside the polygon
            if (_pointInside(x, y1 + brickH * 0.5, rings)) doc.line(x, y1, x, y2);
        }
    }
}

/** Wood — close-packed vertical lines (no end-grain, just the parallel grain). */
function wood(doc, rings, bbox, opts = {}) {
    const spacing = opts.spacing ?? 1.0;
    _scanlines(rings, bbox, 90, spacing, (a, b) => doc.line(a[0], a[1], b[0], b[1]));
}

/** Earth — alternating dotted/dashed scanlines for backfill / soil look. */
function earth(doc, rings, bbox, opts = {}) {
    const spacing = opts.spacing ?? 2.5;
    let row = 0;
    _scanlines(rings, bbox, 0, spacing, (a, b) => {
        if (row++ % 2 === 0) {
            // dashed scanline
            const dashLen = 1.2, gap = 0.8;
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len === 0) return;
            const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
            for (let t = 0; t < len; t += dashLen + gap) {
                const x0 = a[0] + ux * t,           y0 = a[1] + uy * t;
                const tEnd = Math.min(t + dashLen, len);
                const x1 = a[0] + ux * tEnd,        y1 = a[1] + uy * tEnd;
                doc.line(x0, y0, x1, y1);
            }
        } else {
            // dotted scanline
            const step = 1.6, r = 0.18;
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len === 0) return;
            const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
            for (let t = step / 2; t < len; t += step) {
                doc.circle(a[0] + ux * t, a[1] + uy * t, r, 'F');
            }
        }
    });
}

/** Glass — very light sparse dots, near-transparent fill. */
function glass(doc, rings, bbox, opts = {}) {
    const spacing = opts.spacing ?? 1.8;
    _scanlines(rings, bbox, 0, spacing, (a, b) => {
        const step = 2.4, r = 0.12;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len === 0) return;
        const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
        for (let t = step / 2; t < len; t += step) {
            doc.circle(a[0] + ux * t, a[1] + uy * t, r, 'F');
        }
    });
}

// ── Public registry ─────────────────────────────────────────────────────────

export const HATCH_PATTERNS = {
    concrete:  { name: 'Beton',     render: concrete, color: [80,  80,  80]  },
    steel:     { name: 'Stahl',     render: steel,    color: [60,  60,  80]  },
    masonry:   { name: 'Mauerwerk', render: masonry,  color: [80,  40,  20]  },
    wood:      { name: 'Holz',      render: wood,     color: [120, 80,  20]  },
    earth:     { name: 'Erdreich',  render: earth,    color: [80,  50,  20]  },
    glass:     { name: 'Glas',      render: glass,    color: [100, 140, 180] },
};

/**
 * Draw a named hatch pattern inside a polygon (rings in paper-mm space).
 * No-op for unknown / 'none' patterns.
 *
 * @returns {boolean}  true if something was drawn, false if pattern is 'none'/unknown
 */
export function drawHatch(doc, rings, bbox, patternName, opts = {}) {
    if (!patternName || patternName === 'none') return false;
    const pattern = HATCH_PATTERNS[patternName];
    if (!pattern) return false;

    // Hatch lines render in a dedicated colour unless caller overrode
    const color = opts.color ?? pattern.color;
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setFillColor(color[0], color[1], color[2]);
    doc.setLineWidth(opts.lineWidth ?? 0.08);
    doc.setLineDashPattern([], 0);

    pattern.render(doc, rings, bbox, opts);

    // Reset to neutral
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
    return true;
}

/** Returns the human-readable label for a hatch key. */
export function hatchLabel(name) {
    if (!name || name === 'none') return 'keine';
    return HATCH_PATTERNS[name]?.name ?? name;
}
