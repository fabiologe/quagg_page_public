// Kopplungs-Export für den High-End-Solver: erzeugt aus einem Kanalnetz die beiden
// Dateien, die der LISFLOOD-Kopplungs-Hook (quagg-coupling.patch) im Container liest:
//   - network.inp    (EPA-SWMM 1D-Netz, coupled-Modus ohne Subcatchments/Regen)
//   - flow.coupling   (Schacht<->2D-Zelle-Map + Kopplungsparameter)
//
// Siehe backend/app/api/flood2D/engines/docker/coupling.cpp (flow.coupling-Format) und
// engines/patches/README.md (quagg-coupling.patch).

import { SwmmBuilder } from './SwmmBuilder.js';
import { detectCouplingNodes } from '../geometry/couplingDetector.js';

const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

/**
 * Baut den flow.coupling-Inhalt.
 *   Zeile 1:  <inp> <dt_c[s]> <n>
 *   n Zeilen: <swmm-node-id> <x> <y> <rim[mNN]> <Cw> <Amax>
 *
 * @param {Array<{id,x,y,rim,Cw?,Amax?}>} couplingNodes  Kopplungsschächte (Weltkoordinaten)
 * @param {object} opts  { inp='network.inp', dtCouple=2.0, defaultCw=1.0, defaultAmax=0 }
 */
export function buildCouplingFile(couplingNodes, opts = {}) {
    const { inp = 'network.inp', dtCouple = 2.0, defaultCw = 1.0, defaultAmax = 0 } = opts;
    const rows = (couplingNodes || []).map(n =>
        `${n.id} ${num(n.x)} ${num(n.y)} ${num(n.rim)} `
        + `${num(n.Cw, defaultCw)} ${num(n.Amax, defaultAmax)}`
    );
    return `${inp} ${num(dtCouple, 2.0)} ${rows.length}\n${rows.join('\n')}\n`;
}

/**
 * Wählt aus einem Kanalnetz die Kopplungsschächte: Übergabestellen (Einlauf/Auslauf/
 * Outfall) sowie alle Knoten mit explizitem coupling-Flag. Jeder Knoten liefert
 * {id,x,y,rim=coverZ}. `rim` = Deckelhöhe (Überstauschwelle).
 *
 * @param {Array} nodes  Sewer-Knoten (mit x,y,coverZ|rim, type/kind, coupling?)
 */
export function selectCouplingNodes(nodes, opts = {}) {
    const { Cw = 1.0, Amax = 0 } = opts;
    const isCoupling = (n) => {
        if (n.coupling === true) return true;
        const k = (n.kind || n.type || '').toString().toLowerCase();
        return k.includes('inlet') || k.includes('outlet') || k.includes('outfall')
            || k.includes('einlauf') || k.includes('auslauf');
    };
    return (nodes || [])
        .filter(isCoupling)
        .map(n => ({
            id: n.id,
            x: num(n.x), y: num(n.y),
            rim: num(n.rim ?? n.coverZ ?? n.z),
            Cw: n.Cw ?? Cw,
            Amax: n.Amax ?? Amax,
        }));
}

/**
 * Erzeugt die kompletten Kopplungs-Inputs (network.inp + flow.coupling) aus einem
 * Sewer-Store + der Auswahl der Kopplungsschächte.
 *
 * @param {object} sewerStore  store-artiges Objekt für SwmmBuilder (getAllNodes/getAllEdges/areas)
 * @param {Array}  couplingNodes  aus selectCouplingNodes(...)
 * @param {object} opts  { inp, dtCouple, swmm: {durationHours,startDate,...} }
 * @returns {{files: Record<string,string>, warnings: string[]}}
 */
export function buildCoupledInputs(sewerStore, couplingNodes, opts = {}) {
    const { inp = 'network.inp', dtCouple = 2.0, swmm = {} } = opts;
    const builder = new SwmmBuilder(sewerStore).setOptions({ ...swmm, coupled: true });
    const { inpContent, warnings } = builder.build();
    const coupling = buildCouplingFile(couplingNodes, { inp, dtCouple });
    return {
        files: { [inp]: inpContent, 'flow.coupling': coupling },
        warnings,
    };
}

/**
 * Wie buildCoupledInputs, aber Kopplungsschächte werden GEOMETRISCH aus dem DEM erkannt
 * (Senken über Knoten, Rücken-Warnungen) statt heuristisch. Das ist der Unified-Engine-Pfad.
 *
 * @param {import('../geometry/NetworkModel.js').NetworkModel} model
 * @param {{grid, header}} dem   DEM-Raster (row-major top-down; entspricht terrain.asc)
 * @param {object} opts  { inp, dtCouple, snapRadius, swmm }
 */
export function buildCoupledInputsFromModel(model, dem, opts = {}) {
    const { couplingNodes, warnings: detWarnings, diagnostics } = detectCouplingNodes(model, dem, opts);
    const res = buildCoupledInputs(model.toSwmmStore(), couplingNodes, opts);
    return {
        ...res,
        warnings: [...res.warnings, ...detWarnings],
        couplingNodes,
        diagnostics,
    };
}
