/**
 * Fügt die beiden Parser-Ausgaben (.rpt-Summary + .out-Zeitreihe) zu EINEM
 * definierten Ergebnis-Kontrakt zusammen. Einzige Stelle, an der Report- und
 * Binärdaten gemischt und mit der Eingangs-Geometrie angereichert werden —
 * Worker und UI kennen nur noch dieses Objekt:
 *
 *   {
 *     nodes:         { [id]: { ...RptParser-Felder, maxVolumeStored, maxAvailableVolume,
 *                              continuityError, overflow, overflowReason } },
 *     edges:         { [id]: { ...RptParser-Felder } },
 *     subcatchments: { [id]: { ...RptParser-Felder } },
 *     systemStats:   { ...RptParser-Felder },
 *     timeSeries:    [ { time, date, nodes: { [id]: { depth, vol, inflow, flooding, outflow } },
 *                        edges, subcatchments } ],
 *     warnings:      [ string ]
 *   }
 */

// Kontinuitätsfehler ab diesem Betrag (%) gelten als massiv und erzeugen eine Warnung.
export const CONTINUITY_ERROR_WARN_PCT = 10;

export class ResultsAssembler {

    /**
     * @param {object} args
     * @param {object} args.rptResult  - Ausgabe von RptParser.parse(): { nodes, edges, subcatchments, systemStats }
     * @param {Array}  args.timeSeries - Ausgabe von SwmmOutParser.parse() (leer, wenn .out fehlt/kaputt)
     * @param {object} args.inputNodes - id -> serialisierter Eingangs-Knoten (Node.toJSON())
     * @param {object} args.inputEdges - id -> serialisierte Eingangs-Haltung (Edge.toJSON())
     */
    static assemble({ rptResult, timeSeries = [], inputNodes = {}, inputEdges = {} }) {
        const warnings = [];
        const { nodes = {}, edges = {}, subcatchments = {}, systemStats = {} } = rptResult || {};

        this.#computeNodeOutflows(timeSeries, inputEdges);
        this.#mergeMaxStoredVolumes(nodes, timeSeries);
        this.#computeMaxAvailableVolumes(nodes, inputNodes);
        this.#flagRimOverflow(nodes, inputNodes);
        this.#attachContinuityErrors(nodes, systemStats, warnings);

        return { nodes, edges, subcatchments, systemStats, timeSeries, warnings };
    }

    /**
     * Knoten-Abfluss je Zeitschritt aus den vorzeichenbehafteten Haltungsflüssen summieren
     * (die .out-Datei enthält nur Zufluss; Abfluss = Summe der abgehenden Flüsse).
     */
    static #computeNodeOutflows(timeSeries, inputEdges) {
        const edgeList = Object.values(inputEdges);
        for (const step of timeSeries) {
            for (const nodeId in step.nodes) {
                step.nodes[nodeId].outflow = 0;
            }
            for (const edge of edgeList) {
                const resEdge = step.edges[edge.id];
                if (!resEdge || resEdge.signedQ === undefined) continue;
                const flow = resEdge.signedQ;
                const fromId = edge.fromNodeId || edge.from;
                const toId = edge.toNodeId || edge.to;
                if (flow > 0) {
                    if (step.nodes[fromId]) step.nodes[fromId].outflow += flow;
                } else if (flow < 0) {
                    if (step.nodes[toId]) step.nodes[toId].outflow += Math.abs(flow);
                }
            }
        }
    }

    /**
     * Maximal gespeichertes Volumen (m³) je Knoten über alle Zeitschritte —
     * der .rpt liefert das nur für Storage-Knoten, die .out-Datei für alle.
     */
    static #mergeMaxStoredVolumes(nodes, timeSeries) {
        for (const step of timeSeries) {
            for (const nodeId in step.nodes) {
                const vol = step.nodes[nodeId].vol || 0;
                if (!nodes[nodeId]) nodes[nodeId] = {};
                if (vol > (nodes[nodeId].maxVolumeStored || 0)) {
                    nodes[nodeId].maxVolumeStored = vol;
                }
            }
        }
    }

    /**
     * Vmax ("was möglich ist an Volumen"): maximal fassbares Volumen je Knoten
     * aus der Eingangs-Geometrie. Ohne belastbare Geometrie bleibt der Wert null
     * (UI zeigt dann "-"), statt eine Zahl zu erfinden.
     */
    static #computeMaxAvailableVolumes(nodes, inputNodes) {
        for (const id of Object.keys(nodes)) {
            const input = inputNodes[id];
            if (!input) {
                nodes[id].maxAvailableVolume = null;
                continue;
            }
            nodes[id].maxAvailableVolume = this.maxAvailableVolume(input);
        }
    }

    /**
     * @param {object} node - serialisierter Knoten (volume, diameter, depth, z, coverZ)
     * @returns {number|null} Vmax in m³, oder null wenn die Geometrie es nicht hergibt
     */
    static maxAvailableVolume(node) {
        // Explizites Bauwerksvolumen (Becken etc.) hat Vorrang.
        const volume = Number(node.volume) || 0;
        if (volume > 0) return volume;

        const depth = this.#effectiveDepth(node);
        if (depth <= 0) return null;

        let diameter = Number(node.diameter) || 0;
        // ISYBAU liefert Schachtabmessungen teils in mm — Werte > 10 sind kein plausibler
        // Durchmesser in Metern.
        if (diameter > 10) diameter = diameter / 1000;
        if (diameter <= 0) return null;

        return Math.PI * Math.pow(diameter / 2, 2) * depth;
    }

    static #effectiveDepth(node) {
        const depth = Number(node.depth) || 0;
        if (depth > 0) return depth;
        const z = Number(node.z);
        const coverZ = Number(node.coverZ);
        if (Number.isFinite(z) && Number.isFinite(coverZ) && coverZ > z) return coverZ - z;
        return 0;
    }

    /** Überstau-Kennzeichnung: max. Wasserspiegel (HGL) über Deckelhöhe. */
    static #flagRimOverflow(nodes, inputNodes) {
        for (const id of Object.keys(nodes)) {
            const input = inputNodes[id];
            if (!input || nodes[id].maxHGL === undefined) continue;
            const rim = input.coverZ !== undefined && input.coverZ !== null
                ? Number(input.coverZ)
                : (Number(input.z) + Number(input.depth || 3));
            if (nodes[id].maxHGL > (rim + 0.01)) {
                nodes[id].overflow = true;
                nodes[id].overflowReason = 'HGL > Rim';
            }
        }
    }

    /**
     * Kontinuitätsfehler aus dem Report an die Knoten heften und massive Fehler
     * als Warnung durchreichen (bugs.txt #4: bislang komplett unsichtbar).
     */
    static #attachContinuityErrors(nodes, systemStats, warnings) {
        for (const entry of systemStats.continuityErrors || []) {
            if (!nodes[entry.id]) nodes[entry.id] = {};
            nodes[entry.id].continuityError = entry.error;
            if (Math.abs(entry.error) >= CONTINUITY_ERROR_WARN_PCT) {
                warnings.push(
                    `Knoten ${entry.id}: massiver Kontinuitätsfehler (${entry.error.toFixed(1)} %) — Ergebnisse an diesem Knoten sind unzuverlässig.`
                );
            }
        }
        const sysErr = systemStats.flow?.error;
        if (typeof sysErr === 'number' && Math.abs(sysErr) >= CONTINUITY_ERROR_WARN_PCT) {
            warnings.push(
                `Systemweiter Kontinuitätsfehler der Abflussberechnung: ${sysErr.toFixed(1)} % — Modell prüfen (Zeitschritt, Instabilitäten).`
            );
        }
    }
}
