/**
 * Domain Model for a Node (Knoten/Schacht) in the sewer network.
 */
export class Node {
    constructor(options = {}) {
        const { id, x, y, z, type = "Schacht", depth = 2.0, coverZ = null, isManhole = true, status = 0, diameter = 0 } = options;

        this.id = id;
        // DEBUG LOGGING
        const rawX = Number(x);
        const rawY = Number(y);
        /*
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
             console.warn(`Node ${id} received invalid coords:`, x, y);
        }
        */

        this.x = Number.isFinite(rawX) ? rawX : 0;
        this.y = Number.isFinite(rawY) ? rawY : 0;
        this.z = Number.isFinite(Number(z)) ? Number(z) : 0; // Sohlhöhe (Invert Elevation)

        this.type = type;

        let d = Number(depth);

        // Metadata
        this.status = status || 0;
        this.diameter = Number(diameter) || 0; // Schachtdurchmesser

        // Calculate or store Cover Elevation (Deckelhöhe)
        if (coverZ !== null && coverZ !== undefined && !isNaN(Number(coverZ))) {
            this.coverZ = Number(coverZ);
            if (!d || d <= 0) {
                d = Math.max(0, this.coverZ - this.z);
            }
        } else {
            if (!d || d <= 0) d = 2.0;
            this.coverZ = this.z + d;
        }

        this.depth = d; // Max Tiefe
        this.isManhole = isManhole;

        // Hydraulic Properties
        this.constantInflow = Number(options.constantInflow) || 0;
        this.volume = Number(options.volume) || 0;
        this.weirHeight = Number(options.weirHeight) || 0;
        this.constantOutflow = Number(options.constantOutflow) || 0;
        this.outflowType = options.outflowType || 'free';

        // Surcharge / Bolted Cover
        // Default is true (can overflow). If false -> bolted cover (Surcharge Depth 100)
        // If it's a virtual node (!isManhole), it MUST be sealed/pressurized, so force false.
        this.canOverflow = (isManhole === false) ? false : (options.canOverflow !== false);

        // Simulation / Runtime State (not persisted in raw basics)
        this.currentDepth = 0;
        this.currentHead = 0;
    }

    /**
     * Creates a safe Node instance from raw parsed data (e.g. from XML parser or JSON).
     * @param {Object} data 
     */
    static fromRaw(data) {
        if (!data.id) throw new Error("Node must have an ID");

        return new Node({
            id: data.id,
            x: data.x || 0,
            y: data.y || 0,
            z: data.z || 0,
            type: data.type,
            depth: data.depth || 0,
            coverZ: data.coverZ,
            status: data.status,
            status: data.status,
            diameter: data.diameter,
            // Prioritize imported isManhole flag (e.g. from Status 2), otherwise fallback to type check
            isManhole: (data.isManhole !== undefined) ? data.isManhole : (data.type === "Schacht" || data.type === "Bauwerk"),

            // Pass through special props if they exist in raw data
            constantInflow: data.constantInflow,
            volume: data.volume,
            weirHeight: data.weirHeight,
            constantOutflow: data.constantOutflow,
            outflowType: data.outflowType,
            canOverflow: data.canOverflow
        });
    }

    /**
     * Updates coordinates (e.g. from Editor drag)
     */
    move(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Validation check
     */
    isValid() {
        return !isNaN(this.x) && !isNaN(this.y) && !isNaN(this.z);
    }

    toJSON() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            z: this.z,
            type: this.type,
            depth: this.depth,
            coverZ: this.coverZ,
            status: this.status,
            diameter: this.diameter,
            // special props
            constantInflow: this.constantInflow,
            volume: this.volume,
            weirHeight: this.weirHeight,
            constantOutflow: this.constantOutflow,
            outflowType: this.outflowType,
            canOverflow: this.canOverflow,
            isManhole: this.isManhole
        };
    }
}
