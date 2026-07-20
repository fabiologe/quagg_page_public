/**
 * sectionNetwork.js — findet Kanalnetz-Elemente (Haltungen/Schächte aus useNetworkStore),
 * die eine Querschnitts-Linie kreuzen, und projiziert sie auf die Schnitt-Distanz.
 * Gegenstück zu sectionStructures.js (Wehre/Brücken) — pure Geometrie, node-testbar.
 *
 * Eingabe in REAL-Welt-Koordinaten (gleiche Basis wie der Schnitt).
 * Haltungen: 2D-Segment-Schnitt Schnittlinie × Rohr-Polylinie, Sohlhöhe am
 * Durchstoßpunkt linear interpoliert (points[].z bzw. attrs.z1/z2 → node.invert).
 * Schächte: Projektion wie bei Wehren (senkrechter Abstand ≤ Toleranz).
 *
 * Rückgabe je Kreuzung, nach Distanz sortiert:
 *   pipe:    { kind:'pipe',    id, distance, invert, diameter, conveyance }
 *   manhole: { kind:'manhole', id, distance, invert, rim, diameter, role }
 */

// Profilhöhe defensiv normalisieren (wie useNetworkRenderer.linkRadius):
// ISYBAU liefert teils mm (DN600 = 600) — kein Rohr ist > 10 m hoch.
export function normalizeDiameter(h) {
    let d = Number(h);
    if (!Number.isFinite(d) || d <= 0) d = 0.3;
    if (d > 10) d = d / 1000;
    return Math.min(Math.max(d, 0.05), 5);
}

/** Rohrsohle am Link-Ende: attrs.z1/z2 (absolute Haltungssohle) gewinnt vor node.invert. */
const linkEndZ = (l, node, key) => {
    const z = Number(l.attrs?.[key]);
    return Number.isFinite(z) ? z : (node?.invert ?? 0);
};

/** Polylinie der Haltung in Weltkoordinaten mit z (Renderer-Regeln). */
function linkPolyline(l, nodeById) {
    if (Array.isArray(l.points) && l.points.length >= 2) {
        const clean = l.points.filter(p =>
            Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
        if (clean.length >= 2) return clean;
    }
    const from = nodeById.get(l.fromNodeId);
    const to = nodeById.get(l.toNodeId);
    if (!from || !to) return null;
    return [
        { x: from.x, y: from.y, z: linkEndZ(l, from, 'z1') },
        { x: to.x, y: to.y, z: linkEndZ(l, to, 'z2') },
    ];
}

/**
 * @param {number} ax,ay,bx,by  Schnittlinie A→B (Welt)
 * @param {Array} nodes  useNetworkStore.nodes ([{id,x,y,rim,invert,role,attrs}])
 * @param {Array} links  useNetworkStore.links ([{id,fromNodeId,toNodeId,points,profile,attrs}])
 * @param {object} [opts]  { nodeTol: senkrechte Schacht-Toleranz in m (Default 1.5) }
 */
export function findSectionNetworkCrossings(ax, ay, bx, by, nodes = [], links = [], opts = {}) {
    const out = [];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return out;
    const len = Math.sqrt(len2);

    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // ── Haltungen: Segment-Segment-Schnitt je Polylinien-Segment ────────────────
    for (const l of links) {
        const pts = linkPolyline(l, nodeById);
        if (!pts) continue;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const ex = p1.x - p0.x, ey = p1.y - p0.y;
            const denom = dx * ey - dy * ex;
            if (Math.abs(denom) < 1e-9) continue;             // parallel/degeneriert
            const rx = p0.x - ax, ry = p0.y - ay;
            const t = (rx * ey - ry * ex) / denom;            // Anteil auf dem Schnitt
            const u = (rx * dy - ry * dx) / denom;            // Anteil auf dem Rohr-Segment
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            out.push({
                kind: 'pipe',
                id: l.id,
                distance: t * len,
                invert: p0.z + u * (p1.z - p0.z),
                diameter: normalizeDiameter(l.profile?.height),
                conveyance: l.conveyance ?? 'covered',
            });
        }
    }

    // ── Schächte: senkrechte Projektion auf den Schnitt (wie Wehr-Zellen) ────────
    const nodeTol = opts.nodeTol ?? 1.5;
    for (const n of nodes) {
        if (!Number.isFinite(n?.x) || !Number.isFinite(n?.y)) continue;
        const t = ((n.x - ax) * dx + (n.y - ay) * dy) / len2;
        if (t < 0 || t > 1) continue;
        const cx = ax + t * dx, cy = ay + t * dy;
        const dia = Math.max(Number(n.attrs?.diameter) || 1.0, 0.4);
        if (Math.hypot(n.x - cx, n.y - cy) > Math.max(nodeTol, dia / 2)) continue;
        out.push({
            kind: 'manhole',
            id: n.id,
            distance: t * len,
            invert: n.invert,
            rim: n.rim,
            diameter: dia,
            role: n.role ?? 'manhole',
        });
    }

    out.sort((a, b) => a.distance - b.distance);
    return out;
}
