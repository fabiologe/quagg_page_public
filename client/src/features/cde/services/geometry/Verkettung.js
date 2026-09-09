/**
 * Segmente zu Ringen und Ketten verknüpfen — rein, ohne three (2026-09-07).
 *
 * Aus SectionContour.js herausgelöst: die Funktionen brauchten three nie,
 * die Datei importierte es aber am Kopf — und weil MeshOps
 * `chainSegmentsToPolygons` von dort holte, lud der Kernel-Worker die ganze
 * Bibliothek mit. Der Import-Wächter prüft den Worker-Graphen seither
 * transitiv (keineFremdimporte.test.js).
 */

/**
 * Stitch a soup of XZ segments into closed rings by matching shared endpoints
 * (5 mm world-space snap to tolerate the small gaps IFC tessellation leaves).
 *
 * @param {{x1, z1, x2, z2}[]} segs
 * @returns {Array<Array<{x, z}>>}  Each inner array is a closed ring.
 */
export function chainSegmentsToPolygons(segs) {
    if (!segs.length) return [];
    const EPS = 0.005;
    const key = (p) => `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`;

    const pool = segs.map(s => ({ used: false, a: { x: s.x1, z: s.z1 }, b: { x: s.x2, z: s.z2 } }));
    const byKey = new Map();
    for (const seg of pool) {
        const ka = key(seg.a), kb = key(seg.b);
        (byKey.get(ka) ?? byKey.set(ka, []).get(ka)).push({ seg, end: 'a' });
        (byKey.get(kb) ?? byKey.set(kb, []).get(kb)).push({ seg, end: 'b' });
    }

    const polys = [];
    for (const start of pool) {
        if (start.used) continue;
        const ring = [start.a, start.b];
        start.used = true;
        let head = start.b;
        let safety = 0;
        while (safety++ < 2000) {
            const next = (byKey.get(key(head)) ?? []).find(c => !c.seg.used && c.seg !== start);
            if (!next) break;
            next.seg.used = true;
            const other = next.end === 'a' ? next.seg.b : next.seg.a;
            ring.push(other);
            head = other;
            if (key(head) === key(ring[0])) break;
        }
        if (ring.length >= 4 && key(head) === key(ring[0])) polys.push(ring);
    }
    return polys;
}

/**
 * Segmente zu POLYLINIEN verketten — im Gegensatz zu chainSegmentsToPolygons
 * bleiben offene Ketten erhalten (Höhenlinien, die am Modellrand auslaufen;
 * Böschungs-Ober-/Unterkanten). Verhalten:
 *   - Ketten starten bevorzugt an Knoten mit Grad 1 (offene Enden)
 *   - an Knoten mit Grad > 2 (T-Stücke) wird gebrochen
 *   - übrig bleibende reine Schleifen (alle Knoten Grad 2) werden als
 *     geschlossene Ketten zurückgegeben (letzter Punkt == erster Punkt)
 *
 * Punkte tragen y mit, wenn die Segmente es liefern ({y1,y2}) — sonst 0.
 *
 * @param {{x1, z1, x2, z2, y1?, y2?}[]} segs
 * @param {number} eps  Snap-Toleranz in Weltmetern
 * @returns {Array<Array<{x, y, z}>>}
 */
export function chainSegmentsToPolylines(segs, eps = 0.005) {
    if (!segs?.length) return [];
    const key = (x, z) => `${Math.round(x / eps)},${Math.round(z / eps)}`;

    const pool = segs.map(s => ({
        used: false,
        a: { x: s.x1, y: s.y1 ?? 0, z: s.z1 },
        b: { x: s.x2, y: s.y2 ?? 0, z: s.z2 },
    }));

    // Endpunkt-Index + Knotengrad
    const byKey = new Map();
    const degree = new Map();
    for (const seg of pool) {
        for (const end of ['a', 'b']) {
            const k = key(seg[end].x, seg[end].z);
            (byKey.get(k) ?? byKey.set(k, []).get(k)).push({ seg, end });
            degree.set(k, (degree.get(k) ?? 0) + 1);
        }
    }

    const chains = [];

    /** Von einem Segment-Ende aus laufen, bis Sackgasse/T-Stück/Schleifenschluss. */
    function walk(startSeg, startEnd) {
        startSeg.used = true;
        const first = startSeg[startEnd];
        let head = startSeg[startEnd === 'a' ? 'b' : 'a'];
        const chain = [first, head];
        let safety = 0;
        while (safety++ < 100000) {
            const k = key(head.x, head.z);
            if (degree.get(k) !== 2) break;                 // offenes Ende oder T-Stück
            const next = (byKey.get(k) ?? []).find(c => !c.seg.used);
            if (!next) break;                               // Schleife geschlossen
            next.seg.used = true;
            head = next.seg[next.end === 'a' ? 'b' : 'a'];
            chain.push(head);
            if (key(head.x, head.z) === key(first.x, first.z)) break; // Ringschluss
        }
        return chain;
    }

    // 1. Pass: an Nicht-Grad-2-Knoten starten (offene Enden + T-Stücke)
    for (const seg of pool) {
        if (seg.used) continue;
        const ka = key(seg.a.x, seg.a.z);
        const kb = key(seg.b.x, seg.b.z);
        if (degree.get(ka) !== 2)      chains.push(walk(seg, 'a'));
        else if (degree.get(kb) !== 2) chains.push(walk(seg, 'b'));
    }
    // 2. Pass: reine Schleifen (alles Grad 2)
    for (const seg of pool) {
        if (!seg.used) chains.push(walk(seg, 'a'));
    }

    return chains.filter(c => c.length >= 2);
}
