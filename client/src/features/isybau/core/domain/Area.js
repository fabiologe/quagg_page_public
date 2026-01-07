/**
 * Domain Model for an Area (Fläche) in the sewer network.
 * Represents surface areas contributing to runoff.
 */
import { getRunoffCoeff, getMapping } from '../../utils/mappings.js';

export class Area {
    constructor({
        id,
        points = [],
        type = 0,
        property = 0,
        function: func = 0,
        usage = 0,
        pollution = 0,
        slope = 0,
        size = 0,
        runoffCoeff = null,
        edgeId = null,
        nodeId = null,
        nodeId2 = null,
        splitRatio = 50
    }) {
        this.id = id;
        this.points = points; // Array of {x, y}

        // Classification attributes (Integers mapping to Enums)
        this.type = type;
        this.property = property;
        this.function = func;
        this.usage = usage;
        this.pollution = pollution;
        this.slope = slope;

        // Metrics
        this.size = Number(size); // in hectares (ha)

        // Hydrology
        // If runoffCoeff is explicit, use it. Else calculate default.
        if (runoffCoeff !== null && runoffCoeff !== undefined && !isNaN(runoffCoeff)) {
            this.runoffCoeff = Number(runoffCoeff);
        } else {
            this.runoffCoeff = getRunoffCoeff(this.property, this.function, this.slope);
        }

        // Connection
        // Can be connected to an Edge (legacy) or directly to Node(s)
        this.edgeId = edgeId;

        // Split connection (SwmmBuilder compatibility)
        this.nodeId = nodeId;
        this.nodeId2 = nodeId2;
        this.splitRatio = Number(splitRatio); // Percentage 0-100

        // If connected to Edge but not Nodes, try to derive in Store/Service
        // checks later, but here we just store raw links.
    }

    /**
     * Factory from raw data
     */
    static fromRaw(data) {
        if (!data.id) throw new Error("Area must have an ID");

        return new Area({
            id: data.id,
            points: data.points || [],
            type: data.type,
            property: data.property,
            function: data.function,
            usage: data.usage,
            pollution: data.pollution,
            slope: data.slope,
            size: data.size,
            runoffCoeff: data.runoffCoeff,
            edgeId: data.edgeId,
            nodeId: data.nodeId,   // Likely undefined in raw XML, added later
            nodeId2: data.nodeId2,
            splitRatio: data.splitRatio || 50
        });
    }

    /**
     * Get visual center (centroid)
     */
    get centroid() {
        if (!this.points || this.points.length === 0) return { x: 0, y: 0 };
        let sumX = 0, sumY = 0;
        this.points.forEach(p => { sumX += p.x; sumY += p.y; });
        return { x: sumX / this.points.length, y: sumY / this.points.length };
    }

    /**
     * Calculate effective impervious area (Abflusswirksame Fläche)
     * = Size * RunoffCoeff
     */
    get effectiveArea() {
        return this.size * (this.runoffCoeff || 0);
    }

    toJSON() {
        return {
            id: this.id,
            points: this.points,
            type: this.type,
            property: this.property,
            function: this.function,
            usage: this.usage,
            pollution: this.pollution,
            slope: this.slope,
            size: this.size,
            runoffCoeff: this.runoffCoeff,
            effectiveArea: this.effectiveArea,
            edgeId: this.edgeId,
            nodeId: this.nodeId,
            nodeId2: this.nodeId2,
            splitRatio: this.splitRatio
        };
    }
}
