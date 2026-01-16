/**
 * Domain Model for an Edge (Haltung/Leitung) connecting two Nodes.
 */
export class Edge {
    constructor({ id, fromNodeId, toNodeId, length, roughness = 0.011, profile = null, type = "Haltung", coords = [], material = null, z1 = null, z2 = null }) {
        this.id = id;
        this.fromNodeId = fromNodeId;
        this.toNodeId = toNodeId;

        this.length = Number(length);
        if (this.length <= 0) this.length = 10.0; // Fail-safe default

        // Physics
        this.roughness = Number(roughness); // Manning n usually
        this.material = material;

        // Geometric Profile
        // Default to Circular 300mm if null
        this.profile = profile || { type: 0, height: 0.3, width: 0.3 };
        this.coords = coords || []; // Array of {x,y,z} points for polyline visualization

        // Detailed Profile Data
        this.z1 = z1; // Sohlhöhe oben
        this.z2 = z2; // Sohlhöhe unten
        this.status = 0; // Status

        this.type = type;

        this.qCurrent = 0;
        this.vCurrent = 0;
    }

    /**
     * Factory from raw data
     */
    static fromRaw(data) {
        if (!data.id) throw new Error("Edge must have an ID");

        const fromVal = data.from || data.fromNodeId;
        const toVal = data.to || data.toNodeId;

        if (!fromVal) throw new Error(`Edge ${data.id} missing 'from' node`);
        if (!toVal) throw new Error(`Edge ${data.id} missing 'to' node`);

        // Parse Profile
        // Raw parser usually gives { type: int, height: float, width: float }
        let profile = data.profile;
        if (!profile) {
            profile = { type: 0, height: 0.3, width: 0.3 };
        }

        const edge = new Edge({
            id: data.id,
            fromNodeId: fromVal,
            toNodeId: toVal,
            length: data.length,
            roughness: data.roughness, // undefined -> default in constructor
            profile: profile,
            type: data.type,
            coords: data.coords || [] // Preserve polyline coordinates
        });

        // Hydrate additional fields
        edge.material = data.material;
        edge.status = data.status;

        // z1/z2: Try to get from explicit data, OR extract from geometry (poly line)
        // Usually z1 = upstream invert, z2 = downstream invert.
        // Assuming geometry matches flow direction (from -> to).
        if (data.z1 !== undefined) edge.z1 = data.z1;
        else if (edge.coords && edge.coords.length > 0) edge.z1 = edge.coords[0].z;

        if (data.z2 !== undefined) edge.z2 = data.z2;
        else if (edge.coords && edge.coords.length > 0) edge.z2 = edge.coords[edge.coords.length - 1].z;

        return edge;
    }

    isValid() {
        return this.length > 0 && this.fromNodeId && this.toNodeId;
    }

    toJSON() {
        return {
            id: this.id,
            fromNodeId: this.fromNodeId,
            toNodeId: this.toNodeId,
            length: this.length,
            profile: this.profile,
            material: this.material,
            roughness: this.roughness,
            z1: this.z1,
            z2: this.z2,
            status: this.status,
            coords: this.coords
        };
    }
}
