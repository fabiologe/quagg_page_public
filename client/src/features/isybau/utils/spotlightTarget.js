/**
 * Zielauflösung für den Tutorial-"SmartZoomer".
 *
 * Liefert zu einer Element-Referenz ({type, id}) den Mittelpunkt und einen
 * umschließenden Radius in WELT-Koordinaten. Der Viewer rechnet daraus Zoom
 * und Ringgröße — diese Datei bleibt bewusst frei von SVG/Vue, damit die
 * Geometrie ohne gemountete Komponente testbar ist.
 *
 * Der bestehende `focusTarget`-Mechanismus (store.editor.focusTargetId) taugte
 * dafür nicht: er kennt nur Knoten, springt hart, erzwingt eine Auswahl (was
 * das ElementInfo-Panel öffnet und mit der Tutorial-Sprechblase kollidiert)
 * und löscht sich nach 500 ms selbst. Der Spotlight muss dagegen so lange
 * stehen bleiben, wie die Ratte über das Element spricht.
 */

const finite = (v) => Number.isFinite(v);

const getFrom = (collection, id) => {
    if (!collection) return null;
    if (collection instanceof Map) return collection.get(id) ?? null;
    if (Array.isArray(collection)) return collection.find(e => e?.id === id) ?? null;
    return collection[id] ?? null;
};

/** Mittelpunkt + umschließender Radius einer Punktliste. */
function fromPoints(points) {
    const pts = (points || []).filter(p => p && finite(p.x) && finite(p.y));
    if (!pts.length) return null;
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const radius = pts.reduce(
        (m, p) => Math.max(m, Math.hypot(p.x - x, p.y - y)), 0);
    return { x, y, radius };
}

/** Stützpunkte einer Haltung: eigene Polylinie, sonst die beiden Endknoten. */
function edgePoints(edge, nodes) {
    if (Array.isArray(edge.coords) && edge.coords.length >= 2) return edge.coords;
    const a = getFrom(nodes, edge.fromNodeId ?? edge.from);
    const b = getFrom(nodes, edge.toNodeId ?? edge.to);
    return [a, b].filter(Boolean);
}

/**
 * @param {{type:'node'|'edge'|'area', id:string}|null} ref
 * @param {{nodes?:Map|Array, edges?:Map|Array, areas?:Map|Array}} collections
 * @param {{minRadius?:number}} [opts] minRadius verhindert einen 0-Radius bei
 *        Punktobjekten (Knoten), damit der Ring sichtbar bleibt.
 * @returns {{x:number, y:number, radius:number}|null}
 */
export function resolveSpotlightTarget(ref, collections = {}, { minRadius = 1.5 } = {}) {
    if (!ref || !ref.type) return null;
    const { nodes, edges, areas } = collections;

    // Freie Punktliste: ein Ziel, das im Modell noch gar nicht existiert.
    // Gebraucht fürs Tutorial — die Kamera muss dorthin fahren, WO der Nutzer
    // gleich zeichnen soll, und dort steht per Definition noch nichts.
    if (ref.type === 'points') {
        const base = fromPoints(ref.points);
        return base ? { ...base, radius: Math.max(base.radius, minRadius) } : null;
    }

    if (!ref.id) return null;

    let base = null;
    if (ref.type === 'node') {
        const n = getFrom(nodes, ref.id);
        if (n && finite(n.x) && finite(n.y)) {
            // Schachtdurchmesser als Anhalt, sonst Mindestradius.
            const r = finite(n.diameter) && n.diameter > 0 ? n.diameter / 2 : 0;
            base = { x: n.x, y: n.y, radius: r };
        }
    } else if (ref.type === 'edge') {
        const e = getFrom(edges, ref.id);
        if (e) base = fromPoints(edgePoints(e, nodes));
    } else if (ref.type === 'area') {
        const a = getFrom(areas, ref.id);
        if (a) base = fromPoints(a.points);
    }

    if (!base) return null;
    return { x: base.x, y: base.y, radius: Math.max(base.radius, minRadius) };
}

/**
 * Pan-Werte, die einen Weltpunkt exakt in die Mitte der Karte rücken.
 *
 * Der Viewer rendert mit
 *   translate(cx+tx, cy+ty) scale(s) translate(-cx, -cy)
 * Ein lokaler Punkt b landet damit bei  (cx + tx) + s·(b − cx).
 * Soll er auf cx (= viewBox-Mitte, denn centerX = width/2) liegen, folgt
 *   tx = s · (cx − b)
 *
 * Genau dieser Faktor `s` fehlte in der bisherigen focusTarget-Logik: sie
 * setzte tx = (cx − b) und lag deshalb bei jedem Zoom ≠ 1 daneben — bei dem
 * dort fest verdrahteten Zoom 25 um das 24-fache. Das ist der Grund, warum
 * "zum Element springen" nirgends richtig funktionierte.
 *
 * @param {{x:number,y:number}} worldPoint
 * @param {{minX:number,maxY:number,centerX:number,centerY:number}} bounds
 * @param {number} scale
 * @returns {{translateX:number, translateY:number}}
 */
export function centerTransform(worldPoint, bounds, scale) {
    const bx = worldPoint.x - bounds.minX;      // Welt -> lokale SVG-Koordinaten
    const by = bounds.maxY - worldPoint.y;      // (Y ist im SVG invertiert)
    return {
        translateX: scale * (bounds.centerX - bx),
        translateY: scale * (bounds.centerY - by),
    };
}

/**
 * Maßstab, bei dem das Ziel bildschirmfüllend, aber nicht randlos ist.
 *
 * @param {number} radius     umschließender Radius in Weltmetern
 * @param {number} viewSpan   sichtbare Breite/Höhe der Karte in Weltmetern bei scale=1
 * @param {number} [fill]     gewünschter Anteil des Sichtfelds (0..1)
 */
export function scaleForRadius(radius, viewSpan, { fill = 0.35, min = 0.2, max = 60 } = {}) {
    if (!finite(radius) || radius <= 0 || !finite(viewSpan) || viewSpan <= 0) return null;
    const scale = (viewSpan * fill) / radius;
    return Math.min(max, Math.max(min, scale));
}
