/**
 * InkGeometry — Strich-Umrisse (perfect-freehand) und Treffer-Tests.
 *
 * Alles rechnet im SEITEN-PUNKTRAUM (PDF-User-Units): Der Umriss eines
 * Strichs ist damit zoominvariant und wird je Strich genau EINMAL berechnet
 * und gecacht — Bildschirm-Painter und PDF-Export skalieren nur noch.
 *
 * Druck: Stift liefert echten Druck (points[i][2]); Finger/Maus laufen mit
 * konstant 0.5 und `simulatePressure` (Geschwindigkeit moduliert die Breite —
 * das gibt den OneNote-Look auch ohne Stift).
 */

import { getStroke } from 'perfect-freehand';

/** Druckverhalten je Stiftart: Filzstift/Marker konstant, Bleistift am stärksten. */
function _thinningFuer(annot) {
    if (annot.tool === 'textmarker') return 0;
    switch (annot.stiftArt) {
        case 'bleistift': return 0.68;
        case 'filzstift': return 0;
        default: return 0.55;   // Kugelschreiber (auch Bestandsdaten ohne stiftArt)
    }
}

/** Optionen für perfect-freehand aus einer Ink-Annotation. */
export function freehandOptionen(annot, { laufend = false } = {}) {
    return {
        size: annot.breitePt,
        thinning: _thinningFuer(annot),
        smoothing: 0.5,
        streamline: laufend ? 0.35 : 0.5,     // nass: weniger Nachlauf hinter dem Stift
        simulatePressure: !annot.echterDruck,
        last: !laufend,
    };
}

/**
 * Geschlossener Umriss eines Strichs als Punktliste [[x,y],...] (Seitenpunkte).
 * @param {{points: number[][], breitePt: number, tool: string, echterDruck: boolean}} annot
 */
export function strichUmriss(annot, opts = {}) {
    if (!annot.points?.length) return [];
    return getStroke(annot.points, freehandOptionen(annot, opts));
}

// ── Umriss-Cache (je Strich einmal — Annotationen sind nach Commit unveränderlich,
//    Verschieben läuft über eine Translation der Punkte und invalidiert per id+rev) ──

const _cache = new Map();   // `${id}:${rev}:${variante}` → Umriss
const CACHE_MAX = 600;

/**
 * @param {string} variante 'haupt' oder 'rand' — 'rand' ist der 1,5-fach
 *   breitere Umriss für den weichen Bleistift-Saum (Painter zeichnet ihn
 *   mit geringer Deckkraft UNTER dem Hauptumriss).
 */
export function strichUmrissGecacht(annot, variante = 'haupt') {
    const schluessel = `${annot.id}:${annot.rev ?? 0}:${variante}`;
    let umriss = _cache.get(schluessel);
    if (!umriss) {
        umriss = variante === 'rand'
            ? strichUmriss({ ...annot, breitePt: annot.breitePt * 1.5 })
            : strichUmriss(annot);
        _cache.set(schluessel, umriss);
        if (_cache.size > CACHE_MAX) {
            // FIFO reicht — Wiederaufbau ist billig, nur nicht in der Stiftschleife.
            _cache.delete(_cache.keys().next().value);
        }
    }
    return umriss;
}

export function leereUmrissCache() { _cache.clear(); }

// ── Treffer-Tests (Radierer, Lasso) ─────────────────────────────────────────

/** Quadrat des Abstands Punkt→Strecke. */
function _distQuadratZuSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx - px, qy = y1 + t * dy - py;
    return qx * qx + qy * qy;
}

/**
 * Trifft ein Radierer-Punkt (Seitenkoordinaten, Radius in Punkten) den Strich?
 * Getestet wird gegen die Eingabepolyline plus halbe Strichbreite.
 */
export function trifftStrich(annot, x, y, radiusPt) {
    const grenze = radiusPt + annot.breitePt / 2;
    const g2 = grenze * grenze;
    const p = annot.points;
    if (p.length === 1) {
        const dx = p[0][0] - x, dy = p[0][1] - y;
        return dx * dx + dy * dy <= g2;
    }
    for (let i = 0; i < p.length - 1; i++) {
        if (_distQuadratZuSegment(x, y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) <= g2) {
            return true;
        }
    }
    return false;
}

/** Punkt-in-Polygon (Ray-Casting). Polygon: [[x,y],...]. */
export function punktInPolygon(x, y, polygon) {
    let drin = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            drin = !drin;
        }
    }
    return drin;
}

/**
 * Lasso-Auswahl: Strich gilt als gewählt, wenn mindestens `anteil` seiner
 * Eingabepunkte im Polygon liegen (Standard 50 %).
 */
export function strichInPolygon(annot, polygon, anteil = 0.5) {
    if (!annot.points.length || polygon.length < 3) return false;
    let drin = 0;
    for (const [x, y] of annot.points) {
        if (punktInPolygon(x, y, polygon)) drin++;
    }
    return drin / annot.points.length >= anteil;
}

// ── Punkt-Radierer: Strich am Radierkreis zerteilen ─────────────────────────

/**
 * Schnittparameter t des Kreises mit der Strecke a→b (Quadratik), oder null.
 * @returns {[number, number]|null} [tEin, tAus], unbeschnitten (kann <0/>1 liegen)
 */
function _kreisSchnitt(a, b, cx, cy, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const fx = a[0] - cx, fy = a[1] - cy;
    const A = dx * dx + dy * dy;
    if (A === 0) return null;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return null;
    const wurzel = Math.sqrt(disc);
    return [(-B - wurzel) / (2 * A), (-B + wurzel) / (2 * A)];
}

function _lerpPunkt(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        (a[2] ?? 0.5) + ((b[2] ?? 0.5) - (a[2] ?? 0.5)) * t,
    ];
}

/**
 * Punkt-Radierer: entfernt aus einer Polyline den Teil im Radierkreis und
 * liefert die überlebenden Teilstücke. Schneidet auch MITTEN in Segmenten
 * (schnelle Striche haben weit auseinanderliegende Punkte — reine
 * Punktfilterung würde den Kreis dazwischen verfehlen); an den Schnitt-
 * stellen entstehen interpolierte Randpunkte samt Druck.
 *
 * @param {number[][]} points  [[x, y, druck], ...]
 * @param {number} radius      effektiver Radius (Radierer + halbe Strichbreite)
 * @returns {number[][][]}     Teilstücke mit je ≥ 2 Punkten (Splitter < minLaenge fallen weg)
 */
export function zerteileStrich(points, cx, cy, radius, minLaenge = 0.6) {
    const r2 = radius * radius;
    const drin = (p) => {
        const dx = p[0] - cx, dy = p[1] - cy;
        return dx * dx + dy * dy <= r2;
    };

    if (points.length === 1) {
        return drin(points[0]) ? [] : [points.map(p => p.slice())];
    }

    const teile = [];
    let aktuelle = [];
    const schliesseTeil = () => {
        if (aktuelle.length >= 2) {
            let laenge = 0;
            for (let i = 0; i < aktuelle.length - 1; i++) {
                laenge += Math.hypot(
                    aktuelle[i + 1][0] - aktuelle[i][0],
                    aktuelle[i + 1][1] - aktuelle[i][1]);
            }
            if (laenge >= minLaenge) teile.push(aktuelle);
        }
        aktuelle = [];
    };

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        if (i === 0 && !drin(a)) aktuelle.push(a.slice());

        const ts = _kreisSchnitt(a, b, cx, cy, radius);
        const ueberlappt = ts && ts[1] > 0 && ts[0] < 1;
        if (!ueberlappt) {
            // Segment liegt ganz drin oder ganz draußen
            if (!drin(a) && !drin(b)) aktuelle.push(b.slice());
            continue;
        }
        const tEin = Math.max(0, ts[0]);
        const tAus = Math.min(1, ts[1]);
        if (tEin > 0) {
            aktuelle.push(_lerpPunkt(a, b, tEin));
            schliesseTeil();
        } else {
            schliesseTeil();   // a war schon drin — laufendes Teilstück endet
        }
        if (tAus < 1) {
            aktuelle = [_lerpPunkt(a, b, tAus), b.slice()];
        }
    }
    schliesseTeil();
    return teile;
}

/** Achsenparallele Box um die Eingabepunkte (für schnelle Vorfilter). */
export function begrenzungsBox(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}
