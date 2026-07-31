/**
 * Ermittelt, welche Flächen (Areas) über das Kanalnetz zu welcher Ausleitung
 * (Outfall) entwässern — für die "Ausleitungen"-Tabelle im PDF-Bericht
 * (SimulationReportExport.vue): angeschlossene Fläche (Summe), mittlerer
 * Abflussbeiwert, befestigte Fläche je Outfall.
 *
 * Netz-Tracing ist bewusst vereinfacht: folgt ab dem Anschlussknoten einer
 * Fläche der jeweils ERSTEN ausgehenden Haltung, bis ein als Outfall
 * klassifizierter Knoten erreicht wird (classifyPreview() — dieselbe
 * Klassifikation wie SwmmBuilder.js, Single Source of Truth). Bildet KEINE
 * echte hydraulische Fluss-Aufteilung an Dividern ab (dafür bräuchte es den
 * SWMM-Solver selbst) — für eine statische "gehört ungefähr zu diesem
 * Outfall"-Zuordnung im Bericht ausreichend.
 *
 * Fallback-Outfall: mirrort SwmmBuilder.js classifyAndAddNodes() — wenn KEIN
 * Knoten explizit als Outfall klassifiziert ist, gilt (wie beim echten SWMM-
 * Export) der tiefste Knoten als impliziter Auslauf, sonst würde die Tabelle
 * bei solchen Netzen leer bleiben, obwohl die Simulation selbst genau diesen
 * Fallback nutzt.
 */
import { classifyPreview } from './mappings.js';

function toArray(collection) {
    if (!collection) return [];
    if (collection instanceof Map) return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    return Object.values(collection);
}

function toMap(collection, keyOf = (x) => x.id) {
    if (collection instanceof Map) return collection;
    const map = new Map();
    for (const item of toArray(collection)) map.set(keyOf(item), item);
    return map;
}

function resolveOutfallIds(nodesArr) {
    const explicit = nodesArr.filter((n) => classifyPreview(n).section === '[OUTFALLS]').map((n) => n.id);
    if (explicit.length > 0) return new Set(explicit);

    // Fallback wie SwmmBuilder.js: tiefster Knoten gilt als impliziter Auslauf.
    const junctions = nodesArr.filter((n) => classifyPreview(n).section !== '[STORAGE]');
    if (junctions.length === 0) return new Set();
    const lowest = junctions.reduce((a, b) => ((b.z ?? Infinity) < (a.z ?? Infinity) ? b : a));
    return new Set([lowest.id]);
}

/**
 * @param {Map|Array} areas
 * @param {Map|Array} nodes
 * @param {Map|Array} edges
 * @returns {Array<{outfallId:string, totalAreaHa:number, avgRunoffCoeff:number, impervAreaHa:number}>}
 *   Sortiert nach outfallId. impervAreaHa = Summe(size * runoffCoeff) — dieselbe
 *   Näherung "Abflussbeiwert ≈ befestigter Anteil", die SwmmBuilder.js für den
 *   %Imperv-Export nutzt (imperv = runoffCoeff * 100).
 */
export function summarizeOutfallCatchments(areas, nodes, edges) {
    const nodesArr = toArray(nodes);
    const edgesArr = toArray(edges);
    const areasArr = toArray(areas);
    const edgeMap = toMap(edges);

    const outfallIds = resolveOutfallIds(nodesArr);
    if (outfallIds.size === 0) return [];

    const outgoingByNode = new Map();
    for (const edge of edgesArr) {
        const from = edge.fromNodeId ?? edge.from;
        const list = outgoingByNode.get(from) || [];
        list.push(edge);
        outgoingByNode.set(from, list);
    }

    const traceToOutfall = (startNodeId) => {
        const visited = new Set();
        let current = startNodeId;
        while (current && !visited.has(current)) {
            if (outfallIds.has(current)) return current;
            visited.add(current);
            const outs = outgoingByNode.get(current);
            if (!outs || outs.length === 0) return null; // Sackgasse, kein Outfall erreicht
            current = outs[0].toNodeId ?? outs[0].to;
        }
        return null; // Zyklus oder kein Outfall erreicht
    };

    const byOutfall = new Map();
    const addContribution = (outfallId, sizeHa, runoffCoeff) => {
        let agg = byOutfall.get(outfallId);
        if (!agg) {
            agg = { outfallId, totalAreaHa: 0, weightedCoeffSum: 0, impervAreaHa: 0 };
            byOutfall.set(outfallId, agg);
        }
        const coeff = runoffCoeff ?? 0;
        agg.totalAreaHa += sizeHa;
        agg.weightedCoeffSum += sizeHa * coeff;
        agg.impervAreaHa += sizeHa * coeff;
    };

    for (const area of areasArr) {
        const sizeHa = area.size || 0;
        if (sizeHa <= 0) continue;

        // Anschluss-Punkt(e) + Anteil bestimmen — analog zu addSubcatchments()
        // in SwmmBuilder.js (Split-Fläche über nodeId/nodeId2/splitRatio).
        const parts = [];
        if (area.nodeId2) {
            const ratio = (area.splitRatio ?? 50) / 100;
            if (area.nodeId) parts.push({ nodeId: area.nodeId, fraction: ratio });
            parts.push({ nodeId: area.nodeId2, fraction: 1 - ratio });
        } else if (area.nodeId) {
            parts.push({ nodeId: area.nodeId, fraction: 1 });
        } else if (area.edgeId) {
            // An Haltung angeschlossen -> Fluss tritt am unterstromigen Ende ein.
            const edge = edgeMap.get(area.edgeId);
            const toNode = edge?.toNodeId ?? edge?.to;
            if (toNode) parts.push({ nodeId: toNode, fraction: 1 });
        }

        for (const part of parts) {
            const outfallId = traceToOutfall(part.nodeId);
            if (!outfallId) continue;
            addContribution(outfallId, sizeHa * part.fraction, area.runoffCoeff);
        }
    }

    return Array.from(byOutfall.values())
        .map((agg) => ({
            outfallId: agg.outfallId,
            totalAreaHa: agg.totalAreaHa,
            avgRunoffCoeff: agg.totalAreaHa > 0 ? agg.weightedCoeffSum / agg.totalAreaHa : 0,
            impervAreaHa: agg.impervAreaHa,
        }))
        .sort((a, b) => a.outfallId.localeCompare(b.outfallId));
}
