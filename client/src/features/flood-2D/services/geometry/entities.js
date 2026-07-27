// Unified Geometry Engine — Entity-Model (G0).
// Eine format-/solver-agnostische Zwischenschicht: jedes Entwässerungselement ist eine
// Entity mit Geometrie + hydraulischer Rolle. 1D/2D ist nur eine Compiler-Frage.
// Siehe result/PLAN_GEOMETRY_ENGINE_1D2D_2026-07-07.md.

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// Rollen, die als 1D-Netzknoten zählen (koppelbar / SWMM-relevant).
export const NODE_ROLES = new Set([
    'manhole', 'inlet', 'outfall', 'junction', 'weir', 'orifice', 'pump', 'storage',
]);
// Rollen, an denen 2D↔1D-Austausch stattfindet (Übergabestellen).
export const COUPLING_ROLES = new Set(['manhole', 'inlet', 'outfall', 'storage']);

/**
 * Node = 3D-Punkt mit Deckel (rim) und Sohle (invert).
 * @returns {object} normalisierte Node-Entity
 */
export function makeNode({ id, x, y, rim, invert, role = 'manhole', attrs = {} } = {}) {
    if (id == null) throw new Error('makeNode: id fehlt');
    const bottomZ = num(invert, num(attrs.bottomZ ?? attrs.z, 0));
    const coverZ  = rim != null ? num(rim) : num(attrs.coverZ, bottomZ);
    return {
        kind: 'node',
        id: String(id),
        role,
        geom: { x: num(x), y: num(y), rim: coverZ, invert: bottomZ },
        conveyance: null,
        attrs: { ...attrs },
        refs: {},
    };
}

/**
 * Link = 3D-Polylinie mit Querschnitt. `conveyance` entscheidet das Kompilat:
 *   'covered' → SWMM-Conduit (1D-Rohr) · 'open' → offenes Gerinne (SGC/2D-nah).
 */
export function makeLink({ id, points = null, fromNodeId, toNodeId, role = 'conduit',
                           conveyance = 'covered', profile = {}, length = null, attrs = {} } = {}) {
    if (id == null) throw new Error('makeLink: id fehlt');
    return {
        kind: 'link',
        id: String(id),
        role,
        conveyance,
        geom: {
            points: Array.isArray(points) ? points.map(p => ({ x: num(p.x), y: num(p.y), z: num(p.z) })) : null,
            profile: {
                shape:  profile.shape ?? profile.type ?? 'circular',
                height: num(profile.height ?? profile.h, 0),
                width:  num(profile.width ?? profile.w, 0),
                // bedWidth/sideSlope: nur für offene Trapez-/Rechteckquerschnitte relevant
                // (SGC-Export, s. services/geometry/networkToSgc.js) — undefined statt 0/default,
                // wenn die Quelle sie nicht liefert (Default gehört an die Compiler-Grenze).
                ...(profile.bedWidth !== undefined ? { bedWidth: num(profile.bedWidth) } : {}),
                ...(profile.sideSlope !== undefined ? { sideSlope: num(profile.sideSlope) } : {}),
            },
            length: length != null ? num(length) : null,
        },
        attrs: { ...attrs },
        refs: { fromNodeId: fromNodeId != null ? String(fromNodeId) : null,
                toNodeId:   toNodeId   != null ? String(toNodeId)   : null },
    };
}

export function isNode(e) { return e && e.kind === 'node'; }
export function isLink(e) { return e && e.kind === 'link'; }
