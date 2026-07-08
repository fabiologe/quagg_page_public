// Kompiliert ein NetworkModel → activeCulverts (Shape des BMI-Workers simulation.bmi.js).
// Der lokale BMI-Pfad (Torricelli) ist das zweite Kompilat neben SWMM (couplingExport) —
// „eine Geometrie, mehrere Kompilate". `solverMode` wählt im Runner das Ziel.
//
// Nur geschlossene Leitungen (conveyance != 'open'); offene Gerinne gehören ins 2D/SGC.

const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// ISYBAU-Profilhöhen kommen oft in mm (z. B. 600 = DN600). Defensive mm→m-Kappung
// (kein Rohr ist > 10 m). Mirrort isyifc.normalizePipeDim.
const toMeters = (v) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return 0; return n > 10 ? n / 1000 : n; };

/**
 * @param {import('./NetworkModel.js').NetworkModel} model
 * @returns {Array<{inX,inY,outX,outY,z_in,z_out,diameter,length,manning_n,Cd}>}
 */
export function networkToBmiCulverts(model) {
    if (!model) return [];
    const nodeById = new Map(model.nodeList.map(n => [n.id, n]));
    const out = [];
    for (const l of model.linkList) {
        if (l.conveyance === 'open') continue;
        const a = nodeById.get(l.refs.fromNodeId);
        const b = nodeById.get(l.refs.toNodeId);
        if (!a || !b) continue;
        const dist = Math.hypot(b.geom.x - a.geom.x, b.geom.y - a.geom.y);
        const kSt = Number(l.attrs?.kSt);
        out.push({
            inX: a.geom.x, inY: a.geom.y, outX: b.geom.x, outY: b.geom.y,
            // BMI-Worker leitet z aus dem DGM ab, wenn null.
            z_in:  Number.isFinite(Number(l.attrs?.z1)) ? Number(l.attrs.z1) : (a.geom.invert ?? null),
            z_out: Number.isFinite(Number(l.attrs?.z2)) ? Number(l.attrs.z2) : (b.geom.invert ?? null),
            diameter: toMeters(l.geom.profile?.height) || 1.0,
            length: (l.geom.length && l.geom.length > 0) ? l.geom.length : (dist || 10),
            manning_n: Number.isFinite(kSt) && kSt > 0 ? 1 / kSt : numOr(l.attrs?.manning_n, 0.013),
            Cd: numOr(l.attrs?.Cd, 0.6),
        });
    }
    return out;
}
