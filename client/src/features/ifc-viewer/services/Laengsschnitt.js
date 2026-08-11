/**
 * Laengsschnitt — Kern des Kanal-Längsschnitts (Sprint T2, rein/testbar).
 *
 * Aus den Achs-Polylinien der Haltungen (AxisAnnotations) wird der STRANG
 * gebaut: Haltungen werden über Endpunkt-Nähe verkettet (Toleranz überbrückt
 * den Schacht dazwischen), stationiert (kumulative 2D-Länge) und in
 * Fließrichtung orientiert (fallende Achshöhe). Dazu: Geländeprofil über den
 * Höhen-Sampler und Schacht-Projektion auf die Stationierung.
 *
 * Höhen-Konvention: Die Achshöhe der Haltung wird als SOHLE geführt —
 * isyifc schreibt die Achse auf Sohlniveau. Liegt die Achse in Rohrmitte
 * (fremde Autorensysteme), sind die Werte um DN/2 zu hoch — am Realmodell
 * prüfen (dokumentierte Annahme).
 */

/** Endpunkt-Kettung der Haltungen zum längsten Strang. */
export function buildStrang(axisItems, opts = {}) {
    const eps = opts.chainEps ?? 1.5; // m — überbrückt den Schacht zwischen zwei Haltungen
    const items = (axisItems ?? []).filter(it => it.polyline?.length >= 2);
    if (!items.length) return null;

    const start = (i) => items[i].polyline[0];
    const end = (i) => items[i].polyline[items[i].polyline.length - 1];
    const d2 = (p, q2) => Math.hypot(p.x - q2.x, p.z - q2.z);

    const used = new Set();

    /** Nächstes unbenutztes Stück, dessen Endpunkt ≤ eps am Punkt liegt. */
    function findNext(p) {
        let best = null, bestD = eps;
        for (let i = 0; i < items.length; i++) {
            if (used.has(i)) continue;
            const da = d2(p, start(i));
            const db = d2(p, end(i));
            if (da <= bestD) { bestD = da; best = { idx: i, end: 'a' }; }
            if (db <= bestD) { bestD = db; best = { idx: i, end: 'b' }; }
        }
        return best;
    }

    // Ketten bilden: vom Seed in beide Richtungen wachsen
    const chains = [];
    for (let seed = 0; seed < items.length; seed++) {
        if (used.has(seed)) continue;
        used.add(seed);
        const chain = [{ idx: seed, reversed: false }];

        // vorwärts (Kettenende)
        let safety = 0;
        while (safety++ <= items.length) {
            const last = chain[chain.length - 1];
            const head = last.reversed ? start(last.idx) : end(last.idx);
            const next = findNext(head);
            if (!next) break;
            used.add(next.idx);
            // matcht mit 'a' → läuft vorwärts weiter; mit 'b' → umgedreht anhängen
            chain.push({ idx: next.idx, reversed: next.end === 'b' });
        }
        // rückwärts (Kettenanfang)
        safety = 0;
        while (safety++ <= items.length) {
            const first = chain[0];
            const tail = first.reversed ? end(first.idx) : start(first.idx);
            const prev = findNext(tail);
            if (!prev) break;
            used.add(prev.idx);
            // matcht mit 'b' → läuft vorwärts davor; mit 'a' → umgedreht davor
            chain.unshift({ idx: prev.idx, reversed: prev.end === 'a' });
        }
        chains.push(chain);
    }
    if (!chains.length) return null;

    const chainLen = (chain) => chain.reduce((s, c) => s + _len2d(items[c.idx].polyline), 0);
    chains.sort((a, b) => chainLen(b) - chainLen(a));
    let best = chains[0];

    // Fließrichtung: Achshöhe soll fallen — sonst ganzen Strang umdrehen
    const firstItem = items[best[0].idx];
    const lastItem = items[best[best.length - 1].idx];
    const yStart = best[0].reversed ? _lastY(firstItem) : _firstY(firstItem);
    const yEnd = best[best.length - 1].reversed ? _firstY(lastItem) : _lastY(lastItem);
    if (yEnd > yStart + 1e-6) {
        best = best.slice().reverse().map(c => ({ idx: c.idx, reversed: !c.reversed }));
    }

    // Stationierung: Punkte + Haltungs-Abschnitte
    const points = []; // [{s, x, y, z}]
    const pipes = [];  // [{s0, s1, y0, y1, item}]
    let s = 0;
    for (const { idx, reversed } of best) {
        const pl = reversed ? [...items[idx].polyline].reverse() : items[idx].polyline;
        // Lücke (Schacht) zur vorherigen Haltung überbrücken
        if (points.length) {
            const prev = points[points.length - 1];
            s += Math.hypot(pl[0].x - prev.x, pl[0].z - prev.z);
        }
        const s0 = s;
        for (let i = 0; i < pl.length; i++) {
            if (i > 0) s += Math.hypot(pl[i].x - pl[i - 1].x, pl[i].z - pl[i - 1].z);
            points.push({ s, x: pl[i].x, y: pl[i].y ?? 0, z: pl[i].z });
        }
        pipes.push({
            s0, s1: s,
            y0: pl[0].y ?? 0, y1: pl[pl.length - 1].y ?? 0,
            item: items[idx],
        });
    }

    return { points, pipes, length: s };
}

function _len2d(pl) {
    let s = 0;
    for (let i = 0; i + 1 < pl.length; i++) s += Math.hypot(pl[i + 1].x - pl[i].x, pl[i + 1].z - pl[i].z);
    return s;
}
function _firstY(item) { return item.polyline[0].y ?? 0; }
function _lastY(item)  { return item.polyline[item.polyline.length - 1].y ?? 0; }

/** Lage + Richtung an Station s (für Querprofile). */
export function pointAt(strang, s) {
    const pts = strang.points;
    if (!pts.length) return null;
    if (s <= pts[0].s) return _dirAt(pts, 0);
    for (let i = 0; i + 1 < pts.length; i++) {
        if (s <= pts[i + 1].s) {
            const t = (s - pts[i].s) / Math.max(1e-9, pts[i + 1].s - pts[i].s);
            const base = _dirAt(pts, i);
            return {
                x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
                z: pts[i].z + (pts[i + 1].z - pts[i].z) * t,
                dirX: base.dirX, dirZ: base.dirZ,
            };
        }
    }
    return _dirAt(pts, pts.length - 2);
}

function _dirAt(pts, i) {
    const a = pts[Math.max(0, i)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: a.x, z: a.z, dirX: (b.x - a.x) / len, dirZ: (b.z - a.z) / len };
}

/** Sohlhöhe (Achshöhe) an Station s — linear entlang der Strang-Punkte. */
export function sohleAt(strang, s) {
    const pts = strang.points;
    if (!pts.length) return null;
    if (s <= pts[0].s) return pts[0].y;
    for (let i = 0; i + 1 < pts.length; i++) {
        if (s <= pts[i + 1].s) {
            const t = (s - pts[i].s) / Math.max(1e-9, pts[i + 1].s - pts[i].s);
            return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
        }
    }
    return pts[pts.length - 1].y;
}

/** Geländeprofil entlang des Strangs (Sampler aus TerrainMesh). */
export function sampleTerrainProfile(strang, sampler, step = 1) {
    const out = [];
    if (!sampler?.sample) return out;
    for (let s = 0; s <= strang.length + 1e-6; s += step) {
        const p = pointAt(strang, Math.min(s, strang.length));
        if (!p) continue;
        const y = sampler.sample(p.x, p.z);
        if (y != null) out.push({ s: Math.min(s, strang.length), y });
    }
    return out;
}

/**
 * Schächte auf die Stationierung projizieren (nächster Strang-Punkt,
 * Maximalabstand quer zur Achse).
 */
export function projectManholes(strang, manholes, maxDist = 3) {
    const out = [];
    for (const mh of (manholes ?? [])) {
        let bestS = null, bestD = Infinity;
        const pts = strang.points;
        for (let i = 0; i + 1 < pts.length; i++) {
            const ax = pts[i].x, az = pts[i].z;
            const bx = pts[i + 1].x, bz = pts[i + 1].z;
            const dx = bx - ax, dz = bz - az;
            const l2 = dx * dx + dz * dz;
            const t = l2 > 1e-12
                ? Math.max(0, Math.min(1, ((mh.x - ax) * dx + (mh.z - az) * dz) / l2))
                : 0;
            const px = ax + dx * t, pz = az + dz * t;
            const d = Math.hypot(mh.x - px, mh.z - pz);
            if (d < bestD) {
                bestD = d;
                bestS = pts[i].s + Math.sqrt(l2) * t;
            }
        }
        if (bestS != null && bestD <= maxDist) {
            out.push({ ...mh, s: bestS });
        }
    }
    return out.sort((a, b) => a.s - b.s);
}

/**
 * Komplettes Längsschnitt-Datenpaket.
 * @returns {{ strang, terrain, manholes, yMin, yMax } | null}
 */
export function buildLaengsschnitt({ axisItems, manholes = [], sampler = null, step = 1, chainEps = 1.5 } = {}) {
    const strang = buildStrang(axisItems, { chainEps });
    if (!strang) return null;

    const terrain = sampler ? sampleTerrainProfile(strang, sampler, step) : [];
    const projected = projectManholes(strang, manholes);

    let yMin = Infinity, yMax = -Infinity;
    for (const p of strang.points) { yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); }
    for (const t of terrain)       { yMin = Math.min(yMin, t.y); yMax = Math.max(yMax, t.y); }
    for (const m of projected) {
        if (Number.isFinite(m.sohle))  yMin = Math.min(yMin, m.sohle);
        if (Number.isFinite(m.deckel)) yMax = Math.max(yMax, m.deckel);
    }
    if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }

    return { strang, terrain, manholes: projected, yMin, yMax };
}
