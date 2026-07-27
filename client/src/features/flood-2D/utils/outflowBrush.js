/**
 * outflowBrush.js — reine Logik für das Ablauf-Werkzeug (useOutflowPickerTool.js): baut
 * aus einer Menge angemalter Randzellen direkt das Boundary-Feature — der Nutzer malt exakt
 * die Zellen, die er will, alle bereits garantiert gültige Rand-/Front-Zellen (der Picker lässt
 * nur Zellen innerhalb der von collectPerimeterCells gelieferten Menge einrasten). Kein three.js, kein Vue.
 */
import { collectLiteralEdgeCells } from './terrainFront.js';
import { cellToWorld } from './weirGeometry.js';

/**
 * Teilt die angemalten Zellen in die für FREE gültige Teilmenge (literale Rechteck-Kante)
 * auf — FREE braucht laut Solver-Grammatik zwingend eine native N/S/E/W-Zeile, während
 * HFIX/HVAR/QVAR auch Front-Innenzellen als Punktquelle nutzen können (s. InputGenerator.js).
 * @param {Array<{col:number,row:number}>} paintedCells
 * @param {Float32Array|Array} gridData
 * @param {object} header
 * @param {Set<string>} [literalEdgeSet] bereits berechnete collectLiteralEdgeCells()
 * @returns {{literalEdgeArc: Array<{col:number,row:number}>}}
 */
export function classifyPaintedCells(paintedCells, gridData, header, literalEdgeSet = null) {
    const edgeSet = literalEdgeSet || collectLiteralEdgeCells(gridData, header);
    const literalEdgeArc = (paintedCells || []).filter(c => edgeSet.has(`${c.col},${c.row}`));
    return { literalEdgeArc };
}

/**
 * Baut das Boundary-GeoJSON-Feature direkt aus den angemalten Zellen. `perimeterCells` (alle
 * angemalten Zellen) und `literalEdgeArc` (nur die literale Kanten-Teilmenge) haben exakt die
 * Form, die InputGenerator.js generateBoundaryFiles bereits konsumiert (keine Änderung an der
 * Export-Pipeline nötig) — nur die Herkunft ist neu: direkt vom Nutzer gemalt statt projiziert.
 * @param {Array<{col:number,row:number}>} paintedCells  in Mal-Reihenfolge
 * @param {object} header
 * @param {Float32Array|Array} gridData
 * @param {{id?:string, literalEdgeSet?:Set<string>}} [options]
 * @returns {object|null} GeoJSON Feature, oder null bei leerer Auswahl
 */
export function buildOutflowBrushFeature(paintedCells, header, gridData, options = {}) {
    if (!paintedCells || paintedCells.length === 0) return null;

    const { literalEdgeArc } = classifyPaintedCells(paintedCells, gridData, header, options.literalEdgeSet);
    const coordinates = paintedCells.map(c => {
        const w = cellToWorld(header, c.col, c.row);
        return [w.x, w.y];
    });
    const n = paintedCells.length;
    // KEIN statischer "kein Frei möglich"-Zusatz mehr: seit dem Front-FREE-Projektions-Fix
    // (InputGenerator.js, useOutflowPickerTool.js) ist "Frei" auch ohne literalEdgeArc meist
    // möglich (Projektion auf die nächste echte Kante) — ein einmalig hier eingefrorener
    // Text würde das nie nachträglich korrigieren. BoundaryConfig.vue/AssignmentModal.vue
    // berechnen die tatsächliche Eignung ohnehin live aus outflowEligibility, das ist die
    // einzige Quelle der Wahrheit dafür — nicht dieser Name.
    const name = `Ablauf (${n} Zelle${n === 1 ? '' : 'n'})`;

    return {
        type: 'Feature',
        id: options.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `brush-${Date.now()}`),
        properties: {
            type: 'BOUNDARY',
            boundary_type: 'OUTFLOW',
            name,
            edge: null, // Picker-Auswahl ist nie ein einzelnes deklariertes Kanten-Segment
            nearFront: true, // jede gewählte Zelle ist per Konstruktion eine reale Rand-/Front-Zelle
            perimeterCells: paintedCells.map(c => ({ col: c.col, row: c.row })),
            literalEdgeArc: literalEdgeArc.length ? literalEdgeArc.map(c => ({ col: c.col, row: c.row })) : null,
        },
        geometry: { type: 'LineString', coordinates },
    };
}
